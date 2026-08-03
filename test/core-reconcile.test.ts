// ABOUTME: Verifies vendor reconcile prune behavior for stale, drifted, and unknown trees.
// ABOUTME: Exercises sidecar-backed prune decisions from repair phase R1.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type CardLockEntry } from "../cli/core/card-lock";
import { computeContentManifest } from "../cli/core/content-manifest";
import { publishCard, resolveCard, ensureExtracted } from "../cli/core/card-store";
import * as git from "../cli/core/git";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { buildEffectiveState } from "../cli/core/effective-state";
import { reconcileVendorTrees } from "../cli/core/vendor-reconcile";
import {
  buildVendorManifestSidecar,
  resolveVendorManifestSidecarPathForVendorDir,
  writeVendorManifestSidecar,
} from "../cli/core/vendor-manifest";
import { ensureVendorTree, resolveProjectVendorTree } from "../cli/core/vendor";
import { cleanupTempRoots, createFixtureConfig, createFixtureRegistry, createTempRoot, writeSupportedProjectConfig, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldVendoredProject() {
  const root = await createTempRoot("reconcile-");
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

  const sourceDir = join(root, "card-sources", "tool");
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/tool", version: "1.0.0", skills: { include: ["alpha"] } }, null, 2));
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");

  await publishCard(agentsDir, sourceDir);
  const resolved = await resolveCard(agentsDir, "@me/tool@1.0.0");
  const barePath = resolveCardBareRepoPath(agentsDir, "@me/tool");
  const treeSha = await git.getCommitTree(barePath, resolved.git!.commit);
  const storeDir = await ensureExtracted(agentsDir, barePath, treeSha);
  const manifest = await computeContentManifest(storeDir);

  const vendorDir = resolveProjectVendorTree(projectDir, "@me/tool", treeSha);
  await ensureVendorTree({ projectRoot: projectDir, storeDir, vendorDir, manifest });
  await writeVendorManifestSidecar(
    resolveVendorManifestSidecarPathForVendorDir(projectDir, vendorDir),
    buildVendorManifestSidecar(
      {
        name: resolved.name,
        requested: "@me/tool@1.0.0",
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
      manifest,
    ),
  );

  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeSupportedProjectConfig(projectDir, { workers: ["@me/tool@1.0.0"], activeWorker: "@me/tool" });
  await writeTestCardLock(projectDir, [
    {
      name: resolved.name,
      requested: "@me/tool@1.0.0",
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

  return { root, agentsDir, repoRoot, homeDir, projectDir, resolved, treeSha, storeDir, manifest, vendorDir };
}

test("reconcile prunes stale clean vendor trees when lock no longer references them", async () => {
  const ctx = await scaffoldVendoredProject();
  const staleSha = "b".repeat(40);
  const staleDir = resolveProjectVendorTree(ctx.projectDir, "@me/tool", staleSha);
  await ensureVendorTree({ projectRoot: ctx.projectDir, storeDir: ctx.storeDir, vendorDir: staleDir, manifest: ctx.manifest });
  await writeVendorManifestSidecar(
    resolveVendorManifestSidecarPathForVendorDir(ctx.projectDir, staleDir),
    buildVendorManifestSidecar(
      {
        name: ctx.resolved.name,
        requested: "",
        version: "1.0.0",
        path: "",
        integrity: ctx.resolved.integrity,
        treeSha: staleSha,
        manifest: ctx.resolved.manifest,
        skills: [],
        hooks: [],
        registry: null,
        origin: "store",
        git: ctx.resolved.git!,
      },
      ctx.manifest,
    ),
  );

  const state = await buildEffectiveState({
    repoRoot: ctx.repoRoot,
    agentsDir: ctx.agentsDir,
    homeDir: ctx.homeDir,
    cwd: ctx.projectDir,
  });
  const result = { changes: [] as string[], warnings: [] as string[], managedPaths: [] };
  await reconcileVendorTrees(state, result);

  expect(existsSync(ctx.vendorDir)).toBe(true);
  expect(existsSync(staleDir)).toBe(false);
  expect(result.changes.some((change) => change.startsWith("prune vendor "))).toBe(true);
});

test("reconcile preserves drifted stale trees with a warning", async () => {
  const ctx = await scaffoldVendoredProject();
  const driftSha = "c".repeat(40);
  const driftDir = resolveProjectVendorTree(ctx.projectDir, "@me/tool", driftSha);
  await mkdir(driftDir, { recursive: true });
  await writeFile(join(driftDir, "tampered.txt"), "drift\n");
  await writeVendorManifestSidecar(
    resolveVendorManifestSidecarPathForVendorDir(ctx.projectDir, driftDir),
    buildVendorManifestSidecar(
      {
        name: ctx.resolved.name,
        requested: "",
        version: "1.0.0",
        path: "",
        integrity: ctx.resolved.integrity,
        treeSha: driftSha,
        manifest: ctx.resolved.manifest,
        skills: [],
        hooks: [],
        registry: null,
        origin: "store",
        git: ctx.resolved.git!,
      },
      ctx.manifest,
    ),
  );

  const state = await buildEffectiveState({
    repoRoot: ctx.repoRoot,
    agentsDir: ctx.agentsDir,
    homeDir: ctx.homeDir,
    cwd: ctx.projectDir,
  });
  const result = { changes: [] as string[], warnings: [] as string[], managedPaths: [] };
  await reconcileVendorTrees(state, result);

  expect(existsSync(driftDir)).toBe(true);
  expect(result.warnings.some((warning) => warning.includes("preserved drifted vendor tree"))).toBe(true);
});

test("reconcile preserves unknown vendor trees without sidecars", async () => {
  const ctx = await scaffoldVendoredProject();
  const unknownDir = resolveProjectVendorTree(ctx.projectDir, "@me/tool", "d".repeat(40));
  await mkdir(unknownDir, { recursive: true });
  await writeFile(join(unknownDir, "orphan.txt"), "unknown\n");

  const state = await buildEffectiveState({
    repoRoot: ctx.repoRoot,
    agentsDir: ctx.agentsDir,
    homeDir: ctx.homeDir,
    cwd: ctx.projectDir,
  });
  const result = { changes: [] as string[], warnings: [] as string[], managedPaths: [] };
  await reconcileVendorTrees(state, result);

  expect(existsSync(unknownDir)).toBe(true);
  expect(result.warnings.some((warning) => warning.includes("unknown vendor tree (no manifest record)"))).toBe(true);
});
