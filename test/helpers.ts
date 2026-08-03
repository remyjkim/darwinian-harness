// ABOUTME: Provides reusable temp-repo and temp-home fixtures for CLI and core integration tests.
// ABOUTME: Centralizes CLI spawning with environment overrides so tests never touch the real machine state.

import { expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, cp } from "node:fs/promises";
import { chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CanonicalConfig, CanonicalRegistry, ProjectConfig } from "../cli/core/types";
import { writeCardLock, type CardLockEntry, type ProjectLockGraph } from "../cli/core/card-lock";
import { createDarwinianOperatorPin, DARWINIAN_OPERATOR_PROFILE } from "../cli/core/operator-profile-contract";

export function projectLockGraph(cards: CardLockEntry[]): ProjectLockGraph {
  return {
    workerRoots: cards.map((card) => ({
      name: card.name,
      requested: card.requested,
      kind: card.manifest.kind === "blueprint" ? "blueprint" : "card",
      members: [],
    })),
    cards,
  };
}

export async function writeTestCardLock(projectRoot: string, cards: CardLockEntry[]) {
  return writeCardLock(projectRoot, projectLockGraph(cards));
}

export function supportedProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: [],
    activeWorker: null,
    ...overrides,
  };
}

export async function writeSupportedProjectConfig(projectRoot: string, overrides: Partial<ProjectConfig> = {}) {
  const path = join(projectRoot, ".agents", "drwn", "config.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(supportedProjectConfig(overrides), null, 2)}\n`);
  return path;
}

export async function installProjectWorkers(
  projectRoot: string,
  agentsDir: string,
  workers: string[],
  activeWorker: string | null,
  overrides: Partial<ProjectConfig> = {},
) {
  const { applyProjectWorkerRoots } = await import("../cli/core/worker-project");
  await writeSupportedProjectConfig(projectRoot, overrides);
  await applyProjectWorkerRoots(projectRoot, agentsDir, workers, {
    ...(activeWorker === null ? { none: true } : { active: activeWorker }),
  });
}

export async function createTempRoot(prefix: string) {
  return await mkdtemp(join(tmpdir(), prefix));
}

export async function cleanupTempRoots(roots: string[]) {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
}

export function createFixtureRegistry(): CanonicalRegistry {
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
      "parallel-search": {
        description: "Parallel Search MCP",
        transport: "http",
        url: "https://search.parallel.ai/mcp",
        optional: false,
      },
    },
  };
}

export function createFixtureConfig(
  paths: { claudeSettings: string; codexConfig: string; cursorConfig: string; claudeUserMcp?: string; opencodeConfig?: string },
  parallelMcpEnabled = false,
): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: {
        enabled: true,
        configPath: paths.claudeSettings,
        ...(paths.claudeUserMcp ? { userMcpPath: paths.claudeUserMcp } : {}),
        format: "json-merge",
        mcpKey: "mcpServers",
      },
      codex: { enabled: true, configPath: paths.codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: paths.cursorConfig, format: "json-standalone", mcpKey: "mcpServers" },
      opencode: {
        enabled: true,
        configPath: paths.opencodeConfig ?? "~/.config/opencode/opencode.json",
        format: "json-merge",
        mcpKey: "mcp",
      },
    },
    catalogs: {
      npmSkills: { enabled: true, searchLimit: 20 },
      mcp: { enabled: false, sources: [] },
    },
    optional: {},
    parallel: { cli: { enabled: true }, mcp: { enabled: parallelMcpEnabled } },
  };
}

