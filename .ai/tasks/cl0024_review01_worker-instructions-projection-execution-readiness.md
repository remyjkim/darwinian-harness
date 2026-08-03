# ABOUTME: Review 01 of CL0024's worker-instructions projection plan for execution readiness.
# ABOUTME: Records the no-go verdict, repository evidence, blocking corrections, and Review 02 acceptance gate.

# CL0024 Review 01 — Worker Instructions Projection Execution Readiness

**Status**: In Review
**Created**: 2026-07-22
**Updated**: 2026-07-22
**Scope**: GATE 2 execution-readiness review of the CL0024 implementation plan
**Artifact under review**: `.ai/tasks/cl0024_worker-instructions-projection_task_plan.md`
**Gate outcome**: **No-go — substantive revision required before execution**
**Priority**: High
**References**: [.ai/tasks/cl0024_worker-instructions-projection_task_plan.md, .ai/analyses/124_feature_canonical_instructions_projection_target_architecture.md, .ai/analyses/125_feature_canonical_instructions_projection_decision_analysis.md, .ai/analyses/126_feature_canonical_instructions_architecture_proposal.html, .ai/rules/00_docs_usage.md, cli/core/worker-generator/sync-worker.ts, cli/core/card-lock.ts, cli/core/card-project.ts, cli/core/card-source.ts, cli/core/hook-consent-ack.ts, cli/core/write-record.ts, cli/core/projection-ownership.ts, cli/core/sync.ts, cli/core/types.ts, cli/core/write-watch.ts, cli/core/ambient-capabilities.ts, cli/core/diagnostics.ts, cli/commands/write.ts, cli/commands/card/outdated.ts, cli/commands/card/source/set.ts, .github/workflows/ci.yml, package.json, docs-astro/DEPRECATED.md]

---

## Executive Summary

The plan is **not execution-ready**. The repository baseline is healthy, the relevant architecture exists, and several plan assumptions are directionally sound. However, the plan currently contains contract contradictions and dependency-order failures that would force implementers to redesign behavior while coding.

The highest-risk gaps are:

1. Instruction contribution and consent do not match the existing composer.
2. The promised single-composer/byte-identity invariant breaks for unconsented cards.
3. The proposed first-party auto-grant cannot be derived safely from `CardOrigin`.
4. Tasks 6–8 are ordered so that an earlier task depends on surfaces and pipeline wiring introduced later.
5. `--strict` and `--apply-claude-adapter` lack the required typed option plumbing.
6. Instruction consent lacks update lifecycle, status visibility, and a complete digest-ack flow.
7. Managed-block parsing, ownership hashes, drift handling, and cleanup are underspecified for a user-owned root file.
8. The authoring, doctor/status, watch, documentation, CI, and manual-smoke scopes omit required files or overstate existing coverage.

This is a **plan-quality no-go**, not an implementation-baseline failure. Existing tests and type checking were green during the review.

---

## Review Method

The review checked the plan against:

- the approved GATE 1 architecture set;
- current composer, consent, sync, ownership, cleanup, watch, diagnostics, authoring, and command code;
- test and release scripts;
- active documentation layout and CI workflow;
- dependency ordering and whether each planned commit could independently reach green;
- safety requirements for modifying user-owned `AGENTS.md` and `.claude/CLAUDE.md`;
- the repository state from which execution is supposed to branch.

The review did **not** implement the feature or modify the plan under review.

---

## Verified Baseline

| Check | Result |
|---|---|
| Full test suite: `bun test ./test/` | **1600 pass, 6 skip, 0 fail**; 6,892 expectations across 278 files |
| Focused plan-adjacent test run | **73 pass, 0 fail** across 10 selected files |
| Type check: `bunx tsc --noEmit` | **Pass** |
| Local `drwn` binary | **0.9.0** |
| Local OpenCode binary | **1.18.4** |
| Local Cursor CLI | **2026.07.09-a3815c0** |
| Reviewed branch and revision | `main` at `f3f3bc7` |
| Project Worker state | `drwn status --json --explain` found no configured cards/project; machine store initialized; 69 managed paths |

