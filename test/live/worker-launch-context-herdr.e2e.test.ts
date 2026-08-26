// ABOUTME: Opt-in Herdr three-agent qualification over one worktree and two assigned Worker roots.
// ABOUTME: Launches descriptors opaquely, waits through Herdr, and proves profile-specific sentinel isolation.

import { expect, test } from "bun:test";
import { join } from "node:path";
import { runProcess } from "../../cli/core/process";
import {
  assertIntentUnchanged,
  createLiveWorkerLaunchFixture,
  prepareLiveContext,
  removeLiveWorkerLaunchFixture,
  startHerdrServer,
  stopHerdrServer,
  waitForPath,
  type LiveWorkerLaunchFixture,
} from "./helpers/worker-launch-context-fixture";
import type { ChildProcess } from "node:child_process";

const liveTest = process.env.RUN_DRWN_REAL_HERDR === "1" ? test : test.skip;

async function herdr(session: string, args: string[], timeoutMs = 30_000) {
  const result = await runProcess(["herdr", "--session", session, ...args], { timeoutMs });
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

liveTest("Herdr runs Claude reviewer, Codex reviewer, and Codex implementer with isolated descriptors", async () => {
  let fixture: LiveWorkerLaunchFixture | undefined;
  let server: ChildProcess | undefined;
  const session = `drwn-v14-live-${process.pid}-${Date.now()}`;
  try {
    if (!process.env.DRWN_LIVE_DRWN_BIN) throw new Error("Herdr release qualification requires DRWN_LIVE_DRWN_BIN for the packed v1.4.2 candidate");
    const candidateVersion = await runProcess([process.env.DRWN_LIVE_DRWN_BIN, "--version"], { timeoutMs: 5_000 });
    expect(candidateVersion.exitCode, candidateVersion.stderr).toBe(0);
    expect(candidateVersion.stdout.trim()).toBe("1.4.2");
    fixture = await createLiveWorkerLaunchFixture();
    const [claudeReview, codexReview, codexImplementation] = await Promise.all([
      prepareLiveContext(fixture, fixture.roots.reviewer, "claude"),
      prepareLiveContext(fixture, fixture.roots.reviewer, "codex"),
      prepareLiveContext(fixture, fixture.roots.implementation, "codex"),
    ]);
    expect(new Set([claudeReview.contextId, codexReview.contextId, codexImplementation.contextId]).size).toBe(3);

    server = await startHerdrServer(session);
    const created = await herdr(session, ["workspace", "create", "--cwd", fixture.projectRoot, "--label", "drwn-v14-live", "--no-focus"]);
    const pane1 = created.result.root_pane.pane_id as string;
    const split2 = await herdr(session, ["pane", "split", pane1, "--direction", "right", "--ratio", "0.5", "--cwd", fixture.projectRoot, "--no-focus"]);
    const pane2 = split2.result.pane.pane_id as string;
    const split3 = await herdr(session, ["pane", "split", pane1, "--direction", "down", "--ratio", "0.5", "--cwd", fixture.projectRoot, "--no-focus"]);
    const pane3 = split3.result.pane.pane_id as string;

    const agents = [
      { name: "claude-reviewer", kind: "claude", pane: pane1, context: claudeReview, extra: ["--dangerously-skip-permissions"] },
      { name: "codex-reviewer", kind: "codex", pane: pane2, context: codexReview, extra: ["--dangerously-bypass-approvals-and-sandbox"] },
      { name: "codex-implementer", kind: "codex", pane: pane3, context: codexImplementation, extra: ["--dangerously-bypass-approvals-and-sandbox"] },
    ];
    for (const agent of agents) {
      await herdr(session, [
        "agent", "start", agent.name, "--kind", agent.kind, "--pane", agent.pane, "--timeout", "60000", "--",
        ...agent.context.launch.args,
        ...agent.extra,
      ], 70_000);
    }

    for (const agent of agents) {
      const sentinel = join(fixture.projectRoot, `${agent.name}.sentinel`);
      const prompt = `Use the shell tool exactly once to run: printf ${agent.name} > ${JSON.stringify(sentinel)}. Then stop.`;
      await herdr(session, ["agent", "prompt", agent.name, prompt, "--wait", "--timeout", "120000"], 130_000);
      expect(await waitForPath(sentinel)).toBe(agent.name);
    }
    expect((await waitForPath(fixture.hookLogs.base)).trim().split("\n")).toHaveLength(3);
    expect((await waitForPath(fixture.hookLogs.reviewer)).trim().split("\n")).toHaveLength(2);
    expect((await waitForPath(fixture.hookLogs.implementation)).trim().split("\n")).toHaveLength(1);
    await assertIntentUnchanged(fixture);
  } finally {
    await stopHerdrServer(session, server);
    await removeLiveWorkerLaunchFixture(fixture);
  }
}, 600_000);
