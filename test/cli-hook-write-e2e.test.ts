// ABOUTME: Verifies drwn write materializes card hook composers end to end.
// ABOUTME: Protects source-to-publish-to-project hook wiring across runtimes.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { cleanupTempRoots, createCatalogCardSource, envFor, installProjectWorkers, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";
import { loadWriteRecord, resolveProjectWriteRecordPath } from "../cli/core/write-record";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function runComposer(path: string, payload: unknown) {
  const proc = Bun.spawn([(Bun.which("bun") ?? process.execPath), path], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify(payload));
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function publishHookPolicyCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const policyPath = join(sourceDir, "hooks", "guard", "policy.ts");
  await writeFile(policyPath, `
    import { defineToolPolicy } from "darwinian/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      matcher: "Bash",
      beforeToolCall() {
        return { action: "deny", reason: "blocked" };
      },
    });
  `);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  return JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8")) as { version: string };
}

async function createProjectWithTrustedHookCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const manifest = await publishHookPolicyCard(fixture);
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy");
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  return projectDir;
}

test("drwn write materializes card hook composers and runtime settings", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const policyPath = join(sourceDir, "hooks", "guard", "policy.ts");
  await writeFile(policyPath, `
    import { defineToolPolicy } from "darwinian/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      matcher: "Bash",
      beforeToolCall(event) {
        return { action: "deny", reason: \`blocked by \${event.runtime}\` };
      },
    });
  `);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));

  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy");
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const writeResult = JSON.parse(write.stdout);
  expect(writeResult.warnings.join("\n")).toContain("/hooks");
  const claudeComposer = join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs");
  const codexComposer = join(projectDir, ".agents", "drwn", "generated", "hooks", "codex", "composer.mjs");
  expect(existsSync(claudeComposer)).toBe(true);
  expect(existsSync(codexComposer)).toBe(true);
  const resolvedClaudeComposer = await realpath(claudeComposer);
  const resolvedCodexComposer = await realpath(codexComposer);
  const claudeSettings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  expect(claudeSettings.hooks.PreToolUse[0].hooks[0].args).toEqual([resolvedClaudeComposer]);
  const codexHooks = JSON.parse(await readFile(join(projectDir, ".codex", "hooks.json"), "utf8"));
  expect(codexHooks.hooks.PreToolUse[0].hooks[0].command).toContain(resolvedCodexComposer);
  const cursorComposer = join(projectDir, ".agents", "drwn", "generated", "hooks", "cursor", "composer.mjs");
  expect(existsSync(cursorComposer)).toBe(true);
  const resolvedCursorComposer = await realpath(cursorComposer);
  const cursorHooks = JSON.parse(await readFile(join(projectDir, ".cursor", "hooks.json"), "utf8"));
  expect(cursorHooks.version).toBe(1);
  expect(cursorHooks.hooks.preToolUse[0].command).toContain(resolvedCursorComposer);
  expect(cursorHooks.hooks.postToolUse[0].command).toContain(resolvedCursorComposer);

  const composer = await runComposer(claudeComposer, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "rm -rf /" },
  });
  expect(composer.exitCode).toBe(0);
  expect(JSON.parse(composer.stdout).hookSpecificOutput).toMatchObject({
    permissionDecision: "deny",
    permissionDecisionReason: "blocked by claude-code",
  });

  const cursorRun = await runComposer(cursorComposer, {
    hook_event_name: "preToolUse",
    tool_name: "Bash",
    tool_input: { command: "rm -rf /" },
  });
  expect(cursorRun.exitCode).toBe(0);
  expect(JSON.parse(cursorRun.stdout)).toMatchObject({
    permission: "deny",
    agent_message: "blocked by cursor",
  });
});

