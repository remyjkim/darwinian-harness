# ABOUTME: Completion evidence for [I221]: drwn worker materialize — the CLI-owned
# ABOUTME: V1-deploy-payload → V2-project translation replacing deploy-api's inline bridge.

# [I221] drwn worker materialize — Completion Evidence

**Status**: Complete. Implementation merged, full suite and CI green, tracker closed out.

**Issue**: [I221] · **Owner/Reviewer**: Remy (owner-as-reviewer, session grant on the issue thread)

**Branch**: `remy/I221-worker-materialize` · **PR**: [#95](https://github.com/remyjkim/darwinian-worker/pull/95)

**Merge commit**: `c11cf40` · **Docs (G1/G2/review01)**: [#93](https://github.com/remyjkim/darwinian-worker/pull/93) (`38b8a32`) · **G3 review record**: `cl0220_cl0221_review02_g3_implementation.md` (on #95) · **Date**: 2026-08-06

## Outcome

`drwn worker materialize --payload` is the canonical consumer of the frozen V1
deploy payload. One invocation owns validate → seed → derive → install → write
→ emit, replacing the inline bash/JS bridge in deploy-api's DeployRunner whose
drift produced four distinct production breaks during the [I204] campaign:

- **Validation gate**: exact `contractVersion === 1`, materialization mode,
  non-empty card closure, and store-export sha256/byteLength verified before
  any filesystem effect; forward payloads hard-reject naming the version.
- **T1/T2 derivations**: V2 project config from the payload entrypoint; lock
  wrap with `workerRoots` and every card path rewritten under the *target*
  agents dir — the container-absolute-path failure class is gone by
  construction (locked by a two-root portability test).
- **Orchestration over the install/write cores** (`ensureCardPresentFromLock`
  frozen, `syncRepository`): production and local tests execute identical code;
  no shelling out to other drwn commands.
- **Snapshot emission**: `--emit-project-tar` contains exactly
  `drwn/config.json` + `drwn/card.lock` (the write-records-without-files
  restore breaker is structurally impossible); `--emit-store-tar` re-archives
  the store; both deterministic (mtime-free — identical content, identical
  bytes) with digests in the result.
- **`--store-export` external bytes**: precedence over inline base64,
  digest-checked against the payload's declared sha256 — lean payloads work
  with zero contract change, converging with DS's queued R2-staging fix for
  the 1 MiB `DEPLOY_WF.create` limit.
- **Command surface**: `drwn worker materialize` with `--json` (cards, staged
  paths, changes, warnings, emitted artifacts + digests), stderr-only
  diagnostics, exit 1 on rejection with zero filesystem effect. Documented in
  the deploy-handoff section of `10_drwn-cli-architecture.md`.

## Verification

- Ten plan slices plus three G3 review findings (empty-closure gate, stale
  ABOUTME, determinism), every one RED-observed before GREEN — including a
  restore replica that reboots the same layout from the emitted tars through
  the real CLI subprocess (`install --frozen` + `write`), and a byte-identity
  regression across a forced whole-second boundary.
- Review conditions: I221-C1 (golden fixtures only via `buildWorkerDeployPayload`)
  held and was proven mid-flight — [I220]'s payload-shape change merged under
  this branch and the rebase required zero golden-suite edits; I221-C2 was
  vacuous (no seam extraction needed; the cores were already callable).
- Full pinned suite: 1889 pass / 6 skip / 0 fail (baseline 1877). Typecheck 0.
  CI green at the reviewed head.

## Follow-ups (DS adoption, on their record)

1. DS bumps the container image pin to the release carrying this command.
2. DeployRunner swaps its inline T1–T4 bridge for the one-line invocation
   (`--payload` + `--emit-*` per their boot contract).
3. DS deletes the inline bridge (no fallback retention, per the G1 deprecation
   path); R2-staged archives ride `--store-export` when their fix lands.
