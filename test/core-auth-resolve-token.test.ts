// ABOUTME: Verifies bearer-token resolution precedence for authenticated CLI commands.
// ABOUTME: Keeps CI env-var auth isolated from persisted local credentials.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCredentials } from "../cli/core/auth/credentials";
import { resolveToken } from "../cli/core/auth/resolve-token";

let tmp: string | null = null;

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(
  email = "x@y.z",
  exp = Math.floor(Date.now() / 1000) + 900,
  audience = "https://api.darwinian.dev",
  issuer = "https://auth.darwinian.dev/api/auth",
): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: issuer,
    aud: audience,
    sub: "user_123",
    email,
    exp,
  })}.sig`;
}

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("resolveToken", () => {
  test("returns env-var token when DRWN_TOKEN + DRWN_ANALYZER_URL set", async () => {
    const result = await resolveToken({
      credentialsPath: "/no/such/path",
      env: { DRWN_TOKEN: fakeJwt(), DRWN_ANALYZER_URL: "https://api.test" },
    });
    expect(result).toMatchObject({ source: "env", apiUrl: "https://api.test" });
  });

  test("returns env token without requiring analyzer URL", async () => {
    const result = await resolveToken({
      credentialsPath: "/no/such/path",
      env: { DRWN_TOKEN: fakeJwt() },
    });
    expect(result).toMatchObject({ source: "env" });
  });

  test("returns stored credential when env vars absent", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: "https://auth.darwinian.dev/api/auth",
      clientId: "drwn-cli",
      resource: "https://api.darwinian.dev",
      accessToken: fakeJwt(),
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "x@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });
    const result = await resolveToken({ credentialsPath, env: {} });
    expect(result).toMatchObject({ source: "stored" });
  });

  test("returns stored legacy credential api_url when env vars are absent", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    await writeCredentials(credentialsPath, {
      api_url: "https://legacy-api.test",
      access_token: fakeJwt(),
      user_email: "legacy@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });
    const result = await resolveToken({ credentialsPath, env: {} });
    expect(result).toMatchObject({
      source: "stored",
      token: fakeJwt(),
      apiUrl: "https://legacy-api.test",
    });
  });

  test("env DRWN_ANALYZER_URL overrides stored legacy credential api_url", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    await writeCredentials(credentialsPath, {
      api_url: "https://legacy-api.test",
      access_token: fakeJwt(),
      user_email: "legacy@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });
    const result = await resolveToken({ credentialsPath, env: { DRWN_ANALYZER_URL: "https://env-api.test" } });
    expect(result).toMatchObject({ apiUrl: "https://env-api.test" });
  });

  test("returns null when no env vars and no credentials", async () => {
    const result = await resolveToken({ credentialsPath: "/no/such/path", env: {} });
    expect(result).toBeNull();
  });

  test("asks for a fresh login when stored credentials target another resource", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: "https://auth.darwinian.dev/api/auth",
      clientId: "drwn-cli",
      resource: "https://api-staging-main.darwinian.dev",
      accessToken: fakeJwt("staging@example.com", undefined, "https://api-staging-main.darwinian.dev"),
      refreshToken: "refresh-staging",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "staging@example.com",
      saved_at: "2026-06-03T00:00:00Z",
    });

    await expect(resolveToken({ credentialsPath, env: {} }))
      .rejects.toThrow("Stored credentials target https://api-staging-main.darwinian.dev; run `drwn login` again for https://api.darwinian.dev.");
  });

  test("asks for a fresh login when stored credentials came from the retired hub", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const retiredIssuer = "https://auth.darwiniantools.com/api/auth";
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: retiredIssuer,
      clientId: "drwn-cli",
      resource: "https://api.darwinian.dev",
      accessToken: fakeJwt("legacy@example.com", undefined, undefined, retiredIssuer),
      refreshToken: "refresh-legacy",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "legacy@example.com",
      saved_at: "2026-06-03T00:00:00Z",
    });

    await expect(resolveToken({ credentialsPath, env: {} })).rejects.toThrow(
      "Stored credentials were issued by https://auth.darwiniantools.com/api/auth; run `drwn login` again for https://auth.darwinian.dev/api/auth.",
    );
  });

  test("uses a non-production credential when the explicit resource override matches", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    const stagingToken = fakeJwt("staging@example.com", undefined, "https://api-staging-main.darwinian.dev");
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: "https://auth.darwinian.dev/api/auth",
      clientId: "drwn-cli",
      resource: "https://api-staging-main.darwinian.dev",
      accessToken: stagingToken,
      refreshToken: "refresh-staging",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "staging@example.com",
      saved_at: "2026-06-03T00:00:00Z",
    });

    const result = await resolveToken({
      credentialsPath,
      env: { DRWN_DAH_RESOURCE: "https://api-staging-main.darwinian.dev" },
    });

    expect(result).toMatchObject({ token: stagingToken, source: "stored" });
  });

  test("does not honor the retired IMINDS_TOKEN name", async () => {
    const result = await resolveToken({
      credentialsPath: "/no/such/path",
      env: { IMINDS_TOKEN: fakeJwt() },
    });

    expect(result).toBeNull();
  });
});
