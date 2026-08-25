// ABOUTME: Opt-in real Claude qualification for a prepared reviewer Worker launch context.
// ABOUTME: Uses file and hook sentinels instead of model prose and preserves target trust as an explicit operator gate.

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

const liveTest = process.env.RUN_DRWN_REAL_CLAUDE === "1" ? test : test.skip;

liveTest("real Claude loads base plus reviewer additions and executes both hook layers", async () => {
  let fixture: LiveWorkerLaunchFixture | undefined;
  try {
    fixture = await createLiveWorkerLaunchFixture();
    const context = await prepareLiveContext(fixture, fixture.roots.reviewer, "claude");
    const pluginRoot = join(context.artifactDir, "claude");
    expect(await readFile(join(pluginRoot, "skills", "review-live", "SKILL.md"), "utf8")).toContain("MARKER_REVIEW_LIVE");
    await expect(access(join(pluginRoot, "skills", "implementation-live"))).rejects.toThrow();
    await expect(access(join(pluginRoot, "skills", "shared-live"))).rejects.toThrow();
    const instructions = await readFile(join(pluginRoot, "instructions.md"), "utf8");
    expect(instructions).toContain("REVIEW_LIVE_INSTRUCTION");
    expect(instructions).not.toContain("IMPLEMENTATION_LIVE_INSTRUCTION");
    const mcp = await runProcess([
      process.env.DRWN_CLAUDE_BIN || "claude",
      ...context.launch.args,
      "mcp",
      "list",
    ], { cwd: fixture.projectRoot, env: context.launch.env, timeoutMs: 15_000 });
    expect(mcp.exitCode, mcp.stderr).toBe(0);
    expect(mcp.stdout).toContain("review_live_mcp");
    expect(mcp.stdout).toContain("base_live_mcp");
    expect(mcp.stdout).not.toContain("implementation_live_mcp");
    const sentinel = join(fixture.projectRoot, "claude-reviewer.sentinel");
    const prompt = `Use the Bash tool exactly once to run: printf claude-reviewer > ${JSON.stringify(sentinel)}. Then stop.`;
    const result = await runProcess([
      process.env.DRWN_CLAUDE_BIN || "claude",
      ...context.launch.args,
      "--dangerously-skip-permissions",
      "--print",
      "--output-format",
      "json",
      prompt,
    ], { cwd: fixture.projectRoot, env: context.launch.env, timeoutMs: 120_000 });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await waitForPath(sentinel)).toBe("claude-reviewer");
    expect((await waitForPath(fixture.hookLogs.base)).trim().split("\n")).toHaveLength(1);
    expect((await waitForPath(fixture.hookLogs.reviewer)).trim().split("\n")).toHaveLength(1);
    await assertIntentUnchanged(fixture);
  } finally {
    await removeLiveWorkerLaunchFixture(fixture);
  }
}, 150_000);