`drwn card status` failed because this checkout has no `.agents/drwn/config.json`. That is expected for the current unconfigured project state and is not, by itself, an implementation blocker.

### Readiness Scorecard

| Dimension | Outcome | Reason |
|---|---|---|
| Architectural consistency | **Fail** | Composer, consent, byte identity, provenance, and hash-domain contracts conflict |
| Dependency ordering | **Fail** | Task 6 requires Task 7 and Task 8 behavior |
| File/surface coverage | **Fail** | Command options, lifecycle, authoring core, watch, diagnostics, and active docs are incomplete |
| Safety of user-file mutation | **Fail** | Parser, malformed-state, drift, cleanup, and adapter transitions are underspecified |
| Test design | **Fail** | Happy-path-heavy helper tests and missing command/cross-machine/schema cases |
| Reproducibility | **Partial** | Commands are named, but several task steps rely on “find via grep” or copied patterns |
| Existing repository health | **Pass** | Full tests and type checking are green |
| Execution starting state | **Fail** | Required docs-PR base is unidentified and the current worktree is dirty |

---

## Blocking Findings

### R1-F01 — Instruction contribution does not match the current composer

**Severity**: High

**Evidence**

- The plan defines contribution from `manifest.instructions` or Blueprint `identity.instructions`.
- `buildInstructionsArtifact` in `cli/core/worker-generator/sync-worker.ts` also falls back to bundled skill bodies.
- With no contributing content, the current composer emits `No Worker capability instructions declared.\n`; it does not emit an empty string.

**Why this blocks execution**

The plan's `cardContributesInstructions` predicate, consent filter, digest, doctor checks, and `empty → null` behavior would disagree with the actual bytes produced by the designated single composer.

**Required correction**

Approve one explicit contract:

- bundled skill fallback is instruction contribution and is consent-gated; or
- bundled skill fallback is retired for this path.

Then define “empty composition” in terms of the chosen composer contract and use the same contribution resolver for consent, digesting, doctor, and projection.

---

### R1-F02 — The single-composer/byte-identity invariant is internally inconsistent

**Severity**: High

**Evidence**

- The plan filters cards before composing the `AGENTS.md` block.
- The existing generated artifact call in `sync-worker.ts` still composes `state.activeCards` without that filter.
- The plan requires consented composition to be byte-identical to the generated instructions artifact.

**Why this blocks execution**

When an active card contributes instructions but lacks consent, the generated artifact includes it while the projected block excludes it. Both cannot be byte-identical.

**Required correction**

Choose and document one invariant:

1. gate the common composition input so both outputs contain consented cards only; or
2. retain an unfiltered internal artifact and weaken the byte-identity claim to a clearly named consented projection artifact.

Add a test with one consented and one unconsented contributing card that compares the intended outputs exactly.

---

### R1-F03 — First-party auto-grant lacks trustworthy provenance

**Severity**: High

**Evidence**

- `CardOrigin` is `"store" | "git" | "file" | "npm"` in `cli/core/card-lock.ts`.
- `"store"` means the card resolved from the local store; it does not prove that the card was authored below the local sources root.
- The proposed `isInstructionConsentValid(entry)` signature has neither `agentsDir` nor resolved provenance.

**Why this blocks execution**

Treating all store-resolved cards as first-party would silently auto-consent third-party content after it enters the local store. The proposed predicate cannot verify the narrower authorship claim.

**Required correction**

Design explicit, stable provenance evidence before implementing auto-grant. Acceptable directions include:

- a lock field populated from verified local-source publication provenance;
- a separate explicit auto-grant marker recorded at install/publish time; or
- removing first-party auto-grant from Phase 1.

Pin the design with positive and negative provenance tests, including a third-party card present in the local store.

---

### R1-F04 — Tasks 6–8 cannot be independently green in the stated order

**Severity**: High

**Evidence**

- Task 6 asks for integration through `runAgentsCli`, which exercises the CLI pipeline.
- Pipeline invocation of `syncInstructions` is not added until Task 8.
- Task 6 also requires `"instructions"` write-record entries, but that surface is not introduced until Task 7.
- The plan claims every task is independently green and committable.

