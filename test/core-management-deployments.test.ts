// ABOUTME: Proves deployment attempts and rollback use small resumable journals under one target ID.
// ABOUTME: Artifact bytes never enter local state, and uncertain effects retain exact replay evidence.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDeployment,
  listDeployments,
  rollbackDeployment,
  type DeploymentDependencies,
} from "../cli/core/management/deployments";
import { loadClientOperation } from "../cli/core/management/operation-journal";
import {
  indeterminateManagementResult,
  succeededManagementResult,
} from "../cli/core/management/results";

const profileDigest = "a".repeat(64);
const artifactRef = `deployment_artifact:sha256:${"b".repeat(64)}`;
const operationIds = [
  "123e4567-e89b-42d3-a456-426614174005",
  "123e4567-e89b-42d3-a456-426614174015",
  "123e4567-e89b-42d3-a456-426614174007",
];
let root: string | null = null;
async function fixture(): Promise<string> {
  root = await realpath(await mkdtemp(join(tmpdir(), "drwn-deployments-")));
  return root;
}
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = null; });

function createInput(projectRoot: string, overrides: Record<string, unknown> = {}) {
  return {
    projectRoot,
    profileDigest,
    credentialsPath: "/unused",
    env: {},
    deployedWorkerId: "deployed_worker_alpha",
    artifactRef,
    expectedWorkerRevision: 1,
    ...overrides,
  };
}

function clock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString();
}

