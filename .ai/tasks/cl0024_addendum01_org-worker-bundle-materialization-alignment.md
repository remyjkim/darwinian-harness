# ABOUTME: Reconciles CL0024's narrow OrgWorkerBundleV1 consumer with the latest Darwinian Org Worker-materialization architecture.
# ABOUTME: Preserves the completed instruction projection while specifying fresh-project bootstrap, consent provenance, receipts, and reconciliation.

# CL0024 Addendum 01 — OrgWorkerBundleV1 Materialization Alignment

> **For the implementer:** use `executing-plans`, `test-driven-development`,
> `systematic-debugging` for unexpected behavior, and
> `verification-before-completion`. Execute each task in order and stop at every
> cross-owner freeze gate.

**Issue:** CL0024 / I24
**Program:** `ARCH-PROV-REM-2026-07-23`
**Status:** Draft for Darwinian Worker and Foundry contract-owner review
**Created:** 2026-07-23
**Repository:** `/Users/pureicis/dev/darwinian-minds`
**Goal:** Complete the deterministic boundary from an accepted
`OrgWorkerBundleV1` and immutable artifact bytes to verified Worker-local
materialization, repair, removal, and a conforming
`worker-materialization-receipt@1`.

**Architecture:** Keep CL0024's consented instruction composer and owned projection
surfaces unchanged. Add a fail-closed Worker materialization adapter that verifies the
bundle and artifact handoff, derives project intent without network resolution,
applies it through journaled operations, reads back every owned postcondition, and
only then emits an immutable receipt. Organization contribution consent remains
external ratifier evidence and is never rewritten as local operator consent.

**Tech stack:** Bun, TypeScript, Clipanion, Zod, existing project-state transactions,
domain-separated SHA-256, canonical JSON, and the frozen
`organization-provisioning-v1@1.0.0` packet.

---

## 1. Why this addendum exists

The original CL0024 plan correctly owns explicit instruction contribution, local
consent, composition, managed `AGENTS.md` projection, Claude adaptation, ownership,
drift, cleanup, diagnostics, and the narrow parsing of `OrgWorkerBundleV1`.

The latest Darwinian Org target architecture assigns a wider responsibility to the
Worker boundary:

```text
accepted OrganizationProvisioningBlueprintV1
  -> verified OrgWorkerBundleV1
  -> compatible Darwinian Worker
  -> project roots/configuration/contribution authorization
  -> Worker-local materialization
  -> read-back verification
  -> worker-materialization-receipt@1
  -> Foundry reconciliation/readiness
```

The current CL0024 plan stops at bundle validation against an already initialized
project and a bounded pre-projection install receipt. That is useful conformance
evidence, but it is not fresh-project materialization and cannot prove that projection
succeeded.

This addendum is additive:

- it does not reopen the explicit-instructions-only decision;
- it does not weaken local consent, marker safety, ownership, or strict mode;
- it does not move organization authority, readiness, protocols, grants, memory, or
  credentials into Darwinian Worker;
- it does not retroactively relabel the existing
  `org-worker-bundle-install-receipt@1` as a materialization receipt;
- it blocks final completion claims only for the organization-bundle materialization
  path.

## 2. Binding revisions and contract identities

Record these again immediately before execution. Revision drift requires a contract
diff and explicit disposition.

| Owner | Candidate | Role |
|---|---|---|
| Darwinian Worker | `57b872173567fb857356bf33650df19ef638f701` | CL0024 documentation candidate |
| Darwinian Worker | `64e89a3` | current instruction/bundle implementation parent |
| Darwinian Org | `c636cb908e40107d3bfa7a44d3a43aafd1f10be3` | latest published target architecture and execution program |
| Darwinian Org | `627369b` | V1 contract/compiler/Foundry implementation candidate |
| Org packet | `organization-provisioning-v1@1.0.0` | frozen producer/consumer packet |
| Packet manifest file SHA-256 | `5256e15242e25503fc2da88632c5e26ea5d36a65b7cfdbc757486cd02a94c661` | digest of `manifest.sha256` bytes |
| Packet descriptor SHA-256 | `98fc75e1d1366ad5762a7a6c73ef935476144adea799982964d3d3525666f7d9` | digest of `packet.json` bytes |
| GTM bundle fixture SHA-256 | `64b05a0965003f092f92b34f65688ae5de14a7b0b30554e5425df2fe9b22cb94` | exact producer golden bytes |

Worker-side execution bindings appended 2026-07-24:

| Owner | Candidate | Role |
|---|---|---|
| Darwinian Worker | `fbcd4089fe4cbea8c4db8cd93c91f1e6262aed7d` plus scoped uncommitted CL0024 addendum changes | execution base; no commit authorized |
| Worker released-boundary manifest | `sha256:fc9632d346fd85e4931100f157052d47a2721fc59c4fa0fdfd1f6b36ab4bc0f2` | checksum-pinned Worker-side qualification boundary |
| Worker released GTM bundle copy | `sha256:42f5a30853351d27cddee75869c0581604ebbe01cdf8fb160357bc1d50536dc9` | exact bundle bytes consumed by the fresh-process scenario |
| Worker artifact snapshot | `sha256:70e6700c10c8107352a589d06dad14b7849622b0f830b325679aa2394e219067` | exact snapshot bytes consumed by the scenario |
| Org packet | `organization-provisioning-v1@1.0.1` | frozen producer packet matching the Worker receipt vectors |
| Org packet descriptor SHA-256 | `9be2e3855f5d955726dcf268edc515f8752308cdd4a8365c0bbeffd42d1394f3` | digest of frozen `packet.json` bytes |
| Org packet manifest file SHA-256 | `d1a0cc18801ca187b9f40ecfaf1bcd8b2e199b943c02a8c2f47758b39f24380e` | digest of frozen `manifest.sha256` bytes |
| Worker receipt schema SHA-256 | `a638b578e794527cabbc8fc833136c7952228dc47d77a0f968dc086b41960979` | standalone schema shipped by the Org packet |
| Receipt negative matrix SHA-256 | `887a2be0b9db1920ef07a5a4d38ab01a11c7872331d7e08f68481ecbd0a48071` | exact shared negative manifest |

