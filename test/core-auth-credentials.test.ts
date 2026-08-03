// ABOUTME: Verifies drwn analyzer credential storage semantics.
// ABOUTME: Protects atomic writes, owner-only permissions, and tolerant reads.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteCredentials,
  readCredentials,
  writeCredentials,
  type DrwnCredentials,
} from "../cli/core/auth/credentials";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

const sample: DrwnCredentials = {
  api_url: "https://api.test",
  access_token: "tok",
  user_email: "x@y.z",
  saved_at: "2026-06-03T00:00:00Z",
};

const dahSample = {
  version: 2 as const,
  issuer: "https://auth.darwiniantools.com/api/auth",
  clientId: "drwn-cli" as const,
  resource: "https://api.darwinian.dev",
  accessToken: "h.payload.s",
  refreshToken: "refresh",
  expiresAt: "2026-06-03T00:15:00Z",
  user_email: "x@y.z",
  saved_at: "2026-06-03T00:00:00Z",
};

describe("credentials", () => {
  test("writeCredentials encrypts at rest with mode 0600 and round-trips", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, dahSample);
    const s = await stat(path);
    expect((s.mode & 0o777).toString(8)).toBe("600");

    const onDisk = await readFile(path, "utf8");
    expect(onDisk).not.toContain(dahSample.refreshToken);
    expect(JSON.parse(onDisk).algo).toBe("aes-256-gcm");

    expect(await readCredentials(path)).toEqual(dahSample);
  });

  test("writeCredentials round-trips a legacy v1 credential and readCredentials returns it", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, sample);
    expect(await readCredentials(path)).toEqual(sample);
  });

  test("readCredentials returns null when missing", async () => {
    expect(await readCredentials("/no/such/path.json")).toBeNull();
  });

  test("readCredentials returns null when malformed", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await Bun.write(path, "{ not json");
    expect(await readCredentials(path)).toBeNull();
  });

  test("deleteCredentials is a no-op when missing", async () => {
    await expect(deleteCredentials("/no/such/path.json")).resolves.toBeUndefined();
  });

  test("deleteCredentials removes existing file", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, dahSample);
    await deleteCredentials(path);
    expect(await readCredentials(path)).toBeNull();
  });

  test("writeCredentials is atomic and leaves no temp file after success", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, dahSample);
    const files = await readdir(tmp);
    expect(files.filter((f) => f.includes("tmp"))).toEqual([]);
    expect(files).toContain("credentials.json");
  });
});