test("drwn write materializes an opencode plugin that blocks denied tools in-process", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const manifest = await publishHookPolicyCard(fixture);
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy", {
    targets: { opencode: { enabled: true } },
  });
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const opencodeComposer = join(projectDir, ".agents", "drwn", "generated", "hooks", "opencode", "composer.mjs");
  expect(existsSync(opencodeComposer)).toBe(true);
  const pluginPath = join(projectDir, ".opencode", "plugins", "drwn-hooks.js");
  const pluginSource = await readFile(pluginPath, "utf8");
  expect(pluginSource).toContain("DrwnHooks");
  expect(pluginSource).toContain(await realpath(opencodeComposer));

  const { DrwnHooks } = await import(pluginPath);
  const hooks = await DrwnHooks();
  await expect(
    hooks["tool.execute.before"]({ tool: "bash", sessionID: "s1" }, { args: { command: "rm -rf /" } }),
  ).rejects.toThrow("blocked");
  await expect(
    hooks["tool.execute.before"]({ tool: "read", sessionID: "s1" }, { args: { filePath: "a.txt" } }),
  ).resolves.toBeUndefined();
  await expect(
    hooks["tool.execute.after"]({ tool: "bash", sessionID: "s1" }, { args: { command: "ls" }, output: "done" }),
  ).resolves.toBeUndefined();

  const record = loadWriteRecord(resolveProjectWriteRecordPath(projectDir), "project")!;
  expect(record.managedPaths).toContainEqual(
    expect.objectContaining({ path: ".opencode/plugins/drwn-hooks.js", surface: "hook", target: "opencode" }),
  );
});

test("drwn write leaves a foreign cursor hooks.json untouched with a warning", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = await createProjectWithTrustedHookCard(fixture);
  const cursorHooksPath = join(projectDir, ".cursor", "hooks.json");
  const foreign = `${JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: "./hooks/format.sh" }] } }, null, 2)}\n`;
  await mkdir(join(projectDir, ".cursor"), { recursive: true });
  await writeFile(cursorHooksPath, foreign);

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const result = JSON.parse(write.stdout);
  expect(result.warnings.join("\n")).toContain("Skipping cursor hooks");
  expect(await readFile(cursorHooksPath, "utf8")).toBe(foreign);
});

