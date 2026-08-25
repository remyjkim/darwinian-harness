// ABOUTME: Freezes the Worker-owned public result envelope and its human/JSON projections.
// ABOUTME: Server messages and raw bodies never enter retained command results.

import { describe, expect, test } from "bun:test";
import {
  indeterminateManagementResult,
  refusedManagementResult,
  renderManagementResultHuman,
  renderManagementResultJson,
  succeededManagementResult,
} from "../cli/core/management/results";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const observedAt = "2026-08-25T12:00:00.000Z";

describe("management result envelope", () => {
  test("constructs one deeply frozen strict success model for human and JSON output", () => {
    const result = succeededManagementResult(
      "organizations.list",
      requestId,
      { organizations: [] },
      observedAt,
    );
    expect(result).toEqual({
      schema: "drwn.command-result",
      schemaVersion: 1,
      command: "organizations.list",
      outcome: "succeeded",
      requestId,
      observedAt,
      data: { organizations: [] },
      error: null,
      warnings: [],
    });
    expect(Object.isFrozen(result)).toBeTrue();
    expect(Object.isFrozen(result.data!)).toBeTrue();
    expect(renderManagementResultJson(result)).toBe(`${JSON.stringify(result, null, 2)}\n`);
    expect(renderManagementResultHuman(result)).toBe(`organizations.list succeeded.\nRequest: ${requestId}\n`);
  });

  test("projects refusals from closed safe fields and never retains a server message", () => {
    const result = refusedManagementResult(
      "organizations.read",
      requestId,
      { code: "RESOURCE_UNAVAILABLE", retryable: false },
      observedAt,
    );
    expect(result.outcome).toBe("refused");
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ code: "RESOURCE_UNAVAILABLE", retryable: false });
    expect(Object.keys(result.error!)).toEqual(["code", "retryable"]);
    expect(renderManagementResultHuman(result)).toContain("RESOURCE_UNAVAILABLE");
  });

  test("represents network uncertainty as indeterminate with no raw exception", () => {
    const result = indeterminateManagementResult("deployments.create", requestId, observedAt);
    expect(result).toMatchObject({
      outcome: "indeterminate",
      data: null,
      error: { code: "TEMPORARILY_UNAVAILABLE", retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain("cause");
    expect(JSON.stringify(result)).not.toContain("message");
  });

  test("rejects malformed timestamps and unknown error codes at construction", () => {
    expect(() => succeededManagementResult("organizations.list", requestId, {}, "not-a-time"))
      .toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => refusedManagementResult(
      "organizations.list",
      requestId,
      { code: "UNKNOWN" as never, retryable: false },
      observedAt,
    )).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  test("rejects retry flags and delays that contradict the closed error policy", () => {
    for (const error of [
      { code: "RESOURCE_UNAVAILABLE", retryable: true },
      { code: "RATE_LIMITED", retryable: false },
      { code: "RATE_LIMITED", retryable: true, retryAfterSeconds: 0 },
      { code: "TEMPORARILY_UNAVAILABLE", retryable: true, retryAfterSeconds: 3601 },
    ] as const) {
      expect(() => refusedManagementResult(
        "organizations.list",
        requestId,
        error,
        observedAt,
      )).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    }
  });
});
