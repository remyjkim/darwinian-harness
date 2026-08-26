// ABOUTME: Proves deploy, history, and rollback use immutable artifacts and exact Deployed Worker IDs.
// ABOUTME: Legacy identity creation, secret upload, slug routes, and inferred rollback are ordinary unknown syntax.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { realpath } from "node:fs/promises";
import { Writable } from "node:stream";
import { WorkerDeployCommand } from "../cli/commands/worker/deploy";
import { WorkerDeploymentsCommand } from "../cli/commands/worker/deployments";
import { WorkerRollbackCommand } from "../cli/commands/worker/rollback";
import { WorkerCommand } from "../cli/commands/worker/worker";
import type { AgentsContext } from "../cli/context";
import { managementContract } from "../cli/core/management/contracts";
import { selectMachineOrganization, writeProjectCloudContext } from "../cli/core/management/context-store";
import { resolveCloudProfile } from "../cli/core/management/profile";
import type { WorkerDeployPayload } from "../cli/core/worker-deploy";
import { cleanupTempRoots, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];
const detailId = "123e4567-e89b-42d3-a456-426614174004";
const listId = "123e4567-e89b-42d3-a456-426614174006";
const createId = "123e4567-e89b-42d3-a456-426614174005";
const rollbackId = "123e4567-e89b-42d3-a456-426614174007";

class CaptureStream extends Writable {
  chunks: Buffer[] = [];
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); callback();
  }
  text(): string { return Buffer.concat(this.chunks).toString("utf8"); }
}

