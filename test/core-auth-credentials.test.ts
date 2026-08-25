// ABOUTME: Verifies strict v3 DAH credential storage and hard rejection of every earlier payload.
// ABOUTME: Protects JWT-bound timestamps, atomic owner-only writes, and fail-closed encrypted reads.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteCredentials as deleteCredentialsFromStore,
  readCredentials as readCredentialsFromStore,
  writeCredentials as writeCredentialsToStore,
  type CliDahCredentialFileV3,
} from "../cli/core/auth/credentials";
import { CredentialSchemaUnsupportedError, encryptToDisk } from "../cli/core/secret-store";
import { InMemoryKeychainBackend } from "./helpers/keychain-backend";

let tmp: string | null = null;
let backend: InMemoryKeychainBackend;

beforeEach(() => {
  backend = new InMemoryKeychainBackend();
});

function readCredentials(path: string, selectedBackend = backend) {
  return readCredentialsFromStore(path, selectedBackend);
}

function writeCredentials(path: string, value: CliDahCredentialFileV3, selectedBackend = backend) {
  return writeCredentialsToStore(path, value, selectedBackend);
}

function deleteCredentials(path: string, selectedBackend = backend) {
  return deleteCredentialsFromStore(path, selectedBackend);
}

const ISSUER = "https://auth.darwinian.dev/api/auth";
const RESOURCE = "https://api.darwinian.dev";
const IAT = 1_786_080_000;
const EXP = IAT + 900;

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(overrides: Record<string, unknown> = {}): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: ISSUER,
    aud: RESOURCE,
    sub: "user_123",
    email: "x@y.z",
    iat: IAT,
    exp: EXP,
    ...overrides,
  })}.sig`;
}

function credential(overrides: Partial<CliDahCredentialFileV3> = {}): CliDahCredentialFileV3 {
  return {
    version: 3,
    credentialId: "11111111-1111-4111-8111-111111111111",
    generation: 1,
    issuer: ISSUER,
    clientId: "drwn-cli",
    resource: RESOURCE,
    accessToken: fakeJwt(),
    refreshToken: "refresh",
    issuedAt: new Date(IAT * 1000).toISOString(),
    expiresAt: new Date(EXP * 1000).toISOString(),
    savedAt: "2026-08-08T00:00:00.000Z",
    userEmail: "x@y.z",
    ...overrides,
  };
}

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("credentials", () => {
  test("injected credential backends cannot cross-read, overwrite, or delete custody", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-isolation-"));
    const firstPath = join(tmp, "first", "credentials.json");
    const secondPath = join(tmp, "second", "credentials.json");
    const first = new InMemoryKeychainBackend();
    const second = new InMemoryKeychainBackend();
    const initial = credential();
    const other = credential({
      credentialId: "22222222-2222-4222-8222-222222222222",
      refreshToken: "other-refresh",
    });

    await writeCredentials(firstPath, initial, first);
    await writeCredentials(secondPath, other, second);
    await expect(readCredentials(firstPath, second)).rejects.toThrow("integrity verification");

    await writeCredentials(secondPath, { ...other, refreshToken: "other-refresh-replaced" }, second);
    expect(await readCredentials(firstPath, first)).toEqual(initial);

    await deleteCredentials(secondPath, second);
    expect(first.hasKey()).toBe(true);
    expect(second.hasKey()).toBe(false);
    expect(await readCredentials(firstPath, first)).toEqual(initial);
  });

  test("writes one exact v3 payload at mode 0600 and round-trips it", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    const sample = credential();
    await writeCredentials(path, sample);

    const s = await stat(path);
    expect((s.mode & 0o777).toString(8)).toBe("600");
    const onDisk = await readFile(path, "utf8");
    expect(onDisk).not.toContain(sample.refreshToken);
    expect(JSON.parse(onDisk).algo).toBe("aes-256-gcm");
    expect(await readCredentials(path)).toEqual(sample);
  });

  test("rejects pre-DAH, v2, malformed plaintext, and unknown v3 fields through the encrypted boundary", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    const unsupported = [
      { api_url: "https://legacy.test", access_token: "token", user_email: "x@y.z", saved_at: "2026-01-01" },
      {
        version: 2,
        issuer: ISSUER,
        clientId: "drwn-cli",
        resource: RESOURCE,
        accessToken: fakeJwt(),
        refreshToken: "refresh",
        expiresAt: new Date(EXP * 1000).toISOString(),
        user_email: "x@y.z",
        saved_at: "2026-01-01T00:00:00.000Z",
      },
      "not-json",
      JSON.stringify({ ...credential(), compatibility: true }),
    ];

    for (const value of unsupported) {
      await encryptToDisk(path, typeof value === "string" ? value : JSON.stringify(value), backend);
      await expect(readCredentials(path)).rejects.toMatchObject({
        name: "CredentialSchemaUnsupportedError",
        code: "CREDENTIAL_SCHEMA_UNSUPPORTED",
      });
    }
  });

  test("rejects invalid UUID, generation, timestamps, profile, and JWT coherence", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    const invalid: Array<Record<string, unknown>> = [
      { ...credential(), credentialId: "not-a-uuid" },
      { ...credential(), generation: 0 },
      { ...credential(), generation: 1.5 },
      { ...credential(), clientId: "other-client" },
      { ...credential(), issuedAt: "2026-08-08T00:00:00Z" },
      { ...credential(), expiresAt: "not-a-date" },
      { ...credential(), savedAt: "2026-08-08T00:00:00Z" },
      { ...credential(), accessToken: fakeJwt({ iat: IAT + 1 }) },
      { ...credential(), accessToken: fakeJwt({ exp: EXP + 1 }) },
      { ...credential(), accessToken: fakeJwt({ aud: "https://wrong.test" }) },
      { ...credential(), accessToken: fakeJwt({ iss: "https://wrong.test" }) },
    ];

    for (const value of invalid) {
      await encryptToDisk(path, JSON.stringify(value), backend);
      await expect(readCredentials(path)).rejects.toBeInstanceOf(CredentialSchemaUnsupportedError);
    }
  });

  test("returns null only when the credential envelope is absent", async () => {
    expect(await readCredentials("/no/such/path.json")).toBeNull();
  });

  test("rejects a malformed encrypted envelope", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await Bun.write(path, "{ not json");
    await expect(readCredentials(path)).rejects.toBeInstanceOf(CredentialSchemaUnsupportedError);
  });

  test("deleteCredentials is a no-op when missing", async () => {
    await expect(deleteCredentials("/no/such/path.json")).resolves.toBeUndefined();
  });

  test("deleteCredentials removes an existing v3 file", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, credential());
    await deleteCredentials(path);
    expect(await readCredentials(path)).toBeNull();
  });

  test("writeCredentials is atomic and leaves no temp file after success", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, credential());
    const files = await readdir(tmp);
    expect(files.filter((file) => file.includes("tmp"))).toEqual([]);
    expect(files).toContain("credentials.json");
  });
});
