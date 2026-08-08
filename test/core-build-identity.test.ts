// ABOUTME: Verifies strict runtime Worker build identity and non-qualifying source fallback.
// ABOUTME: Proves release identity is derived from clean package and Git state without stale output.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEVELOPMENT_SOURCE_COMMIT,
  BuildIdentityError,
  loadBuildIdentity,
  parsePackagedBuildIdentity,
} from "../cli/core/build-identity";
import { generateBuildIdentity } from "../scripts/release/build-identity";

const tempRoots: string[] = [];
const SOURCE_COMMIT = "a".repeat(40);

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function runGit(root: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
  return stdout.trim();
}

async function scaffoldCleanRepo(version = "1.2.0"): Promise<string> {
  const root = await tempRoot("drwn-i239-build-identity-");
  await mkdir(join(root, "cli", "generated"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "darwinian", version }) + "\n");
  await writeFile(join(root, ".gitignore"), "cli/generated/\n");
  await writeFile(join(root, "tracked.txt"), "clean\n");
  await runGit(root, "init", "-q");
  await runGit(root, "config", "user.email", "i239@example.test");
  await runGit(root, "config", "user.name", "I239 Test");
  await runGit(root, "add", ".gitignore", "package.json", "tracked.txt");
  await runGit(root, "commit", "-qm", "fixture");
  return root;
}

