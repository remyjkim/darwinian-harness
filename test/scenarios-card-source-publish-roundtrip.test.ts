// ABOUTME: Proves CLI-authored card sources publish and consume without manual file edits.
// ABOUTME: Covers the source -> publish -> apply -> write roundtrip for task 26.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, createCatalogCardSource, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card source authoring commands can publish, apply, and preview materialization", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  await createCatalogCardSource(fixture, "@me/example");
  expect((await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], envFor(fixture))).exitCode).toBe(0);
  expect(
    (
      await runAgentsCli(
        ["card", "source", "set", "@me/example", "--description", "Example source", "--version", "0.1.0"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  const doctor = await runAgentsCli(["card", "source", "doctor", "@me/example", "--json"], envFor(fixture));
  expect(doctor.exitCode).toBe(0);
  expect(JSON.parse(doctor.stdout).ok).toBe(true);

  const published = await runAgentsCli(["card", "publish", "@me/example"], envFor(fixture));
  expect(published.exitCode).toBe(0);
  expect(existsSync(join(fixture.agentsDir, "drwn", "cards", "@me", "example.git"))).toBe(true);

  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);

  const applied = await runAgentsCli(["apply", "@me/example@^0.1.0"], envFor(fixture), projectDir);
  expect(applied.exitCode).toBe(0);
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
  expect(lock.cards[0].name).toBe("@me/example");
  expect(lock.cards[0].version).toBe("0.1.0");

  const dryRun = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectDir);
  expect(dryRun.exitCode).toBe(0);
  const writePlan = JSON.parse(dryRun.stdout);
  expect(writePlan.changes.some((change: string) => change.includes("vendor/") || change.includes("/skills/alpha"))).toBe(true);
});
