<!-- ABOUTME: Defines the executable RED-to-GREEN plan for I307's migration-enablement work. -->
<!-- ABOUTME: Holds all source implementation until the architecture passes G1 and this plan passes G2. -->

# I307 — Runtime-Admission Migration Enablement Implementation Plan

> **Required execution skills:** use `executing-plans`, `test-driven-development`, `incremental-commits`, `requesting-code-review`, and `verification-before-completion`. Every behavior change starts with a focused failing test. Obtain requirements review before code-quality/security review.

**Goal:** Deliver a reviewed Worker source PR in which a runtime-admission declaration that requires nothing of the runtime no longer partitions its closure across the version boundary; declarations can be derived and their absence can be detected; the MCP authoring path cannot silently un-deploy a migrated Card; and the set of Cards actually requiring migration is known from a reproducible inventory of deployed closures.

**Architecture:** [`cl0307_runtime_admission_migration_enablement_target_architecture.md`](../analyses/cl0307_runtime_admission_migration_enablement_target_architecture.md). Change one predicate in the version-floor computation, add one pure derivation function and one deployability predicate, and co-write the declaration entry in the existing MCP authoring path. The admission gate itself is untouched.

**Tech Stack:** TypeScript, Bun 1.3.11, existing Card manifest/lock/deploy/materialize contracts. Inventory uses read-only Cloudflare D1 and R2 reads against `darwinian-services` infrastructure.

---

## 1. Frozen inputs and execution gate

- Repository: `remyjkim/darwinian-worker`.
- Branch: `feat/i307-runtime-admission-migration-enablement`.
- Worktree: `/Users/pureicis/dev/darwinian-minds-worktrees/i307-runtime-admission-migration-enablement`.
- Frozen base: `da33f22dc7b997d97178ae3dc1fe7263dd0d0b5f`.
- Tracked submodule `darwinian-worker-skills` at gitlink `e01dc06f2bac4594ddc6539fea47937d415972b8` must be initialized recursively in the worktree before any suite run. **Hazard:** this gitlink survives only as the tip of an unmerged branch and is marked shallow. Do not delete that branch; verify the submodule resolves before relying on a baseline.
- Baseline to record before the first RED test, at the frozen base, from the worktree: `bun run test:gate` (pass/skip/fail and file count) and `bun run typecheck`. **A number without its command is not a baseline.**

No source task begins until the architecture passes G1 and this plan passes G2. Gate order remains G1 then G2 even if they share one review ref.

## 2. Sequencing

T1 → T2 → T3 are strictly ordered: T2's regression guards must exist and pass *before* T3 changes the predicate they guard. T4–T6 are independent of T2/T3 and may proceed in parallel. T7 is independent of all source work and may start immediately after G2.

| Task | Kind | Depends on |
|---|---|---|
| T1 Baseline capture | evidence | — |
| T2 Floor regression guards (RED, must stay green) | test | T1 |
| T3 Content-aware floor predicate | code | T2 |
| T4 Declaration derivation | code | T1 |
| T5 Deployability check | code | T1 |
| T6 MCP authoring co-write | code | T1 |
| T7 Deployment closure inventory | ops | — |
| T8 Registry sweep evidence | evidence | T4 |
| T9 Completion document | docs | all |

---

## 3. Tasks

### T1 — Capture the baseline

Record, at the frozen base and from the worktree, the exact command and value for the full gate suite and the typecheck. Record the envelope identities emitted by the existing runtime-admission fixtures so T3's hash-invariance claim has a before-image.

**Done when:** the command/value pairs are written into the completion document's evidence section, each naming the head they were measured at.

### T2 — Write the floor regression guards first

These are written *before* T3 and must remain green through it. They are the control that discriminates a correct relaxation from an over-permissive one.

RED (expected to pass at the frozen base, and to keep passing after T3):

- A closure carrying a non-empty `runtimeAdmission.requirements` floors at `1.3.0`.
- A closure carrying a non-empty `applicationRequirements.apps` floors at `1.3.0`.
- A partially declared closure is rejected by `deriveRuntimeAdmissionForClosure` with `WORKER_RUNTIME_ADMISSION_INVALID`.
- A closure with no declarations at all is rejected with the same code.

**Done when:** all four pass at the frozen base with no production change.

### T3 — Make the floor predicate content-aware

Change `minimumDrwnVersionForManifests` in `cli/core/mind-capability.ts` so the runtime-admission floor is raised only when a declaration carries enforceable content — `runtimeAdmission.requirements` non-empty or `applicationRequirements.apps` non-empty — rather than on mere presence.

