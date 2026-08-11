# ABOUTME: Preserves the initialized repository baseline used by the I214 Goose G1 candidate.
# ABOUTME: Records exact commands, environment identity, results, exclusions, and raw-log provenance.

# I214 Goose G1 Baseline Evidence

**Status:** Frozen baseline evidence

**Date:** 2026-08-10

**Worktree:** `/Users/pureicis/.config/superpowers/worktrees/darwinian-minds/i214-goose-target-team-strategy`

**HEAD:** `ea13a582d7797619f2a934a59c34368241cca191`

**Platform:** Darwin arm64

**Bun:** 1.3.11

## Deterministic test baseline

Command:

    bun test ./test

Completion time from the raw-log mtime: `2026-08-10T14:31:03-0700`.

Observed terminal summary:

    10 tests skipped:
    (skip) real buzz-acp delivers a deployed Worker answer and a threaded reply
    (skip) real macOS keychain round-trip > stores, loads, and deletes a key via the real security CLI when explicitly enabled
    (skip) real Windows DPAPI backend > stores, loads, and deletes a key via real DPAPI when explicitly enabled and available
    (skip) real Linux secret-tool backend > stores, loads, and deletes a key via the Secret Service when explicitly enabled and available
    (skip) contract: CAS create/update semantics match the fake
    (skip) contract: append and placement lifecycle match the fake
    (skip) contract: semantic observations and insights preserve inode identity across views
    (skip) journey: provision, DB-first edit, drift-preserving sync, checkpoint against the real server
    (skip) publishes and consumes the live dm-card-base GitHub repo through a catalog
    (skip) real Worker survives adapter restart and continues through the same ACP session

     2212 pass
     10 skip
     0 fail
     231973 expect() calls
    Ran 2222 tests across 351 files. [626.04s]

The complete 227,802-byte terminal log was captured at
`/tmp/i214-goose-baseline-bun-test.log` during this G1 session. Its SHA-256 is
`a5546d53f7110ca71517a307150dec5201ad1d58a6e57f3a71740fe92969c9f3`.
The temporary path is provenance rather than durable repository storage; the exact command,
summary, exclusions, environment, byte count, and digest above are the durable audit record.

## Typecheck baseline

Command:

    bunx tsc --noEmit

Fresh verification completed at `2026-08-10T15:01:18-0700` with exit status 0 and no
diagnostics.

## Scope of evidence

This is a pre-implementation baseline. It proves that the initialized base passed its
deterministic suite and typecheck before I214 production changes. It does not qualify live
Goose providers, runtime-global behavior, hook enforcement, or future implementation.
