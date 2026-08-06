// ABOUTME: Tests drwn acp serve over real subprocess stdio: NDJSON handshake frames on stdout,
// ABOUTME: stdout purity (protocol frames only), clean exit on stdin EOF, and the acp group stub.

import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runAgentsCli, scaffoldCliFixture, envFor } from "./helpers";

// ACP clients await each response before sending the next frame and keep stdin open for
// the session's lifetime (locked by the sdk-spike EOF test), so this harness drives the
// subprocess interactively rather than batching frames into a closed stdin.
async function driveServe(fixtureEnv: Record<string, string>, requests: unknown[]) {
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
  for (const request of requests) {
    proc.stdin.write(`${JSON.stringify(request)}\n`);
    await proc.stdin.flush();
    frames.push(await readFrame());
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
