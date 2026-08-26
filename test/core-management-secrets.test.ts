// ABOUTME: Proves secret values are request-only and never enter journals, results, or retained failures.
// ABOUTME: Only strict secret metadata and revisions cross the public result boundary.

import { describe, expect, test } from "bun:test";
import { setDeployedWorkerSecret } from "../cli/core/management/secrets";
import { refusedManagementResult, succeededManagementResult } from "../cli/core/management/results";

const requestId = "123e4567-e89b-42d3-a456-426614174008";

describe("Deployed Worker secrets", () => {
  test("sends one value only in the request and returns metadata without retaining it", async () => {
    const sentinel = "sk_SENTINEL_SECRET_VALUE_123456";
    let request: unknown;
    const result = await setDeployedWorkerSecret({
      credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha",
      name: "PROVIDER_API_KEY", value: sentinel, expectedWorkerRevision: 3,
    }, {
      requestId: () => requestId,
      execute: async (input) => {
        request = structuredClone(input.request);
        return succeededManagementResult(input.routeKey, requestId, {
          requestId, deployedWorkerId: "deployed_worker_alpha", name: "PROVIDER_API_KEY",
          secretRevision: 1, workerRevision: 4, observedAt: "2026-08-25T12:10:00.000Z",
        }, "2026-08-25T12:10:00.000Z");
      },
    });
    expect(request).toMatchObject({ value: sentinel, name: "PROVIDER_API_KEY", expectedWorkerRevision: 3 });
    expect(result.outcome).toBe("succeeded");
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(result.data).toEqual({
      requestId, deployedWorkerId: "deployed_worker_alpha", name: "PROVIDER_API_KEY",
      secretRevision: 1, workerRevision: 4, observedAt: "2026-08-25T12:10:00.000Z",
    });
  });

  test("invalid target, name, empty value, oversize, and revision fail before transport", async () => {
    let calls = 0;
    const base = {
      credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha",
      name: "PROVIDER_API_KEY", value: "value", expectedWorkerRevision: 3,
    };
    for (const override of [
      { deployedWorkerId: "worker_wrong" }, { name: "lowercase" }, { value: "" },
      { value: "x".repeat(65_537) }, { expectedWorkerRevision: 0 },
    ]) {
      await expect(setDeployedWorkerSecret({ ...base, ...override }, {
        requestId: () => requestId,
        execute: async () => { calls += 1; throw new Error("must not execute"); },
      })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(calls).toBe(0);
  });

  test("refusal retains only the closed public error and no reflected secret", async () => {
    const sentinel = "sk_SENTINEL_REFLECTED_123456";
    const result = await setDeployedWorkerSecret({
      credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha",
      name: "PROVIDER_API_KEY", value: sentinel, expectedWorkerRevision: 3,
    }, {
      requestId: () => requestId,
      execute: async (input) => refusedManagementResult(
        input.routeKey, requestId, { code: "AUTHORIZATION_DENIED", retryable: false }, "2026-08-25T12:10:00.000Z",
      ),
    });
    expect(result).toMatchObject({ outcome: "refused", error: { code: "AUTHORIZATION_DENIED" } });
    expect(String(result)).not.toContain(sentinel);
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });
});
