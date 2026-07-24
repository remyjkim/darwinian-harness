// ABOUTME: Verifies the shared worker error presenter that separates auth/token failures from connectivity.
// ABOUTME: Guards I65 Fix 3 — "Cannot reach Deploy API" is reserved for genuine network errors.

import { describe, expect, test } from "bun:test";
import { JwtAudienceError } from "../cli/core/auth/jwt";
import { NotAuthenticatedError } from "../cli/core/worker-http";
import { describeWorkerError } from "../cli/core/worker-error";

const API = "https://studio.darwiniantools.com";

describe("describeWorkerError", () => {
  test("surfaces not-authenticated errors without the connectivity banner", () => {
    const message = "Not authenticated. Run `drwn login` first, or set DRWN_TOKEN for headless execution.";
    const described = describeWorkerError(new NotAuthenticatedError(message), API);
    expect(described).toBe(message);
    expect(described).not.toContain("Cannot reach");
  });

  test("surfaces token errors without the connectivity banner", () => {
    const described = describeWorkerError(new JwtAudienceError("Token is expired."), API);
    expect(described).toBe("Token is expired.");
    expect(described).not.toContain("Cannot reach");
  });

  test("surfaces refresh-path auth failures without the connectivity banner (G2 review note 1)", () => {
    // resolve-token/device-flow throw plain Errors on the refresh path; the
    // presenter must still classify them as auth, not connectivity.
    const notAuth = describeWorkerError(new Error("Not authenticated. Run `drwn login` first."), API);
    expect(notAuth).toBe("Not authenticated. Run `drwn login` first.");
    expect(notAuth).not.toContain("Cannot reach");

    const legacy = describeWorkerError(new Error("Legacy credentials found. Run `drwn login` again."), API);
    expect(legacy).not.toContain("Cannot reach");

    const dahBody = describeWorkerError(new Error("DAH token response did not include access_token."), API);
    expect(dahBody).not.toContain("Cannot reach");
  });

  test("labels network failures as connectivity", () => {
    const described = describeWorkerError(new TypeError("fetch failed: getaddrinfo ENOTFOUND studio.darwiniantools.com"), API);
    expect(described).toBe(`Cannot reach Deploy API at ${API}: fetch failed: getaddrinfo ENOTFOUND studio.darwiniantools.com`);
  });

  test("labels unknown errors as connectivity (existing behavior)", () => {
    expect(describeWorkerError(new Error("boom"), API)).toBe(`Cannot reach Deploy API at ${API}: boom`);
    expect(describeWorkerError("boom", API)).toBe(`Cannot reach Deploy API at ${API}: boom`);
  });
});
