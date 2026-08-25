// ABOUTME: Performs bounded version probes for launch-context target clients.
// ABOUTME: Returns sanitized compatibility evidence and never retains arbitrary target output.

import { spawn } from "node:child_process";
import { coerce, gte } from "semver";
import { DrwnError } from "../errors";

const TARGET_PROBE_TIMEOUT_MS = 2_000;
const TARGET_PROBE_MAX_BYTES = 65_536;
const TARGET_PROBE_KILL_GRACE_MS = 250;

export interface WorkerLaunchTargetProbeResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  overflowed: boolean;
}

export interface WorkerLaunchTargetCompatibility {
  minimumVersion: string;
  probed: true;
  observedVersion: string;
}

export type WorkerLaunchTargetProbeRunner = (args: string[]) => Promise<WorkerLaunchTargetProbeResult>;

const targetProfiles = {
  claude: { executable: "claude", minimumVersion: "2.1.212" },
  codex: { executable: "codex", minimumVersion: "0.149.0" },
} as const;

export function runBoundedWorkerLaunchTargetProbe(args: string[]): Promise<WorkerLaunchTargetProbeResult> {
  const [command, ...commandArgs] = args;
  if (!command) throw new Error("Target probe requires an executable");
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let byteLength = 0;
    let settled = false;
    let timedOut = false;
    let overflowed = false;
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
    let settlementTimer: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(command, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      if (settlementTimer) clearTimeout(settlementTimer);
      resolve({
        exitCode,
        stdout: overflowed ? "" : Buffer.concat(stdout).toString("utf8"),
        stderr: overflowed ? "" : Buffer.concat(stderr).toString("utf8"),
        timedOut,
        overflowed,
      });
    };
    const terminate = () => {
      child.kill("SIGTERM");
      hardKillTimer ??= setTimeout(() => {
        child.kill("SIGKILL");
        settlementTimer = setTimeout(() => finish(-1), TARGET_PROBE_KILL_GRACE_MS);
      }, TARGET_PROBE_KILL_GRACE_MS);
    };
    const collect = (target: Buffer[], chunk: Buffer) => {
      if (overflowed) return;
      byteLength += chunk.byteLength;
      if (byteLength > TARGET_PROBE_MAX_BYTES) {
        overflowed = true;
        stdout.length = 0;
        stderr.length = 0;
        terminate();
        return;
      }
      target.push(chunk);
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.on("error", () => finish(127));
    child.on("close", (code) => finish(code ?? -1));
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, TARGET_PROBE_TIMEOUT_MS);
  });
}

export async function probeWorkerLaunchTarget(
  target: keyof typeof targetProfiles,
  dependencies: { run?: WorkerLaunchTargetProbeRunner } = {},
): Promise<WorkerLaunchTargetCompatibility> {
  const profile = targetProfiles[target];
  const result = await (dependencies.run ?? runBoundedWorkerLaunchTargetProbe)([profile.executable, "--version"]);
  if (result.exitCode !== 0 || result.timedOut || result.overflowed) {
    throw new DrwnError(
      "LAUNCH_TARGET_UNSUPPORTED",
      `Unable to inspect ${target} target compatibility`,
      [`Install ${profile.executable} ${profile.minimumVersion} or newer and ensure it is available on PATH.`],
    );
  }
  const observed = coerce(`${result.stdout}\n${result.stderr}`, { loose: false })?.version ?? null;
  if (!observed) {
    throw new DrwnError(
      "LAUNCH_TARGET_UNSUPPORTED",
      `${target} returned no supported semantic version`,
      [`Expected ${profile.minimumVersion} or newer.`],
    );
  }
  if (!gte(observed, profile.minimumVersion)) {
    throw new DrwnError(
      "LAUNCH_TARGET_VERSION_UNSUPPORTED",
      `${target} ${observed} is older than the supported launch-context floor ${profile.minimumVersion}`,
      [`Upgrade ${profile.executable} before preparing this context.`],
    );
  }
  return { minimumVersion: profile.minimumVersion, probed: true, observedVersion: observed };
}
