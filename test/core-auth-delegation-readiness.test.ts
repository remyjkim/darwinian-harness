// ABOUTME: Pins the management-only DAH delegation claim and token-readiness boundary.
// ABOUTME: Proves old consent never refresh-elevates and rejected refreshes never persist.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertDelegationReadyClaims,
  resolveDelegationReadyToken,
} from "../cli/core/auth/delegation-readiness";
import { readCredentials, writeCredentials, type CliDahCredentialFileV3 } from "../cli/core/auth/credentials";
import { drwnCliProfile } from "../cli/core/auth/profile";
import { resolveToken } from "../cli/core/auth/resolve-token";
import { decodeJwtClaims } from "../cli/core/auth/jwt";
import { InMemoryKeychainBackend } from "./helpers/keychain-backend";

const REQUIRED_SCOPE = "openid email offline_access dah:management.delegate";
const ID = "33333333-3333-4333-8333-333333333333";
const profile = drwnCliProfile({});
let root: string | null = null;
let backend: InMemoryKeychainBackend;

beforeEach(() => {
  backend = new InMemoryKeychainBackend();
});

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(overrides: Record<string, unknown> = {}): string {
  const iat = Math.floor(Date.now() / 1000) - 1;
  return `${b64({ alg: "none" })}.${b64({
    iss: profile.issuer,
    aud: profile.resource,
    azp: profile.clientId,
    sub: "user_123",
    scope: REQUIRED_SCOPE,
    email: "person@example.test",
    iat,
    exp: iat + 900,
    ...overrides,
  })}.sig`;
}

function credential(accessToken: string): CliDahCredentialFileV3 {
  const claims = decodeJwtClaims(accessToken);
  return {
    version: 3,
    credentialId: ID,
    generation: 1,
    issuer: profile.issuer,
    clientId: "drwn-cli",
    resource: profile.resource,
    accessToken,
    refreshToken: "refresh-1",
    issuedAt: new Date((claims.iat as number) * 1000).toISOString(),
    expiresAt: new Date((claims.exp as number) * 1000).toISOString(),
    savedAt: new Date().toISOString(),
    userEmail: "person@example.test",
  };
}

async function credentialsPath(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "drwn-delegation-"));
  return join(root, "credentials.json");
}

describe("assertDelegationReadyClaims", () => {
  test("accepts only the exact space-delimited scope set and approved identity claims", () => {
    expect(assertDelegationReadyClaims(decodeJwtClaims(token()), profile)).toMatchObject({
      azp: "drwn-cli",
      sub: "user_123",
      scope: REQUIRED_SCOPE,
    });
    expect(assertDelegationReadyClaims(
      decodeJwtClaims(token({ scope: "dah:management.delegate offline_access email openid" })),
      profile,
    )).toBeDefined();
  });

  test("rejects scp-only, duplicate, added, dropped, or malformed scope claims", () => {
    const invalid = [
      { scope: undefined, scp: REQUIRED_SCOPE.split(" ") },
      { scope: "openid email offline_access" },
      { scope: `${REQUIRED_SCOPE} extra:scope` },
      { scope: `${REQUIRED_SCOPE} openid` },
      { scope: "openid  email offline_access dah:management.delegate" },
      { scope: REQUIRED_SCOPE.split(" ") },
    ];
    for (const overrides of invalid) {
      expect(() => assertDelegationReadyClaims(decodeJwtClaims(token(overrides)), profile))
        .toThrow(expect.objectContaining({ code: "AUTH_RESPONSE_INVALID" }));
    }
  });

  test("rejects wrong azp, invalid human subject, expiry, issuer, and exact audience without leaking claims", () => {
    const sentinel = "SENTINEL_DELEGATION_CLAIM";
    const invalid = [
      { azp: "other-client" },
      { sub: "" },
      { sub: "contains whitespace" },
      { sub: "x".repeat(257) },
      { exp: Math.floor(Date.now() / 1000) },
      { exp: "never" },
      { iss: `https://${sentinel}.test/api/auth` },
      { aud: [profile.resource, `https://${sentinel}.test`] },
    ];
    for (const overrides of invalid) {
      try {
        assertDelegationReadyClaims(decodeJwtClaims(token(overrides)), profile);
        throw new Error("invalid delegation claims unexpectedly passed");
      } catch (error) {
        expect(error).toMatchObject({ code: "AUTH_RESPONSE_INVALID" });
        expect(String(error)).not.toContain(sentinel);
        expect(JSON.stringify(error)).not.toContain(sentinel);
      }
    }
  });
});

