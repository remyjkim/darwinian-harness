// ABOUTME: Proves the public register command drives strict registration and readback through real CLI parsing.
// ABOUTME: Help and invalid input remain side-effect-free, while human and JSON output share one result.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { realpath } from "node:fs/promises";
import { Writable } from "node:stream";
import { WorkerRegisterCommand } from "../cli/commands/worker/register";
import { WorkerCommand } from "../cli/commands/worker/worker";
import type { AgentsContext } from "../cli/context";
import { loadProjectCloudContext } from "../cli/core/management/context-store";
import { resolveCloudProfile } from "../cli/core/management/profile";
import { cleanupTempRoots, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];
const operationId = "123e4567-e89b-42d3-a456-426614174002";
const readbackId = "123e4567-e89b-42d3-a456-426614174004";

class CaptureStream extends Writable {
  chunks: Buffer[] = [];
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); callback();
  }
  text(): string { return Buffer.concat(this.chunks).toString("utf8"); }
}

function b64(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function token(): string {
  const profile = resolveCloudProfile({});
  const iat = Math.floor(Date.now() / 1000) - 1;
  return `${b64({ alg: "none" })}.${b64({
    iss: profile.issuer, aud: profile.resource, azp: "drwn-cli", sub: "user_register",
    scope: "openid email offline_access dah:management.delegate", iat, exp: iat + 900,
  })}.sig`;
}

async function fixture() {
  const raw = await scaffoldCliFixture();
  const root = await realpath(raw.root);
  const canonical = (path: string) => path.replace(raw.root, root);
  const value = { ...raw, root, repoRoot: canonical(raw.repoRoot), homeDir: canonical(raw.homeDir), agentsDir: canonical(raw.agentsDir) };
  tempRoots.push(value.root);
  const projectConfigPath = await writeSupportedProjectConfig(value.repoRoot);
  return { ...value, projectConfigPath };
}

async function run(args: string[], fetcher: typeof fetch) {
  const f = await fixture();
  const stdout = new CaptureStream(); const stderr = new CaptureStream();
  let tick = 0;
  WorkerRegisterCommand.testDeps = {
    env: { DRWN_TOKEN: token() }, fetcher,
    operationId: () => operationId, readbackRequestId: () => readbackId,
    journalNow: () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString(),
    now: () => "2026-08-25T12:10:00.000Z",
  };
  const context: AgentsContext = {
    repoRoot: f.repoRoot, agentsDir: f.agentsDir, homeDir: f.homeDir, cwd: f.repoRoot,
    projectConfigPath: f.projectConfigPath, stdin: process.stdin, stdout, stderr, env: {}, colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(WorkerCommand); cli.register(WorkerRegisterCommand);
  const exitCode = await cli.run(args, context);
  return { fixture: f, stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

afterEach(async () => {
  WorkerRegisterCommand.testDeps = undefined;
  await cleanupTempRoots(tempRoots);
});

function server(calls: Array<{ path: string; body: unknown; requestId: string }>): typeof fetch {
  return (async (input, init) => {
    const path = new URL(String(input)).pathname;
    const requestId = new Headers(init?.headers).get("x-request-id")!;
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null, requestId });
    if (path === "/api/deployed-workers/register") {
      return Response.json({
        requestId, organizationId: "org_acme", workerId: "worker_alpha",
        deployedWorkerId: "deployed_worker_alpha", workerRevision: 1, bindingRevision: 1,
      });
    }
    return Response.json({
      requestId,
      worker: {
        organizationId: "org_acme", workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
        name: "worker-alpha", environment: "staging", workerRevision: 1, bindingRevision: 1, retired: false,
      },
    });
  }) as typeof fetch;
}

describe("worker register command", () => {
  test("registers server-allocated identities, verifies detail, and binds the project", async () => {
    const calls: Array<{ path: string; body: unknown; requestId: string }> = [];
    const result = await run([
      "worker", "register", "--organization", "org_acme", "--name", "worker-alpha", "--environment", "staging", "--json",
    ], server(calls));
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([
      {
        path: "/api/deployed-workers/register",
        body: { environment: "staging", name: "worker-alpha", organizationId: "org_acme" },
        requestId: operationId,
      },
      { path: "/api/deployed-workers/deployed_worker_alpha", body: null, requestId: readbackId },
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "deployed_workers.register", outcome: "succeeded",
      data: { workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha" },
    });
    expect(await loadProjectCloudContext(result.fixture.repoRoot)).toMatchObject({ deployedWorkerId: "deployed_worker_alpha" });
  });

  test("human output is a projection of the same receipt", async () => {
    const result = await run([
      "worker", "register", "--organization", "org_acme", "--name", "worker-alpha", "--environment", "staging",
    ], server([]));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Worker ID: worker_alpha");
    expect(result.stdout).toContain("Deployed Worker: deployed_worker_alpha");
    expect(result.stdout).toContain("Worker revision: 1");
  });

  test("invalid environment refuses before network or journal creation", async () => {
    let calls = 0;
    const result = await run([
      "worker", "register", "--organization", "org_acme", "--name", "worker-alpha", "--environment", "preview",
    ], (async () => { calls += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("VALIDATION_FAILED");
    expect(calls).toBe(0);
    expect(await Bun.file(`${result.fixture.repoRoot}/.agents/drwn/.cloud-operations/${operationId}.json`).exists()).toBe(false);
  });

  test("help performs no profile, custody, journal, project-context, or network work", async () => {
    let calls = 0;
    const result = await run(["worker", "register", "--help"], (async () => {
      calls += 1; throw new Error("must not fetch");
    }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(0);
    expect(calls).toBe(0);
    expect(result.stdout).toContain("--organization");
    expect(result.stdout).toContain("--environment");
  });
});
