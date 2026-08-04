import { afterEach, describe, expect, test } from "bun:test";
import {
  buildActiveServers,
  detectCodexLayerConflicts,
  mergeClaudeSettingsText,
  mergeCodexTomlText,
  renderCursorConfig,
  syncRepository,
  type CanonicalConfig,
  type CanonicalRegistry,
} from "../sync-mcp";
import { parse as parseToml } from "smol-toml";
import { cp, lstat, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { applyMachineWorkerRoots } from "../cli/core/worker-machine";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "darwinian-"));
  tempRoots.push(root);
  return root;
}

async function selectFileMachineBlueprint(options: {
  root: string;
  repoRoot: string;
  agentsDir: string;
  skills?: string[];
  servers?: Record<string, unknown>;
}) {
  const memberDir = join(options.root, "machine-capabilities");
  const workerDir = join(options.root, "machine-worker");
  await mkdir(memberDir, { recursive: true });
  await mkdir(workerDir, { recursive: true });
  await writeFile(join(memberDir, "card.json"), `${JSON.stringify({
    name: "@test/machine-capabilities",
    version: "1.0.0",
    ...(options.skills?.length ? { skills: { include: options.skills } } : {}),
    ...(options.servers ? { servers: options.servers } : {}),
  }, null, 2)}\n`);
  for (const skill of options.skills ?? []) {
    const skillDir = join(memberDir, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skill}\ndescription: worker source\n---\n`);
  }
  await writeFile(join(workerDir, "card.json"), `${JSON.stringify({
    name: "@test/machine-worker",
    version: "1.0.0",
    kind: "blueprint",
    composedFrom: [`file:${memberDir}`],
  }, null, 2)}\n`);
  await applyMachineWorkerRoots(options.agentsDir, [`file:${workerDir}`], {
    repoRoot: options.repoRoot,
    allowUntrustedSource: true,
  });
  return memberDir;
}

function getServer(registry: CanonicalRegistry, name: string) {
  const server = registry.servers[name];
  if (!server) {
    throw new Error(`Missing fixture server: ${name}`);
  }
  return server;
}

function createRegistry(): CanonicalRegistry {
  return {
    version: 1,
    servers: {
      context7: {
        description: "Docs",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        optional: false,
      },
      "parallel-web-search": {
        description: "Platform",
        transport: "platform-provided",
        provider: "claude.ai",
        optional: false,
      },
      slack: {
        description: "Slack",
        transport: "http",
        url: "https://mcp.slack.com/mcp",
        optional: true,
      },
    },
  };
}

function createRegistryWithParallelMcp(): CanonicalRegistry {
  return {
    version: 1,
    servers: {
      ...createRegistry().servers,
      "parallel-search": {
        description: "Parallel Search MCP",
        transport: "http",
        url: "https://search.parallel.ai/mcp",
        optional: false,
      },
      "parallel-task": {
        description: "Parallel Task MCP",
        transport: "http",
        url: "https://task-mcp.parallel.ai/mcp",
        optional: false,
      },
    },
  };
}

function createConfig(optionalSlack = false, parallelMcpEnabled = false): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: {
        enabled: true,
        configPath: "~/.claude/settings.json",
        format: "json-merge",
        mcpKey: "mcpServers",
      },
      codex: {
        enabled: true,
        configPath: "~/.codex/config.toml",
        format: "toml-merge",
        mcpKey: "mcp_servers",
      },
      cursor: {
        enabled: true,
        configPath: "~/.cursor/mcp.json",
        format: "json-standalone",
        mcpKey: "mcpServers",      },
      opencode: {
        enabled: false,
        configPath: "~/.config/opencode/opencode.json",
        format: "json-merge",
        mcpKey: "mcp",
      },
    },
    optional: {
      slack: optionalSlack,
    },
    parallel: {
      cli: {
        enabled: true,
      },
      mcp: {
        enabled: parallelMcpEnabled,
      },
    },
  };
}

describe("buildActiveServers", () => {
  test("filters platform-provided servers and disabled optional servers", () => {
    const active = buildActiveServers(createRegistry(), createConfig(false));

    expect(Object.keys(active)).toEqual(["context7"]);
  });

  test("includes optional servers when enabled", () => {
    const active = buildActiveServers(createRegistry(), createConfig(true));

    expect(Object.keys(active)).toEqual(["context7", "slack"]);
  });

  test("excludes Parallel MCP entries by default", () => {
    const active = buildActiveServers(createRegistryWithParallelMcp(), createConfig(false, false));

    expect(Object.keys(active)).toEqual(["context7"]);
  });

  test("includes Parallel MCP entries when globally enabled", () => {
    const active = buildActiveServers(createRegistryWithParallelMcp(), createConfig(false, true));

    expect(Object.keys(active)).toEqual(["context7", "parallel-search", "parallel-task"]);
  });

  test("real packaged registry includes Parallel MCP entries when globally enabled", async () => {
    const registry = JSON.parse(
      await readFile(join(import.meta.dir, "..", "registry", "mcp-servers.json"), "utf8"),
    ) as CanonicalRegistry;

    const active = buildActiveServers(registry, createConfig(false, true));

    expect(active["parallel-search"]).toBeDefined();
    expect(active["parallel-task"]).toBeDefined();
  });

  test("real packaged registry exposes notion via the hosted Streamable HTTP endpoint", async () => {
    const registry = JSON.parse(
      await readFile(join(import.meta.dir, "..", "registry", "mcp-servers.json"), "utf8"),
    ) as CanonicalRegistry;

    expect(registry.servers["notion"]).toMatchObject({
      transport: "http",
      url: "https://mcp.notion.com/mcp",
      optional: true,
    });
  });

  test("notion is excluded by default and included only when opted in via optional config", async () => {
    const registry = JSON.parse(
      await readFile(join(import.meta.dir, "..", "registry", "mcp-servers.json"), "utf8"),
    ) as CanonicalRegistry;

    const baseline = buildActiveServers(registry, createConfig(false, false));
    expect(baseline["notion"]).toBeUndefined();

    const optedIn: CanonicalConfig = {
      ...createConfig(false, false),
      optional: { notion: true },
    };
    const active = buildActiveServers(registry, optedIn);
    expect(active["notion"]).toMatchObject({
      transport: "http",
      url: "https://mcp.notion.com/mcp",
    });
  });

  test("real packaged registry exposes the command bridge as disabled-by-default", async () => {
    const registry = JSON.parse(
      await readFile(join(import.meta.dir, "..", "registry", "mcp-servers.json"), "utf8"),
    ) as CanonicalRegistry;
    const config = JSON.parse(
      await readFile(join(import.meta.dir, "..", "registry", "config.json"), "utf8"),
    ) as CanonicalConfig;

    expect(registry.servers["drwn-command-bridge"]).toMatchObject({
      transport: "stdio",
      command: "npx",
      args: ["-y", "drwn-command-bridge@^0.1.0", "--policy", "${DRWN_COMMAND_BRIDGE_POLICY}"],
      optional: true,
    });
    expect(config.optional["drwn-command-bridge"]).toBe(false);
    expect(buildActiveServers(registry, config)["drwn-command-bridge"]).toBeUndefined();

    const optedIn = {
      ...config,
      optional: { ...config.optional, "drwn-command-bridge": true },
    };
    expect(buildActiveServers(registry, optedIn)["drwn-command-bridge"]).toBeDefined();
  });

  test("command bridge renderers preserve the policy placeholder argument", () => {
    const bridge = {
      description: "Host CLI bridge",
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "drwn-command-bridge@^0.1.0", "--policy", "${DRWN_COMMAND_BRIDGE_POLICY}"],
      optional: true,
    };

    const cursor = JSON.parse(renderCursorConfig({ "drwn-command-bridge": bridge })) as {
      mcpServers: Record<string, { args: string[] }>;
    };
    const claude = JSON.parse(
      mergeClaudeSettingsText("{}", { "drwn-command-bridge": bridge }).text,
    ) as { mcpServers: Record<string, { args: string[] }> };
    const codex = parseToml(mergeCodexTomlText("", { "drwn-command-bridge": bridge })) as {
      mcp_servers: Record<string, { args: string[] }>;
    };
    const expectedArgs = [
      "-y",
      "drwn-command-bridge@^0.1.0",
      "--policy",
      "${DRWN_COMMAND_BRIDGE_POLICY}",
    ];

    expect(cursor.mcpServers["drwn-command-bridge"]?.args).toEqual(expectedArgs);
    expect(claude.mcpServers["drwn-command-bridge"]?.args).toEqual(expectedArgs);
    expect(codex.mcp_servers["drwn-command-bridge"]?.args).toEqual(expectedArgs);
  });
});

describe("renderCursorConfig", () => {
  test("renders the expected JSON structure", () => {
    const json = renderCursorConfig({
      context7: getServer(createRegistry(), "context7"),
      slack: getServer(createRegistry(), "slack"),
    });
    const parsed = JSON.parse(json) as { mcpServers: Record<string, unknown> };

    expect(parsed).toEqual({
      mcpServers: {
        context7: {
          command: "npx",
          args: ["-y", "@upstash/context7-mcp"],
        },
        slack: {
          type: "http",
          url: "https://mcp.slack.com/mcp",
        },
      },
    });
  });

  test("annotates http transports with type: 'http' for Claude Code-compatible clients", () => {
    const json = renderCursorConfig({
      slack: getServer(createRegistry(), "slack"),
    });
    const parsed = JSON.parse(json) as { mcpServers: Record<string, unknown> };

    expect(parsed.mcpServers["slack"]).toEqual({
      type: "http",
      url: "https://mcp.slack.com/mcp",
    });
  });

  test("translates ${VAR} env passthroughs to Cursor's ${env:VAR} syntax", () => {
    const json = renderCursorConfig({
      notion: {
        description: "Notion token",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@notionhq/notion-mcp-server"],
        env: { NOTION_TOKEN: "${NOTION_TOKEN}", REGION: "us-east-1" },
        optional: false,
      },
    });
    const parsed = JSON.parse(json) as { mcpServers: Record<string, unknown> };

    expect(parsed.mcpServers["notion"]).toEqual({
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: { NOTION_TOKEN: "${env:NOTION_TOKEN}", REGION: "us-east-1" },
    });
  });
});

describe("Parallel MCP rendering", () => {
  test("renders Parallel MCP entries into JSON targets when enabled", () => {
    const json = renderCursorConfig({
      "parallel-search": getServer(createRegistryWithParallelMcp(), "parallel-search"),
      "parallel-task": getServer(createRegistryWithParallelMcp(), "parallel-task"),
    });
    const parsed = JSON.parse(json) as { mcpServers: Record<string, { type: string; url: string }> };

    expect(parsed.mcpServers["parallel-search"]).toEqual({
      type: "http",
      url: "https://search.parallel.ai/mcp",
    });
    expect(parsed.mcpServers["parallel-task"]).toEqual({
      type: "http",
      url: "https://task-mcp.parallel.ai/mcp",
    });
  });
});

describe("Parallel shared skills", () => {
  test("real repo contains the four Parallel CLI-backed skills", async () => {
    const skillNames = [
      "parallel-web-search",
      "parallel-web-extract",
      "parallel-deep-research",
      "parallel-data-enrichment",
    ] as const;

    for (const skillName of skillNames) {
      const skillPath = join(import.meta.dir, "..", "skills", "shared", skillName, "SKILL.md");
      const contents = await readFile(skillPath, "utf8");

      expect(contents.includes(`name: ${skillName}`)).toBe(true);
      expect(contents.includes("parallel-cli")).toBe(true);
      expect(contents.includes("--json")).toBe(true);
    }
  });
});

describe("mergeClaudeSettingsText", () => {
  test("preserves unrelated keys and replaces mcpServers", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify(
        {
          env: { A: "1" },
          model: "sonnet",
          mcpServers: {
            old: { command: "old" },
          },
        },
        null,
        2,
      ),
      {
        context7: getServer(createRegistry(), "context7"),
      },
    );

    expect(JSON.parse(merged.text)).toMatchObject({
      env: { A: "1" },
      model: "sonnet",
      mcpServers: {
        context7: {
          command: "npx",
          args: ["-y", "@upstash/context7-mcp"],
        },
      },
    });
  });

  test("renders Parallel MCP URLs into Claude settings", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify({ model: "sonnet" }, null, 2),
      {
        "parallel-search": getServer(createRegistryWithParallelMcp(), "parallel-search"),
        "parallel-task": getServer(createRegistryWithParallelMcp(), "parallel-task"),
      },
    );

    expect(JSON.parse(merged.text)).toMatchObject({
      model: "sonnet",
      mcpServers: {
        "parallel-search": {
          url: "https://search.parallel.ai/mcp",
        },
        "parallel-task": {
          url: "https://task-mcp.parallel.ai/mcp",
        },
      },
    });
  });

  test("annotates http transports with type: 'http' so Claude Code recognizes them", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify({ model: "sonnet" }, null, 2),
      {
        slack: getServer(createRegistry(), "slack"),
      },
    );
    const parsed = JSON.parse(merged.text) as { mcpServers: Record<string, unknown> };

    expect(parsed.mcpServers["slack"]).toEqual({
      type: "http",
      url: "https://mcp.slack.com/mcp",
    });
  });

  test("passes ${VAR} env through unchanged for Claude's own expansion", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify({ model: "sonnet" }, null, 2),
      {
        notion: {
          description: "Notion token",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@notionhq/notion-mcp-server"],
          env: { NOTION_TOKEN: "${NOTION_TOKEN}", REGION: "us-east-1" },
          optional: false,
        },
      },
    );
    const parsed = JSON.parse(merged.text) as { mcpServers: Record<string, unknown> };

    expect(parsed.mcpServers["notion"]).toEqual({
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: { NOTION_TOKEN: "${NOTION_TOKEN}", REGION: "us-east-1" },
    });
  });
});

describe("mergeCodexTomlText", () => {
  test("preserves non-MCP sections and unmanaged servers while writing managed servers", () => {
    const merged = mergeCodexTomlText(
      [
        'personality = "pragmatic"',
        "",
        '[projects."/tmp/example"]',
        'trust_level = "trusted"',
        "",
        "[mcp_servers.custom]",
        'command = "user-owned"',
        "",
        "[notice.model_migrations]",
        '"old" = "new"',
        "",
      ].join("\n"),
      {
        context7: getServer(createRegistry(), "context7"),
      },
    );

    const parsed = parseToml(merged) as Record<string, unknown>;

    expect(parsed.personality).toBe("pragmatic");
    expect(parsed.projects).toEqual({
      "/tmp/example": { trust_level: "trusted" },
    });
    expect(parsed.notice).toEqual({
      model_migrations: { old: "new" },
    });
    expect(parsed.mcp_servers).toEqual({
      custom: { command: "user-owned" },
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        startup_timeout_sec: 30,
      },
    });
  });

  test("removes servers that were previously managed but are no longer active", () => {
    const merged = mergeCodexTomlText(
      ["[mcp_servers.context7]", 'command = "npx"', "", "[mcp_servers.notion]", 'command = "legacy"', ""].join("\n"),
      {
        context7: getServer(createRegistry(), "context7"),
      },
      ["notion"],
    );

    const parsed = parseToml(merged) as Record<string, unknown>;

    expect(Object.keys(parsed.mcp_servers as Record<string, unknown>)).toEqual(["context7"]);
    expect(merged.includes("[mcp_servers.notion]")).toBe(false);
  });

  test("renders Parallel MCP URLs into Codex TOML", () => {
    const merged = mergeCodexTomlText(
      'personality = "pragmatic"\n',
      {
        "parallel-search": getServer(createRegistryWithParallelMcp(), "parallel-search"),
        "parallel-task": getServer(createRegistryWithParallelMcp(), "parallel-task"),
      },
    );
    const parsed = parseToml(merged) as Record<string, unknown>;

    expect(parsed.mcp_servers).toEqual({
      "parallel-search": {
        url: "https://search.parallel.ai/mcp",
        enabled: true,
      },
      "parallel-task": {
        url: "https://task-mcp.parallel.ai/mcp",
        enabled: true,
      },
    });
  });

  test("marks http transports as enabled so Codex activates them", () => {
    const merged = mergeCodexTomlText(
      'personality = "pragmatic"\n',
      {
        slack: getServer(createRegistry(), "slack"),
      },
    );
    const parsed = parseToml(merged) as Record<string, unknown>;

    expect(parsed.mcp_servers).toEqual({
      slack: {
        url: "https://mcp.slack.com/mcp",
        enabled: true,
      },
    });
  });

  test("forwards ${VAR} env as env_vars and literals as an env table for stdio servers", () => {
    const merged = mergeCodexTomlText(
      'personality = "pragmatic"\n',
      {
        notion: {
          description: "Notion token",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@notionhq/notion-mcp-server"],
          env: { NOTION_TOKEN: "${NOTION_TOKEN}", REGION: "us-east-1" },
          optional: false,
        },
      },
    );
    const parsed = parseToml(merged) as Record<string, unknown>;

    expect(parsed.mcp_servers).toEqual({
      notion: {
        command: "npx",
        args: ["-y", "@notionhq/notion-mcp-server"],
        startup_timeout_sec: 30,
        env_vars: ["NOTION_TOKEN"],
        env: { REGION: "us-east-1" },
      },
    });
  });
});

describe("detectCodexLayerConflicts", () => {
  const stdioNotion = {
    description: "Notion token",
    transport: "stdio" as const,
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: { NOTION_TOKEN: "${NOTION_TOKEN}" },
    optional: false,
  };

  test("flags a server whose global entry uses a different transport", () => {
    const globalText = ['[mcp_servers.notion]', 'url = "https://mcp.notion.com/mcp"', "enabled = true"].join("\n");
    expect(detectCodexLayerConflicts(globalText, { notion: stdioNotion })).toEqual(["notion"]);
  });

  test("flags an opposite-direction transport collision", () => {
    const globalText = ["[mcp_servers.notion]", 'command = "user-notion"'].join("\n");
    const projectHttp = {
      description: "Project Notion",
      transport: "http" as const,
      url: "https://project.example.test/mcp",
      optional: false,
    };
    expect(detectCodexLayerConflicts(globalText, { notion: projectHttp })).toEqual(["notion"]);
  });

  test("does not flag when the global entry uses the same transport", () => {
    const globalText = ["[mcp_servers.notion]", 'command = "npx"'].join("\n");
    expect(detectCodexLayerConflicts(globalText, { notion: stdioNotion })).toEqual([]);
  });

  test("does not flag when the server is absent from the global layer or text is empty", () => {
    expect(detectCodexLayerConflicts('personality = "x"\n', { notion: stdioNotion })).toEqual([]);
    expect(detectCodexLayerConflicts("", { notion: stdioNotion })).toEqual([]);
  });
});

describe("syncRepository", () => {
  test("dry-run reports changes without mutating files", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const repoRoot = join(root, "repo");
    const agentsDir = join(homeDir, ".agents");
    const claudeSettingsPath = join(homeDir, ".claude", "settings.json");
    const codexConfigPath = join(homeDir, ".codex", "config.toml");
    const cursorConfigPath = join(homeDir, ".cursor", "mcp.json");

    await mkdir(join(repoRoot, "registry"), { recursive: true });
    await mkdir(join(repoRoot, "skills", "shared"), { recursive: true });
    await mkdir(dirname(claudeSettingsPath), { recursive: true });
    await mkdir(dirname(codexConfigPath), { recursive: true });
    await mkdir(dirname(cursorConfigPath), { recursive: true });
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    await writeFile(join(repoRoot, "registry", "mcp-servers.json"), JSON.stringify(createRegistry(), null, 2));
    await writeFile(
      join(repoRoot, "registry", "config.json"),
      JSON.stringify(
        {
          ...createConfig(false),
          targets: {
            claude: {
              enabled: true,
              configPath: claudeSettingsPath,
              format: "json-merge",
              mcpKey: "mcpServers",
            },
            codex: {
              enabled: true,
              configPath: codexConfigPath,
              format: "toml-merge",
              mcpKey: "mcp_servers",
            },
            cursor: {
              enabled: true,
              configPath: cursorConfigPath,
              format: "json-standalone",
              mcpKey: "mcpServers",            },
          },
        },
        null,
        2,
      ),
    );
    await writeFile(claudeSettingsPath, JSON.stringify({ model: "sonnet" }, null, 2));
    await writeFile(codexConfigPath, 'personality = "pragmatic"\n');
    await writeFile(cursorConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));

    const beforeClaude = await readFile(claudeSettingsPath, "utf8");
    const beforeCodex = await readFile(codexConfigPath, "utf8");
    const beforeCursor = await readFile(cursorConfigPath, "utf8");
    await selectFileMachineBlueprint({
      root,
      repoRoot,
      agentsDir,
      servers: { context7: createRegistry().servers.context7 },
    });

    const result = await syncRepository({
      repoRoot,
      agentsDir,
      homeDir,
      cwd: repoRoot,
      dryRun: true,
    });

    expect(result.changes.length).toBeGreaterThan(0);
    expect(await readFile(claudeSettingsPath, "utf8")).toBe(beforeClaude);
    expect(await readFile(codexConfigPath, "utf8")).toBe(beforeCodex);
    expect(await readFile(cursorConfigPath, "utf8")).toBe(beforeCursor);
  });

  test("skills sync ignores ambient copies and uses the active Worker Card source", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const repoRoot = join(root, "repo");
    const agentsDir = join(homeDir, ".agents");
    const sharedSkillPath = join(repoRoot, "skills", "shared", "alpha");
    const agentsSkillPath = join(agentsDir, "skills", "alpha");
    const claudeSkillPath = join(homeDir, ".claude", "skills", "alpha");
    const codexSkillPath = join(homeDir, ".codex", "skills", "alpha");

    await mkdir(join(repoRoot, "registry"), { recursive: true });
    await mkdir(sharedSkillPath, { recursive: true });
    await mkdir(dirname(agentsSkillPath), { recursive: true });
    await mkdir(dirname(claudeSkillPath), { recursive: true });
    await mkdir(dirname(codexSkillPath), { recursive: true });

    await writeFile(join(sharedSkillPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await mkdir(agentsSkillPath, { recursive: true });
    await writeFile(join(agentsSkillPath, "SKILL.md"), "ambient copy\n");
    await writeFile(join(repoRoot, "registry", "mcp-servers.json"), JSON.stringify(createRegistry(), null, 2));
    await writeFile(
      join(repoRoot, "registry", "config.json"),
      JSON.stringify(
        {
          ...createConfig(false),
          targets: {
            claude: {
              enabled: true,
              configPath: join(homeDir, ".claude", "settings.json"),
              format: "json-merge",
              mcpKey: "mcpServers",
            },
            codex: {
              enabled: true,
              configPath: join(homeDir, ".codex", "config.toml"),
              format: "toml-merge",
              mcpKey: "mcp_servers",
            },
            cursor: {
              enabled: false,
              configPath: join(homeDir, ".cursor", "mcp.json"),
              format: "json-standalone",
              mcpKey: "mcpServers",
            },
          },
        },
        null,
        2,
      ),
    );
    const memberDir = await selectFileMachineBlueprint({
      root,
      repoRoot,
      agentsDir,
      skills: ["alpha"],
    });

    await syncRepository({
      repoRoot,
      agentsDir,
      homeDir,
      cwd: repoRoot,
      skillsOnly: true,
    });

    expect((await lstat(claudeSkillPath)).isDirectory()).toBe(true);
    expect((await lstat(claudeSkillPath)).isSymbolicLink()).toBe(false);
    expect(await readFile(join(claudeSkillPath, "SKILL.md"), "utf8")).toBe(await readFile(join(memberDir, "skills", "alpha", "SKILL.md"), "utf8"));
    expect(await readFile(join(codexSkillPath, "SKILL.md"), "utf8")).toBe(await readFile(join(memberDir, "skills", "alpha", "SKILL.md"), "utf8"));
  });
});