Binding source files:

- `.ai/tasks/cl0024_worker-instructions-projection_task_plan.md`
- `.ai/analyses/cl0024_worker-instructions-projection_target_architecture.md`
- `/Users/pureicis/dev/darwinian-org/.ai/analyses/08_architect_organization_provisioning_blueprint_target_architecture.md`
- `/Users/pureicis/dev/darwinian-org/.ai/tasks/01_org-worker-bundle-v1_task_plan.md`
- `/Users/pureicis/dev/darwinian-org/.ai/tasks/03_foundry-provision-apply-reconcile-v1_task_plan.md`
- `/Users/pureicis/dev/darwinian-org/.ai/tasks/06_provisioning-e2e-qualification-v1_task_plan.md`
- `/Users/pureicis/dev/darwinian-org/.ai/tasks/07_architect-provisioning-v1-deployment-testing-strategy_task_plan.md`
- `/Users/pureicis/dev/darwinian-org/.ai/contracts/organization-provisioning-v1/`

Contract bytes and schemas win over stale narrative status text. In particular, the
target architecture still contains historical statements that CL0024 is merely planned;
those statements must be corrected, but they do not override the frozen packet.

## 3. Current divergence record

| ID | Current behavior or plan | Required target behavior | Severity |
|---|---|---|---|
| A01 | `drwn install --org-worker-bundle` requires existing `config.json`, `card.lock`, and active Worker | materialize a fresh project from immutable bundle plus resolvable pinned bytes | blocker |
| A02 | bundle consent is verified but does not become effective composition evidence | exact bundle consent must authorize only its pinned contribution while retaining external provenance | blocker |
| A03 | receipt wire tag is `org-worker-bundle-install-receipt@1` | bundle requires `worker-materialization-receipt@1` | blocker |
| A04 | receipt is written before `syncRepository` | success receipt follows apply, read-back, and ownership verification | blocker |
| A05 | bundle digest is plain canonical JSON SHA-256 | use the producer's frozen canonicalization and `darwinian:org-worker-bundle:v1` domain | high |
| A06 | `minimumWorkerVersion` is parsed but not enforced | reject incompatible Worker versions before mutation | blocker |
| A07 | current Worker is `0.9.0`; producer fixture requires `1.0.0` | contract owner must bump Worker or amend/reissue the packet | blocker |
| A08 | `projectOverlay` and `logicalEnvironmentClass` are parsed but ignored | advertise an exact supported profile and fail closed otherwise | high |
| A09 | non-Card/non-root artifact pins are silently skipped | materialize or return an explicit compatibility rejection; never ignore | high |
| A10 | ordered roots are checked but do not derive fresh project state | preserve root order and exact active-root selection in config/lock | blocker |
| A11 | bundle bytes do not contain Card content or an installable immutable ref for every origin | bind a checksum-pinned artifact snapshot/content packet or a preseeded immutable store | blocker |
| A12 | local instruction cleanup exists, but no bundle operation journal/materialization record exists | reconcile and remove only state proven owned by the prior bundle operation | high |
| A13 | consumer test pins one producer golden but does not consume the producer negative matrix/package as a released artifact | released producer/consumer conformance must cover all goldens and negatives | high |
| A14 | Org packet names a Worker receipt version but ships no standalone Worker receipt schema | freeze the Worker-owned receipt schema and its Foundry envelope mapping | blocker |

### 2026-07-24 Worker-side disposition

The divergence table above remains the historical input to this addendum. Worker
Tasks 1–9 close A01–A14 on the consumer side: the supported profile now fails
closed, fresh immutable materialization derives project state, external consent is
effective without becoming local consent, success receipts follow read-back,
journals recover interruption, reconcile/remove are ownership-bounded, and
diagnostics remain local-only. The checksum-pinned fresh-process scenario covers
materialize, no-op reconcile, tamper/repair, remove, and tombstone diagnostics.

Darwinian Org packet `1.0.1` is now frozen against these exact receipt bytes. Its
manifest checksum verification is green and its Node contract suite passes 11/11.
Those producer-side results were reported by the Task 48 owner and were not rerun
from this Worker checkout. Live deployment, provider calls, authorization rollout,
and organization readiness remain separate gates and are not implied by either
repository's fixture results.

## 4. Ownership and non-authority boundary

### 4.1 Canonical owners

| Fact | Owner |
|---|---|
| accepted organization meaning | Architect design |
| accepted provisioning intent | `OrganizationProvisioningBlueprintV1` |
| per-Worker desired input | `OrgWorkerBundleV1` |
| immutable artifact bytes and resolution evidence | artifact publisher/resolver snapshot |
| harness files and generated projection | Darwinian Worker |
| local operator consent | Darwinian Worker `card.lock` |
| organization contribution consent | accepted blueprint/bundle ratifier evidence |
| applied Worker state | Worker materialization record plus immutable receipts |
| cross-system desired-versus-actual reconciliation | Foundry |
| readiness | Foundry readiness evaluator |

