// ABOUTME: Verifies release pipeline step reporting and dry-run behavior.
// ABOUTME: Guards source-sync and doctor gating before publish; remote push deferred post-V1.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runRelease } from "../cli/core/release-pipeline";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("runRelease dry-run proposes version without publishing", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const match = "@me/release".match(/^(@[^/]+)\/(.+)$/);
  const scope = match?.[1];
  const cardName = match?.[2];
  if (!scope || !cardName) {
    throw new Error("invalid card name");
  }
  const sourceRoot = join(fixture.root, "card-sources", cardName);
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, "card.json"),
    `${JSON.stringify({ name: "@me/release", version: "1.0.0", skills: { include: ["alpha"] } }, null, 2)}\n`,
  );
  await mkdir(join(sourceRoot, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceRoot, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");

  const result = await runRelease(fixture.agentsDir, sourceRoot);
  expect(result.ok).toBe(true);
  expect(result.dryRun).toBe(true);
  expect(result.proposedVersion).toBe("1.0.1");
  expect(result.steps.some((step) => step.step === "source-sync")).toBe(true);
});
