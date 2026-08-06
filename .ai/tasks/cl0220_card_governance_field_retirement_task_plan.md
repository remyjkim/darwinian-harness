# ABOUTME: G2 implementation plan for [I220]: publish-strict/consume-tolerant retirement of permissions and escalation, payload omission, and the declared-vs-enforced governance status section.
# ABOUTME: Four RED→GREEN slices, each independently committable; no migration machinery by design (G1 O1).

# [I220] Governance Field Retirement — Implementation Plan (GATE 2)

**Architecture:** [`cl0220_card_governance_field_retirement_target_architecture.md`](../analyses/cl0220_card_governance_field_retirement_target_architecture.md) (G1, O1 ratified there).
**Owner/Reviewer:** Remy (owner-as-reviewer in force for this row, granted 2026-08-05).

## Decisions carried in

O1 publish-strict / consume-tolerant; payload contract untouched (stop populating optional
fields); status Phase 1 statically honest (Phase 2 flips on the DS `CARD_TOOL_POLICY`
signal — not in this plan); `evals`/`contextMounts`/`identity` out of scope.

## Target contracts

1. **Type/validator** (`cli/core/card-manifest.ts`): drop `permissions`/`escalation` from
   `CardManifest` and from the blueprint-only field list (`:128`); delete their shape
   validators (`:146-157`). Consume-tolerance needs no code — the validator has no
   unknown-keys allowlist (G1 evidence).
2. **Publish rejection**: at the publish validation site only (locate the exact call site in
   `cli/core/card-store.ts`'s publish flow during slice 1 — implementation detail, not a
   design unknown), reject manifests declaring either retired field with an error naming
   the field and I220. Install/consume paths never see this check.
3. **Payload omission** (`cli/core/worker-deploy.ts`): remove the two conditional spreads
   (`:133`, `:135`). `WorkerDeployGovernance` keeps its optional members (frozen contract).
4. **Status governance section**: deployed-Worker status renders declared `tools.allow`/
   `tools.deny` rule counts from the resolved active root's manifest with the literal
   not-enforced statement (G1 §4 wording); section absent when the manifest declares no
   `tools`. Lives in the worker status render path; reads via the existing
   effective-state/lock seam — no new state.

## TDD sequence (RED → GREEN per slice, committed per slice)

| # | RED test (first, observed failing) | GREEN change |
| --- | --- | --- |
| 1 | `core-card-manifest` publish-path: manifest with `permissions` → publish fails naming I220; with `escalation` → same; clean manifest → passes | type/validator removal + publish-site rejection |
| 2 | Legacy-fixture tolerance: a card published with the old fields (fixture bytes checked in) installs + resolves + projects clean | none expected — the test locks the tolerance invariant |
| 3 | `buildWorkerDeployPayload` governance omits both fields even when a legacy manifest carries them | remove the spreads |
| 4 | Worker-status output contract: manifest with `tools.allow: [3 rules]` renders declared count + not-enforced literal; no `tools` → no section; no input renders "enforced" | the status section |
| 5 | Full suite ≥ baseline, 0 fail (baseline recorded at execution start) | — |

## Commands & environment

Worktree with `darwinian-worker-skills` submodule; `bunx bun@1.2.21 run typecheck` + `run
test --timeout 30000 ./test/`. Definition of green: typecheck 0; suite 0 fail, skips ≤
baseline; every slice's RED observed before its GREEN.

## Risks / non-goals

No store rewrite, no catalog change, no `harness.minVersion` bump (all G1-evidenced as
unnecessary). Phase-2 status flip is I107-acceptance work, not here. DS column drop is
independent.