function b64(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function token(): string {
  const profile = resolveCloudProfile({}); const iat = Math.floor(Date.now() / 1000) - 1;
  return `${b64({ alg: "none" })}.${b64({
    iss: profile.issuer, aud: profile.resource, azp: "drwn-cli", sub: "user_deploy",
    scope: "openid email offline_access dah:management.delegate", iat, exp: iat + 900,
  })}.sig`;
}

function payload(): WorkerDeployPayload {
  const vector = managementContract.vectors.positive.find(({ routeKey }) => routeKey === "deployment_artifacts.put")!;
  return JSON.parse(Buffer.from(String(vector.request.payloadBase64), "base64").toString("utf8")) as WorkerDeployPayload;
}

async function fixture() {
  const raw = await scaffoldCliFixture(); const root = await realpath(raw.root);
  const canonical = (path: string) => path.replace(raw.root, root);
  const value = { ...raw, root, repoRoot: canonical(raw.repoRoot), homeDir: canonical(raw.homeDir), agentsDir: canonical(raw.agentsDir) };
  tempRoots.push(value.root);
  const projectConfigPath = await writeSupportedProjectConfig(value.repoRoot);
  const profile = resolveCloudProfile({});
  await selectMachineOrganization(value.homeDir, profile.profileDigest, "org_acme", "2026-08-25T11:00:00.000Z");
  await writeProjectCloudContext(value.repoRoot, {
    schema: "drwn.project-cloud-context", schemaVersion: 1, profileDigest: profile.profileDigest,
    organizationId: "org_acme", deployedWorkerId: "deployed_worker_alpha", verifiedAt: "2026-08-25T11:01:00.000Z",
  });
  return { ...value, projectConfigPath };
}

type Call = { method: string; path: string; body: unknown; requestId: string };

async function run(args: string[], fetcher: typeof fetch) {
  const f = await fixture(); const stdout = new CaptureStream(); const stderr = new CaptureStream();
  const readIds = [detailId, listId, detailId]; const operationIds = [createId, rollbackId]; let tick = 0;
  const deps = {
    env: { DRWN_TOKEN: token() }, fetcher,
    requestId: () => readIds.shift() ?? detailId,
    operationId: () => operationIds.shift() ?? createId,
    journalNow: () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString(),
    now: () => "2026-08-25T12:10:00.000Z",
    buildPayload: async () => payload(),
  };
  WorkerDeployCommand.testDeps = deps;
  WorkerDeploymentsCommand.testDeps = deps;
  WorkerRollbackCommand.testDeps = deps;
  const context: AgentsContext = {
    repoRoot: f.repoRoot, agentsDir: f.agentsDir, homeDir: f.homeDir, cwd: f.repoRoot,
    projectConfigPath: f.projectConfigPath, stdin: process.stdin, stdout, stderr, env: {}, colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(WorkerCommand); cli.register(WorkerDeployCommand); cli.register(WorkerDeploymentsCommand); cli.register(WorkerRollbackCommand);
  const exitCode = await cli.run(args, context);
  return { fixture: f, stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

afterEach(async () => {
  WorkerDeployCommand.testDeps = undefined;
  WorkerDeploymentsCommand.testDeps = undefined;
  WorkerRollbackCommand.testDeps = undefined;
  await cleanupTempRoots(tempRoots);
});

function server(calls: Call[]): typeof fetch {
  return (async (input, init) => {
    const url = new URL(String(input)); const method = init?.method ?? "GET";
    const requestId = new Headers(init?.headers).get("x-request-id")!;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: `${url.pathname}${url.search}`, body, requestId });
    if (url.pathname === "/api/deployed-workers/deployed_worker_alpha") {
      return Response.json({ requestId, worker: {
        organizationId: "org_acme", workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
        name: "worker-alpha", environment: "staging", workerRevision: 1, bindingRevision: 1, retired: false,
      } });
    }
    if (url.pathname.includes("/deployment-artifacts/")) {
      const sha = url.pathname.split("/").at(-1)!;
      return Response.json({
        requestId, deployedWorkerId: "deployed_worker_alpha",
        artifactRef: `deployment_artifact:sha256:${sha}`, artifactSha256: sha,
        byteLength: body.byteLength, status: "created",
      });
    }
    if (url.pathname === "/api/deployed-workers/deployed_worker_alpha/deployments" && method === "POST") {
      return Response.json({
        requestId, deployedWorkerId: "deployed_worker_alpha", deploymentId: "deployment_attempt_0001",
        workerRevision: 2, createdAt: "2026-08-25T12:02:00.000Z",
      });
    }
    if (url.pathname === "/api/deployed-workers/deployed_worker_alpha/deployments") {
      return Response.json({ requestId, deployments: [{
        deploymentId: "deployment_attempt_0001", deployedWorkerId: "deployed_worker_alpha",
        artifactRef: `deployment_artifact:sha256:${"6".repeat(64)}`, status: "active", createdAt: "2026-08-25T12:02:00.000Z",
      }], nextCursor: null });
    }
    if (url.pathname.endsWith("/deployment_attempt_0001/rollback")) {
      return Response.json({
        requestId, deployedWorkerId: "deployed_worker_alpha", deploymentId: "deployment_attempt_0001",
        workerRevision: 2, activatedAt: "2026-08-25T12:03:00.000Z",
      });
    }
    throw new Error(`unexpected route ${method} ${url.pathname}`);
  }) as typeof fetch;
}

describe("Worker deployment commands", () => {
  test("deploy stages the portable artifact then journals only its ref under the selected target", async () => {
    const calls: Call[] = [];
    const result = await run(["worker", "deploy", "@fixture/worker@1.0.0", "--json"], server(calls));
    expect(result.exitCode).toBe(0);
    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/deployed-workers/deployed_worker_alpha",
      "PUT /api/deployed-workers/deployed_worker_alpha/deployment-artifacts/6867241440ef87a70a4875c40b56afde567ccdb261ae4317c87a13c25b0314e1",
      "POST /api/deployed-workers/deployed_worker_alpha/deployments",
    ]);
    expect(calls[1]!.body).toMatchObject({ byteLength: 980 });
    expect(String((calls[1]!.body as { payloadBase64: string }).payloadBase64)).not.toBe("");
    expect(calls[2]!.body).toEqual({
      artifactRef: "deployment_artifact:sha256:6867241440ef87a70a4875c40b56afde567ccdb261ae4317c87a13c25b0314e1",
      expectedWorkerRevision: 1,
    });
    expect(calls.every(({ path }) => !path.includes("/api/minds"))).toBe(true);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: "deployments.create", data: { deploymentId: "deployment_attempt_0001" } });
  });

  test("legacy deploy identity, environment, model, and secret options are unknown before fetch", async () => {
    for (const option of [["--name", "slug"], ["--env", "preview"], ["--model", "m"], ["--secrets-file", "/tmp/x"]]) {
      let calls = 0;
      const result = await run(["worker", "deploy", "@fixture/worker@1.0.0", ...option], (async () => {
        calls += 1; throw new Error("must not fetch");
      }) as unknown as typeof fetch);
      expect(result.exitCode).not.toBe(0);
      expect(calls).toBe(0);
    }
  });

  test("deployment history uses exact target pagination and strict result output", async () => {
    const calls: Call[] = [];
    const result = await run(["worker", "deployments", "--limit", "100", "--json"], server(calls));
    expect(result.exitCode).toBe(0);
    expect(calls.map(({ path }) => path)).toEqual(["/api/deployed-workers/deployed_worker_alpha/deployments?limit=100"]);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: "deployments.list", data: { deployments: [{ deploymentId: "deployment_attempt_0001" }] } });
  });

  test("rollback requires explicit --to and uses authorized detail revision without inference", async () => {
    let calls = 0;
    const missing = await run(["worker", "rollback"], (async () => { calls += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch);
    expect(missing.exitCode).not.toBe(0);
    expect(calls).toBe(0);

    const seen: Call[] = [];
    const result = await run(["worker", "rollback", "--to", "deployment_attempt_0001", "--json"], server(seen));
    expect(result.exitCode).toBe(0);
    expect(seen.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/deployed-workers/deployed_worker_alpha",
      "POST /api/deployed-workers/deployed_worker_alpha/deployments/deployment_attempt_0001/rollback",
    ]);
    expect(seen[1]!.body).toEqual({ expectedWorkerRevision: 1 });
    expect(JSON.parse(result.stdout)).toMatchObject({ command: "deployments.rollback", data: { deploymentId: "deployment_attempt_0001" } });
  });

  test("help performs no profile, custody, payload build, journal, context, or network work", async () => {
    let calls = 0;
    const result = await run(["worker", "deploy", "--help"], (async () => { calls += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(0);
    expect(calls).toBe(0);
    expect(result.stdout).toContain("--deployed-worker");
    expect(result.stdout).not.toContain("--name");
    expect(result.stdout).not.toContain("--secrets-file");
  });
});