The Worker must not:

- infer organization grants or protocols from bundle metadata;
- turn a provenance reference into authorization;
- treat a bundle as proof of installation;
- mark the local operator as the ratifier of organization consent;
- copy instruction content into receipts, diagnostics, or logs;
- turn an unsupported artifact kind or overlay key into a warning-and-continue path;
- fetch mutable or floating content while `--frozen` is active;
- claim global filesystem atomicity where only journaled convergence exists.

### 4.2 Contribution-consent provenance

Instruction composition consumes an explicit union:

```ts
type EffectiveInstructionConsentEvidence =
  | {
      kind: "local_card_consent";
      cardName: string;
      consentedRange: string;
      contentDigest: `sha256-${string}`;
      consentedAt: string;
    }
  | {
      kind: "org_worker_bundle_consent";
      bundleDigest: `sha256:${string}`;
      sourceBlueprint: {
        id: string;
        revision: number;
        digest: `sha256:${string}`;
      };
      consentId: string;
      workerId: string;
      artifactPinRef: string;
      consentedRange: string;
      contentDigest: `sha256-${string}`;
      ratifierRef: string;
      evidenceRefs: string[];
      projectionSurface: "worker_instructions";
    };
```

Both variants require:

- the exact resolved Card version to satisfy the consent range;
- the exact explicit instruction bytes to match the consent content digest;
- the Card identity/integrity to match the locked artifact;
- an instructions contribution and the `worker_instructions` surface;
- no origin-based trust shortcut.

Organization evidence is stored separately from `CardLockEntry.instructionConsent`.
`drwn card trust` and `drwn card untrust` continue to mutate local consent only.
Diagnostics and receipts identify the consent kind and stable IDs without instruction
content.

## 5. V1 compatibility profile

Until a broader profile is frozen, the Worker candidate supports exactly:

| Input | V1 support |
|---|---|
| bundle wire version | `org-worker-bundle@1` |
| environment class | `project_workspace` |
| project overlay | empty object only |
| artifact kinds | `worker_root` and `card` |
| active root | exact member of `orderedWorkerRoots`, or explicit `null` |
| instruction surface | `worker_instructions` |
| hook surface | parsed and retained as evidence; materialization remains governed by existing hook consent and a separately proven mapping |
| materialization receipt | `worker-materialization-receipt@1` after schema freeze |
| content acquisition | checksum-pinned artifact handoff or preseeded immutable store only |
| network resolution | forbidden in frozen materialization |

This restricted profile is intentional. The current producer fixtures use
`project_workspace`, an empty overlay, and a Worker-root pin. A non-empty overlay or
unsupported artifact kind must return a stable compatibility error until a versioned
profile defines its exact mapping.

Required stable runtime compatibility/materialization codes:

```text
ORG_WORKER_BUNDLE_DIGEST_MISMATCH
ORG_WORKER_VERSION_UNSUPPORTED
ORG_WORKER_ENVIRONMENT_UNSUPPORTED
ORG_WORKER_PROJECT_OVERLAY_UNSUPPORTED
ORG_WORKER_ARTIFACT_KIND_UNSUPPORTED
ORG_WORKER_ARTIFACT_BYTES_MISSING
ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH
ORG_WORKER_ROOT_ORDER_INVALID
ORG_WORKER_ACTIVE_ROOT_INVALID
ORG_WORKER_CONSENT_INVALID
ORG_WORKER_RECEIPT_VERSION_UNSUPPORTED
ORG_WORKER_MATERIALIZATION_DRIFT
ORG_WORKER_REMOVAL_OWNERSHIP_DRIFT
```

`ORG_WORKER_PACKET_IDENTITY_MISMATCH` belongs to the released outer-packet
manifest/descriptor boundary. The Worker CLI receives bundle, snapshot, and content
closure paths rather than the outer packet descriptor, so it must not fabricate this
runtime result. `test/scenarios-org-worker-materialization.test.ts` verifies the
outer packet-equivalent checksum manifest before invoking the CLI; bundle/snapshot
runtime identity failures use the specific codes above.

Unknown major versions, unknown required fields, and unsupported semantics are errors.
No compatibility error may mutate project or harness state.

## 6. Immutable artifact handoff

`OrgWorkerBundleV1` identifies artifacts but does not carry their bytes. Fresh-project
frozen installation therefore requires one additional input owned by the release
pipeline:

```ts
interface WorkerArtifactSnapshotV1 {
  wireVersion: "worker-artifact-snapshot@1";
  sourceBundleDigest: `sha256:${string}`;
  artifacts: Array<{
    artifactPinRef: string;
    kind: "worker_root" | "card";
    name: string;
    version: string;
    integrity: `sha256:${string}`;
    treeSha?: string;
    gitCommit?: string;
    contentArchiveDigest: `sha256:${string}`;
    contentPath: string;
  }>;
}
```

The packet is a transfer envelope, not a second source of desired state. It must:

- bind every materializable bundle pin exactly once;
- contain no absolute path;
- resolve `contentPath` inside an explicitly supplied packet root;
- reject symlinks, traversal, device files, and mutable external references;
- verify archive/tree bytes before any project mutation;
- prove the complete Worker-root closure;
- contain no credential, runtime receipt, harness output, or readiness claim.

If the release program chooses a preseeded immutable Worker store instead, it must
provide equivalent identity, closure, and no-network evidence. The addendum does not
authorize deriving an installable ref from the bundle's opaque `origin` string.

## 7. Project state and operation state

### 7.1 Committed project intent

Fresh materialization derives the existing supported files:

