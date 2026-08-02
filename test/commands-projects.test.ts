// ABOUTME: Verifies machine project index registration and bulk update commands.
// ABOUTME: Guards opt-in projects.json used by store GC root widening.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  registerProject,
  listRegisteredProjects,
  resolveProjectsIndexPath,
} from "../cli/core/project-registry";
import {
  cleanupTempRoots,
  createInstalledSkillBundle,
  createTempRoot,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("registerProject adds a project path to the machine index", async () => {
  const root = await createTempRoot("projects-registry-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const projectDir = join(root, "project-a");
  await writeSupportedProjectConfig(projectDir);
  await registerProject(agentsDir, projectDir);
  expect(await listRegisteredProjects(agentsDir)).toEqual([projectDir]);
  const index = JSON.parse(await readFile(resolveProjectsIndexPath(agentsDir), "utf8"));
  expect(index.projects).toEqual([projectDir]);
});

test("registerProject is idempotent for the same project", async () => {
  const root = await createTempRoot("projects-registry-idem-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const projectDir = join(root, "project-a");
  await writeSupportedProjectConfig(projectDir);
  await registerProject(agentsDir, projectDir);
  await registerProject(agentsDir, projectDir);
  expect(await listRegisteredProjects(agentsDir)).toEqual([projectDir]);
});

test("registerProject rejects an absent root without creating project state", async () => {
  const root = await createTempRoot("projects-registry-missing-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const projectDir = join(root, "missing-project");

  await expect(registerProject(agentsDir, projectDir)).rejects.toMatchObject({
    code: "PROJECT_REGISTRY_ROOT_INVALID",
  });
  expect(existsSync(projectDir)).toBe(false);
  expect(await listRegisteredProjects(agentsDir)).toEqual([]);
});

test("projects list prints registered projects", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "my-project");
  await writeSupportedProjectConfig(projectDir);
  await registerProject(fixture.agentsDir, projectDir);
  const result = await runAgentsCli(["projects", "list"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(projectDir);
});

test("projects unregister repairs a stale registration and supports dry-run", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "deleted-project");
  const indexPath = resolveProjectsIndexPath(fixture.agentsDir);
  await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify({ schemaVersion: 1, projects: [projectDir] }, null, 2)}\n`);

  const dryRun = await runAgentsCli(["projects", "unregister", projectDir, "--dry-run", "--json"], envFor(fixture));
  expect(dryRun.exitCode).toBe(0);
  expect(JSON.parse(dryRun.stdout)).toMatchObject({ removed: true, dryRun: true, projectRoot: projectDir });
  expect(await listRegisteredProjects(fixture.agentsDir)).toEqual([projectDir]);

  const result = await runAgentsCli(["projects", "unregister", projectDir, "--json"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ removed: true, dryRun: false, projectRoot: projectDir });
  expect(await listRegisteredProjects(fixture.agentsDir)).toEqual([]);
});

test("projects unregister removes a valid project only when it has no standalone references", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "unreferenced-project");
  await writeSupportedProjectConfig(projectDir);
  await registerProject(fixture.agentsDir, projectDir);

  const result = await runAgentsCli(["projects", "unregister", projectDir, "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ removed: true, projectRoot: projectDir });
  expect(await listRegisteredProjects(fixture.agentsDir)).toEqual([]);
});

test("projects unregister refuses to hide a valid standalone inventory reference", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const installed = await createInstalledSkillBundle(fixture.agentsDir, { skillName: "referenced-skill" });
  const projectDir = join(fixture.root, "referenced-project");
  await writeSupportedProjectConfig(projectDir, {
    skills: { include: [installed.skillName], exclude: [] },
  });
  await registerProject(fixture.agentsDir, projectDir);

  const result = await runAgentsCli(["projects", "unregister", projectDir, "--json"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("referenced-skill");
  expect(await listRegisteredProjects(fixture.agentsDir)).toEqual([projectDir]);
});

test("projects prune removes stale registrations and preserves live ones", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Register a live project (has config.json)
  const liveDir = join(fixture.root, "live-project");
  await writeSupportedProjectConfig(liveDir);
  await registerProject(fixture.agentsDir, liveDir);

  // Register a stale project (config.json will be removed)
  const staleDir = join(fixture.root, "stale-project");
  await writeSupportedProjectConfig(staleDir);
  await registerProject(fixture.agentsDir, staleDir);

  // Remove the stale project's config to simulate a deleted checkout
  const { rm } = await import("node:fs/promises");
  await rm(join(staleDir, ".agents", "drwn", "config.json"));

  // Dry-run first
  const dryRun = await runAgentsCli(["projects", "prune", "--dry-run", "--json"], envFor(fixture));
  expect(dryRun.exitCode).toBe(0);
  const dryParsed = JSON.parse(dryRun.stdout);
  expect(dryParsed.pruned).toContain(staleDir);
  expect(dryParsed.pruned).not.toContain(liveDir);
  expect(await listRegisteredProjects(fixture.agentsDir)).toHaveLength(2); // dry-run didn't remove

  // Real prune
  const result = await runAgentsCli(["projects", "prune", "--json"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.pruned).toContain(staleDir);
  expect(parsed.remaining).toBe(1);
  const remaining = await listRegisteredProjects(fixture.agentsDir);
  expect(remaining).toContain(liveDir);
  expect(remaining).not.toContain(staleDir);
});

