// ABOUTME: Verifies the target `drwn write` command surface over the materialization engine.
// ABOUTME: Protects the supported one-way write vocabulary for downstream tool updates.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, createFixtureRegistry, envFor, installMachineBlueprint, installProjectWorkers, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("drwn write", () => {
  test("dry-run reports planned materialization changes", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    await installMachineBlueprint(fixture, { skills: ["alpha"] });

    const write = await runAgentsCli(["write", "--dry-run"], env);

    expect(write.exitCode).toBe(0);
    expect(write.stdout).toContain("Changes:");
  });

  test("supports json, target, and mode flags", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };
    await installMachineBlueprint(fixture, {
      servers: { context7: createFixtureRegistry().servers.context7 },
    });

    const json = await runAgentsCli(["write", "--dry-run", "--json"], env);
    expect(json.exitCode).toBe(0);
    expect(() => JSON.parse(json.stdout)).not.toThrow();

    const target = await runAgentsCli(["write", "--dry-run", "--target=claude"], env);
    expect(target.exitCode).toBe(0);
    expect(target.stdout).toContain(".claude.json");
    expect(target.stdout).not.toContain("config.toml");

    const mcpOnly = await runAgentsCli(["write", "--dry-run", "--mcp-only"], env);
    expect(mcpOnly.exitCode).toBe(0);
    expect(mcpOnly.stdout).not.toContain(".claude/skills");

    const opencode = await runAgentsCli(["write", "--dry-run", "--target=opencode"], env);
    expect(opencode.exitCode).toBe(0);
    expect(opencode.stdout).toContain("opencode.json");
    expect(opencode.stdout).not.toContain("config.toml");

    const bogus = await runAgentsCli(["write", "--dry-run", "--target=gemini"], env);
    expect(bogus.exitCode).not.toBe(0);
    expect(bogus.stdout).toContain("Unsupported target: gemini");
  });

  test("rejects mutually exclusive mode flags", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["write", "--mcp-only", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Use either --mcp-only or --skills-only");
  });

  test("machine Worker skills write without curated symlinks", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await installMachineBlueprint(fixture, {
      skills: ["alpha"],
      servers: { context7: createFixtureRegistry().servers.context7 },
    });

    const result = await runAgentsCli(["write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".claude/skills/alpha");
    expect(result.stdout).toContain(".codex/skills/alpha");
    expect(existsSync(join(fixture.agentsDir, "skills", "alpha"))).toBe(false);
  });

  test("project excludes remove global default skills", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    repoConfig.defaults = { skills: ["alpha"], mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "drwn", "config.json"), JSON.stringify(repoConfig, null, 2));
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, { skills: { exclude: ["alpha"] } });

    const result = await runAgentsCli(["write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(".claude/skills/alpha");
    expect(result.stdout).not.toContain(".codex/skills/alpha");
  });

  test("project server disable overrides explicit global MCP defaults", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    repoConfig.defaults = { mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "drwn", "config.json"), JSON.stringify(repoConfig, null, 2));
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, { mcpServers: { context7: { enabled: false } } });

    const result = await runAgentsCli(["write", "--dry-run", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("@upstash/context7-mcp");
  });

  test("machine Worker MCP definitions render without ambient inventory authority", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { ensureStoreInitialized } = await import("../cli/core/card-store");
    const { seedMcpInventory } = await import("./mcp-inventory-fixture");
    await ensureStoreInitialized(fixture.agentsDir);
    await seedMcpInventory(fixture.agentsDir, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "ambient-github",
          optional: true,
        },
      },
    });
    await installMachineBlueprint(fixture, {
      servers: {
        github: {
          description: "GitHub from Card",
          transport: "stdio",
          command: "card-github",
          optional: false,
        },
      },
    });

    const result = await runAgentsCli(["write", "--target=claude"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(fixture.claudeUserMcp, "utf8"))
      .mcpServers.github.command).toBe("card-github");
  });

  test("project-enabled user library MCP servers render during write", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { seedMcpInventory } = await import("./mcp-inventory-fixture");
    await seedMcpInventory(fixture.agentsDir, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          optional: true,
        },
      },
    });
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, {
      mcpServers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          optional: false,
        },
      },
    });

    const result = await runAgentsCli(["write"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const claudeMcp = JSON.parse(await readFile(join(projectDir, ".mcp.json"), "utf8")) as { mcpServers?: Record<string, { command?: string }> };
    expect(claudeMcp.mcpServers?.github?.command).toBe("npx");
  });

  test("write --dry-run reports skipped optional MCP servers declared by locked cards", async () => {
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
          optional: true,
        },
      },
    });
    const projectDir = join(fixture.root, "project");
    await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base");

    const result = await runAgentsCli(["write", "--dry-run"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Optional MCP servers from cards:");
    expect(result.stdout).toContain("@me/base@1.0.0");
    expect(result.stdout).toContain("- card-local (skipped - enable with `drwn add mcp card-local`)");
  });

  test("write --json emits optionalMcpReport for card-declared optional MCP servers", async () => {
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
          optional: true,
        },
      },
    });
    const projectDir = join(fixture.root, "project");
    await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base");

    const result = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      optionalMcpReport?: { skippedCount: number; entries: Array<{ serverName: string; status: string }> };
    };
    expect(parsed.optionalMcpReport?.skippedCount).toBe(1);
    expect(parsed.optionalMcpReport?.entries).toContainEqual(
      expect.objectContaining({ serverName: "card-local", status: "skipped" }),
    );
    expect(result.stdout).not.toContain("effectiveSnapshot");
  });

  test("write reports card-local optional MCPs as active after drwn add mcp enables them", async () => {
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
          optional: true,
        },
      },
    });
    const projectDir = join(fixture.root, "project");
    await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base", {
      mcpServers: { "card-local": { enabled: true } },
    });

    const result = await runAgentsCli(["write"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("+ card-local (active)");
    const claudeMcp = JSON.parse(await readFile(join(projectDir, ".mcp.json"), "utf8")) as {
      mcpServers?: Record<string, { command?: string }>;
    };
    expect(claudeMcp.mcpServers?.["card-local"]?.command).toBe("card-local-server");
  });

  test("write reports card-declared optional MCPs as shadowed by project-local definitions", async () => {
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
          optional: true,
        },
      },
    });
    const projectDir = join(fixture.root, "project");
    await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base", {
      mcpServers: {
        "card-local": {
          description: "Project server",
          transport: "stdio",
          command: "project-server",
          optional: false,
        },
      },
    });

    const result = await runAgentsCli(["write", "--dry-run"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("! card-local (shadowed - active definition differs from this card)");
  });

  test("write --dry-run annotates copy intents with their winning layer", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
    const projectDir = join(fixture.root, "project");
    await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/backend@^1.0.0"], "@me/backend");

    const dryRun = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectDir);

    expect(dryRun.exitCode).toBe(0);
    const parsed = JSON.parse(dryRun.stdout) as { changes: string[] };
    const copyLines = parsed.changes.filter(
      (change) => change.startsWith("copy ") && change.includes("alpha") && /\.(claude|codex)\/skills/.test(change),
    );
    expect(copyLines).toHaveLength(2);
    for (const line of copyLines) {
      expect(line).toContain("← card @me/backend@1.0.0");
    }
  });

  test("project dry-run ignores a same-ID machine curation and uses Card bytes", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
    const projectDir = join(fixture.root, "project");
    await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/backend@^1.0.0"], "@me/backend");

    const dryRun = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectDir);

    expect(dryRun.exitCode).toBe(0);
    const parsed = JSON.parse(dryRun.stdout) as { changes: string[] };
    const lines = parsed.changes.filter((change) => change.includes(".claude/skills/alpha"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("← card @me/backend@1.0.0");
    expect(lines[0]).not.toContain("user-default");
  });

  test("all write modes preserve project requirement and lock bytes", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
    const projectDir = join(fixture.root, "pure-write-project");
    const drwnDir = join(projectDir, ".agents", "drwn");
    await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/backend@1.0.0"], "@me/backend");
    const configPath = join(drwnDir, "config.json");
    const lockPath = join(drwnDir, "card.lock");
    const configBytes = await readFile(configPath, "utf8");
    const lockBytes = await readFile(lockPath, "utf8");

    for (const args of [
      ["write"],
      ["write", "--dry-run"],
      ["write", "--target", "claude"],
      ["write", "--skills-only"],
      ["write", "--mcp-only"],
    ]) {
      const result = await runAgentsCli(args, envFor(fixture), projectDir);
      expect(result.exitCode, `${args.join(" ")}: ${result.stderr}`).toBe(0);
      expect(await readFile(configPath, "utf8")).toBe(configBytes);
      expect(await readFile(lockPath, "utf8")).toBe(lockBytes);
    }
  });

  test("selection preflight fails before project or downstream side effects", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/one", skills: ["alpha"] });
    await publishCardWithSkills(fixture, { name: "@me/two", skills: ["beta"] });
    const projectDir = join(fixture.root, "preflight-project");
    const drwnDir = join(projectDir, ".agents", "drwn");
    await installProjectWorkers(
      projectDir,
      fixture.agentsDir,
      ["@me/one@1.0.0", "@me/two@1.0.0"],
      "@me/one",
    );
    await writeSupportedProjectConfig(projectDir, {
      workers: ["@me/one@1.0.0", "@me/two@1.0.0"],
      activeWorker: "@me/missing",
    });
    const configPath = join(drwnDir, "config.json");
    const lockPath = join(drwnDir, "card.lock");
    const sentinelPaths = [
      [configPath, await readFile(configPath, "utf8")],
      [lockPath, await readFile(lockPath, "utf8")],
      [join(projectDir, ".gitignore"), "user-ignore\n"],
      [join(projectDir, ".mcp.json"), "downstream-sentinel\n"],
    ] as const;
    await writeFile(sentinelPaths[2][0], sentinelPaths[2][1]);
    await writeFile(sentinelPaths[3][0], sentinelPaths[3][1]);

    const result = await runAgentsCli(["write"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not an installed selectable root");
    for (const [path, bytes] of sentinelPaths) {
      expect(await readFile(path, "utf8")).toBe(bytes);
    }
    expect(existsSync(join(drwnDir, "generated"))).toBe(false);
  });

  test("fatal selected-target MCP preflight aborts every projection mutation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "ambient-preflight-project");
    await writeSupportedProjectConfig(projectDir, {
      mcpServers: {
        notion: {
          description: "Project Notion",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@notionhq/notion-mcp-server"],
          optional: false,
        },
      },
    });
    await writeFile(
      fixture.codexConfig,
      '[mcp_servers.notion]\nurl = "https://mcp.notion.com/mcp"\nenabled = true\n',
    );
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    const configBefore = await readFile(configPath, "utf8");
    const userCodexBefore = await readFile(fixture.codexConfig, "utf8");
    const forbiddenOutputs = [
      join(projectDir, ".gitignore"),
      join(projectDir, ".gitattributes"),
      join(projectDir, ".agents", "drwn", "generated", "workers.json"),
      join(projectDir, ".agents", "drwn", "write-record.json"),
      join(projectDir, ".mcp.json"),
      join(projectDir, ".codex", "config.toml"),
      join(projectDir, ".cursor", "mcp.json"),
    ];

    const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("CODEX_INCOMPATIBLE_TRANSPORTS");
    expect(forbiddenOutputs.every((path) => !existsSync(path))).toBe(true);
    expect(await readFile(configPath, "utf8")).toBe(configBefore);
    expect(await readFile(fixture.codexConfig, "utf8")).toBe(userCodexBefore);
  });

  test("skills-only reports a fatal MCP collision but does not block or touch MCP files", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "skills-only-project");
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
    await writeFile(fixture.codexConfig, '[mcp_servers.notion]\nurl = "https://mcp.notion.com/mcp"\n');

    const result = await runAgentsCli(["write", "--skills-only", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      ambientCollisions: Array<{ reasonCode: string; disposition: string }>;
    };
    expect(output.ambientCollisions).toContainEqual(expect.objectContaining({
      disposition: "fatal",
      reasonCode: "CODEX_INCOMPATIBLE_TRANSPORTS",
    }));
    expect(existsSync(join(projectDir, ".mcp.json"))).toBe(false);
    expect(existsSync(join(projectDir, ".codex", "config.toml"))).toBe(false);
    expect(existsSync(join(projectDir, ".cursor", "mcp.json"))).toBe(false);
  });
});