test("drwn write skips untrusted hooks and --strict-hooks fails", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
    import { defineToolPolicy } from "darwinian/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      beforeToolCall() { return { action: "deny", reason: "blocked" }; },
    });
  `);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy");

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);
  const strict = await runAgentsCli(["write", "--strict-hooks"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const result = JSON.parse(write.stdout);
  expect(result.warnings.join("\n")).toContain("drwn card trust @me/policy --hooks");
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs"))).toBe(false);
  expect(strict.exitCode).not.toBe(0);
  expect(strict.stderr).toContain("drwn card trust @me/policy --hooks");
});

test("partial writes preserve unselected hook adapters, composers, and ownership", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = await createProjectWithTrustedHookCard(fixture);
  expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const paths = [
    join(projectDir, ".claude", "settings.json"),
    join(projectDir, ".codex", "hooks.json"),
    join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs"),
    join(projectDir, ".agents", "drwn", "generated", "hooks", "codex", "composer.mjs"),
  ];
  const before = await Promise.all(paths.map(async (path) => ({
    path,
    bytes: await readFile(path),
    mtimeMs: (await stat(path)).mtimeMs,
  })));
  const recordPath = resolveProjectWriteRecordPath(projectDir);
  const hookOwnership = loadWriteRecord(recordPath, "project")!.managedPaths
    .filter((entry) => entry.surface === "hook");
  expect(hookOwnership.length).toBeGreaterThan(0);

  for (const args of [["--mcp-only"], ["--skills-only"], ["--target=cursor"]]) {
    const partial = await runAgentsCli(["write", ...args, "--json"], envFor(fixture), projectDir);
    expect(partial.exitCode, `${args.join(" ")}: ${partial.stderr}`).toBe(0);
    for (const prior of before) {
      expect(await readFile(prior.path)).toEqual(prior.bytes);
      expect((await stat(prior.path)).mtimeMs).toBe(prior.mtimeMs);
    }
    expect(loadWriteRecord(recordPath, "project")!.managedPaths)
      .toEqual(expect.arrayContaining(hookOwnership));
  }
});

test("drwn write cleans only owned Claude hooks when policies become inactive", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = await createProjectWithTrustedHookCard(fixture);
  expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const settingsPath = join(projectDir, ".claude", "settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  const foreign = { matcher: "Skill", hooks: [{ type: "command", command: "/usr/local/bin/foreign-signal", timeout: 5 }] };
  settings.hooks.PreToolUse.unshift(foreign);
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  const projectConfig = JSON.parse(await readFile(configPath, "utf8"));
  projectConfig.hooks = { exclude: ["@me/policy:guard"] };
  await writeFile(
    configPath,
    JSON.stringify(projectConfig, null, 2),
  );

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const cleaned = JSON.parse(await readFile(settingsPath, "utf8"));
  expect(cleaned.hooks.PreToolUse).toEqual([foreign]);
  expect(cleaned.hooks.PostToolUse).toBeUndefined();
  expect(cleaned._drwn.ownedHooks).toBeUndefined();
});

test("drwn write leaves session-signal hooks off by default", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "settings.json"))).toBe(false);
});

test("drwn write materializes enabled session-signal hooks with absolute invocation", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, { hooks: { signals: { enabled: true } } });

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const settings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  const cardUsage = settings.hooks.UserPromptSubmit[0].hooks[0];
  expect(isAbsolute(cardUsage.command)).toBe(true);
  expect(cardUsage.command).not.toBe("drwn");
  expect(cardUsage.args.slice(-2)).toEqual(["hook", "card-usage"]);
  expect(settings.hooks.UserPromptExpansion[0].hooks[0].args.slice(-4)).toEqual(["hook", "skill-marker", "--phase", "expansion"]);
  expect(settings.hooks.PreToolUse).toMatchObject([{ matcher: "Skill" }]);
  expect(settings.hooks.PostToolUse).toMatchObject([{ matcher: "Skill" }]);
  expect(settings.hooks.PostToolUseFailure).toBeUndefined();
});

test("drwn write composes and removes session signals without disturbing card or foreign hooks", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = await createProjectWithTrustedHookCard(fixture);
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  const projectConfig = JSON.parse(await readFile(configPath, "utf8"));
  projectConfig.hooks = { signals: { enabled: true } };
  await writeFile(configPath, `${JSON.stringify(projectConfig, null, 2)}\n`);
  const settingsPath = join(projectDir, ".claude", "settings.json");
  const foreign = { matcher: "Bash", hooks: [{ type: "command", command: "/usr/local/bin/foreign-audit", timeout: 5 }] };
  await mkdir(join(projectDir, ".claude"), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ hooks: { PreToolUse: [foreign] } }, null, 2)}\n`);

  const enabled = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(enabled.exitCode).toBe(0);
  const withSignals = JSON.parse(await readFile(settingsPath, "utf8"));
  expect(withSignals.hooks.PreToolUse.map((entry: { matcher?: string }) => entry.matcher)).toEqual(["Bash", ".*", "Skill"]);
  expect(withSignals.hooks.PostToolUse.map((entry: { matcher?: string }) => entry.matcher)).toEqual([".*", "Skill"]);
  expect(withSignals.hooks.UserPromptSubmit).toBeDefined();

  projectConfig.hooks = { signals: { enabled: false } };
  await writeFile(configPath, `${JSON.stringify(projectConfig, null, 2)}\n`);
  const disabled = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(disabled.exitCode).toBe(0);
  const withoutSignals = JSON.parse(await readFile(settingsPath, "utf8"));
  expect(withoutSignals.hooks.PreToolUse.map((entry: { matcher?: string }) => entry.matcher)).toEqual(["Bash", ".*"]);
  expect(withoutSignals.hooks.PostToolUse.map((entry: { matcher?: string }) => entry.matcher)).toEqual([".*"]);
  expect(withoutSignals.hooks.UserPromptSubmit).toBeUndefined();
});

test("drwn write honors project hooks.exclude entries", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
    import { defineToolPolicy } from "darwinian/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      beforeToolCall() { return { action: "deny", reason: "blocked" }; },
    });
  `);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));

  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy", {
    hooks: { exclude: ["@me/policy:guard"] },
  });

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs"))).toBe(false);
  expect(existsSync(join(projectDir, ".claude", "settings.json"))).toBe(false);
  expect(existsSync(join(projectDir, ".mcp.json"))).toBe(false);
});
