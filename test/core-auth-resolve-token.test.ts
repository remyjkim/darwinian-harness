// ABOUTME: Verifies bearer-token resolution from non-persistent env auth or strict v3 custody.
// ABOUTME: Proves stored transport aliases are gone and refresh preserves the v3 credential epoch.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readCredentials as readCredentialsFromStore,
  writeCredentials as writeCredentialsToStore,
  type CliDahCredentialFileV3,
} from "../cli/core/auth/credentials";
import { drwnCliProfile } from "../cli/core/auth/profile";
import {
  refreshStoredCredential as refreshStoredCredentialFromStore,
  refreshStoredCredentialTransaction as refreshStoredCredentialTransactionFromStore,
  resolveToken as resolveTokenFromStore,
} from "../cli/core/auth/resolve-token";
import { InMemoryKeychainBackend } from "./helpers/keychain-backend";

let tmp: string | null = null;
let backend: InMemoryKeychainBackend;

beforeEach(() => {
  backend = new InMemoryKeychainBackend();
});

function readCredentials(path: string) {
  return readCredentialsFromStore(path, backend);
}

function writeCredentials(path: string, credential: CliDahCredentialFileV3) {
  return writeCredentialsToStore(path, credential, backend);
}

function resolveToken(input: Parameters<typeof resolveTokenFromStore>[0]) {
  return resolveTokenFromStore({ ...input, keychainBackend: backend });
}

function refreshStoredCredential(input: Parameters<typeof refreshStoredCredentialFromStore>[0]) {
  return refreshStoredCredentialFromStore({ ...input, keychainBackend: backend });
}

function refreshStoredCredentialTransaction(
  input: Parameters<typeof refreshStoredCredentialTransactionFromStore>[0],
) {
  return refreshStoredCredentialTransactionFromStore({ ...input, keychainBackend: backend });
}