```text
.agents/drwn/config.json
.agents/drwn/card.lock
```

Rules:

- `config.workers` preserves `orderedWorkerRoots` order;
- each requirement is exact and reconstructed from the immutable artifact snapshot,
  never from a floating origin;
- `activeWorker` is the name referenced by `activeWorkerRoot`, or `null`;
- `card.lock` contains the complete resolved closure with exact version, integrity,
  origin, tree/Git evidence, and content paths;
- organization consent is not serialized into
  `CardLockEntry.instructionConsent`;
- an existing unrelated project fails with a stable conflict unless an explicit
  reconcile operation proves it is the same previously managed bundle state.

Config and lock remain committed project intent and use the existing recoverable
project-state transaction.

### 7.2 Worker-owned materialization record

Add ignored runtime evidence:

```text
.agents/drwn/org-worker-materialization.json
```

The record is not desired organization truth. It records only the latest verified
Worker-local relationship:

```ts
interface OrgWorkerMaterializationRecordV1 {
  schema: "drwn.org-worker-materialization";
  schemaVersion: 1;
  sourceBundle: {
    digest: `sha256:${string}`;
    workerId: string;
    blueprintId: string;
    blueprintRevision: number;
    blueprintDigest: `sha256:${string}`;
  };
  projectState: {
    configDigest: `sha256:${string}`;
    lockDigest: `sha256:${string}`;
    orderedRootNames: string[];
    activeWorker: string | null;
  };
  artifactBindings: Array<{
    artifactPinRef: string;
    cardName: string;
    version: string;
    integrity: `sha256-${string}`;
    treeSha: string;
    gitCommit: string;
  }>;
  instructionConsentEvidence: Array<{
    consentId: string;
    artifactPinRef: string;
    contentDigest: `sha256-${string}`;
    consentedRange: string;
    ratifierRef: string;
    evidenceRefs: string[];
  }>;
  projection: {
    instructionId: string | null;
    contentDigest: string | null;
    ownershipHash: string | null;
    adapterState: string;
  };
  lastVerifiedReceiptId: string;
}
```

`artifactBindings` is uniquely sorted by `artifactPinRef` and covers the complete
materialized Card closure. On load, Worker compares every binding plus the exact
config and lock digests, ordered roots, and active Worker against current project
state before reconstructing external consent. This avoids inferring Card identity
from an opaque artifact pin while keeping content paths out of runtime evidence.

No instruction body, secret, absolute content path, raw provider response, grant,
protocol body, or readiness result is permitted.

### 7.3 Durable operation journal

Add:

```text
.agents/drwn/.org-worker-materialization-journal.json
```

Phases:

```text
validated
  -> artifacts_verified
  -> project_state_committed
  -> projection_applied
  -> read_back_verified
  -> receipt_persisted
  -> completed
```

Failure after a phase remains recoverable. Re-entry with the same operation ID and
same request resumes; the same ID with different bytes fails. The journal is removed
only after the receipt and materialization record are durable.

Per-file writes remain atomic. The operation as a whole is journaled and reconciled;
the implementation must not claim one atomic transaction across user files, config,
lock, generated state, adapters, and receipts.

## 8. Receipt contract

The Org packet currently requires `worker-materialization-receipt@1` but provides only
the general `organization-receipt@1` envelope with
`receiptKind: "worker_materialization"`. Before implementation, Worker and Foundry
owners must freeze the following relationship:

1. Darwinian Worker emits a bounded `worker-materialization-receipt@1`.
2. Foundry verifies its digest and records or references it in an
   `organization-receipt@1` whose kind is `worker_materialization`.
3. Neither receipt copies instruction content or mutable local paths.

Proposed Worker receipt:

```ts
interface WorkerMaterializationReceiptV1 {
  receiptVersion: "worker-materialization-receipt@1";
  receiptId: string;
  operationId: string;
  action: "materialize" | "reconcile" | "remove";
  outcome: "verified" | "removed" | "blocked" | "failed";
  sourceBundle: {
    digest: `sha256:${string}`;
    workerId: string;
    sourceBlueprint: {
      id: string;
      revision: number;
      digest: `sha256:${string}`;
    };
  };
  consumer: {
    name: "darwinian";
    version: string;
    compatibilityProfile: "drwn-org-worker-materialization@1";
  };
  artifactVerification: {
    verifiedPinRefs: string[];
    snapshotDigest: `sha256:${string}`;
  };
  projectState: {
    configDigest: `sha256:${string}` | null;
    lockDigest: `sha256:${string}` | null;
    orderedRootNames: string[];
    activeWorker: string | null;
  };
  instructionProjection: {
    state: "absent" | "current" | "drifted" | "blocked" | "removed";
    instructionId?: string;
    contentDigest?: string;
    ownershipHash?: string;
    adapterState: string;
  };
  verifiedConsentIds: string[];
  checks: Array<{
    code: string;
    result: "passed" | "failed" | "not_applicable";
  }>;
  priorReceiptDigest?: `sha256:${string}`;
  observedAt: string;
}
```

Receipt rules:

- success is emitted only after config, lock, generated Worker state, instruction
  projection, ownership record, and adapter state pass read-back;
- both success outcomes, `verified` and `removed`, require
  `ARTIFACT_BYTES`, `PROJECTION_OWNERSHIP`, `PROJECT_STATE`, and
  `VENDOR_CONTENT` checks with `passed` results;
- `--dry-run` returns a plan, never a success materialization receipt;
- `--no-write` may emit validation output, never a materialization receipt;
- blocked/failed receipts state exactly which bounded checks failed and make no
  applied-state claim;
