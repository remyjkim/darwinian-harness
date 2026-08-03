// ABOUTME: Verifies post-reconcile content root refresh routes vendored writes through vendor trees.
// ABOUTME: Ensures materialization succeeds from vendor even when extracted store bytes are removed.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCardContentRoot } from "../cli/core/card-content-root";
import { buildEffectiveState, recomputeContentRootsByCard } from "../cli/core/effective-state";
import { publishCard, resolveCard } from "../cli/core/card-store";
import * as git from "../cli/core/git";
import { syncRepository } from "../cli/core/sync";
import { resolveExtractedPath, resolveCardBareRepoPath } from "../cli/core/store-paths";
import { resolveProjectVendorTree } from "../cli/core/vendor";
import { reconcileVendorTrees } from "../cli/core/vendor-reconcile";
import { cleanupTempRoots, createFixtureConfig, createFixtureRegistry, createTempRoot, writeSupportedProjectConfig, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

async function scaffoldVendoredProject() {
  const root = await createTempRoot("vendor-provenance-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const repoRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const projectDir = join(root, "project");
  const claudeSettings = join(homeDir, ".claude", "settings.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const cursorConfig = join(homeDir, ".cursor", "mcp.json");
  await mkdir(join(repoRoot, "registry"), { recursive: true });
  await mkdir(join(homeDir, ".claude"), { recursive: true });
  await mkdir(join(homeDir, ".codex"), { recursive: true });
  await mkdir(join(homeDir, ".cursor"), { recursive: true });
  await writeFile(join(repoRoot, "registry", "mcp-servers.json"), JSON.stringify(createFixtureRegistry(), null, 2));
  await writeFile(
    join(repoRoot, "registry", "config.json"),
    JSON.stringify(createFixtureConfig({ claudeSettings, codexConfig, cursorConfig }), null, 2),
  );
  await writeFile(claudeSettings, JSON.stringify({ model: "sonnet" }, null, 2));
  await writeFile(codexConfig, 'personality = "pragmatic"\n');
  await writeFile(cursorConfig, JSON.stringify({ mcpServers: {} }, null, 2));

  const sourceDir = join(root, "card-sources", "prov");
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/prov", version: "1.0.0", skills: { include: ["alpha"] } }, null, 2));
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");

  await publishCard(agentsDir, sourceDir);
  const resolved = await resolveCard(agentsDir, "@me/prov@1.0.0");
  const barePath = resolveCardBareRepoPath(agentsDir, "@me/prov");
  const treeSha = await git.getCommitTree(barePath, resolved.git!.commit);
  const extractedDir = resolveExtractedPath(agentsDir, treeSha);

  await writeSupportedProjectConfig(projectDir, {
    workers: ["@me/prov@1.0.0"],
    activeWorker: "@me/prov",
  });
  await writeTestCardLock(projectDir, [
    {
      name: resolved.name,
      requested: "@me/prov@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: "store",
      git: resolved.git!,
    },
  ]);

  return { root, agentsDir, repoRoot, homeDir, projectDir, resolved, treeSha, extractedDir };
}

test("post-reconcile refresh selects vendor tree even when extracted bytes exist", async () => {
  const ctx = await scaffoldVendoredProject();
  const vendorDir = resolveProjectVendorTree(ctx.projectDir, "@me/prov", ctx.treeSha);
  expect(existsSync(vendorDir)).toBe(false);

  const state = await buildEffectiveState({
    repoRoot: ctx.repoRoot,
    agentsDir: ctx.agentsDir,
    homeDir: ctx.homeDir,
    cwd: ctx.projectDir,
  });
  const plannedRoot = state.contentRootsByCard["@me/prov"];
  expect(plannedRoot).toBe(ctx.extractedDir);

  const scratch = { changes: [] as string[], warnings: [] as string[], managedPaths: [] as [] };
  await reconcileVendorTrees(state, scratch);
  state.contentRootsByCard = recomputeContentRootsByCard(state, { allowPlanningFallback: false });
  expect(state.contentRootsByCard["@me/prov"]).toBe(vendorDir);
  expect(existsSync(join(vendorDir, "card.json"))).toBe(true);
});

test("materialization uses vendor root after extracted store is removed", async () => {
  const ctx = await scaffoldVendoredProject();
  const vendorDir = resolveProjectVendorTree(ctx.projectDir, "@me/prov", ctx.treeSha);
  await cp(ctx.extractedDir, vendorDir, { recursive: true });

  const state = await buildEffectiveState({
    repoRoot: ctx.repoRoot,
    agentsDir: ctx.agentsDir,
    homeDir: ctx.homeDir,
    cwd: ctx.projectDir,
  });
  const scratch = { changes: [] as string[], warnings: [] as string[], managedPaths: [] as [] };
  await reconcileVendorTrees(state, scratch);
  state.contentRootsByCard = recomputeContentRootsByCard(state, { allowPlanningFallback: false });

  await rm(ctx.extractedDir, { recursive: true, force: true });
  await rm(join(ctx.agentsDir, "drwn", "cards"), { recursive: true, force: true });

  const mode = state.cardModes["@me/prov"]!;
  const root = resolveCardContentRoot({
    projectRoot: ctx.projectDir,
    agentsDir: ctx.agentsDir,
    card: state.lockedCards[0]!,
    mode,
    allowPlanningFallback: false,
  });
  expect(root).toBe(vendorDir);

  const result = await syncRepository({
    repoRoot: ctx.repoRoot,
    agentsDir: ctx.agentsDir,
    homeDir: ctx.homeDir,
    cwd: ctx.projectDir,
    skillsOnly: true,
  });
  expect(existsSync(join(ctx.projectDir, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
  expect(result.changes.some((change) => change.includes("alpha"))).toBe(true);
});
