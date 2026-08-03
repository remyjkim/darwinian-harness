// ABOUTME: Verifies read-only inventory and classification of the retired machine-store Card source tree.
// ABOUTME: Ensures migration guidance never creates, moves, or deletes legacy or canonical repositories.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inventoryLegacyCardSources } from "../cli/core/legacy-card-sources";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const roots: string[] = [];
afterEach(async () => cleanupTempRoots(roots));

test("missing legacy source root reports an empty read-only inventory", async () => {
  const root = await createTempRoot("legacy-source-empty-");
  roots.push(root);
  const agentsDir = join(root, ".agents");

  const report = await inventoryLegacyCardSources({ agentsDir, homeDir: root, catalogCheckouts: [] });

  expect(report.exists).toBe(false);
  expect(report.entries).toEqual([]);
  expect(existsSync(join(agentsDir, "drwn", "sources"))).toBe(false);
});

test("classifies canonical, unresolved, and invalid legacy sources without mutation", async () => {
  const root = await createTempRoot("legacy-source-report-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  const legacyRoot = join(agentsDir, "drwn", "sources");
  const catalogRoot = join(root, "darwinian-cards");
  const canonical = join(catalogRoot, "cards", "canonical-repo");
  await mkdir(join(legacyRoot, "@me", "canonical"), { recursive: true });
  await mkdir(join(legacyRoot, "@me", "unresolved"), { recursive: true });
  await mkdir(join(legacyRoot, "broken"), { recursive: true });
  await mkdir(canonical, { recursive: true });
  const manifest = (name: string) => `${JSON.stringify({ name, version: "1.0.0" })}\n`;
  await writeFile(join(legacyRoot, "@me", "canonical", "card.json"), manifest("@me/canonical"));
  await writeFile(join(legacyRoot, "@me", "unresolved", "card.json"), manifest("@me/unresolved"));
  await writeFile(join(legacyRoot, "broken", "card.json"), "{bad-json\n");
  await writeFile(join(canonical, "card.json"), manifest("@me/canonical"));
  const before = await readFile(join(legacyRoot, "@me", "canonical", "card.json"), "utf8");

  const report = await inventoryLegacyCardSources({ agentsDir, homeDir: root, catalogCheckouts: [catalogRoot] });

  expect(report.entries.map((entry) => [entry.name, entry.status])).toEqual([
    ["@me/canonical", "canonical"],
    ["@me/unresolved", "unresolved"],
    [null, "invalid"],
  ]);
  expect(report.entries[0]?.canonicalPath).toBe(await realpath(canonical));
  expect(report.guidance).toContain("does not delete");
  expect(await readFile(join(legacyRoot, "@me", "canonical", "card.json"), "utf8")).toBe(before);
});
