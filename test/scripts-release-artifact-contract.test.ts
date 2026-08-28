// ABOUTME: Proves release qualification binds required members and measured tar bytes to one build tuple.
// ABOUTME: Locks clean-prefix installed smokes to the installed bin and side-effect quarantine.

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import {
  REQUIRED_RELEASE_MEMBERS,
  SAFE_INSTALLED_SMOKES,
  qualifyPackageMembers,
  qualifyPackedArtifact,
  requalifyReceivedArtifact,
  runInstalledArtifactSmokes,
  verifyPublishedRegistryIdentity,
  type ReleaseCommandRunner,
} from "../scripts/release/artifact-contract";

const SOURCE_COMMIT = "a".repeat(40);
const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "drwn-i239-artifact-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function packJson(bytes: Buffer, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify([{
    id: "darwinian@1.4.2",
    name: "darwinian",
    version: "1.4.2",
    filename: "darwinian-1.4.2.tgz",
    size: bytes.length,
    shasum: createHash("sha1").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    files: REQUIRED_RELEASE_MEMBERS.map((path) => ({ path, size: 1, mode: 0o644 })),
    ...overrides,
  }]);
}

describe("release package member qualification", () => {
  test("requires the D45 bundle and hidden I321 qualification authorities in the tar", () => {
    for (const member of [
      "cli/core/management/deployment-bundle.ts",
      "cli/core/management/staging-community-qualification.ts",
      "cli/core/management/phase-a.ts",
      "cli/commands/internal/qualify-staging-community.ts",
      "cli/generated/dah-staging-slot-community-contract-lock.json",
      "cli/generated/dah-cli-management-phase-a-lock.json",
      "registry/contracts/staging-slot-community.v1/contract.json",
      "registry/contracts/cli-management-phase-a.v1/contract.json",
      "registry/contracts/cli-management-phase-a.v1/executor.mjs",
      "registry/contracts/cli-management-phase-a.v1/manifest.json",
    ]) expect(REQUIRED_RELEASE_MEMBERS as readonly string[]).toContain(member);
  });

  test("accepts every required source member plus generated build identity", () => {
    expect(qualifyPackageMembers([...REQUIRED_RELEASE_MEMBERS])).toEqual([...REQUIRED_RELEASE_MEMBERS]);
  });

  test("rejects each required member independently", () => {
    for (const required of REQUIRED_RELEASE_MEMBERS) {
      expect(() => qualifyPackageMembers(REQUIRED_RELEASE_MEMBERS.filter((path) => path !== required))).toThrow(required);
    }
  });

  test("rejects old version-only package bytes even when their version smoke can succeed", () => {
    const oldPublishedPackage = {
      versionOutput: "1.1.0",
      members: ["cli/index.ts", "package.json", "registry/config.json"],
    };
    expect(oldPublishedPackage.versionOutput).toBe("1.1.0");
    expect(() => qualifyPackageMembers(oldPublishedPackage.members)).toThrow("missing required member");
  });

  test.each([
    ".env",
    "nested/.env",
    "nested/.env.production",
    ".ai/tasks/secret.md",
    "test/release.test.ts",
    "scripts/private-release.ts",
    ".agents/drwn/config.json",
    "config.json",
    "mcp-servers.json",
    ".drwn.secrets",
    ".npmrc",
    "credentials.json",
    "../outside",
    "/absolute/path",
    "nested\\windows-path",
  ])("rejects forbidden package state %s", (path) => {
    expect(() => qualifyPackageMembers([...REQUIRED_RELEASE_MEMBERS, path])).toThrow();
  });
});

