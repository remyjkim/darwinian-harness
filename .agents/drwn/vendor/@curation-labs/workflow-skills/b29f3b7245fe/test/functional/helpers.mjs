// ABOUTME: Shared helpers for the functional test suite.
// ABOUTME: Spawns the real drwn CLI, materialized hook composers, and git worktrees in isolated temp dirs.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CARD_ROOT = join(__dirname, "..", "..");
export const DRWN_CLI =
  process.env.DRWN_CLI ??
  join(process.env.HOME, "dev", "darwinian-minds", "cli", "index.ts");
export const REPO_WITH_RULES =
  process.env.REPO_WITH_RULES ??
  join(process.env.HOME, "dev", "darwinian-services");
export const CARD_NAME = "@curation-labs/workflow-skills";

const tempDirs = [];

/**
 * Spawn the drwn CLI via bun, returning { stdout, stderr, exitCode }.
 */
export function spawnDrwn(args, cwd) {
  const result = spawnSync("bun", ["run", DRWN_CLI, ...args], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? -1,
  };
}

/**
 * Spawn a materialized hook composer.mjs, send it a JSON event payload on stdin,
 * and return the parsed JSON stdout (or raw stdout if not JSON).
 */
export function spawnComposer(composerPath, payload) {
  const result = spawnSync("bun", [composerPath], {
    encoding: "utf8",
    timeout: 15_000,
    input: JSON.stringify(payload),
  });
  const stdout = result.stdout?.trim() ?? "";
  try {
    return { json: JSON.parse(stdout), raw: stdout, exitCode: result.status ?? -1 };
  } catch {
    return { json: null, raw: stdout, exitCode: result.status ?? -1 };
  }
}

/**
 * Create a temp directory (tracked for cleanup).
 */
export function createTempDir(prefix = "cl-wf-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/**
 * Create a temp drwn project and install the card.
 * Returns the project directory path.
 */
export function installCard(extraArgs = []) {
  const projectDir = createTempDir("cl-wf-project-");

  // init
  let r = spawnDrwn(["init", "--non-interactive", "--no-default-catalogs"], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn init failed: ${r.stderr}`);

  // use the card
  r = spawnDrwn(["use", CARD_NAME], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn use failed: ${r.stderr}`);

  // trust hooks
  r = spawnDrwn(["card", "trust", CARD_NAME, "--hooks"], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn card trust --hooks failed: ${r.stderr}`);

  // trust instructions (required for generated/instructions.md materialization)
  r = spawnDrwn(["card", "trust", CARD_NAME, "--instructions"], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn card trust --instructions failed: ${r.stderr}`);

  // write
  r = spawnDrwn(["write", ...extraArgs], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn write failed: ${r.stderr}`);

  return projectDir;
}

/**
 * Create a git worktree of a source repo in a temp dir.
 * Returns { path, cleanup }.
 */
export function createWorktree(sourceRepo, branchName) {
  const wtDir = createTempDir("cl-wf-worktree-");
  const branch = branchName ?? `test-${Date.now()}`;
  const result = spawnSync("git", ["worktree", "add", "-b", branch, wtDir], {
    cwd: sourceRepo,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(`git worktree add failed: ${result.stderr}`);
  }
  return {
    path: wtDir,
    sourceRepo,
    branch,
    cleanup() {
      spawnSync("git", ["worktree", "remove", "--force", wtDir], {
        cwd: sourceRepo,
        encoding: "utf8",
        timeout: 15_000,
      });
      spawnSync("git", ["branch", "-D", branch], {
        cwd: sourceRepo,
        encoding: "utf8",
        timeout: 10_000,
      });
    },
  };
}

/**
 * Install the card in a given project dir (for worktree-based tests).
 */
export function installCardInDir(projectDir) {
  let r = spawnDrwn(["init", "--non-interactive", "--no-default-catalogs"], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn init failed: ${r.stderr}`);

  r = spawnDrwn(["use", CARD_NAME], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn use failed: ${r.stderr}`);

  r = spawnDrwn(["card", "trust", CARD_NAME, "--hooks"], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn card trust --hooks failed: ${r.stderr}`);

  r = spawnDrwn(["card", "trust", CARD_NAME, "--instructions"], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn card trust --instructions failed: ${r.stderr}`);

  r = spawnDrwn(["write"], projectDir);
  if (r.exitCode !== 0) throw new Error(`drwn write failed: ${r.stderr}`);
}

/**
 * Read a file if it exists, return null otherwise.
 */
export function readFileOrNull(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/**
 * Cleanup all tracked temp dirs. Call in afterEach.
 */
export function cleanupAll() {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Count files matching a pattern in a directory.
 */
export function countFiles(dir, pattern) {
  if (!existsSync(dir)) return 0;
  const result = spawnSync("find", [dir, "-maxdepth", "2", "-name", pattern], {
    encoding: "utf8",
    timeout: 5_000,
  });
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean).length;
}

/**
 * Resolve a symlink to its real path.
 */
export function realpath(path) {
  const result = spawnSync("realpath", [path], { encoding: "utf8", timeout: 5_000 });
  return result.stdout?.trim() ?? path;
}
