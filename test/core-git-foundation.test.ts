// ABOUTME: Verifies the core Git process wrapper and basic bare-repo primitives.
// ABOUTME: Protects typed failures and config/ref lookups used by higher-level card flows.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GitRefNotFoundError,
  catFileType,
  configGet,
  configSet,
  getCommitTree,
  initBare,
  revParse,
  runGit,
} from "../cli/core/git";
import { cleanupLocalCardRepo, createLocalCardRepo } from "./fixtures/git-helpers";

const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("git foundation primitives", () => {
  test("runGit returns exit code, stdout, and stderr", async () => {
    const result = await runGit(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("git version");
    expect(result.stderr).toBe("");
  });

  test("initBare creates a valid bare repo", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-test-"));
    cleanups.push(tmp);
    const repo = join(tmp, "test.git");
    const gitConfig = join(tmp, "gitconfig");
    await writeFile(gitConfig, "[init]\n\tdefaultBranch = master\n");

    const originalGlobalConfig = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = gitConfig;
    try {
      await initBare(repo);
    } finally {
      if (originalGlobalConfig === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = originalGlobalConfig;
      }
    }

    expect(existsSync(join(repo, "HEAD"))).toBe(true);
    const head = await runGit(["--git-dir", repo, "symbolic-ref", "HEAD"]);
    expect(head.exitCode).toBe(0);
    expect(head.stdout.trim()).toBe("refs/heads/main");
  });

  test("configSet and configGet round-trip in a bare repo", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-test-"));
    cleanups.push(tmp);
    const repo = join(tmp, "test.git");
    await initBare(repo);

    await configSet(repo, "drwn.cardName", "@me/foo");

    expect(await configGet(repo, "drwn.cardName")).toBe("@me/foo");
    expect(await configGet(repo, "drwn.missing")).toBeNull();
  });

  test("revParse, catFileType, and getCommitTree inspect real commits", async () => {
    const repo = await createLocalCardRepo({ name: "@me/foo" });
    cleanups.push(repo.tempDir);

    const commitSha = await revParse(repo.bareRepoPath, "refs/tags/v1.0.0^{commit}");
    const treeSha = await getCommitTree(repo.bareRepoPath, commitSha);

    expect(await catFileType(repo.bareRepoPath, commitSha)).toBe("commit");
    expect(await catFileType(repo.bareRepoPath, treeSha)).toBe("tree");
    await cleanupLocalCardRepo(repo);
    cleanups.pop();
  });

  test("revParse throws GitRefNotFoundError for a missing ref", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-test-"));
    cleanups.push(tmp);
    const repo = join(tmp, "test.git");
    await initBare(repo);

    await expect(revParse(repo, "refs/heads/missing")).rejects.toThrow(GitRefNotFoundError);
  });

  test("ref-not-found message is clean and keeps raw stderr in context", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-test-"));
    cleanups.push(tmp);
    const repo = join(tmp, "test.git");
    await initBare(repo);

    try {
      await revParse(repo, "v9.9.9^{commit}");
      throw new Error("expected revParse to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(GitRefNotFoundError);
      const refError = error as GitRefNotFoundError;
      // I49 TC-D8: the message must not leak raw git plumbing advice.
      expect(refError.message).toBe("git rev-parse failed for v9.9.9^{commit}");
      expect(refError.message).not.toContain("Use '--'");
      // The raw stderr stays available for debugging.
      expect(refError.gitContext?.stderr ?? "").toContain("v9.9.9");
    }
  });
});
