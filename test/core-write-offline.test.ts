// ABOUTME: Verifies vendored drwn write succeeds offline from committed vendor bytes alone.
// ABOUTME: Ensures reconcile does not require machine store access when vendor verifies.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeContentManifest, manifestIntegrityDigest } from "../cli/core/content-manifest";
import { publishCard, resolveCard } from "../cli/core/card-store";
import * as git from "../cli/core/git";
import { syncRepository } from "../cli/core/sync";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { resolveProjectVendorTree } from "../cli/core/vendor";
import {
  buildVendorManifestSidecar,
  resolveVendorManifestSidecarPath,
  writeVendorManifestSidecar,
} from "../cli/core/vendor-manifest";
import {
  cleanupTempRoots,
  createFixtureConfig,
  createFixtureRegistry,
  createTempRoot,
  envFor,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
  writeTestCardLock,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("drwn write materializes from committed vendor with an empty machine store", async () => {
  const root = await createTempRoot("write-offline-");
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
  const storeDir = join(agentsDir, "drwn", "extracted", treeSha);
  const manifest = await computeContentManifest(storeDir);
  const integrity = manifestIntegrityDigest(manifest);

  const vendorDir = resolveProjectVendorTree(projectDir, "@me/tool", treeSha);
  await cp(storeDir, vendorDir, { recursive: true });
  await writeVendorManifestSidecar(
    resolveVendorManifestSidecarPath(projectDir, "@me/tool", treeSha),
    buildVendorManifestSidecar(
      {
        name: resolved.name,
        requested: "@me/tool@1.0.0",
        version: resolved.version,
        path: resolved.dir,
        treeSha,
        integrity,
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
      integrity,
      treeSha,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: "store",
      git: resolved.git!,
    },
  ]);

  await rm(join(agentsDir, "drwn", "cards"), { recursive: true, force: true });
  await rm(join(agentsDir, "drwn", "extracted"), { recursive: true, force: true });

  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  const lockPath = join(projectDir, ".agents", "drwn", "card.lock");
  const configBytes = await readFile(configPath, "utf8");
  const lockBytes = await readFile(lockPath, "utf8");

  const result = await syncRepository({
    repoRoot,
    agentsDir,
    homeDir,
    cwd: projectDir,
  });

  expect(result.changes.some((change) => change.startsWith("vendor "))).toBe(false);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
  expect(await readFile(configPath, "utf8")).toBe(configBytes);
  expect(await readFile(lockPath, "utf8")).toBe(lockBytes);
});

test("missing vendor and missing store fails with a repair signpost", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeSupportedProjectConfig(projectDir, { workers: ["@me/tool@1.0.0"], activeWorker: "@me/tool" });
  await writeTestCardLock(projectDir, [
    {
      name: "@me/tool",
      requested: "@me/tool@1.0.0",
      version: "1.0.0",
      path: "/missing",
      integrity: `sha256-${"a".repeat(64)}`,
      treeSha: "b".repeat(40),
      manifest: { name: "@me/tool", version: "1.0.0" },
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: "store",
      git: { commit: "c".repeat(40) },
    },
  ]);
  await rm(join(fixture.agentsDir, "drwn", "cards"), { recursive: true, force: true });
  await rm(join(fixture.agentsDir, "drwn", "extracted"), { recursive: true, force: true });

  await expect(
    syncRepository({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
      cwd: projectDir,
    }),
  ).rejects.toThrow(/machine store is unavailable|Restore committed vendor/);
});
