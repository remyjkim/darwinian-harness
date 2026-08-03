// ABOUTME: Verifies the `drwn worker` blueprint authoring round-trip: new -> compose -> publish -> use.
// ABOUTME: Confirms composedFrom mutation, blueprint publish, and that consuming a blueprint composes its members.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { resolveProjectCards } from "../cli/core/card-project";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("worker new -> compose -> publish -> use round-trips a blueprint", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/react-builder", skills: ["react"] });
  const sourceDir = join(fixture.repoRoot, "frontend-eng");

  expect((await runAgentsCli(["worker", "new", "@me/frontend-eng", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect(
    (await runAgentsCli(["worker", "compose", sourceDir, "--add", "@me/react-builder@^1.0.0"], envFor(fixture)))
      .exitCode,
  ).toBe(0);
  expect((await runAgentsCli(["worker", "publish", "--from", sourceDir], envFor(fixture))).exitCode).toBe(0);

  const locked = await resolveProjectCards(fixture.agentsDir, ["@me/frontend-eng@^1.0.0"]);
  expect(locked.map((c) => c.name)).toEqual(["@me/frontend-eng", "@me/react-builder"]);
  expect(locked[0]!.manifest.kind).toBe("blueprint");
  expect(locked.find((c) => c.name === "@me/react-builder")?.skills).toEqual(["react"]);
});

test("worker compose --remove drops a member", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/a", skills: ["alpha"] });
  const sourceDir = join(fixture.repoRoot, "bp");
  await runAgentsCli(["worker", "new", "@me/bp", "--no-git"], envFor(fixture));
  await runAgentsCli(["worker", "compose", sourceDir, "--add", "@me/a@^1.0.0"], envFor(fixture));
  expect((await runAgentsCli(["worker", "compose", sourceDir, "--remove", "@me/a@^1.0.0"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["worker", "publish", "--from", sourceDir], envFor(fixture))).exitCode).toBe(0);

  const locked = await resolveProjectCards(fixture.agentsDir, ["@me/bp@^1.0.0"]);
  expect(locked.map((c) => c.name)).toEqual(["@me/bp"]);
});

test("worker compose on a non-blueprint card is refused", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/plain", skills: ["x"] });

  const result = await runAgentsCli([
    "worker", "compose", join(fixture.root, "card-sources", "me", "plain"), "--add", "@me/a@^1.0.0",
  ], envFor(fixture));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toMatch(/not a blueprint/);
});
