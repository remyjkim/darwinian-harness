// ABOUTME: Verifies bearer-token resolution from non-persistent env auth or strict v3 custody.
// ABOUTME: Proves stored transport aliases are gone and refresh preserves the v3 credential epoch.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCredentials, writeCredentials, type CliDahCredentialFileV3 } from "../cli/core/auth/credentials";
import { resolveToken } from "../cli/core/auth/resolve-token";

let tmp: string | null = null;

const ISSUER = "https://auth.darwinian.dev/api/auth";
const RESOURCE = "https://api.darwinian.dev";
const ID = "33333333-3333-4333-8333-333333333333";

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
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

  test("does not honor the retired IMINDS_TOKEN name", async () => {
    expect(await resolveToken({
      credentialsPath: "/no/such/path",
      env: { IMINDS_TOKEN: fakeJwt() },
    })).toBeNull();
  });
});
