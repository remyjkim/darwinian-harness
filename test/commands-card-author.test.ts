// ABOUTME: Verifies card source authoring and local publishing commands.
// ABOUTME: Protects the immutable local store contract for Cards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCardBareRepoPath, resolveExtractedRoot } from "../cli/core/store-paths";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card new creates an ordinary source directory and persists scope as a user preference", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["card", "new", "backend", "--scope", "@me", "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(join(fixture.repoRoot, "backend", "card.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "drwn", "sources"))).toBe(false);
  expect(existsSync(join(fixture.agentsDir, "drwn", "machine.json"))).toBe(false);
  const preferences = JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "config.json"), "utf8"));
  expect(preferences.defaultAuthorScope).toBe("@me");
});

test("card new --into creates the manifest-named repository beneath the selected directory", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const collection = join(fixture.root, "darwinian-cards", "cards");

  const result = await runAgentsCli(["card", "new", "@me/backend", "--into", collection, "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(await readFile(join(collection, "backend", "card.json"), "utf8"))).toMatchObject({
    name: "@me/backend",
  });
});

test("card new fails for unscoped non-interactive names without authoring scope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["card", "new", "backend", "--no-git"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("scope");
});

test("card publish creates immutable version and card show displays it", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const versionDir = await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@me/backend"))).toBe(true);
  expect(versionDir).toStartWith(resolveExtractedRoot(fixture.agentsDir));
  expect(existsSync(join(versionDir, "card.json"))).toBe(true);

  const show = await runAgentsCli(["card", "show", "@me/backend@1.0.0"], envFor(fixture));
  expect(show.exitCode).toBe(0);
  expect(show.stdout).toContain("@me/backend");
});

test("card publish accepts --from and uses card.json as authoritative identity", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = join(fixture.root, "repositories", "unrelated-slug");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/path-card", version: "1.0.0" })}\n`);

  const result = await runAgentsCli(["card", "publish", "--from", sourceDir], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("@me/path-card@1.0.0");
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@me/path-card"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "drwn", "sources"))).toBe(false);
});

test("card publish rejects a positional name that disagrees with --from manifest identity", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = join(fixture.root, "repositories", "path-card");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/path-card", version: "1.0.0" })}\n`);

  const result = await runAgentsCli(["card", "publish", "@me/other", "--from", sourceDir], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("does not match");
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@me/path-card"))).toBe(false);
});

test("card publish refuses to overwrite an existing version", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceRoot = join(fixture.repoRoot, "backend");
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "--from", sourceRoot], envFor(fixture))).exitCode).toBe(0);

  const second = await runAgentsCli(["card", "publish", "--from", sourceRoot], envFor(fixture));

  expect(second.exitCode).not.toBe(0);
  expect(second.stderr).toContain("already exists");
});

test("card publish rejects package contract mismatch", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceRoot = join(fixture.repoRoot, "backend");
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  await writeFile(
    join(sourceRoot, "package.json"),
    JSON.stringify({ name: "@me/wrong", version: "1.0.0" }, null, 2),
  );

  const result = await runAgentsCli(["card", "publish", "--from", sourceRoot], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("package.json.name");
});

test("card publish fails when skills.include references a missing source directory", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture));
  const sourceRoot = join(fixture.repoRoot, "backend");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills = { include: ["polish"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const published = await runAgentsCli(["card", "publish", "--from", sourceRoot], envFor(fixture));

  expect(published.exitCode).not.toBe(0);
  expect(published.stderr).toContain("missing skill directory 'polish'");
});

test("card publish succeeds when every skills.include has a matching source directory", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture));
  const sourceRoot = join(fixture.repoRoot, "backend");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills = { include: ["polish"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceRoot, "skills", "polish"), { recursive: true });
  await writeFile(join(sourceRoot, "skills", "polish", "SKILL.md"), "---\nname: polish\ndescription: polish\n---\n");

  const published = await runAgentsCli(["card", "publish", "--from", sourceRoot], envFor(fixture));

  expect(published.exitCode).toBe(0);
});

test("card publish succeeds after source add-skill prepares the bundled skill", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceRoot = join(fixture.repoRoot, "backend");
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-skill", sourceRoot, "alpha"], envFor(fixture))).exitCode).toBe(0);

  const published = await runAgentsCli(["card", "publish", "--from", sourceRoot], envFor(fixture));

  expect(published.exitCode).toBe(0);
});

test("card diff classifies structural changes", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: [] });
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.1.0", skills: ["alpha"] });

  const diff = await runAgentsCli(["card", "diff", "@me/backend@1.0.0", "@me/backend@1.1.0"], envFor(fixture));

  expect(diff.exitCode).toBe(0);
  expect(diff.stdout).toContain("Classification: minor");
});

test("card new ignores unsupported prototype directories without migrating them", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
  await mkdir(join(fixture.agentsDir, "library"), { recursive: true });
  await mkdir(join(fixture.agentsDir, "packages", "skills", "@acme", "skills", "1.0.0"), { recursive: true });
  await writeFile(join(fixture.agentsDir, "drwn", "config.json"), JSON.stringify({ version: 1, optional: {} }, null, 2));
  await writeFile(
    join(fixture.agentsDir, "library", "mcp-servers.json"),
    JSON.stringify({ version: 1, servers: {} }, null, 2),
  );

  const result = await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(join(fixture.agentsDir, "library", "mcp-servers.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "packages", "skills", "@acme", "skills", "1.0.0"))).toBe(true);
});
