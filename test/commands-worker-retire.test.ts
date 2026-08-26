// ABOUTME: Proves retirement requires explicit confirmation, exact revisions, retired readback, and binding cleanup.
// ABOUTME: The removed worker delete grammar is unknown and performs no network or state mutation.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { rm } from "node:fs/promises";
import { WorkerRetireCommand } from "../cli/commands/worker/retire";
import { WorkerCommand } from "../cli/commands/worker/worker";
import { loadProjectCloudContext } from "../cli/core/management/context-store";
import { createManagementCommandFixture, managementToken } from "./management-command-helpers";

const roots: string[] = [];
const detailId = "123e4567-e89b-42d3-a456-426614174004";
const retireId = "123e4567-e89b-42d3-a456-42661417400b";
const readbackId = "123e4567-e89b-42d3-a456-426614174014";

async function run(args: string[], fetcher: typeof fetch) {
  const f = await createManagementCommandFixture(); roots.push(f.fixture.root);
  const ids = [detailId, readbackId]; let tick = 0;
  WorkerRetireCommand.testDeps = {
    env: { DRWN_TOKEN: managementToken() }, fetcher,
    requestId: () => ids.shift()!, operationId: () => retireId, readbackRequestId: () => readbackId,
    journalNow: () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString(),
    now: () => "2026-08-25T12:21:00.000Z",
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(WorkerCommand); cli.register(WorkerRetireCommand);
  const exitCode = await cli.run(args, f.context);
  return { ...f, exitCode, stdout: f.stdout.text(), stderr: f.stderr.text() };
}

afterEach(async () => {
  WorkerRetireCommand.testDeps = undefined;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function server(calls: string[]): typeof fetch {
  let details = 0;
  return (async (input, init) => {
    const path = new URL(String(input)).pathname; const method = init?.method ?? "GET";
    const requestId = new Headers(init?.headers).get("x-request-id")!;
    calls.push(`${method} ${path}`);
    if (path.endsWith("/retire")) {
      return Response.json({
        requestId, organizationId: "org_acme", workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
        workerRevision: 5, bindingRevision: 2, retiredAt: "2026-08-25T12:20:00.000Z",
      });
    }
    details += 1;
    return Response.json({ requestId, worker: {
      organizationId: "org_acme", workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
      name: "worker-alpha", environment: "staging", workerRevision: details === 1 ? 4 : 5,
      bindingRevision: details === 1 ? 1 : 2, retired: details > 1,
    } });
  }) as typeof fetch;
}

describe("worker retire", () => {
  test("requires --yes before profile, context, journal, or network work", async () => {
    let calls = 0;
    const result = await run(["worker", "retire"], (async () => { calls += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--yes");
    expect(calls).toBe(0);
    expect(await loadProjectCloudContext(result.fixture.repoRoot)).not.toBeNull();
  });

  test("uses exact detail revisions, confirms retired readback, then clears binding", async () => {
    const calls: string[] = [];
    const result = await run(["worker", "retire", "--yes", "--json"], server(calls));
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([
      "GET /api/deployed-workers/deployed_worker_alpha",
      "POST /api/deployed-workers/deployed_worker_alpha/retire",
      "GET /api/deployed-workers/deployed_worker_alpha",
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: "deployed_workers.retire", data: { workerRevision: 5, bindingRevision: 2 } });
    expect(await loadProjectCloudContext(result.fixture.repoRoot)).toBeNull();
  });

  test("worker delete is unknown and non-mutating", async () => {
    let calls = 0;
    const result = await run(["worker", "delete", "deployed_worker_alpha", "--force"], (async () => {
      calls += 1; throw new Error("must not fetch");
    }) as unknown as typeof fetch);
    expect(result.exitCode).not.toBe(0);
    expect(calls).toBe(0);
    expect(await loadProjectCloudContext(result.fixture.repoRoot)).not.toBeNull();
  });

  test("help performs no profile, custody, context, journal, or network work", async () => {
    let calls = 0;
    const result = await run(["worker", "retire", "--help"], (async () => { calls += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(0);
    expect(calls).toBe(0);
    expect(result.stdout).toContain("--yes");
    expect(result.stdout).toContain("--deployed-worker");
  });
});
