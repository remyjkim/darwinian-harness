// ABOUTME: Exercises one machine Blueprint closure across Worker, skill, and MCP projections.
// ABOUTME: Proves inactive roots are excluded and complete preflight prevents partial writes.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildEffectiveState } from "../cli/core/effective-state";
import {
  collectMachineProjectionConflicts,
  planMachineManagedPaths,
} from "../cli/core/sync";
import { applyMachineWorkerRoots } from "../cli/core/worker-machine";
import {
  readMachineConfigFile,
  writeMachineConfigFile,
} from "../cli/core/machine-config";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import { resolveExplicitInstructionContribution } from "../cli/core/instruction-contribution";
import { loadWriteRecord } from "../cli/core/write-record";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  envFor,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  members: string[],
) {
  const sourceDir = await createCatalogCardSource(fixture, name, {
    kind: "blueprint",
  });
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.kind = "blueprint";
  manifest.composedFrom = members;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const publish = await runAgentsCli(["card", "publish", name], envFor(fixture));
  expect(publish.exitCode, publish.stderr).toBe(0);
}

async function setupMachineBlueprint() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/active-member",
    skills: ["active-skill"],
    servers: {
      "active-mcp": {
        description: "Active MCP",
        transport: "stdio",
        command: "active-mcp",
        optional: false,
      },
    },
  });
  await publishCardWithSkills(fixture, {
    name: "@me/inactive-member",
    skills: ["inactive-skill"],
    servers: {
      "inactive-mcp": {
        description: "Inactive MCP",
        transport: "stdio",
        command: "inactive-mcp",
        optional: false,
      },
    },
  });
  await publishBlueprint(fixture, "@me/active", ["@me/active-member@1.0.0"]);
  await publishBlueprint(fixture, "@me/inactive", ["@me/inactive-member@1.0.0"]);
  await applyMachineWorkerRoots(
    fixture.agentsDir,
    ["@me/active@1.0.0", "@me/inactive@1.0.0"],
    { active: "@me/active" },
  );
  return fixture;
}

async function setupConsentedSurfaceBlueprint() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const memberDir = await createCatalogCardSource(fixture, "@me/surface-member");
  const memberPath = join(memberDir, "card.json");
  const member = JSON.parse(await readFile(memberPath, "utf8"));
  member.skills = { include: ["surface-skill"] };
  member.instructions = { text: "Use machine-scoped operating guidance." };
  member.hooks = { include: ["guard"] };
  await mkdir(join(memberDir, "skills", "surface-skill"), { recursive: true });
  await writeFile(
    join(memberDir, "skills", "surface-skill", "SKILL.md"),
    "---\nname: surface-skill\ndescription: Surface skill\n---\n",
  );
  await mkdir(join(memberDir, "hooks", "guard"), { recursive: true });
  await writeFile(
    join(memberDir, "hooks", "guard", "policy.ts"),
    "export default { policyKind: 'observer' };\n",
  );
  await writeFile(memberPath, `${JSON.stringify(member, null, 2)}\n`);
  const published = await runAgentsCli(
    ["card", "publish", "@me/surface-member"],
    envFor(fixture),
  );
  expect(published.exitCode, published.stderr).toBe(0);
  await publishBlueprint(
    fixture,
    "@me/surface-worker",
    ["@me/surface-member@1.0.0"],
  );
  await applyMachineWorkerRoots(
    fixture.agentsDir,
    ["@me/surface-worker@1.0.0"],
  );

  const machinePath = resolveMachineConfigPath(fixture.agentsDir);
  const machine = await readMachineConfigFile(machinePath);
  const locked = machine?.capabilities.workerLock?.cards.find(
    (card) => card.name === "@me/surface-member",
  );
  if (!machine || !locked) throw new Error("missing machine surface fixture");
  const instruction = resolveExplicitInstructionContribution(locked, locked.path);
  if (!instruction) throw new Error("missing instruction contribution");
  locked.instructionConsent = {
    consentedAt: "2026-08-03T00:00:00.000Z",
    consentedRange: "^1.0.0",
    contentDigest: instruction.contentDigest,
  };
  locked.hookConsent = {
    consentedAt: "2026-08-03T00:00:00.000Z",
    consentedRange: "^1.0.0",
  };
  await writeMachineConfigFile(machinePath, machine);
  return fixture;
}

