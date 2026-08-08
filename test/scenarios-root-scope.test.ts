// ABOUTME: Verifies `drwn write --root` materializes the active machine Worker into user-scope tool configs.
// ABOUTME: Protects per-server MCP ownership, drift detection, removal, and project isolation.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  cleanupTempRoots,
  createFixtureRegistry,
  envFor,
  installMachineBlueprint,
  publishMachineBlueprint,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";
import { loadWriteRecord } from "../cli/core/write-record";
import { resolveGlobalWriteRecordPath } from "../cli/core/store-paths";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function readJson(pathValue: string) {
  return JSON.parse(await readFile(pathValue, "utf8")) as Record<string, any>;
}

async function writeJson(pathValue: string, value: unknown) {
  await mkdir(dirname(pathValue), { recursive: true });
  await writeFile(pathValue, `${JSON.stringify(value, null, 2)}\n`);
}

async function runWriteRoot(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, args: string[] = [], cwd?: string) {
  return await runAgentsCli(["write", "--root", "--mcp-only", "--json", ...args], envFor(fixture), cwd);
}

async function ensureContext7Default(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await installMachineBlueprint(fixture, {
    skills: ["alpha"],
    servers: { context7: createFixtureRegistry().servers.context7 },
  });
}

async function clearActiveMachineWorker(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
) {
  const result = await runAgentsCli(
    ["use", "--root", "--none", "--no-write"],
    envFor(fixture),
  );
  expect(result.exitCode, result.stderr).toBe(0);
}

test("write --root surgically adds default MCPs to user-scope tool configs", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  await writeJson(fixture.claudeUserMcp, {
    numStartups: 482,
    userID: "user-abc",
    mcpServers: {
      manual: { type: "http", url: "https://manual.example/mcp" },
    },
    projects: { "/tmp/project": { lastActive: "2026-06-24" } },
  });
  await writeFile(
    fixture.codexConfig,
    'personality = "pragmatic"\n\n[mcp_servers.manual]\nurl = "https://manual.example/mcp"\nenabled = true\n',
  );
  await writeJson(fixture.cursorConfig, {
    mcpServers: { manual: { url: "https://manual.example/mcp" } },
  });

  const result = await runWriteRoot(fixture);

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { changes: string[]; managedPaths?: Array<any> };
  expect(parsed.changes.some((change) => change.includes(fixture.claudeUserMcp))).toBe(true);
  expect(parsed.changes.some((change) => change.includes(fixture.codexConfig))).toBe(true);
  expect(parsed.changes.some((change) => change.includes(fixture.cursorConfig))).toBe(true);

  const claude = await readJson(fixture.claudeUserMcp);
  expect(claude.numStartups).toBe(482);
  expect(claude.userID).toBe("user-abc");
  expect(claude.projects).toEqual({ "/tmp/project": { lastActive: "2026-06-24" } });
  expect(claude.mcpServers.manual).toEqual({ type: "http", url: "https://manual.example/mcp" });
  expect(claude.mcpServers.context7.command).toBe("npx");
  expect(claude._drwn).toBeUndefined();

  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.manual]");
  expect((await lstat(fixture.cursorConfig)).isFile()).toBe(true);
  expect((await readJson(fixture.cursorConfig)).mcpServers.context7).toBeDefined();
  expect((await readJson(fixture.cursorConfig)).mcpServers.manual).toEqual({ url: "https://manual.example/mcp" });

  const record = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  const claudeEntry = record.managedPaths.find((entry: any) => entry.path === ".claude.json");
  expect(claudeEntry?.kind).toBe("managed-fields");
  expect(claudeEntry?.fields).toEqual(["mcpServers:context7"]);
  expect(claudeEntry?.fieldHashes?.["mcpServers:context7"]).toStartWith("sha256-");
  const cursorEntry = record.managedPaths.find((entry: any) => entry.path === ".cursor/mcp.json");
  expect(cursorEntry?.kind).toBe("managed-fields");
  expect(cursorEntry?.fields).toEqual(["mcpServers:context7"]);
});

