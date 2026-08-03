# ABOUTME: Review 02 of CL0024's Worker-instructions projection plan after the 2026-07-23 remediation.
# ABOUTME: Records the plan-quality go, exact Review 01 dispositions, and remaining execution prerequisites without claiming implementation.

# CL0024 Review 02 — Worker Instructions Projection Execution Readiness

**Status:** Complete
**Created:** 2026-07-23
**Scope:** GATE 2 plan-quality review
**Artifact:** `.ai/tasks/cl0024_worker-instructions-projection_task_plan.md`
**Program:** `ARCH-PROV-REM-2026-07-23`
**Reviewed evidence base:** `darwinian-minds@346f560d8825dfa709499f998b39e733239fca94`
**Outcome:** **Go for plan handoff; product execution remains gated**

## Verdict

The revised plan is handoff-ready and satisfies the Review 01 correction contract. It
does not require an implementer to choose instruction semantics, consent provenance,
hash domains, user-file recovery rules, adapter transitions, option plumbing,
diagnostic schema, documentation root, or task ordering while coding.

This verdict is not an implementation receipt. Execution begins only after the owner
confirms the current base/status and the immutable `OrgWorkerBundleV1` producer packet
exists. The owner explicitly directed this remediation and subsequent implementation
to use the current checkout without a separate worktree or interim commit; that
direction supersedes Review 01's generic worktree prerequisite while preserving its
requirements to record dirty-state ownership and avoid unrelated files.

## Review 01 disposition matrix

| Finding | Disposition in revised plan |
|---|---|
| R1-F01 contribution mismatch | explicit manifest text/path only; bundled-skill fallback retired |
| R1-F02 byte-identity contradiction | one consent-filtered composer feeds Worker artifact and projected body |
| R1-F03 unsafe first-party inference | no first-party auto-grant; every origin requires explicit consent |
| R1-F04 task dependency order | write-record precedes pure sync; pipeline integration follows both |
| R1-F05 strict plumbing | exact `WriteCommand -> SyncOptions -> effective state -> sync` path |
| R1-F06 adapter plumbing | same typed path, including watch run-once reuse |
| R1-F07 consent update lifecycle | compatible carry; version/content invalidation; outdated/status guidance |
| R1-F08 digest acknowledgement | one resolver; distinct compute/has/record namespace; cross-machine test |
| R1-F09 hash collision | content digest and exact managed-block ownership hash are domain-separated |
| R1-F10 user-file safety | byte-preserving parser; malformed/duplicate/nested/reversed markers fail closed |
| R1-F11 authoring core | `cli/core/card-source.ts` and `CardSourceManifestPatch` are explicit targets |
| R1-F12 obsolete docs | active `docs-docusaurus/`; `docs-astro/` forbidden |
| R1-F13 watch omission | external edit detection, self-write suppression, bounded loop test |
| R1-F14 doctor/status ambiguity | additive `instructionDelivery` schema, stable codes/severity/output |
| R1-F15 adapter transitions | full absent/owned/foreign-valid/foreign-missing/edited/force/removal table |
| R1-F16 drift/cleanup ambiguity | desired-state replace and no-longer-desired cleanup are separate flows |
| R1-F17 false CI matrix | Task 0 records actual jobs; no unverified OS claim |
| R1-F18 docs/release conflation | `bun run docs:build` is a separate mandatory gate |
| R1-F19 weak manual smoke | bytes plus `mtimeNs`; live ingestion distinct from config parsing |
| R1-F20 coarse tasks | thirteen ordered tasks with files, contracts, RED/GREEN, and focused commands |
| R1-F21 unavailable branch | explicit owner override recorded; exact base/status still required |
| R1-F22 metadata | two ABOUTME lines, status, dates, evidence base, references, and evidence log |

## Review 02 acceptance checklist

### Architecture and behavior

- [x] One explicit contribution resolver.
- [x] Consent, digest, composition, acknowledgement, doctor, and bundle ingestion share it.
- [x] Mixed-consent byte identity is achievable and directly tested.
- [x] Implicit/first-party consent removed.
- [x] Content and ownership hash domains separated.
- [x] Strict and adapter option paths named end to end.

### Safety and lifecycle

- [x] Ambiguous markers fail closed.
- [x] User bytes/newline/final-newline preservation specified.
- [x] Desired-state drift and removal cleanup separated.
- [x] Consent update lifecycle specified.
- [x] Adapter transition table complete.
- [x] Watch edit detection and loop suppression specified.

### Plan completeness

- [x] Exact known files/symbols/tests/commands named; Task 0 must record any existing
      suite filename that differs before its RED.
- [x] Task order permits green boundaries.
- [x] Authoring core mutation path included.
- [x] Stable doctor/status contract included.
- [x] Active docs root and separate docs build included.
- [x] CI/manual evidence claims bounded to what commands prove.
- [x] `OrgWorkerBundleV1` boundary aligned with the organization provisioning plan.

### Execution prerequisites

- [ ] Owner confirms exact implementation revision and dirty-state ownership.
- [ ] `OrgWorkerBundleV1` package/fixtures have immutable identity and producer tests.
- [ ] Baseline full suite/typecheck is green or any failure is diagnosed.
- [ ] Required live binaries/sessions are available for gates claimed as run.

## Gate semantics

`Plan-ready — Review 02 go` means implementation may be scheduled and handed off. It
does not mean the unchecked execution prerequisites are satisfied, that any product
test has passed, or that release/deployment authority exists.
