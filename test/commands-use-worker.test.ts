// ABOUTME: Verifies singular Worker selection through the canonical drwn use command.
// ABOUTME: Covers additive installation, projection ordering, dry-run, and removed prototype paths.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  envFor,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function projectFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/one", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/two", skills: ["beta"] });
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  return { fixture, projectDir, stateDir: join(projectDir, ".agents", "drwn") };
}

async function readProjectState(stateDir: string) {
  return {
    config: JSON.parse(await readFile(join(stateDir, "config.json"), "utf8")),
    lock: JSON.parse(await readFile(join(stateDir, "card.lock"), "utf8")),
  };
}

test("use selects an installed root without changing the lock and writes by default", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  expect((await runAgentsCli(
    ["apply", "@me/one@1.0.0", "@me/two@1.0.0", "--active", "@me/one", "--write"],
    envFor(fixture),
    projectDir,
  )).exitCode).toBe(0);
  const lockBefore = await readFile(join(stateDir, "card.lock"), "utf8");

  const result = await runAgentsCli(["use", "@me/two"], envFor(fixture), projectDir);

  expect(result.exitCode, result.stderr).toBe(0);
  expect((await readProjectState(stateDir)).config.activeWorker).toBe("@me/two");
  expect(await readFile(join(stateDir, "card.lock"), "utf8")).toBe(lockBefore);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(false);
  expect(existsSync(join(projectDir, ".claude", "skills", "beta", "SKILL.md"))).toBe(true);
});