RED first:

- A closure whose declarations carry no enforceable content produces a lock that validates under **both** the current runtime and the previous one. Cross-version assertion is in-process, importing the previous runtime's `card-lock` module alongside the current one.
- The same closure's lock, written by the previous runtime, validates under the current one.

Then GREEN, then:

- Re-express the two assertions at `test/core-card-lock.test.ts:315,328` as content-bearing cases. **Re-express, do not delete** — the positive control must survive.
- Assert envelope identities are byte-identical to T1's before-image.
- Confirm every existing runtime-admission fixture passes unmodified.

**Done when:** T2's four guards are still green, the cross-version round-trip passes in both directions, and no envelope identity has moved.

### T4 — Declaration derivation

Add a pure function that reads a Card manifest and returns either derived declarations or a typed refusal.

RED first, one test per case in the catalog (§4). Contractual properties needing their own tests:

- **Never overwrites.** A manifest already carrying hand-authored `requirements` survives a re-run unchanged. The naive implementation of this transform clobbers them; this test must fail against that implementation.
- **Idempotent.** Re-running yields byte-identical output.
- **Refuses with detail.** The refusal names the offending servers.

Wire it to a Card-source operation using the existing manifest-write path, so derivation writes through the same seam the MCP authoring path uses.

**Done when:** every case in §4 passes and the sweep in T8 is clean.

### T5 — Deployability check

Add a predicate answering whether a Card is deployable under the current contract: both declarations present, individually valid, and consistent with the Card's raw servers.

RED first:

- A Card with **no** declarations fails. This is the case existing validation passes, and it is the whole point of the task.
- A Card with malformed declarations fails, distinguishably from the absent case.
- A fully derived Card passes.

**Done when:** the absent and invalid cases produce different, actionable results.

### T6 — MCP authoring co-write

Change `addCardSourceMcp` in `cli/core/card-source.ts` so adding a server to a Card that already carries a declaration also writes the matching `runtimeAdmission.servers` entry.

RED first:

- Reproduce the current silent breakage: derive declarations for a Card, add a server, observe `runtimeAdmission.servers must exactly match raw servers ownership`.
- After the fix, the same sequence leaves the Card deployable per T5.
- A Card with no declarations is left unchanged — the command must not begin declaring on a user's behalf.
- Adding a hosted server to a declared Card refuses rather than writing an invalid declaration.

**Done when:** the reproduction test flips from red to green and the undeclared-Card case is unchanged.

### T7 — Deployment closure inventory

Read-only, against `darwinian-services` infrastructure. Independent of all source work.

1. Enumerate deployments per environment with root Card ref, snapshot key, status, and member count. **Name the environment explicitly on every command** — the default and production environments resolve to the same physical database.
2. Enumerate closure members from `deployment_members`.
3. Identify deployments with a snapshot but no member rows.
4. For those, fetch `<snapshot_key>/project.tar` and read `drwn/card.lock`. Verify the archive layout with a listing before extracting.
5. Derive the deployed-Card set and cross-reference it against the Card source registry.
6. Report the count of deployments whose closure could not be resolved, with the reason for each. **Zero is not assumed.**

**Constraints:** read-only. No mutation, deployment, migration, rotation, or write of any kind. No secret value is printed or committed.

**Done when:** a document under `.ai/analyses/` records the exact commands, environments, counts, unresolved rows with reasons, and the derived deployed-Card set — such that a reviewer re-running the commands reproduces the counts.

### T8 — Registry sweep evidence

Run T4's derivation across every Card in the source registry, re-validate each output with the shipped validator, and record the classification: mechanically derived, refused with reason, already declared.

**Done when:** every output validates or is refused with a stated reason, and the counts are recorded with the command that produced them.

### T9 — Completion document

Write `.ai/tasks/cl0307_runtime_admission_migration_enablement_completion.md` per §8.

---

## 4. Case catalog

### Floor and lock

| # | Case | Expected |
|---|---|---|
| F1 | No declarations anywhere | Floor unchanged from the rest of the graph |
| F2 | Empty-intent declarations only | Floor unchanged; lock readable by both runtimes |
| F3 | Declared servers, empty requirements and apps | Floor unchanged; lock readable by both runtimes |
| F4 | Non-empty `requirements` | Floor `1.3.0` |
| F5 | Non-empty `apps` | Floor `1.3.0` |
| F6 | Mixed: one Card F4, others F2 | Floor `1.3.0` |
| F7 | Lock written by previous runtime, read by current | Accepted for F1–F3; rejected for F4–F6 |
| F8 | Lock floor tampered to a wrong value | Rejected, message names the required value |

