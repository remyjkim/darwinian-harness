// ABOUTME: Verifies git fetch lock-contention retry with bounded backoff.
// ABOUTME: Ensures non-lock failures fail immediately without retry.

import { describe, expect, test } from "bun:test";
import { GitRefNotFoundError, fetchWithLockRetry, isGitLockContentionError } from "../cli/core/git";

describe("isGitLockContentionError", () => {
  test("matches common lock contention stderr patterns", () => {
    expect(isGitLockContentionError("fatal: Unable to create '/repo/.git/index.lock': File exists.")).toBe(true);
    expect(isGitLockContentionError("error: cannot lock ref 'refs/heads/main'")).toBe(true);
    expect(isGitLockContentionError("Reference transaction failed")).toBe(true);
    expect(isGitLockContentionError("fatal: repository not found")).toBe(false);
  });
});

describe("fetchWithLockRetry", () => {
  test("retries lock contention failures and succeeds on a later attempt", async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    await fetchWithLockRetry("/tmp/repo.git", "origin", ["refs/heads/*:refs/heads/*"], {
      run: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            stdout: "",
            stderr: "fatal: Unable to create '/tmp/repo.git/index.lock': File exists.",
            exitCode: 1,
          };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([50]);
  });

  test("does not retry auth failures", async () => {
    let attempts = 0;
    await expect(
      fetchWithLockRetry("/tmp/repo.git", "origin", [], {
        run: async () => {
          attempts += 1;
          return {
            stdout: "",
            stderr: "fatal: could not read Username for 'https://github.com'",
            exitCode: 128,
          };
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow(/Username/);
    expect(attempts).toBe(1);
  });

  test("does not retry ref-not-found failures", async () => {
    let attempts = 0;
    try {
      await fetchWithLockRetry("/tmp/repo.git", "origin", [], {
        run: async () => {
          attempts += 1;
          return {
            stdout: "",
            stderr: "fatal: couldn't find remote ref refs/heads/missing",
            exitCode: 128,
          };
        },
        sleep: async () => {},
      });
      throw new Error("expected fetch to throw");
    } catch (error) {
      // I65 Fix 6: the message stays clean; the raw stderr lives in gitContext.
      expect(error).toBeInstanceOf(GitRefNotFoundError);
      expect((error as GitRefNotFoundError).gitContext?.stderr).toContain("couldn't find remote ref");
    }
    expect(attempts).toBe(1);
  });
});