- `verifiedConsentIds` is the complete uniquely sorted bundle instruction-consent
  set after every consent is checked against its exact verified artifact bytes; the
  active-root instruction projection remains separately bound by `instructionId`,
  `contentDigest`, and `ownershipHash`;
- receipt body canonicalization is frozen and tested with independent vectors;
- receipt digest uses:

```text
UTF8("darwinian:worker-materialization-receipt:v1\n")
  || darwinianCanonicalJsonV1(completeReceiptIncludingReceiptId)
```

- bundle identity uses the producer's domain:

```text
UTF8("darwinian:org-worker-bundle:v1\n")
  || darwinianCanonicalJsonV1(bundle)
```

- injected clock and operation ID make tests reproducible;
- same operation/same request after completion returns the prior receipt;
- same operation/different request is an idempotency conflict;
- receipt storage is append-only; never overwrite a prior receipt.

## 9. Apply, read-back, reconcile, and remove

### 9.1 Materialize

```text
verify packet identity
 -> parse strict bundle
 -> compute producer-compatible bundle digest
 -> evaluate Worker/profile compatibility
 -> verify artifact snapshot and complete closure
 -> derive exact config/lock bytes
 -> derive effective external consent evidence
 -> produce deterministic change plan
 -> acquire operation/project locks
 -> commit config/lock transaction
 -> populate and independently verify raw vendored artifact trees
 -> run full project sync with explicit consent evidence
 -> read back every owned postcondition
 -> append success receipt
 -> persist materialization record
 -> complete journal
```

### 9.2 Reconcile

Reconcile accepts the desired bundle and artifact snapshot again. It compares:

- desired bundle digest;
- last verified materialization record;
- current config/lock digests;
- current resolved artifact identities;
- current generated Worker state;
- current instruction block and adapter ownership;
- immutable prior receipts.

Classification:

```text
in_sync
pending
partially_applied
drifted
blocked
removed
unknown_due_to_missing_evidence
```

Repair uses the same plan/apply/read-back path. It never edits the bundle to match
drift and never overwrites unmanaged bytes.

### 9.3 Remove

Removal requires:

- the exact bundle digest or a superseding bundle operation;
- the prior materialization record;
- ownership proof for each state item to be removed;
- a pre-removal plan and post-removal read-back.

Removal:

- removes organization-derived effective consent evidence;
- removes or updates only roots/config/lock bytes proven owned by the prior operation;
- invokes existing instruction cleanup, which removes only unchanged owned blocks;
- preserves user-authored `AGENTS.md` bytes and foreign Claude content;
- preserves unrelated roots, project overlays, local consent, and local Card state;
- fails closed on ownership drift;
- appends a `removed` receipt only after read-back.

## 10. Ordered TDD implementation tasks

### Task 0 — Freeze the cross-owner contract

**Darwinian Worker files**

- Modify: `.ai/tasks/cl0024_addendum01_org-worker-bundle-materialization-alignment.md`
- Create: `test/fixtures/org-worker-materialization-v1/README.md`

**Darwinian Org prerequisites**

- Create or freeze:
  `.ai/contracts/organization-provisioning-v1/worker-materialization-receipt.schema.json`
- Modify packet descriptor and manifest to include the receipt schema.
- Publish the producer negative fixture manifest as immutable bytes.
- Freeze the artifact snapshot/content-transfer contract or explicitly approve the
  equivalent preseeded-store contract.
- Correct stale CL0024 status text in the target architecture.

**RED**

- current Worker `0.9.0` does not satisfy fixture minimum `1.0.0`;
- no standalone Worker materialization receipt schema exists;
- no immutable content-transfer packet exists for a fresh project;
- the non-empty `projectOverlay` mapping is not frozen.

**GREEN**

- owner decision records resolve each mismatch;
- exact packet/package identities and digests are recorded;
- the supported consumer profile is approved;
- no product code begins while any blocker remains unresolved.

### Task 1 — Add canonical bundle identity and compatibility preflight

**Files**

- Modify: `cli/core/org-worker-bundle-v1.ts`
- Create: `cli/core/org-worker-compatibility.ts`
- Create: `test/core-org-worker-compatibility.test.ts`
- Modify: `test/org-worker-bundle-v1-conformance.test.ts`

**RED**

- plain SHA-256 and producer domain-separated digest differ without detection;
- Worker `0.9.0` accepts a `minimumWorkerVersion` of `1.0.0`;
- unsupported environment, overlay, artifact kind, or receipt version passes;
- unknown required semantics produce a warning instead of an error.

**GREEN**

- share or independently reproduce the frozen canonical JSON vectors;
- compute the producer-compatible bundle digest;
- compare `DRWN_VERSION` against the minimum version;
- return a deterministic compatibility report with stable codes;
- prove preflight performs no writes or network calls.

```bash
bun test ./test/core-org-worker-compatibility.test.ts
bun test ./test/org-worker-bundle-v1-conformance.test.ts
```

### Task 2 — Verify immutable artifact handoff

**Files**

- Create: `cli/core/org-worker-artifact-snapshot.ts`
- Create: `test/core-org-worker-artifact-snapshot.test.ts`
- Add frozen positive and negative packet fixtures under:
  `test/fixtures/org-worker-materialization-v1/`

**RED**

- missing, duplicate, extra, wrong-kind, wrong-version, wrong-integrity, incomplete
  closure, traversal, symlink, absolute path, archive-digest mismatch, and mutable
  source pass;
- artifact verification reads the network;
- diagnostics leak absolute paths or content.

**GREEN**

