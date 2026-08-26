// ABOUTME: Proves retirement is revisioned, replayable, and clears binding only after retired detail readback.
// ABOUTME: Incomplete readback retains both project context and the exact non-secret operation journal.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectCloudContext, writeProjectCloudContext } from "../cli/core/management/context-store";
import { loadClientOperation } from "../cli/core/management/operation-journal";
import { retireDeployedWorker, type RetirementDependencies } from "../cli/core/management/retirement";
import { refusedManagementResult, succeededManagementResult } from "../cli/core/management/results";

const profileDigest = "a".repeat(64);
const operationId = "123e4567-e89b-42d3-a456-42661417400b";
const readId = "123e4567-e89b-42d3-a456-426614174004";
let root: string | null = null;
async function fixture(): Promise<string> {
  root = await realpath(await mkdtemp(join(tmpdir(), "drwn-retire-")));
  await writeProjectCloudContext(root, {
    schema: "drwn.project-cloud-context", schemaVersion: 1, profileDigest,
    organizationId: "org_acme", deployedWorkerId: "deployed_worker_alpha", verifiedAt: "2026-08-25T11:00:00.000Z",
  });
  return root;
}
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = null; });
function clock() { let tick = 0; return () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString(); }
function input(projectRoot: string) {
  return {
    projectRoot, profileDigest, credentialsPath: "/unused", env: {}, organizationId: "org_acme",
    workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
    expectedWorkerRevision: 4, expectedBindingRevision: 1,
  };
}
function receipt() {
  return {
    requestId: operationId, organizationId: "org_acme", workerId: "worker_alpha",
    deployedWorkerId: "deployed_worker_alpha", workerRevision: 5, bindingRevision: 2,
    retiredAt: "2026-08-25T12:20:00.000Z",
  };
}
function retiredReadback() {
  return {
    requestId: readId, worker: {
      organizationId: "org_acme", workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
      name: "worker-alpha", environment: "staging", workerRevision: 5, bindingRevision: 2, retired: true,
    },
  };
}

describe("Deployed Worker retirement", () => {
  test("confirmed receipt plus retired readback clears context and removes the journal", async () => {
    const project = await fixture(); const events: string[] = [];
    const dependencies: RetirementDependencies = {
      operationId: () => operationId, readbackRequestId: () => readId, journalNow: clock(),
      execute: async (request) => {
        events.push(request.routeKey);
        return request.routeKey === "deployed_workers.retire"
          ? succeededManagementResult(request.routeKey, operationId, receipt(), "2026-08-25T12:20:00.000Z")
          : succeededManagementResult(request.routeKey, readId, retiredReadback(), "2026-08-25T12:21:00.000Z");
      },
    };
    expect((await retireDeployedWorker(input(project), dependencies)).outcome).toBe("succeeded");
    expect(events).toEqual(["deployed_workers.retire", "deployed_workers.read"]);
    expect(await loadProjectCloudContext(project)).toBeNull();
    expect(await loadClientOperation(project, operationId)).toBeNull();
  });

  test("incomplete readback retains context and receipt-verified replay evidence", async () => {
    const project = await fixture();
    const result = await retireDeployedWorker(input(project), {
      operationId: () => operationId, readbackRequestId: () => readId, journalNow: clock(),
      execute: async (request) => request.routeKey === "deployed_workers.retire"
        ? succeededManagementResult(request.routeKey, operationId, receipt(), "2026-08-25T12:20:00.000Z")
        : refusedManagementResult(request.routeKey, readId, { code: "TEMPORARILY_UNAVAILABLE", retryable: true }, "2026-08-25T12:21:00.000Z"),
    });
    expect(result).toMatchObject({ command: "deployed_workers.retire", outcome: "refused", error: { code: "TEMPORARILY_UNAVAILABLE" } });
    expect(await loadProjectCloudContext(project)).not.toBeNull();
    expect((await loadClientOperation(project, operationId))!.phase).toBe("receipt_verified");
  });

  test("mismatched retirement success cannot trigger readback or clear project context", async () => {
    const project = await fixture();
    const calls: string[] = [];
    const result = await retireDeployedWorker(input(project), {
      operationId: () => operationId,
      readbackRequestId: () => readId,
      journalNow: clock(),
      execute: async (request) => {
        calls.push(request.routeKey);
        return succeededManagementResult(request.routeKey, operationId, {
          ...receipt(),
          deployedWorkerId: "deployed_worker_other",
        }, "2026-08-25T12:20:00.000Z");
      },
    });
    expect(result).toMatchObject({ outcome: "refused", error: { code: "SERVER_RESPONSE_INVALID" } });
    expect(calls).toEqual(["deployed_workers.retire"]);
    expect(await loadProjectCloudContext(project)).not.toBeNull();
    expect((await loadClientOperation(project, operationId))!.phase).toBe("sent");
  });

  test("mismatched retirement readback cannot clear project context or complete the journal", async () => {
    const project = await fixture();
    const result = await retireDeployedWorker(input(project), {
      operationId: () => operationId,
      readbackRequestId: () => readId,
      journalNow: clock(),
      execute: async (request) => request.routeKey === "deployed_workers.retire"
        ? succeededManagementResult(request.routeKey, operationId, receipt(), "2026-08-25T12:20:00.000Z")
        : succeededManagementResult(request.routeKey, readId, {
            ...retiredReadback(),
            worker: {
              ...retiredReadback().worker,
              deployedWorkerId: "deployed_worker_other",
            },
          }, "2026-08-25T12:21:00.000Z"),
    });
    expect(result).toMatchObject({ outcome: "refused", error: { code: "SERVER_RESPONSE_INVALID" } });
    expect(await loadProjectCloudContext(project)).not.toBeNull();
    expect((await loadClientOperation(project, operationId))!.phase).toBe("receipt_verified");
  });

  test("response-loss restart reuses the exact operation and changed revisions conflict before fetch", async () => {
    const project = await fixture(); let retireCalls = 0; const ids: string[] = [];
    const dependencies: RetirementDependencies = {
      operationId: () => operationId, readbackRequestId: () => readId, journalNow: clock(),
      execute: async (request) => {
        if (request.routeKey === "deployed_workers.retire") {
          ids.push(String(request.request.requestId)); retireCalls += 1;
          if (retireCalls === 1) return { schema: "drwn.command-result", schemaVersion: 1, command: request.routeKey, outcome: "indeterminate", requestId: operationId, observedAt: "2026-08-25T12:19:00.000Z", data: null, error: { code: "TEMPORARILY_UNAVAILABLE", retryable: true }, warnings: [] } as const;
          return succeededManagementResult(request.routeKey, operationId, receipt(), "2026-08-25T12:20:00.000Z");
        }
        return succeededManagementResult(request.routeKey, readId, retiredReadback(), "2026-08-25T12:21:00.000Z");
      },
    };
    expect((await retireDeployedWorker(input(project), dependencies)).outcome).toBe("indeterminate");
    await expect(retireDeployedWorker({ ...input(project), expectedWorkerRevision: 3 }, dependencies))
      .rejects.toMatchObject({ code: "OPERATION_ID_CONFLICT" });
    expect(retireCalls).toBe(1);
    expect((await retireDeployedWorker(input(project), dependencies)).outcome).toBe("succeeded");
    expect(ids).toEqual([operationId, operationId]);
  });
});
