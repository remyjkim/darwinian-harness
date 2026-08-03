// ABOUTME: Verifies drwn install bootstraps Cards from supported project lock V1.
// ABOUTME: Exercises real Git clone/fetch/extract behavior through local file:// remotes.

import { afterEach, expect, test } from "bun:test";
import { existsSync, lstatSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cardLockPath, loadCardLock, writeCardLock } from "../cli/core/card-lock";
import { computeCardIntegrity } from "../cli/core/card-store";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { resolveProjectVendorTree } from "../cli/core/vendor";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig, writeTestCardLock } from "./helpers";
import { createLocalCardRepo } from "./fixtures/git-helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldLockedGitProject(options?: { vendor?: boolean }) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0", skills: ["alpha"] });
  tempRoots.push(remote.tempDir);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  const apply = await runAgentsCli(["apply", `git+${remote.url}#v1.0.0`], envFor(fixture), projectDir);
  expect(apply.exitCode).toBe(0);
  if (options?.vendor) {
    const write = await runAgentsCli(["write"], envFor(fixture), projectDir);
    expect(write.exitCode).toBe(0);
  }
  await rm(join(fixture.agentsDir, "drwn"), { recursive: true, force: true });
  return { fixture, remote, projectDir };
}

async function writeOrgWorkerBundle(
  projectDir: string,
  card: NonNullable<Awaited<ReturnType<typeof loadCardLock>>>["cards"][number],
) {
  const path = join(projectDir, "org-worker-bundle.json");
  await writeFile(
    path,
    JSON.stringify({
      wireVersion: "org-worker-bundle@1",
      sourceBlueprint: {
        id: "blueprint:test:1",
        revision: 1,
        digest: `sha256:${"1".repeat(64)}`,
      },
      workerId: "worker:test",
      artifactPins: [
        {
          artifactId: "artifact:test-worker-root",
          kind: "worker_root",
          name: card.name,
          version: card.version,
          integrity: card.integrity.replace("sha256-", "sha256:"),
          origin: card.requested,
          provenanceRefs: ["provenance:test-worker-root"],
          resolutionSnapshotRef: "resolution:test-worker-root",
        },
      ],
      orderedWorkerRoots: ["artifact:test-worker-root"],
      activeWorkerRoot: "artifact:test-worker-root",
      projectOverlay: {},
      contributionConsents: [],
      minimumWorkerVersion: "1.0.0",
      logicalEnvironmentClass: "project_workspace",
      materializationReceiptVersion: "worker-materialization-receipt@1",
    }),
  );
  return path;
}