describe("deployment management operations", () => {
  test("create validates target, artifact ref, and positive revision before journal or transport", async () => {
    const project = await fixture(); let calls = 0;
    const dependencies: DeploymentDependencies = {
      operationId: () => operationIds[0]!,
      execute: async () => { calls += 1; throw new Error("must not execute"); },
    };
    for (const overrides of [
      { deployedWorkerId: "worker_wrong" },
      { artifactRef: "card:sha256:legacy" },
      { expectedWorkerRevision: 0 },
    ]) {
      await expect(createDeployment(createInput(project, overrides), dependencies))
        .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(calls).toBe(0);
    expect(await loadClientOperation(project, operationIds[0]!)).toBeNull();
  });

  test("possible-effect timeout retains one small exact journal and restart reuses the ID", async () => {
    const project = await fixture();
    const seen: unknown[] = [];
    let calls = 0;
    const dependencies: DeploymentDependencies = {
      operationId: () => operationIds[0]!, journalNow: clock(),
      execute: async (input) => {
        seen.push(structuredClone(input.request)); calls += 1;
        if (calls === 1) return indeterminateManagementResult(input.routeKey, operationIds[0]!, "2026-08-25T12:02:00.000Z");
        return succeededManagementResult(input.routeKey, operationIds[0]!, {
          requestId: operationIds[0]!, deployedWorkerId: "deployed_worker_alpha",
          deploymentId: "deployment_attempt_0001", workerRevision: 2, createdAt: "2026-08-25T12:03:00.000Z",
        }, "2026-08-25T12:03:00.000Z");
      },
    };
    expect((await createDeployment(createInput(project), dependencies)).outcome).toBe("indeterminate");
    const journal = await loadClientOperation(project, operationIds[0]!);
    expect(journal!.phase).toBe("indeterminate");
    const retained = Buffer.from(journal!.requestBase64, "base64").toString("utf8");
    expect(retained).toBe(`{"artifactRef":"${artifactRef}","deployedWorkerId":"deployed_worker_alpha","expectedWorkerRevision":1}`);
    expect(retained).not.toContain("payloadBase64");
    expect((await createDeployment(createInput(project), dependencies)).outcome).toBe("succeeded");
    expect(seen).toEqual([seen[0], seen[0]]);
    expect(await loadClientOperation(project, operationIds[0]!)).toBeNull();
  });

  test("two creates under one target return distinct attempts without creating another target", async () => {
    const project = await fixture();
    const ids = [...operationIds]; let revision = 1; let attempt = 0;
    const dependencies: DeploymentDependencies = {
      operationId: () => ids.shift()!, journalNow: clock(),
      execute: async (input) => succeededManagementResult(input.routeKey, String(input.request.requestId), {
        requestId: String(input.request.requestId),
        deployedWorkerId: String(input.request.deployedWorkerId),
        deploymentId: `deployment_attempt_000${++attempt}`,
        workerRevision: ++revision,
        createdAt: `2026-08-25T12:0${attempt}:00.000Z`,
      }, `2026-08-25T12:0${attempt}:00.000Z`),
    };
    const first = await createDeployment(createInput(project), dependencies);
    const second = await createDeployment(createInput(project, { expectedWorkerRevision: 2 }), dependencies);
    expect(first.data).toMatchObject({ deployedWorkerId: "deployed_worker_alpha", deploymentId: "deployment_attempt_0001" });
    expect(second.data).toMatchObject({ deployedWorkerId: "deployed_worker_alpha", deploymentId: "deployment_attempt_0002" });
  });

  test("a semantically stale receipt is a stable server refusal and retains replay evidence", async () => {
    const project = await fixture();
    const dependencies: DeploymentDependencies = {
      operationId: () => operationIds[0]!, journalNow: clock(),
      execute: async (input) => succeededManagementResult(input.routeKey, operationIds[0]!, {
        requestId: operationIds[0]!, deployedWorkerId: "deployed_worker_other",
        deploymentId: "deployment_attempt_0001", workerRevision: 1, createdAt: "2026-08-25T12:01:00.000Z",
      }, "2026-08-25T12:01:00.000Z"),
    };
    const result = await createDeployment(createInput(project), dependencies);
    expect(result).toMatchObject({ outcome: "refused", error: { code: "SERVER_RESPONSE_INVALID", retryable: false } });
    expect((await loadClientOperation(project, operationIds[0]!))!.phase).toBe("sent");
  });

  test("list uses exact target pagination and rollback requires an explicit distinct deployment ID", async () => {
    const project = await fixture(); const seen: unknown[] = [];
    const dependencies: DeploymentDependencies = {
      operationId: () => operationIds[2]!, requestId: () => operationIds[1]!, journalNow: clock(),
      execute: async (input) => {
        seen.push({ routeKey: input.routeKey, request: structuredClone(input.request) });
        if (input.routeKey === "deployments.list") {
          return succeededManagementResult(input.routeKey, operationIds[1]!, {
            requestId: operationIds[1]!, deployments: [{
              deploymentId: "deployment_attempt_0001", deployedWorkerId: "deployed_worker_alpha",
              artifactRef, status: "active", createdAt: "2026-08-25T12:00:00.000Z",
            }], nextCursor: null,
          }, "2026-08-25T12:01:00.000Z");
        }
        return succeededManagementResult(input.routeKey, operationIds[2]!, {
          requestId: operationIds[2]!, deployedWorkerId: "deployed_worker_alpha",
          deploymentId: "deployment_attempt_0001", workerRevision: 3, activatedAt: "2026-08-25T12:02:00.000Z",
        }, "2026-08-25T12:02:00.000Z");
      },
    };
    expect((await listDeployments({
      credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha", limit: 100,
    }, dependencies)).outcome).toBe("succeeded");
    expect((await rollbackDeployment({
      projectRoot: project, profileDigest, credentialsPath: "/unused", env: {},
      deployedWorkerId: "deployed_worker_alpha", deploymentId: "deployment_attempt_0001", expectedWorkerRevision: 2,
    }, dependencies)).outcome).toBe("succeeded");
    await expect(rollbackDeployment({
      projectRoot: project, profileDigest, credentialsPath: "/unused", env: {},
      deployedWorkerId: "deployed_worker_alpha", deploymentId: "deployed_worker_alpha", expectedWorkerRevision: 2,
    }, dependencies)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(seen.map((entry) => (entry as { routeKey: string }).routeKey)).toEqual(["deployments.list", "deployments.rollback"]);
  });
});
