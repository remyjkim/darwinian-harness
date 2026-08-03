// ABOUTME: Verifies the public `drwn status` command in human and JSON modes.
// ABOUTME: Ensures the CLI can summarize repo, aggregation, target, and skill state consistently.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, publishExactOperatorProfile, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";
import { writeMachineConfig } from "../cli/core/card-store";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { DARWINIAN_OPERATOR_SKILL_IDS } from "../cli/core/operator-profile-contract";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function installStatusProfile(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return (await publishExactOperatorProfile(fixture)).profile;
}

describe("drwn status", () => {
  test("project JSON reports the supported declared-state and diagnostic ambient contract", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, {
      name: "@me/worker",
      skills: ["worker-skill"],
      servers: {
        "worker-mcp": {
          description: "Worker MCP",
          transport: "stdio",
          command: "worker-mcp",
          optional: false,
        },
      },
    });
    const { seedMcpInventory } = await import("./mcp-inventory-fixture");
    await seedMcpInventory(fixture.agentsDir, {
      version: 1,
      servers: {
        "machine-only": {
          description: "Machine only",
          transport: "stdio",
          command: "machine-only",
          optional: false,
        },
      },
    });
    await writeFile(fixture.codexConfig, '[mcp_servers.ambient-only]\ncommand = "ambient"\n');
    const projectDir = join(fixture.root, "project-contract");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["apply", "@me/worker@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["status", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode, result.stderr).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status).toMatchObject({
      schema: "drwn.project-status",
      schemaVersion: 1,
      activeWorker: "@me/worker",
      selectionSource: "project",
      ambientCapabilities: { enforcement: "target-native", collisions: [] },
    });
    expect(status.installedWorkers.map((entry: { id: string }) => entry.id)).toEqual(["@me/worker"]);
    expect(status.activeCards.map((entry: { id: string }) => entry.id)).toEqual(["@me/worker"]);
    expect(status.declaredCapabilities.skills.map((entry: { id: string }) => entry.id)).toContain("worker-skill");
    expect(status.declaredCapabilities.mcp.map((entry: { id: string }) => entry.id)).toContain("worker-mcp");
    expect(status.declaredCapabilities.mcp.map((entry: { id: string }) => entry.id)).not.toContain("machine-only");
    expect(status.ambientCapabilities.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ambient-only", target: "codex" }),
    ]));
  });

  test("project JSON reports redacted target-native ambient MCP dispositions", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "ambient-status");
    await writeSupportedProjectConfig(projectDir, {
      mcpServers: {
        notion: {
          description: "Project Notion",
          transport: "stdio",
          command: "npx",
          env: { NOTION_TOKEN: "project-secret-sentinel" },
          optional: false,
        },
      },
    });
    await writeFile(
      fixture.codexConfig,
      '[mcp_servers.notion]\nurl = "https://mcp.notion.com/mcp"\nbearer_token_env_var = "USER_SECRET_SENTINEL"\n',
    );

    const result = await runAgentsCli(["status", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode, result.stderr).toBe(0);
    const status = JSON.parse(result.stdout) as {
      ambientCapabilities: {
        enforcement: string;
        collisions: Array<{
          target: string;
          id: string;
          disposition: string;
          reasonCode: string;
          declared: { source: string; transport: string };
          ambient: { source: string; transport: string };
        }>;
      };
    };
    expect(status.ambientCapabilities.enforcement).toBe("target-native");
    expect(status.ambientCapabilities.collisions).toContainEqual(expect.objectContaining({
      target: "codex",
      id: "notion",
      disposition: "fatal",
      reasonCode: "CODEX_INCOMPATIBLE_TRANSPORTS",
      declared: expect.objectContaining({ source: "project", transport: "stdio" }),
      ambient: expect.objectContaining({ source: "user", transport: "http" }),
    }));
    expect(result.stdout).not.toContain("project-secret-sentinel");
    expect(result.stdout).not.toContain("USER_SECRET_SENTINEL");
  });

  test("human output reports the supported machine schema and capability counts", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["status"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(fixture.repoRoot);
    expect(result.stdout).toContain(fixture.agentsDir);
    expect(result.stdout).toContain("machineSchema");
    expect(result.stdout).toContain("drwn.machine@1");
    expect(result.stdout).toContain("resolvedSkillCount");
  });

  test("machine JSON uses the namespaced status schema and explicit empty intent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      schema: "drwn.machine-status",
      schemaVersion: 1,
      config: { schema: "drwn.machine", schemaVersion: 1 },
      profile: null,
      capabilities: {
        skills: [],
        mcpServers: [],
        counts: { resolvedSkills: 0, missingSkills: 0, resolvedMcpServers: 0, missingMcpServers: 0 },
      },
      projection: { healthy: true, current: true, conflicts: [] },
    });
  });

  test("--machine returns machine status while a project config is in scope", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project-machine-status");
    await writeSupportedProjectConfig(projectDir, { skills: { include: ["alpha"] } });

    const result = await runAgentsCli(["status", "--machine", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      schema: "drwn.machine-status",
      schemaVersion: 1,
      config: { schema: "drwn.machine", schemaVersion: 1 },
    });
    expect(parsed.project).toBeUndefined();
    expect(parsed.activeWorker).toBeUndefined();
  });

  test("machine JSON reports profile and explicit provenance without secret-bearing definitions", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const profile = await installStatusProfile(fixture);
    const { ensureStoreInitialized } = await import("../cli/core/card-store");
    const { seedMcpInventory } = await import("./mcp-inventory-fixture");
    await ensureStoreInitialized(fixture.agentsDir);
    await seedMcpInventory(fixture.agentsDir, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
          optional: true,
        },
      },
    });
    await writeMachineConfig(fixture.agentsDir, {
      ...createEmptyMachineConfig(),
      capabilities: { profile, skills: ["alpha"], mcpServers: ["github"] },
    });

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.profile).toMatchObject({
      id: "darwinian-operator",
      name: "@darwinian/operator",
      version: profile.version,
      commit: profile.commit,
      treeSha: profile.treeSha,
      integrity: profile.integrity,
      status: "verified",
    });
    expect(parsed.capabilities.skills).toHaveLength(DARWINIAN_OPERATOR_SKILL_IDS.length + 1);
    for (const id of DARWINIAN_OPERATOR_SKILL_IDS) {
      expect(parsed.capabilities.skills).toContainEqual(
        expect.objectContaining({ id, provenance: "profile", profileId: "darwinian-operator", status: "resolved" }),
      );
    }
    expect(parsed.capabilities.skills).toContainEqual(
      expect.objectContaining({ id: "alpha", provenance: "explicit", status: "resolved" }),
    );
    expect(parsed.capabilities.mcpServers).toEqual([
      expect.objectContaining({ id: "github", provenance: "explicit", status: "resolved" }),
    ]);
    expect(parsed.capabilities.counts).toEqual({
      resolvedSkills: DARWINIAN_OPERATOR_SKILL_IDS.length + 1,
      missingSkills: 0,
      resolvedMcpServers: 1,
      missingMcpServers: 0,
    });
    expect(result.stdout).not.toContain("status-secret-sentinel");
    expect(result.stdout).not.toContain("GITHUB_TOKEN");
  });

  test("machine JSON reports unresolved explicit capabilities without exposing definitions", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await writeMachineConfig(fixture.agentsDir, {
      ...createEmptyMachineConfig(),
      capabilities: { profile: null, skills: ["missing-skill"], mcpServers: ["missing-mcp"] },
    });

    const result = await runAgentsCli(["status", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.capabilities.counts).toEqual({
      resolvedSkills: 0,
      missingSkills: 1,
      resolvedMcpServers: 0,
      missingMcpServers: 1,
    });
    expect(parsed.projection).toMatchObject({ healthy: false, current: false, conflicts: [] });
    expect(parsed.projection.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("missing-skill"),
      expect.stringContaining("missing-mcp"),
    ]));
    expect(result.stdout).not.toContain("command");
    expect(result.stdout).not.toContain("env");
  });

  test("shows project section when project config exists", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, { skills: { include: ["beta"], exclude: ["alpha"] } });

    const result = await runAgentsCli(["status"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Project");
    expect(result.stdout).toContain(projectConfigPath);
  });

  test("shows project extension overrides", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, { extensions: { parallel: { enabled: true, skills: true, mcp: false } } });

    const result = await runAgentsCli(["status"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Extension overrides");
    expect(result.stdout).toContain("parallel enabled");
  });

  test("json output includes project info when config exists", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, { targets: { codex: { enabled: false } } });

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    const parsed = JSON.parse(result.stdout) as { project?: { configPath: string } };
    expect(result.exitCode).toBe(0);
    expect(await realpath(parsed.project?.configPath ?? projectConfigPath)).toBe(await realpath(projectConfigPath));
  });
});
