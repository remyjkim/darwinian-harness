// ABOUTME: Verifies the drwn init command scaffolds per-project config in the caller's working directory.
// ABOUTME: Protects the per-project bootstrap path and the safety semantics around overwriting config.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { resolveUserConfigPath } from "../cli/core/paths";

const tempRoots: string[] = [];

const emptyProject = {
  schema: "drwn.project-config",
  schemaVersion: 1,
  workers: [],
  activeWorker: null,
};

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("drwn init", () => {
  test("creates .agents/drwn/config.json with supported schema version 1", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual(emptyProject);
    expect(JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "machine.json"), "utf8"))).toEqual(createEmptyMachineConfig());
  });

  test("minimal setup creates explicit empty machine intent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "minimal-project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["init", "--minimal", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "machine.json"), "utf8"))).toEqual(createEmptyMachineConfig());
  });

  test("--catalog-checkout registers authoring collections during init", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "catalog-project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli([
      "init", "--non-interactive", "--no-default-catalogs",
      "--catalog-checkout", "~/dev/darwinian-cards",
      "--catalog-checkout", "/work/personal-cards",
    ], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(resolveUserConfigPath(fixture.agentsDir), "utf8"))).toMatchObject({
      catalogCheckouts: ["~/dev/darwinian-cards", "/work/personal-cards"],
    });
  });

  test("exits non-zero when config already exists without force", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ ...emptyProject, skills: { include: ["alpha"] } }, null, 2));

    const result = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ ...emptyProject, skills: { include: ["alpha"] } });
    expect(existsSync(join(fixture.agentsDir, "drwn", "machine.json"))).toBe(false);
  });

  test("force overwrites existing config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ ...emptyProject, skills: { include: ["alpha"] } }, null, 2));

    const result = await runAgentsCli(["init", "--non-interactive", "--force", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual(emptyProject);
  });

  test("ensures drwn gitignore block when .agents is broadly ignored", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, ".gitignore"), ".agents/\n");

    const result = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const gitignore = await readFile(join(projectDir, ".gitignore"), "utf8");
    expect(gitignore).toContain("# drwn");
  });

  test("bare init in non-TTY mode fails with explicit non-interactive guidance", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["init"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("--non-interactive");
  });

  test("guided init in non-TTY mode fails with TTY guidance", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["init", "--guided"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("TTY");
  });
});
