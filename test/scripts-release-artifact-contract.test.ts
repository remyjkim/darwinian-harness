// ABOUTME: Proves release qualification binds required members and measured tar bytes to one build tuple.
// ABOUTME: Locks clean-prefix installed smokes to the installed bin and side-effect quarantine.

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REQUIRED_RELEASE_MEMBERS,
  SAFE_INSTALLED_SMOKES,
  qualifyPackageMembers,
  qualifyPackedArtifact,
  runInstalledArtifactSmokes,
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
    id: "darwinian@1.2.0",
    name: "darwinian",
    version: "1.2.0",
    filename: "darwinian-1.2.0.tgz",
    size: bytes.length,
    shasum: createHash("sha1").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    files: REQUIRED_RELEASE_MEMBERS.map((path) => ({ path, size: 1, mode: 0o644 })),
    ...overrides,
  }]);
}

describe("release package member qualification", () => {
  test("accepts every required source member plus generated build identity", () => {
    expect(qualifyPackageMembers([...REQUIRED_RELEASE_MEMBERS])).toEqual([...REQUIRED_RELEASE_MEMBERS]);
  });

  test("rejects each required member independently", () => {
    for (const required of REQUIRED_RELEASE_MEMBERS) {
      expect(() => qualifyPackageMembers(REQUIRED_RELEASE_MEMBERS.filter((path) => path !== required))).toThrow(required);
    }
  });

  test.each([
    ".env",
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
  test("parses one actual pack result and binds byte identities to checkout and build identity", async () => {
    const root = await tempRoot();
    const bytes = Buffer.from("qualified tar bytes");
    await writeFile(join(root, "darwinian-1.2.0.tgz"), bytes);

    const result = await qualifyPackedArtifact({
      packDirectory: root,
      packResultJson: packJson(bytes),
      expectedPackageName: "darwinian",
      expectedVersion: "1.2.0",
      checkoutCommit: SOURCE_COMMIT,
    }, {
      readBuildIdentity: async () => ({
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.2.0",
        sourceCommit: SOURCE_COMMIT,
      }),
    });

    expect(result).toEqual({
      packageName: "darwinian",
      version: "1.2.0",
      sourceCommit: SOURCE_COMMIT,
      filename: "darwinian-1.2.0.tgz",
      byteLength: bytes.length,
      sha1: createHash("sha1").update(bytes).digest("hex"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      members: [...REQUIRED_RELEASE_MEMBERS],
    });
  });

  test.each([
    ["path traversal", { filename: "../darwinian-1.2.0.tgz" }],
    ["absolute path", { filename: "/tmp/darwinian-1.2.0.tgz" }],
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
    await writeFile(join(root, "darwinian-1.2.0.tgz"), bytes);
    const json = overrides === null
      ? JSON.stringify([...JSON.parse(packJson(bytes)), ...JSON.parse(packJson(bytes))])
      : packJson(bytes, overrides);
    await expect(qualifyPackedArtifact({
      packDirectory: root,
      packResultJson: json,
      expectedPackageName: "darwinian",
      expectedVersion: "1.2.0",
      checkoutCommit: SOURCE_COMMIT,
    }, {
      readBuildIdentity: async () => ({
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.2.0",
        sourceCommit: SOURCE_COMMIT,
      }),
    })).rejects.toThrow();
  });

  test("rejects mismatched build and checkout tuples", async () => {
    for (const scenario of [
      { identity: { version: "1.2.1", sourceCommit: SOURCE_COMMIT }, checkoutCommit: SOURCE_COMMIT },
      { identity: { version: "1.2.0", sourceCommit: "b".repeat(40) }, checkoutCommit: SOURCE_COMMIT },
      { identity: { version: "1.2.0", sourceCommit: SOURCE_COMMIT }, checkoutCommit: "A".repeat(40) },
    ]) {
      const root = await tempRoot();
      const bytes = Buffer.from("qualified tar bytes");
      await writeFile(join(root, "darwinian-1.2.0.tgz"), bytes);
      await expect(qualifyPackedArtifact({
        packDirectory: root,
        packResultJson: packJson(bytes),
        expectedPackageName: "darwinian",
        expectedVersion: "1.2.0",
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
  test("installs into an isolated prefix/cache and invokes only the installed bin for all eight safe smokes", async () => {
    const root = await tempRoot();
    const artifact = join(root, "darwinian-1.2.0.tgz");
    const calls: Array<{ command: string[]; cwd: string; env: Record<string, string | undefined> }> = [];
    await writeFile(artifact, "fixture");
    const runner: ReleaseCommandRunner = async (command, options) => {
      calls.push({ command, cwd: options.cwd, env: options.env });
      return { exitCode: 0, stdout: command.includes("--version") ? "1.2.0\n" : "Usage\n", stderr: "" };
    };

    const result = await runInstalledArtifactSmokes({
      artifactPath: artifact,
      expectedVersion: "1.2.0",
      workspaceRoot: join(root, "smoke"),
    }, {
      run: runner,
      resolveInstalledBin: async (prefix) => join(await realpath(prefix), "lib", "node_modules", "darwinian", "cli", "index.ts"),
    });

    expect(result).toEqual({ version: "1.2.0", passed: SAFE_INSTALLED_SMOKES.map((smoke) => smoke.join(" ")) });
    expect(calls).toHaveLength(1 + SAFE_INSTALLED_SMOKES.length);
    expect(calls[0]?.command.slice(0, 4)).toEqual(["npm", "install", "--global", artifact]);
    for (const [index, smoke] of SAFE_INSTALLED_SMOKES.entries()) {
      const call = calls[index + 1]!;
      expect(call.command[0]).toContain(join("smoke", "prefix"));
      expect(call.command.slice(1)).toEqual([...smoke]);
      expect(call.cwd).toBe(join(root, "smoke", "project"));
      expect(call.env.AGENTS_HOME_DIR).toBe(join(root, "smoke", "user-home"));
      expect(call.env.AGENTS_DIR).toBe(join(root, "smoke", "agents"));
      expect(call.env.DRWN_TEST_KEYCHAIN_DIR).toBe(join(root, "smoke", "keychain"));
      expect(call.env.DRWN_TOKEN).toBeUndefined();
    }
  });

  test("fails when version output differs or a help smoke mutates quarantined auth/project state", async () => {
    const root = await tempRoot();
    const artifact = join(root, "darwinian-1.2.0.tgz");
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
      return { exitCode: 0, stdout: smokeCount === 1 ? "1.2.0\n" : "Usage\n", stderr: "" };
    };
    await expect(runInstalledArtifactSmokes({ artifactPath: artifact, expectedVersion: "1.2.0", workspaceRoot }, {
      run: runner,
      resolveInstalledBin: async (prefix) => join(await realpath(prefix), "lib", "node_modules", "darwinian", "cli", "index.ts"),
    })).rejects.toThrow("mutated quarantined state");
  });
});
