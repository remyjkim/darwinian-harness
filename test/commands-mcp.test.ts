// ABOUTME: Verifies the public `drwn mcp list` and `drwn mcp write` command surfaces.
// ABOUTME: Protects harness MCP listing and write behavior while the CLI replaces ad hoc script usage.

import { afterEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createFixtureRegistry, installMachineBlueprint, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function selectMachineMcp(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  id: string,
  server: unknown = createFixtureRegistry().servers[id],
) {
  if (!server) throw new Error(`Missing MCP fixture for ${id}`);
  await installMachineBlueprint(fixture, {
    rootName: `@me/${id}-worker`,
    memberName: `@me/${id}-capabilities`,
    servers: { [id]: server },
  });
}

describe("drwn mcp", () => {
  test("list shows harness servers and active state", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "list"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("context7");
    expect(result.stdout).toContain("parallel-search");
  });

  test("list supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    await selectMachineMcp(fixture, "parallel-search");

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean }>;
    expect(parsed.some((server) => server.name === "parallel-search" && server.active)).toBe(true);
  });

  test("list applies project extension MCP state", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: false });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, { extensions: { parallel: { enabled: true, skills: true, mcp: true } } });

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean }>;
    expect(parsed.some((server) => server.name === "parallel-search" && server.active)).toBe(true);
  });

  test("write --dry-run reports changes without mutating target files", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    await selectMachineMcp(fixture, "parallel-search");
    const before = await readFile(fixture.claudeSettings, "utf8");

    const result = await runAgentsCli(["mcp", "write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Changes:");
    expect(await readFile(fixture.claudeSettings, "utf8")).toBe(before);
  });

  test("write --dry-run reports MCP changes without mutating target files", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    await selectMachineMcp(fixture, "parallel-search");
    const before = await readFile(fixture.claudeSettings, "utf8");

    const result = await runAgentsCli(["mcp", "write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Changes:");
    expect(await readFile(fixture.claudeSettings, "utf8")).toBe(before);
  });

  test("write supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    await selectMachineMcp(fixture, "parallel-search");

    const result = await runAgentsCli(["mcp", "write", "--dry-run", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  test("write uses project extension MCP state", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: false });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, { extensions: { parallel: { enabled: true, skills: true, mcp: true } } });

    const result = await runAgentsCli(["mcp", "write"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const claudeMcp = JSON.parse(await readFile(join(projectDir, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(claudeMcp.mcpServers["parallel-search"]).toBeDefined();
  });

  test("write --target=claude limits output scope", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    await selectMachineMcp(fixture, "parallel-search");

    const result = await runAgentsCli(["mcp", "write", "--dry-run", "--target=claude"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".claude.json");
    expect(result.stdout).not.toContain("config.toml");
    expect(result.stdout).not.toContain("cursor");
  });

  test("inactive servers show empty targets", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean; targets: string }>;
    const inactive = parsed.find((server) => !server.active);
    expect(inactive).toBeDefined();
    expect(inactive!.targets).toBe("");
  });

  test("list uses user global defaults and MCP library entries", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { ensureStoreInitialized } = await import("../cli/core/card-store");
    const { seedMcpInventory } = await import("./mcp-inventory-fixture");
    await ensureStoreInitialized(fixture.agentsDir);
    const github = {
      description: "GitHub",
      transport: "stdio" as const,
      command: "npx",
      optional: true,
    };
    await seedMcpInventory(fixture.agentsDir, {
      version: 1,
      servers: {
        github,
      },
    });
    await selectMachineMcp(fixture, "github", github);

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean }>;
    expect(parsed.some((item) => item.name === "github" && item.active)).toBe(true);
  });

  test("project list excludes machine-only MCP library definitions", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
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
    const projectDir = join(fixture.root, "isolated-project");
    await writeSupportedProjectConfig(projectDir);

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).map((entry: { name: string }) => entry.name)).not.toContain("machine-only");
  });

  test("project list shows concise redacted same-ID ambient provenance", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "ambient-list");
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
      '[mcp_servers.notion]\nurl = "https://mcp.notion.com/mcp"\nbearer_token_env_var = "USER_SECRET_SENTINEL"\n',
    );

    const json = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);
    const human = await runAgentsCli(["mcp", "list"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(json.exitCode).toBe(0);
    expect(human.exitCode).toBe(0);
    const notion = (JSON.parse(json.stdout) as Array<{
      name: string;
      ambient: Array<{ target: string; disposition: string; reasonCode: string; source: string; transport: string }>;
    }>).find((entry) => entry.name === "notion");
    expect(notion?.ambient).toContainEqual({
      target: "codex",
      disposition: "fatal",
      reasonCode: "CODEX_INCOMPATIBLE_TRANSPORTS",
      source: "user",
      transport: "http",
    });
    expect(human.stdout).toContain("CODEX_INCOMPATIBLE_TRANSPORTS");
    expect(`${json.stdout}\n${human.stdout}`).not.toContain("project-secret-sentinel");
    expect(`${json.stdout}\n${human.stdout}`).not.toContain("USER_SECRET_SENTINEL");
  });
});
