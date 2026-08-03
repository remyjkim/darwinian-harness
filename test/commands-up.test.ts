// ABOUTME: Verifies drwn up reports nothing-to-update and update flows.
// ABOUTME: Covers porcelain orchestration over outdated detection and write.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

async function readLock(projectDir: string) {
  return JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
}

test("up reports nothing to update for current lock", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/up", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, {
    workers: ["@me/up@1.0.0"],
    activeWorker: "@me/up",
  });
  const { resolveCard } = await import("../cli/core/card-store");
  const resolved = await resolveCard(fixture.agentsDir, "@me/up@1.0.0");
  await writeTestCardLock(projectDir, [
    {
      name: resolved.name,
      requested: "@me/up@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: resolved.origin,
      ...(resolved.git ? { git: resolved.git } : {}),
    },
  ]);

  const result = await runAgentsCli(["up", "--no-fetch"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/Nothing to update/);
});

test("up re-grants instruction consent in-range when content changes on version bump", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Create a card with instructions, publish 1.0.0
  expect((await runAgentsCli(["card", "new", "@me/upregrant", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "upregrant");
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.instructions = { text: "Original instruction content." };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/upregrant"], envFor(fixture))).exitCode).toBe(0);

  // Set up project with a range ref so `up` can re-resolve to 1.1.0
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["apply", "@me/upregrant@>=1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/upregrant", "--instructions", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const originalConsent = (await readLock(projectDir)).cards[0].instructionConsent;
  expect(originalConsent).toBeDefined();

  // Publish 1.1.0 with CHANGED instruction content (within the ^1.0.0 consent range)
  const m2 = JSON.parse(await readFile(manifestPath, "utf8"));
  m2.version = "1.1.0";
  m2.instructions.text = "Updated instruction content for v1.1.0.";
  await writeFile(manifestPath, `${JSON.stringify(m2, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/upregrant"], envFor(fixture))).exitCode).toBe(0);

  // Run `drwn up` — should re-resolve to 1.1.0 AND auto-re-grant instruction consent
  const result = await runAgentsCli(["up", "--no-fetch"], envFor(fixture), projectDir);
  expect(result.exitCode, result.stderr).toBe(0);

  // Verify the lock re-resolved
  const lock = await readLock(projectDir);
  expect(lock.cards[0].version).toBe("1.1.0");

  // Verify instruction consent was re-granted (not dropped)
  const regrantedConsent = lock.cards[0].instructionConsent;
  expect(regrantedConsent).toBeDefined();
  expect(regrantedConsent.consentedRange).toBe("^1.0.0");
  expect(regrantedConsent.contentDigest).not.toBe(originalConsent.contentDigest);
  expect(result.stdout).toContain("instruction consent re-granted");
});
