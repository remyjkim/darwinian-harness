// ABOUTME: Verifies semantic inspection of editable card sources.
// ABOUTME: Protects source authoring diagnostics before CLI mutation commands build on them.

import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCardSource } from "../cli/core/card-store";
import { doctorCardSource, listCardSources, readCardSourceState } from "../cli/core/card-source";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createAgentsDir() {
  const root = await createTempRoot("card-source-core-");
  tempRoots.push(root);
  return join(root, ".agents");
}

test("listCardSources returns an empty list when no sources exist", async () => {
  const agentsDir = await createAgentsDir();

  await expect(listCardSources(agentsDir)).resolves.toEqual([]);
});

test("listCardSources lists multiple source manifests in stable name order", async () => {
  const agentsDir = await createAgentsDir();
  await createCardSource({ agentsDir, name: "@me/beta", noGit: true });
  await createCardSource({ agentsDir, name: "@me/alpha", noGit: true });

  const sources = await listCardSources(agentsDir);

  expect(sources.map((source) => source.name)).toEqual(["@me/alpha", "@me/beta"]);
  expect(sources[0]?.version).toBe("1.0.0");
  expect(sources[0]?.path).toEndWith(join(".agents", "drwn", "sources", "@me", "alpha"));
});

test("readCardSourceState reports manifest skills, bundled skills, and orphaned skill dirs", async () => {
  const agentsDir = await createAgentsDir();
  const source = await createCardSource({ agentsDir, name: "@me/example", noGit: true });
  const manifest = JSON.parse(await Bun.file(source.manifestPath).text());
  manifest.skills = { include: ["alpha", "missing"] };
  await writeFile(source.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(source.sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(source.sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
  await mkdir(join(source.sourceDir, "skills", "orphan"), { recursive: true });
  await writeFile(join(source.sourceDir, "skills", "orphan", "SKILL.md"), "---\nname: orphan\ndescription: orphan\n---\n");

  const state = await readCardSourceState(agentsDir, "@me/example");

  expect(state.name).toBe("@me/example");
  expect(state.manifestSkills).toEqual(["alpha", "missing"]);
  expect(state.bundledSkills.map((skill) => skill.name)).toEqual(["alpha", "orphan"]);
  expect(state.orphanedSkills).toEqual(["orphan"]);
  expect(state.missingSkillDirs).toEqual(["missing"]);
  expect(state.ok).toBe(false);
});

test("readCardSourceState accepts an ordinary source directory and trusts manifest identity", async () => {
  const root = await createTempRoot("card-source-path-");
  tempRoots.push(root);
  const sourceDir = join(root, "repository-with-unrelated-slug");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/path-card", version: "1.0.0" })}\n`);

  const state = await readCardSourceState(sourceDir);

  expect(state.name).toBe("@me/path-card");
  expect(state.sourceDir).toBe(sourceDir);
  expect(state.ok).toBe(true);
});

test("doctorCardSource reports missing SKILL.md and package.json name/version mismatch", async () => {
  const agentsDir = await createAgentsDir();
  const source = await createCardSource({ agentsDir, name: "@me/example", noGit: true });
  const manifest = JSON.parse(await Bun.file(source.manifestPath).text());
  manifest.skills = { include: ["alpha"] };
  await writeFile(source.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(source.sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(source.sourceDir, "package.json"), JSON.stringify({ name: "@me/wrong", version: "2.0.0" }));

  const report = await doctorCardSource(agentsDir, "@me/example");

  expect(report.ok).toBe(false);
  expect(report.issues.map((issue) => issue.code)).toContain("missing_skill_md");
  expect(report.issues.map((issue) => issue.code)).toContain("package_name_mismatch");
  expect(report.issues.map((issue) => issue.code)).toContain("package_version_mismatch");
});

test("doctorCardSource reports malformed manifests, package files, and MCP server JSON", async () => {
  const agentsDir = await createAgentsDir();
  const source = await createCardSource({ agentsDir, name: "@me/example", noGit: true });
  await writeFile(source.manifestPath, "{not-json");
  await writeFile(join(source.sourceDir, "package.json"), "{not-json");
  await mkdir(join(source.sourceDir, "mcp-servers"), { recursive: true });
  await writeFile(join(source.sourceDir, "mcp-servers", "broken.json"), "{not-json");

  const report = await doctorCardSource(agentsDir, "@me/example");

  expect(report.ok).toBe(false);
  expect(report.issues.map((issue) => issue.code)).toContain("invalid_card_json");
  expect(report.issues.map((issue) => issue.code)).toContain("invalid_package_json");
  expect(report.issues.map((issue) => issue.code)).toContain("invalid_mcp_json");
});

test("doctorCardSource scans all sources when no name is supplied", async () => {
  const agentsDir = await createAgentsDir();
  await createCardSource({ agentsDir, name: "@me/healthy", noGit: true });
  const broken = await createCardSource({ agentsDir, name: "@me/broken", noGit: true });
  await rm(broken.manifestPath);

  const report = await doctorCardSource(agentsDir);

  expect(report.sources.map((source) => source.name)).toEqual(["@me/broken", "@me/healthy"]);
  expect(report.ok).toBe(false);
  expect(report.issues.map((issue) => issue.code)).toContain("missing_card_json");
});
