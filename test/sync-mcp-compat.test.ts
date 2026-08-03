// ABOUTME: Locks in the public sync-mcp compatibility surface while core modules are extracted.
// ABOUTME: Exercises syncRepository usage patterns that must remain stable during refactoring.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-compat-"));
  tempRoots.push(root);
  return root;
}

async function scaffoldFixture() {
  const root = await createTempRoot();
  const homeDir = join(root, "home");
  const repoRoot = join(root, "repo");
  const claudeSettings = join(homeDir, ".claude", "settings.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const cursorConfig = join(homeDir, ".cursor", "mcp.json");

  await mkdir(join(repoRoot, "registry"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "shared"), { recursive: true });
  await mkdir(dirname(claudeSettings), { recursive: true });
  await mkdir(dirname(codexConfig), { recursive: true });
  await mkdir(dirname(cursorConfig), { recursive: true });
  await mkdir(join(homeDir, ".agents", "skills"), { recursive: true });

  const registry = {
    version: 1,
    servers: {
      context7: {
        description: "Docs",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        optional: false,
      },
    },
  };
  const config = {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: cursorConfig, format: "json-standalone", mcpKey: "mcpServers" },
    },
    optional: {},
    parallel: { cli: { enabled: true }, mcp: { enabled: false } },
  };

  await writeFile(join(repoRoot, "registry", "mcp-servers.json"), JSON.stringify(registry, null, 2));
  await writeFile(join(repoRoot, "registry", "config.json"), JSON.stringify(config, null, 2));
  await mkdir(join(homeDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(homeDir, ".agents", "drwn", "machine.json"),
    `${JSON.stringify({
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: {},
      capabilities: { profile: null, skills: [], mcpServers: ["context7"] },
    }, null, 2)}\n`,
  );
  await writeFile(claudeSettings, JSON.stringify({ model: "sonnet" }, null, 2));
  await writeFile(codexConfig, 'personality = "pragmatic"\n');
  await writeFile(cursorConfig, JSON.stringify({ mcpServers: {} }, null, 2));

  return { homeDir, repoRoot, claudeSettings };
}

describe("sync-mcp.ts compatibility", () => {
  test("explicit repoRoot is also the default project discovery cwd", async () => {
    const { repoRoot, homeDir } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    await expect(syncRepository({ repoRoot, homeDir, dryRun: true })).resolves.toBeDefined();
  });

  test("--dry-run reports changes without mutating files", async () => {
    const { repoRoot, homeDir, claudeSettings } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    const before = await readFile(claudeSettings, "utf8");
    const result = await syncRepository({
      repoRoot,
      homeDir,
      cwd: repoRoot,
      dryRun: true,
    });

    expect(result.changes.length).toBeGreaterThan(0);
    expect(await readFile(claudeSettings, "utf8")).toBe(before);
  });

  test("--mcp-only skips skills sync", async () => {
    const { repoRoot, homeDir } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    const result = await syncRepository({
      repoRoot,
      homeDir,
      cwd: repoRoot,
      mcpOnly: true,
      dryRun: true,
    });

    const hasSkillChange = result.changes.some((change) => change.includes("skills"));
    expect(hasSkillChange).toBe(false);
  });

  test("--skills-only skips MCP sync", async () => {
    const { repoRoot, homeDir } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    const result = await syncRepository({
      repoRoot,
      homeDir,
      cwd: repoRoot,
      skillsOnly: true,
      dryRun: true,
    });

    const hasMcpChange = result.changes.some(
      (change) =>
        change.includes("settings.json") || change.includes("config.toml") || change.includes("mcp.json"),
    );
    expect(hasMcpChange).toBe(false);
  });

  test("--target=claude limits sync to claude only", async () => {
    const { repoRoot, homeDir } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    const result = await syncRepository({
      repoRoot,
      homeDir,
      cwd: repoRoot,
      target: "claude",
      dryRun: true,
    });

    const hasCodex = result.changes.some((change) => change.includes("codex") || change.includes("config.toml"));
    const hasCursor = result.changes.some((change) => change.includes("cursor"));
    expect(hasCodex).toBe(false);
    expect(hasCursor).toBe(false);
  });

  test("exports expected public API surface", async () => {
    const mod = await import("../sync-mcp");

    expect(typeof mod.buildActiveServers).toBe("function");
    expect(typeof mod.mergeClaudeSettingsText).toBe("function");
    expect(typeof mod.mergeCodexTomlText).toBe("function");
    expect(typeof mod.renderCursorConfig).toBe("function");
    expect(typeof mod.syncRepository).toBe("function");
  });
});
