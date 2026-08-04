// ABOUTME: Proves project projection depends only on project intent and its selected Worker closure.
// ABOUTME: Protects machine config, Library, compatibility directories, and user-home files from project writes.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildEffectiveState } from "../cli/core/effective-state";
import { seedMcpInventory } from "./mcp-inventory-fixture";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import {
  cleanupTempRoots,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function snapshotTree(root: string, excluded = new Set<string>()): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  if (!existsSync(root)) return snapshot;

  async function visit(path: string, relative: string) {
    if (excluded.has(relative)) return;
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      snapshot[relative] = `link:${await readlink(path)}`;
      return;
    }
    if (stats.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) {
        await visit(join(path, entry), relative ? `${relative}/${entry}` : entry);
      }
      return;
    }
    snapshot[relative] = `file:${Buffer.from(await readFile(path)).toString("base64")}`;
  }

  await visit(root, "");
  return snapshot;
}

function declaredState(state: Awaited<ReturnType<typeof buildEffectiveState>>) {
  return {
    activeWorker: state.workerSelection?.activeWorker,
    activeCards: state.activeCards.map((card) => card.name),
    skills: state.skillSelection,
    mcp: state.activeServers,
    targets: state.effectiveConfig.targets,
  };
}

test("project state and output are independent from machine capability state", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["beta"] });
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/active",
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
    name: "@me/inactive",
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
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(
    projectRoot,
    fixture.agentsDir,
    ["@me/active@1.0.0", "@me/inactive@1.0.0"],
    "@me/active",
  );

  const baselineState = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectRoot,
  });
  expect(Object.keys(baselineState.activeServers)).toEqual(["active-mcp"]);
  expect(baselineState.skillSelection?.include).toEqual(["active-skill"]);

  const firstWrite = await runAgentsCli(["write"], envFor(fixture), projectRoot);
  expect(firstWrite.exitCode, firstWrite.stderr).toBe(0);
  expect(existsSync(join(projectRoot, ".claude", "skills", "active-skill"))).toBe(true);
  expect(existsSync(join(projectRoot, ".claude", "skills", "inactive-skill"))).toBe(false);
  expect(existsSync(join(projectRoot, ".claude", "skills", "beta"))).toBe(false);
  const firstMcp = JSON.parse(await readFile(join(projectRoot, ".mcp.json"), "utf8")) as {
    mcpServers: Record<string, unknown>;
  };
  expect(Object.keys(firstMcp.mcpServers)).toEqual(["active-mcp"]);

  const outputExclusions = new Set([".agents/drwn/write-record.json"]);
  const baselineOutput = await snapshotTree(projectRoot, outputExclusions);

  const machinePath = resolveMachineConfigPath(fixture.agentsDir);
  const machine = {
    schemaVersion: 1,
    capabilities: {
      skills: ["beta"],
      mcpServers: ["context7"],
    },
    defaults: { skills: ["beta"], mcpServers: ["context7"] },
    optional: { context7: true, "machine-only": true },
    parallel: { cli: { enabled: false }, mcp: { enabled: true } },
  };
  await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
  await seedMcpInventory(fixture.agentsDir, {
    version: 1,
    servers: {
      "machine-only": {
        description: "Machine-only MCP",
        transport: "stdio",
        command: "machine-only",
        optional: false,
      },
    },
  });
  for (const [root, name] of [
    [join(fixture.agentsDir, "skills"), "curated-machine"],
    [join(fixture.repoRoot, "skills", "claude-only"), "claude-machine"],
    [join(fixture.repoRoot, "skills", "codex-only"), "codex-machine"],
  ] as const) {
    await mkdir(join(root, name), { recursive: true });
    await writeFile(join(root, name, "SKILL.md"), `---\nname: ${name}\ndescription: machine only\n---\n`);
  }
  await writeFile(fixture.claudeSettings, JSON.stringify({ model: "opus", mcpServers: { ambient: { command: "ambient" } } }, null, 2));
  await writeFile(fixture.claudeUserMcp, JSON.stringify({ mcpServers: { ambient: { command: "ambient" } } }, null, 2));
  await writeFile(fixture.codexConfig, '[mcp_servers.ambient]\ncommand = "ambient"\n');
  await writeFile(fixture.cursorConfig, JSON.stringify({ mcpServers: { ambient: { command: "ambient" } } }, null, 2));

  const mutatedState = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectRoot,
  });
  expect(declaredState(mutatedState)).toEqual(declaredState(baselineState));
  expect(mutatedState.ambientCollisions).toEqual([]);

  const protectedRoots = [
    join(fixture.agentsDir, "drwn"),
    join(fixture.agentsDir, "library"),
    join(fixture.agentsDir, "skills"),
    join(fixture.repoRoot, "skills", "claude-only"),
    join(fixture.repoRoot, "skills", "codex-only"),
    join(fixture.homeDir, ".claude"),
    join(fixture.homeDir, ".claude.json"),
    join(fixture.homeDir, ".codex"),
    join(fixture.homeDir, ".cursor"),
    join(projectRoot, ".agents", "drwn", "config.json"),
    join(projectRoot, ".agents", "drwn", "card.lock"),
  ];
  const protectedBefore = await Promise.all(protectedRoots.map((root) => snapshotTree(root)));
  const commands = [
    ["write"],
    ["write", "--dry-run"],
    ["write", "--target=claude"],
    ["write", "--skills-only"],
    ["write", "--mcp-only"],
  ];
  for (const command of commands) {
    const result = await runAgentsCli(command, envFor(fixture), projectRoot);
    expect(result.exitCode, `${command.join(" ")}\n${result.stderr}`).toBe(0);
    expect(await Promise.all(protectedRoots.map((root) => snapshotTree(root)))).toEqual(protectedBefore);
    if (command.length === 1) {
      expect(await snapshotTree(projectRoot, outputExclusions)).toEqual(baselineOutput);
    }
  }
});
