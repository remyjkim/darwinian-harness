// ABOUTME: Command-level tests for stdin-only Worker secret configuration.
// ABOUTME: Secret bytes never appear in argv, stdout, stderr, or error rendering.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { PassThrough, Writable } from "node:stream";
import type { AgentsContext } from "../cli/context";
import { WorkerSecretSetCommand } from "../cli/commands/worker/secret-set";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const roots: string[] = [];
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

class CaptureStream extends Writable {
  chunks: Buffer[] = [];
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
  text() { return Buffer.concat(this.chunks).toString("utf8"); }
}

function jwt(): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64({
    iss: "https://auth.darwinian.dev/api/auth",
    aud: "https://api.darwinian.dev",
    sub: "user_123",
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.sig`;
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  await cleanupTempRoots(roots);
});

async function run(args: string[], secret: string, tty = false) {
  process.env.DRWN_TOKEN = jwt();
  const fixture = await scaffoldCliFixture();
  roots.push(fixture.root);
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = tty;
  stdin.end(secret);
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: process.cwd(),
    projectConfigPath: null,
    stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(WorkerSecretSetCommand);
  const exitCode = await cli.run(args, context);
  return { exitCode, stdout: stdout.text(), stderr: stderr.text() };
}

describe("worker secret set", () => {
  test("sends an env secret from stdin without echoing it", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input instanceof Request ? input.url : input), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true, server: "buzz-private-key" }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await run([
      "worker", "secret", "set", "harari", "buzz-private-key",
      "--kind", "env", "--env-var", "BUZZ_PRIVATE_KEY",
    ], "nsec1-super-secret\n");

    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([{
      url: "https://api.darwinian.dev/api/minds/harari/secrets/buzz-private-key",
      body: { token: "nsec1-super-secret", kind: "env", env_var: "BUZZ_PRIVATE_KEY" },
    }]);
    expect(result.stdout).toContain("BUZZ_PRIVATE_KEY");
    expect(`${result.stdout}${result.stderr}`).not.toContain("nsec1-super-secret");
  });

  test("rejects TTY input, empty input, and invalid kind/env combinations before fetch", async () => {
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    expect((await run(["worker", "secret", "set", "harari", "x"], "secret", true)).exitCode).toBe(1);
    expect((await run(["worker", "secret", "set", "harari", "x"], "\n")).exitCode).toBe(1);
    expect((await run(["worker", "secret", "set", "harari", "x", "--kind", "env"], "secret")).exitCode).toBe(1);
    expect((await run(["worker", "secret", "set", "harari", "x", "--kind", "mcp", "--env-var", "X"], "secret")).exitCode).toBe(1);
    expect(fetches).toBe(0);
  });

  test("redacts a server error even if it reflects the secret", async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: "rejected nsec1-super-secret" }),
      { status: 400, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;
    const result = await run(["worker", "secret", "set", "harari", "x"], "nsec1-super-secret\n");
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain("nsec1-super-secret");
    expect(result.stderr).toContain("Secret update failed (400)");
  });
});
