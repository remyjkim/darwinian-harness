// ABOUTME: Pins strict request, success, and public-error parsing for the management kernel.
// ABOUTME: Invalid server values become stable non-reflecting Worker errors.

import { describe, expect, test } from "bun:test";
import { managementContract, type ManagementJsonObject } from "../cli/core/management/contracts";
import type { ManagementRouteKey } from "../cli/core/management/routes";
import {
  parseRouteRequest,
  parseRouteSuccess,
} from "../cli/core/management/schemas";
import { parseManagementPublicError } from "../cli/core/management/errors";

const requestId = "123e4567-e89b-42d3-a456-426614174000";

describe("management schemas", () => {
  test("parses every canonical request and success through the route schema", () => {
    for (const vector of managementContract.vectors.positive) {
      const routeKey = vector.routeKey as ManagementRouteKey;
      expect(parseRouteRequest(routeKey, vector.request)).toEqual(vector.request);
      expect(parseRouteSuccess(routeKey, vector.success, vector.request)).toEqual(vector.success);
    }
  });

  test("rejects every schema-valid success identity that is inconsistent with its request", () => {
    const vector = (routeKey: ManagementRouteKey) => {
      const found = managementContract.vectors.positive.find((candidate) => candidate.routeKey === routeKey)!;
      return {
        request: structuredClone(found.request) as ManagementJsonObject,
        success: structuredClone(found.success) as ManagementJsonObject,
      };
    };
    const cases: Array<{
      name: string;
      routeKey: ManagementRouteKey;
      mutate: (request: ManagementJsonObject, success: ManagementJsonObject) => void;
    }> = [
      {
        name: "organization detail ID",
        routeKey: "organizations.read",
        mutate: (_request, success) => {
          (success.organization as ManagementJsonObject).organizationId = "org_other";
        },
      },
      {
        name: "registration organization",
        routeKey: "deployed_workers.register",
        mutate: (_request, success) => { success.organizationId = "org_other"; },
      },
      {
        name: "Worker collection organization",
        routeKey: "deployed_workers.list",
        mutate: (_request, success) => {
          ((success.workers as ManagementJsonObject[])[0]!).organizationId = "org_other";
        },
      },
      {
        name: "Worker collection environment filter",
        routeKey: "deployed_workers.list",
        mutate: (_request, success) => {
          ((success.workers as ManagementJsonObject[])[0]!).environment = "production";
        },
      },
      {
        name: "Worker detail target",
        routeKey: "deployed_workers.read",
        mutate: (_request, success) => {
          (success.worker as ManagementJsonObject).deployedWorkerId = "deployed_worker_other";
        },
      },
      {
        name: "artifact target",
        routeKey: "deployment_artifacts.put",
        mutate: (_request, success) => { success.deployedWorkerId = "deployed_worker_other"; },
      },
      {
        name: "deployment create target",
        routeKey: "deployments.create",
        mutate: (_request, success) => { success.deployedWorkerId = "deployed_worker_other"; },
      },
      {
        name: "deployment create revision",
        routeKey: "deployments.create",
        mutate: (request, success) => { success.workerRevision = request.expectedWorkerRevision!; },
      },
      {
        name: "deployment collection target",
        routeKey: "deployments.list",
        mutate: (_request, success) => {
          ((success.deployments as ManagementJsonObject[])[0]!).deployedWorkerId = "deployed_worker_other";
        },
      },
      {
        name: "rollback target",
        routeKey: "deployments.rollback",
        mutate: (_request, success) => { success.deployedWorkerId = "deployed_worker_other"; },
      },
      {
        name: "rollback deployment",
        routeKey: "deployments.rollback",
        mutate: (_request, success) => { success.deploymentId = "deployment_attempt_other"; },
      },
      {
        name: "rollback revision",
        routeKey: "deployments.rollback",
        mutate: (request, success) => { success.workerRevision = request.expectedWorkerRevision!; },
      },
      {
        name: "secret target",
        routeKey: "secrets.set",
        mutate: (_request, success) => { success.deployedWorkerId = "deployed_worker_other"; },
      },
      {
        name: "secret name",
        routeKey: "secrets.set",
        mutate: (_request, success) => { success.name = "OTHER_SECRET"; },
      },
      {
        name: "secret revision",
        routeKey: "secrets.set",
        mutate: (request, success) => { success.workerRevision = request.expectedWorkerRevision!; },
      },
      {
        name: "created run target",
        routeKey: "runs.create",
        mutate: (_request, success) => { success.deployedWorkerId = "deployed_worker_other"; },
      },
      {
        name: "run detail target",
        routeKey: "runs.read",
        mutate: (_request, success) => {
          (success.run as ManagementJsonObject).deployedWorkerId = "deployed_worker_other";
        },
      },
      {
        name: "run detail ID",
        routeKey: "runs.read",
        mutate: (_request, success) => { (success.run as ManagementJsonObject).runId = "run_other"; },
      },
      {
        name: "retirement target",
        routeKey: "deployed_workers.retire",
        mutate: (_request, success) => { success.deployedWorkerId = "deployed_worker_other"; },
      },
      {
        name: "retirement Worker revision",
        routeKey: "deployed_workers.retire",
        mutate: (request, success) => { success.workerRevision = request.expectedWorkerRevision!; },
      },
      {
        name: "retirement binding revision",
        routeKey: "deployed_workers.retire",
        mutate: (request, success) => { success.bindingRevision = request.expectedBindingRevision!; },
      },
    ];

    for (const mismatch of cases) {
      const { request, success } = vector(mismatch.routeKey);
      mismatch.mutate(request, success);
      expect(
        () => parseRouteSuccess(mismatch.routeKey, success, request),
        mismatch.name,
      ).toThrow(expect.objectContaining({ code: "SERVER_RESPONSE_INVALID" }));
    }

    for (const positive of managementContract.vectors.positive) {
      const request = structuredClone(positive.request) as ManagementJsonObject;
      const success = structuredClone(positive.success) as ManagementJsonObject;
      success.requestId = "123e4567-e89b-42d3-a456-4266141740ff";
      expect(
        () => parseRouteSuccess(positive.routeKey as ManagementRouteKey, success, request),
        `${positive.routeKey} request identity`,
      ).toThrow(expect.objectContaining({ code: "SERVER_RESPONSE_INVALID" }));
    }
  });

  test("request failures are local validation and success failures are server-invalid without reflection", () => {
    const sentinel = "SENTINEL_SCHEMA_BODY";
    expect(() => parseRouteRequest("organizations.list", { requestId, unknown: sentinel }))
      .toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    try {
      parseRouteSuccess("organizations.list", { requestId, accessToken: sentinel }, { requestId, limit: 50 });
      throw new Error("invalid success unexpectedly passed");
    } catch (error) {
      expect(error).toMatchObject({ code: "SERVER_RESPONSE_INVALID" });
      expect(String(error)).not.toContain(sentinel);
      expect(JSON.stringify(error)).not.toContain(sentinel);
      expect((error as Error).cause).toBeUndefined();
    }
  });

  test("admits only a status-consistent public error for the same request", () => {
    const parsed = parseManagementPublicError({
      requestId,
      error: "rate_limited",
      retryAfterSeconds: 2,
    }, 429, requestId, "organizations.list");
    expect(parsed).toEqual({ code: "RATE_LIMITED", retryable: true, retryAfterSeconds: 2 });

    for (const [candidate, status, expected] of [
      [{ requestId, error: "rate_limited", retryAfterSeconds: 2 }, 503, requestId],
      [{ requestId, error: "rate_limited", retryAfterSeconds: 2 }, 429, "123e4567-e89b-42d3-a456-426614174001"],
      [{ requestId, error: "unknown" }, 400, requestId],
      [{ requestId, error: "rate_limited", retryAfterSeconds: 2, raw: "secret" }, 429, requestId],
    ] as const) {
      expect(() => parseManagementPublicError(candidate, status, expected, "organizations.list"))
        .toThrow(expect.objectContaining({ code: "SERVER_RESPONSE_INVALID" }));
    }

    expect(parseManagementPublicError({
      error: "client_protocol_unsupported",
      receivedProtocol: "deployed-worker.v0",
      requiredProtocol: "deployed-worker.v1",
      minimumDrwnVersion: "1.4.2",
    }, 426, requestId, "organizations.list")).toEqual({ code: "UNSUPPORTED_PROTOCOL", retryable: false });
  });
});