describe("packed artifact measurement", () => {
  test("requalifies a downloaded tar from measured receipt fields without trusting original pack output", async () => {
    const root = await tempRoot();
    const packageRoot = join(root, "package");
    for (const member of REQUIRED_RELEASE_MEMBERS) {
      const path = join(packageRoot, member);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, member === "cli/generated/build-identity.json"
        ? JSON.stringify({
          schema: "darwinian.worker.build-identity",
          schemaVersion: 1,
          version: "1.4.2",
          sourceCommit: SOURCE_COMMIT,
        })
        : "fixture\n");
    }
    const artifactPath = join(root, "darwinian-1.4.2.tgz");
    await tar.c({ gzip: true, file: artifactPath, cwd: root }, ["package"]);
    const bytes = Buffer.from(await Bun.file(artifactPath).arrayBuffer());
    const result = await requalifyReceivedArtifact({
      artifactPath,
      expected: {
        packageName: "darwinian",
        version: "1.4.2",
        sourceCommit: SOURCE_COMMIT,
        filename: "darwinian-1.4.2.tgz",
        byteLength: bytes.length,
        sha1: createHash("sha1").update(bytes).digest("hex"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      },
    });
    expect([...result.members].sort()).toEqual([...REQUIRED_RELEASE_MEMBERS].sort());
    expect(result.sourceCommit).toBe(SOURCE_COMMIT);
  });

  test("parses one actual pack result and binds byte identities to checkout and build identity", async () => {
    const root = await tempRoot();
    const bytes = Buffer.from("qualified tar bytes");
    await writeFile(join(root, "darwinian-1.4.2.tgz"), bytes);

    const result = await qualifyPackedArtifact({
      packDirectory: root,
      packResultJson: packJson(bytes),
      expectedPackageName: "darwinian",
      expectedVersion: "1.4.2",
      checkoutCommit: SOURCE_COMMIT,
    }, {
      readBuildIdentity: async () => ({
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.4.2",
        sourceCommit: SOURCE_COMMIT,
      }),
    });

    expect(result).toEqual({
      packageName: "darwinian",
      version: "1.4.2",
      sourceCommit: SOURCE_COMMIT,
      filename: "darwinian-1.4.2.tgz",
      byteLength: bytes.length,
      sha1: createHash("sha1").update(bytes).digest("hex"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      members: [...REQUIRED_RELEASE_MEMBERS],
    });
  });

  test.each([
    ["path traversal", { filename: "../darwinian-1.4.2.tgz" }],
    ["absolute path", { filename: "/tmp/darwinian-1.4.2.tgz" }],
    ["renamed tar", { filename: "other.tgz" }],
    ["wrong package", { name: "other" }],
    ["wrong version", { version: "1.2.1" }],
    ["wrong byte length", { size: 1 }],
    ["wrong shasum", { shasum: "0".repeat(40) }],
    ["wrong integrity", { integrity: `sha512-${Buffer.alloc(64).toString("base64")}` }],
    ["multiple results", null],
  ])("rejects %s", async (_label, overrides) => {
    const root = await tempRoot();
    const bytes = Buffer.from("qualified tar bytes");
    await writeFile(join(root, "darwinian-1.4.2.tgz"), bytes);
    const json = overrides === null
      ? JSON.stringify([...JSON.parse(packJson(bytes)), ...JSON.parse(packJson(bytes))])
      : packJson(bytes, overrides);
    await expect(qualifyPackedArtifact({
      packDirectory: root,
      packResultJson: json,
      expectedPackageName: "darwinian",
      expectedVersion: "1.4.2",
      checkoutCommit: SOURCE_COMMIT,
    }, {
      readBuildIdentity: async () => ({
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.4.2",
        sourceCommit: SOURCE_COMMIT,
      }),
    })).rejects.toThrow();
  });

  test("rejects mismatched build and checkout tuples", async () => {
    for (const scenario of [
      { identity: { version: "1.2.1", sourceCommit: SOURCE_COMMIT }, checkoutCommit: SOURCE_COMMIT },
      { identity: { version: "1.4.2", sourceCommit: "b".repeat(40) }, checkoutCommit: SOURCE_COMMIT },
      { identity: { version: "1.4.2", sourceCommit: SOURCE_COMMIT }, checkoutCommit: "A".repeat(40) },
    ]) {
      const root = await tempRoot();
      const bytes = Buffer.from("qualified tar bytes");
      await writeFile(join(root, "darwinian-1.4.2.tgz"), bytes);
      await expect(qualifyPackedArtifact({
        packDirectory: root,
        packResultJson: packJson(bytes),
        expectedPackageName: "darwinian",
        expectedVersion: "1.4.2",
        checkoutCommit: scenario.checkoutCommit,
      }, {
        readBuildIdentity: async () => ({
          schema: "darwinian.worker.build-identity",
          schemaVersion: 1,
          ...scenario.identity,
        }),
      })).rejects.toThrow();
    }
  });
});

describe("installed artifact smokes", () => {
  test("installs into an isolated prefix/cache and invokes only the installed bin for every safe smoke", async () => {
    const root = await tempRoot();
    const artifact = join(root, "darwinian-1.4.2.tgz");
    const calls: Array<{ command: string[]; cwd: string; env: Record<string, string | undefined> }> = [];
    await writeFile(artifact, "fixture");
    const runner: ReleaseCommandRunner = async (command, options) => {
      calls.push({ command, cwd: options.cwd, env: options.env });
      if (command.includes("qualify-staging-community")) {
        return { exitCode: 1, stdout: "", stderr: "STAGING_COMMUNITY_QUALIFICATION_FAILED\n" };
      }
      return { exitCode: 0, stdout: command.includes("--version") ? "1.4.2\n" : "Usage\n", stderr: "" };
    };

    const result = await runInstalledArtifactSmokes({
      artifactPath: artifact,
      expectedVersion: "1.4.2",
      workspaceRoot: join(root, "smoke"),
    }, {
      run: runner,
      resolveInstalledBin: async (prefix) => join(await realpath(prefix), "lib", "node_modules", "darwinian", "cli", "index.ts"),
    });

    expect(result).toEqual({
      version: "1.4.2",
      passed: [...SAFE_INSTALLED_SMOKES.map((smoke) => smoke.join(" ")), "__internal qualify-staging-community refusal"],
    });
    expect(calls).toHaveLength(2 + SAFE_INSTALLED_SMOKES.length);
    expect(calls[0]?.command.slice(0, 4)).toEqual(["npm", "install", "--global", artifact]);
    for (const [index, smoke] of SAFE_INSTALLED_SMOKES.entries()) {
      const call = calls[index + 1]!;
      expect(call.command[0]).toContain(join("smoke", "prefix"));
      expect(call.command.slice(1)).toEqual([...smoke]);
      expect(call.cwd).toBe(join(root, "smoke", "project"));
      expect(call.env.AGENTS_HOME_DIR).toBe(join(root, "smoke", "user-home"));
      expect(call.env.AGENTS_DIR).toBe(join(root, "smoke", "agents"));
      expect(call.env.RUNNER_TEMP).toBe(join(root, "smoke", "runner-temp"));
      expect(call.env[["DRWN", "TEST", "KEYCHAIN", "DIR"].join("_")]).toBeUndefined();
      expect(call.env.DRWN_TOKEN).toBeUndefined();
    }
    const qualification = calls.find(({ command }) => command.includes("qualify-staging-community"));
    expect(qualification?.command).toContain("__internal");
    expect(qualification?.command).toContain("--plan-file");
    expect(qualification?.command).toContain("--approval-notice-file");
    expect(qualification?.command).toContain("--output-file");
    expect(qualification?.command).toContain(join(root, "smoke", "runner-temp", "approval-notice.json"));
  });

  test("fails when version output differs or a help smoke mutates quarantined auth/project state", async () => {
    const root = await tempRoot();
    const artifact = join(root, "darwinian-1.4.2.tgz");
    await writeFile(artifact, "fixture");
    const workspaceRoot = join(root, "smoke");
    let smokeCount = 0;
    const runner: ReleaseCommandRunner = async (command, options) => {
      if (command[0] === "npm") return { exitCode: 0, stdout: "", stderr: "" };
      smokeCount += 1;
      if (smokeCount === 2) {
        await mkdir(options.env.AGENTS_DIR!, { recursive: true });
        await writeFile(join(options.env.AGENTS_DIR!, "unexpected"), "mutation");
      }
      return { exitCode: 0, stdout: smokeCount === 1 ? "1.4.2\n" : "Usage\n", stderr: "" };
    };
    await expect(runInstalledArtifactSmokes({ artifactPath: artifact, expectedVersion: "1.4.2", workspaceRoot }, {
      run: runner,
      resolveInstalledBin: async (prefix) => join(await realpath(prefix), "lib", "node_modules", "darwinian", "cli", "index.ts"),
    })).rejects.toThrow("mutated quarantined state");
  });
});

describe("published registry byte identity", () => {
  const expected = {
    version: "1.4.2",
    sourceCommit: SOURCE_COMMIT,
    sha1: "c".repeat(40),
    integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
  };

  test("requires version and registry byte identity and validates gitHead wherever reported", () => {
    expect(verifyPublishedRegistryIdentity({
      version: "1.4.2",
      gitHead: SOURCE_COMMIT,
      dist: { shasum: expected.sha1, integrity: expected.integrity },
    }, expected)).toEqual({ ...expected, gitHead: SOURCE_COMMIT });
    expect(verifyPublishedRegistryIdentity({
      version: "1.4.2",
      dist: { shasum: expected.sha1, integrity: expected.integrity },
    }, expected)).toEqual({ ...expected, gitHead: null });
  });

  test("fails on mismatches, malformed metadata, and absent gitHead when recovery requires it", () => {
    for (const metadata of [
      { version: "1.2.1", gitHead: SOURCE_COMMIT, dist: { shasum: expected.sha1, integrity: expected.integrity } },
      { version: "1.4.2", gitHead: "b".repeat(40), dist: { shasum: expected.sha1, integrity: expected.integrity } },
      { version: "1.4.2", gitHead: SOURCE_COMMIT, dist: { shasum: "d".repeat(40), integrity: expected.integrity } },
      { version: "1.4.2", gitHead: SOURCE_COMMIT, dist: { shasum: expected.sha1, integrity: "bad" } },
      { version: "1.4.2", gitHead: SOURCE_COMMIT, dist: { shasum: expected.sha1, integrity: expected.integrity }, extra: true },
    ]) {
      expect(() => verifyPublishedRegistryIdentity(metadata, expected)).toThrow();
    }
    expect(() => verifyPublishedRegistryIdentity({
      version: "1.4.2",
      dist: { shasum: expected.sha1, integrity: expected.integrity },
    }, expected, { requireGitHead: true })).toThrow();
  });
});