afterEach(async () => {
  for (const root of tempRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("packaged Worker build identity", () => {
  test("accepts only the exact schema with package-version parity and a lowercase full Git SHA", () => {
    const input = {
      schema: "darwinian.worker.build-identity",
      schemaVersion: 1,
      version: "1.2.0",
      sourceCommit: SOURCE_COMMIT,
    } as const;

    expect(parsePackagedBuildIdentity(input, "1.2.0")).toEqual({
      kind: "packaged",
      ...input,
      qualificationEligible: true,
    });

    for (const invalid of [
      { ...input, extra: true },
      { ...input, schema: "darwinian.worker.build" },
      { ...input, schemaVersion: 2 },
      { ...input, version: "1.2.1" },
      { ...input, sourceCommit: SOURCE_COMMIT.toUpperCase() },
      { ...input, sourceCommit: "a".repeat(39) },
      { ...input, sourceCommit: DEVELOPMENT_SOURCE_COMMIT },
    ]) {
      expect(() => parsePackagedBuildIdentity(invalid, "1.2.0")).toThrow(BuildIdentityError);
    }
    expect(() => parsePackagedBuildIdentity(input, "v1.2.0")).toThrow(BuildIdentityError);
  });

  test("loads packaged identity from its adjacent package metadata", async () => {
    const root = await tempRoot("drwn-i239-build-loader-");
    const packagePath = join(root, "package.json");
    const identityPath = join(root, "build-identity.json");
    await writeFile(packagePath, JSON.stringify({ version: "1.2.0" }));
    await writeFile(identityPath, JSON.stringify({
      schema: "darwinian.worker.build-identity",
      schemaVersion: 1,
      version: "1.2.0",
      sourceCommit: SOURCE_COMMIT,
    }));

    expect(await loadBuildIdentity({ packagePath, identityPath })).toMatchObject({
      kind: "packaged",
      version: "1.2.0",
      sourceCommit: SOURCE_COMMIT,
      qualificationEligible: true,
    });
  });

  test("uses one explicit, structurally joinable, never-qualifying development identity only when the member is absent", async () => {
    const root = await tempRoot("drwn-i239-build-development-");
    const packagePath = join(root, "package.json");
    await writeFile(packagePath, JSON.stringify({ version: "1.2.0" }));

    expect(await loadBuildIdentity({
      packagePath,
      identityPath: join(root, "missing-build-identity.json"),
    })).toEqual({
      kind: "development",
      schema: "darwinian.worker.build-identity",
      schemaVersion: 1,
      version: "1.2.0",
      sourceCommit: DEVELOPMENT_SOURCE_COMMIT,
      qualificationEligible: false,
    });
    expect(DEVELOPMENT_SOURCE_COMMIT).toBe("0".repeat(40));
  });

  test("fails closed rather than treating malformed or mismatched present members as development", async () => {
    const root = await tempRoot("drwn-i239-build-malformed-");
    const packagePath = join(root, "package.json");
    const identityPath = join(root, "build-identity.json");
    await writeFile(packagePath, JSON.stringify({ version: "1.2.0" }));

    for (const contents of [
      "not-json",
      JSON.stringify({ schema: "darwinian.worker.build-identity", schemaVersion: 1, version: "1.2.0" }),
      JSON.stringify({
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.1.0",
        sourceCommit: SOURCE_COMMIT,
      }),
    ]) {
      await writeFile(identityPath, contents);
      await expect(loadBuildIdentity({ packagePath, identityPath })).rejects.toBeInstanceOf(BuildIdentityError);
    }
  });
});

describe("build identity generator", () => {
  test("derives the exact member from adjacent package metadata and the checked-out Git object", async () => {
    const root = await scaffoldCleanRepo();
    const expectedCommit = await runGit(root, "rev-parse", "HEAD");

    const generated = await generateBuildIdentity({ repoRoot: root });
    const memberPath = join(root, "cli", "generated", "build-identity.json");

    expect(generated).toEqual({
      schema: "darwinian.worker.build-identity",
      schemaVersion: 1,
      version: "1.2.0",
      sourceCommit: expectedCommit,
    });
    expect(await readFile(memberPath, "utf8")).toBe(`${JSON.stringify(generated)}\n`);
    expect(await runGit(root, "status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  test("checks cleanliness before deriving HEAD and accepts no caller-supplied version or commit", async () => {
    const root = await scaffoldCleanRepo();
    const calls: string[][] = [];
    const actualCommit = await runGit(root, "rev-parse", "HEAD");

    const generated = await generateBuildIdentity(
      { repoRoot: root },
      {
        runGit: async (_root, args) => {
          calls.push(args);
          if (args[0] === "status") return "";
          if (args.join(" ") === "rev-parse HEAD") return actualCommit;
          throw new Error(`unexpected git args: ${args.join(" ")}`);
        },
      },
    );

    expect(calls).toEqual([
      ["status", "--porcelain", "--untracked-files=all"],
      ["rev-parse", "HEAD"],
    ]);
    expect(generated.version).toBe("1.2.0");
    expect(generated.sourceCommit).toBe(actualCommit);
  });

  test("removes stale qualifying output on dirty, missing-Git, invalid-version, and invalid-SHA failures", async () => {
    const scenarios: Array<{
      name: string;
      arrange(root: string): Promise<void>;
      deps?: Parameters<typeof generateBuildIdentity>[1];
    }> = [
      {
        name: "dirty",
        arrange: async (root) => { await writeFile(join(root, "tracked.txt"), "dirty\n"); },
      },
      {
        name: "missing Git",
        arrange: async (root) => { await rm(join(root, ".git"), { recursive: true, force: true }); },
      },
      {
        name: "invalid version",
        arrange: async (root) => {
          await writeFile(join(root, "package.json"), JSON.stringify({ version: "not-semver" }));
          await runGit(root, "add", "package.json");
          await runGit(root, "commit", "-qm", "invalid version fixture");
        },
      },
      {
        name: "invalid SHA",
        arrange: async () => {},
        deps: {
          runGit: async (_root, args) => args[0] === "status" ? "" : "ABC123",
        },
      },
    ];

    for (const scenario of scenarios) {
      const root = await scaffoldCleanRepo();
      const memberPath = join(root, "cli", "generated", "build-identity.json");
      await writeFile(memberPath, `${JSON.stringify({
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.2.0",
        sourceCommit: SOURCE_COMMIT,
      })}\n`);
      await scenario.arrange(root);

      await expect(generateBuildIdentity({ repoRoot: root }, scenario.deps)).rejects.toThrow();
      expect(await Bun.file(memberPath).exists(), scenario.name).toBe(false);
    }
  });
});
