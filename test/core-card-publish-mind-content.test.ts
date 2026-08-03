// ABOUTME: Verifies publish validation for persona and beliefs card content.
// ABOUTME: Protects complete mind-card sources from producing incomplete published trees.

import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeCardIntegrity, publishCard, resolveCard } from "../cli/core/card-store";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldSource(options?: { complete?: boolean; missingBeliefMd?: boolean }) {
  const root = await createTempRoot("card-publish-mind-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(root, "card-sources", "mind");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "card.json"),
    JSON.stringify(
      {
        name: "@me/mind",
        version: "1.0.0",
        persona: { include: ["voice"], visibility: "internal" },
        beliefs: { include: ["engineering"], visibility: "public" },
        memory: { observations: { format: "jsonl" } },
      },
      null,
      2,
    ),
  );
  if (options?.complete || options?.missingBeliefMd) {
    await mkdir(join(sourceDir, "persona", "voice"), { recursive: true });
    await writeFile(join(sourceDir, "persona", "voice", "PERSONA.md"), "voice\n");
    await mkdir(join(sourceDir, "beliefs", "engineering"), { recursive: true });
    if (!options.missingBeliefMd) {
      await writeFile(join(sourceDir, "beliefs", "engineering", "BELIEF.md"), "engineering\n");
    }
  }
  return { agentsDir, sourceDir };
}

test("publishCard rejects missing persona directories declared in the manifest", async () => {
  const { agentsDir, sourceDir } = await scaffoldSource();

  await expect(publishCard(agentsDir, sourceDir)).rejects.toThrow("missing persona directory");
});

test("publishCard rejects bundled beliefs missing BELIEF.md", async () => {
  const { agentsDir, sourceDir } = await scaffoldSource({ missingBeliefMd: true });

  await expect(publishCard(agentsDir, sourceDir)).rejects.toThrow("missing BELIEF.md");
});

test("publishCard succeeds for complete mind content and integrity covers new files", async () => {
  const { agentsDir, sourceDir } = await scaffoldSource({ complete: true });

  const published = await publishCard(agentsDir, sourceDir);
  const resolved = await resolveCard(agentsDir, "@me/mind@1.0.0");
  const before = await computeCardIntegrity(published.versionDir);
  const personaPath = join(published.versionDir, "persona", "voice", "PERSONA.md");
  await chmod(personaPath, 0o644);
  await writeFile(personaPath, "modified\n");
  const after = await computeCardIntegrity(published.versionDir);

  expect(resolved.manifest.persona?.include).toEqual(["voice"]);
  expect(resolved.manifest.beliefs?.include).toEqual(["engineering"]);
  expect(resolved.manifest.memory?.observations?.format).toBe("jsonl");
  expect(after).not.toBe(before);
});