test("machine write projects exactly one active aggregate Worker closure", async () => {
  const fixture = await setupMachineBlueprint();
  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    forceMachineScope: true,
  });
  const planned = planMachineManagedPaths(state).map((entry) => entry.path);
  expect(planned).toContain(".agents/drwn/generated/workers/@me/active");
  expect(planned).toContain(".agents/drwn/generated/workers.json");
  expect(planned).toContain(".agents/drwn/generated/active-worker.json");
  expect(planned).toContain(".claude/skills/active-skill");
  expect(planned).not.toContain(".claude/skills/inactive-skill");
  expect(planned.some((path) => path.includes("inactive"))).toBe(false);

  const write = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));
  expect(write.exitCode, write.stderr).toBe(0);

  const generated = join(fixture.agentsDir, "drwn", "generated");
  const activeDir = join(generated, "workers", "@me", "active");
  const inactiveDir = join(generated, "workers", "@me", "inactive");
  expect(existsSync(activeDir)).toBe(true);
  expect(existsSync(inactiveDir)).toBe(false);
  expect(existsSync(join(activeDir, "skills", "active-skill"))).toBe(true);
  expect(existsSync(join(fixture.homeDir, ".claude", "skills", "active-skill"))).toBe(true);
  expect(existsSync(join(fixture.homeDir, ".claude", "skills", "inactive-skill"))).toBe(false);
  expect(JSON.parse(await readFile(join(activeDir, "mcp", "servers.json"), "utf8")))
    .toMatchObject({ mcpServers: { "active-mcp": { command: "active-mcp" } } });
  expect(JSON.parse(await readFile(join(generated, "workers.json"), "utf8"))
    .workers.map((worker: { name: string }) => worker.name)).toEqual(["@me/active"]);
  expect(JSON.parse(await readFile(fixture.claudeUserMcp, "utf8")).mcpServers)
    .toHaveProperty("active-mcp");
  expect(JSON.parse(await readFile(fixture.claudeUserMcp, "utf8")).mcpServers)
    .not.toHaveProperty("inactive-mcp");
});

test("one late foreign destination blocks every machine projection before mutation", async () => {
  const fixture = await setupMachineBlueprint();
  const foreign = join(fixture.homeDir, ".codex", "skills", "active-skill");
  await mkdir(foreign, { recursive: true });
  await writeFile(join(foreign, "SKILL.md"), "foreign bytes\n");

  const write = await runAgentsCli(
    ["write", "--root", "--skills-only", "--json"],
    envFor(fixture),
  );

  expect(write.exitCode).toBe(1);
  expect(`${write.stdout}\n${write.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
  expect(await readFile(join(foreign, "SKILL.md"), "utf8")).toBe("foreign bytes\n");
  expect(existsSync(join(fixture.homeDir, ".claude", "skills", "active-skill"))).toBe(false);
  expect(existsSync(join(fixture.agentsDir, "drwn", "generated", "workers.json"))).toBe(false);
});

test("machine write projects consented instructions and hooks with complete drift preflight", async () => {
  const fixture = await setupConsentedSurfaceBlueprint();
  const options = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    forceMachineScope: true,
  };
  const state = await buildEffectiveState(options);
  const planned = planMachineManagedPaths(state).map((entry) => entry.path);
  expect(planned).toContain(".claude/CLAUDE.md");
  expect(planned).toContain(".codex/AGENTS.md");
  expect(planned).toContain(".claude/settings.json");
  expect(planned).toContain(".agents/drwn/generated/hooks/claude/composer.mjs");
  expect(planned).toContain(".codex/hooks.json");

  const write = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));
  expect(write.exitCode, write.stderr).toBe(0);
  expect(await readFile(join(fixture.homeDir, ".claude", "CLAUDE.md"), "utf8"))
    .toContain("Use machine-scoped operating guidance.");
  expect(await readFile(join(fixture.homeDir, ".codex", "AGENTS.md"), "utf8"))
    .toContain("Use machine-scoped operating guidance.");
  expect(existsSync(join(fixture.homeDir, "AGENTS.md"))).toBe(false);
  const settings = JSON.parse(await readFile(fixture.claudeSettings, "utf8"));
  expect(settings.model).toBe("sonnet");
  expect(settings.hooks.PreToolUse).toHaveLength(1);

  settings.hooks.PreToolUse[0].hooks[0].args[0] = "/tmp/tampered.mjs";
  await writeFile(fixture.claudeSettings, `${JSON.stringify(settings, null, 2)}\n`);
  const driftState = await buildEffectiveState(options);
  const record = loadWriteRecord(driftState.recordPath, "machine");
  expect(collectMachineProjectionConflicts(driftState, record))
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "drift", path: fixture.claudeSettings }),
    ]));
  const blocked = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));
  expect(blocked.exitCode).toBe(1);
  expect(`${blocked.stdout}\n${blocked.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
  const forced = await runAgentsCli(
    ["write", "--root", "--force", "--json"],
    envFor(fixture),
  );
  expect(forced.exitCode, forced.stderr).toBe(0);
  expect(JSON.parse(await readFile(fixture.claudeSettings, "utf8"))
    .hooks.PreToolUse[0].hooks[0].args[0]).toContain(
      "/generated/hooks/claude/composer.mjs",
    );

  const machinePath = resolveMachineConfigPath(fixture.agentsDir);
  const machine = await readMachineConfigFile(machinePath);
  if (!machine?.capabilities.workerLock) throw new Error("missing machine lock");
  for (const card of machine.capabilities.workerLock.cards) {
    delete card.instructionConsent;
    delete card.hookConsent;
  }
  await writeMachineConfigFile(machinePath, machine);
  const cleanup = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));
  expect(cleanup.exitCode, cleanup.stderr).toBe(0);
  const cleanedSettings = JSON.parse(await readFile(fixture.claudeSettings, "utf8"));
  expect(cleanedSettings.model).toBe("sonnet");
  expect(cleanedSettings.hooks).toBeUndefined();
  expect(existsSync(join(fixture.homeDir, ".claude", "CLAUDE.md"))).toBe(false);
  expect(existsSync(join(fixture.homeDir, ".codex", "AGENTS.md"))).toBe(false);
  expect(existsSync(join(
    fixture.agentsDir,
    "drwn",
    "generated",
    "hooks",
    "claude",
    "composer.mjs",
  ))).toBe(false);
});

