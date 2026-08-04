// ABOUTME: Locks in the public sync-mcp compatibility surface while core modules are extracted.
// ABOUTME: Exercises syncRepository usage patterns that must remain stable during refactoring.

import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { createFixtureRegistry, installMachineBlueprint, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function scaffoldFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await installMachineBlueprint(fixture, {
    servers: { context7: createFixtureRegistry().servers.context7 },
  });
  return fixture;
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
