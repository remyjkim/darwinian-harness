// ABOUTME: Verifies human-readable and JSON output contracts for the implemented public commands.
// ABOUTME: Protects stable operator-facing and machine-readable command surfaces across the CLI.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, createCatalogCardSource, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("command output contracts", () => {
  test("human outputs are non-empty and json outputs are parseable", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };
    await createCatalogCardSource(fixture, "@me/output");

    const humanCommands = [
      ["card", "source", "show", "@me/output"],
      ["card", "source", "doctor", "@me/output"],
      ["write", "--dry-run"],
      ["scan"],
      ["machine", "skill", "list"],
      ["mcp", "list"],
      ["mcp", "write", "--dry-run"],
      ["extensions", "list"],
      ["extensions", "show", "beads"],
      ["extensions", "status"],
      ["extensions", "doctor"],
      ["extensions", "setup", "parallel", "--dry-run"],
      ["status"],
      ["doctor"],
    ];

    for (const args of humanCommands) {
      const result = await runAgentsCli(args, env);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim().length).toBeGreaterThan(0);
      expect(result.stdout).not.toContain("[object Object]");
      expect(result.stdout).not.toContain("Error:");
    }

    const jsonCommands = [
      ["card", "source", "show", "@me/output", "--json"],
      ["card", "source", "doctor", "@me/output", "--json"],
      ["write", "--dry-run", "--json"],
      ["scan", "--json"],
      ["machine", "skill", "list", "--json"],
      ["mcp", "list", "--json"],
      ["mcp", "write", "--dry-run", "--json"],
      ["extensions", "list", "--json"],
      ["extensions", "show", "beads", "--json"],
      ["extensions", "status", "--json"],
      ["extensions", "doctor", "--json"],
      ["extensions", "setup", "parallel", "--dry-run", "--json"],
      ["status", "--json"],
      ["doctor", "--json"],
    ];

    for (const args of jsonCommands) {
      const result = await runAgentsCli(args, env);
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }

    const deprecatedHuman = await runAgentsCli(["card", "source", "list"], env);
    expect(deprecatedHuman.exitCode).toBe(1);
    expect(deprecatedHuman.stderr.trim().length).toBeGreaterThan(0);
    const deprecatedJson = await runAgentsCli(["card", "source", "list", "--json"], env);
    expect(deprecatedJson.exitCode).toBe(1);
    expect(() => JSON.parse(deprecatedJson.stdout)).not.toThrow();
  }, 120000);

  test("project-aware commands keep human and json output contracts", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, {
      skills: { include: ["beta"], exclude: ["alpha"] },
    });

    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    for (const args of [["status"], ["doctor"], ["write", "--dry-run"]]) {
      const result = await runAgentsCli(args, env, projectDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim().length).toBeGreaterThan(0);
      expect(result.stdout).not.toContain("[object Object]");
    }

    for (const args of [["status", "--json"], ["doctor", "--json"], ["write", "--dry-run", "--json"]]) {
      const result = await runAgentsCli(args, env, projectDir);
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  }, 120000);
});