- verify exact bundle-to-snapshot bijection for supported pins;
- verify all content bytes before project mutation;
- expose only stable pin IDs and bounded codes;
- prove no network call occurs.

```bash
bun test ./test/core-org-worker-artifact-snapshot.test.ts
```

### Task 3 — Derive a fresh project plan

**Files**

- Create: `cli/core/org-worker-materialization-plan.ts`
- Modify only through reusable seams:
  `cli/core/worker-project.ts`,
  `cli/core/card-lock.ts`,
  `cli/core/project.ts`
- Create: `test/core-org-worker-materialization-plan.test.ts`

**RED**

- empty project cannot derive config/lock;
- root order or active-root mapping changes;
- an existing unrelated project is silently replaced;
- a floating requested ref appears in generated project intent;
- organization consent is copied into local `instructionConsent`.

**GREEN**

- pure planner returns exact config/lock bytes, artifact closure, effective external
  consent evidence, intended projection identities, and a deterministic change set;
- same inputs produce byte-identical plan bytes;
- planner performs no mutation;
- conflicts are stable and bounded.

```bash
bun test ./test/core-org-worker-materialization-plan.test.ts
```

### Task 4 — Add provenance-preserving effective instruction consent

**Files**

- Create: `cli/core/instruction-consent-evidence.ts`
- Modify: `cli/core/instruction-contribution.ts`
- Modify: `cli/core/sync-instructions.ts`
- Modify: `cli/core/sync-project-instructions.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/types.ts`
- Create: `test/core-instruction-consent-evidence.test.ts`
- Extend: `test/commands-write-instructions.test.ts`

**RED**

- valid bundle consent is ignored by composition;
- bundle consent is persisted as local operator consent;
- a consent for another Worker/pin/surface/version/digest authorizes bytes;
- a later ordinary write loses verified organization consent without diagnosing
  materialization state;
- `card trust` or `card untrust` mutates organization evidence.

**GREEN**

- one resolver validates both consent-evidence variants;
- composer includes exact bytes authorized by verified bundle evidence;
- local and organization provenance remain distinct in state and diagnostics;
- invalid or removed bundle evidence immediately excludes the contribution;
- strict mode fails before mutation for invalid required evidence.

```bash
bun test ./test/core-instruction-consent-evidence.test.ts
bun test ./test/commands-write-instructions.test.ts
```

### Task 5 — Add journal and materialization-record primitives

**Files**

- Create: `cli/core/org-worker-materialization-record.ts`
- Create: `cli/core/org-worker-materialization-journal.ts`
- Modify: `cli/core/paths.ts`
- Modify: `cli/core/git-hygiene.ts`
- Create:
  `test/core-org-worker-materialization-record.test.ts`,
  `test/core-org-worker-materialization-journal.test.ts`

**RED**

- malformed, path-bearing, content-bearing, or secret-bearing records pass;
- same operation ID/different request replays;
- crash after every phase cannot recover;
- journal is deleted before durable receipt/record persistence.

**GREEN**

- strict schemas, bounded sizes, safe paths, injected clock, idempotency, recovery,
  and phase transitions are deterministic;
- runtime files are explicitly ignored;
- no record becomes organization desired truth.

```bash
bun test ./test/core-org-worker-materialization-record.test.ts
bun test ./test/core-org-worker-materialization-journal.test.ts
```

### Task 6 — Apply, read back, and emit the Worker receipt

**Files**

- Create: `cli/core/org-worker-materializer.ts`
- Create: `cli/core/worker-materialization-receipt.ts`
- Modify: `cli/commands/install.ts`
- Modify: `cli/core/project-state-transaction.ts` only if a reusable recovery hook is
  required; do not weaken its current guarantees.
- Create: `test/commands-install-org-worker-materialization.test.ts`
- Create: `test/core-org-worker-materializer.test.ts`
- Create: `test/core-worker-materialization-receipt.test.ts`

**RED**

- receipt exists before sync;
- failed sync leaves a success receipt;
- read-back mismatch succeeds;
- normalization-tolerant vendor verification accepts different raw bytes or Git tree;
- dry-run/no-write emits a materialization receipt;
- receipt contains content, secret, absolute path, or unbounded diagnostics;
- same operation/same request creates duplicate receipts.
- concurrent operations race journal/state/receipt creation;
- a crash after receipt or record persistence cannot resume;
- a matching incomplete journal cannot repair corrupted config/lock;
- multi-root projection claims the first root instead of the active root;
- hook consent is claimed without a separately verified hook projection mapping.

**GREEN**

- install requires bundle, artifact snapshot, and explicit operation ID together in
  frozen mode;
- fresh project config/lock are committed through the existing transaction;
- one project owner lock serializes journal, state, vendor, sync, receipt, and record
  mutation;
- full sync receives verified external consent evidence;
- read-back independently verifies config/lock bytes, normalized Card integrity, raw
  content-tree digest, Git tree identity, generated projection, ownership, and adapter
  state;
- success receipt and materialization record are persisted after verification;
- same-request recovery completes after crashes at receipt and record durability
  boundaries without duplicating evidence;
- failures remain recoverable and make no success claim;
- the current profile rejects hook consent until an exact hook evidence mapping is
  separately implemented.

```bash
bun test ./test/core-worker-materialization-receipt.test.ts
bun test ./test/core-org-worker-materializer.test.ts
bun test ./test/commands-install-org-worker-materialization.test.ts
```

### Task 7 — Add reconcile, repair, and owned removal

**Files**

