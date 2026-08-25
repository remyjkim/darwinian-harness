// ABOUTME: Pins strict request, success, and public-error parsing for the management kernel.
// ABOUTME: Invalid server values become stable non-reflecting Worker errors.

import { describe, expect, test } from "bun:test";
import { managementContract } from "../cli/core/management/contracts";
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
      expect(parseRouteSuccess(routeKey, vector.success)).toEqual(vector.success);
    }
  });

  test("request failures are local validation and success failures are server-invalid without reflection", () => {
    const sentinel = "SENTINEL_SCHEMA_BODY";
    expect(() => parseRouteRequest("organizations.list", { requestId, unknown: sentinel }))
      .toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    try {
      parseRouteSuccess("organizations.list", { requestId, accessToken: sentinel });
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
      schema: "cl.drwn.error.v1",
      requestId,
      code: "RATE_LIMITED",
      message: "Try later",
      retryable: true,
      retryAfterSeconds: 2,
    }, 429, requestId);
    expect(parsed).toEqual({ code: "RATE_LIMITED", retryable: true, retryAfterSeconds: 2 });

    for (const [candidate, status, expected] of [
      [{ schema: "cl.drwn.error.v1", requestId, code: "RATE_LIMITED", message: "x", retryable: true }, 503, requestId],
      [{ schema: "cl.drwn.error.v1", requestId, code: "RATE_LIMITED", message: "x", retryable: true }, 429, "123e4567-e89b-42d3-a456-426614174001"],
      [{ schema: "cl.drwn.error.v1", requestId, code: "UNKNOWN", message: "x", retryable: false }, 400, requestId],
      [{ schema: "cl.drwn.error.v1", requestId, code: "RATE_LIMITED", message: "x", retryable: true, raw: "secret" }, 429, requestId],
    ] as const) {
      expect(() => parseManagementPublicError(candidate, status, expected))
        .toThrow(expect.objectContaining({ code: "SERVER_RESPONSE_INVALID" }));
    }
  });
});