**Why this blocks execution**

Task 6 cannot satisfy its own tests without prematurely implementing later tasks or leaving a red commit. That defeats the stated red→green contract.

**Required correction**

Either:

- move the write-record surface before sync behavior, test `syncInstructions` as a pure/direct unit in the next task, then wire CLI integration; or
- combine the inseparable sync, surface, and pipeline work into one deliberately atomic task.

The preferred sequence appears under **Required Plan Revision**.

---

### R1-F05 — `--strict` is not plumbed to instruction sync

**Severity**: High

**Evidence**

- `WriteCommand.strict` in `cli/commands/write.ts` currently governs the version-floor failure path.
- `syncRepository` receives `strictHooks`, but not the command's general `strict` flag.
- `SyncOptions` and `NormalizedSyncOptions` in `cli/core/types.ts` expose `strictHooks`; they do not expose the required instruction strictness.

**Why this blocks execution**

The planned `--strict` failure for excluded instruction cards cannot reach `syncInstructions` without new typed state. The plan does not name or test this plumbing.

**Required correction**

Add the precise option/state path:

`WriteCommand` → `SyncOptions` → normalization/effective state → `syncInstructions`.

Define whether the existing `--strict` semantics are broadened or a dedicated instruction flag is preferable. Add direct command tests proving normal mode warns and strict mode exits non-zero for the same fixture.

---

### R1-F06 — `--apply-claude-adapter` also lacks sync-option plumbing

**Severity**: High

**Evidence**

- The plan names `cli/commands/write.ts` and `cli/core/sync-instructions.ts`.
- The adapter decision occurs during repository sync, which uses typed `SyncOptions`/normalized state.
- No task adds the option to `cli/core/types.ts` or threads it through preflight and `syncRepository`.

**Why this blocks execution**

The command flag cannot reliably affect the sync layer as scoped.

**Required correction**

Name every option boundary and test both direct sync invocation and the CLI command. Include watch/run-once reuse so the setting is stable across repeated syncs.

---

### R1-F07 — Instruction-consent update lifecycle is missing

**Severity**: High

**Evidence**

- `cli/core/card-project.ts` currently carries `hookConsent` across compatible updates and drops it outside the consented range.
- `findOutdatedProjectCards` and `drwn card outdated` report hook-consent re-grant requirements.
- The plan adds instruction consent to the lock and trust commands but does not update these lifecycle paths.

**Why this blocks execution**

An update could silently discard instruction consent even when the new version remains in range, or fail to warn when re-consent is required.

**Required correction**

Specify and test:

- carry-forward within `consentedRange`;
- drop plus warning outside the range;
- `card outdated` JSON and human readout;
- install/update/trust/untrust persistence;
- status/show visibility, or an explicit decision that visibility is deferred.

---

### R1-F08 — Instruction digest acknowledgement is incomplete and ambiguous

**Severity**: High

**Evidence**

- Hook consent acknowledgement is a cross-machine notice-suppression mechanism; it is consumed during write.
- The plan records an instruction digest acknowledgement during trust but does not add the corresponding write-time `has…`/`record…` lifecycle.
- The proposed digest inputs do not resolve the skill-fallback contradiction from R1-F01.

**Why this blocks execution**

A write on another machine can neither determine whether an acknowledgement already exists nor record the notice after emitting it. A digest over a different contribution definition than the composer would also be unstable or misleading.

**Required correction**

Define the acknowledgement's purpose separately from consent validity. Add:

- one canonical contribution-byte resolver;
- compute/has/record functions with a distinct key namespace;
- write-time notice-once behavior;
- content-change behavior;
- a cross-machine test in which the lock travels but local acknowledgement state does not.

---

### R1-F09 — One hash is being assigned two incompatible domains

**Severity**: High

**Evidence**

- The block header's `Content-Hash` is specified as the SHA-256 of composed instruction text.
- Write-record `fieldHashes.block` is used for ownership, drift, and safe cleanup.
- Safe ownership checks must compare the exact managed block bytes, including markers and managed header.