const ISSUER = "https://auth.darwinian.dev/api/auth";
const RESOURCE = "https://api.darwinian.dev";
const ID = "33333333-3333-4333-8333-333333333333";

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function jwtWithClaims(claims: Record<string, unknown>): string {
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

function fakeJwt(options: {
  email?: string;
  iat?: number;
  exp?: number;
  audience?: string;
  issuer?: string;
} = {}): string {
  const iat = options.iat ?? Math.floor(Date.now() / 1000) - 1;
  const exp = options.exp ?? iat + 900;
  return `${b64({ alg: "none" })}.${b64({
    iss: options.issuer ?? ISSUER,
    aud: options.audience ?? RESOURCE,
    sub: "user_123",
    email: options.email ?? "x@y.z",
    iat,
    exp,
  })}.sig`;
}

function storedCredential(overrides: Partial<CliDahCredentialFileV3> = {}): CliDahCredentialFileV3 {
  const accessToken = overrides.accessToken ?? fakeJwt();
  const claims = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8")) as {
    iat: number;
    exp: number;
  };
  return {
    version: 3,
    credentialId: ID,
    generation: 1,
    issuer: ISSUER,
    clientId: "drwn-cli",
    resource: RESOURCE,
    accessToken,
    refreshToken: "refresh-1",
    issuedAt: new Date(claims.iat * 1000).toISOString(),
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    savedAt: "2026-08-08T00:00:00.000Z",
    userEmail: "x@y.z",
    ...overrides,
  };
}

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("resolveToken", () => {
  test("returns validated DRWN_TOKEN without reading or writing an invalid stored credential", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    await Bun.write(credentialsPath, "invalid-envelope");
    const before = await Bun.file(credentialsPath).text();
    const token = fakeJwt({ email: "env@example.test" });

    const result = await resolveToken({
      credentialsPath,
      env: { DRWN_TOKEN: token, DRWN_ANALYZER_URL: "https://must-not-enter-auth-result.test" },
    });

    expect(result).toEqual({ token, source: "env" });
    expect(await Bun.file(credentialsPath).text()).toBe(before);
  });

  test("requires DRWN_TOKEN to carry the configured issuer and a safe future expiry", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const base = { iss: ISSUER, aud: RESOURCE, exp: nowSeconds + 900 };
    const invalidClaims = [
      { ...base, exp: undefined },
      { ...base, exp: String(nowSeconds + 900) },
      { ...base, exp: Number.MAX_SAFE_INTEGER + 1 },
      { ...base, exp: nowSeconds },
      { ...base, iss: "https://wrong-issuer.test/api/auth" },
    ];

    for (const claims of invalidClaims) {
      await expect(resolveToken({
        credentialsPath: "/no/such/path",
        env: { DRWN_TOKEN: jwtWithClaims(claims) },
      })).rejects.toThrow();
    }
    const token = jwtWithClaims(base);
    await expect(resolveToken({
      credentialsPath: "/no/such/path",
      env: { DRWN_TOKEN: token },
    })).resolves.toEqual({ token, source: "env" });
  });

  test("returns a non-expiring-soon v3 stored bearer without transport configuration", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const credential = storedCredential();
    await writeCredentials(credentialsPath, credential);

    const result = await resolveToken({
      credentialsPath,
      env: { DRWN_ANALYZER_URL: "https://analyzer.test" },
    });

    expect(result).toEqual({ token: credential.accessToken, source: "stored", credential });
    expect("apiUrl" in result!).toBe(false);
  });

  test("returns null only when neither env nor stored credentials exist", async () => {
    expect(await resolveToken({ credentialsPath: "/no/such/path", env: {} })).toBeNull();
  });

  test("fails a stored public-profile mismatch before token use", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const staging = "https://api-staging-main.darwinian.dev";
    await writeCredentials(credentialsPath, storedCredential({
      resource: staging,
      accessToken: fakeJwt({ audience: staging }),
    }));

    await expect(resolveToken({ credentialsPath, env: {} })).rejects.toThrow(
      `Stored credentials target ${staging}; run \`drwn login\` again for ${RESOURCE}.`,
    );
  });

  test("accepts a stored non-production profile only when the explicit profile override matches", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const staging = "https://api-staging-main.darwinian.dev";
    const accessToken = fakeJwt({ audience: staging });
    await writeCredentials(credentialsPath, storedCredential({ resource: staging, accessToken }));

    const result = await resolveToken({
      credentialsPath,
      env: { DRWN_DAH_RESOURCE: staging },
    });

    expect(result).toMatchObject({ token: accessToken, source: "stored" });
  });

  test("refreshes an expiring v3 credential while preserving ID and advancing generation once", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const expiringToken = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 30 });
    await writeCredentials(credentialsPath, storedCredential({ accessToken: expiringToken }));
    const refreshedToken = fakeJwt({ email: "fresh@example.test" });

    const result = await resolveToken({
      credentialsPath,
      env: {},
      fetcher: (async () => Response.json({
        access_token: refreshedToken,
        refresh_token: "refresh-2",
        expires_in: 900,
      })) as unknown as typeof fetch,
    });

    expect(result?.credential).toMatchObject({
      version: 3,
      credentialId: ID,
      generation: 2,
      accessToken: refreshedToken,
      refreshToken: "refresh-2",
      userEmail: "fresh@example.test",
    });
    expect(result?.credential).toBeDefined();
    expect(await readCredentials(credentialsPath)).toEqual(result!.credential!);
  });

  test("the shared refresh transaction always refreshes a fresh credential and advances only after persistence", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    const refreshedToken = fakeJwt({ email: "forced@example.test" });
    let refreshRequests = 0;
    const writes: number[] = [];

    const result = await refreshStoredCredentialTransaction({
      credentialsPath,
      credential: current,
      profile: drwnCliProfile({}),
      fetcher: (async () => {
        refreshRequests += 1;
        return Response.json({
          access_token: refreshedToken,
          refresh_token: "refresh-2",
          expires_in: 900,
        });
      }) as unknown as typeof fetch,
      writeCredential: async (path, credential) => {
        writes.push(credential.generation);
        await writeCredentials(path, credential);
      },
    });

    expect(refreshRequests).toBe(1);
    expect(writes).toEqual([2]);
    expect(result).toMatchObject({
      outcome: "succeeded",
      credential: { credentialId: ID, generation: 2, accessToken: refreshedToken },
      remote: { action: "refresh", result: "confirmed", httpClass: "2xx" },
      local: { action: "write", result: "confirmed", afterConfirmedRemoteRevoke: false },
      reason: null,
    });
    if (result.outcome !== "succeeded") throw new Error("refresh transaction unexpectedly failed");
    expect(await readCredentials(credentialsPath)).toEqual(result.credential);
  });

  test("profile mismatch is a safely identified no-request/no-write failure", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    let requests = 0;
    let writes = 0;

    const result = await refreshStoredCredentialTransaction({
      credentialsPath,
      credential: current,
      profile: drwnCliProfile({ DRWN_DAH_RESOURCE: "https://api-staging-main.darwinian.dev" }),
      fetcher: (async () => {
        requests += 1;
        return Response.json({});
      }) as unknown as typeof fetch,
      writeCredential: async () => { writes += 1; },
    });

    expect(requests).toBe(0);
    expect(writes).toBe(0);
    expect(result).toEqual({
      outcome: "failed",
      credential: {
        credentialId: current.credentialId,
        generation: current.generation,
        issuer: current.issuer,
        clientId: current.clientId,
        resource: current.resource,
        issuedAt: current.issuedAt,
        expiresAt: current.expiresAt,
      },
      remote: { action: "refresh", result: "not_applicable", httpClass: "not_applicable" },
      local: { action: "write", result: "not_performed", afterConfirmedRemoteRevoke: false },
      reason: "CREDENTIAL_PROFILE_MISMATCH",
    });
    expect(await readCredentials(credentialsPath)).toEqual(current);
  });

  test("a write failure after confirmed exchange retains the local epoch and reports no false advancement", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    const refreshedToken = fakeJwt({ email: "rotated@example.test" });

    const result = await refreshStoredCredentialTransaction({
      credentialsPath,
      credential: current,
      profile: drwnCliProfile({}),
      fetcher: (async () => Response.json({
        access_token: refreshedToken,
        refresh_token: "rotated-refresh-token",
        expires_in: 900,
      })) as unknown as typeof fetch,
      writeCredential: async () => { throw new Error("SENTINEL_WRITE_FAILURE_239"); },
    });

    expect(result).toEqual({
      outcome: "failed",
      credential: {
        credentialId: current.credentialId,
        generation: current.generation,
        issuer: current.issuer,
        clientId: current.clientId,
        resource: current.resource,
        issuedAt: current.issuedAt,
        expiresAt: current.expiresAt,
      },
      remote: { action: "refresh", result: "confirmed", httpClass: "2xx" },
      local: { action: "write", result: "failed", afterConfirmedRemoteRevoke: false },
      reason: "CREDENTIAL_WRITE_FAILED",
    });
    expect(JSON.stringify(result)).not.toContain("rotated-refresh-token");
    expect(JSON.stringify(result)).not.toContain(current.refreshToken);
    expect(JSON.stringify(result)).not.toContain(current.accessToken);
    expect(JSON.stringify(result)).not.toContain("SENTINEL_WRITE_FAILURE_239");
    expect(await readCredentials(credentialsPath)).toEqual(current);
  });

  test("remote failures retain the local epoch and expose only sanitized classification", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    const sentinel = "SENTINEL_REMOTE_REFRESH_BODY_239";

    const result = await refreshStoredCredentialTransaction({
      credentialsPath,
      credential: current,
      profile: drwnCliProfile({}),
      fetcher: (async () => new Response(sentinel, { status: 503 })) as unknown as typeof fetch,
    });

    expect(result).toEqual({
      outcome: "failed",
      credential: {
        credentialId: current.credentialId,
        generation: current.generation,
        issuer: current.issuer,
        clientId: current.clientId,
        resource: current.resource,
        issuedAt: current.issuedAt,
        expiresAt: current.expiresAt,
      },
      remote: { action: "refresh", result: "indeterminate", httpClass: "5xx" },
      local: { action: "write", result: "not_performed", afterConfirmedRemoteRevoke: false },
      reason: "AUTH_REMOTE_INDETERMINATE",
    });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify(result)).not.toContain(current.refreshToken);
    expect(JSON.stringify(result)).not.toContain(current.accessToken);
    expect(await readCredentials(credentialsPath)).toEqual(current);
  });

  test("automatic refresh errors retain classification but no credential secrets", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);

    try {
      await refreshStoredCredential({
        credentialsPath,
        credential: current,
        profile: drwnCliProfile({}),
        fetcher: (async () => new Response("SENTINEL_REMOTE_BODY_239", { status: 503 })) as unknown as typeof fetch,
      });
      throw new Error("refresh unexpectedly succeeded");
    } catch (error) {
      expect(error).toMatchObject({ code: "AUTH_REMOTE_INDETERMINATE" });
      expect(JSON.stringify(error)).not.toContain(current.refreshToken);
      expect(JSON.stringify(error)).not.toContain(current.accessToken);
      expect(JSON.stringify(error)).not.toContain("SENTINEL_REMOTE_BODY_239");
    }
  });

  test("does not honor the retired IMINDS_TOKEN name", async () => {
    expect(await resolveToken({
      credentialsPath: "/no/such/path",
      env: { IMINDS_TOKEN: fakeJwt() },
    })).toBeNull();
  });
});
