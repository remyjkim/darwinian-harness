// ABOUTME: Classifies one exact npm package version as published, unpublished, or indeterminate.
// ABOUTME: Treats only a structured E404 from the fixed exact-version query as freshness evidence.

import semver from "semver";

export interface RegistryProbeInput {
  packageName: string;
  version: string;
}

export interface RegistryCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failure?: "timeout";
}

export type RegistryProbeResult =
  | { state: "published" }
  | { state: "unpublished" }
  | { state: "indeterminate" };

type RegistryRunner = (args: string[]) => Promise<RegistryCommandResult>;

export interface RegistryProbeDeps {
  run?: RegistryRunner;
}

function assertInput(input: RegistryProbeInput): void {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/.test(input.packageName)) {
    throw new Error("Registry probe package name is invalid.");
  }
  if (semver.valid(input.version) !== input.version) {
    throw new Error("Registry probe version is invalid.");
  }
}

async function defaultRegistryRunner(args: string[]): Promise<RegistryCommandResult> {
  const proc = Bun.spawn(["npm", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, 15_000);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      ...(timedOut ? { failure: "timeout" as const } : {}),
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(value: string): unknown {
  if (value.trim() === "") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isStructuredE404(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "object" && error !== null && !Array.isArray(error) &&
    (error as Record<string, unknown>).code === "E404";
}

export async function probeRegistryVersion(
  input: RegistryProbeInput,
  deps: RegistryProbeDeps = {},
): Promise<RegistryProbeResult> {
  assertInput(input);
  const run = deps.run ?? defaultRegistryRunner;
  const result = await run([
    "view",
    `${input.packageName}@${input.version}`,
    "version",
    "--json",
    "--prefer-online",
  ]);

  if (result.failure || result.exitCode === null) return { state: "indeterminate" };
  if (result.exitCode === 0) {
    const published = parseJson(result.stdout);
    return published === input.version ? { state: "published" } : { state: "indeterminate" };
  }

  if (isStructuredE404(parseJson(result.stdout)) || isStructuredE404(parseJson(result.stderr))) {
    return { state: "unpublished" };
  }
  return { state: "indeterminate" };
}
