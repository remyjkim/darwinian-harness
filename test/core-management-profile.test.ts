// ABOUTME: Pins strict whole-tuple cloud profile selection for deployed Worker management.
// ABOUTME: Rejects partial endpoints and unsafe local profile files before credential access.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { managementContract } from "../cli/core/management/contracts";
import { resolveCloudProfile } from "../cli/core/management/profile";

const REQUIRED_SCOPES = [
  "openid",
  "email",
  "offline_access",
  "dah:management.delegate",
] as const;

let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

async function tempRoot(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "drwn-cloud-profile-"));
  return root;
}

function localProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profileId: "local",
    apiOrigin: "https://api.localhost.test",
    webOrigin: "https://foundry.localhost.test",
    authHubOrigin: "https://auth.localhost.test",
    issuer: "https://auth.localhost.test/api/auth",
    resource: "https://api.localhost.test",
    clientId: "drwn-cli",
    requestedScopes: [...REQUIRED_SCOPES],
    ...overrides,
  };
}

async function writeLocalProfile(value: unknown, name = "profile.json"): Promise<string> {
  const path = join(await tempRoot(), name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

describe("resolveCloudProfile", () => {
  test("resolves the exact admitted production tuple by default with a separate canonical digest", () => {
    const profile = resolveCloudProfile({});

    expect(profile).toMatchObject(managementContract.profiles.production);
    expect(profile.profileId).toBe("production");
    expect(profile.profileDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(profile.profileDigest).not.toBe(profile.profileId);
  });

  test("resolves the exact admitted staging tuple only through the whole-profile selector", () => {
    const profile = resolveCloudProfile({ DRWN_CLOUD_PROFILE: "staging" });

    expect(profile).toMatchObject(managementContract.profiles.staging);
    expect(profile.profileDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(profile.profileDigest).not.toBe(resolveCloudProfile({}).profileDigest);
  });

  test("requires local to use one absolute strict file and derives a formatting-independent digest", async () => {
    const directory = await tempRoot();
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    await writeFile(first, JSON.stringify(localProfile()));
    await writeFile(second, JSON.stringify(localProfile(), null, 2));

    const a = resolveCloudProfile({ DRWN_CLOUD_PROFILE: "local", DRWN_CLOUD_PROFILE_FILE: first });
    const b = resolveCloudProfile({ DRWN_CLOUD_PROFILE: "local", DRWN_CLOUD_PROFILE_FILE: second });

    expect(a).toMatchObject(localProfile());
    expect(a.profileDigest).toBe(b.profileDigest);
  });

  test("rejects retired partial endpoint variables instead of silently mixing tuples", () => {
    for (const key of [
      "DRWN_DAH_HUB_URL",
      "DRWN_DAH_RESOURCE",
      "DRWN_STUDIO_API_URL",
      "DRWN_STUDIO_WEB_URL",
    ]) {
      expect(() => resolveCloudProfile({ [key]: "https://partial.example" }), key)
        .toThrow(expect.objectContaining({ code: "CLOUD_PROFILE_INVALID" }));
    }
  });

  test("rejects unsupported selectors and profile files outside the local selector", async () => {
    const path = await writeLocalProfile(localProfile());
    expect(() => resolveCloudProfile({ DRWN_CLOUD_PROFILE: "preview" }))
      .toThrow(expect.objectContaining({ code: "CLOUD_PROFILE_INVALID" }));
    expect(() => resolveCloudProfile({ DRWN_CLOUD_PROFILE_FILE: path }))
      .toThrow(expect.objectContaining({ code: "CLOUD_PROFILE_INVALID" }));
    expect(() => resolveCloudProfile({ DRWN_CLOUD_PROFILE: "production", DRWN_CLOUD_PROFILE_FILE: path }))
      .toThrow(expect.objectContaining({ code: "CLOUD_PROFILE_INVALID" }));
    expect(() => resolveCloudProfile({ DRWN_CLOUD_PROFILE: "local", DRWN_CLOUD_PROFILE_FILE: "profile.json" }))
      .toThrow(expect.objectContaining({ code: "CLOUD_PROFILE_INVALID" }));
  });

  test("rejects missing, non-regular, symlinked, empty, and oversized local files", async () => {
    const directory = await tempRoot();
    const missing = join(directory, "missing.json");
    const childDirectory = join(directory, "directory");
    const target = join(directory, "target.json");
    const link = join(directory, "link.json");
    const empty = join(directory, "empty.json");
    const oversized = join(directory, "oversized.json");
    await mkdir(childDirectory);
    await writeFile(target, JSON.stringify(localProfile()));
    await symlink(target, link);
    await writeFile(empty, "");
    await writeFile(oversized, "x".repeat(65_537));

    for (const path of [missing, childDirectory, link, empty, oversized]) {
      expect(() => resolveCloudProfile({ DRWN_CLOUD_PROFILE: "local", DRWN_CLOUD_PROFILE_FILE: path }), path)
        .toThrow(expect.objectContaining({ code: "CLOUD_PROFILE_INVALID" }));
    }
  });

  test("rejects unknown fields, insecure origins, malformed tuples, and raw file content leakage", async () => {
    const invalidProfiles = [
      localProfile({ sentinelSecret: "SENTINEL_PROFILE_SECRET" }),
      localProfile({ apiOrigin: "http://api.localhost.test" }),
      localProfile({ webOrigin: "https://foundry.localhost.test/path" }),
      localProfile({ issuer: "https://different.localhost.test/api/auth" }),
      localProfile({ requestedScopes: REQUIRED_SCOPES.slice(0, 3) }),
      localProfile({ clientId: "other-client" }),
    ];

    for (let index = 0; index < invalidProfiles.length; index += 1) {
      const path = join(await tempRoot(), `invalid-${index}.json`);
      await writeFile(path, JSON.stringify(invalidProfiles[index]));
      try {
        resolveCloudProfile({ DRWN_CLOUD_PROFILE: "local", DRWN_CLOUD_PROFILE_FILE: resolve(path) });
        throw new Error("invalid profile unexpectedly resolved");
      } catch (error) {
        expect(error).toMatchObject({ code: "CLOUD_PROFILE_INVALID" });
        expect(String(error)).not.toContain("SENTINEL_PROFILE_SECRET");
        expect(JSON.stringify(error)).not.toContain("SENTINEL_PROFILE_SECRET");
      }
      await rm(root!, { recursive: true, force: true });
      root = null;
    }
  });
});
