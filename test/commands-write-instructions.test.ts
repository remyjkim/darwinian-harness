// ABOUTME: Exercises the complete consented Worker-instructions write lifecycle through the CLI.
// ABOUTME: Proves strict preflight, byte ownership, idempotence, drift safety, adapters, and cleanup.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  cleanupTempRoots,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";
import { resolveInstructionConsentAckPath } from "../cli/core/instruction-consent-ack";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupInstructionProject() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect(
    (
      await runAgentsCli(
        ["card", "new", "@me/operator", "--no-git"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        [
          "card",
          "source",
          "set",
          "@me/operator",
          "--instructions-text",
          "Use the reviewed operating procedure.",
        ],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        ["card", "publish", "@me/operator"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);

  const sourcePath = join(
    fixture.agentsDir,
    "drwn",
    "sources",
    "@me",
    "operator",
    "card.json",
  );
  const manifest = JSON.parse(await readFile(sourcePath, "utf8"));
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect(
    (
      await runAgentsCli(
        ["add", `@me/operator@${manifest.version}`],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  return { fixture, projectDir };
}

async function fileSnapshot(path: string) {
  const info = await stat(path, { bigint: true });
  return {
    bytes: await readFile(path),
    mtimeNs: info.mtimeNs,
  };
}

test("write excludes unconsented instructions and strict mode fails before instruction mutation", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const agentsPath = join(projectDir, "AGENTS.md");
  const adapterPath = join(projectDir, ".claude", "CLAUDE.md");

  const normal = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(normal.exitCode).toBe(0);
  expect(`${normal.stdout}\n${normal.stderr}`).toContain(
    "@me/operator explicit instructions excluded",
  );
  expect(existsSync(agentsPath)).toBe(false);
  expect(existsSync(adapterPath)).toBe(false);

  const strict = await runAgentsCli(
    ["write", "--strict"],
    envFor(fixture),
    projectDir,
  );
  expect(strict.exitCode).toBe(1);
  expect(strict.stderr).toContain(
    "Explicit instruction consent required for: @me/operator",
  );
  expect(existsSync(agentsPath)).toBe(false);
  expect(existsSync(adapterPath)).toBe(false);
});

test("trust then write is byte and mtime idempotent and cleans only owned instruction bytes", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const agentsPath = join(projectDir, "AGENTS.md");
  const adapterPath = join(projectDir, ".claude", "CLAUDE.md");
  await writeFile(agentsPath, "# User-owned guidance\n");

  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  const first = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(first.exitCode, first.stderr).toBe(0);
  const rendered = await readFile(agentsPath, "utf8");
  expect(rendered).toContain("<!-- drwn:instructions:start -->");
  expect(rendered).toContain("Use the reviewed operating procedure.");
  expect(rendered).toEndWith("# User-owned guidance\n");
  expect(await readFile(adapterPath, "utf8")).toBe("@../AGENTS.md\n");

  const agentsBefore = await fileSnapshot(agentsPath);
  const adapterBefore = await fileSnapshot(adapterPath);
  const repeat = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(repeat.exitCode, repeat.stderr).toBe(0);
  expect(await fileSnapshot(agentsPath)).toEqual(agentsBefore);
  expect(await fileSnapshot(adapterPath)).toEqual(adapterBefore);

  expect(
    (
      await runAgentsCli(
        ["card", "untrust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  const cleanup = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(cleanup.exitCode, cleanup.stderr).toBe(0);
  expect(await readFile(agentsPath, "utf8")).toBe("# User-owned guidance\n");
  expect(existsSync(adapterPath)).toBe(false);
});

test("write fails closed on owned-block drift and force heals only the recorded block", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const agentsPath = join(projectDir, "AGENTS.md");
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode,
  ).toBe(0);

  const tampered = (await readFile(agentsPath, "utf8")).replace(
    "reviewed operating",
    "tampered operating",
  );
  await writeFile(agentsPath, tampered);
  const blocked = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(blocked.exitCode).toBe(1);
  expect(blocked.stderr).toMatch(/drift/i);
  expect(await readFile(agentsPath, "utf8")).toBe(tampered);

  const healed = await runAgentsCli(
    ["write", "--force"],
    envFor(fixture),
    projectDir,
  );
  expect(healed.exitCode, healed.stderr).toBe(0);
  expect(await readFile(agentsPath, "utf8")).toContain(
    "Use the reviewed operating procedure.",
  );
});

test("foreign Claude adapter is advisory by default and explicitly receives a managed import", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const adapterPath = join(projectDir, ".claude", "CLAUDE.md");
  await Bun.write(adapterPath, "# User Claude guidance\n");
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);

  const defaultWrite = await runAgentsCli(
    ["write"],
    envFor(fixture),
    projectDir,
  );
  expect(defaultWrite.exitCode, defaultWrite.stderr).toBe(0);
  expect(`${defaultWrite.stdout}\n${defaultWrite.stderr}`).toContain(
    "missing @../AGENTS.md",
  );
  expect(await readFile(adapterPath, "utf8")).toBe("# User Claude guidance\n");

  const applied = await runAgentsCli(
    ["write", "--apply-claude-adapter"],
    envFor(fixture),
    projectDir,
  );
  expect(applied.exitCode, applied.stderr).toBe(0);
  const bytes = await readFile(adapterPath, "utf8");
  expect(bytes).toContain("<!-- drwn:claude-adapter:start -->");
  expect(bytes).toContain("@../AGENTS.md");
  expect(bytes).toEndWith("# User Claude guidance\n");
});

test("partial writes retain instruction files and ownership unchanged", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const agentsPath = join(projectDir, "AGENTS.md");
  const adapterPath = join(projectDir, ".claude", "CLAUDE.md");
  const recordPath = join(projectDir, ".agents", "drwn", "write-record.json");
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode,
  ).toBe(0);
  const before = await Promise.all(
    [agentsPath, adapterPath].map(fileSnapshot),
  );
  const recordBefore = JSON.parse(await readFile(recordPath, "utf8"));

  expect(
    (
      await runAgentsCli(
        ["write", "--mcp-only"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect(await Promise.all([agentsPath, adapterPath].map(fileSnapshot))).toEqual(
    before,
  );
  const recordAfter = JSON.parse(await readFile(recordPath, "utf8"));
  expect(
    recordAfter.managedPaths.filter(
      (entry: { surface?: string }) => entry.surface === "instructions",
    ),
  ).toEqual(
    recordBefore.managedPaths.filter(
      (entry: { surface?: string }) => entry.surface === "instructions",
    ),
  );
});

test("write acknowledges imported instruction consent once per machine and exact content", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  await rm(resolveInstructionConsentAckPath(fixture.agentsDir), {
    force: true,
  });

  const first = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(first.stderr).toContain(
    "instructions present, consented by @me/operator (^1.0.0) on another machine",
  );

  const second = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(second.exitCode, second.stderr).toBe(0);
  expect(second.stderr).not.toContain("on another machine");
});