export async function scaffoldCliFixture(options?: { parallelMcpEnabled?: boolean; curatedSkillNames?: string[] }) {
  const root = await createTempRoot("agents-cli-");
  const repoRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const claudeSettings = join(homeDir, ".claude", "settings.json");
  const claudeUserMcp = join(homeDir, ".claude.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const cursorConfig = join(homeDir, ".cursor", "mcp.json");
  const opencodeConfig = join(homeDir, ".config", "opencode", "opencode.json");

  await mkdir(join(repoRoot, "registry"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "shared"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "claude-only"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "codex-only"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "experimental"), { recursive: true });
  await mkdir(dirname(claudeSettings), { recursive: true });
  await mkdir(dirname(codexConfig), { recursive: true });
  await mkdir(dirname(cursorConfig), { recursive: true });
  await mkdir(join(agentsDir, "skills"), { recursive: true });

  await writeFile(join(repoRoot, "registry", "mcp-servers.json"), JSON.stringify(createFixtureRegistry(), null, 2));
  await writeFile(
    join(repoRoot, "registry", "config.json"),
    JSON.stringify(
      createFixtureConfig({ claudeSettings, codexConfig, cursorConfig, claudeUserMcp, opencodeConfig }, options?.parallelMcpEnabled ?? false),
      null,
      2,
    ),
  );
  await writeFile(claudeSettings, JSON.stringify({ model: "sonnet" }, null, 2));
  await writeFile(claudeUserMcp, JSON.stringify({ numStartups: 1 }, null, 2));
  await writeFile(codexConfig, 'personality = "pragmatic"\n');
  await writeFile(cursorConfig, JSON.stringify({ mcpServers: {} }, null, 2));

  for (const name of ["alpha", "beta"]) {
    const skillDir = join(repoRoot, "skills", "shared", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n`);
  }

  for (const name of options?.curatedSkillNames ?? []) {
    await cp(join(repoRoot, "skills", "shared", name), join(agentsDir, "skills", name), { recursive: true });
  }

  return { root, repoRoot, homeDir, agentsDir, claudeSettings, claudeUserMcp, codexConfig, cursorConfig, opencodeConfig };
}

export function envFor(fixture: { repoRoot: string; homeDir: string; agentsDir: string }) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

export async function createCatalogCardSource(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  options: { kind?: "card" | "blueprint"; noGit?: boolean } = {},
) {
  const catalogRoot = join(fixture.root, "card-catalog");
  const cardsDir = join(catalogRoot, "cards");
  const command = options.kind === "blueprint" ? "worker" : "card";
  const result = await runAgentsCli(
    [command, "new", name, "--into", cardsDir, ...(options.noGit === false ? [] : ["--no-git"])],
    envFor(fixture),
  );
  expect(result.exitCode).toBe(0);
  expect((await runAgentsCli(["config", "set", "catalogCheckouts", JSON.stringify([catalogRoot])], envFor(fixture))).exitCode).toBe(0);
  const baseName = name.split("/").at(-1);
  if (!baseName) throw new Error(`Invalid Card name: ${name}`);
  return join(cardsDir, baseName);
}

export async function publishCardWithSkills(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: {
    name: string;
    version?: string;
    skills: string[];
    servers?: Record<string, unknown>;
    instructions?: { text: string };
    hooks?: string[];
  },
): Promise<string> {
  const version = options.version ?? "1.0.0";
  const match = options.name.match(/^(@[^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Use a scoped card name in tests: ${options.name}`);
  }
  const [, scope, cardName] = match;
  const catalogRoot = join(fixture.root, "card-catalog");
  const sourceParent = join(catalogRoot, "cards");
  const sourceRoot = join(sourceParent, cardName!);
  if (!existsSync(join(sourceRoot, "card.json"))) {
    expect((await runAgentsCli(["card", "new", options.name, "--into", sourceParent, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  }
  expect((await runAgentsCli(["config", "set", "catalogCheckouts", JSON.stringify([catalogRoot])], envFor(fixture))).exitCode).toBe(0);

  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.version = version;
  manifest.skills = { include: options.skills };
  if (options.servers) {
    manifest.servers = options.servers;
  }
  if (options.instructions) {
    manifest.instructions = options.instructions;
  }
  if (options.hooks && options.hooks.length > 0) {
    manifest.hooks = { include: options.hooks };
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const skill of options.skills) {
    const skillDir = join(sourceRoot, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n`);
  }
  for (const hook of options.hooks ?? []) {
    const hookDir = join(sourceRoot, "hooks", hook);
    await mkdir(hookDir, { recursive: true });
    await writeFile(
      join(hookDir, "policy.ts"),
      "export default { policyKind: 'observer' };\n",
    );
  }

  const published = await runAgentsCli(["card", "publish", options.name, "--from", sourceRoot], envFor(fixture));
  expect(published.exitCode).toBe(0);
  const { resolveCard } = await import("../cli/core/card-store");
  return (await resolveCard(fixture.agentsDir, `${scope}/${cardName}@${version}`)).dir;
}

export async function publishMachineBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: {
    rootName?: string;
    memberName?: string;
    skills?: string[];
    servers?: Record<string, unknown>;
    instructions?: { text: string };
    hooks?: string[];
  } = {},
) {
  const rootName = options.rootName ?? "@me/machine-worker";
  const memberName = options.memberName ?? "@me/machine-capabilities";
  await publishCardWithSkills(fixture, {
    name: memberName,
    skills: options.skills ?? [],
    servers: options.servers,
    instructions: options.instructions,
    hooks: options.hooks,
  });
  const sourceDir = await createCatalogCardSource(fixture, rootName, {
    kind: "blueprint",
  });
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.kind = "blueprint";
  manifest.composedFrom = [`${memberName}@1.0.0`];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const published = await runAgentsCli(
    ["card", "publish", rootName],
    envFor(fixture),
  );
  expect(published.exitCode, published.stderr).toBe(0);
  return `${rootName}@1.0.0`;
}

export async function installMachineBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: {
    rootName?: string;
    memberName?: string;
    skills?: string[];
    servers?: Record<string, unknown>;
    instructions?: { text: string };
    hooks?: string[];
  } = {},
) {
  const ref = await publishMachineBlueprint(fixture, options);
  const { applyMachineWorkerRoots } = await import("../cli/core/worker-machine");
  return applyMachineWorkerRoots(fixture.agentsDir, [ref]);
}

export async function publishExactOperatorProfile(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
) {
  const catalogRoot = join(fixture.root, "card-catalog");
  const sourceRoot = join(catalogRoot, "cards", "operator");
  await mkdir(dirname(sourceRoot), { recursive: true });
  await cp(join(import.meta.dir, "..", "darwinian-worker-skills", "cards", "operator"), sourceRoot, {
    recursive: true,
  });
  expect((await runAgentsCli(["config", "set", "catalogCheckouts", JSON.stringify([catalogRoot])], envFor(fixture))).exitCode).toBe(0);
  const published = await runAgentsCli(["card", "publish", DARWINIAN_OPERATOR_PROFILE.name, "--from", sourceRoot], envFor(fixture));
  expect(published.exitCode).toBe(0);
  const { resolveCard } = await import("../cli/core/card-store");
  const resolved = await resolveCard(
    fixture.agentsDir,
    `${DARWINIAN_OPERATOR_PROFILE.name}@${DARWINIAN_OPERATOR_PROFILE.version}`,
  );
  expect(resolved.treeSha).toBe(DARWINIAN_OPERATOR_PROFILE.treeSha);
  expect(resolved.integrity).toBe(DARWINIAN_OPERATOR_PROFILE.integrity);
  return { profile: createDarwinianOperatorPin(), resolved };
}

export async function createInstalledSkillBundle(
  agentsDir: string,
  options?: {
    packageName?: string;
    version?: string;
    skillName?: string;
    scope?: "shared" | "claude-only" | "codex-only" | "experimental";
  },
) {
  const packageName = options?.packageName ?? "@acme/skills-sample";
  const version = options?.version ?? "1.0.0";
  const skillName = options?.skillName ?? "hello-skill";
  const scope = options?.scope ?? "shared";
  const packageRoot = join(agentsDir, "drwn", "skills", ...packageName.split("/"), version);
  const skillDir = join(packageRoot, "skills", scope, skillName);

  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: ${skillName}\n---\n`);
  await writeFile(
    join(packageRoot, "bundle.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        bundleName: packageName,
        version,
        skills: [{ name: skillName, scope, path: `skills/${scope}/${skillName}` }],
      },
      null,
      2,
    ),
  );
  await writeFile(join(dirname(packageRoot), "current"), `${version}\n`);

  return { packageName, version, skillName, scope, packageRoot, skillDir };
}

export async function createSkillBundleFixture(
  root: string,
  options?: { packageName?: string; version?: string; skillName?: string },
) {
  const packageName = options?.packageName ?? "@acme/skills-sample";
  const version = options?.version ?? "1.0.0";
  const skillName = options?.skillName ?? "hello-skill";
  const bundleRoot = join(root, "bundle");
  const skillDir = join(bundleRoot, "skills", "shared", skillName);

  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(bundleRoot, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version,
        description: "fixture",
        license: "MIT",
        files: ["skills", "bundle.json", "README.md"],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(bundleRoot, "bundle.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        bundleName: packageName,
        version,
        displayName: "Sample Skills",
        skills: [{ name: skillName, scope: "shared", path: `skills/shared/${skillName}` }],
      },
      null,
      2,
    ),
  );
  await writeFile(join(bundleRoot, "README.md"), "# fixture\n");
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: fixture\n---\n`);
  return { bundleRoot, packageName, version, skillName };
}

export async function createExecutable(dir: string, name: string, body: string) {
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

function withTestWriteScope(args: string[], cwd?: string, env?: Record<string, string>): string[] {
  if (args[0] !== "write") {
    return args;
  }
  const hasScope = args.some(
    (arg, index) =>
      arg === "--root" ||
      arg === "--user" ||
      arg === "--scope" ||
      arg.startsWith("--scope=") ||
      (index > 0 && args[index - 1] === "--scope"),
  );
  if (hasScope) {
    return args;
  }
  const root = cwd ?? env?.AGENTS_REPO_ROOT;
  if (root && existsSync(join(root, ".agents", "drwn", "config.json"))) {
    return args;
  }
  return [...args, "--scope", "machine"];
}

export async function runAgentsCli(
  args: string[],
  env: Record<string, string>,
  cwd?: string,
  options?: { stdin?: string; skipWriteScopeAuto?: boolean },
) {
  const entrypoint = fileURLToPath(new URL("../cli/index.ts", import.meta.url));
  const cliArgs = options?.skipWriteScopeAuto ? args : withTestWriteScope(args, cwd, env);
  // Resolve bun via PATH; process.execPath is not reliably spawnable on some CI runners.
  const bunBin = Bun.which("bun") ?? process.execPath;
  const proc = Bun.spawn([bunBin, "run", entrypoint, ...cliArgs], {
    cwd: cwd ?? env.AGENTS_REPO_ROOT ?? join(import.meta.dir, ".."),
    // Close stdin when none is provided so a spawned subprocess can never block reading it.
    stdin: options?.stdin !== undefined ? Buffer.from(options.stdin) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // Force non-interactive git so credential prompts fail fast instead of hanging on CI.
      GIT_TERMINAL_PROMPT: "0",
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

export async function runGlobalAgentsCli(args: string[], env: Record<string, string>) {
  const proc = Bun.spawn(["drwn", ...args], {
    cwd: env.AGENTS_REPO_ROOT ?? join(import.meta.dir, ".."),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

export async function runSyncWrapper(args: string[], env: Record<string, string>) {
  const entrypoint = fileURLToPath(new URL("../sync-mcp.ts", import.meta.url));
  const bunBin = Bun.which("bun") ?? process.execPath;
  const proc = Bun.spawn([bunBin, "run", entrypoint, ...args], {
    cwd: env.AGENTS_REPO_ROOT ?? join(import.meta.dir, ".."),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}