test("doctor ignores unrelated Cursor MCP siblings after a machine write", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  await writeJson(fixture.cursorConfig, {
    mcpServers: { manual: { url: "https://manual.example/mcp" } },
  });
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  const doctor = await runAgentsCli(["doctor", "--json"], envFor(fixture));

  expect(doctor.exitCode).toBe(0);
  const report = JSON.parse(doctor.stdout) as { mcpDrift: string[] };
  expect(report.mcpDrift.some((entry) => entry.startsWith("cursor:"))).toBe(false);
});

const foreignMcpTargets = ["claude", "codex", "cursor"] as const;

for (const target of foreignMcpTargets) {
  test(`first machine write rejects a foreign same-ID ${target} MCP entry`, async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await ensureContext7Default(fixture);
    if (target === "claude") {
      await writeJson(fixture.claudeUserMcp, { mcpServers: { context7: { command: "foreign" } } });
    } else if (target === "codex") {
      await writeFile(fixture.codexConfig, '[mcp_servers.context7]\ncommand = "foreign"\n');
    } else {
      await writeJson(fixture.cursorConfig, { mcpServers: { context7: { command: "foreign" } } });
    }
    const targetPath = target === "claude" ? fixture.claudeUserMcp : target === "codex" ? fixture.codexConfig : fixture.cursorConfig;
    const before = await readFile(targetPath, "utf8");

    const result = await runWriteRoot(fixture, [`--target=${target}`]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
    expect(await readFile(targetPath, "utf8")).toBe(before);
  });
}

test("foreign conflict preflight prevents mutation of every selected target, including dry-run and force", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  await writeJson(fixture.cursorConfig, { mcpServers: { context7: { command: "foreign" } } });
  const before = {
    claude: await readFile(fixture.claudeUserMcp, "utf8"),
    codex: await readFile(fixture.codexConfig, "utf8"),
    cursor: await readFile(fixture.cursorConfig, "utf8"),
  };

  for (const args of [[], ["--dry-run"], ["--force"]]) {
    const result = await runWriteRoot(fixture, args);
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
    expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(before.claude);
    expect(await readFile(fixture.codexConfig, "utf8")).toBe(before.codex);
    expect(await readFile(fixture.cursorConfig, "utf8")).toBe(before.cursor);
  }
});

test("write --root detects drift only for drwn-owned MCP server entries", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  await writeJson(fixture.claudeUserMcp, {
    mcpServers: {
      manual: { type: "http", url: "https://manual.example/mcp" },
    },
  });
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  const siblingEdited = await readJson(fixture.claudeUserMcp);
  siblingEdited.mcpServers.manual.url = "https://changed.example/mcp";
  await writeJson(fixture.claudeUserMcp, siblingEdited);

  const siblingResult = await runWriteRoot(fixture);
  expect(siblingResult.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.manual.url).toBe("https://changed.example/mcp");

  const ownedEdited = await readJson(fixture.claudeUserMcp);
  ownedEdited.mcpServers.context7.command = "node";
  await writeJson(fixture.claudeUserMcp, ownedEdited);

  const drift = await runWriteRoot(fixture);
  expect(drift.exitCode).not.toBe(0);
  expect(`${drift.stdout}\n${drift.stderr}`).toContain("context7");

  const forced = await runWriteRoot(fixture, ["--force"]);
  expect(forced.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7.command).toBe("npx");
});