describe("resolveDelegationReadyToken", () => {
  test("accepts a ready env token without storage, refresh, or persistence", async () => {
    const accessToken = token();
    let fetches = 0;
    const result = await resolveDelegationReadyToken({
      credentialsPath: "/must/not/be/read",
      env: { DRWN_TOKEN: accessToken },
      profile,
      keychainBackend: backend,
      fetcher: (async () => { fetches += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch,
    });

    expect(result).toEqual({ token: accessToken, source: "env" });
    expect(backend.loadCalls).toBe(0);
    expect(backend.storeCalls).toBe(0);
    expect(fetches).toBe(0);
  });

  test("rejects a non-ready env token without falling back to stored credentials", async () => {
    const path = await credentialsPath();
    await writeCredentials(path, credential(token()), backend);
    const loadCalls = backend.loadCalls;

    await expect(resolveDelegationReadyToken({
      credentialsPath: path,
      env: { DRWN_TOKEN: token({ scope: "openid email offline_access" }) },
      profile,
      keychainBackend: backend,
    })).rejects.toMatchObject({ code: "AUTH_RESPONSE_INVALID" });
    expect(backend.loadCalls).toBe(loadCalls);
  });

  test("refuses old stored consent before refresh while ordinary auth remains usable", async () => {
    const path = await credentialsPath();
    const old = credential(token({ scope: undefined, azp: undefined }));
    await writeCredentials(path, old, backend);
    let fetches = 0;

    await expect(resolveDelegationReadyToken({
      credentialsPath: path,
      env: {},
      profile,
      keychainBackend: backend,
      fetcher: (async () => { fetches += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch,
    })).rejects.toMatchObject({ code: "MANAGEMENT_CONSENT_REQUIRED" });
    expect(fetches).toBe(0);
    await expect(resolveToken({
      credentialsPath: path,
      env: {},
      profile,
      keychainBackend: backend,
    })).resolves.toMatchObject({ token: old.accessToken, source: "stored" });
  });

  test("refreshes one correctly scoped expiring credential, rechecks it, and persists one generation", async () => {
    const path = await credentialsPath();
    const now = Math.floor(Date.now() / 1000);
    const current = credential(token({ iat: now - 300, exp: now + 30 }));
    const refreshedToken = token({ iat: now, exp: now + 900 });
    await writeCredentials(path, current, backend);
    let fetches = 0;

    const result = await resolveDelegationReadyToken({
      credentialsPath: path,
      env: {},
      profile,
      keychainBackend: backend,
      fetcher: (async () => {
        fetches += 1;
        return Response.json({
          access_token: refreshedToken,
          refresh_token: "refresh-2",
          expires_in: 900,
        });
      }) as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ token: refreshedToken, source: "stored", credential: { generation: 2 } });
    expect(fetches).toBe(1);
    expect(await readCredentials(path, backend)).toMatchObject({ accessToken: refreshedToken, generation: 2 });
  });

  test("does not persist a refresh scope upgrade, downgrade, or invalid ready identity", async () => {
    for (const overrides of [
      { scope: "openid email offline_access" },
      { scope: `${REQUIRED_SCOPE} extra:scope` },
      { azp: "other-client" },
    ]) {
      const path = await credentialsPath();
      const now = Math.floor(Date.now() / 1000);
      const current = credential(token({ iat: now - 300, exp: now + 30 }));
      await writeCredentials(path, current, backend);

      await expect(resolveDelegationReadyToken({
        credentialsPath: path,
        env: {},
        profile,
        keychainBackend: backend,
        fetcher: (async () => Response.json({
          access_token: token({ iat: now, exp: now + 900, ...overrides }),
          refresh_token: "candidate-secret",
          expires_in: 900,
        })) as unknown as typeof fetch,
      })).rejects.toMatchObject({ code: "AUTH_RESPONSE_INVALID" });
      expect(await readCredentials(path, backend)).toEqual(current);
      await rm(root!, { recursive: true, force: true });
      root = null;
      backend = new InMemoryKeychainBackend();
    }
  });
});
