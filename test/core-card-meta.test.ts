// ABOUTME: Verifies distributable card metadata stored at refs/meta/cards round-trips.
// ABOUTME: Guards deprecations and successor pointers on the meta ref plane.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initBare } from "../cli/core/git";
import { readCardMeta, writeCardMeta } from "../cli/core/card-meta";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { publishCard } from "../cli/core/card-store";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldBareCard() {
  const root = await createTempRoot("card-meta-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(root, "card-sources", "tool");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/tool", version: "1.0.0" }, null, 2));
  await publishCard(agentsDir, sourceDir);
  return { agentsDir, barePath: resolveCardBareRepoPath(agentsDir, "@me/tool") };
}

test("writeCardMeta and readCardMeta round-trip deprecations and successor", async () => {
  const { barePath } = await scaffoldBareCard();
  await writeCardMeta(barePath, {
    deprecations: { "1.0.0": "Use @me/tool@2.0.0" },
    successor: "@me/tool-next",
  });
  const meta = await readCardMeta(barePath);
  expect(meta?.deprecations).toEqual({ "1.0.0": "Use @me/tool@2.0.0" });
  expect(meta?.successor).toBe("@me/tool-next");
});

test("readCardMeta returns null when meta ref is absent", async () => {
  const root = await createTempRoot("card-meta-empty-");
  tempRoots.push(root);
  const barePath = join(root, "empty.git");
  await initBare(barePath);
  expect(await readCardMeta(barePath)).toBeNull();
});
