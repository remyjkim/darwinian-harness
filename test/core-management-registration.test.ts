// ABOUTME: Proves registration persists one safe intent and resumes it across every crash boundary.
// ABOUTME: Project binding appears only after strict registration receipt plus detail readback.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectCloudContext } from "../cli/core/management/context-store";
import { loadClientOperation } from "../cli/core/management/operation-journal";
import {
  registerDeployedWorker,
  type RegistrationDependencies,
} from "../cli/core/management/registration";
import {
  indeterminateManagementResult,
  refusedManagementResult,
  succeededManagementResult,
} from "../cli/core/management/results";

const profileDigest = "a".repeat(64);
const operationId = "123e4567-e89b-42d3-a456-426614174002";
const readbackId = "123e4567-e89b-42d3-a456-426614174004";
let root: string | null = null;

async function fixture(): Promise<string> {
  root = await realpath(await mkdtemp(join(tmpdir(), "drwn-registration-")));
  return root;
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

function input(projectRoot: string, overrides: Partial<Parameters<typeof registerDeployedWorker>[0]> = {}) {
  return {
    projectRoot,
    profileDigest,
    credentialsPath: "/unused",
    env: {},
    organizationId: "org_acme",
    name: "worker-alpha",
    environment: "staging",
    ...overrides,
  };
}

function receipt() {
  return {
    requestId: operationId,
    organizationId: "org_acme",
    workerId: "worker_alpha",
    deployedWorkerId: "deployed_worker_alpha",
    workerRevision: 1,
    bindingRevision: 1,
  };
}

function readback() {
  return {
    requestId: readbackId,
    worker: {
      organizationId: "org_acme",
      workerId: "worker_alpha",
      deployedWorkerId: "deployed_worker_alpha",
      name: "worker-alpha",
      environment: "staging",
      workerRevision: 1,
      bindingRevision: 1,
      retired: false,
    },
  };
}

function successDependencies(events: string[] = []): RegistrationDependencies {
  let tick = 0;
  return {
    operationId: () => operationId,
    readbackRequestId: () => readbackId,
    journalNow: () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString(),
    now: () => "2026-08-25T12:10:00.000Z",
    execute: async (request) => {
      const journal = await loadClientOperation(request.credentialsPath === "/unused" ? root! : "", operationId);
      events.push(`${request.routeKey}:${request.request.requestId}:${journal?.phase ?? "absent"}`);
      if (request.routeKey === "deployed_workers.register") {
        return succeededManagementResult(request.routeKey, operationId, receipt(), "2026-08-25T12:05:00.000Z");
      }
      return succeededManagementResult(request.routeKey, readbackId, readback(), "2026-08-25T12:06:00.000Z");
    },
  };
}

describe("resumable Deployed Worker registration", () => {
  test("validates organization, name, and closed environment before journal or fetch", async () => {
    const project = await fixture();
    let calls = 0;
    const dependencies: RegistrationDependencies = {
      operationId: () => operationId,
      execute: async () => { calls += 1; throw new Error("must not execute"); },
    };
    for (const overrides of [
      { organizationId: "worker_wrong" },
      { name: "" },
      { name: "x".repeat(257) },
      { environment: "preview" },
    ]) {
      await expect(registerDeployedWorker(input(project, overrides), dependencies))
        .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(calls).toBe(0);
    expect(await loadClientOperation(project, operationId)).toBeNull();
  });

  test("persists canonical non-secret intent and UUID before the first fetch", async () => {
    const project = await fixture();
    const events: string[] = [];
    const result = await registerDeployedWorker(input(project), successDependencies(events));
    expect(result.outcome).toBe("succeeded");
    expect(events).toEqual([
      `deployed_workers.register:${operationId}:sent`,
      `deployed_workers.read:${readbackId}:receipt_verified`,
    ]);
    expect(await loadClientOperation(project, operationId)).toBeNull();
    expect(await loadProjectCloudContext(project)).toMatchObject({
      organizationId: "org_acme",
      deployedWorkerId: "deployed_worker_alpha",
      profileDigest,
    });
  });

  test("lost response and a fresh invocation reuse identical request ID and bytes", async () => {
    const project = await fixture();
    const calls: Array<{ route: string; request: unknown }> = [];
    let registerCalls = 0;
    let tick = 0;
    const dependencies: RegistrationDependencies = {
      operationId: () => operationId,
      readbackRequestId: () => readbackId,
      journalNow: () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString(),
      execute: async (request) => {
        calls.push({ route: request.routeKey, request: structuredClone(request.request) });
        if (request.routeKey === "deployed_workers.register" && registerCalls++ === 0) {
          return indeterminateManagementResult(request.routeKey, operationId, "2026-08-25T12:01:00.000Z");
        }
        if (request.routeKey === "deployed_workers.register") {
          return succeededManagementResult(request.routeKey, operationId, receipt(), "2026-08-25T12:02:00.000Z");
        }
        return succeededManagementResult(request.routeKey, readbackId, readback(), "2026-08-25T12:03:00.000Z");
      },
    };
    expect((await registerDeployedWorker(input(project), dependencies)).outcome).toBe("indeterminate");
    expect((await loadClientOperation(project, operationId))!.phase).toBe("indeterminate");
    expect((await registerDeployedWorker(input(project), dependencies)).outcome).toBe("succeeded");
    expect(calls.filter(({ route }) => route === "deployed_workers.register").map(({ request }) => request)).toEqual([
      { requestId: operationId, organizationId: "org_acme", name: "worker-alpha", environment: "staging" },
      { requestId: operationId, organizationId: "org_acme", name: "worker-alpha", environment: "staging" },
    ]);
  });

  test("same operation ID with changed intent refuses before a second fetch", async () => {
    const project = await fixture();
    let calls = 0;
    let tick = 0;
    const dependencies: RegistrationDependencies = {
      operationId: () => operationId,
      journalNow: () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString(),
      execute: async (request) => {
        calls += 1;
        return indeterminateManagementResult(request.routeKey, operationId, "2026-08-25T12:01:00.000Z");
      },
    };
    await registerDeployedWorker(input(project), dependencies);
    await expect(registerDeployedWorker(input(project, { name: "worker-beta" }), dependencies))
      .rejects.toMatchObject({ code: "OPERATION_ID_CONFLICT" });
    expect(calls).toBe(1);
  });

  test("incomplete attachment readback retains the journal and leaves context unchanged", async () => {
    const project = await fixture();
    let tick = 0;
    const dependencies: RegistrationDependencies = {
      operationId: () => operationId,
      readbackRequestId: () => readbackId,
      journalNow: () => new Date(Date.UTC(2026, 7, 25, 12, 0, tick++)).toISOString(),
      execute: async (request) => request.routeKey === "deployed_workers.register"
        ? succeededManagementResult(request.routeKey, operationId, receipt(), "2026-08-25T12:02:00.000Z")
        : refusedManagementResult(request.routeKey, readbackId, { code: "RESOURCE_UNAVAILABLE", retryable: false }, "2026-08-25T12:03:00.000Z"),
    };
    const result = await registerDeployedWorker(input(project), dependencies);
    expect(result).toMatchObject({ command: "deployed_workers.register", outcome: "refused", error: { code: "RESOURCE_UNAVAILABLE" } });
    expect((await loadClientOperation(project, operationId))!.phase).toBe("receipt_verified");
    expect(await loadProjectCloudContext(project)).toBeNull();
  });

  for (const checkpoint of ["after_response", "after_context_write", "before_journal_remove"] as const) {
    test(`resumes safely after an injected ${checkpoint} crash`, async () => {
      const project = await fixture();
      const crashed = new Error(`injected:${checkpoint}`);
      const first = successDependencies();
      first.checkpoint = (phase) => { if (phase === checkpoint) throw crashed; };
      await expect(registerDeployedWorker(input(project), first)).rejects.toBe(crashed);
      expect(await loadClientOperation(project, operationId)).not.toBeNull();

      const result = await registerDeployedWorker(input(project), successDependencies());
      expect(result.outcome).toBe("succeeded");
      expect(await loadClientOperation(project, operationId)).toBeNull();
      expect(await loadProjectCloudContext(project)).toMatchObject({ deployedWorkerId: "deployed_worker_alpha" });
    });
  }

  test("journal and public result contain no token, server phase, or invented WorkerId intent", async () => {
    const project = await fixture();
    const sentinel = "SENTINEL_REGISTRATION_TOKEN";
    const dependencies: RegistrationDependencies = {
      operationId: () => operationId,
      journalNow: () => "2026-08-25T12:00:00.000Z",
      execute: async (request) => indeterminateManagementResult(request.routeKey, operationId, "2026-08-25T12:01:00.000Z"),
    };
    const result = await registerDeployedWorker(input(project, { env: { DRWN_TOKEN: sentinel } }), dependencies);
    const journal = await loadClientOperation(project, operationId);
    const retained = JSON.stringify(journal);
    expect(Buffer.from(journal!.requestBase64, "base64").toString("utf8"))
      .toBe('{"environment":"staging","name":"worker-alpha","organizationId":"org_acme"}');
    for (const forbidden of [sentinel, "workerId", "intentToken", "serverPhase"]) {
      expect(retained).not.toContain(forbidden);
      expect(JSON.stringify(result)).not.toContain(forbidden);
    }
  });
});
