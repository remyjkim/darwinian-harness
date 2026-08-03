// ABOUTME: Verifies Git-backed card inspection, diff, and validation affordances.
// ABOUTME: Protects history output and real Git diff behavior.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createCatalogCardSource, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card show --json includes Git history for store-origin cards", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: ["alpha"] });

  const result = await runAgentsCli(["card", "show", "@me/backend@1.0.0", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.name).toBe("@me/backend");
  expect(parsed.history[0].subject).toContain("Publish @me/backend@1.0.0");
});

test("card show surfaces manifest quality fields in human and json output", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/quality");
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  Object.assign(manifest, {
    version: "1.0.0",
    skills: { include: ["alpha"] },
    stability: "production",
    lastValidatedWith: "0.1.0",
    testStatusBadge: "https://example.com/status.svg",
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
  expect((await runAgentsCli(["card", "publish", "@me/quality"], envFor(fixture))).exitCode).toBe(0);

  const human = await runAgentsCli(["card", "show", "@me/quality@1.0.0"], envFor(fixture));
  const json = await runAgentsCli(["card", "show", "@me/quality@1.0.0", "--json"], envFor(fixture));

  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain("stability");
  expect(human.stdout).toContain("production");
  expect(human.stdout).toContain("lastValidatedWith");
  expect(human.stdout).toContain("https://example.com/status.svg");
  expect(json.exitCode).toBe(0);
  const parsed = JSON.parse(json.stdout);
  expect(parsed.manifest.stability).toBe("production");
  expect(parsed.manifest.lastValidatedWith).toBe("0.1.0");
  expect(parsed.manifest.testStatusBadge).toBe("https://example.com/status.svg");
});

test("card diff includes semantic classification and real Git diff", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.1.0", skills: ["alpha", "beta"] });

  const result = await runAgentsCli(["card", "diff", "@me/backend@1.0.0", "@me/backend@1.1.0"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Classification: minor");
  expect(result.stdout).toContain("diff --git");
  expect(result.stdout).toContain("beta");
});

test("card validate reports valid and invalid refs", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: ["alpha"] });

  const valid = await runAgentsCli(["card", "validate", "@me/backend@1.0.0", "--json"], envFor(fixture));
  const invalid = await runAgentsCli(["card", "validate", "@me/missing@1.0.0"], envFor(fixture));

  expect(valid.exitCode).toBe(0);
  expect(JSON.parse(valid.stdout).ok).toBe(true);
  expect(invalid.exitCode).not.toBe(0);
  expect(invalid.stderr).toContain("CARD_NOT_FOUND");
});