test("write --root removes the last drwn-owned MCP entry without touching hand-managed siblings", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  await writeJson(fixture.claudeUserMcp, {
    mcpServers: {
      manual: { type: "http", url: "https://manual.example/mcp" },
    },
  });
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  await clearActiveMachineWorker(fixture);
  const rewrite = await runWriteRoot(fixture);
  expect(rewrite.exitCode).toBe(0);

  const claude = await readJson(fixture.claudeUserMcp);
  expect(claude.mcpServers.context7).toBeUndefined();
  expect(claude.mcpServers.manual).toEqual({ type: "http", url: "https://manual.example/mcp" });
  expect((await readJson(fixture.cursorConfig)).mcpServers?.context7).toBeUndefined();
  expect(await readFile(fixture.codexConfig, "utf8")).not.toContain("[mcp_servers.context7]");
  const record = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(record.managedPaths.some((entry: any) => entry.path === ".claude.json")).toBe(false);
});

test("removing a capability rejects drifted prior-owned MCP entries until force removes them", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  const claude = await readJson(fixture.claudeUserMcp);
  claude.mcpServers.context7.command = "drifted-claude";
  await writeJson(fixture.claudeUserMcp, claude);
  await writeFile(fixture.codexConfig, (await readFile(fixture.codexConfig, "utf8")).replace('command = "npx"', 'command = "drifted-codex"'));
  const cursor = await readJson(fixture.cursorConfig);
  cursor.mcpServers.context7.command = "drifted-cursor";
  await writeJson(fixture.cursorConfig, cursor);
  await clearActiveMachineWorker(fixture);

  const result = await runWriteRoot(fixture);

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7.command).toBe("drifted-claude");
  expect(await readFile(fixture.codexConfig, "utf8")).toContain('command = "drifted-codex"');
  expect((await readJson(fixture.cursorConfig)).mcpServers.context7.command).toBe("drifted-cursor");
  const blockedRecord = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(blockedRecord.managedPaths.filter((entry: any) => entry.surface === "mcp")).not.toHaveLength(0);

  const forced = await runWriteRoot(fixture, ["--force"]);
  expect(forced.exitCode, forced.stderr).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeUndefined();
  expect(await readFile(fixture.codexConfig, "utf8")).not.toContain("[mcp_servers.context7]");
  expect((await readJson(fixture.cursorConfig)).mcpServers.context7).toBeUndefined();
  const forcedRecord = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(forcedRecord.managedPaths.some((entry: any) => entry.surface === "mcp")).toBe(false);
});

test("removing a capability rejects a prior-owned MCP config whose path changed type", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture, ["--target=cursor"])).exitCode).toBe(0);
  await clearActiveMachineWorker(fixture);
  await rm(fixture.cursorConfig, { force: true });
  await mkdir(fixture.cursorConfig, { recursive: true });
  await writeFile(join(fixture.cursorConfig, "sentinel"), "foreign\n");

  const result = await runWriteRoot(fixture, ["--target=cursor"]);

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
  expect((await lstat(fixture.cursorConfig)).isDirectory()).toBe(true);
  expect(await readFile(join(fixture.cursorConfig, "sentinel"), "utf8")).toBe("foreign\n");
  const blockedRecord = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(blockedRecord.managedPaths.some((entry: any) => entry.path === ".cursor/mcp.json")).toBe(true);

  const forced = await runWriteRoot(fixture, ["--target=cursor", "--force"]);
  expect(forced.exitCode, forced.stderr).toBe(0);
  expect((await lstat(fixture.cursorConfig)).isDirectory()).toBe(true);
  expect(await readFile(join(fixture.cursorConfig, "sentinel"), "utf8")).toBe("foreign\n");
  const forcedRecord = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(forcedRecord.managedPaths.some((entry: any) => entry.path === ".cursor/mcp.json")).toBe(true);
});

test("write --root with no active machine Worker leaves user-scope MCP files unchanged", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  const repoConfig = await readJson(join(fixture.repoRoot, "registry", "config.json"));
  repoConfig.defaults = { ...(repoConfig.defaults ?? {}), mcpServers: [] };
  await writeJson(join(fixture.agentsDir, "drwn", "config.json"), repoConfig);
  await writeJson(fixture.claudeUserMcp, {
    numStartups: 3,
    mcpServers: {
      manual: { type: "http", url: "https://manual.example/mcp" },
    },
  });
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");

  const result = await runWriteRoot(fixture);

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
  expect(JSON.parse(result.stdout).warnings.join("\n")).toContain("no active machine Worker MCP servers");
});

