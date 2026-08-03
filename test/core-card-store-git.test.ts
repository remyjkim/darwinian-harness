// ABOUTME: Verifies Git-backed card store publishing and resolution.
// ABOUTME: Protects bare repo layout, extracted tree materialization, and Git-origin imports.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyProjectCardSpecs } from "../cli/core/card-project";
import { loadCardLock } from "../cli/core/card-lock";
import { createCardSource, publishCard, resolveCard } from "../cli/core/card-store";
import { listTags, revParse } from "../cli/core/git";
import {
  resolveCardBareRepoPath,
  resolveExtractedRoot,
  resolveStoreRoot,
} from "../cli/core/store-paths";
import { readUrlCardName, writeUrlCardName } from "../cli/core/url-card-map";
import { cleanupTempRoots, createTempRoot, writeSupportedProjectConfig } from "./helpers";
import { createLocalCardRepo, tagAdditionalVersion } from "./fixtures/git-helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createSource(agentsDir: string, version = "1.0.0", skills = ["alpha"]) {
  await createCardSource({ agentsDir, name: "@me/backend", noGit: true });
  const sourceDir = join(agentsDir, "drwn", "sources", "@me", "backend");
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  manifest.version = version;
  manifest.skills = { include: skills };
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const skill of skills) {
    await mkdir(join(sourceDir, "skills", skill), { recursive: true });
    await writeFile(join(sourceDir, "skills", skill, "SKILL.md"), `# ${skill}\n`);
  }
  return sourceDir;
}

