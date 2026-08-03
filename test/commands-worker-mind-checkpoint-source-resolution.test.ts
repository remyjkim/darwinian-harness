// ABOUTME: Verifies Mind checkpoint source resolution honors project overrides before catalogs.
// ABOUTME: Ensures unresolved sources remain absent so checkpointing fails with its stable core error.

import { afterEach, expect, test } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCheckpointSourceDirs } from "../cli/commands/worker/mind/checkpoint";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function writeSource(path: string, name: string) {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "card.json"), `${JSON.stringify({ name, version: "1.0.0" }, null, 2)}\n`);
}

test("checkpoint source resolution prefers a project sourceOverride over a matching catalog source", async () => {
  const root = await createTempRoot("checkpoint-sources-");
  tempRoots.push(root);
  const catalogRoot = join(root, "catalog");
  const catalogSource = join(catalogRoot, "cards", "mind");
  const overrideSource = join(root, "working", "mind");
  await writeSource(catalogSource, "@me/mind");
  await writeSource(overrideSource, "@me/mind");

  const resolved = await resolveCheckpointSourceDirs({
    cardNames: ["@me/mind"],
    projectRoot: join(root, "project"),
    homeDir: root,
    catalogCheckouts: [catalogRoot],
    sourceOverrides: { "@me/mind": `file:${overrideSource}` },
  });

  expect(resolved).toEqual({ "@me/mind": await realpath(overrideSource) });
});

test("checkpoint source resolution uses a unique catalog source and leaves missing sources unresolved", async () => {
  const root = await createTempRoot("checkpoint-sources-");
  tempRoots.push(root);
  const catalogRoot = join(root, "catalog");
  const catalogSource = join(catalogRoot, "cards", "mind");
  await writeSource(catalogSource, "@me/mind");

  const resolved = await resolveCheckpointSourceDirs({
    cardNames: ["@me/mind", "@me/missing"],
    projectRoot: join(root, "project"),
    homeDir: root,
    catalogCheckouts: [catalogRoot],
  });

  expect(resolved).toEqual({ "@me/mind": await realpath(catalogSource) });
  expect(resolved["@me/missing"]).toBeUndefined();
});
