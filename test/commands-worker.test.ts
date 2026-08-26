// ABOUTME: Command-level tests for the drwn worker command surface.
// ABOUTME: Verifies CLI routing, output contracts, env fallbacks, and API calls.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { Writable } from "node:stream";
import { WorkerCommand } from "../cli/commands/worker/worker";
import { WorkerDeployCommand } from "../cli/commands/worker/deploy";
import { WorkerDeploymentsCommand } from "../cli/commands/worker/deployments";
import { WorkerChatCommand } from "../cli/commands/worker/chat";
import { WorkerListCommand } from "../cli/commands/worker/list";
import { WorkerRollbackCommand } from "../cli/commands/worker/rollback";
import { WorkerStatusCommand } from "../cli/commands/worker/status";
import { WorkerRetireCommand } from "../cli/commands/worker/retire";
import type { AgentsContext } from "../cli/context";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;
const originalCwd = process.cwd();
const originalEnv = { ...process.env };

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: "https://auth.darwinian.dev/api/auth",
    aud: "https://api.darwinian.dev",
    sub: "user_123",
    email: "worker@example.com",
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.sig`;
}

class CaptureStream extends Writable {
  chunks: Buffer[] = [];

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  process.env = { ...originalEnv };
  await cleanupTempRoots(tempRoots);
});

async function runWorkerCommand(args: string[], fixture?: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  process.env.DRWN_TOKEN = process.env.DRWN_TOKEN ?? fakeJwt();
  const commandFixture = fixture ?? await scaffoldCliFixture();
  if (!fixture) tempRoots.push(commandFixture.root);
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: commandFixture.repoRoot,
    agentsDir: commandFixture.agentsDir,
    homeDir: commandFixture.homeDir,
    cwd: process.cwd(),
    projectConfigPath: null,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(WorkerCommand);
  cli.register(WorkerDeployCommand);
  cli.register(WorkerListCommand);
  cli.register(WorkerStatusCommand);
  cli.register(WorkerDeploymentsCommand);
  cli.register(WorkerChatCommand);
  cli.register(WorkerRollbackCommand);
  cli.register(WorkerRetireCommand);
  const exitCode = await cli.run(args, context);
  return { stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

describe("worker command routing", () => {
  test("help exposes worker commands, keeps existing top-level auth available, and omits worker login", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "--help"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);

    for (const command of [
      "drwn worker deploy",
      "drwn worker list",
      "drwn worker status",
      "drwn worker deployments",
      "drwn worker chat",
      "drwn worker rollback",
      "drwn worker retire",
      "drwn login",
      "drwn refresh",
      "drwn whoami",
      "drwn logout",
      "drwn card list",
      "drwn status",
    ]) {
      expect(stdout).toContain(command);
    }
    expect(stdout).not.toContain("drwn worker login");
    expect(stdout).not.toContain("drwn cloud status");
  });

  test("worker command-group help lists the Deployed Worker management surface", async () => {
    const result = await runWorkerCommand(["worker", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("drwn worker deployments");
    expect(result.stdout).toContain("drwn worker chat");
    expect(result.stdout).toContain("drwn worker retire");
    expect(result.stdout).not.toContain("<slug>");
    expect(result.stdout).not.toContain("worker delete");
    expect(result.stdout).not.toContain("worker login");
  });

  test("worker login is not registered", async () => {
    const result = await runWorkerCommand(["worker", "login"]);
    expect(result.exitCode).not.toBe(0);
  });

  test("the retired cloud status path is not registered", async () => {
    const result = await runWorkerCommand(["cloud", "status", "harari"]);
    expect(result.exitCode).not.toBe(0);
  });
});
