// ABOUTME: Command-level tests for drwn worker run status (I65 Fix 4).
// ABOUTME: Fakes the runId-addressed poll route; asserts status reporting per lifecycle state.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { Writable } from "node:stream";
import { WorkerRunStatusCommand } from "../cli/commands/worker/run-status";
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

async function runStatus(args: string[]) {
  process.env.DRWN_TOKEN = process.env.DRWN_TOKEN ?? fakeJwt();
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
  cli.register(WorkerRunStatusCommand);
  const exitCode = await cli.run(args, context);
  return { stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubPoll(body: unknown) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = new URL(String(input instanceof Request ? input.url : input)).pathname;
    if (path === "/api/chat/run_42/poll") return json(body);
    return json({ error: `unexpected path ${path}` }, 404);
  }) as unknown as typeof fetch;
}

describe("worker run status (I65 Fix 4)", () => {
  test("reports a running run", async () => {
    stubPoll({ status: "running", result: null, lastSeq: 0, events: [] });

    const result = await runStatus(["worker", "run", "status", "run_42"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("running");
  });

  test("prints the reply for a yielded run", async () => {
    stubPoll({
      status: "yielded",
      result: null,
      lastSeq: 2,
      events: [{ seq: 2, kind: "orchestrator_turn", turn: 1, thought: "the answer", actions: [] }],
    });

    const result = await runStatus(["worker", "run", "status", "run_42"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("yielded");
    expect(result.stdout).toContain("the answer");
  });

  test("reports a failed run on stderr with exit 1", async () => {
    stubPoll({ status: "failed", result: { error: "model exploded" }, lastSeq: 0, events: [] });

    const result = await runStatus(["worker", "run", "status", "run_42"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("model exploded");
  });

  test("unknown runId exits 1", async () => {
    stubPoll({ status: "not_found", result: null, lastSeq: 0, events: [] });

    const result = await runStatus(["worker", "run", "status", "run_42"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not found");
  });

  test("--json prints the raw poll body", async () => {
    stubPoll({ status: "done", result: { ok: true }, lastSeq: 3, events: [] });

    const result = await runStatus(["worker", "run", "status", "run_42", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "done", result: { ok: true } });
  });

  test("auth errors read as auth, not connectivity (Fix 3 helper reused)", async () => {
    process.env.DRWN_TOKEN = "";
    stubPoll({ status: "running", result: null, lastSeq: 0, events: [] });

    const result = await runStatus(["worker", "run", "status", "run_42"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Not authenticated");
    expect(result.stderr).not.toContain("Cannot reach Deploy API");
  });
});
