// ABOUTME: Verifies union-merge semantics for refs/meta/cards deprecations.
// ABOUTME: Ensures sequential deprecations of different versions both survive.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mergeCardMeta, readCardMeta, writeCardMeta } from "../cli/core/card-meta";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { publishCard } from "../cli/core/card-store";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldBareCard() {
  const root = await createTempRoot("card-meta-merge-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(root, "card-sources", "tool");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/tool", version: "1.0.0" }, null, 2));
  await publishCard(agentsDir, sourceDir);
  return resolveCardBareRepoPath(agentsDir, "@me/tool");
}

test("mergeCardMeta unions deprecations across versions", () => {
  const merged = mergeCardMeta(
    { deprecations: { "1.0.0": "old message" } },
    { deprecations: { "2.0.0": "new message" } },
  );
  expect(merged.deprecations).toEqual({
    "1.0.0": "old message",
    "2.0.0": "new message",
  });
});

test("mergeCardMeta last-write-wins within the same version key", () => {
  const merged = mergeCardMeta(
    { deprecations: { "1.0.0": "first" } },
    { deprecations: { "1.0.0": "second" } },
  );
  expect(merged.deprecations?.["1.0.0"]).toBe("second");
});

test("writeCardMeta merges with existing meta without clobbering other versions", async () => {
  const barePath = await scaffoldBareCard();
  await writeCardMeta(barePath, { deprecations: { "1.0.0": "deprecated 1.0.0" } });
  await writeCardMeta(barePath, { deprecations: { "2.0.0": "deprecated 2.0.0" } });
  const meta = await readCardMeta(barePath);
  expect(meta?.deprecations).toEqual({
    "1.0.0": "deprecated 1.0.0",
    "2.0.0": "deprecated 2.0.0",
  });
});
