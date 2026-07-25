<!-- ABOUTME: Review 01 of the CL0024 Addendum 01 Org Worker materialization work (PR #60) for merge-readiness. -->
<!-- ABOUTME: Records a conditional verdict — code and contract bytes are cross-verified, but the plan's own cross-owner freeze gate is self-attested. -->

# CL0024 Addendum 01 — Review 01: Org Worker Materialization Execution Readiness

**Status**: In Review
**Issue**: I104 (split from CL0024 / I24 on 2026-07-24; PR #60)
**Created**: 2026-07-24
**Scope**: Adversarial execution/merge-readiness review of the Addendum 01 worker-materialization implementation on PR #60 (`release/architect-provisioning-v1`), stacked on PR #59 (`remy/24-worker-instructions-projection`)
**Artifact under review**: the addendum implementation commit range `2a7c20f..052ebe7` vs `origin/remy/24-worker-instructions-projection`, plus `.ai/tasks/cl0024_addendum01_org-worker-bundle-materialization-alignment.md`
**Gate outcome**: **Conditional go — code and contract artifacts pass; unconditional merge is blocked until the cross-owner freeze is independently ratified (B1) and the addendum status is corrected (B2). The two remaining findings (B3, B4) are documentation-integrity items that should be corrected but do not block a ratified merge.**
**Priority**: High
**References**:
- `.ai/tasks/cl0024_addendum01_org-worker-bundle-materialization-alignment.md`
- `.ai/analyses/cl0024_addendum01_worker-materialization-doc-audit.md`
- `.ai/tasks/cl0024_worker-instructions-projection_task_plan.md` (base plan §2 scope boundary)
- `.ai/tasks/cl0024_review01_worker-instructions-projection-execution-readiness.md` (prior review bar)
- `/Users/pureicis/dev/darwinian-org/.ai/analyses/08_architect_organization_provisioning_blueprint_target_architecture.md` (§6.1, §13.2, §14.3, §15.2/15.3, §20, §22)
- `/Users/pureicis/dev/darwinian-org/.ai/contracts/organization-provisioning-v1/` (packet `1.0.1`, receipt schema, envelope mapping)
- `cli/core/org-worker-materializer.ts`, `cli/core/worker-materialization-receipt.ts`, `cli/core/instruction-consent-evidence.ts`, `cli/core/org-worker-materialization-plan.ts`, `cli/core/diagnostics.ts`, `cli/commands/install.ts`
- `test/scenarios-org-worker-materialization.test.ts`, `test/core-org-worker-*`, `test/fixtures/org-worker-materialization-v1/`

---

## Executive Summary

The Addendum 01 implementation is, on the code and contract dimensions, **materially correct and unusually well-verified.** Every substantive boundary the prompt flagged for adversarial scrutiny — ownership, no-network, receipt/diagnostics telemetry, consent integrity, dual hash domains, determinism, and test quality — was checked against the code and against the upstream Darwinian Org contract bytes, and each held. The single largest risk the review anticipated (that the cross-repo packet fixture might be an unverified local invention) is **refuted**: the consumed bundle, snapshot, and receipt bytes are byte-identical to what `darwinian-org` actually produces, and the receipt schema and negative matrix match the frozen org digests.

The blocker is not in the code. It is in **governance**. The addendum's own §12 exit criteria require that "cross-owner receipt and artifact-transfer contracts are frozen," and its §13 stop conditions forbid mutation while "Worker/packet/receipt owners have not approved the contract identities." The addendum Status is still **"Draft for Darwinian Worker and Foundry contract-owner review,"** and the only completion sign-off (evidence-log line 1099) is **self-attested by the implementer ("Codex")**. No independent cross-owner ratification artifact exists in either repository. A clean, unconditional GO would certify exit criteria that the governing document itself declares unmet, which is not defensible at the `cl0024_review01` bar. This is why the verdict is **conditional**, not a plain go.

Two lower-severity documentation-integrity findings accompany the primary one: the addendum's frozen outer-packet descriptor/manifest digests no longer match the live org bytes (a freeze-discipline smell, though the *consumed* bytes match), and the `DRWN_VERSION` was bumped to `1.0.0` primarily to satisfy the producer fixture floor — a legitimate but owner-ratifiable product decision.

This is a **governance/ratification conditional-go**, not an implementation-baseline failure. The repository baseline is fully green.

---

## Review Method

The review checked the addendum against:

- the upstream Darwinian Org target architecture (doc-08) ownership matrix (§6.1), projection family (§13.2), reconciliation (§14.3), receipt envelope/families (§15.2/15.3), observability/forbidden-telemetry (§20), and readiness semantics (§22);
- the base CL0024 plan §2 scope boundary ("does not own … Foundry apply/reconcile/readiness");
- the actual implementation code in the materializer, receipt, consent-evidence, plan, diagnostics, and install-command modules;
- the actual contract bytes in `/Users/pureicis/dev/darwinian-org/.ai/contracts/organization-provisioning-v1/`, cross-checked by SHA-256 against the Worker's frozen bindings and local fixtures;
- the new test suites for mock usage, adversarial density, and real-process fidelity;
- the addendum's own exit criteria (§12) and stop conditions (§13).

The review did **not** modify any code or document. It ran the test suite, type check, focused suites, and release verifier to establish the baseline.

---

## Verified Baseline

| Check | Result |
|---|---|
| Full suite: `bun test ./test/` | **1717 pass, 6 skip, 0 fail**; 7,680 expectations across 296 files |
| Focused org-worker suites (7 files) | **53 pass, 0 fail**; 432 expectations across 6 files (materializer/receipt/install/diagnostics/consent/snapshot) |
| Type check: `bunx tsc --noEmit` | **Pass** (exit 0) |
| `bun run verify:release` | **Pass** (exit 0); constituent gates (tests + typecheck) independently re-confirmed green. The verifier's own run was slow and one completion notice raced a manual process-kill, so I lean on the independently-run gates rather than that single exit code. |
| `git diff --check` (addendum range) | **Clean** (exit 0) |
| Local `drwn` (`DRWN_VERSION`) | **1.0.0** (`cli/core/version.ts:4`; `package.json` version `1.0.0`) |
| Reviewed branch / range | `release/architect-provisioning-v1`; `2a7c20f..052ebe7` vs `origin/remy/24-worker-instructions-projection` |
| Baseline skips | 6 skips are environment/live only (Windows DPAPI, live CAS/server journey, live GitHub catalog). The org-worker materialization suite **executes**; it is not among the skips. |

The plan's claimed evidence (1717 pass / 6 skip / 0 fail / 7680 expects / 296 files) reproduces exactly.

---

## Blocking Findings

### B1 — The cross-owner freeze required by the addendum's own exit criteria is self-attested, not independently ratified

**Severity**: High (blocks unconditional merge)

**Evidence**

- Addendum Status (`cl0024_addendum01_...alignment.md:13`): **"Draft for Darwinian Worker and Foundry contract-owner review."**
- Addendum §12 exit criteria (line ~1039): "This addendum is complete only when: cross-owner receipt and artifact-transfer contracts are frozen."
- Addendum §13 stop conditions (line ~1062): "Stop before mutation if: Worker/packet/receipt owners have not approved the contract identities."
- The only completion sign-off is the evidence-log row at line 1099, authored by **"Codex"** — the implementing actor — reporting its own Tasks 1–10 green. Producer-side results are explicitly hearsay: line 148 states the Org packet results "were reported by the Task 48 owner and were **not rerun from this Worker checkout**."
- No independent ratification artifact exists: `.ai/communications/` contains no sign-off for this addendum; `grep` for `ratif|approv|sign-off|contract owner` across `.ai/communications/` and the addendum returns only the addendum's own draft text.
- Both repositories' freeze commits are authored by the same actor (`remyjkim` in `darwinian-org`), so there is no second-owner attestation on the producer side either.

**Why this blocks unconditional merge**

The materializer mutates project state (`config.json`, `card.lock`, vendored trees, projection, receipts). By the plan's *own* logic, an unratified cross-owner freeze gates that mutating path. Merging PR #60 as "complete" would certify §12 exit criteria and clear §13 stop conditions that the governing document declares unmet. At the `cl0024_review01` bar — where every blocker must be a real, citable contradiction — a self-attested cross-owner freeze certified as complete is exactly such a contradiction.

Note the technical substrate is *ready*: the Foundry envelope mapping is genuinely frozen in the org repo (see Confirmed Assumption C2 below), so this is a governance/ratification gap, not a missing-artifact gap. That is precisely why it is recoverable by ratification rather than redesign.

**Required correction**

Obtain and record an explicit ratification of the frozen contract identities (receipt schema `a638b578…`, negative matrix `887a2be0…`, envelope mapping in `organization-receipt@1`, and the artifact-transfer/snapshot contract) by the Darwinian Worker and Foundry contract owners, as a durable artifact distinct from the implementer's self-report. Until that exists, the addendum status must not be represented as complete, and PR #60 must not be merged as a finished materialization contract.

---

### B2 — The addendum document is represented as complete while its status still says "Draft," and its self-attested evidence conflicts with its own gate

**Severity**: Medium (blocks unconditional merge; trivially correctable once B1 resolves)

**Evidence**

- The Status line (`:13`) reads "Draft for … contract-owner review," yet the evidence log (`:1099`) reports full Tasks 1–10 completion with green gates and the base plan's execution-evidence log (`cl0024_worker-instructions-projection_task_plan.md:563`) records the addendum as delivered. The document simultaneously claims "draft, pending review" and "implemented and green."
- The addendum §1 states the addendum "blocks final completion claims only for the organization-bundle materialization path," which is consistent with B1 but is contradicted by the completion framing of the evidence log.

**Why this blocks unconditional merge**

A reviewer or downstream owner cannot tell from the artifact whether the contract is frozen-and-ratified or draft-and-self-reported. The prior review (R1-F22) treated exactly this kind of unresolved document-status ambiguity as a defect. Merge decisions should not rest on a document whose own status contradicts its evidence log.

**Required correction**

Reconcile the status: after B1 ratification, set the status to the ratified state and record the ratification reference. If B1 is not yet satisfied, mark the document explicitly `Blocked on cross-owner ratification` and keep the completion claims scoped to "Worker-side implementation green, contract freeze pending ratification." Do not carry both claims at once.

---

### B3 — Frozen `organization-provisioning-v1@1.0.1` outer-packet bytes differ between the recorded binding and the live org repo

**Severity**: Low–Medium (freeze-discipline integrity smell; does **not** block a ratified merge, because the consumed bytes match — see below)

**Evidence**

- The addendum binding table records the frozen packet descriptor digest as `9be2e385…94f3` (`:95`) and the frozen manifest-file digest as `d1a0cc18…380e` (`:96`).
- The live org repo bytes, at `darwinian-org` HEAD (`4be6c9f`, clean working tree), hash to **`c6aee735…f87c`** for `packet.json` and **`dda36a6c…204d`** for `manifest.sha256` — neither matches the recorded binding. The org manifest is internally self-consistent (its recorded `packet.json` digest equals the live file), so the outer packet's bytes evolved after the Worker recorded its binding, under the same `1.0.1` label, without a version bump.
- The addendum's own §2 rule (`:111`) states "Revision drift requires a contract diff and explicit disposition"; no such disposition is recorded for this drift.

**Why this is not a code-correctness blocker**

The Worker CLI consumes bundle/snapshot/content paths, not the outer packet descriptor (addendum §5, line ~264 explicitly scopes `ORG_WORKER_PACKET_IDENTITY_MISMATCH` out of the runtime and into the released-boundary test). The bytes the code *actually consumes* are cross-verified byte-for-byte against the live org producer (see Confirmed Assumption C6). So the mismatch is confined to a documentation field the runtime never reads. It is nonetheless a real freeze-discipline defect: a "frozen" `1.0.1` whose descriptor bytes mutated without a bump corroborates that the freeze was not actually locked, which reinforces B1.

**Required correction**

Either re-pin the addendum binding table to the live org `1.0.1` descriptor/manifest digests with a recorded diff/disposition, or (preferably) bump the org packet version so a byte change carries a version change. Reconcile as part of the B1 ratification.

---

### B4 — `DRWN_VERSION` was raised to `1.0.0` primarily to satisfy the producer fixture floor

**Severity**: Low (product decision that should be owner-ratified; disclosed)

**Evidence**

- Divergence record A07 (`:124`): "current Worker is `0.9.0`; producer fixture requires `1.0.0`" with required resolution "contract owner must bump Worker or amend/reissue the packet."
- `cli/core/version.ts:4` now sets `DRWN_VERSION = "1.0.0"`, and `package.json` version is `1.0.0`. The compatibility preflight (`org-worker-compatibility.ts`) enforces the `minimumWorkerVersion` floor against this constant.

**Why this warrants a note**

A public CLI version is a release-semantics decision (it signals `1.0` stability to all consumers, not just the org-materialization path). Bumping it to clear a fixture floor is legitimate but is exactly the kind of cross-cutting decision the addendum §13 reserves to the contract owner ("bump Worker **or** amend/reissue the packet"). It is disclosed, so this is a note rather than a hard block.

**Required correction**

Confirm, as part of B1 ratification, that the `1.0.0` version bump is the intended resolution of A07 (rather than a packet re-issue) and that a `1.0.0` public release is otherwise warranted.

---

## Confirmed Assumptions

These were adversarially checked and hold. Remediation of B1–B4 must not reopen them.

### C1 — The reconcile/repair/remove operations are worker-local materialization, not Foundry overreach

The base plan §2 excludes "Foundry apply/reconcile/readiness," and doc-08 §14.3 assigns cross-system reconciliation to Foundry — but doc-08 §6.1 explicitly assigns **"Harness files and worker-local materialization | Darwinian Worker."** The code stays on the worker-local side of that line: `grep` for `grant|memory|authz|authoriz|protocol|revoke|readiness` across `org-worker-materializer.ts` returns **zero** matches; reconcile takes the desired bundle+snapshot as *input* (`reconcileOrgWorkerProject`, `org-worker-materializer.ts:1024`) and repairs local state toward it, never editing the bundle (doc-08 §14.3's prohibition); no field, receipt, or diagnostic claims organization readiness (see C3). This is materially the same operation doc-08 §6.1 grants the Worker, distinct from Foundry's cross-system reconciler. The "reconcile" word is shared; the operation is not the same noun.

### C2 — The Foundry receipt-envelope mapping (A14/§8) is genuinely frozen on the producer side

The org repo ships `worker-materialization-receipt.schema.json` (digest `a638b578…0979`, matching the Worker binding `:97`) and `worker-materialization-receipt.negative-fixtures.json` (`887a2be0…8071`, matching `:98`). Critically, "schema shipped" is not the whole requirement — §8 requires the *relationship*. The org `organization-receipt@1` envelope (`receipt-record.schema.json`) defines a `workerMaterializationPayload` that requires `workerReceiptId`, `workerReceiptDigest`, and `outcome` (`:187-214`), and lists `worker_materialization` as a closed `receiptKind` with the exact status set `["verified","removed","blocked","failed"]` (`:303`). This is precisely the "Foundry verifies its digest and records or references it in an `organization-receipt@1` whose kind is `worker_materialization`" relationship §8 step 2 demands. The artifact-level freeze is complete; only its cross-owner ratification is missing (B1).

### C3 — Receipt and diagnostics carry no forbidden telemetry (doc-08 §20)

`WorkerMaterializationReceiptV1` (`worker-materialization-receipt.ts:64-269`) is a `.strict()` Zod schema whose only free-form fields are digest-shaped (`sha256:`/`sha256-` regexes), bounded `safeIdentifier` strings (which reject `://`, backslash, leading `/`, and `..`), closed enums, and one injected ISO `observedAt`. There is **no** free-text `error`/message body, no path field, no content field, and arrays are length-capped. Diagnostics' `orgWorkerMaterialization` section (`diagnostics.ts:243-261`) exposes only `state` (bounded enum), `bundleDigest`, `workerId`, `blueprintDigest`, `lastVerifiedReceiptId`, `instructionConsentSource` (`local|organization|mixed`), and bounded issue codes with severity; the code comment at `:363` states it "performs no remote lookup and returns bounded codes rather than local paths." No readiness field or claim appears anywhere (`grep` for `readiness|not_ready|isReady` across the worker code is empty), satisfying doc-08 §22's reservation of readiness to Foundry.

### C4 — Organization contribution consent remains external ratifier evidence and is never rewritten as local operator consent (settles R1-F03 for the bundle path)

`resolveEffectiveInstructionConsent` (`instruction-consent-evidence.ts:135`) keeps the two variants disjoint: `local_card_consent` is read only from `card.instructionConsent`; `org_worker_bundle_consent` is validated against an explicit `{workerId, artifactPinRef}` binding with exact content-digest match, valid semver range, and `projectionSurface === "worker_instructions"` (`:96-133`) — no origin-based trust shortcut. The materialization plan routes org consent into a **separate** `effectiveExternalConsentEvidence` array (`org-worker-materialization-plan.ts:242-264`); the derived `card.lock` (`serializeCardLock`) contains no `instructionConsent`. No writer copies org consent into `CardLockEntry.instructionConsent` (verified by enumerating every writer of that field). `card trust`/`card untrust` continue to mutate the local field only. The base decision (explicit consent per origin, no first-party auto-grant) is not bypassed by the bundle path.

### C5 — The materialize path performs no network resolution; failures are journaled/recoverable

The materializer imports `syncRepository` but pre-populates the vendor tree from the verified snapshot's local bytes (`populateVerifiedVendor`, `org-worker-materializer.ts:202-232`) before invoking sync. `sync.ts` imports no git/source resolver; its card content path is `reconcileVendorTrees` (`vendor-reconcile.ts:86`), which reads existing vendor trees or the local machine store and **throws** if neither is present (`:27-28`) rather than fetching. So the materialize→vendor→sync path is provably offline. The install command fails closed unless `--frozen`, `--org-worker-bundle`, `--worker-artifact-snapshot`, and `--operation-id` are supplied together (`install.ts:119-130`). Every owned postcondition is read back (`exactReadBack`, `:261`), and the operation is journaled through the phases in §7.3 with per-file atomic writes; the code never claims a single cross-file atomic transaction.

### C6 — The cross-repo packet fixture is a faithful copy of the org producer, not an unverified local invention

The Worker's released fixtures are byte-identical to the live `darwinian-org` producer fixtures: `released/org-worker-bundle.json` = `42f5a308…` = org `gtm.org-worker-bundle.fixture.json`; `snapshot.valid.json` = `70e6700c…` = org `gtm.worker-artifact-snapshot.fixture.json`; and all three receipts (`materialize`/`reconcile`/`remove` = `2448e055…`/`1b106384…`/`7b39f047…`) equal the org `gtm.worker-materialization.*-receipt.fixture.json`. The org `1.0.1` `manifest.sha256` lists these exact digests. The scenario test verifies its local `released-boundary.manifest.json` self-consistently, then drives the real CLI over them. This is the single most important refutation of the "unverified invention" risk. (The only drift is the outer-descriptor field of B3, which the runtime never consumes.)

### C7 — Dual hash domains are preserved (settles R1-F09 for the materialization path)

Content digest and ownership hash stay distinct in the materializer: `contentDigest` is the composed instruction bytes (`sha256-…`, `org-worker-materializer.ts:411`), while `ownershipHash` is `hashManagedContent(...)` of the rendered managed block (`:412`). They are separate fields on the receipt's `instructionProjection` and are never conflated.

### C8 — Determinism holds; receipts are byte-stable and clock/operation-ID are injected

The receipt digest is `domain || canonicalJson(parsed)` with sorted-key canonical JSON (`worker-materialization-receipt.ts:292-326`); `observedAt` is an injected ISO timestamp, `operationId` is a caller-supplied param, and the receipt ID is path-safe and validated. `grep` for `Date.now|Math.random` in the receipt/snapshot/record/journal/materializer builders returns only two `new Date(value).toISOString()` round-trips used for *validation* (not clock reads). Receipt storage is append-only with `EEXIST`-based idempotency (`:359-424`).

### C9 — Test quality is genuine TDD, not retrofitted or mock-testing

The new suites contain **zero** `mock`/`jest.fn`/`spyOn`/`vi.fn`/`stub`/`fake` occurrences (compliant with the project rule forbidding tests of mocked behavior). Adversarial density is high: 77 negative/adversarial assertions in `core-org-worker-artifact-snapshot.test.ts`, 31 in `core-org-worker-materializer.test.ts`, 15 in the scenario test. The lifecycle scenario ("fresh processes materialize, reconcile, repair, remove, and diagnose the released packet," `scenarios-org-worker-materialization.test.ts:214`) drives the **real CLI entrypoint via `Bun.spawn`** (`helpers.ts:354-383`) against a scaffolded fixture with copied released bytes, asserting `exitCode` and read-back state — a true fresh-process qualification, not an in-process stub. Runtime files (record, journal, receipts) are correctly registered as ignored paths (`git-hygiene.ts:15-17`).

---

## Scope-Hygiene Note

The base CL0024 plan §2 explicitly excluded "Foundry apply/reconcile/readiness," and the addendum meaningfully expands the CL0024/I24 surface (fresh-project materialize + reconcile + repair + remove + receipts + journal + record + diagnostics, ~12k lines). C1 confirms the *code* stays on the worker-local side of the ownership line, so the expansion is defensible as "worker-local materialization" rather than Foundry work — it is not mis-scoped into another owner's territory. However, folding a contract this large (a new receipt version, a new artifact-transfer contract, a new compatibility profile, and a cross-repository producer/consumer freeze) into the CL0024 issue, under a document still marked "Draft for … contract-owner review," concentrates a great deal of cross-owner contract surface into a single stacked PR. That structural weight is what makes B1 (independent ratification) load-bearing rather than ceremonial. The reviewer should confirm the owners intended this contract to ride CL0024 rather than a dedicated provisioning issue.

---

## Final Verdict

**Conditional go.** The implementation is correct, offline, privacy-bounded, consent-honest, deterministic, and cross-verified against the real Darwinian Org producer bytes; its tests are genuine adversarial TDD over the real CLI. On code and contract-artifact grounds, this is merge-quality work and the anticipated worst-case risks (Foundry overreach, unverified fixture invention, telemetry leakage, consent bypass, hidden network) are each refuted with citable evidence.

**But unconditional merge is blocked** by B1 and B2: the addendum's own §12/§13 gates require an independently ratified cross-owner freeze before the mutating path is authorized, and the only sign-off is self-attested by the implementer while the document still reads "Draft." The single most important thing needed before PR #60 can merge is a **durable, independent cross-owner ratification** (Darwinian Worker + Foundry contract owners) of the frozen receipt/envelope/artifact-transfer contract identities — after which B2 becomes a one-line status correction and B3/B4 are reconciled as documentation-integrity cleanups. The technical substrate for that ratification already exists (C2), so this is a governance step, not a redesign.
