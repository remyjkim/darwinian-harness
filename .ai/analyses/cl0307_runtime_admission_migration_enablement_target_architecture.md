<!-- ABOUTME: Freezes I307's contract for making the 1.3.0 runtime-admission migration possible without a fleet-wide cutover. -->
<!-- ABOUTME: Owns closure inventory, content-aware version floor, and declaration tooling; owns no Card republication or pin move. -->

# I307 — Runtime-Admission Migration Enablement Target Architecture

**Date:** 2026-08-17
**Author:** I307 Owner
**Status:** Draft for G1 review
**Issue:** [I307](https://app.notion.com/p/3bff1fbef8c28152926ffe367b94ffe6), sequenced ahead of I266/I267, under the I264 umbrella
**Repository:** `remyjkim/darwinian-worker`
**Frozen base:** `da33f22dc7b997d97178ae3dc1fe7263dd0d0b5f`
**Branch:** `feat/i307-runtime-admission-migration-enablement`
**Worktree:** `/Users/pureicis/dev/darwinian-minds-worktrees/i307-runtime-admission-migration-enablement`
**References:** I265 (merged Worker 1.3 source, `cef3090c`), I264 (umbrella), I266 (Services verifier), I267 (release and image adoption), I268 (Finch closure), I261 (Harari Card contract), I281 (staging restore outage), I171 (owns HTTP/SSE and bearer/OAuth declaration semantics).

---

## Executive summary

`drwn@1.3.0` requires every Card in a deployable closure to declare both `runtimeAdmission` and `applicationRequirements`. No Card in the organization declares either, so the published runtime can deploy nothing the organization currently owns.

The blocker is not the missing declarations. It is that **adding them is currently impossible to sequence.** The rule that computes a closure's minimum `drwn` version raises the floor on the mere *presence* of a declaration, and the lock reader demands exact equality on that floor. The consequence is that once any Card in a closure declares, no lock file exists that both the previous and current runtime accept — so Card migration and the runtime image pin can only move together, atomically, across every environment at once.

I307 removes that coupling and produces the data needed to scope the migration. It makes the version floor reflect what a declaration *requires* rather than that it exists, ships the tooling to derive declarations and to answer whether a Card is deployable, closes an authoring path that silently un-deploys migrated Cards, and inventories the closures actually deployed.

I307 republishes no Card, moves no image pin, redeploys no worker, and does not widen the admission schema.

---

## SCQA

### Situation

I265 merged the Worker 1.3 runtime-admission contract and I267 published `darwinian@1.3.0`. Adoption work (I266, I267) is in flight. Production runs a materially older runtime than `main` pins, and the staging estate is already failing to restore for a separate, diagnosed reason tracked as I281.

### Complication

The contract is an all-or-nothing hard cut with no compatibility reader and no relaxing mode, and the estate is at zero percent compliance. Worse, the obvious remedy — start adding declarations — is itself destructive: the first declaration added to any shared Card partitions that closure across the runtime boundary, and the two runtimes fail at *different* points. The new runtime fails at deploy; the old runtime fails at **restore**, the silent path that keeps already-deployed workers alive. Rolling the pin backward therefore worsens the failure rather than avoiding it.

A second complication is informational: the migration's scope was believed unknowable, on the grounds that the deploy payload is discarded. That belief is wrong, and it has been suppressing the one cheap action that would size every remaining decision.

### Question

What is the smallest set of changes that makes the runtime-admission migration safe to perform incrementally, and what must be known before it starts?

### Answer

Three things, in this order of dependency:

1. **Know the scope.** Recover the full Card closure of every deployment from the two places it is already persisted, and derive the set of Cards that genuinely require migration.
2. **Break the coupling.** Make the version floor content-aware, so a declaration that requires nothing of the runtime stops behaving as though it requires 1.3.0. Migration then decouples from the image pin, and each Card can move on its own.
3. **Make it mechanical and gated.** Ship derivation, a deployability check that actually fails an unmigrated Card, and a fix for the authoring path that silently breaks migrated Cards.

---

## 1. Evidence-backed current state

Every statement in this section was produced by executing the shipped code at the frozen base, not by reading documentation.

### 1.1 Where the hard cut is enforced

`deriveRuntimeAdmissionForClosure` rejects any closure containing a Card missing either declaration:

- `cli/core/runtime-admission-manifest.ts:536-542` — presence check, then declaration validation; both raise `DrwnError("WORKER_RUNTIME_ADMISSION_INVALID", …)`.
- The loop covers every Card in the closure, root and members alike.
- There is no conditional guard above the call, and no admission-mode read anywhere in `cli/`. The I265 plan forbade one explicitly.

It is reached from exactly two entry points:

- `cli/core/worker-deploy.ts:321` — before `buildStoreExport`, so a rejected closure never produces an archive.
- `cli/core/worker-materialize.ts:236` — before the first `mkdir`, so a rejected payload never creates a directory.

**This is the boundary that scopes the whole problem.** Local project commands — `install`, `apply`, `write`, `update`, `add` — do not import the admission modules at all. Cards used only in local development therefore never need declarations. Only Cards that appear in a *deployed* closure do.

Confirmed behavior at the frozen base:

| Closure | Result |
|---|---|
| All Cards declare | Accepted; envelope derived |
| One declares, one does not | `WORKER_RUNTIME_ADMISSION_INVALID: cards[1] declaration coverage is incomplete` |
| No Card declares | `WORKER_RUNTIME_ADMISSION_INVALID: cards[0] declaration coverage is incomplete` |

### 1.2 The version-floor coupling

`cli/core/mind-capability.ts:20-27` raises the floor to `RUNTIME_ADMISSION_MIN_DRWN_VERSION` when *either* declaration is merely present:

```ts
if (
  (manifest.runtimeAdmission !== undefined || manifest.applicationRequirements !== undefined)
  && compareVersions(RUNTIME_ADMISSION_MIN_DRWN_VERSION, minimum) > 0
) {
  minimum = RUNTIME_ADMISSION_MIN_DRWN_VERSION;
}
```

The condition tests existence, not content. `cli/core/card-lock.ts:197-200` then recomputes the floor from the manifests embedded in the lock and requires exact equality:

```ts
const requiredVersion = minimumDrwnVersionForManifests(cards.map((card) => card.manifest));
if (input.store.minDrwnVersion !== requiredVersion) {
  invalidLock(source, `store.minDrwnVersion must be ${requiredVersion} for this Worker graph`);
}
```

Measured against this repository's real `card.lock`, with one Card given empty-intent declarations:

| Lock written by | Records floor | Read by 1.3.0 | Read by 1.2.0 |
|---|---|---|---|
| `drwn 1.3.0` | `1.3.0` | accepted | rejected — `must be 0.9.0 for this Worker graph` |
| `drwn 1.2.0` | `0.9.0` | rejected — `must be 1.3.0 for this Worker graph` | accepted |

**No mutually acceptable lock exists.** The partition is symmetric and applies equally to a fully migrated closure, because one declaring Card is sufficient to move the floor. Finishing the migration buys no safety; only moving the runtime in lockstep does.

The older runtime accepts a declaring manifest without complaint — `validateCardManifest` at 1.2.0 returns `ok` on a Card carrying both declarations, because top-level unknown keys are not rejected. The break is located entirely in the floor, not in manifest parsing.

### 1.3 Estate compliance census

Across the `@darwinian` source registry and the `@curation-labs` Card repositories, **no Card declares either field.** Applying a mechanical derivation across the source registry:

| Class | Count | Disposition |
|---|---|---|
| No servers | 17 | Empty-intent declaration; fully mechanical |
| Local (`stdio`) servers only | 5 | Declaration derived from the server list; fully mechanical |
| Hosted (`http`) servers | 3 | **Structurally blocked** |

All 22 derived outputs validate clean under the shipped validator. Zero required human authoring.

The three blocked Cards fail because two rules are jointly unsatisfiable for them: `runtimeAdmission.servers` must exactly match the Card's raw `servers` key set (`runtime-admission-manifest.ts:211-216`), while `validateRawServer` (`:157-179`) requires `transport === "stdio"`, a non-empty `command`, and rejects any `url` or `provider`. A Card owning a hosted server can neither omit it nor declare it.

Two of the three authenticate with OAuth. The deployed runtime cannot connect an OAuth MCP server at all — it raises an unsupported-auth error and no broker exists. Those servers therefore already fail closed in deployment today; removing them from a deployed closure removes a non-functional declaration, not a working capability.

### 1.4 Closure recoverability

The deploy payload file is written into the sandbox and discarded with it. The **closure is not**. It is persisted twice on the services side:

- **`deployment_members`** (migration `0008_deployment_members.sql`) — one row per lockfile Card, carrying name, version, requested ref, role, tree SHA, integrity, and position. Written atomically with the deployment row.
- **The retained snapshot** — `snapshots/<content_hash>/project.tar` contains `drwn/config.json` and `drwn/card.lock`, the full closure including the root→member graph.

Both materialization paths emit an identical archive layout — the blueprint path at `cli/core/worker-materialize.ts:263-266` and the services legacy card-ref path — so the snapshot fallback works uniformly. Deployments predating the members table have an empty closure there by construction and depend on the snapshot; that is the expected majority case for historical rows, not an edge case.

**The blast radius is therefore measurable today with existing tooling**, requiring only read-only queries and object reads.

### 1.5 Gate and tooling gaps

Three gaps, each independently confirmed:

- **Card validation does not gate migration.** `cli/core/card-manifest.ts:364` delegates to `validateRuntimeAdmissionDeclarations`, which is presence-conditional: it validates declarations that exist and is silent about declarations that do not. A Card with no declarations validates `ok` with zero errors. Nothing today can answer "is this Card deployable under the current contract."
- **No derivation exists.** No `drwn card` subcommand emits either declaration. The offline derive adapter is a *consumer* — it refuses any lock whose floor is not already `1.3.0`.
- **The authoring path silently regresses migrated Cards.** `addCardSourceMcp` (`cli/core/card-source.ts:1056-1100`) writes `manifest.servers` without touching `runtimeAdmission.servers`. Adding a server to a migrated Card trips the exact-match rule at the next deploy, with no error at authoring time.

---

## 2. Objective 1 — Deployment closure inventory

**Contract:** produce a reproducible record of every deployment in staging and production with its root Card reference, snapshot key, status, and fully resolved closure; and from it derive the set of Cards that actually require migration.

Resolution is two-tier and must be explicit about which tier answered:

1. `deployment_members` where rows exist.
2. `drwn/card.lock` from `<snapshot_key>/project.tar` where they do not.

Deployments that reached no snapshot and wrote no members have no closure record anywhere. They must be **enumerated with that reason**, never silently dropped — a count of unresolved rows is part of the deliverable, and zero is not assumed.

The inventory is read-only. It executes no mutation, no deployment, no migration, and no credential rotation. Environment selection is explicit on every command, because the default and production environments resolve to the same physical database.

The output is a committed document under `.ai/analyses/`, containing the exact commands, the environment targeted, the counts, and the derived deployed-Card set. Numbers without their producing command are not evidence.

## 3. Objective 2 — Content-aware version floor

### 3.1 The change

Raise the runtime-admission floor only when a declaration carries something an older runtime would fail to honor:

- `runtimeAdmission.requirements` is non-empty, **or**
- `applicationRequirements.apps` is non-empty.

A declaration that requires nothing leaves the floor where the rest of the graph puts it.

### 3.2 Why this is correct, not merely convenient

The floor's meaning is "a runtime older than this cannot correctly handle this lock." For a declaration with no requirements and no applications, an older runtime's behavior is *identical* — there is no probe it fails to run and no application it fails to require. The present rule therefore over-reports: it raises a compatibility floor for declarations that carry no compatibility implications. The proposed rule is a correction, and the current behavior is arguably the defect.

The declared servers map is likewise inert on its own. `authMode` is constrained to `none` and the raw server definition is unchanged; an older runtime consuming the same raw `servers` behaves the same way. Enforceable content lives in `requirements` and `apps`, and that is precisely what the new predicate tests.

### 3.3 Invariants that must not move

| Invariant | Why it survives |
|---|---|
| Partially declared closures are rejected | The gate is `deriveRuntimeAdmissionForClosure`, which never consults the floor |
| Declarations carrying real requirements still floor at 1.3.0 | The new predicate returns true for exactly those |
| Envelope identities are unchanged | `minDrwnVersion` is absent from the closure preimage (`runtime-admission-manifest.ts:648-658`), so `closureHash`, `activationHash`, and `manifestHash` cannot move |
| Cross-repository byte-parity vectors remain valid | They pin envelope identities, which do not change |

Measured: a migrated closure whose declarations carry no enforceable content becomes readable by **both** runtimes under the new rule, while the half-migrated rejection still fires with the same stable error code.

### 3.4 Blast radius of the change itself

Two checked-in assertions pin the current behavior (`test/core-card-lock.test.ts:315,328`). Both must be re-expressed as content-bearing cases rather than deleted, so the positive control survives.

## 4. Objective 3 — Declaration tooling and gates

### 4.1 Derivation

A Card-source operation that reads `card.json` and emits both declarations:

- **No servers** → empty intent for both blocks.
- **Local servers only** → one `runtimeAdmission.servers` entry per raw server, `authMode: "none"`, empty `requirementIds`; empty `requirements`; empty `applicationRequirements.apps`.
- **Any hosted server** → refuse, naming the offending servers. Refusal is a first-class outcome, not an error to work around.
- **A server lacking a `command`** → refuse; an enable-only override cannot satisfy the raw-server rule and needs authoring.

Two properties are contractual:

- **Additive only.** An existing declaration is never overwritten. Hand-authored probe requirements must survive a re-run; the naive form of this transform clobbers them, and that failure mode is a required test case.
- **Idempotent.** Re-running produces byte-identical output.

### 4.2 Deployability check

A check answering the question nothing can answer today: are both declarations present, valid, and mutually consistent with the Card's raw servers? Its distinguishing behavior is that it **fails a Card with no declarations** — the precise case existing validation passes.

This is what makes a CI gate meaningful. Installing validation across Card repositories before this check exists would produce a gate that passes every unmigrated Card.

### 4.3 Authoring-path fix

`addCardSourceMcp` must keep a migrated Card deployable — writing the declaration entry alongside the raw server when a declaration is already present, and leaving an undeclared Card unchanged. Without this, the migration regresses the first time anyone adds a tool.

## 5. Test intent

### 5.1 Critical behavior

- A closure whose declarations carry no enforceable content produces a lock accepted by both the previous and the current runtime.
- A closure carrying requirements or applications still floors at `1.3.0`.
- A partially declared closure is still rejected, with the same stable error code.
- Derivation output validates under the shipped validator for every mechanically eligible Card.
- Derivation refuses every ineligible Card and names why.
- A Card missing declarations fails the deployability check.
- Adding an MCP server to a migrated Card leaves it deployable.

### 5.2 Invariants

- Envelope identities (`closureHash`, `activationHash`, `manifestHash`) are byte-identical before and after the floor change.
- Every existing runtime-admission fixture and known-answer vector passes unmodified.
- Derivation is idempotent and never overwrites an existing declaration.

### 5.3 Failure modes and risk surfaces

The dangerous direction is **over-permission**, and it is more dangerous than the bug being fixed. A floor rule that is too lax would let a closure with real probe requirements be consumed by a runtime that silently skips them — a worker admitted without its requirements ever checked. Every test for the relaxation must be paired with a positive control proving the strict case still holds.

The second risk is **silent clobbering**: a derivation that overwrites hand-authored requirements would delete enforcement while reporting success. This must be tested directly rather than assumed.

The third is **fixture drift**: because the adapter implementation set is attested by a rollup over its own bytes, any edit to the admission module moves that rollup. This is intended, and the plan must treat regeneration as a deliberate, reviewed step rather than a surprise.

### 5.4 Testability seams

The three units under test are pure and already isolated: the floor predicate takes manifests and returns a version string; lock validation takes a lock object; derivation takes a manifest and returns a manifest or a refusal. None requires network, credentials, filesystem, or clock. Cross-version behavior is testable in-process by importing the previous runtime's modules alongside the current ones, which is how the partition was measured.

The inventory is the exception: it is inherently an ops verification against live infrastructure, and it is verified by reproduction — a reviewer re-runs the recorded commands and compares counts — not by a unit test.

### 5.5 Observability

Refusals must name the Card and the offending servers. The deployability check must distinguish "no declarations" from "invalid declarations", because those have different remedies. The inventory must report its unresolved count explicitly.

### 5.6 Expected test layers

| Layer | Covers |
|---|---|
| Unit | Floor predicate, cross-version lock round-trip, half-migration rejection, derivation eligibility and refusal, idempotency and non-clobbering, deployability check, authoring-path regression |
| Fixture | Existing runtime-admission vectors unmodified; envelope hash invariance |
| Integration sweep | Derivation across the real Card source registry, each output re-validated |
| CI | Full existing gate suite, pass/skip/fail compared against a named baseline |
| Ops verification | Inventory reproduction against staging and production, read-only |

No end-to-end layer is claimed. Nothing here proves a container starts and serves; that belongs to the downstream redeployment issue and must not be implied by this issue's evidence.

## 6. Alternatives considered

**Extend the admission schema to admit hosted servers.** Rejected for this issue and routed to I171, which already owns HTTP/SSE and bearer/OAuth declaration semantics by name. The restriction is a documented scope cut rather than a security boundary, and the consuming runtime already implements bearer end to end. It is nonetheless excluded because widening transport or auth is an enumerated stop condition in the I265 plan, would require regenerating roughly two dozen pinned artifacts across two repositories atomically, and — decisively — would not fix its own motivating cases: two of the three blocked Cards use OAuth, which no broker supports. Widening transport alone resolves exactly one Card.

**Roll the runtime pin backward instead.** Rejected on evidence. The partition is symmetric, so an older pin does not avoid it; it relocates the failure from deploy onto restore, which is the path that keeps running workers alive, and reproduces the I281 signature.

**Migrate every Card first, then move the pin atomically.** Rejected as the primary plan because it requires one synchronized cutover across repositories owned by different people, with a single reversal point. It remains the fallback if the floor change is refused at G1.

**Relax the lock floor comparison to accept any runtime at or above the recorded floor.** Rejected: it would make new locks readable by old runtimes generally, discarding a real compatibility guarantee across every floor, not just this one. The narrow predicate change achieves the goal without weakening the mechanism.

## 7. Non-goals and authority boundary

I307 performs no Card republication or retagging, no image pin move, no deployment, re-materialization, or rollback, no production mutation, no credential provisioning, no schema widening, and no resolution of the three blocked Cards. It creates no release, tag, or candidate.

The queued production release should remain held while this issue is open. That hold is a standing constraint recorded here; enacting or lifting it belongs to the release owner.

## 8. Risks and residual uncertainty

- **The floor change is a semantic change to a published contract.** It does not move any frozen identity, but adjacent lanes are building against `1.3.0` and should agree before it lands. This is the substantive G1 question.
- **The inventory may reveal a larger or differently shaped deployed set than expected**, including deployments whose closure is unrecoverable. The plan must not assume the count is zero.
- **A shared Card concentrates local risk**: one Card appears in seven of nine local project closures. The floor change removes the hazard; without it, that Card cannot be migrated incrementally at all.
- **A machine-worker contract hard-codes a version literal.** If the machine-defaults Card ever gains declarations, that literal and its pinned hashes need coordinated regeneration. Out of scope here, recorded so it is not rediscovered.
- **A status dashboard in the Card registry is stale** and disagrees with on-disk state for two projects. Plan from lock files, not from it.
