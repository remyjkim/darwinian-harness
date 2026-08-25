// ABOUTME: Pins the route-keyed management transport, retry, refresh, and result boundaries.
// ABOUTME: Mutations preserve one request ID and serialized body across every allowed replay.

import { describe, expect, test } from "bun:test";
import { drwnCliProfile } from "../cli/core/auth/profile";
import type { CliDahCredentialFileV3 } from "../cli/core/auth/credentials";
import { executeManagementRequest } from "../cli/core/management/transport";
import { DRWN_VERSION } from "../cli/core/version";

const profile = drwnCliProfile({});
const requiredScope = "openid email offline_access dah:management.delegate";

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(overrides: Record<string, unknown> = {}): string {
  const iat = Math.floor(Date.now() / 1000) - 1;
  return `${b64({ alg: "none" })}.${b64({
    iss: profile.issuer,
    aud: profile.resource,
    azp: "drwn-cli",
    sub: "user_123",
    scope: requiredScope,
    iat,
    exp: iat + 900,
    ...overrides,
  })}.sig`;
}

const ids = {
  list: "123e4567-e89b-42d3-a456-426614174000",
  register: "123e4567-e89b-42d3-a456-426614174002",
};

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers });
}

function publicError(requestId: string, code: string, retryable: boolean, retryAfterSeconds?: number) {
  return {
    schema: "cl.drwn.error.v1",
    requestId,
    code,
    message: "safe server message",
    retryable,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

function storedCredential(accessToken: string): CliDahCredentialFileV3 {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8"));
  return {
    version: 3,
    credentialId: "55555555-5555-4555-8555-555555555555",
    generation: 1,
    issuer: profile.issuer,
    clientId: "drwn-cli",
    resource: profile.resource,
    accessToken,
    refreshToken: "refresh-1",
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    savedAt: new Date().toISOString(),
    userEmail: "person@example.test",
  };
}

describe("executeManagementRequest", () => {
  test("resolves the profile before auth and sends one closed GET request from a route key", async () => {
    const seen: { url: string; headers: Record<string, string>; method: string; body: unknown }[] = [];
    const accessToken = token();
    const result = await executeManagementRequest({
      routeKey: "organizations.list",
      request: { requestId: ids.list, limit: 50 },
      credentialsPath: "/unused",
      env: { DRWN_TOKEN: accessToken },
    }, {
      fetcher: (async (input, init) => {
        seen.push({
          url: String(input),
          headers: Object.fromEntries(new Headers(init?.headers)),
          method: init?.method ?? "GET",
          body: init?.body,
        });
        return json({ requestId: ids.list, organizations: [], nextCursor: null });
      }) as typeof fetch,
      now: () => "2026-08-25T12:00:00.000Z",
    });

    expect(result).toMatchObject({ outcome: "succeeded", command: "organizations.list", requestId: ids.list });
    expect(seen).toEqual([{
      url: "https://api.darwinian.dev/api/organizations?limit=50",
      method: "GET",
      body: undefined,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-drwn-protocol": "deployed-worker.v1",
        "x-drwn-version": DRWN_VERSION,
        "x-request-id": ids.list,
      },
    }]);
  });

  test("serializes a mutation once and reuses identical bytes and request ID for typed retry", async () => {
    const bodies: string[] = [];
    const requestIds: string[] = [];
    const sleeps: number[] = [];
    let calls = 0;
    const request = {
      requestId: ids.register,
      organizationId: "org_acme",
      workerId: "worker_alpha",
      name: "worker-alpha",
      environment: "staging",
    };
    const result = await executeManagementRequest({
      routeKey: "deployed_workers.register",
      request,
      credentialsPath: "/unused",
      env: { DRWN_TOKEN: token() },
    }, {
      fetcher: (async (_input, init) => {
        calls += 1;
        bodies.push(String(init?.body));
        requestIds.push(new Headers(init?.headers).get("x-request-id")!);
        if (calls === 1) return json(publicError(ids.register, "TEMPORARILY_UNAVAILABLE", true, 2), 503);
        return json({
          requestId: ids.register,
          organizationId: "org_acme",
          workerId: "worker_alpha",
          deployedWorkerId: "deployed_worker_alpha",
          workerRevision: 1,
          bindingRevision: 1,
        });
      }) as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => "2026-08-25T12:00:00.000Z",
    });

    expect(result.outcome).toBe("succeeded");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[0]!)).toEqual({ environment: "staging", name: "worker-alpha", organizationId: "org_acme", workerId: "worker_alpha" });
    expect(requestIds).toEqual([ids.register, ids.register]);
    expect(sleeps).toEqual([2_000]);
  });

  test("refreshes a stored bearer once on 401 and replays the same prepared request", async () => {
    const first = token();
    const second = token({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 1_200 });
    const credential = storedCredential(first);
    const sent: string[] = [];
    let refreshes = 0;
    const result = await executeManagementRequest({
      routeKey: "organizations.list",
      request: { requestId: ids.list, limit: 50 },
      credentialsPath: "/credentials.json",
      env: {},
    }, {
      resolveAuth: async () => ({ token: first, source: "stored", credential }),
      refreshAuth: async () => { refreshes += 1; return second; },
      fetcher: (async (_input, init) => {
        sent.push(new Headers(init?.headers).get("authorization")!);
        if (sent.length === 1) return new Response("unauthorized", { status: 401 });
        return json({ requestId: ids.list, organizations: [], nextCursor: null });
      }) as typeof fetch,
      now: () => "2026-08-25T12:00:00.000Z",
    });
    expect(result.outcome).toBe("succeeded");
    expect(refreshes).toBe(1);
    expect(sent).toEqual([`Bearer ${first}`, `Bearer ${second}`]);
  });

  test("never refreshes env auth or consent errors", async () => {
    let refreshes = 0;
    const result = await executeManagementRequest({
      routeKey: "organizations.list",
      request: { requestId: ids.list, limit: 50 },
      credentialsPath: "/unused",
      env: { DRWN_TOKEN: token() },
    }, {
      refreshAuth: async () => { refreshes += 1; return token(); },
      fetcher: (async () => json(publicError(ids.list, "CONSENT_REQUIRED", false), 403)) as unknown as typeof fetch,
      now: () => "2026-08-25T12:00:00.000Z",
    });
    expect(result).toMatchObject({ outcome: "refused", error: { code: "CONSENT_REQUIRED", retryable: false } });
    expect(refreshes).toBe(0);
  });

  test("bounds typed retries and returns the final closed refusal", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const result = await executeManagementRequest({
      routeKey: "organizations.list",
      request: { requestId: ids.list, limit: 50 },
      credentialsPath: "/unused",
      env: { DRWN_TOKEN: token() },
    }, {
      fetcher: (async () => {
        calls += 1;
        return json(publicError(ids.list, "RATE_LIMITED", true, 1), 429);
      }) as unknown as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => "2026-08-25T12:00:00.000Z",
    });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1_000, 1_000]);
    expect(result).toMatchObject({ outcome: "refused", error: { code: "RATE_LIMITED", retryable: true } });
  });

  test("does not generically retry network or malformed mutation failures", async () => {
    let calls = 0;
    const input = {
      routeKey: "deployed_workers.register" as const,
      request: {
        requestId: ids.register,
        organizationId: "org_acme",
        workerId: "worker_alpha",
        name: "worker-alpha",
        environment: "staging",
      },
      credentialsPath: "/unused",
      env: { DRWN_TOKEN: token() },
    };
    const indeterminate = await executeManagementRequest(input, {
      fetcher: (async () => { calls += 1; throw new Error("SENTINEL_NETWORK_BODY"); }) as unknown as typeof fetch,
      now: () => "2026-08-25T12:00:00.000Z",
    });
    expect(indeterminate.outcome).toBe("indeterminate");
    expect(JSON.stringify(indeterminate)).not.toContain("SENTINEL");
    expect(calls).toBe(1);

    calls = 0;
    const malformed = await executeManagementRequest(input, {
      fetcher: (async () => { calls += 1; return new Response("upstream secret", { status: 500 }); }) as unknown as typeof fetch,
      now: () => "2026-08-25T12:00:00.000Z",
    });
    expect(malformed).toMatchObject({ outcome: "refused", error: { code: "SERVER_RESPONSE_INVALID" } });
    expect(calls).toBe(1);
  });

  test("maps 410 and 426 only from strict public errors and rejects response request-ID drift", async () => {
    for (const [status, code] of [[410, "MIND_CONTRACT_REMOVED"], [426, "UNSUPPORTED_PROTOCOL"]] as const) {
      const result = await executeManagementRequest({
        routeKey: "organizations.list",
        request: { requestId: ids.list, limit: 50 },
        credentialsPath: "/unused",
        env: { DRWN_TOKEN: token() },
      }, {
        fetcher: (async () => json(publicError(ids.list, code, false), status)) as unknown as typeof fetch,
        now: () => "2026-08-25T12:00:00.000Z",
      });
      expect(result).toMatchObject({ outcome: "refused", error: { code } });
    }

    const drift = await executeManagementRequest({
      routeKey: "organizations.list",
      request: { requestId: ids.list, limit: 50 },
      credentialsPath: "/unused",
      env: { DRWN_TOKEN: token() },
    }, {
      fetcher: (async () => json({
        requestId: "123e4567-e89b-42d3-a456-426614174001",
        organizations: [],
        nextCursor: null,
      })) as unknown as typeof fetch,
      now: () => "2026-08-25T12:00:00.000Z",
    });
    expect(drift).toMatchObject({ outcome: "refused", error: { code: "SERVER_RESPONSE_INVALID" } });
  });

  test("rejects a mixed profile before auth or fetch", async () => {
    let effects = 0;
    await expect(executeManagementRequest({
      routeKey: "organizations.list",
      request: { requestId: ids.list, limit: 50 },
      credentialsPath: "/must-not-read",
      env: { DRWN_DAH_HUB_URL: "https://other.test" },
    }, {
      resolveAuth: async () => { effects += 1; return null; },
      fetcher: (async () => { effects += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch,
    })).rejects.toMatchObject({ code: "CLOUD_PROFILE_INVALID" });
    expect(effects).toBe(0);
  });
});
