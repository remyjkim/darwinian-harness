// ABOUTME: Verifies the public `drwn status` command in human and JSON modes.
// ABOUTME: Ensures the CLI can summarize repo, aggregation, target, and skill state consistently.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import {
  cleanupTempRoots,
  envFor,
  installMachineBlueprint,
  publishCardWithSkills,
  publishMachineBlueprint,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

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
    expect(result.stdout).toContain("drwn.machine@2");
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
      schemaVersion: 2,
      config: { schema: "drwn.machine", schemaVersion: 2 },
      selection: { activeWorker: null, installedRoots: [], activeClosure: [] },
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
      schemaVersion: 2,
      config: { schema: "drwn.machine", schemaVersion: 2 },
    });
    expect(parsed.project).toBeUndefined();
    expect(parsed.activeWorker).toBeUndefined();
  });

  test("machine JSON reports selected roots, active closure, consent, integrity, and Worker provenance", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const activeRef = await publishMachineBlueprint(fixture, {
      rootName: "@me/active-worker",
      memberName: "@me/active-capabilities",
      skills: ["alpha"],
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
    const inactiveRef = await publishMachineBlueprint(fixture, {
      rootName: "@me/inactive-worker",
      memberName: "@me/inactive-capabilities",
      skills: ["inactive-skill"],
    });
    const { applyMachineWorkerRoots } = await import("../cli/core/worker-machine");
    await applyMachineWorkerRoots(fixture.agentsDir, [activeRef, inactiveRef], { active: "@me/active-worker" });

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.selection).toMatchObject({
      activeWorker: "@me/active-worker",
      installedRoots: [
        expect.objectContaining({ name: "@me/active-worker", selected: true }),
        expect.objectContaining({ name: "@me/inactive-worker", selected: false }),
      ],
    });
    expect(parsed.selection.activeClosure).toHaveLength(2);
    for (const card of parsed.selection.activeClosure) {
      expect(card).toEqual(expect.objectContaining({
        integrity: expect.stringMatching(/^sha256-/),
        treeSha: expect.stringMatching(/^[a-f0-9]{40}$/),
        consent: { hooks: true, instructions: true },
      }));
    }
    expect(parsed.capabilities.skills).toContainEqual(
      expect.objectContaining({ id: "alpha", provenance: "worker", cardName: "@me/active-capabilities", status: "resolved" }),
    );
    expect(parsed.capabilities.mcpServers).toEqual([
      expect.objectContaining({ id: "github", provenance: "worker", cardName: "@me/active-capabilities", status: "resolved" }),
    ]);
    expect(parsed.capabilities.counts).toEqual({
      resolvedSkills: 1,
      missingSkills: 0,
      resolvedMcpServers: 1,
      missingMcpServers: 0,
    });
    expect(result.stdout).not.toContain("inactive-skill");
    expect(result.stdout).not.toContain("status-secret-sentinel");
    expect(result.stdout).not.toContain("GITHUB_TOKEN");
  });

  test("machine JSON reports active closure integrity failure without repairing bytes", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const installed = await installMachineBlueprint(fixture, { skills: ["integrity-skill"] });
    const member = installed.locked.find((card) => card.name === "@me/machine-capabilities")!;
    const skillPath = join(member.path, "skills", "integrity-skill", "SKILL.md");
    await chmod(skillPath, 0o644);
    await writeFile(skillPath, "mutated\n");

    const result = await runAgentsCli(["status", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.capabilities.counts).toEqual({
      resolvedSkills: 0,
      missingSkills: 1,
      resolvedMcpServers: 0,
      missingMcpServers: 0,
    });
    expect(parsed.projection).toMatchObject({ healthy: false, current: false, conflicts: [] });
    expect(parsed.projection.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("MACHINE_WORKER_INTEGRITY_MISMATCH"),
    ]));
    expect(await readFile(skillPath, "utf8")).toBe("mutated\n");
  });

  test("machine JSON rejects stale hook ranges and instruction digests as consent gaps", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await installMachineBlueprint(fixture, {
      hooks: ["guard"],
      instructions: { text: "Follow the machine policy." },
    });
    const machinePath = resolveMachineConfigPath(fixture.agentsDir);
    const machine = JSON.parse(await readFile(machinePath, "utf8"));
    const member = machine.capabilities.workerLock.cards.find(
      (card: { name: string }) => card.name === "@me/machine-capabilities",
    );
    member.hookConsent = {
      consentedAt: "2026-08-03T00:00:00.000Z",
      consentedRange: "<1.0.0",
    };
    member.instructionConsent = {
      consentedAt: "2026-08-03T00:00:00.000Z",
      consentedRange: "^1.0.0",
      contentDigest: `sha256-${"0".repeat(64)}`,
    };
    await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);

    const result = await runAgentsCli(["status", "--json"], envFor(fixture));

    expect(result.exitCode, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.selection.activeClosure).toContainEqual(
      expect.objectContaining({
        name: "@me/machine-capabilities",
        consent: { hooks: false, instructions: false },
      }),
    );
    expect(parsed.projection.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("hook consent"),
      expect.stringContaining("instruction consent"),
    ]));
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