**Why this blocks execution**

If `fieldHashes.block` stores content-only bytes, cleanup cannot prove the full managed block is unchanged. If it stores the whole block, it no longer matches the documented `Content-Hash`.

**Required correction**

Use two explicitly named hash domains:

- header `Content-Hash` = exact composed instruction bytes;
- write-record `fieldHashes.block` = exact rendered managed block bytes, including markers and header.

Pin both with tamper tests that independently modify body, header, and markers.

---

### R1-F10 — Managed-block parsing is not safe enough for a user-owned file

**Severity**: High

**Evidence**

- Task 1 tests only a normal round trip, absent markers, and rendering.
- The proposed line-array API does not fully define newline and insertion behavior.
- `AGENTS.md` is user-owned outside the marker span.

**Missing cases**

- start marker without end marker and the inverse;
- duplicate, nested, or reversed markers;
- marker-like text inside user content;
- CRLF input;
- no final newline;
- empty file and whitespace-only file;
- exact insertion location when no block exists;
- exact preservation of all bytes outside the block.

**Why this blocks execution**

Ambiguous parsing can overwrite, relocate, normalize, or delete user content.

**Required correction**

Define a byte-preserving parser result with explicit malformed states. Malformed or ambiguous ownership must fail closed without mutation unless a separately approved recovery contract exists. Add the cases above before sharing the helper with git hygiene.

---

### R1-F11 — The authoring command omits its core mutation surface

**Severity**: High

**Evidence**

- `cli/commands/card/source/set.ts` delegates to `patchCardSourceManifest`.
- `CardSourceManifestPatch` and the actual mutation logic live in `cli/core/card-source.ts`.
- `patchCardSourceManifest` immediately calls `assertValidCardManifest`; validation does not wait until a later publish.

**Why this blocks execution**

Adding command options alone cannot modify the source manifest. The plan's validation timing is also inaccurate.

**Required correction**

Add `cli/core/card-source.ts` to the task, extend `CardSourceManifestPatch`, define replace/clear conflicts, and test command parsing plus the core patch. State that invalid paths/shapes fail during the source-set operation.

---

### R1-F12 — The documentation target is obsolete

**Severity**: High

**Evidence**

- The plan directs edits to `docs-astro`.
- `docs-astro/DEPRECATED.md` says that directory is not the source of truth and must not be edited.
- `package.json` routes documentation commands to `docs-docusaurus`.

**Why this blocks execution**

Following the plan would update abandoned documentation while leaving the published site stale.

**Required correction**

Replace all `docs-astro` targets with exact `docs-docusaurus` pages and add `bun run docs:build` to the gate. Include the relevant CLI reference, per-project instructions, consent workflow, managed-block ownership, adapter behavior, and strict-mode semantics.

---

### R1-F13 — The architecture's write-watch requirement is omitted

**Severity**: High

**Evidence**

- Architecture 124 D4 requires the projection files to participate correctly in watch behavior.
- `cli/core/write-watch.ts` watches `.agents/drwn` and linked roots.
- `.claude/` is currently excluded from overlap-trigger handling.
- The plan contains no watch implementation or tests for root `AGENTS.md` or `.claude/CLAUDE.md`.

**Why this blocks execution**

In watch mode, external edits may go undetected, or drwn's own writes may trigger a loop depending on how paths are added.

**Required correction**

Define watch semantics for both files:

- which external edits trigger re-evaluation;
- how self-writes are suppressed;
- how adapter changes are observed;
- how partial writes behave.

Add a bounded watch integration test for edit detection and no self-trigger loop.

---

### R1-F14 — Doctor, status, and ambient schemas are underspecified

**Severity**: High

**Evidence**

- `AmbientCapabilityObservation` currently models `skill | mcp`, requires a target, and describes user-home ambient sources.
- Root instruction delivery is project-scoped and target-agnostic.
- `DoctorReport` has no dedicated instruction issue structure.
- `ProjectStatusV1` is a versioned output contract.