- Extend: `cli/core/org-worker-materializer.ts`
- Extend: `cli/commands/install.ts` with the approved idempotent `--reconcile`
  surface and mutually exclusive explicit `--remove` surface.
- Create: `test/commands-org-worker-reconcile.test.ts`
- Create: `test/commands-org-worker-remove.test.ts`

**RED**

- repeated application makes changes;
- config/lock, vendor, instruction, adapter, or record drift is missed;
- repair overwrites unmanaged bytes;
- removal deletes unrelated roots, local consent, user `AGENTS.md`, or foreign Claude
  content;
- removal succeeds without the prior record or exact bundle identity.
- crashes after project state, sync, receipt, or removed-record persistence cannot
  resume;
- removal drops unrelated roots, local instruction consent, project overlay fields,
  or user bytes outside the managed instruction block;
- missing or drifted owned vendor bytes/sidecars are deleted after config mutation.

**GREEN**

- same desired and observed state is a true no-op;
- every drift class is stable and repairable only with ownership proof;
- removal cleans only proven bundle-owned state;
- repaired/removed postconditions receive independent read-back and receipts.
- removed-state evidence remains durable, points to the chained append-only removal
  receipt, and can never rehydrate organization consent;
- removal is resumable at every durability boundary and retains unrelated active
  root projection and semantic config/lock state.

```bash
bun test ./test/commands-org-worker-reconcile.test.ts
bun test ./test/commands-org-worker-remove.test.ts
```

### Task 8 — Extend diagnostics without conflating readiness

**Files**

- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/commands/status.ts`
- Modify: `cli/commands/doctor.ts`
- Create: `test/commands-org-worker-materialization-diagnostics.test.ts`
- Modify existing status/doctor JSON and human-renderer tests.

Add an additive project section:

```ts
orgWorkerMaterialization?: {
  state:
    | "absent"
    | "compatible"
    | "current"
    | "drifted"
    | "blocked"
    | "removed"
    | "unknown";
  bundleDigest?: string;
  workerId?: string;
  blueprintDigest?: string;
  lastVerifiedReceiptId?: string;
  instructionConsentSource?: "local" | "organization" | "mixed";
  issues: Array<{
    code: string;
    severity: "error" | "warning" | "advisory";
  }>;
}
```

This section reports Worker-local evidence only. It never reports organization
readiness.

Classification is evidence-closed and read-only:

- `current` and `removed` require exact config and lock digests, the matching
  last receipt action/outcome/source, complete verified pin and consent sets,
  no live operation journal, and consistent artifact/projection or tombstone
  state;
- `removed` additionally requires its `priorReceiptDigest` to identify exactly
  one prior verified receipt for the same bundle;
- a valid incomplete journal is `blocked`;
- valid evidence with a state mismatch is `drifted`;
- orphaned, malformed, or missing evidence is `unknown`;
- no materialization evidence is `absent`.

Only bounded issue codes and stable identities are exposed. Diagnostics never
return instruction content, local paths, secrets, or remote state.

```bash
bun test ./test/commands-org-worker-materialization-diagnostics.test.ts
bun test ./test/commands-status.test.ts
bun test ./test/commands-doctor.test.ts
```

### Task 9 — Run released producer/consumer and fresh-project qualification

**Files**

- Extend immutable fixtures under:
  `test/fixtures/org-worker-materialization-v1/`
- Create: `test/scenarios-org-worker-materialization.test.ts`
- Update the Darwinian Org cross-repository verification runner only after the Worker
  artifact is packaged and immutable.

**Journey**

```text
accepted GTM blueprint/envelope
 -> released producer package
 -> exact OrgWorkerBundleV1 bytes
 -> released artifact snapshot/content packet
 -> empty project
 -> frozen compatibility preflight
 -> fresh config/lock
 -> organization-consented instruction projection
 -> read-back
 -> worker-materialization-receipt@1
 -> no-op reconcile
 -> tamper/repair matrix
 -> owned removal
 -> removed receipt
