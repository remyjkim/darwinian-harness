// ABOUTME: Generates the packaged Worker build identity from clean checked-out source state.
// ABOUTME: Accepts no version or commit input and removes stale qualifying output on every failure.

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import type { BuildIdentityFileV1 } from "../../cli/core/build-identity";

const FULL_LOWERCASE_GIT_SHA = /^[a-f0-9]{40}$/;

type RunGit = (repoRoot: string, args: string[]) => Promise<string>;

export interface GenerateBuildIdentityOptions {
  repoRoot: string;
}

export interface GenerateBuildIdentityDeps {
  runGit?: RunGit;
}

async function defaultRunGit(repoRoot: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || "git command failed");
  return stdout.trim();
}

export async function generateBuildIdentity(
  options: GenerateBuildIdentityOptions,
  deps: GenerateBuildIdentityDeps = {},
): Promise<BuildIdentityFileV1> {
  const repoRoot = options.repoRoot;
  const target = join(repoRoot, "cli", "generated", "build-identity.json");
  const temporary = `${target}.tmp`;
  const runGit = deps.runGit ?? defaultRunGit;

  await rm(target, { force: true });
  await rm(temporary, { force: true });

  try {
    const status = await runGit(repoRoot, ["status", "--porcelain", "--untracked-files=all"]);
    if (status !== "") throw new Error("Build identity requires a clean Git checkout.");

    const packageMetadata = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
      version?: unknown;
    };
    if (typeof packageMetadata.version !== "string" || semver.valid(packageMetadata.version) !== packageMetadata.version) {
      throw new Error("Build identity requires a valid package version.");
    }

    const sourceCommit = await runGit(repoRoot, ["rev-parse", "HEAD"]);
    if (!FULL_LOWERCASE_GIT_SHA.test(sourceCommit) || sourceCommit === "0".repeat(40)) {
      throw new Error("Build identity requires a full lowercase Git commit.");
    }

    const identity: BuildIdentityFileV1 = {
      schema: "darwinian.worker.build-identity",
      schemaVersion: 1,
      version: packageMetadata.version,
      sourceCommit,
    };
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(identity)}\n`, { mode: 0o600 });
    await rename(temporary, target);
    return identity;
  } catch (error) {
    await rm(temporary, { force: true });
    await rm(target, { force: true });
    throw error;
  }
}

if (import.meta.main) {
  if (process.argv.length > 2) {
    console.error("Build identity generator accepts no arguments.");
    process.exit(1);
  }
  const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
  try {
    const identity = await generateBuildIdentity({ repoRoot });
    console.log(JSON.stringify(identity));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Build identity generation failed.");
    process.exit(1);
  }
}