**Why this blocks execution**

“Add findings/advisory” does not establish stable JSON, human output, severity, exit-health behavior, or backward compatibility.

**Required correction**

Design the diagnostic contract first:

- stable issue codes;
- severity and whether each issue affects doctor exit status;
- project/status JSON fields;
- human renderer wording;
- expected/actual instruction ID and hashes;
- adapter advisory representation;
- explicit decision whether this extends ambient capability taxonomy or uses a separate instruction-delivery section.

Add schema, JSON command, human command, and exit-code tests.

---

### R1-F15 — Claude adapter lifecycle has unresolved transitions

**Severity**: High

**Evidence**

- The plan treats any foreign `.claude/CLAUDE.md` as a warning.
- A foreign file that already contains `@../AGENTS.md` may already satisfy delivery.
- The plan does not define what happens when a previously drwn-owned one-line adapter is later edited by the user.
- Managed-content and managed-fields cleanup rules differ.

**Why this blocks execution**

Without exact branches, sync or cleanup can overwrite user additions, warn unnecessarily, or retain an invalid ownership claim.

**Required correction**

Specify a transition table covering:

- absent file;
- exact drwn-owned adapter;
- foreign file without import;
- foreign file with valid import;
- formerly owned adapter with user edits;
- `--force`;
- projection removal.

For every state, define mutation, warning, ownership record, and cleanup behavior.

---

### R1-F16 — Desired-state drift and cleanup responsibilities are incomplete

**Severity**: High

**Evidence**

- `cleanupRemovedManagedPaths` currently special-cases existing managed-field shapes, not the proposed instruction block.
- Task 8 adds a removal branch, while Task 6 also assigns drift detection to `syncInstructions`.
- A managed-fields entry and managed-content adapter can share one surface but require different verification.

**Why this blocks execution**

It is unclear which layer verifies desired-block drift versus removed-path cleanup and how the two avoid inconsistent hashes or duplicate warnings.

**Required correction**

Define two separate flows:

1. desired instruction projection: verify previous ownership, compare exact block hash, then preserve/fail/heal;
2. no-longer-desired projection: cleanup only when the previously owned exact bytes remain.

Pin same-path replacement, removed Worker, empty composition, partial write, and `--force` cases.

---

### R1-F17 — The CI coverage claim is false

**Severity**: Medium

**Evidence**

- The plan says the CLI CI matrix runs Validate and Command bridge across Ubuntu, Windows, and macOS.
- `.github/workflows/ci.yml` runs Validate on Ubuntu and Windows.
- The full suite runs on Linux; Windows runs a smaller smoke set.
- macOS appears in the Command bridge matrix, not the general Validate matrix.

**Why this matters**

The plan overstates platform coverage for newline-sensitive root-file mutation and mtime behavior.

**Required correction**

Describe the existing matrix accurately. Decide explicitly whether managed-block and adapter coverage needs an additional macOS or Windows lane, and name any workflow change.

---

### R1-F18 — Release and documentation gates are conflated

**Severity**: Medium

**Evidence**

- `verify:release` runs broad release checks, including tests and type checking outside test mode.
- The active Docusaurus build is a separate `docs:build` script.
- The plan implies documentation presence automatically rides the existing suite.

**Why this matters**

Documentation can compile or link incorrectly while the claimed release gate remains green.

**Required correction**

List `bun run docs:build` separately. If link validation is required, name the exact existing or new check rather than assuming `verify:release` covers it.

---

### R1-F19 — Manual smoke commands do not prove the stated properties

**Severity**: Medium

**Evidence**

- The plan requires byte and mtime idempotence but uses `shasum`, which proves bytes only.
- `opencode debug config` proves configuration bootstrapping, not necessarily that the projected instructions reached a live context.
- Architecture residuals V1–V3 require live-session validation.

**Why this matters**

The smoke gate could report success without proving mtime stability or actual instruction ingestion.

**Required correction**

