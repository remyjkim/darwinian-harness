# ABOUTME: Preserves the fresh repository qualification baseline after I214 rebased over landed I265.
# ABOUTME: Records exact-Bun provenance at qualified head efd7150 over integrated base cef3090.

# I214 Post-Rebase Baseline Evidence

**Status:** Fresh post-rebase integration evidence; no I214 production implementation

**Date:** 2026-08-11

**Worktree:** `/Users/pureicis/.config/superpowers/worktrees/darwinian-minds/i214-goose-target-team-strategy`

**Qualified I214 HEAD:** `efd7150dad20d38a52306d10031622f2d24b8fe3`

**Integrated origin/main:** `cef3090c013134b578d87fd938a6741fd288d36a`

**Historical pre-rebase base:** `ea13a582d7797619f2a934a59c34368241cca191`

**Platform:** Darwin arm64

**Package identity:** `darwinian@1.3.0`

**Required package manager:** `bun@1.2.21`

**Executed Bun:** official standalone Bun 1.2.21, SHA-256
`2803929d4d8a82b6d0a76b1cefb3c929dd6d0c3888604e449d59b64ba891d82a`

The standalone executable was downloaded to a temporary directory for this qualification. It
was not installed machine-wide. The system Bun 1.3.11 and the existing user Bun 1.2.15 were not
used for the commands below.

## Rebase and integration identity

`origin/main` advanced by 45 commits from the historical I214 documentation base. Its landed
tip is I265, `[I265] Worker 1.3 runtime-admission declaration, producer, and offline derivation
adapter (#109)`. The I214 branch was rebased cleanly onto that exact tip. `git range-diff` and
blob comparison proved the two pre-existing I214 documentation commits byte-equivalent before
and after rebase; the rebased commit identities are:

- `bbd21f4` — `[other] freeze I214 candidate-v5 contracts and plan`
- `efd7150` — `[other] resolve I214 candidate-v5 review findings`

No coworker worktree was entered or mutated. The fresh commands below ran only in the isolated
I214 worktree, which remained free of tracked changes after qualification.

## Dependency baselines

Root command:

    /tmp/.../bun install --frozen-lockfile

Result: exit 0, 112 packages checked, no changes. Raw log: 82 bytes, SHA-256
`38aacba4b571e8a1958d5429616767f2a2b249215fb81edb63940f2355f01d83`.

The Docusaurus project has its own `docs-docusaurus/bun.lock` and is not a root workspace
member. A first root `bun run docs:build` therefore reproduced `docusaurus: command not found`
with exit 127. Inspection confirmed that `docs-docusaurus/node_modules/.bin/docusaurus` was
absent while the nested lockfile declared Docusaurus 3.9.2. The prerequisite was resolved without
tracked changes by running the same exact Bun executable from `docs-docusaurus`:

    /tmp/.../bun install --frozen-lockfile

Result: exit 0, 1,327 packages installed. Raw log: 408 bytes, SHA-256
`ab00e9db02c8143aee31fef24f210fcc24c88a904d984b42ce4848911152bf81`.

## Focused I265/I214 seam qualification

Command:

    bun test --timeout 30000 \
      test/package-readiness.test.ts \
      test/scripts-release-artifact-contract.test.ts \
      test/docs-readiness.test.ts \
      test/core-runtime-admission-manifest.test.ts \
      test/scripts-runtime-admission-derive.test.ts \
      test/core-worker-materialize-validate.test.ts \
      test/core-card-lock.test.ts \
      test/scripts-release-provenance.test.ts \
      test/scripts-release-publication-controls.test.ts \
      test/scripts-release-workflow.test.ts \
      test/scripts-release-recovery-workflow.test.ts

Observed summary:

    306 pass
    1 skip
    0 fail
    2046 expect() calls
    Ran 307 tests across 11 files. [5.02s]

The one skip is the Darwin-inapplicable unsupported-platform branch of the descriptor-bound
runtime-admission derivation adapter. Raw log: 31,249 bytes, SHA-256
`a8b45fc4f8fe667eeb15a7410a13121176b9dc179bdb9c15cc9d958391b604e3`.

## Full deterministic gate

Command:

    bun run test:gate

Observed terminal summary:

    11 tests skipped
    2365 pass
    11 skip
    0 fail
    233253 expect() calls
    Ran 2376 tests across 351 files. [649.93s]

The skips are the opt-in real Buzz ACP, native credential-store, real BeginningDB, live catalog,
and real adapter-restart cases plus the Darwin-inapplicable unsupported-platform derivation
branch. Raw log: 243,459 bytes, SHA-256
`f1ed14966678dfab33176d2ec42bac741606d77300bb19e5e87782bb3488dd78`.

## Type, release, package, and documentation qualification

Typecheck:

    bun run typecheck

Result: exit 0 with no diagnostics. Raw log: 15 bytes, SHA-256
`8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92`.

Release readiness:

    QUALITY_GATE_TEST_MODE=1 bun run verify:release --json

Result: exit 0, top-level `ok: true`, every reported check true, no warnings. Raw log: 1,248
bytes, SHA-256
`7f8831e0a4aefa907b63cd3b6f425fcd685c7676589d6306d6863048efe61f8f`.

Package membership dry run:

    npm pack --dry-run --json

Result: exit 0 for `darwinian@1.3.0`, filename `darwinian-1.3.0.tgz`, 363 members, package
size 551,527 bytes, unpacked size 2,188,755 bytes. Raw log: 40,332 bytes, SHA-256
`6f4243446ea80b15393f21d89ab53061c1e1c3bd2fd54833a21198e4d649c06d`.

Documentation production build, after the nested frozen install:

    bun run build

Result: exit 0; Docusaurus client and server compiled and generated static files. Raw log: 1,246
bytes, SHA-256
`5309430f4b0b005c2142bd5eb2c7b133fdd1d2f3a98b875d288a379f903f7d43`.

## Scope of evidence

This evidence proves that the rebased, pre-I214-implementation repository is green at landed
I265 and supplies the comparator for later RED/GREEN and G3 qualification. It does not qualify
an I214 implementation, a release, live Goose providers, or the Goose 1.45.0 source as an
executed binary. The historical `cl0214_goose_g1_baseline_evidence.md` remains immutable evidence
for `ea13a582`; this file is the separate current-base record.