describe("Git-backed card store", () => {
  test("creates and publishes an explicit source directory without creating a store sources tree", async () => {
    const root = await createTempRoot("card-store-path-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const sourceDir = join(root, "card-repositories", "backend");

    const created = await createCardSource({ sourceDir, name: "@me/backend", noGit: true });
    const published = await publishCard(agentsDir, sourceDir);

    expect(created.sourceDir).toBe(sourceDir);
    expect(published.name).toBe("@me/backend");
    expect(existsSync(join(agentsDir, "drwn", "sources"))).toBe(false);
    expect(existsSync(resolveCardBareRepoPath(agentsDir, "@me/backend"))).toBe(true);
  });

  test("publishCard creates a bare repo, tag, and extracted materialization without cache", async () => {
    const root = await createTempRoot("card-store-git-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    await createSource(agentsDir);

    const published = await publishCard(agentsDir, "@me/backend");

    const bareRepo = resolveCardBareRepoPath(agentsDir, "@me/backend");
    expect(published.versionDir).toStartWith(resolveExtractedRoot(agentsDir));
    expect(published.git.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(existsSync(join(bareRepo, "HEAD"))).toBe(true);
    expect(await listTags(bareRepo)).toContain("v1.0.0");
    expect(existsSync(join(published.versionDir, "card.json"))).toBe(true);
    expect(existsSync(join(resolveStoreRoot(agentsDir), "cache"))).toBe(false);
  });

  test("resolveCard reads store-origin cards from bare repo tags", async () => {
    const root = await createTempRoot("card-store-git-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    await createSource(agentsDir, "1.0.0", ["alpha"]);
    await publishCard(agentsDir, "@me/backend");
    const sourceDir = join(agentsDir, "drwn", "sources", "@me", "backend");
    const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
    manifest.version = "1.1.0";
    manifest.skills = { include: ["alpha", "beta"] };
    await writeFile(join(sourceDir, "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await mkdir(join(sourceDir, "skills", "beta"), { recursive: true });
    await writeFile(join(sourceDir, "skills", "beta", "SKILL.md"), "# beta\n");
    await publishCard(agentsDir, "@me/backend");

    const resolved = await resolveCard(agentsDir, "@me/backend@^1.0.0");

    expect(resolved.version).toBe("1.1.0");
    expect(resolved.origin).toBe("store");
    expect(resolved.git?.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(resolved.dir).toStartWith(resolveExtractedRoot(agentsDir));
    expect(JSON.parse(await readFile(join(resolved.dir, "card.json"), "utf8")).version).toBe("1.1.0");
  });

  test("project requirements write V1 lock entries with store-origin Git commits", async () => {
    const root = await createTempRoot("card-store-git-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const projectRoot = join(root, "project");
    await writeSupportedProjectConfig(projectRoot);
    await createSource(agentsDir);
    await publishCard(agentsDir, "@me/backend");

    await applyProjectCardSpecs(projectRoot, agentsDir, ["@me/backend@^1.0.0"]);

    const lock = await loadCardLock(projectRoot);
    expect(lock?.schema).toBe("drwn.project-lock");
    expect(lock?.schemaVersion).toBe(1);
    expect(lock?.cards[0]?.origin).toBe("store");
    expect(lock?.cards[0]?.treeSha).toMatch(/^[a-f0-9]{40}$/);
    expect(lock?.cards[0]?.git?.commit).toMatch(/^[a-f0-9]{40}$/);
  });

  test("resolveCard clones first-time git-origin refs and records origin URL", async () => {
    const root = await createTempRoot("card-store-git-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
    tempRoots.push(remote.tempDir);

    const resolved = await resolveCard(agentsDir, `git+${remote.url}#v1.0.0`);

    expect(resolved.name).toBe("@team/backend");
    expect(resolved.origin).toBe("git");
    expect(resolved.git).toEqual({
      url: remote.url,
      ref: "v1.0.0",
      commit: await revParse(resolveCardBareRepoPath(agentsDir, "@team/backend"), "v1.0.0^{commit}"),
    });
    expect(existsSync(resolveCardBareRepoPath(agentsDir, "@team/backend"))).toBe(true);
    expect(resolved.dir).toStartWith(resolveExtractedRoot(agentsDir));
  });

  test("resolveCard records git URL name mappings after successful discovery", async () => {
    const root = await createTempRoot("card-store-git-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
    tempRoots.push(remote.tempDir);

    await resolveCard(agentsDir, `git+${remote.url}#v1.0.0`);

    const cached = await readUrlCardName(agentsDir, remote.url);
    expect(cached?.name).toBe("@team/backend");
  });

  test("resolveCard corrects stale git URL name mappings without keeping the wrong repo path", async () => {
    const root = await createTempRoot("card-store-git-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
    tempRoots.push(remote.tempDir);
    await writeUrlCardName(agentsDir, remote.url, "@wrong/name");

    const resolved = await resolveCard(agentsDir, `git+${remote.url}#v1.0.0`);

    expect(resolved.name).toBe("@team/backend");
    expect(existsSync(resolveCardBareRepoPath(agentsDir, "@wrong/name"))).toBe(false);
    expect((await readUrlCardName(agentsDir, remote.url))?.name).toBe("@team/backend");
  });

  test("resolveCard selects highest matching version from git-origin tag ranges", async () => {
    const root = await createTempRoot("card-store-git-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
    tempRoots.push(remote.tempDir);
    await tagAdditionalVersion(remote, { name: "@team/backend", version: "1.2.0" });

    const resolved = await resolveCard(agentsDir, `git+${remote.url}@^1.0.0`);

    expect(resolved.version).toBe("1.2.0");
    expect(resolved.git?.ref).toBe("^1.0.0");
  });

  test("resolveCard rejects git URL name collisions", async () => {
    const root = await createTempRoot("card-store-git-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const remoteA = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
    const remoteB = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
    tempRoots.push(remoteA.tempDir, remoteB.tempDir);

    await resolveCard(agentsDir, `git+${remoteA.url}#v1.0.0`);

    await expect(resolveCard(agentsDir, `git+${remoteB.url}#v1.0.0`)).rejects.toThrow("already bound");
    expect(existsSync(resolveStoreRoot(agentsDir))).toBe(true);
  });
});