```

Run every producer golden and negative fixture. Released artifacts, not sibling source
paths, must pass. Missing publication is `BLOCKED/NOT RUN`, not green.

### Task 10 — Documentation, release, and deployment handoff

**Files**

- Modify: `docs/contracts/project-worker-v1.md`
- Modify: `docs/cli-quickref.md`
- Modify relevant `docs-docusaurus/` Worker-instruction, install, status, doctor, and
  troubleshooting pages.
- Modify: `CHANGELOG.md`
- Update CL0024 and Darwinian Org execution evidence without rewriting prior entries.

Document:

- local versus organization consent provenance;
- supported materialization profile and compatibility errors;
- immutable artifact handoff;
- dry-run versus receipt semantics;
- journal recovery;
- drift, repair, removal, and ownership boundaries;
- receipt-to-Foundry mapping;
- unsupported overlay/artifact kinds;
- version-floor behavior;
- rollback.

```bash
bun test ./test/core-org-worker-compatibility.test.ts
bun test ./test/core-org-worker-artifact-snapshot.test.ts
bun test ./test/core-org-worker-materialization-plan.test.ts
bun test ./test/core-instruction-consent-evidence.test.ts
bun test ./test/core-org-worker-materialization-record.test.ts
bun test ./test/core-org-worker-materialization-journal.test.ts
bun test ./test/core-worker-materialization-receipt.test.ts
bun test ./test/commands-install-org-worker-materialization.test.ts
bun test ./test/commands-org-worker-reconcile.test.ts
bun test ./test/commands-org-worker-remove.test.ts
bun test ./test/core-org-worker-materialization-diagnostics.test.ts
bun test ./test/scenarios-org-worker-materialization.test.ts
bun test ./test/
bunx tsc --noEmit
bun run docs:build
bun run verify:release
git diff --check
```

Live deployment, paid provider calls, machine-capability application, authorization
rollout, and readiness evaluation remain separately governed by
`PROV-DEPLOY-TEST`.

## 11. Required adversarial matrix

At minimum:

| Dimension | Cases |
|---|---|
| packet identity | wrong packet ID/version/manifest/file digest |
| bundle identity | noncanonical bytes, wrong domain digest, duplicate/unknown keys |
| compatibility | lower Worker version, wrong environment, overlay, artifact kind, receipt version |
| artifacts | missing/extra/duplicate pin, wrong version/integrity/tree/archive, traversal, symlink |
| roots | zero/one/many, order drift, dangling active root, active null |
| consent | absent, wrong Worker/pin/kind/surface/range/digest, empty evidence, changed bytes |
| existing project | empty, exact prior state, unrelated state, partial prior operation, local overlays |
| projection | absent/current/content drift/ownership drift/malformed markers/adapter variants |
| crash recovery | failure after every journal phase |
| idempotency | same key/same request, same key/different request, concurrent calls |
| reconcile | unavailable observation, missing record, partial apply, managed drift, unmanaged drift |
| removal | exact owned state, edited owned state, unrelated roots, local consent, user file edits |
| privacy | instruction text, secret keys, absolute paths, raw provider errors, unbounded fields |
| released boundary | package/fixture checksum mismatch, sibling-path substitution, missing artifact |

## 12. Exit criteria

This addendum is complete only when:

- cross-owner receipt and artifact-transfer contracts are frozen;
- the exact released Worker version satisfies the bundle minimum;
- producer-compatible bundle identity is independently verified;
- fresh-project frozen materialization succeeds without network resolution;
- every supported artifact pin and the complete Card closure are verified;
- organization consent projects exact instruction bytes without becoming local consent;
- config/lock/root order/active selection are deterministic;
- success receipt follows read-back and conforms to
  `worker-materialization-receipt@1`;
- Foundry can verify and envelope/reference the Worker receipt;
- crash recovery and idempotency pass at every phase;
- reconcile reaches a true no-op at convergence;
- repair and removal never overwrite or delete unmanaged state;
- diagnostics report local materialization evidence without claiming readiness;
- released producer and consumer artifacts pass the cross-repository matrix;
- full tests, typecheck, docs, release verification, and diff checks pass with exact
  counts;
- live/deployed gates are recorded honestly as pass, fail, blocked, or `NOT RUN`.

## 13. Stop conditions

Stop before mutation if:

- Worker/packet/receipt owners have not approved the contract identities;
- current Worker version is below `minimumWorkerVersion`;
- artifact bytes cannot be resolved immutably without network access;
- a required artifact kind or overlay semantic is unsupported;
- bundle, snapshot, Card, consent, or source-blueprint identity does not close;
- an existing project cannot be attributed to the same prior materialization;
- the operation journal or prior receipt chain is malformed;
- ownership proof is missing for repair or removal;
- a success receipt would precede postcondition verification.

Do not recover by lowering the producer's minimum version locally, copying
organization consent into local consent, trusting first-party origin, fetching a
floating ref, ignoring unsupported pins, overwriting user files, deleting evidence,
or calling validation output a materialization receipt.

## 14. Rollback

Before release, remove only the addendum-owned adapter, record, journal, receipt, and
command wiring while preserving the existing CL0024 projection implementation.

After release:

1. fence new materialization operations;
2. preserve all journals and receipts;
3. disable the affected compatibility profile or denylist the bad bundle/packet digest;
4. reconcile or remove only through prior ownership evidence;
5. publish a forward-compatible corrected Worker patch and, if needed, a corrected
   immutable Org packet;
6. never rewrite an accepted blueprint, bundle, or prior receipt.

## 15. Evidence log

Append; do not rewrite prior evidence.

| Timestamp | Task | Worker revision | Org/packet identity | RED | GREEN | Evidence | Actor |
|---|---|---|---|---|---|---|---|
| 2026-07-23 | Addendum draft | `57b8721` | Org `c636cb9`; packet `organization-provisioning-v1@1.0.0` | Document audit found A01–A14, including version, consent, receipt, artifact-transfer, and reconciliation gaps | Draft only; no product code or external system mutation | `.ai/tasks/cl0024_addendum01_org-worker-bundle-materialization-alignment.md` | Codex |
| 2026-07-24 | Worker Tasks 1–10 implementation and qualification | `fbcd4089fe4cbea8c4db8cd93c91f1e6262aed7d` plus scoped uncommitted changes | Org packet `organization-provisioning-v1@1.0.1`; packet `9be2e385...94f3`; manifest file `d1a0cc18...380e`; Worker boundary manifest `fc9632d3...c0f2` | Focused RED tests exposed missing compatibility/artifact/plan/record/journal/receipt/materializer/diagnostic modules, premature or incomplete success evidence, unsafe recovery/removal/diagnostic receipt reads, missing stable semantic codes, and missing fresh-process lifecycle coverage | Focused suites green; fresh-process scenario 2/2 (157 expects); full `bun test ./test/` 1,717 pass · 6 environment/live skip · 0 fail (7,680 expects, 296 files); typecheck, docs build, release verifier, and diff check green | Immutable bundle/snapshot/content and materialize/reconcile/remove receipt fixtures are checksum-pinned. Task 48 owner reports Org packet checksum verification and Node contract 11/11 green. Live deployment/provider/authorization/readiness gates not implied. No commit. | Codex |
