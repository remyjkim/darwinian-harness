// ABOUTME: Centralizes all Git process execution for drwn card distribution.
// ABOUTME: Provides typed, testable wrappers around bare-repo plumbing operations.

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { extract as extractArchive } from "./archive";
import { DrwnError } from "./errors";

const DEFAULT_TIMEOUT_MS = Number(process.env.DRWN_GIT_TIMEOUT_MS ?? 30_000);

export interface GitContext {
  args?: string[];
  cwd?: string;
  stderr?: string;
  exitCode?: number;
}

export class GitError extends DrwnError {
  constructor(code: string, message: string, public readonly gitContext?: GitContext) {
    super(code, message);
  }
}

export class GitNetworkError extends GitError {}
export class GitAuthError extends GitError {}
export class GitRefNotFoundError extends GitError {}

export interface GitRunOpts {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: string;
  timeoutMs?: number;
}

export interface GitRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitRemoteRef {
  sha: string;
  ref: string;
}

export interface GitCommitLogEntry {
  commit: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string;
  subject: string;
}

export interface GitLogOptions {
  maxCount?: number;
  ref?: string;
}

export async function runGit(args: string[], opts: GitRunOpts = {}): Promise<GitRunResult> {
  const gitBin = Bun.which("git") ?? "/usr/bin/git";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return await new Promise<GitRunResult>((resolve, reject) => {
    const proc = spawn(gitBin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: [opts.stdin ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // The process may have already exited.
      }
      reject(new GitError("GIT_TIMEOUT", `git ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode: exitCode ?? -1, stdout, stderr });
    });

    if (opts.stdin && proc.stdin) {
      proc.stdin.write(opts.stdin);
      proc.stdin.end();
    }
  });
}

export async function runInRepo(repoPath: string, args: string[], opts: GitRunOpts = {}): Promise<GitRunResult> {
  return await runGit(["--git-dir", repoPath, ...args], opts);
}

export async function initBare(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const result = await runGit(["init", "--bare", path]);
  throwForFailure(result, "GIT_INIT_FAILED", `git init --bare failed`, ["init", "--bare", path]);
  const headResult = await runInRepo(path, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  throwForFailure(
    headResult,
    "GIT_INIT_HEAD_FAILED",
    "git symbolic-ref HEAD refs/heads/main failed",
    ["symbolic-ref", "HEAD", "refs/heads/main"],
  );
}

export async function revParse(repoPath: string, ref: string): Promise<string> {
  const result = await runInRepo(repoPath, ["rev-parse", ref]);
  if (result.exitCode !== 0) {
    throw classifyGitFailure("GIT_REV_PARSE_FAILED", `git rev-parse failed for ${ref}`, ["rev-parse", ref], result);
  }
  return result.stdout.trim();
}

export async function catFileType(repoPath: string, sha: string): Promise<string> {
  const result = await runInRepo(repoPath, ["cat-file", "-t", sha]);
  throwForFailure(result, "GIT_CAT_FILE_FAILED", `git cat-file -t failed for ${sha}`, ["cat-file", "-t", sha]);
  return result.stdout.trim();
}

export async function getCommitTree(repoPath: string, commitSha: string): Promise<string> {
  const result = await runInRepo(repoPath, ["rev-parse", `${commitSha}^{tree}`]);
  throwForFailure(result, "GIT_GET_TREE_FAILED", `cannot get tree from commit ${commitSha}`, ["rev-parse", `${commitSha}^{tree}`]);
  return result.stdout.trim();
}

export async function configGet(repoPath: string, key: string): Promise<string | null> {
  const result = await runInRepo(repoPath, ["config", "--get", key]);
  if (result.exitCode === 1 && result.stderr.trim() === "") {
    return null;
  }
  throwForFailure(result, "GIT_CONFIG_GET_FAILED", `git config --get failed for ${key}`, ["config", "--get", key]);
  return result.stdout.trim();
}

export async function configSet(repoPath: string, key: string, value: string): Promise<void> {
  const result = await runInRepo(repoPath, ["config", key, value]);
  throwForFailure(result, "GIT_CONFIG_SET_FAILED", `git config failed for ${key}`, ["config", key, value]);
}

export async function configGetRegexp(repoPath: string, pattern: string): Promise<Array<{ key: string; value: string }>> {
  const result = await runInRepo(repoPath, ["config", "--get-regexp", pattern]);
  if (result.exitCode === 1 && result.stderr.trim() === "") {
    return [];
  }
  throwForFailure(result, "GIT_CONFIG_GET_REGEXP_FAILED", `git config --get-regexp failed for ${pattern}`, [
    "config",
    "--get-regexp",
    pattern,
  ]);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ");
      if (space === -1) {
        return { key: line, value: "" };
      }
      return { key: line.slice(0, space), value: line.slice(space + 1) };
    });
}

export async function lsRemote(url: string, refs: string[] = []): Promise<GitRemoteRef[]> {
  const result = await runGit(["ls-remote", url, ...refs]);
  throwForFailure(result, "GIT_LS_REMOTE_FAILED", `git ls-remote failed for ${url}`, ["ls-remote", url, ...refs]);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, ref] = line.split(/\s+/, 2);
      return { sha: sha!, ref: ref! };
    });
}

export async function cloneBare(url: string, targetPath: string, opts: { depth?: number } = {}): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const args = ["clone", "--bare"];
  if (opts.depth) {
    args.push("--depth", String(opts.depth));
  }
  args.push(url, targetPath);
  const result = await runGit(args);
  throwForFailure(result, "GIT_CLONE_FAILED", `git clone --bare failed for ${url}`, args);
}

export async function cloneWorktree(url: string, targetPath: string, opts: { depth?: number } = {}): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const args = ["clone"];
  if (opts.depth) {
    args.push("--depth", String(opts.depth));
  }
  args.push(url, targetPath);
  const result = await runGit(args);
  throwForFailure(result, "GIT_CLONE_FAILED", `git clone failed for ${url}`, args);
}

export async function worktreeStatusPorcelain(cwd: string): Promise<string> {
  const args = ["status", "--porcelain"];
  const result = await runGit(args, { cwd });
  throwForFailure(result, "GIT_STATUS_FAILED", "git status --porcelain failed", args);
  return result.stdout.trimEnd();
}

export async function currentBranch(cwd: string): Promise<string> {
  const args = ["branch", "--show-current"];
  const result = await runGit(args, { cwd });
  throwForFailure(result, "GIT_BRANCH_FAILED", "git branch --show-current failed", args);
  return result.stdout.trim();
}

export async function addWorktreePaths(cwd: string, paths: string[]): Promise<void> {
  const args = ["add", "--", ...paths];
  const result = await runGit(args, { cwd });
  throwForFailure(result, "GIT_ADD_FAILED", "git add failed", args);
}

export async function commitWorktree(cwd: string, message: string): Promise<string> {
  const args = ["commit", "-m", message];
  const result = await runGit(args, {
    cwd,
    env: {
      GIT_AUTHOR_NAME: "drwn",
      GIT_AUTHOR_EMAIL: "drwn@example.local",
      GIT_COMMITTER_NAME: "drwn",
      GIT_COMMITTER_EMAIL: "drwn@example.local",
    },
  });
  throwForFailure(result, "GIT_COMMIT_FAILED", "git commit failed", args);
  return await revParseWorktree(cwd, "HEAD");
}

export async function pushWorktreeHead(cwd: string, remote: string, branch: string): Promise<void> {
  const args = ["push", remote, `HEAD:${branch}`];
  const result = await runGit(args, { cwd });
  throwForFailure(result, "GIT_PUSH_FAILED", `git push failed to ${remote}`, args);
}

export async function remoteGetUrl(cwd: string, remote: string): Promise<string> {
  const args = ["remote", "get-url", remote];
  const result = await runGit(args, { cwd });
  throwForFailure(result, "GIT_REMOTE_GET_URL_FAILED", `git remote get-url failed for ${remote}`, args);
  return result.stdout.trim();
}

export async function revParseWorktree(cwd: string, ref: string): Promise<string> {
  const args = ["rev-parse", ref];
  const result = await runGit(args, { cwd });
  if (result.exitCode !== 0) {
    throw classifyGitFailure("GIT_REV_PARSE_FAILED", `git rev-parse failed for ${ref}`, args, result);
  }
  return result.stdout.trim();
}

export async function fetch(repoPath: string, remote: string, refspecs: string[] = []): Promise<void> {
  const args = ["fetch", remote, ...refspecs];
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_FETCH_FAILED", `git fetch failed from ${remote}`, args);
}

export function isGitLockContentionError(stderr: string) {
  return /Unable to create .*lock|cannot lock ref|Reference transaction failed|index\.lock/i.test(stderr);
}

export async function fetchWithLockRetry(
  repoPath: string,
  remote: string,
  refspecs: string[] = [],
  options: {
    run?: (repoPath: string, args: string[]) => Promise<GitRunResult>;
    sleep?: (ms: number) => Promise<void>;
    maxAttempts?: number;
  } = {},
) {
  const run = options.run ?? ((path, args) => runInRepo(path, args));
  const sleep = options.sleep ?? ((ms) => Bun.sleep(ms));
  const maxAttempts = options.maxAttempts ?? 3;
  const backoffs = [50, 100, 200];
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const args = ["fetch", remote, ...refspecs];
    const result = await run(repoPath, args);
    if (result.exitCode === 0) {
      return;
    }
    const stderr = `${result.stderr}\n${result.stdout}`;
    try {
      throwForFailure(result, "GIT_FETCH_FAILED", `git fetch failed from ${remote}`, args);
    } catch (error) {
      lastError = error;
      if (!isGitLockContentionError(stderr) || attempt === maxAttempts - 1) {
        throw error;
      }
      await sleep(backoffs[attempt] ?? 200);
    }
  }

  throw lastError;
}

export async function push(repoPath: string, remote: string, refs: string[]): Promise<void> {
  const args = ["push", remote, ...refs];
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_PUSH_FAILED", `git push failed to ${remote}`, args);
}

export async function remoteAdd(repoPath: string, name: string, url: string): Promise<void> {
  const args = ["remote", "add", name, url];
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_REMOTE_ADD_FAILED", `git remote add failed for ${name}`, args);
}

export async function remoteSet(repoPath: string, name: string, url: string): Promise<void> {
  const args = ["remote", "set-url", name, url];
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_REMOTE_SET_FAILED", `git remote set-url failed for ${name}`, args);
}

export async function remoteRemove(repoPath: string, name: string): Promise<void> {
  const args = ["remote", "remove", name];
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_REMOTE_REMOVE_FAILED", `git remote remove failed for ${name}`, args);
}

export async function remoteList(repoPath: string): Promise<Record<string, string>> {
  const result = await runInRepo(repoPath, ["remote", "-v"]);
  throwForFailure(result, "GIT_REMOTE_LIST_FAILED", "git remote -v failed", ["remote", "-v"]);
  const remotes: Record<string, string> = {};
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (match && match[3] === "fetch") {
      remotes[match[1]!] = match[2]!;
    }
  }
  return remotes;
}

export async function hashObject(repoPath: string, content: string): Promise<string> {
  const result = await runInRepo(repoPath, ["hash-object", "-w", "--stdin"], { stdin: content });
  throwForFailure(result, "GIT_HASH_OBJECT_FAILED", "git hash-object failed", ["hash-object", "-w", "--stdin"]);
  return result.stdout.trim();
}

export interface MkTreeEntry {
  mode: string;
  type: "blob" | "tree";
  sha: string;
  path: string;
}

export async function mkTree(repoPath: string, entries: MkTreeEntry[]): Promise<string> {
  const input = entries.map((entry) => `${entry.mode} ${entry.type} ${entry.sha}\t${entry.path}`).join("\n") + "\n";
  const result = await runInRepo(repoPath, ["mktree"], { stdin: input });
  throwForFailure(result, "GIT_MKTREE_FAILED", "git mktree failed", ["mktree"]);
  return result.stdout.trim();
}

export async function writeTreeFromDir(repoPath: string, sourceDir: string): Promise<string> {
  const tempIndex = join(dirname(repoPath), `.drwn-index-${randomBytes(8).toString("hex")}`);
  await rm(tempIndex, { force: true });
  const env = { GIT_INDEX_FILE: tempIndex };
  try {
    const addResult = await runGit(["--git-dir", repoPath, "--work-tree", sourceDir, "add", "-A"], { env });
    throwForFailure(addResult, "GIT_WRITE_TREE_ADD_FAILED", `git add failed for ${sourceDir}`, ["add", "-A"]);
    const treeResult = await runInRepo(repoPath, ["write-tree"], { env });
    throwForFailure(treeResult, "GIT_WRITE_TREE_FAILED", `git write-tree failed for ${sourceDir}`, ["write-tree"]);
    return treeResult.stdout.trim();
  } finally {
    await rm(tempIndex, { force: true });
  }
}

export async function commitTree(
  repoPath: string,
  treeSha: string,
  parent: string | null | undefined,
  message: string,
  author?: { name: string; email: string },
): Promise<string> {
  const args = ["commit-tree", treeSha, "-m", message];
  if (parent) {
    args.push("-p", parent);
  }
  const identity = author ?? { name: "drwn", email: "drwn@example.local" };
  const result = await runInRepo(repoPath, args, {
    env: {
      GIT_AUTHOR_NAME: identity.name,
      GIT_AUTHOR_EMAIL: identity.email,
      GIT_COMMITTER_NAME: identity.name,
      GIT_COMMITTER_EMAIL: identity.email,
    },
  });
  throwForFailure(result, "GIT_COMMIT_TREE_FAILED", "git commit-tree failed", args);
  return result.stdout.trim();
}

export async function updateRef(repoPath: string, ref: string, sha: string): Promise<void> {
  const args = ["update-ref", ref, sha];
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_UPDATE_REF_FAILED", `git update-ref failed for ${ref}`, args);
}

export async function createAnnotatedTag(repoPath: string, tag: string, sha: string, message: string): Promise<void> {
  const args = ["tag", "-a", tag, "-m", message, sha];
  const result = await runInRepo(repoPath, args, {
    env: {
      GIT_AUTHOR_NAME: "drwn",
      GIT_AUTHOR_EMAIL: "drwn@example.local",
      GIT_COMMITTER_NAME: "drwn",
      GIT_COMMITTER_EMAIL: "drwn@example.local",
    },
  });
  throwForFailure(result, "GIT_TAG_FAILED", `git tag failed for ${tag}`, args);
}

export async function listTags(repoPath: string): Promise<string[]> {
  const result = await runInRepo(repoPath, ["for-each-ref", "--format=%(refname:short)", "refs/tags"]);
  throwForFailure(result, "GIT_LIST_TAGS_FAILED", "git for-each-ref refs/tags failed", ["for-each-ref", "refs/tags"]);
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean).sort();
}

export async function extractSubpathToDir(
  repoPath: string,
  commitSha: string,
  subpath: string,
  targetDir: string,
): Promise<void> {
  const tarPath = join(dirname(targetDir), `.drwn-archive-${randomBytes(8).toString("hex")}.tar`);
  await mkdir(dirname(tarPath), { recursive: true });
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  try {
    const treeish = `${commitSha}:${subpath.replace(/\/$/, "")}`;
    const archiveResult = await runInRepo(repoPath, ["archive", "--format=tar", treeish, "-o", tarPath]);
    throwForFailure(archiveResult, "GIT_ARCHIVE_FAILED", `git archive failed for ${treeish}`, ["archive", treeish]);
    try {
      await extractArchive(tarPath, targetDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError("GIT_ARCHIVE_EXTRACT_FAILED", `tar extraction failed: ${message}`, {
        args: ["tar", "-xf", tarPath, "-C", targetDir],
        stderr: message,
        exitCode: 1,
      });
    }
  } finally {
    await rm(tarPath, { force: true });
  }
}

export async function extractTreeToDir(repoPath: string, treeSha: string, targetDir: string): Promise<void> {
  const tarPath = join(dirname(targetDir), `.drwn-archive-${randomBytes(8).toString("hex")}.tar`);
  await mkdir(dirname(tarPath), { recursive: true });
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  try {
    const archiveResult = await runInRepo(repoPath, ["archive", treeSha, "-o", tarPath]);
    throwForFailure(archiveResult, "GIT_ARCHIVE_FAILED", `git archive failed for ${treeSha}`, ["archive", treeSha]);
    try {
      await extractArchive(tarPath, targetDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError("GIT_ARCHIVE_EXTRACT_FAILED", `tar extraction failed: ${message}`, {
        args: ["tar", "-xf", tarPath, "-C", targetDir],
        stderr: message,
        exitCode: 1,
      });
    }
  } finally {
    await rm(tarPath, { force: true });
  }
}

export async function log(repoPath: string, opts: GitLogOptions = {}): Promise<GitCommitLogEntry[]> {
  const format = "%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e";
  const args = ["log", `--format=${format}`];
  if (opts.maxCount) {
    args.push(`--max-count=${opts.maxCount}`);
  }
  args.push(opts.ref ?? "--all");
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_LOG_FAILED", "git log failed", args);
  return result.stdout
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [commit, parents, authorName, authorEmail, authorDate, subject] = entry.split("\x1f");
      return {
        commit: commit!,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        authorName: authorName!,
        authorEmail: authorEmail!,
        authorDate: authorDate!,
        subject: subject!,
      };
    });
}

export async function diff(repoPath: string, refA: string, refB: string): Promise<string> {
  const args = ["diff", refA, refB];
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_DIFF_FAILED", `git diff failed for ${refA}..${refB}`, args);
  return result.stdout;
}

export async function showBlob(repoPath: string, refColonPath: string): Promise<string> {
  const args = ["show", refColonPath];
  const result = await runInRepo(repoPath, args);
  throwForFailure(result, "GIT_SHOW_FAILED", `git show failed for ${refColonPath}`, args);
  return result.stdout;
}

export async function moveRepoAtomically(stagedPath: string, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  await rm(targetPath, { recursive: true, force: true });
  await rename(stagedPath, targetPath);
}

function throwForFailure(result: GitRunResult, code: string, message: string, args?: string[]): void {
  if (result.exitCode === 0) {
    return;
  }
  throw classifyGitFailure(code, message, args, result);
}

function classifyGitFailure(code: string, message: string, args: string[] | undefined, result: GitRunResult): GitError {
  const context = { args, stderr: result.stderr, exitCode: result.exitCode };
  const stderr = result.stderr || result.stdout;
  if (/authentication|permission denied|access denied|could not read username|repository not found/i.test(stderr)) {
    return new GitAuthError("GIT_AUTH_FAILED", `${message}: ${stderr}`.trim(), context);
  }
  if (/unable to access|could not resolve host|failed to connect|network is unreachable|connection refused/i.test(stderr)) {
    return new GitNetworkError("GIT_NETWORK_FAILED", `${message}: ${stderr}`.trim(), context);
  }
  if (/unknown revision|bad revision|not a valid object name|ambiguous argument|couldn't find remote ref|not found/i.test(stderr)) {
    // Keep the ref-not-found message clean; raw git stderr stays in context for debugging (I65 Fix 6).
    return new GitRefNotFoundError("GIT_REF_NOT_FOUND", message, context);
  }
  return new GitError(code, `${message}: ${stderr}`.trim(), context);
}
