// ABOUTME: Tests drwn acp serve over real subprocess stdio: NDJSON handshake frames on stdout,
// ABOUTME: stdout purity (protocol frames only), clean exit on stdin EOF, and the acp group stub.

import { describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { AcpServeCommand } from "../cli/commands/acp/serve";
import type { AgentsContext } from "../cli/context";
import { runAgentsCli, scaffoldCliFixture, envFor } from "./helpers";

// ACP clients await each response before sending the next frame and keep stdin open for
// the session's lifetime (locked by the sdk-spike EOF test), so this harness drives the
// subprocess interactively rather than batching frames into a closed stdin.
type ServeRequest = unknown | ((frames: string[]) => unknown);

async function driveServe(fixtureEnv: Record<string, string>, requests: ServeRequest[]) {
  const entrypoint = fileURLToPath(new URL("../cli/index.ts", import.meta.url));
  const bunBin = Bun.which("bun") ?? process.execPath;
  const proc = Bun.spawn([bunBin, "run", entrypoint, "acp", "serve", "harari"], {
    cwd: join(import.meta.dir, ".."),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { GIT_TERMINAL_PROMPT: "0", ...process.env, ...fixtureEnv },
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  async function readFrame(): Promise<string> {
    for (;;) {
      const newline = buffered.indexOf("\n");
      if (newline >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        return line;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("serve stdout closed before a full frame arrived");
      buffered += decoder.decode(value, { stream: true });
    }
  }
  const frames: string[] = [];
  for (const requestInput of requests) {
    const request = typeof requestInput === "function" ? requestInput(frames) : requestInput;
    proc.stdin.write(`${JSON.stringify(request)}\n`);
    await proc.stdin.flush();
    const requestId = request && typeof request === "object" && "id" in request
      ? (request as { id?: unknown }).id
      : undefined;
    for (;;) {
      const line = await readFrame();
      frames.push(line);
      const frame = JSON.parse(line) as { id?: unknown };
      if (requestId === undefined || frame.id === requestId) break;
    }
  }
  await proc.stdin.end();
  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  return { frames, exitCode, stderr, residualStdout: buffered };
}

describe("drwn acp", () => {
  test("group stub prints the acp command surface", async () => {
    const fixture = await scaffoldCliFixture();
    const result = await runAgentsCli(["acp"], envFor(fixture), undefined, {
      skipWriteScopeAuto: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("acp serve");
  });

  test("serve answers a Buzz-shaped handshake over stdio and exits cleanly on EOF", async () => {
    const fixture = await scaffoldCliFixture();
    const { frames, exitCode, residualStdout } = await driveServe(envFor(fixture), [
      {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: 2,
          clientCapabilities: { _meta: { goose: { customNotifications: true } } },
          clientInfo: { name: "buzz-acp", version: "0.1.0" },
        },
      },
      { jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: "/tmp", mcpServers: [] } },
    ]);
    expect(exitCode).toBe(0);
    expect(residualStdout.trim()).toBe("");
    const [initLine = "", sessionLine = ""] = frames;
    const init = JSON.parse(initLine);
    expect(init.id).toBe(0);
    expect(init.result.protocolVersion).toBe(1);
    expect(init.result.agentInfo.name).toBe("drwn-acp");
    expect(init.result.authMethods).toEqual([{
      id: "dah-device",
      name: "Darwinian device login",
      description: "Sign in through Darwinian Auth Hub using a browser device code.",
    }]);
    const session = JSON.parse(sessionLine);
    expect(session.id).toBe(1);
    expect(typeof session.result.sessionId).toBe("string");
  });

  test("serve drives prompt updates and terminal cancellation through the real manager and HTTP client", async () => {
    const fixture = await scaffoldCliFixture();
    let streamPolls = 0;
    let cancelPosts = 0;
    function b64(value: unknown): string {
      return Buffer.from(JSON.stringify(value)).toString("base64url");
    }
    const token = `${b64({ alg: "none" })}.${b64({
      iss: "https://auth.darwinian.dev/api/auth",
      aud: "https://api.darwinian.dev",
      sub: "user_command",
      exp: Math.floor(Date.now() / 1000) + 900,
    })}.sig`;
    const originalFetch = globalThis.fetch;
    const originalToken = process.env.DRWN_TOKEN;
    const originalApiUrl = process.env.DRWN_STUDIO_API_URL;
    const originalPollMs = process.env.DRWN_ACP_POLL_MS;
    try {
      process.env.DRWN_TOKEN = token;
      process.env.DRWN_STUDIO_API_URL = "https://api.command.test";
      process.env.DRWN_ACP_POLL_MS = "250";
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request
          ? input
          : new Request(input instanceof URL ? input.toString() : input, init);
        const url = new URL(request.url);
        expect(request.headers.get("authorization")).toStartWith("Bearer ");
        if (request.method === "POST" && url.pathname === "/api/minds/harari/chat") {
          expect(await request.json()).toEqual({ message: "hello" });
          return Response.json({ runId: "run_command" });
        }
        if (request.method === "POST" && url.pathname === "/api/chat/run_command/cancel") {
          cancelPosts += 1;
          return Response.json(
            { runId: "run_command", outcome: "accepted", status: "cancelling" },
            { status: 202 },
          );
        }
        if (request.method === "GET" && url.pathname === "/api/minds/harari/chat/run_command/stream-poll") {
          streamPolls += 1;
          if (streamPolls === 1) {
            expect(url.searchParams.get("since")).toBe("0");
            return Response.json({
              lastSeq: 1,
              events: [{
                seq: 1,
                sourceId: "orchestrator",
                event: { v: 1, seq: 1, ts: 1, type: "text.delta", text: "world" },
              }],
            });
          }
          expect(url.searchParams.get("since")).toBe("1");
          return Response.json({
            lastSeq: 2,
            events: [{
              seq: 2,
              sourceId: "orchestrator",
              event: { v: 1, seq: 2, ts: 2, type: "agent.cancelled", reason: "owner_cancel" },
            }],
          });
        }
        if (request.method === "GET" && url.pathname === "/api/chat/run_command/status") {
          return Response.json({
            status: "cancelling",
            runMetrics: { startedAt: 1, finishedAt: null, totalTokens: null },
          });
        }
        return Response.json({ error: `unexpected ${request.method} ${url.pathname}` }, { status: 404 });
      }) as typeof fetch;

      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const stderrChunks: Buffer[] = [];
      stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
      let buffered = "";
      const queuedLines: string[] = [];
      const waiters: Array<(line: string) => void> = [];
      stdout.on("data", (chunk) => {
        buffered += String(chunk);
        for (;;) {
          const newline = buffered.indexOf("\n");
          if (newline < 0) break;
          const line = buffered.slice(0, newline);
          buffered = buffered.slice(newline + 1);
          const waiter = waiters.shift();
          if (waiter) waiter(line);
          else queuedLines.push(line);
        }
      });
      const readLine = () => queuedLines.length > 0
        ? Promise.resolve(queuedLines.shift()!)
        : new Promise<string>((resolve) => waiters.push(resolve));
      const context: AgentsContext = {
        repoRoot: fixture.repoRoot,
        agentsDir: fixture.agentsDir,
        homeDir: fixture.homeDir,
        cwd: fixture.repoRoot,
        projectConfigPath: null,
        stdin,
        stdout,
        stderr,
        env: {},
        colorDepth: 1,
      };
      const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
      cli.register(AcpServeCommand);
      const execution = cli.run(["acp", "serve", "harari"], context);
      const frames: Record<string, unknown>[] = [];
      async function send(request: Record<string, unknown>, responseId: number) {
        stdin.write(`${JSON.stringify(request)}\n`);
        for (;;) {
          const frame = JSON.parse(await readLine()) as Record<string, unknown>;
          frames.push(frame);
          if (frame.id === responseId) return frame;
        }
      }
      await send(
        { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } },
        0,
      );
      const sessionFrame = await send(
        { jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: "/tmp", mcpServers: [] } },
        1,
      );
      const sessionId = (sessionFrame.result as { sessionId: string }).sessionId;
      stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text: "hello" }] },
      })}\n`);
      for (;;) {
        const frame = JSON.parse(await readLine()) as Record<string, unknown>;
        frames.push(frame);
        if (frame.method === "session/update") break;
      }
      stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId },
      })}\n`);
      for (;;) {
        const frame = JSON.parse(await readLine()) as Record<string, unknown>;
        frames.push(frame);
        if (frame.id === 2) break;
      }
      stdin.end();
      const exitCode = await execution;
      expect(exitCode).toBe(0);
      expect(Buffer.concat(stderrChunks).toString("utf8")).toBe("");
      expect(buffered.trim()).toBe("");
      expect(streamPolls).toBe(2);
      expect(cancelPosts).toBe(1);
      expect(frames).toContainEqual({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: expect.any(String),
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "world" } },
        },
      });
      expect(frames.find((frame) => frame.id === 2)?.result).toEqual({ stopReason: "cancelled" });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalToken === undefined) delete process.env.DRWN_TOKEN;
      else process.env.DRWN_TOKEN = originalToken;
      if (originalApiUrl === undefined) delete process.env.DRWN_STUDIO_API_URL;
      else process.env.DRWN_STUDIO_API_URL = originalApiUrl;
      if (originalPollMs === undefined) delete process.env.DRWN_ACP_POLL_MS;
      else process.env.DRWN_ACP_POLL_MS = originalPollMs;
    }
  });

  test("serve fails with slug guidance when no positional, env, or binding exists", async () => {
    const fixture = await scaffoldCliFixture();
    const result = await runAgentsCli(["acp", "serve"], envFor(fixture), undefined, {
      skipWriteScopeAuto: true,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No Worker slug for the ACP session");
  });

  test("stdout carries only protocol frames and -32601 for unknown methods", async () => {
    const fixture = await scaffoldCliFixture();
    const { frames, exitCode } = await driveServe(envFor(fixture), [
      { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } },
      { jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: "/tmp", mcpServers: [] } },
      { jsonrpc: "2.0", id: 2, method: "made/up", params: {} },
    ]);
    expect(exitCode).toBe(0);
    const parsed = frames.map((line) => JSON.parse(line));
    for (const frame of parsed) expect(frame.jsonrpc).toBe("2.0");
    const byId = new Map(parsed.map((frame) => [frame.id, frame]));
    expect(byId.get(2)?.error?.code).toBe(-32601);
  });
});