test("write --root ignores project config and leaves project MCP files untouched", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeJson(join(projectDir, ".agents", "drwn", "config.json"), {
    version: 1,
    servers: { context7: { enabled: false } },
  });

  const result = await runWriteRoot(fixture, [], projectDir);

  expect(result.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();
  expect(existsSync(join(projectDir, ".mcp.json"))).toBe(false);
  expect(existsSync(join(projectDir, ".codex", "config.toml"))).toBe(false);
});

test("doctor reports user-scope Claude MCP drift from the per-server write record", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);
  const edited = await readJson(fixture.claudeUserMcp);
  edited.mcpServers.context7.command = "node";
  await writeJson(fixture.claudeUserMcp, edited);

  const doctor = await runAgentsCli(["doctor", "--json"], envFor(fixture));

  expect(doctor.exitCode).toBe(0);
  const report = JSON.parse(doctor.stdout) as { mcpDrift: string[] };
  expect(report.mcpDrift.some((item) => item.includes(".claude.json"))).toBe(true);
});

// ───────────────────────────────────────────────────────────────────────────
// Task 51 — must-have additions (M2, M3a, M3b)
// ───────────────────────────────────────────────────────────────────────────

test("write --root does not flag drift after ~/.claude.json is re-serialized with different key ordering", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Simulate Claude Code rewriting the file with sorted keys (it does this on UI
  // settings changes — keys can get re-sorted and whitespace can change).
  const parsed = await readJson(fixture.claudeUserMcp);
  const sortKeys = (value: any): any => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
    }
    return value;
  };
  await writeJson(fixture.claudeUserMcp, sortKeys(parsed));

  const second = await runWriteRoot(fixture);
  expect(second.exitCode).toBe(0);
  expect(`${second.stdout}\n${second.stderr}`).not.toContain("Drift detected");
  // The owned entry survives the round-trip intact.
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7.command).toBe("npx");
});

test("write rejects passing both --root and --user simultaneously", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(
    ["write", "--root", "--user", "--mcp-only", "--json"],
    envFor(fixture),
  );
  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/--root or --user/i);
});

test("write --user behaves identically to write --root", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);

  const result = await runAgentsCli(
    ["write", "--user", "--mcp-only", "--json"],
    envFor(fixture),
  );
  expect(result.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();

  // Side-table records --user write the same way --root does.
  const record = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(record.managedPaths.some((entry: any) => entry.path === ".claude.json")).toBe(true);
});

// ───────────────────────────────────────────────────────────────────────────
// Task 51 — should-have additions (S1, S2a/b/c, S4, S5)
// ───────────────────────────────────────────────────────────────────────────

test("write --root --dry-run produces a plan but does not modify any user-scope file", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");
  const writeRecordPath = join(fixture.agentsDir, "drwn", "global-write-record.json");

  const result = await runAgentsCli(
    ["write", "--root", "--mcp-only", "--dry-run", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { changes: string[] };
  expect(parsed.changes.length).toBeGreaterThan(0);
  expect(parsed.changes.some((c) => c.includes(fixture.claudeUserMcp))).toBe(true);

  // No actual writes, no write-record persistence.
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
  expect(existsSync(writeRecordPath)).toBe(false);
});

test("write --root --target=claude writes only ~/.claude.json", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=claude", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
});

test("write --root --target=codex writes only ~/.codex/config.toml", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=codex", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
});

