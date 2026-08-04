// ABOUTME: Verifies project effective state excludes machine-only defaults.
// ABOUTME: Protects the cards-era scope boundary for project materialization.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildEffectiveState } from "../cli/core/effective-state";
import { writeMachineConfig } from "../cli/core/card-store";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { applyMachineWorkerRoots } from "../cli/core/worker-machine";
import {
  cleanupTempRoots,
  createCatalogCardSource,
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

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

async function installMachineWorker(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { skill: string; server?: string },
) {
  const cardName = `@me/${options.skill}-machine-card`;
  await publishCardWithSkills(fixture, {
    name: cardName,
    skills: [options.skill],
    ...(options.server ? {
      servers: {
        [options.server]: {
          description: options.server,
          transport: "stdio",
          command: options.server,
          optional: false,
        },
      },
    } : {}),
  });
  const workerName = `@me/${options.skill}-machine-worker`;
  await createCatalogCardSource(fixture, workerName, { kind: "blueprint" });
  expect((await runAgentsCli(["worker", "compose", workerName, "--add", `${cardName}@1.0.0`], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["worker", "publish", workerName], envFor(fixture))).exitCode).toBe(0);
  await applyMachineWorkerRoots(fixture.agentsDir, [`${workerName}@1.0.0`], { repoRoot: fixture.repoRoot });
}

test("project write does not include machine capability skills", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  await installMachineWorker(fixture, { skill: "beta" });
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, { skills: { include: ["alpha"] } });

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  expect(existsSync(join(projectDir, ".claude", "skills", "beta"))).toBe(false);
});

test("machine effective state uses only the active Worker closure", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["beta"] });
  tempRoots.push(fixture.root);
  await installMachineWorker(fixture, { skill: "alpha", server: "context7" });

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.root,
    scope: "machine",
  });

  expect(state.skillSelection?.include).toEqual(["alpha"]);
  expect(Object.keys(state.activeServers)).toEqual(["context7"]);
  expect(state.skillSelection?.include).not.toContain("beta");
});

test("empty machine intent disables packaged optional and required MCP defaults", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  await writeMachineConfig(fixture.agentsDir, createEmptyMachineConfig());

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.root,
    scope: "machine",
  });

  expect(state.skillSelection?.include ?? []).toEqual([]);
  expect(state.activeServers).toEqual({});
});

test("buildEffectiveState exposes the project card, skill, MCP, extension, and target merge", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/base",
    skills: ["card-alpha"],
    servers: {
      "card-server": {
        description: "Card server",
        transport: "stdio",
        command: "card-server",
        optional: false,
      },
    },
  });
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base", {
    skills: { include: ["beta"] },
    mcpServers: {
      "project-server": {
        description: "Project server",
        transport: "stdio",
        command: "project-server",
        optional: false,
      },
    },
    extensions: { custom: { enabled: true, flavor: "test" } },
    targets: { cursor: { enabled: false } },
  });

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  });

  expect(state.projectRoot).toBe(projectDir);
  expect(state.lockedCards.map((card) => card.name)).toEqual(["@me/base"]);
  expect(state.skillSelection?.include ?? []).toContain("card-alpha");
  expect(state.skillSelection?.include ?? []).toContain("beta");
  expect(state.activeServers["card-server"]?.command).toBe("card-server");
  expect(state.activeServers["project-server"]?.command).toBe("project-server");
  expect(state.projectConfigWithCards?.extensions?.custom).toEqual({ enabled: true, flavor: "test" });
  expect(state.projectConfigWithCards?.targets?.cursor?.enabled).toBe(false);
  expect(state.scopedOptions.writeScope).toBe("project");
});

test("buildEffectiveState activates a card-local optional MCP with a project toggle", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/base",
    skills: [],
    servers: {
      "card-local": {
        description: "Card-local optional server",
        transport: "stdio",
        command: "card-local-server",
        args: ["--from-card"],
        optional: true,
      },
    },
  });
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base", {
    mcpServers: { "card-local": { enabled: true } },
  });

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  });

  expect(state.effectiveRegistry.servers["card-local"]?.command).toBe("card-local-server");
  expect(state.activeServers["card-local"]?.command).toBe("card-local-server");
});
