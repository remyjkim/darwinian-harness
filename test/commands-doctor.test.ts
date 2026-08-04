// ABOUTME: Verifies the public `drwn doctor` command stays report-only while surfacing drift and stale state.
// ABOUTME: Protects the safe-by-default diagnostics contract for the new CLI.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, installMachineBlueprint, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { writeMachineConfig } from "../cli/core/card-store";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("drwn doctor", () => {
  test("rejects prototype machine state without migrating or mutating it", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    const machinePath = join(fixture.agentsDir, "drwn", "machine.json");
    await writeFile(machinePath, `${JSON.stringify({ version: 2, defaults: {} }, null, 2)}\n`);

    const before = await readFile(machinePath, "utf8");
    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture));

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("MACHINE_CONFIG_INVALID");
    expect(await readFile(machinePath, "utf8")).toBe(before);
  });

  test("reports missing active Worker bytes without fetching or repairing", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const installed = await installMachineBlueprint(fixture, { skills: ["worker-skill"] });
    const member = installed.locked.find((card) => card.name === "@me/machine-capabilities")!;
    await rm(member.path, { recursive: true, force: true });

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as { machineCapabilityIssues: string[] };
    expect(report.machineCapabilityIssues.some((issue) => issue.includes("MACHINE_WORKER_CONTENT_MISSING"))).toBe(true);
    expect(existsSync(member.path)).toBe(false);
  });

  test("reports mutated active Worker bytes without repairing them", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const installed = await installMachineBlueprint(fixture, { skills: ["worker-skill"] });
    const member = installed.locked.find((card) => card.name === "@me/machine-capabilities")!;
    const skillPath = join(member.path, "skills", "worker-skill", "SKILL.md");
    await chmod(skillPath, 0o644);
    await writeFile(skillPath, "mutated Worker bytes\n");

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as { machineCapabilityIssues: string[] };
    expect(report.machineCapabilityIssues.some((issue) => issue.includes("MACHINE_WORKER_INTEGRITY_MISMATCH"))).toBe(true);
    expect(await readFile(skillPath, "utf8")).toBe("mutated Worker bytes\n");
  });

  test("reports the supported error code for an invalid project schema", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ version: 1, cards: [] }, null, 2)}\n`);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain("PROJECT_CONFIG_INVALID");
    expect(output.toLowerCase()).not.toContain("migrat");
  });

  test("surfaces the Cowork annotation and platform checks when claude is enabled", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const human = await runAgentsCli(["doctor"], envFor(fixture));
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Cowork");
    expect(human.stdout).toContain("Platform checks:");

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture));
    const parsed = JSON.parse(json.stdout) as {
      surfaceNotes: string[];
      platformChecks: Array<{ name: string; ok: boolean }>;
    };
    expect(parsed.surfaceNotes.some((note) => note.includes("Cowork"))).toBe(true);
    expect(parsed.platformChecks.some((check) => check.name.includes("home directory"))).toBe(true);
  });

  test("reports stale downstream skill symlinks", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    await installMachineBlueprint(fixture, { skills: ["alpha"] });
    await runAgentsCli(["write", "--root", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });
    const { useMachineWorker } = await import("../cli/core/worker-machine");
    await useMachineWorker(fixture.agentsDir, null);

    const result = await runAgentsCli(["doctor"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Stale skill symlinks:");
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toMatch(/^\s*-\s/m);
  });

  test("reports foreign machine projection conflicts without mutating them", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await installMachineBlueprint(fixture, { skills: ["alpha"] });
    const destination = join(fixture.homeDir, ".claude", "skills", "alpha");
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "SKILL.md"), "foreign content\n");

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { machineProjectionConflicts: string[] };
    expect(parsed.machineProjectionConflicts.some((item) => item.includes(destination))).toBe(true);
    expect(await readFile(join(destination, "SKILL.md"), "utf8")).toBe("foreign content\n");
  });

  test("reports broken symlinks and supports --json output", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const brokenDir = join(fixture.homeDir, ".codex", "skills");
    await mkdir(brokenDir, { recursive: true });
    await symlink(join(fixture.root, "missing-target"), join(brokenDir, "broken-link"), "dir");

    const result = await runAgentsCli(["doctor", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { brokenSymlinks: string[] };
    expect(parsed.brokenSymlinks.some((value) => value.includes("broken-link"))).toBe(true);
  });

  test("does not report unrelated user MCP entries as machine drift", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    await writeFile(fixture.claudeSettings, JSON.stringify({ model: "sonnet", mcpServers: { rogue: { url: "x" } } }, null, 2));

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { mcpDrift: string[]; machineProjectionConflicts: string[] };
    expect(parsed.mcpDrift).toEqual([]);
    expect(parsed.machineProjectionConflicts).toEqual([]);
  });

  test("reports drift in a recorded machine-owned MCP field", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await installMachineBlueprint(fixture, {
      servers: { context7: { description: "Context7", transport: "stdio", command: "context7", optional: false } },
    });
    expect((await runAgentsCli(["write", "--root", "--mcp-only"], envFor(fixture))).exitCode).toBe(0);
    const config = JSON.parse(await readFile(fixture.claudeUserMcp, "utf8"));
    config.mcpServers.context7.command = "mutated-command";
    await writeFile(fixture.claudeUserMcp, `${JSON.stringify(config, null, 2)}\n`);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { mcpDrift: string[]; machineProjectionConflicts: string[] };
    expect(parsed.mcpDrift).toContain(`claude:${fixture.claudeUserMcp}`);
    expect(parsed.machineProjectionConflicts.some((item) => item.includes(fixture.claudeUserMcp))).toBe(true);
  });

  test("detects MCP drift when config uses tilde paths", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const installed = await installMachineBlueprint(fixture, {
      servers: { context7: { description: "Context7", transport: "stdio", command: "context7", optional: false } },
    });
    const configWithTildes = installed.config;
    configWithTildes.policy.targets = {
        claude: {
          enabled: true,
          configPath: "~/.claude/settings.json",
          userMcpPath: "~/.claude/settings.json",
          format: "json-merge",
          mcpKey: "mcpServers",
        },
        codex: {
          enabled: false,
          configPath: "~/.codex/config.toml",
          format: "toml-merge",
          mcpKey: "mcp_servers",
        },
        cursor: {
          enabled: false,
          configPath: "~/.cursor/mcp.json",
          format: "json-standalone",
          mcpKey: "mcpServers",
        },
    };

    await writeMachineConfig(fixture.agentsDir, configWithTildes);
    expect((await runAgentsCli(["write", "--root", "--mcp-only"], envFor(fixture))).exitCode).toBe(0);
    const tildeConfigPath = join(fixture.homeDir, ".claude", "settings.json");
    const projected = JSON.parse(await readFile(tildeConfigPath, "utf8"));
    projected.mcpServers.context7.command = "mutated-command";
    await writeFile(tildeConfigPath, `${JSON.stringify(projected, null, 2)}\n`);

    const result = await runAgentsCli(["doctor", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { mcpDrift: string[] };
    expect(parsed.mcpDrift).toContain(`claude:${tildeConfigPath}`);
  });

  test("returns unhealthy for fatal ambient MCP collisions with redacted remediation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "ambient-doctor");
    await writeSupportedProjectConfig(projectDir, {
      mcpServers: {
        notion: {
          description: "Project Notion",
          transport: "stdio",
          command: "npx",
          env: { TOKEN: "project-secret-sentinel" },
          optional: false,
        },
      },
    });
    await writeFile(
      fixture.codexConfig,
      '[mcp_servers.notion]\nurl = "https://mcp.notion.com/mcp"\nhttp_headers = { Authorization = "Bearer user-secret-sentinel" }\n',
    );

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);
    const human = await runAgentsCli(["doctor"], envFor(fixture), projectDir);

    expect(json.exitCode).toBe(1);
    expect(human.exitCode).toBe(1);
    const report = JSON.parse(json.stdout) as {
      ambientMcpCollisions: Array<{ disposition: string; reasonCode: string; remediation: string }>;
      ambientCapabilities: { enforcement: string; collisions: unknown[] };
    };
    expect(report.ambientMcpCollisions).toContainEqual(expect.objectContaining({
      disposition: "fatal",
      reasonCode: "CODEX_INCOMPATIBLE_TRANSPORTS",
      remediation: "Rename one server ID or remove one of the conflicting transport definitions.",
    }));
    expect(report.ambientCapabilities.enforcement).toBe("target-native");
    expect(human.stdout).toContain("CODEX_INCOMPATIBLE_TRANSPORTS");
    expect(human.stdout).toContain("Rename one server ID");
    expect(`${json.stdout}\n${human.stdout}`).not.toContain("project-secret-sentinel");
    expect(`${json.stdout}\n${human.stdout}`).not.toContain("user-secret-sentinel");
  });

  test("keeps warning-only Claude ambient shadowing healthy", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "ambient-warning-doctor");
    await writeSupportedProjectConfig(projectDir, {
      mcpServers: {
        notion: {
          description: "Project Notion",
          transport: "stdio",
          command: "npx",
          optional: false,
        },
      },
    });
    await writeFile(
      fixture.claudeUserMcp,
      `${JSON.stringify({ mcpServers: { notion: { type: "http", url: "https://mcp.notion.com/mcp" } } })}\n`,
    );

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as {
      ambientMcpCollisions: Array<{ disposition: string; reasonCode: string }>;
    };
    expect(report.ambientMcpCollisions).toContainEqual(expect.objectContaining({
      disposition: "warning",
      reasonCode: "CLAUDE_SCOPE_SHADOW",
    }));
  });

  test("does not enforce a fatal-shaped collision on a disabled target", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "ambient-disabled-doctor");
    await writeSupportedProjectConfig(projectDir, {
      targets: { codex: { enabled: false } },
      mcpServers: {
        notion: {
          description: "Project Notion",
          transport: "stdio",
          command: "npx",
          optional: false,
        },
      },
    });
    await writeFile(fixture.codexConfig, '[mcp_servers.notion]\nurl = "https://mcp.notion.com/mcp"\n');

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as {
      ambientMcpCollisions: Array<{ target: string }>;
      ambientCapabilities: { collisions: Array<{ target: string; disposition: string }> };
    };
    expect(report.ambientMcpCollisions.some((collision) => collision.target === "codex")).toBe(false);
    expect(report.ambientCapabilities.collisions).toContainEqual(expect.objectContaining({
      target: "codex",
      disposition: "fatal",
    }));
  });

  test("reports project config issues for unknown references and stale overrides", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, {
          mcpServers: {
            missingServer: { enabled: true },
            "parallel-search": { enabled: false },
          },
          skills: {
            include: ["missing-skill"],
          },
          targets: {
            codex: { enabled: true },
          },
        });

    const result = await runAgentsCli(["doctor"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Project config issues");
    expect(result.stdout).toContain("missingServer");
    expect(result.stdout).toContain("missing-skill");
    expect(result.stdout).toContain("parallel-search");
  });

  test("reports no capability issues for explicit empty V2 intent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const config = createEmptyMachineConfig();
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "drwn", "machine.json"), JSON.stringify(config, null, 2));

    const result = await runAgentsCli(["doctor", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { machineCapabilityIssues: string[] };
    expect(parsed.machineCapabilityIssues).toEqual([]);
  });

  test("does not falsely report card-bundled-only skills as unknown", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/frontend", skills: ["polish"] });
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["apply", "@me/frontend@^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      projectConfigIssues: string[];
      cards?: { warnings?: string[] };
    };
    expect(parsed.projectConfigIssues).not.toContain('Unknown skill reference: "polish"');
    expect(parsed.cards?.warnings ?? []).not.toContain("Card @me/frontend@1.0.0 references unavailable skills");
  });

  test("reports card hooks without valid consent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { createCatalogCardSource } = await import("./helpers");
    const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
    expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
    const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { hookIssues: string[] };
    expect(parsed.hookIssues.join("\n")).toContain("drwn card trust @me/policy --hooks");
  });

  test("does not report MCP drift for a synced project with Claude hooks", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { createCatalogCardSource } = await import("./helpers");
    const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
    expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
    await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
      import { defineToolPolicy } from "darwinian/hook-policy";
      export default defineToolPolicy({
        policyKind: "enforcement",
        beforeToolCall() { return { action: "allow" }; },
      });
    `);
    expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
    const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { mcpDrift: string[] };
    expect(parsed.mcpDrift).toEqual([]);
  });

  test("reports stale generated hook composers", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { createCatalogCardSource } = await import("./helpers");
    const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
    expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
    await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
      import { defineToolPolicy } from "darwinian/hook-policy";
      export default defineToolPolicy({ policyKind: "observer" });
    `);
    expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
    const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);
    const composerPath = join(projectDir, ".agents", "drwn", "generated", "workers", "@me", "policy", "hooks", "claude", "composer.mjs");
    const composer = await readFile(composerPath, "utf8");
    await writeFile(composerPath, composer.replace(/drwn-version:\s*[^\n]+/, "drwn-version: 0.0.0"));

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { hookIssues: string[] };
    expect(parsed.hookIssues.join("\n")).toContain("composer stale; rerun drwn write");
  });
});
