// ABOUTME: Verifies the Wave 2 `drwn card new --from-project` authoring entry point.
// ABOUTME: Exercises capture through the CLI and proves captured sources can be published.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadUserPreferences } from "../cli/core/user-preferences";
import {
  cleanupTempRoots,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card new --from-project captures a project and the captured source can be published", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/base", skills: ["card-alpha"] });
  const projectDir = join(fixture.root, "project");
  const collectionDir = join(fixture.root, "captured-cards");
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base", {
    skills: { include: ["beta"] },
  });

  const capture = await runAgentsCli(["card", "new", "@me/captured", "--from-project", projectDir, "--into", collectionDir, "--no-git"], envFor(fixture));

  expect(capture.exitCode).toBe(0);
  expect(capture.stdout).toContain("Captured card source @me/captured");
  const sourceDir = join(collectionDir, "captured");
  expect(existsSync(join(sourceDir, "skills", "card-alpha", "SKILL.md"))).toBe(true);
  expect(existsSync(join(sourceDir, "skills", "beta", "SKILL.md"))).toBe(true);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.version).toBe("0.1.0");
  expect(manifest.skills.include).toEqual(["card-alpha", "beta"]);
  expect(capture.stdout).toContain(`drwn card publish --from ${sourceDir}`);
  expect((await loadUserPreferences(fixture.agentsDir)).defaultAuthorScope).toBe("@me");

  const publish = await runAgentsCli(["card", "publish", "--from", sourceDir], envFor(fixture));
  expect(publish.exitCode).toBe(0);
  expect(publish.stdout).toContain("Published @me/captured@0.1.0");
});

test("card new --from-project without a path captures the current project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/base", skills: [] });
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base", {
    skills: { include: ["alpha"] },
  });

  const capture = await runAgentsCli(["card", "new", "@me/cwd-capture", "--from-project", "--no-git"], envFor(fixture), projectDir);

  expect(capture.exitCode).toBe(0);
  expect(existsSync(join(projectDir, "cwd-capture", "skills", "alpha", "SKILL.md"))).toBe(true);
});

test("card new --from-project fails clearly outside a drwn project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const nonProjectDir = join(fixture.root, "not-project");
  await mkdir(nonProjectDir, { recursive: true });

  const capture = await runAgentsCli(["card", "new", "@me/missing", "--from-project", nonProjectDir, "--no-git"], envFor(fixture));

  expect(capture.exitCode).toBe(1);
  expect(capture.stderr).toContain("Not a drwn project");
});

test("card new --from-project fails without an active Worker and creates no source", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);

  const capture = await runAgentsCli(
    ["card", "new", "@me/no-worker", "--from-project", "--no-git"],
    envFor(fixture),
    projectDir,
  );

  expect(capture.exitCode).toBe(1);
  expect(capture.stderr).toContain("active Worker");
  expect(existsSync(join(projectDir, "no-worker"))).toBe(false);
});

test("card new rejects a project path positional without --from-project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["card", "new", "@me/blank", fixture.root, "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Project path is only valid with --from-project");
});