test("install --no-write bootstraps missing git-origin Cards without projection", async () => {
  const { fixture, projectDir } = await scaffoldLockedGitProject();

  const result = await runAgentsCli(["install", "--no-write"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@team/backend"))).toBe(true);
  const lock = await loadCardLock(projectDir);
  expect(lock?.cards[0]?.path).toContain("/drwn/extracted/");
  expect(existsSync(lock!.cards[0]!.path)).toBe(true);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(false);
});

test("install writes materialized Card content by default", async () => {
  const { fixture, projectDir } = await scaffoldLockedGitProject();

  const result = await runAgentsCli(["install"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  const skillLink = join(projectDir, ".claude", "skills", "alpha");
  expect(existsSync(skillLink)).toBe(true);
  expect(lstatSync(skillLink).isSymbolicLink()).toBe(false);
  expect(existsSync(join(skillLink, "SKILL.md"))).toBe(true);
});

test("install --frozen refuses to clone missing repos", async () => {
  const { fixture, projectDir } = await scaffoldLockedGitProject();

  const result = await runAgentsCli(["install", "--frozen", "--no-write"], envFor(fixture), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("--frozen");
});

test("install --frozen succeeds from committed vendor bytes without a machine store", async () => {
  const { fixture, projectDir } = await scaffoldLockedGitProject({ vendor: true });
  const lock = await loadCardLock(projectDir);
  const entry = lock!.cards[0]!;
  expect(entry.treeSha).toBeDefined();
  expect(existsSync(resolveProjectVendorTree(projectDir, entry.name, entry.treeSha!))).toBe(true);
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@team/backend"))).toBe(false);

  const result = await runAgentsCli(["install", "--frozen", "--no-write"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Installed 1 card(s).");
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@team/backend"))).toBe(false);
});

test("install consumes an immutable OrgWorkerBundleV1 only in frozen mode and records a bounded receipt", async () => {
  const { fixture, projectDir } = await scaffoldLockedGitProject({
    vendor: true,
  });
  const card = (await loadCardLock(projectDir))!.cards[0]!;
  const bundlePath = await writeOrgWorkerBundle(projectDir, card);

  const unsafe = await runAgentsCli(
    ["install", "--org-worker-bundle", bundlePath, "--no-write"],
    envFor(fixture),
    projectDir,
  );
  expect(unsafe.exitCode).not.toBe(0);
  expect(`${unsafe.stdout}\n${unsafe.stderr}`).toMatch(
    /bundle.*--frozen/i,
  );

  const result = await runAgentsCli(
    [
      "install",
      "--frozen",
      "--org-worker-bundle",
      bundlePath,
      "--no-write",
    ],
    envFor(fixture),
    projectDir,
  );
  expect(result.exitCode).toBe(0);
  const receipt = JSON.parse(
    await readFile(
      join(
        projectDir,
        ".agents",
        "drwn",
        "receipts",
        "org-worker-bundle-install.json",
      ),
      "utf8",
    ),
  );
  expect(receipt).toMatchObject({
    wireVersion: "org-worker-bundle-install-receipt@1",
    workerId: "worker:test",
    activeWorker: "@team/backend",
    verifiedArtifactPins: ["artifact:test-worker-root"],
  });
  expect(JSON.stringify(receipt)).not.toMatch(/credential|token|secret/i);
});

test("install --frozen reports corrupt committed vendor bytes", async () => {
  const { fixture, projectDir } = await scaffoldLockedGitProject({ vendor: true });
  const entry = (await loadCardLock(projectDir))!.cards[0]!;
  const vendorDir = resolveProjectVendorTree(projectDir, entry.name, entry.treeSha!);
  await chmod(join(vendorDir, "card.json"), 0o644);
  await writeFile(join(vendorDir, "card.json"), "{}\n");

  const result = await runAgentsCli(["install", "--frozen", "--no-write"], envFor(fixture), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("committed vendor tree");
  expect(result.stderr).toContain("corrupt");
});

test("install detects integrity mismatches", async () => {
  const { fixture, projectDir } = await scaffoldLockedGitProject();
  const lock = await loadCardLock(projectDir);
  lock!.cards[0]!.integrity = "sha256-" + "0".repeat(64);
  await writeCardLock(projectDir, lock!);

  const result = await runAgentsCli(["install", "--no-write"], envFor(fixture), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("integrity mismatch");
});

test("install validates file-origin entries without fetching", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const cardDir = join(fixture.root, "file-card");
  await writeSupportedProjectConfig(projectDir, { workers: ["file:../file-card"], activeWorker: "@file/backend" });
  await mkdir(cardDir, { recursive: true });
  await writeFile(join(cardDir, "card.json"), JSON.stringify({ name: "@file/backend", version: "1.0.0" }, null, 2));
  const integrity = await computeCardIntegrity(cardDir);
  await writeTestCardLock(projectDir, [
    {
      name: "@file/backend",
      requested: "file:../file-card",
      version: "1.0.0",
      path: cardDir,
      integrity,
      manifest: { name: "@file/backend", version: "1.0.0" },
      skills: [],
      hooks: [],
      registry: null,
      origin: "file",
    },
  ]);

  const result = await runAgentsCli(["install", "--no-write"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(await readFile(cardLockPath(projectDir), "utf8")).toContain('"origin": "file"');
});

test("install --no-apply is unknown and performs no fetch or project mutation", async () => {
  const { fixture, projectDir } = await scaffoldLockedGitProject();
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  const lockPath = cardLockPath(projectDir);
  const configBefore = await readFile(configPath, "utf8");
  const lockBefore = await readFile(lockPath, "utf8");

  const result = await runAgentsCli(["install", "--no-apply"], envFor(fixture), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/Unknown Syntax Error|Unsupported option/i);
  expect(await readFile(configPath, "utf8")).toBe(configBefore);
  expect(await readFile(lockPath, "utf8")).toBe(lockBefore);
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@team/backend"))).toBe(false);
  expect(existsSync(join(projectDir, ".claude"))).toBe(false);
});
