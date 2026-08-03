// ABOUTME: Unit tests for the worker Deploy API auth-aware fetch helper.
// ABOUTME: Covers bearer attachment, the 401 -> refresh-once -> retry path, the env-token no-retry short-circuit, and the not-authenticated guard.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchWithWorkerAuth } from "../cli/core/worker-http";
import { writeCredentials } from "../cli/core/auth/credentials";
import { resolveCredentialsPath } from "../cli/core/paths";

let tmp: string | null = null;

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(email = "x@y.z", exp = Math.floor(Date.now() / 1000) + 900): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: "https://auth.darwiniantools.com/api/auth",
    aud: "https://api.darwinian.dev",
    sub: "user_123",
    email,
    exp,
  })}.sig`;
}

// A complete v2 credential record far enough from expiry that resolveToken returns it
// without proactively refreshing (so the 401 is what triggers the refresh-once path).
function storedV2Credential(overrides: Partial<{ accessToken: string; expiresAt: string }> = {}) {
  return {
    version: 2 as const,
    issuer: "https://auth.darwiniantools.com/api/auth",
    clientId: "drwn-cli" as const,
    resource: "https://api.darwinian.dev",
    accessToken: overrides.accessToken ?? fakeJwt(),
    refreshToken: "refresh-1",
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 900_000).toISOString(),
    user_email: "x@y.z",
    saved_at: "2026-06-03T00:00:00Z",
  };
}

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

async function freshContext() {
  tmp = await mkdtemp(join(tmpdir(), "drwn-worker-http-"));
  return { agentsDir: tmp };
}

describe("fetchWithWorkerAuth", () => {
  test("attaches a bearer from stored credentials and returns the first response when ok", async () => {
    const context = await freshContext();
    const token = fakeJwt();
    await writeCredentials(resolveCredentialsPath(tmp!), storedV2Credential({ accessToken: token }));

    const seen: { url: string; auth: string }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen.push({ url, auth: new Headers(init?.headers).get("authorization") ?? "" });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const res = await fetchWithWorkerAuth(context, "https://deploy.test/api/minds", undefined, { fetcher, env: {} });
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ url: "https://deploy.test/api/minds", auth: `Bearer ${token}` }]);
  });

  test("retries once after a 401 by refreshing stored credentials, then succeeds", async () => {
    const context = await freshContext();
    const initialToken = fakeJwt("initial@example.com");
    const refreshedToken = fakeJwt("refreshed@example.com");
    await writeCredentials(resolveCredentialsPath(tmp!), storedV2Credential({ accessToken: initialToken }));

    const bearersSent: string[] = [];
    let refreshHits = 0;
    const fetcher = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      // The refresh-token exchange endpoint.
      if (u.pathname === "/api/auth/oauth2/token") {
        refreshHits += 1;
        return Response.json({ access_token: refreshedToken, refresh_token: "refresh-2", expires_in: 900 });
      }
      // The actual Deploy API call: 401 the first time, 200 after the refresh.
      bearersSent.push(new Headers(init?.headers).get("authorization") ?? "");
      if (bearersSent.length === 1) return new Response("unauthorized", { status: 401 });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const res = await fetchWithWorkerAuth(context, "https://deploy.test/api/minds", undefined, { fetcher, env: {} });

    expect(res.status).toBe(200);
    expect(refreshHits).toBe(1);
    // Two Deploy API attempts: the stale token, then the refreshed token.
    expect(bearersSent).toEqual([`Bearer ${initialToken}`, `Bearer ${refreshedToken}`]);
  });

  test("does not retry on 401 when the token came from env (short-circuit)", async () => {
    const context = await freshContext();
    const token = fakeJwt("env@example.com");

    let deployHits = 0;
    let refreshHits = 0;
    const fetcher = (async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/api/auth/oauth2/token") {
        refreshHits += 1;
        return Response.json({ access_token: fakeJwt("should-not-happen@example.com"), expires_in: 900 });
      }
      deployHits += 1;
      return new Response("unauthorized", { status: 401 });
    }) as unknown as typeof fetch;

    const res = await fetchWithWorkerAuth(
      context,
      "https://deploy.test/api/minds",
      undefined,
      { fetcher, env: { DRWN_TOKEN: token } },
    );

    expect(res.status).toBe(401);
    expect(deployHits).toBe(1);
    expect(refreshHits).toBe(0);
  });

  test("throws Not authenticated when no env token and no credentials", async () => {
    const context = await freshContext();
    await expect(
      fetchWithWorkerAuth(context, "https://deploy.test/api/minds", undefined, { env: {} }),
    ).rejects.toThrow("Not authenticated. Run `drwn login` first");
  });
});
