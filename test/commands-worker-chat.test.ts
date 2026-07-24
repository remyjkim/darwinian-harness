// ABOUTME: Command-level tests for drwn worker chat's wait-for-reply behavior (I65 Fix 4).
// ABOUTME: Fakes the Deploy API run lifecycle; asserts web URL, streamed reply, timeout, and JSON output.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { Writable } from "node:stream";
import { WorkerChatCommand } from "../cli/commands/worker/chat";
import type { AgentsContext } from "../cli/context";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: "https://auth.darwiniantools.com/api/auth",
    aud: "https://api.darwiniantools.com",
    sub: "user_123",
    email: "worker@example.com",
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.sig`;
}

class CaptureStream extends Writable {
  chunks: Buffer[] = [];

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  await cleanupTempRoots(tempRoots);
});

async function runChat(args: string[]) {
  process.env.DRWN_TOKEN = fakeJwt();
  process.env.DRWN_POLL_MS = "1";
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: process.cwd(),
    projectConfigPath: null,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(WorkerChatCommand);
  const exitCode = await cli.run(args, context);
  return { stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Fake fetch: POST chat -> runId; poll advances through the given frames. */
function stubRunLifecycle(frames: Array<{ status: string; result?: unknown; lastSeq: number; events: unknown[] }>) {
  const calls: string[] = [];
  let poll = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const path = new URL(url).pathname;
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/api/minds/harari/chat") return json({ runId: "run_42" });
    if (path === "/api/chat/run_42/poll") {
      const frame = frames[Math.min(poll, frames.length - 1)];
      poll += 1;
      return json(frame);
    }
    return json({ error: `unexpected path ${path}` }, 404);
  }) as unknown as typeof fetch;
  return calls;
}

describe("worker chat wait (I65 Fix 4)", () => {
  test("prints the web URL immediately, then the assistant reply on yielded", async () => {
    stubRunLifecycle([
      { status: "running", lastSeq: 0, events: [] },
      {
        status: "yielded",
        lastSeq: 2,
        events: [
          { seq: 1, kind: "user_message", turn: 0, text: "hello", id: "m1", createdAt: 1 },
          { seq: 2, kind: "orchestrator_turn", turn: 1, thought: "hello back from the mind", actions: [] },
        ],
      },
    ]);

    const result = await runChat(["worker", "chat", "harari", "--message", "hello"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Open in browser: https://studio.darwiniantools.com/c/run_42");
    expect(result.stdout).toContain("hello back from the mind");
    // The user's own message is not echoed back.
    const replyAt = result.stdout.indexOf("hello back");
    const urlAt = result.stdout.indexOf("Open in browser");
    expect(urlAt).toBeGreaterThanOrEqual(0);
    expect(urlAt).toBeLessThan(replyAt);
  });

  test("prints worker bubbles via the console's text coercion", async () => {
    stubRunLifecycle([
      {
        status: "done",
        lastSeq: 1,
        events: [{ seq: 1, kind: "worker_result", turn: 1, agentId: "chat-t1-a0", role: "chat", label: "chat", output: { text: "panel says hi" } }],
      },
    ]);

    const result = await runChat(["worker", "chat", "harari", "--message", "hello"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("panel says hi");
  });

  test("a failed run exits 1 with the failure surfaced", async () => {
    stubRunLifecycle([
      { status: "failed", result: { error: "model exploded" }, lastSeq: 0, events: [] },
    ]);

    const result = await runChat(["worker", "chat", "harari", "--message", "hello"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("model exploded");
    // The URL is still there so the user can inspect the run.
    expect(result.stdout).toContain("/c/run_42");
  });

  test("timeout exits 0 and leaves the user the URL and a status hint", async () => {
    process.env.DRWN_CHAT_TIMEOUT_MS = "10";
    stubRunLifecycle([{ status: "running", lastSeq: 0, events: [] }]);

    const result = await runChat(["worker", "chat", "harari", "--message", "hello"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("/c/run_42");
    expect(result.stdout).toContain("drwn worker run status run_42");
  });

  test("a not_found run exits 1 like run status (G2 review note 2)", async () => {
    stubRunLifecycle([{ status: "not_found", lastSeq: 0, events: [] }]);

    const result = await runChat(["worker", "chat", "harari", "--message", "hello"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not found");
  });

  test("--json waits and prints one machine-readable object", async () => {
    stubRunLifecycle([
      {
        status: "yielded",
        lastSeq: 2,
        events: [{ seq: 2, kind: "orchestrator_turn", turn: 1, thought: "hi", actions: [] }],
      },
    ]);

    const result = await runChat(["worker", "chat", "harari", "--message", "hello", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({ runId: "run_42", status: "yielded", url: "https://studio.darwiniantools.com/c/run_42" });
    expect(parsed.events).toHaveLength(1);
  });

  test("--no-wait returns the run handle without polling", async () => {
    const calls = stubRunLifecycle([{ status: "running", lastSeq: 0, events: [] }]);

    const result = await runChat(["worker", "chat", "harari", "--message", "hello", "--no-wait", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ runId: "run_42" });
    expect(calls.filter((c) => c.includes("/poll"))).toHaveLength(0);
  });

  test("a response without a runId is printed raw (legacy behavior)", async () => {
    globalThis.fetch = (async () => json({ output: "hello back", metered: true })) as unknown as typeof fetch;

    const result = await runChat(["worker", "chat", "harari", "--message", "hello"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ output: "hello back", metered: true });
  });
});