test("machine deactivation rejects stale drift across generated, skill, hook, and instruction surfaces", async () => {
  const fixture = await setupConsentedSurfaceBlueprint();
  const first = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));
  expect(first.exitCode, first.stderr).toBe(0);

  const skillPath = join(fixture.homeDir, ".claude", "skills", "surface-skill", "SKILL.md");
  const hookPath = join(fixture.agentsDir, "drwn", "generated", "hooks", "claude", "composer.mjs");
  const instructionPath = join(fixture.homeDir, ".claude", "CLAUDE.md");
  const workerPath = join(fixture.agentsDir, "drwn", "generated", "active-worker.json");
  await chmod(skillPath, 0o644);
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nuser drift\n`);
  await writeFile(hookPath, `${await readFile(hookPath, "utf8")}\n// user drift\n`);
  await writeFile(
    instructionPath,
    (await readFile(instructionPath, "utf8")).replace(
      "Use machine-scoped operating guidance.",
      "Tampered machine-scoped operating guidance.",
    ),
  );
  await writeFile(workerPath, `${await readFile(workerPath, "utf8")}\n`);

  const cleared = await runAgentsCli(
    ["use", "--root", "--none", "--no-write"],
    envFor(fixture),
  );
  expect(cleared.exitCode, cleared.stderr).toBe(0);
  const recordPath = join(fixture.agentsDir, "drwn", "global-write-record.json");
  const recordBefore = await readFile(recordPath, "utf8");

  const blocked = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));

  expect(blocked.exitCode).not.toBe(0);
  expect(`${blocked.stdout}\n${blocked.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
  expect(await readFile(recordPath, "utf8")).toBe(recordBefore);
  for (const pathValue of [skillPath, hookPath, instructionPath, workerPath]) {
    expect(existsSync(pathValue)).toBe(true);
  }

  const forced = await runAgentsCli(["write", "--root", "--force", "--json"], envFor(fixture));
  expect(forced.exitCode, forced.stderr).toBe(0);
  for (const pathValue of [skillPath, hookPath, instructionPath, workerPath]) {
    expect(existsSync(pathValue)).toBe(false);
  }
});

test("machine deactivation treats a managed file replaced by a directory as force-repairable drift", async () => {
  const fixture = await setupConsentedSurfaceBlueprint();
  const first = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));
  expect(first.exitCode, first.stderr).toBe(0);

  const workerPath = join(fixture.agentsDir, "drwn", "generated", "active-worker.json");
  await rm(workerPath);
  await mkdir(workerPath);
  await writeFile(join(workerPath, "foreign.txt"), "user replacement\n");

  const cleared = await runAgentsCli(
    ["use", "--root", "--none", "--no-write"],
    envFor(fixture),
  );
  expect(cleared.exitCode, cleared.stderr).toBe(0);
  const recordPath = join(fixture.agentsDir, "drwn", "global-write-record.json");
  const recordBefore = await readFile(recordPath, "utf8");

  const blocked = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));

  expect(blocked.exitCode).not.toBe(0);
  expect(`${blocked.stdout}\n${blocked.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
  expect(await readFile(recordPath, "utf8")).toBe(recordBefore);
  expect(existsSync(workerPath)).toBe(true);

  const forced = await runAgentsCli(["write", "--root", "--force", "--json"], envFor(fixture));
  expect(forced.exitCode, forced.stderr).toBe(0);
  expect(existsSync(workerPath)).toBe(false);
  expect(await readFile(recordPath, "utf8")).not.toContain("active-worker.json");
});
