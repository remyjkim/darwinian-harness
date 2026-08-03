// ABOUTME: Verifies machine effective state derives only from the selected verified Blueprint closure.
// ABOUTME: Rejects missing or modified active bytes while excluding inactive roots and standalone inventory.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildEffectiveState } from "../cli/core/effective-state";
import { applyMachineWorkerRoots, useMachineWorker } from "../cli/core/worker-machine";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  members: string[],
) {
  await createCatalogCardSource(fixture, name, { kind: "blueprint" });
  for (const member of members) {
    const compose = await runAgentsCli(["worker", "compose", name, "--add", member], envFor(fixture));
    expect(compose.exitCode, compose.stderr).toBe(0);
  }
  const publish = await runAgentsCli(["worker", "publish", name], envFor(fixture));
  expect(publish.exitCode, publish.stderr).toBe(0);
}

async function machineFixture() {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["beta"] });
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/active-card",
    skills: ["active-skill"],
    servers: {
      "active-mcp": {
        description: "Active MCP",
        transport: "stdio",
        command: "active-mcp",
        optional: false,
      },
    },
  });
  await publishCardWithSkills(fixture, {
    name: "@me/inactive-card",
    skills: ["inactive-skill"],
    servers: {
      "inactive-mcp": {
        description: "Inactive MCP",
        transport: "stdio",
        command: "inactive-mcp",
        optional: false,
      },
    },
  });
  await publishBlueprint(fixture, "@me/active-worker", ["@me/active-card@1.0.0"]);
  await publishBlueprint(fixture, "@me/inactive-worker", ["@me/inactive-card@1.0.0"]);
  await applyMachineWorkerRoots(
    fixture.agentsDir,
    ["@me/active-worker@1.0.0", "@me/inactive-worker@1.0.0"],
    { active: "@me/active-worker", repoRoot: fixture.repoRoot },
  );
  return fixture;
}

async function machineState(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, cwd = fixture.root) {
  return buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd,
    scope: "machine",
  });
}

describe("machine Worker effective state", () => {
  test("activates exactly the selected root closure in deterministic order", async () => {
    const fixture = await machineFixture();
    const state = await machineState(fixture);

    expect(state.workerSelection?.selectionSource).toBe("machine");
    expect(state.workerSelection?.installedRoots.map((root) => root.name)).toEqual([
      "@me/active-worker",
      "@me/inactive-worker",
    ]);
    expect(state.activeCards.map((card) => card.name)).toEqual(["@me/active-worker", "@me/active-card"]);
    expect(state.lockedCards.map((card) => card.name)).toEqual([
      "@me/active-worker",
      "@me/active-card",
      "@me/inactive-worker",
      "@me/inactive-card",
    ]);
    expect(state.skillSelection?.include).toEqual(["active-skill"]);
    expect(Object.keys(state.activeServers)).toEqual(["active-mcp"]);
    expect(state.skillSelection?.include).not.toContain("beta");
    expect(state.skillSelection?.include).not.toContain("inactive-skill");
    expect(state.cardServerDefinitions.map((entry) => entry.serverName)).toEqual(["active-mcp"]);
    expect(state.inactiveCardServerDefinitions.map((entry) => entry.serverName)).toEqual(["inactive-mcp"]);
  });

  test("null selection retains alternatives but activates no Card or inventory default", async () => {
    const fixture = await machineFixture();
    await useMachineWorker(fixture.agentsDir, null, { repoRoot: fixture.repoRoot });

    const state = await machineState(fixture);
    expect(state.workerSelection?.installedRoots).toHaveLength(2);
    expect(state.workerSelection?.selectedRoot).toBeNull();
    expect(state.activeCards).toEqual([]);
    expect(state.skillSelection?.include ?? []).toEqual([]);
    expect(state.activeServers).toEqual({});
  });

  test("project selection is exclusive even when machine intent is active", async () => {
    const fixture = await machineFixture();
    await publishCardWithSkills(fixture, { name: "@me/project", skills: ["project-skill"] });
    const projectRoot = join(fixture.root, "project");
    await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/project@1.0.0"], "@me/project");

    const state = await buildEffectiveState({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
      cwd: projectRoot,
    });
    expect(state.workerSelection?.selectionSource).toBe("project");
    expect(state.activeCards.map((card) => card.name)).toEqual(["@me/project"]);
    expect(state.skillSelection?.include).toEqual(["project-skill"]);
    expect(state.skillSelection?.include).not.toContain("active-skill");
  });

  test("missing or modified active Store bytes fail before planning", async () => {
    for (const mode of ["missing", "modified"] as const) {
      const fixture = await machineFixture();
      const machine = JSON.parse(await readFile(resolveMachineConfigPath(fixture.agentsDir), "utf8"));
      const card = machine.capabilities.workerLock.cards.find(
        (entry: { name: string }) => entry.name === "@me/active-card",
      );
      if (mode === "missing") {
        await rm(card.path, { recursive: true, force: true });
      } else {
        const manifestPath = join(card.path, "card.json");
        await chmod(manifestPath, 0o644);
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.description = "tampered";
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }

      await expect(machineState(fixture)).rejects.toMatchObject({
        code: mode === "missing" ? "MACHINE_WORKER_CONTENT_MISSING" : "MACHINE_WORKER_INTEGRITY_MISMATCH",
      });
    }
  });

  test("a modified explicit file-origin root is rejected by its locked integrity", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const sourceDir = join(fixture.root, "file-worker");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({
      name: "@me/file-worker",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: [],
    }, null, 2)}\n`);
    await applyMachineWorkerRoots(fixture.agentsDir, [`file:${sourceDir}`], {
      allowUntrustedSource: true,
      repoRoot: fixture.repoRoot,
    });
    await writeFile(join(sourceDir, "foreign.txt"), "changed\n");

    await expect(machineState(fixture)).rejects.toMatchObject({ code: "MACHINE_WORKER_INTEGRITY_MISMATCH" });
  });

  test("missing inactive alternative bytes do not affect the active closure", async () => {
    const fixture = await machineFixture();
    const machine = JSON.parse(await readFile(resolveMachineConfigPath(fixture.agentsDir), "utf8"));
    const inactive = machine.capabilities.workerLock.cards.find(
      (entry: { name: string }) => entry.name === "@me/inactive-card",
    );
    await rm(inactive.path, { recursive: true, force: true });

    const state = await machineState(fixture);
    expect(state.activeCards.map((card) => card.name)).toEqual(["@me/active-worker", "@me/active-card"]);
  });
});