### Admission gate (must not move)

| # | Case | Expected |
|---|---|---|
| A1 | All Cards declare | Accepted; envelope derived |
| A2 | One Card omits both | `WORKER_RUNTIME_ADMISSION_INVALID` |
| A3 | One Card omits one of the two | `WORKER_RUNTIME_ADMISSION_INVALID` |
| A4 | A declaration is `null` | Rejected |
| A5 | Unknown declaration version | Rejected |
| A6 | Envelope identities across A1 | Byte-identical to the T1 before-image |

### Derivation

| # | Case | Expected |
|---|---|---|
| D1 | No servers | Empty intent for both blocks; validates |
| D2 | One local server | One declared entry, `authMode: "none"`, empty `requirementIds`; validates |
| D3 | Several local servers | One entry each; key set matches raw servers exactly |
| D4 | Any hosted server | Refused, naming the server |
| D5 | Mixed local and hosted | Refused, naming only the hosted ones |
| D6 | Server without a `command` | Refused as needing authoring, distinct from D4 |
| D7 | Already fully declared | Returned unchanged |
| D8 | Hand-authored requirements present | **Preserved**, not overwritten |
| D9 | Re-run of D2 output | Byte-identical |

### Deployability check

| # | Case | Expected |
|---|---|---|
| P1 | No declarations | **Fails** — the gap this task closes |
| P2 | One of two present | Fails |
| P3 | Declared servers disagree with raw servers | Fails, naming the mismatch |
| P4 | Fully derived Card | Passes |
| P5 | Absent vs invalid | Distinguishable results |

### Authoring path

| # | Case | Expected |
|---|---|---|
| M1 | Add a local server to a declared Card | Declaration co-written; Card still passes P4 |
| M2 | Add a server to an undeclared Card | Card unchanged; no declaration invented |
| M3 | Add a hosted server to a declared Card | Refused; no invalid declaration written |
| M4 | Regression reproduction of today's behavior | Red before T6, green after |

---

## 5. Commands

From the worktree root:

```bash
bun run typecheck
bun run test:gate                       # full suite; record pass/skip/fail and file count
bun test ./test/core-mind-capability.test.ts
bun test ./test/core-card-lock.test.ts
bun test ./test/core-runtime-admission-manifest.test.ts
bun test ./test/core-worker-deploy.test.ts
bun test ./test/core-worker-materialize.test.ts
```

Assert on counts, never on exit codes — a filter matching nothing exits zero.

## 6. CI jobs

The existing validation workflow must stay green with **no new skips**. Baseline and post-change pass/skip/fail counts are compared at named heads, and any delta is explained in the completion document. No new CI job is introduced by this issue.

## 7. Non-goals

No Card republication or retagging. No image pin move. No deployment, re-materialization, or rollback. No production mutation. No credential provisioning. No widening of transport, auth, or probes — that is I171's. No resolution of the three blocked Cards. No release, tag, or candidate. No CI gate installed into Card repositories; that follows once T5 exists to make such a gate meaningful.

## 8. Definition of green, and what it does not cover

Green proves: the floor relaxes only for content-free declarations; the strict cases and the half-migration rejection still hold; no envelope identity moves; derivation is correct, idempotent, and non-destructive; absence of declarations is detectable; and the authoring path no longer regresses migrated Cards.

Green does **not** prove that any Card has been migrated, that any deployment has been redeployed, or that a real container starts and serves. Those belong to downstream issues, and the completion document must say so plainly rather than implying CI covered them.

## 9. Residual risk

- The floor change alters published `1.3.0` semantics. It moves no frozen identity, but adjacent lanes should agree before it lands. This is the substantive G1 question, not a G3 detail.
- The inventory may find deployments whose closure is unrecoverable. That count is a deliverable, not a failure.
- Editing the admission module moves the attested implementation rollup by design. Regeneration is a deliberate, reviewed step; treat an unexplained rollup change as a stop.
- Over-permission is the dangerous regression direction. Every relaxation test is paired with a strict positive control for exactly this reason.

## 10. Stop conditions

Stop, record the reason, and escalate before proceeding if: the architecture has not passed G1 or this plan has not passed G2; the change would widen transport, auth, or probes; a test would require network, credentials, publication, migration, deployment, or a lease; the submodule gitlink cannot be resolved so no honest baseline exists; an envelope identity moves; the attested implementation rollup changes without a reviewed regeneration; the inventory would require any write; or the work would cross into I266, I267, I268, or I171 ownership.