test("write --root --target=opencode merges into the machine opencode config", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=opencode", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const opencode = await readJson(fixture.opencodeConfig);
  expect(opencode.$schema).toBe("https://opencode.ai/config.json");
  expect(opencode.mcp.context7).toMatchObject({ type: "local", enabled: true });
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  const record = loadWriteRecord(resolveGlobalWriteRecordPath(fixture.agentsDir), "machine");
  expect(record?.managedPaths).toContainEqual(
    expect.objectContaining({
      path: ".config/opencode/opencode.json",
      surface: "mcp",
      target: "opencode",
    }),
  );
});

test("write --root --target=cursor writes only ~/.cursor/mcp.json", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=cursor", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect((await lstat(fixture.cursorConfig)).isFile()).toBe(true);
  expect((await readJson(fixture.cursorConfig)).mcpServers.context7).toBeDefined();
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
});

test("target-limited machine writes retain ownership and bytes for unselected targets", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");
  const beforeCursor = await readFile(fixture.cursorConfig, "utf8");

  const result = await runWriteRoot(fixture, ["--target=claude"]);

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
  expect(await readFile(fixture.cursorConfig, "utf8")).toBe(beforeCursor);
  const record = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(record.managedPaths.some((entry: any) => entry.path === ".codex/config.toml")).toBe(true);
  expect(record.managedPaths.some((entry: any) => entry.path === ".cursor/mcp.json")).toBe(true);
});

test("mode-limited machine writes retain ownership for the unselected capability surface", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const fullRef = await publishMachineBlueprint(fixture, {
    rootName: "@me/full-worker",
    memberName: "@me/full-capabilities",
    skills: ["alpha"],
    servers: { context7: createFixtureRegistry().servers.context7 },
  });
  const mcpRef = await publishMachineBlueprint(fixture, {
    rootName: "@me/mcp-worker",
    memberName: "@me/mcp-capabilities",
    servers: { context7: createFixtureRegistry().servers.context7 },
  });
  const { applyMachineWorkerRoots } = await import("../cli/core/worker-machine");
  await applyMachineWorkerRoots(fixture.agentsDir, [fullRef, mcpRef], {
    active: "@me/full-worker",
  });
  expect((await runAgentsCli(["write", "--scope", "machine"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(
    ["use", "@me/mcp-worker", "--root", "--no-write"],
    envFor(fixture),
  )).exitCode).toBe(0);

  const skillsOnly = await runAgentsCli(["write", "--scope", "machine", "--skills-only"], envFor(fixture));
  expect(skillsOnly.exitCode).toBe(0);
  expect(existsSync(join(fixture.homeDir, ".claude", "skills", "alpha"))).toBe(false);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();

  await clearActiveMachineWorker(fixture);
  const mcpOnly = await runAgentsCli(["write", "--scope", "machine", "--mcp-only"], envFor(fixture));
  expect(mcpOnly.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers?.context7).toBeUndefined();
}, 15_000);

test("write --root with empty defaults but prior ownership prunes without emitting the no-defaults warning", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Confirm both Claude and Codex own context7 after the first write.
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();

  // Remove the default via the CLI — empties the active server set but the
  // write-record still records prior ownership.
  await clearActiveMachineWorker(fixture);

  const result = await runWriteRoot(fixture);

  expect(result.exitCode).toBe(0);
  const warnings = (JSON.parse(result.stdout).warnings as string[]).join("\n");
  expect(warnings).not.toContain("no machine-default MCP servers");
  // Cleanup actually ran across both targets.
  expect(await readFile(fixture.codexConfig, "utf8")).not.toContain("[mcp_servers.context7]");
  expect((await readJson(fixture.claudeUserMcp)).mcpServers?.context7).toBeUndefined();
});

test("write --root leaves no orphaned .tmp files after a successful write", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);

  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Atomic write contract: every <path>.tmp must have been renamed away.
  expect(existsSync(`${fixture.claudeUserMcp}.tmp`)).toBe(false);
  expect(existsSync(`${fixture.codexConfig}.tmp`)).toBe(false);
  expect(existsSync(`${fixture.cursorConfig}.tmp`)).toBe(false);
});
