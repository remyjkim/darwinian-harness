// ABOUTME: Verifies concurrent ensureExtracted calls converge on one extracted tree.
// ABOUTME: Guards the store repair path used when vendor trees need population.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureExtracted, publishCard, resolveCard } from "../cli/core/card-store";
import * as git from "../cli/core/git";
import { resolveCardBareRepoPath, resolveExtractedPath } from "../cli/core/store-paths";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("parallel ensureExtracted calls produce one extracted directory", async () => {
  const root = await createTempRoot("extract-concurrency-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(root, "card-sources", "tool");
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/tool", version: "1.0.0", skills: { include: ["alpha"] } }, null, 2));
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");

  await publishCard(agentsDir, sourceDir);
  const resolved = await resolveCard(agentsDir, "@me/tool@1.0.0");
  const barePath = resolveCardBareRepoPath(agentsDir, "@me/tool");
  const treeSha = await git.getCommitTree(barePath, resolved.git!.commit);
  const extractedRoot = resolveExtractedPath(agentsDir, treeSha);
  await rm(join(agentsDir, "drwn", "extracted"), { recursive: true, force: true });

  const results = await Promise.all(
    Array.from({ length: 8 }, () => ensureExtracted(agentsDir, barePath, treeSha)),
  );

  expect(new Set(results)).toEqual(new Set([extractedRoot]));
  expect(existsSync(extractedRoot)).toBe(true);
  const siblings = await readdir(join(agentsDir, "drwn", "extracted"));
  expect(siblings.filter((name) => name.startsWith(`${treeSha}.tmp.`))).toHaveLength(0);
});