Add a portable `stat`/test helper for mtime and byte checks. For supported tools, use a live run/context probe that can demonstrate instruction presence. Mark V1–V3 explicitly as scheduled manual gates until operator evidence is recorded; do not describe them as completed by config inspection.

---

### R1-F20 — The task granularity is not execution-ready

**Severity**: High

**Evidence**

- Only Task 1 supplies a complete test and implementation sketch.
- Later tasks repeatedly say “find via grep,” “mirror,” “copy pattern,” or “TDD as Task 1.”
- Several tasks combine schema design, command parsing, persistence, sync behavior, cleanup, diagnostics, and end-to-end tests.

**Why this blocks execution**

The implementer must discover files, invent API boundaries, and resolve architecture while executing. That contradicts the plan's claim of exact, ordered, independently green steps.

**Required correction**

Split tasks at stable interfaces. For each task, provide:

- exact files and symbols;
- input/output contract;
- first failing test;
- exact focused command;
- green acceptance condition;
- dependency on prior tasks;
- commit boundary.

---

### R1-F21 — The branching prerequisite cannot currently be followed

**Severity**: High

**Evidence**

- The plan says implementation branches from the docs-PR branch after GATE 1 approval.
- No such base branch was visible locally or on the inspected remote.
- The review occurred on dirty `main` at `f3f3bc7`.
- The plan and architecture artifacts were untracked, alongside unrelated modified/untracked files.

**Why this blocks execution**

Starting implementation now risks branching from the wrong architecture revision or mixing unrelated work into the feature branch.

**Required correction**

Identify the exact base branch/commit, ensure the approved architecture and revised plan are committed there, and execute in a clean worktree. Do not discard or overwrite the current unrelated changes.

---

### R1-F22 — Document lifecycle metadata and repository conventions are incomplete

**Severity**: Low

**Evidence**

- The plan does not begin with the repository-required two-line `# ABOUTME:` header.
- It lacks standard `Status`, created/updated dates, and a consolidated `References` field.
- The GATE 2 state is described narratively but not represented as a maintained document status.

**Why this matters**

The plan's approval state and source-of-truth relationships are harder to track during revision and implementation.

**Required correction**

Add the standard metadata, mark the current plan `Blocked` until Review 02 passes, and link this review plus the approved GATE 1 artifacts in `References`.

---

## Confirmed Plan Assumptions

The review also verified two important assumptions so the revision does not reopen settled behavior unnecessarily.

### Partial ownership selection is already compatible

`isProjectionOwnershipSelected` in `cli/core/projection-ownership.ts` falls through for target-agnostic instruction ownership. On a full write it is selected; under `--mcp-only`, `--skills-only`, or target-scoped writes it is retained rather than cleaned. No implementation change appears necessary, but a regression test is still required.

### Machine scope rejects an instruction surface once it exists

The write-record machine-scope refinement permits only the existing machine-capability surfaces. Adding a project-scoped, target-agnostic `"instructions"` surface should therefore be rejected at machine scope by the current refinement. Add positive and negative schema tests rather than adding a redundant new refinement.

---

## Required Plan Revision

The next plan should use this dependency order.

| Order | Deliverable | Required exit |
|---|---|---|
| 0 | Resolve architecture deltas | Approved contracts for skill fallback, consented byte identity, first-party provenance, dual hash domains, and diagnostics schema |
| 1 | Managed-block helper | Malformed-marker, newline, insertion, collision, and byte-preservation tests green |
| 2 | Lock field and update lifecycle | Validation, round trip, carry/drop, outdated readout, and persistence green |
| 3 | Consent predicate and digest acknowledgement | Canonical contribution resolver, provenance tests, notice-once, and cross-machine behavior green |
| 4 | Trust/untrust command surface | Hooks/instructions flag combinations, ranges, atomic persistence, and output green |
| 5 | Write-record surface | Project validity, target rejection, machine rejection, and partial-ownership retention green |
| 6 | Composer API and pure instruction sync | Direct tests for filtering, exact bytes, block rendering, drift, idempotence, and warnings green |
| 7 | Pipeline and option plumbing | `strict`, adapter option, cleanup, partial writes, watch/run-once state, and CLI integration green |
| 8 | Adapter lifecycle | Full transition table, ownership changes, force, and cleanup green |
| 9 | Authoring command and core patch | Command and `CardSourceManifestPatch` tests green |
| 10 | Doctor/status contract | Stable JSON schema, issue codes, human output, and exit behavior green |
| 11 | Active documentation | Exact Docusaurus pages updated; `bun run docs:build` green |
| 12 | End-to-end and release verification | Focused tests, full suite, type check, docs build, release gate, binary smoke, and manual live-session evidence green |

