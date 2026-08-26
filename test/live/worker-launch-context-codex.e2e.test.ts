// ABOUTME: Opt-in real Codex qualification for nested launch-workspace inheritance and edit landing.
// ABOUTME: Verifies MCP visibility and real-worktree mutation without treating generated workspace prose as evidence.

import { expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runProcess } from "../../cli/core/process";
import {
  assertIntentUnchanged,
  createLiveWorkerLaunchFixture,
  prepareLiveContext,
  removeLiveWorkerLaunchFixture,
  waitForPath,
  type LiveWorkerLaunchFixture,
} from "./helpers/worker-launch-context-fixture";

const liveTest = process.env.RUN_DRWN_REAL_CODEX === "1" ? test : test.skip;

liveTest("real Codex inherits base plus reviewer layers and lands its edit in the logical worktree", async () => {
  let fixture: LiveWorkerLaunchFixture | undefined;
  try {
    fixture = await createLiveWorkerLaunchFixture();
    const context = await prepareLiveContext(fixture, fixture.roots.reviewer, "codex");
    const implementation = await prepareLiveContext(fixture, fixture.roots.implementation, "codex");
    const reviewWorkspace = join(context.artifactDir, "codex", "workspace");
    const implementationWorkspace = join(implementation.artifactDir, "codex", "workspace");
    expect(await waitForPath(join(reviewWorkspace, ".agents", "skills", "review-live", "SKILL.md"))).toContain("MARKER_REVIEW_LIVE");
    await expect(access(join(reviewWorkspace, ".agents", "skills", "implementation-live"))).rejects.toThrow();
    expect(await waitForPath(join(implementationWorkspace, ".agents", "skills", "implementation-live", "SKILL.md"))).toContain("MARKER_IMPLEMENTATION_LIVE");
    await expect(access(join(implementationWorkspace, ".agents", "skills", "review-live"))).rejects.toThrow();
    expect(await readFile(join(reviewWorkspace, "AGENTS.md"), "utf8")).toContain("REVIEW_LIVE_INSTRUCTION");
    expect(await readFile(join(reviewWorkspace, "AGENTS.md"), "utf8")).not.toContain("IMPLEMENTATION_LIVE_INSTRUCTION");
    const sentinel = join(fixture.projectRoot, "codex-reviewer.sentinel");
    const generatedSentinel = join(context.artifactDir, "codex", "workspace", "codex-reviewer.sentinel");
    const prompt = `Use the shell tool exactly once to run: printf codex-reviewer > ${JSON.stringify(sentinel)}. Then stop.`;
    const result = await runProcess([
      process.env.DRWN_CODEX_BIN || "codex",
      ...context.launch.args,
      "--dangerously-bypass-approvals-and-sandbox",
      "exec",
      prompt,
    ], { cwd: fixture.projectRoot, env: context.launch.env, timeoutMs: 120_000 });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await waitForPath(sentinel)).toBe("codex-reviewer");
    await expect(access(generatedSentinel)).rejects.toThrow();

    const mcp = await runProcess([
      process.env.DRWN_CODEX_BIN || "codex",
      ...context.launch.args,
      "mcp",
      "list",
      "--json",
    ], { cwd: join(context.artifactDir, "codex", "workspace"), env: context.launch.env, timeoutMs: 10_000 });
    expect(mcp.exitCode, mcp.stderr).toBe(0);
    const names = new Set((JSON.parse(mcp.stdout) as Array<{ name: string }>).map((entry) => entry.name));
    expect(names.has("base_live_mcp")).toBe(true);
    expect(names.has("review_live_mcp")).toBe(true);
    expect(names.has("implementation_live_mcp")).toBe(false);
    const implementationMcp = await runProcess([
      process.env.DRWN_CODEX_BIN || "codex",
      ...implementation.launch.args,
      "mcp",
      "list",
      "--json",
    ], { cwd: implementationWorkspace, env: implementation.launch.env, timeoutMs: 10_000 });
    expect(implementationMcp.exitCode, implementationMcp.stderr).toBe(0);
    const implementationNames = new Set((JSON.parse(implementationMcp.stdout) as Array<{ name: string }>).map((entry) => entry.name));
    expect(implementationNames.has("implementation_live_mcp")).toBe(true);
    expect(implementationNames.has("review_live_mcp")).toBe(false);
    expect((await waitForPath(fixture.hookLogs.base)).trim().split("\n")).toHaveLength(1);
    expect((await waitForPath(fixture.hookLogs.reviewer)).trim().split("\n")).toHaveLength(1);
    await assertIntentUnchanged(fixture);
  } finally {
    await removeLiveWorkerLaunchFixture(fixture);
  }
}, 150_000);
