// ABOUTME: Verifies vendor tree population, integrity checks, and lock treeSha backfill.
// ABOUTME: Protects the F1 reflink isolation and crash-recoverable vendor reconcile from analysis 97.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type CardLockEntry } from "../cli/core/card-lock";
import { computeContentManifest } from "../cli/core/content-manifest";
import { ensureExtracted, publishCard, resolveCard } from "../cli/core/card-store";
import * as git from "../cli/core/git";
import { resolveCardBareRepoPath, resolveExtractedPath } from "../cli/core/store-paths";
import {
  ensureVendorTree,
  populateFile,
  pruneVendorTrees,
  resolveProjectVendorRoot,
  resolveProjectVendorTree,
} from "../cli/core/vendor";
import {
  buildVendorManifestSidecar,
  writeVendorManifestSidecar,
  resolveVendorManifestSidecarPathForVendorDir,
} from "../cli/core/vendor-manifest";
import { cleanupTempRoots, createTempRoot, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldPublishedCard(version = "1.0.0") {
  const root = await createTempRoot("vendor-card-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(root, "card-sources", "tool");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/tool", version }, null, 2));
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\nbody\n");
  const published = await publishCard(agentsDir, sourceDir);
  const resolved = await resolveCard(agentsDir, "@me/tool@1.0.0");
  return { root, agentsDir, published, resolved };
}

test("resolveProjectVendorRoot and resolveProjectVendorTree use scoped short sha paths", () => {
  const projectRoot = "/tmp/project";
  const treeSha = "a".repeat(40);
  expect(resolveProjectVendorRoot(projectRoot)).toBe("/tmp/project/.agents/drwn/vendor");
  expect(resolveProjectVendorTree(projectRoot, "@me/tool", treeSha)).toBe(
    "/tmp/project/.agents/drwn/vendor/@me/tool/aaaaaaaaaaaa",
  );
});

test("populateFile keeps store bytes isolated after destination edit", async () => {
  const root = await createTempRoot("vendor-populate-");
  tempRoots.push(root);
  const src = join(root, "src.txt");
  const dst = join(root, "dst.txt");
  await writeFile(src, "hello\n");

  populateFile(src, dst);
  await writeFile(dst, "hello!\n");

  expect(await readFile(src, "utf8")).toBe("hello\n");
  const srcStat = await stat(src);
  const dstStat = await stat(dst);
  expect(srcStat.ino).not.toBe(dstStat.ino);
});

test("ensureExtracted chmods store files read-only while keeping dirs writable", async () => {
  const { agentsDir, resolved } = await scaffoldPublishedCard();
  const barePath = resolveCardBareRepoPath(agentsDir, "@me/tool");
  const treeSha = await git.getCommitTree(barePath, resolved.git!.commit);
  const extractedDir = await ensureExtracted(agentsDir, barePath, treeSha);
  const skillPath = join(extractedDir, "skills", "alpha", "SKILL.md");

  await expect(writeFile(skillPath, "mutated\n")).rejects.toThrow();
  await expect(rm(extractedDir, { recursive: true, force: true })).resolves.toBeUndefined();
});

test("ensureVendorTree converges from a half-written vendor tree", async () => {
  const { root, agentsDir, resolved } = await scaffoldPublishedCard();
  const barePath = resolveCardBareRepoPath(agentsDir, "@me/tool");
  const treeSha = await git.getCommitTree(barePath, resolved.git!.commit);
  const storeDir = await ensureExtracted(agentsDir, barePath, treeSha);
  const manifest = await computeContentManifest(storeDir);
  const vendorDir = resolveProjectVendorTree(root, "@me/tool", treeSha);

  await mkdir(vendorDir, { recursive: true });
  await writeFile(join(vendorDir, "partial.txt"), "broken");

  await ensureVendorTree({ projectRoot: root, storeDir, vendorDir, manifest });
  expect((await computeContentManifest(vendorDir)).files.map((file) => file.path)).toContain("skills/alpha/SKILL.md");
  await ensureVendorTree({ projectRoot: root, storeDir, vendorDir, manifest });
});

test("pruneVendorTrees removes stale clean trees and preserves drifted ones", async () => {
  const { root, agentsDir, resolved } = await scaffoldPublishedCard();
  const barePath = resolveCardBareRepoPath(agentsDir, "@me/tool");
  const treeSha = await git.getCommitTree(barePath, resolved.git!.commit);
  const storeDir = await ensureExtracted(agentsDir, barePath, treeSha);
  const manifest = await computeContentManifest(storeDir);
  const vendorRoot = resolveProjectVendorRoot(root);
  const vendorDir = resolveProjectVendorTree(root, "@me/tool", treeSha);
  const staleDir = resolveProjectVendorTree(root, "@me/tool", "b".repeat(40));

  await ensureVendorTree({ projectRoot: root, storeDir, vendorDir, manifest });
  await ensureVendorTree({ projectRoot: root, storeDir, vendorDir: staleDir, manifest });

  const card = {
    name: "@me/tool",
    treeSha,
    integrity: resolved.integrity,
  } as CardLockEntry;
  await writeVendorManifestSidecar(
    resolveVendorManifestSidecarPathForVendorDir(root, staleDir),
    buildVendorManifestSidecar(
      { ...card, treeSha: "b".repeat(40), requested: "", version: "1.0.0", path: "", manifest: resolved.manifest, skills: [], hooks: [], registry: null, origin: "store" },
      manifest,
    ),
  );
  await writeVendorManifestSidecar(
    resolveVendorManifestSidecarPathForVendorDir(root, vendorDir),
    buildVendorManifestSidecar({ ...card, requested: "", version: "1.0.0", path: "", manifest: resolved.manifest, skills: [], hooks: [], registry: null, origin: "store" }, manifest),
  );

  const driftedDir = resolveProjectVendorTree(root, "@me/tool", "c".repeat(40));
  await mkdir(driftedDir, { recursive: true });
  await writeFile(join(driftedDir, "tampered.txt"), "drift\n");
  await writeVendorManifestSidecar(
    resolveVendorManifestSidecarPathForVendorDir(root, driftedDir),
    buildVendorManifestSidecar(
      { ...card, treeSha: "c".repeat(40), requested: "", version: "1.0.0", path: "", manifest: resolved.manifest, skills: [], hooks: [], registry: null, origin: "store" },
      manifest,
    ),
  );

  const result = await pruneVendorTrees({
    projectRoot: root,
    vendorRoot,
    desired: new Set([vendorDir]),
  });

  expect(existsSync(vendorDir)).toBe(true);
  expect(existsSync(staleDir)).toBe(false);
  expect(existsSync(driftedDir)).toBe(true);
  expect(result.preserved).toContain(driftedDir);
  expect(result.warnings.some((entry) => entry.kind === "drifted")).toBe(true);
});

test("the supported project lock requires treeSha for store cards", async () => {
  const root = await createTempRoot("vendor-lock-write-");
  tempRoots.push(root);
  const entry: CardLockEntry = {
    name: "@me/tool",
    requested: "@me/tool@1.0.0",
    version: "1.0.0",
    path: "/tmp/x",
    integrity: "sha256-test",
    manifest: { name: "@me/tool", version: "1.0.0" },
    skills: [],
    hooks: [],
    registry: null,
    origin: "store",
    git: { commit: "a".repeat(40) },
  };

  await expect(writeTestCardLock(root, [entry])).rejects.toThrow("treeSha");
});