If strict commit-by-commit green is mandatory, do not place a CLI-spawned test before pipeline wiring exists. Test the pure boundary first, then add the command integration at the wiring step.

---

## Review 02 Acceptance Gate

The revised plan is execution-ready only when all of the following are true.

### Architecture and behavior

- [ ] One canonical definition of instruction contribution covers manifest text, Blueprint identity, and the disposition of bundled skill fallback.
- [ ] Consent, digest acknowledgement, doctor, generated artifact, and projected block use that same resolver.
- [ ] The byte-identity invariant is internally achievable and tested with an unconsented contributor.
- [ ] First-party auto-grant has explicit trustworthy provenance or is removed from Phase 1.
- [ ] Content hash and managed-block ownership hash have separate, exact domains.
- [ ] Strict-mode behavior and adapter opt-in semantics are defined end to end.

### Safety and lifecycle

- [ ] Malformed or ambiguous markers fail closed without changing user bytes.
- [ ] Bytes outside the managed block are preserved exactly, including newline style and final-newline state.
- [ ] Desired-state drift and removed-state cleanup have separate, exact rules.
- [ ] Consent survives compatible updates and is dropped with visible guidance outside its range.
- [ ] Adapter transitions cover absent, owned, foreign-with-import, foreign-without-import, edited-owned, forced, and removed states.
- [ ] Watch behavior detects relevant external edits without self-trigger loops.

### Plan completeness

- [ ] Every command flag is threaded through exact typed option/state boundaries.
- [ ] Every task names exact files, symbols, tests, commands, dependencies, and commit exit.
- [ ] Task order permits every claimed commit to be green.
- [ ] Authoring includes `cli/core/card-source.ts`.
- [ ] Doctor/status includes stable JSON and human-output contracts.
- [ ] Documentation targets `docs-docusaurus`, not `docs-astro`.
- [ ] CI claims match `.github/workflows/ci.yml`.
- [ ] Manual probes prove bytes, mtime, and live instruction ingestion separately.

### Execution prerequisites

- [ ] The GATE 1 architecture and revised GATE 2 plan are committed on an identified base branch/revision.
- [ ] The implementation starts in a clean branch/worktree without disturbing current unrelated changes.
- [ ] The revised plan carries standard ABOUTME, status, dates, and references metadata.

---

## Verification Commands for the Revised Plan

The final task should run and record, at minimum:

```bash
bun test ./test/core-managed-block.test.ts
bun test ./test/core-instruction-consent.test.ts
bun test ./test/core-write-record-v1.test.ts
bun test ./test/commands-write-partial-ownership.test.ts
bun test ./test/commands-write-instructions.test.ts
bun test ./test/core-instructions-drift.test.ts
bun test ./test/
bunx tsc --noEmit
bun run docs:build
bun run verify:release
```

The focused list may grow when the revised plan names existing lifecycle, source-set, status, doctor, and watch test files. The plan should record the exact added commands rather than substituting “find via grep.”

---

## Repository-State Note

At review time, the worktree already contained unrelated changes and untracked artifacts. This review adds only the present review document. It does not authorize cleaning, resetting, committing, or otherwise modifying those existing changes.

---

## Final Verdict

**GATE 2 does not pass Review 01.**

The plan has a strong architectural direction and a green repository baseline, but execution should not begin until the blocking contracts are decided and the task sequence is rewritten around actual code boundaries. Review 02 should evaluate the revised plan against the checklist above; it should not require implementers to resolve any remaining architecture question during coding.
