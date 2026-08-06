# ABOUTME: G2 implementation plan for [I221]: the drwn worker materialize command — pure transform cores, payload validation, store seeding, install/write composition, snapshot emission.
# ABOUTME: Nine RED→GREEN slices from pure functions outward to the golden-payload end-to-end; fixtures come from the real payload builder, never hand-written JSON.

# [I221] `drwn worker materialize` — Implementation Plan (GATE 2)

**Architecture:** [`cl0221_worker_materialize_entrypoint_target_architecture.md`](../analyses/cl0221_worker_materialize_entrypoint_target_architecture.md) (G1; full-command O1, dual bytes input, minimal snapshot emission, Tier-1 surface).
**Owner/Reviewer:** Remy (owner-as-reviewer in force for this row, granted 2026-08-05).

## Module layout

```text
cli/core/worker-materialize.ts     pure derivations + orchestration
  deriveMaterializeConfig(payload)             → ProjectConfig          (T1)
  deriveMaterializeLock(payload, agentsDir)    → ProjectLockV1          (T2, path rewrite)
  validateMaterializePayload(raw)              → WorkerDeployPayload    (version + digest gates)
  materializeWorkerPayload(opts)               → MaterializeResult      (T3 seed → stage → install cores → write → emit)
cli/commands/worker/materialize.ts  Clipanion command (flags per G1 §2), registered beside the worker family
```

Reuse seams (verified importable as functions): the archive helpers `worker-deploy.ts`
composes (`createArchive`; extraction counterpart located during slice 4 — `card-store`'s
tar handling is the candidate), `validateProjectConfig`, `serializeCardLock`/
`validateCardLockfile`, `ensureCardPresentFromLock`, and the install command's sync
pipeline entry (`syncRepository` in `cli/core/sync.ts` — the same seam `install.ts:83`
executes). No shelling out to other drwn commands, per G1.

## Fixtures

Golden payloads are **built, never hand-written**: `scaffoldCliFixture` +
`publishCardWithSkills` (existing harness) publish a small real closure into a per-fixture
store; `buildWorkerDeployPayload` produces the payload under test. This keeps fixtures
correct across payload-builder evolution by construction.

## TDD sequence (RED → GREEN per slice, committed per slice)

| # | RED test | GREEN change |
| --- | --- | --- |
| 1 | `deriveMaterializeConfig`: entrypoint → `{schema, schemaVersion: 1, workers: [requested], activeWorker: name}`; legacy `payload.config` ignored | T1 pure function |
| 2 | `deriveMaterializeLock`: wraps store/cards, builds the root entry (name/requested/kind/members in closure order), rewrites every card `path` under the given agents dir; validates via `validateCardLockfile` | T2 pure function |
| 3 | `validateMaterializePayload`: `contractVersion: 2` → hard reject naming the version; sha256/byteLength mismatch → reject **before any filesystem effect**; valid → typed payload | validation gate |
| 4 | Store seeding: extraction lands `drwn/store.json` + bare repos + extracted trees under the agents dir | T3 via the archive helper |
| 5 | End-to-end: golden payload → `materializeWorkerPayload` → cards resolve, project written, **single-shot on a clean root**, result reports counts | orchestration composing 1–4 + install/write cores |
| 6 | Path portability: same payload into two different agents-dir roots → both succeed (kills the absolute-path class) | expected none — locks the invariant |
| 7 | Snapshot emission: `--emit-project-tar` contains **exactly** `drwn/config.json` + `drwn/card.lock`; a restore replica from those two files + the store tar materializes clean (the reproduced-breaker regression) | emitters |
| 8 | `--store-export` file takes precedence over inline base64; byte-identical results; inline-only still works | dual input |
| 9 | Command layer: registration, flag parsing, `--json` result shape, stderr-only diagnostics; subprocess run via `runAgentsCli` | the Clipanion command |
| 10 | Full suite ≥ baseline, 0 fail | — |

## Commands & environment

Same as I220 (worktree + submodule, bun 1.2.21 pins). Definition of green identical; the
end-to-end slices must pass **first-run on clean roots** — the campaign's single-shot
discipline is part of the acceptance, not an afterthought.

## Sequencing / handoff

Ships in a `darwinian` release → DS bumps the image pin and swaps DeployRunner to the
one-line invocation → DS deletes the inline bridge (their stated adoption). The DS
shape-review invitation on the payload contract is honored before release. R2-staging
convergence rides the `--store-export` flag with no contract change.

## Risks / non-goals

Boot-side `--restore` sugar out of scope (additive later). If a sync-pipeline seam proves
command-coupled, the fallback is a thin extraction refactor of that seam in its own
commit — flagged to the reviewer, not silently inlined.
