// ABOUTME: Verifies bounded target version probes and stable compatibility failures.
// ABOUTME: Keeps dry-run pure while materialization checks exact conservative client floors.

import { expect, test } from "bun:test";

const loadProbe = async () => await import("../cli/core/worker-launch-context/target-probe").catch(() => ({} as any));

test("target probe parses supported Claude and Codex versions through an injected bounded runner", async () => {
  const probe = await loadProbe();
  expect(typeof probe.probeWorkerLaunchTarget).toBe("function");
  const runner = async (args: string[]) => ({
    exitCode: 0,
    stdout: args[0] === "claude" ? "2.1.212 (Claude Code)\n" : "codex-cli 0.149.0\n",
    stderr: "",
    timedOut: false,
    overflowed: false,
  });

  expect(await probe.probeWorkerLaunchTarget("claude", { run: runner })).toMatchObject({
    minimumVersion: "2.1.212", probed: true, observedVersion: "2.1.212",
  });
  expect(await probe.probeWorkerLaunchTarget("codex", { run: runner })).toMatchObject({
    minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0",
  });
});

test("target probe distinguishes missing, old, malformed, timeout, and overflow without retaining output", async () => {
  const probe = await loadProbe();
  const cases = [
    [{ exitCode: 127, stdout: "", stderr: "missing", timedOut: false, overflowed: false }, "LAUNCH_TARGET_UNSUPPORTED"],
    [{ exitCode: 0, stdout: "codex-cli 0.148.0", stderr: "", timedOut: false, overflowed: false }, "LAUNCH_TARGET_VERSION_UNSUPPORTED"],
    [{ exitCode: 0, stdout: "not-a-version SECRET_SENTINEL", stderr: "", timedOut: false, overflowed: false }, "LAUNCH_TARGET_UNSUPPORTED"],
    [{ exitCode: -1, stdout: "", stderr: "", timedOut: true, overflowed: false }, "LAUNCH_TARGET_UNSUPPORTED"],
    [{ exitCode: -1, stdout: "", stderr: "", timedOut: false, overflowed: true }, "LAUNCH_TARGET_UNSUPPORTED"],
  ] as const;
  for (const [result, code] of cases) {
    try {
      await probe.probeWorkerLaunchTarget("codex", { run: async () => result });
      throw new Error("expected probe failure");
    } catch (error) {
      expect(error).toMatchObject({ code });
      expect(JSON.stringify((error as { toJSON?: () => unknown }).toJSON?.() ?? error)).not.toContain("SECRET_SENTINEL");
    }
  }
});

test("the real probe settles after its deadline when a child ignores graceful termination", async () => {
  const probe = await loadProbe();
  const started = Date.now();
  const result = await probe.runBoundedWorkerLaunchTargetProbe([
    process.execPath,
    "-e",
    "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)",
  ]);
  expect(result.timedOut).toBe(true);
  expect(Date.now() - started).toBeLessThan(3_500);
});