test("use installs a new root additively, selects it, and writes", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  expect((await runAgentsCli(["add", "@me/one@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const result = await runAgentsCli(["use", "@me/two@1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode, result.stderr).toBe(0);
  const state = await readProjectState(stateDir);
  expect(state.config.workers).toEqual(["@me/one@1.0.0", "@me/two@1.0.0"]);
  expect(state.config.activeWorker).toBe("@me/two");
  expect(state.lock.workerRoots.map((root: { name: string }) => root.name)).toEqual(["@me/one", "@me/two"]);
  expect(existsSync(join(projectDir, ".claude", "skills", "beta", "SKILL.md"))).toBe(true);
});

test("use --none preserves installed roots and removes active projection", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  expect((await runAgentsCli(["use", "@me/one@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);

  const result = await runAgentsCli(["use", "--none"], envFor(fixture), projectDir);

  expect(result.exitCode, result.stderr).toBe(0);
  const state = await readProjectState(stateDir);
  expect(state.config.workers).toEqual(["@me/one@1.0.0"]);
  expect(state.config.activeWorker).toBeNull();
  expect(state.lock.workerRoots).toHaveLength(1);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(false);
});

test("use refuses to select a Blueprint member as the Worker root", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/member", skills: ["member-skill"] });
  await createCatalogCardSource(fixture, "@me/blueprint", { kind: "blueprint" });
  expect((await runAgentsCli(
    ["worker", "compose", "@me/blueprint", "--add", "@me/member@1.0.0"],
    envFor(fixture),
  )).exitCode).toBe(0);
  expect((await runAgentsCli(["worker", "publish", "@me/blueprint"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["use", "@me/blueprint@1.0.0", "--no-write"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const configBefore = await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8");

  const result = await runAgentsCli(["use", "@me/member", "--no-write"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("member");
  expect(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")).toBe(configBefore);
});

test("a write failure leaves the valid Worker selection persisted", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  await writeFile(join(projectDir, ".claude"), "blocks projection\n");

  const result = await runAgentsCli(["use", "@me/one@1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("selection remains persisted");
  expect((await readProjectState(stateDir)).config.activeWorker).toBe("@me/one");
});

test("a fatal ambient collision preserves selected Worker intent without projection mutation", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/notion-worker",
    skills: ["alpha"],
    servers: {
      notion: {
        description: "Project Notion",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@notionhq/notion-mcp-server"],
        optional: false,
      },
    },
  });
  const projectDir = join(fixture.root, "ambient-use-project");
  const stateDir = join(projectDir, ".agents", "drwn");
  await writeSupportedProjectConfig(projectDir);
  await writeFile(fixture.codexConfig, '[mcp_servers.notion]\nurl = "https://mcp.notion.com/mcp"\n');

  const result = await runAgentsCli(["use", "@me/notion-worker@1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("CODEX_INCOMPATIBLE_TRANSPORTS");
  expect(result.stderr).toContain("selection remains persisted");
  expect((await readProjectState(stateDir)).config.activeWorker).toBe("@me/notion-worker");
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "workers.json"))).toBe(false);
  expect(existsSync(join(projectDir, ".mcp.json"))).toBe(false);
  expect(existsSync(join(projectDir, ".codex", "config.toml"))).toBe(false);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(false);
});

test("--no-write commits selection without projection and --dry-run changes nothing", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  const noWrite = await runAgentsCli(["use", "@me/one@1.0.0", "--no-write"], envFor(fixture), projectDir);
  expect(noWrite.exitCode, noWrite.stderr).toBe(0);
  expect(existsSync(join(projectDir, ".claude"))).toBe(false);

  const configBefore = await readFile(join(stateDir, "config.json"), "utf8");
  const lockBefore = await readFile(join(stateDir, "card.lock"), "utf8");
  const registryPath = join(fixture.agentsDir, "drwn", "projects.json");
  const registryBefore = existsSync(registryPath) ? await readFile(registryPath, "utf8") : null;
  const dryRun = await runAgentsCli(["use", "@me/two@1.0.0", "--dry-run"], envFor(fixture), projectDir);

  expect(dryRun.exitCode, dryRun.stderr).toBe(0);
  expect(dryRun.stdout).toContain("Would");
  expect(await readFile(join(stateDir, "config.json"), "utf8")).toBe(configBefore);
  expect(await readFile(join(stateDir, "card.lock"), "utf8")).toBe(lockBefore);
  expect(existsSync(registryPath) ? await readFile(registryPath, "utf8") : null).toBe(registryBefore);
  expect(existsSync(join(projectDir, ".claude"))).toBe(false);
});

for (const args of [
  ["card", "add", "@me/one@1.0.0"],
  ["card", "apply", "@me/one@1.0.0"],
  ["card", "remove", "@me/one"],
  ["card", "pin", "@me/one@1.0.0"],
  ["card", "update"],
  ["card", "detach"],
  ["worker", "stack"],
  ["worker", "stack", "use", "@me/one"],
  ["worker", "stack", "clear"],
]) {
  test(`removed path ${args.join(" ")} is unknown and non-mutating`, async () => {
    const { fixture, projectDir, stateDir } = await projectFixture();
    const before = await readFile(join(stateDir, "config.json"), "utf8");

    const result = await runAgentsCli(args, envFor(fixture), projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Unknown Syntax Error|Command not found|Unsupported option/i);
    expect(await readFile(join(stateDir, "config.json"), "utf8")).toBe(before);
    expect(existsSync(join(stateDir, "card.lock"))).toBe(false);
  });
}

test("help exposes canonical project commands and use options only", async () => {
  const { fixture, projectDir } = await projectFixture();
  const help = await runAgentsCli(["--help"], envFor(fixture), projectDir);
  const useHelp = await runAgentsCli(["use", "--help"], envFor(fixture), projectDir);

  expect(help.exitCode).toBe(0);
  for (const command of ["drwn add", "drwn apply", "drwn remove", "drwn pin", "drwn update", "drwn use"]) {
    expect(help.stdout).toContain(command);
  }
  expect(help.stdout).not.toContain("drwn worker stack");
  expect(useHelp.stdout).toContain("--no-write");
  expect(useHelp.stdout).toContain("--none");
  expect(useHelp.stdout).not.toContain("--no-apply");
});
