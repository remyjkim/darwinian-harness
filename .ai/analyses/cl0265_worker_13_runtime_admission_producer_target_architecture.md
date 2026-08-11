<!-- ABOUTME: Freezes I265's hard-cut Worker 1.3 runtime-admission producer and materializer contract. -->
<!-- ABOUTME: Separates source implementation from I267 release execution and I268 Finch Card publication. -->

# I265 — Worker 1.3 Runtime-Admission Producer Target Architecture

**Date:** 2026-08-10
**Author:** I265 Worker A
**Status:** Ready for G1 re-review
**Issue:** I265, child of I238
**Repository:** `remyjkim/darwinian-worker`
**Frozen base:** `53da51e68e3d8f426b80a1830818fc36bb0a9a01`
**References:** I265 handoff; stable I264 child handoff plus direct coordination events `architecture-coordinator-20260809T221527Z-010`, `architecture-coordinator-20260809T221721Z-011`, `architecture-coordinator-20260809T222052Z-013`, and `architecture-coordinator-20260809T224145Z-017`; rejected-ref G1 verdict `architecture-coordinator-20260809T233057Z-026`; I266 comparator acceptance `i266-owner-reviewer-20260809T234030Z-207`; I268 replacement-schema/comparator handoff `i268-owner-reviewer-20260809T234134Z-010`; I265 nested-inert-byte correction `i265-owner-20260809T234432Z-012`; I268 correction `i268-owner-reviewer-20260809T234904Z-011`; superseded I265 acceptance `i265-owner-20260809T235040Z-013`; executable-rule finding `i266-owner-reviewer-20260809T235108Z-211`; I265 supersession `i265-owner-20260809T235246Z-014`; exact executable rule `i268-owner-reviewer-20260809T235610Z-012`; fresh I265 acceptance/current-digest confirmation `i265-owner-20260809T235736Z-015` and `i265-owner-20260809T235950Z-016`; I266 exact acceptance `i266-owner-reviewer-20260809T235908Z-212`; shared-handshake closure `i265-owner-20260810T000025Z-017`; immutable I268 exact-ref submission `i268-owner-reviewer-20260810T000303Z-014`; I268 ordered passes `i268-owner-reviewer-20260810T000705Z-015` and `i268-owner-reviewer-20260810T001306Z-018`; crash-safe writer finding `architecture-coordinator-20260810T004351Z-032`; coordination reset `architecture-coordinator-20260810T005202Z-034`; atomic-no-replace G1 finding `architecture-coordinator-20260810T033057Z-038`; authoritative parent-substitution findings `architecture-coordinator-20260810T040257Z-152` and `architecture-coordinator-20260810T040826Z-154`; reopened I268 durability findings `architecture-coordinator-20260810T041432Z-055`; I265 correction verdict `architecture-coordinator-20260810T041433Z-056`; combined cross-log hold `architecture-coordinator-20260810T041614Z-057`; ambiguous-link finding `architecture-coordinator-20260810T042545Z-060`; replacement-correction authority `architecture-coordinator-20260810T043108Z-062`; descriptor-temp escape finding `architecture-coordinator-20260810T043800Z-065`; Worker fixture-ownership parent resolution `architecture-coordinator-20260810T065820Z-176`; J1 exact-ref acceptance and I265 hold release `architecture-coordinator-20260810T081731Z-181`, both recorded in the darwinian-services repository's authoritative coordination log `.ai/coordination/080826_i238_259_alignment_log.jsonl`; Services `origin/main` I259 runtime-admission contracts. Mutable I264 corrections are informative and do not supersede I265's direct reviewed lane contract.

---

## Executive summary

I265 makes every Worker deployment prove a complete immutable runtime-admission declaration before the Worker creates a store archive or the materializer changes the filesystem. Every Card in the selected closure must carry both `runtimeAdmission` and `applicationRequirements`. Old, all-absent, `null`, mixed, and partially migrated closures fail in every runtime-admission mode. `runtime_admission_mode=off` changes neither declaration coverage nor configuration resolution and cannot reactivate a legacy path.

The implementation adds strict optional source fields for Card-history parsing, one pure closure derivation module, a required deploy envelope for every admissible payload, and materializer rederivation before the first effect. Worker `1.3.0` becomes the first capable producer. The source tree also removes the obsolete packaged Buzz registry Card and advances every current release-controlled Worker surface coherently to `1.3.0`.

This lane ends at reviewed Worker source. I267 exclusively owns candidate creation, qualification, tagging, npm publication, registry reconciliation, Services image adoption, and final release receipts. I268 exclusively owns the actual Finch tools/root Cards. I265 performs no publication, environment mutation, migration, key operation, deployment, lease, candidate creation, ACP session, or Buzz traffic.

## SCQA

### Situation

I259 already defines Services-owned runtime health/currentness around strict `EffectiveMcpActivationV1` and `RuntimeRequirementManifestV1` structures. The production Deploy API is the only public control plane, while executable state, snapshots, runtime secrets, Engine/Mind/Pipedream work, and Finch traffic belong to staging-main.

Worker `main` resolves immutable Card closures, emits portable `WorkerDeployPayload` objects, and materializes from a lock plus store export. The frozen source base is clean. The exact Bun 1.2.21 baseline passes 2,203 tests, with 10 explicit skips and zero failures.

### Complication

Worker has no typed Card source for runtime admission, deterministic producer envelope, or materializer parity check. `buildWorkerDeployPayload()` currently creates its archive before any such proof can occur. `validateMaterializePayload()` verifies only the outer contract/store digest, and `materializeWorkerPayload()` begins with `mkdir`.

The package is still coherently wired to `1.2.0`, including build/auth identities, release provenance, workflows, docs, and tests. It also ships `registry/cards/buzz-delivery-worker/card.json`, which is not the actual Finch Card but is treated as a required package/release member by current consumers.

### Question

What smallest Worker-only change makes immutable closure intent independently reproducible, rejects every unproven deployment before effects, advances source coherently to `1.3.0`, and avoids taking Services, release-publication, or Finch-publication authority?

### Answer

Add one pure `runtime-admission-manifest` module. Strictly parse both declarations, require both on every deployable Card, derive canonical activation/requirements/closure hashes from the exact locked closure, and emit one required `WorkerDeployPayload.runtimeAdmission`. Run derivation before store export. At materialization, strictly rederive and deep-compare before `mkdir`, temp archive creation, extraction, write, hydration, sync, or emitted artifacts. Delete the legacy packaged Buzz registry Card and retire its nine current consumers. Advance current release-controlled source/test/doc/workflow identity to `1.3.0`, but leave outward release and Finch actions to I267/I268.

## 1. Evidence-backed current state

### 1.1 Producer and materializer ordering

`cli/core/worker-deploy.ts::buildWorkerDeployPayload()` resolves the closure, maps portable entries, and calls `buildStoreExport()` while constructing the returned object. `buildStoreExport()` creates a temp directory and tar. Admission derivation must therefore finish after resolution and before that call.

`cli/core/worker-materialize.ts::materializeWorkerPayload()` computes store bytes and then calls `mkdir(agentsDir)` as its first filesystem effect. The exported entrypoint itself, not only its CLI caller, must complete runtime-admission validation before that line.

The zero-effect boundary covers target directory creation, task temp/archive creation, archive write/extraction, config/lock directory creation and writes, Card hydration, repository sync, and project/store snapshot emission.

### 1.2 Manifest, lock, and release seams

`CardManifest` has neither declaration. `assertValidCardManifest()` validates authored manifests and `validateCardLockfile()` revalidates each embedded manifest. `minimumDrwnVersionForManifests()` owns the lock floor. These are the existing schema, preservation, and `1.3.0` seams.

`package.json` is `1.2.0`; runtime version correctly derives from adjacent package metadata. Current release identity is also encoded by `cli/core/build-identity.ts`, `cli/core/auth/receipt.ts`, readiness/release scripts, both release workflows, release docs, and their tests. Root version is absent from `bun.lock`, so that lock changes only if dependency resolution independently changes.

### 1.3 Legacy registry consumers

Delete `registry/cards/buzz-delivery-worker/card.json` and retire these nine current consumers:

1. `scripts/release/artifact-contract.ts`;
2. `scripts/verify-release-readiness.ts`;
3. `test/core-version.test.ts`;
4. `test/i105-buzz-card.test.ts`;
5. `test/i105-buzz-rollout-evidence.test.ts`;
6. `test/package-readiness.test.ts`;
7. `test/scripts-verify-worker-contract.test.ts`;
8. `.ai/tasks/cl0105_buzz_delivery_runbook.md`; and
9. `.ai/tasks/cl0105_buzz_rollout_evidence.json`.

The dated I239 analysis remains historical evidence, not a current release consumer. Any retained I105 document must become explicitly historical/non-actionable and must not direct a reader or verifier to the deleted file.

## 2. Hard-cut matrix

These results apply equally in `off`, `observe`, and `enforce`:

| Closure/input | Producer | Materializer |
|---|---|---|
| Every Card has valid v1 runtime and application declarations | Derive required envelope | Rederive, exact-compare, continue |
| Every Card omits either declaration | Reject before archive | Reject before filesystem |
| Any declaration is `null` | Reject | Reject |
| Some Cards declare and others omit | Reject | Reject |
| Old/unknown declaration or derivation version | Reject | Reject |
| Envelope absent | Cannot emit admissible payload | Reject |
| Envelope malformed, noncanonical, oversized, or mismatched | Cannot emit admissible payload | Reject with sanitized code |

Explicit empty intent is valid:

```json
{
  "runtimeAdmission": { "version": 1, "servers": {}, "requirements": [] },
  "applicationRequirements": { "version": 1, "apps": [] }
}
```

Absence is not empty intent. There is no compatibility/shared-state fallback.

## 3. Card source declarations

Both fields remain optional only for general historical Card/lock parsing. When present they are strict; deployments require both on every Card.

### 3.1 Runtime declaration

```ts
interface CardRuntimeAdmissionV1 {
  version: 1;
  servers: Record<string, {
    authMode: "none";
    requirementIds: string[];
  }>;
  requirements: Array<{
    requirementId: string;
    probeId: "buzz-artifact-sha256-v1" | "glibc-version-v1";
    expected:
      | { artifactSha256: string }
      | { platformCapabilities: [string] };
  }>;
}
```

Normative rules:

- nested objects reject unknown keys and `version` is exactly `1`;
- identifiers are nonempty, at most 256 characters, and unique after NFC normalization;
- a Card declares exactly the raw server keys it owns, including `{}` when it owns none;
- each declared server is a complete raw local `stdio` server, not an inherited enabled-only override;
- `authMode` is exactly `none` and no token reference is accepted;
- declarations contain no command, argv, environment, URL, parser, provider, or network target;
- only `buzz-artifact-sha256-v1` and `glibc-version-v1` are allowed;
- the artifact probe accepts exactly one lowercase 64-hex `artifactSha256`;
- the glibc probe accepts exactly one capability matching `glibc>=<major>.<minor>`;
- every local requirement is referenced, every reference resolves once, and duplicates fail; and
- caller-authored `active`, `readiness`, `criticality`, or hashes fail.

### 3.2 Application declaration

```ts
interface CardApplicationRequirementsV1 {
  version: 1;
  apps: Array<{
    app: string;
    card?: {
      server: string;
      authMode: "none" | "bearer" | "oauth";
      tokenRef?: string;
      certification: "maintained" | "security-approved" | "uncertified";
    };
    pipedreamApp?: string;
  }>;
}
```

This exact-key Worker schema preserves the existing Services v1 meaning: each app has `card`, `pipedreamApp`, or both; bearer requires `tokenRef`; none/oauth forbid it; app IDs are NFC-unique; strings and the 128-entry array are bounded. Across a complete closure, identical declarations for one normalized app ID deduplicate and conflicting declarations fail. The canonical aggregate uses the explicit JavaScript UTF-16 code-unit comparator `left < right ? -1 : left > right ? 1 : 0`; it never uses `localeCompare`, `Intl`, or host locale. Current Services `origin/main` still uses `localeCompare` for this application aggregate and is not canonical-byte parity. I266 event `i266-owner-reviewer-20260809T234030Z-207` accepts ownership of the matching explicit comparator and discriminating vectors, including `"B"` versus `"a"`; I268 event `i268-owner-reviewer-20260809T234134Z-010` accepts comparison of independently produced canonical bytes without supplying ordering semantics. Their implementation gates remain independent. The field survives the lock and binds `closureHash` but remains separate from the runtime-requirements envelope. Finch later uses explicit `{ "version": 1, "apps": [] }` on every closure Card.

### 3.3 Version floor

Presence of either new field raises `store.minDrwnVersion` to at least exact `1.3.0`. Because all admissible deployments require both fields on every Card, every deployable strict closure has a `1.3.0` floor. Historical Cards can still be parsed outside this deploy contract but cannot deploy/materialize through it.

## 4. Pure derivation

Add `cli/core/runtime-admission-manifest.ts` as the sole Worker implementation of declaration parsing, coverage classification, canonical application aggregation, canonicalization, hashing, and envelope derivation. It has no filesystem, network, environment, clock, randomness, Services, or publication dependency. Card names/requested identities, server IDs, requirement IDs, and application IDs are also checked for exact/NFC collision across the selected closure before derivation.

For every valid server it derives `active: true`; optional readiness only from raw `optional: true`; `authMode: none`; and sorted `requirementIds`. Requirement `criticality` is required when any required server references it, otherwise optional.

The component shapes are the existing I259 contracts:

```ts
interface EffectiveMcpActivationV1 {
  schema: "darwinian.effective-mcp-activation";
  schemaVersion: 1;
  servers: Array<{
    serverId: string;
    active: true;
    readiness: "required" | "optional";
    authMode: "none";
    requirementIds: string[];
  }>;
  activationHash: string;
}

interface RuntimeRequirementManifestV1 {
  schema: "darwinian.runtime-requirements";
  schemaVersion: 1;
  requirements: Array<{
    requirementId: string;
    probeId: string;
    criticality: "required" | "optional";
    expected: {
      artifactSha256?: string;
      platformCapabilities?: string[];
    };
  }>;
  manifestHash: string;
}
```

### 4.1 Canonicalization

Worker copies the small I259 algorithm rather than importing Services:

- scalars use `JSON.stringify`; numbers must be safe integers;
- arrays retain their canonical order;
- undefined object members are omitted and remaining keys sort lexically;
- SHA-256 covers UTF-8 bytes and emits lowercase hex;
- activation servers and requirements use the same JavaScript code-unit ID comparator as I259;
- requirement ID and platform-capability arrays use the same default lexical sort; and
- exact/NFC-equivalent duplicates fail before ordering while original valid strings are preserved.

Cross-repository vectors pin byte-identical activation/requirement hashes to Services `origin/main:shared/mind-studio-shared/src/runtime-admission-contracts.ts`. There is no runtime cross-repository dependency.

### 4.2 Closure hash

`closureHash` covers canonical JSON for derivation version plus Cards sorted by `[name, version, treeSha, integrity]`. Each Card preimage contains `name`, `requested`, `version`, `integrity`, `treeSha`, `rawServers`, `runtimeAdmission`, and `applicationRequirements`. Raw executable configuration is hashed but never copied into the envelope. Meaningful mutation changes the hash; set-equivalent reordering does not.

## 5. Required deploy envelope

```ts
interface WorkerRuntimeAdmissionProducerEnvelopeV1 {
  schema: "darwinian.worker-runtime-admission";
  schemaVersion: 1;
  derivationVersion: "worker-runtime-admission-v1";
  closureHash: string;
  activation: EffectiveMcpActivationV1;
  runtimeRequirements: RuntimeRequirementManifestV1;
}
```

`WorkerDeployPayload.runtimeAdmission` is required for every valid deployed payload while top-level `contractVersion` remains `1`. Historical payload shapes are recognized only to reject.

The envelope is derived from the exact selected portable closure before `buildStoreExport()`, capped at 65,536 UTF-8 JSON bytes, and contains no archive/store bytes, raw command/argv/env/URL/parser, token reference, secret value, or Services-owned artifact identity. Caller input cannot override derived fields. Worker sends it only through the production Deploy API; I265 adds no Engine/Pipedream endpoint or fallback.

## 6. Materializer defense in depth

The exported materializer performs strict outer validation, strict required envelope/declarations validation, pure rederivation, and canonical deep equality before store processing or any filesystem effect. Direct callers are protected, not only the CLI.

Runtime-admission failures use stable code `WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID`. Messages may name a bounded structural category but never include full payloads, raw server configuration, archive bytes, environment, token references, credentials, or secrets. Store digest errors keep their existing outer-payload code.

Tests tamper typed payloads and prove that no target directory, temp archive, extracted member, staged config/lock, hydration, sync, or emitted tar exists.

## 7. Synthetic cross-lane vector

Add an explicitly non-publishable fixture under `test/fixtures/runtime-admission/` containing a complete synthetic input closure, expected producer envelope, one required `buzz-tools` activation, only the two approved probes, `glibc>=2.31`, exact adjacent I107 selectors outside the envelope, explicit empty apps, no third version probe, and no archive bytes.

Its artifact digest is syntactically valid but unmistakably synthetic and must not be presented as the unresolved production Finch digest. A `syntheticNonpublishable` marker stays outside canonical Card bytes. A sidecar records source paths and the fixture-byte SHA-256; it does not hash itself or embed the final commit. The final coordination receipt externally binds commit/tree and the producer, fixture, and sidecar blob identities per §7.3, avoiding self-reference.

This vector pins the pure semantic contract. I265 also accepts I268's request for one production-backed offline adapter so I268 can compare independent Worker and Services processes without importing either implementation.

### 7.1 Accepted Worker adapter handshake; implementation held

The binding is:

- production derivation: `cli/core/runtime-admission-manifest.ts`;
- process adapter: `cli/tools/runtime-admission-derive.ts`;
- package command: `runtime-admission:derive:v2`;
- invocation: `bun run runtime-admission:derive:v2 -- --input <derivation-input.json> --output <result.json>`;
- command version: `cl.i265.worker-runtime-admission-adapter.v1`;
- input schema: `cl.i268.finch-derivation-input.v1`;
- output schema: `cl.i268.finch-derivation-output.v2`;
- producer discriminator: `worker`; and
- runtime: the exact packaged Bun-compatible Worker runtime, with I267's qualified `darwinian@1.3.0` build identity required for production-candidate evidence.

The accepted input v1 is a closed fresh-process preimage rather than an identity-only candidate. It contains exact canonical base64 candidate bytes plus their external schema/phase/length/SHA-256 identity; exact phase and entrypoint; one ordered tools Card or the ordered two-Card root closure; for each Card, exact name/version/requested/integrity/tree plus canonical manifest bytes/length/SHA-256; exact canonical `card.lock` bytes/length/SHA-256 and `store.minDrwnVersion: 1.3.0`; the store-export format/compression/encoding/length/SHA-256 identity without archive bytes; exact phase evidence; and externally identified no-secret evidence covering the exact candidate, ordered manifests, and lock hashes. It contains no self identity. I268 serializes one input byte string once, and both producer adapters independently hash those same raw bytes into output-v2 `input.derivationInputIdentity`.

The raw input and output files are each bounded at 1,048,576 UTF-8 bytes. Decoded candidate, manifests, and lock are jointly bounded by the same ceiling. The adapter requires exact closed keys and canonical base64; verifies candidate, manifest, Card, lock, entrypoint, floor, store, and phase relationships before production derivation; requires exactly one tools Card or the exact root/tools closure; and fails without output for identity-only input, missing/extra fields or Cards, noncanonical bytes, one-bit mutation, or any relationship mismatch.

The two CLI operands `--input` and `--output` are the only adapter-control paths and are not fields in input v1. The process-start working directory is the explicit, pre-created, task-owned confinement root. Each operand must be a relative normalized path that resolves beneath that root; absolute paths, empty/dot paths, `..` traversal, NUL bytes, backslash separators, lone-surrogate code units that cannot round-trip UTF-8, operands larger than 4,096 UTF-8 bytes, symlink components/targets, paths outside the root, non-regular input, a pre-existing final output, identical input/output identities, and missing output parents fail before derivation or output creation. The early destination-absence check is only a fast diagnostic; it is never commit authority. After canonical realpath admission, the adapter uses no-follow metadata lookup to require the canonical output parent pathname to be an existing non-symlink directory and captures that admitted device/inode before open. It then opens that exact parent once with directory and no-follow semantics, requires handle metadata to equal the pre-open admitted device/inode, and rechecks that the canonical pathname still resolves to the same identity; any mismatch closes the handle and fails before a temp or final entry exists. Unsupported no-follow directory-open or identity-comparison semantics fail closed. Only that three-way pre-open identity match freezes the parent handle as authority; substitution inside the directory-open seam can never nominate the substituted directory. Before temporary-file creation the adapter also successfully performs a no-mutation preflight sync on the matched handle; failure maps to `WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED` before any temp or final entry exists. Exclusive temp create/open/write/file-sync, every temp/final identity check, no-replace publication, both directory syncs, and every cleanup unlink operate relative to that same frozen directory handle through `openat`/`fstatat`/`linkat`/`unlinkat` semantics or an exact descriptor-bound equivalent; after handle admission no temp/final operation regains authority from the mutable canonical pathname or a joined temp/final path. Substitution inside a parent-open, temp-open, or failure-cleanup seam therefore exposes and removes zero bytes outside the frozen directory even if it occurs after the last pathname revalidation. The adapter creates no directory and opens only the admitted regular input, the identity-bound output-parent handle, and its one owned output temporary/final entry. No post-link directory-sync failure is reclassified as unsupported: after namespace commit it uses the exact indeterminate or committed-cleanup outcome for its phase.

After all validation and pure derivation succeed, the production Worker derivation serializes and size-checks the complete canonical output in memory. A separate persistence consumer inside the adapter process computes the external `cl.i268.serialized-artifact-identity.v1` tuple over those final bytes: exact phase, byte length no greater than 1,048,576, and lowercase SHA-256. I268 independently recomputes that tuple from every safely observed final result before acceptance; an error identity that cannot yet be recomputed is recovery-only evidence and grants no qualification. Neither identity is embedded in output v2. This preserves I268 D9's producer/consumer separation rather than making the derived value self-identifying. The persistence consumer then creates exactly one unpredictable same-directory temporary regular file relative to the frozen parent handle, with exclusive creation and mode `0600` where the platform supports POSIX modes, captures that file's identity, writes all bytes, syncs the file, and closes it. Immediately before publication it revalidates both invariants: the canonical parent pathname still has the frozen admitted device/inode, and descriptor-relative lookup proves the temporary name is the captured owned regular inode inside that directory. Parent or temp substitution at this pre-link boundary fails closed and cleanup remains limited to the proven-owned temp. Final publication uses descriptor-bound `linkat(parentHandle, temporaryName, parentHandle, finalName)` or an exact same-directory equivalent, not ordinary path-only `link`, rename, copy, or direct final-path write. There is no replace-capable or path-only fallback on platforms or filesystems where descriptor-bound hard links, inode revalidation, and opened-directory sync cannot establish this contract.

Every return or error from `linkat`, including `EEXIST`, is reconciled before classification through descriptor-relative lookup of both final and temporary names. If the final is the captured owned inode and the temporary name is still the same owned inode, the namespace commit occurred even if the call reported an error; the adapter continues the complete post-link identity, durability, cleanup, and final-validation sequence and returns ordinary success only if every barrier succeeds. If the final is foreign, it is preserved byte-for-byte and handled as output-exists after durable owned-temp cleanup. An ordinary pre-commit link failure is allowed only when reconciliation proves the final absent and the temp still owned. If reconciliation cannot prove one of those closed states, the adapter returns `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE` with bounded artifact identity and retry forbidden, leaves all final/temp names untouched, and performs no cleanup mutation. A successful-returning link is likewise only the atomic no-replace namespace commit point, not durable success.

The identity-bearing failure payload below is an accepted I268-owned process interface. Coordinator event `architecture-coordinator-20260810T081731Z-181` records J1 acceptance at the exact immutable ref: darwinian-services repository commit `c0d106b67695e9a1359be86e63fc6db54d899547`, module `ops/i268/finch-process-result-contract.mjs`, blob SHA-256 `876621634dd4a8b69b5a69f213469662d5b60b6e96fcf0ba4ec3bc96f05bac41`, superseding `6152fa52519d865da4f33143e771f19462799066` as the J1 comparison and acceptance ref. I268 retains strict process invocation and parser ownership. Task 8 RED/source still requires replacement ordered I265 G1/G2; any divergence from that accepted darwinian-services ref reopens the dependency.

Every non-clean outcome exits `1`, emits exactly one canonical UTF-8 JSON line no larger than 512 bytes on stderr, and emits no stdout. The closed payload schema is `cl.i265.worker-runtime-admission-persistence-outcome.v1`. Serialization is byte-exact `JSON.stringify` form with no optional whitespace, one trailing LF, top-level key order `schema`, `code`, `commitState`, `retry`, `artifactIdentity`, and nested identity key order `schema`, `phase`, `byteLength`, `sha256`. `commitState` is exactly one of `not_committed`, `indeterminate`, or `committed`. `retry` is exactly `"forbidden"`; `artifactIdentity` is JSON `null` for every `not_committed` outcome and the separate persistence consumer's I268 tuple otherwise. Missing, extra, reordered, malformed, oversize, or noncanonical bytes fail I268 parsing and grant no retry or qualification. The payload contains no path, raw output, command, environment, credential, secret, exception text, or mutable target.

The fixed non-qualifying commit-indeterminate format vector below is exactly 360 UTF-8 bytes including its required final LF:

```json
{"schema":"cl.i265.worker-runtime-admission-persistence-outcome.v1","code":"WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE","commitState":"indeterminate","retry":"forbidden","artifactIdentity":{"schema":"cl.i268.serialized-artifact-identity.v1","phase":"tools","byteLength":1,"sha256":"ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"}}
```

The closed code set is exactly these thirteen. Every `not_committed` outcome carries `"artifactIdentity":null` and zero output files; `indeterminate` and `committed` outcomes carry the bounded identity tuple and at most one output file, whose observed bytes must equal that tuple's length and SHA-256.

| Stable code | `commitState` | Closed trigger and live residue |
|---|---|---|
| `WORKER_RUNTIME_ADMISSION_INPUT_INVALID` | `not_committed` | Operand or input admission, decode, schema, identity, or relationship failure before derivation; no temp or final entry exists. |
| `WORKER_RUNTIME_ADMISSION_DERIVATION_FAILED` | `not_committed` | Production derivation failure after admission; no temp or final entry exists. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_SERIALIZATION_FAILED` | `not_committed` | In-memory canonical output serialization or size-check failure; no temp or final entry exists. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED` | `not_committed` | Open, short-write, file-sync, close, or conclusively uncommitted link failure with identity-safe owned-temp cleanup completed. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_EXISTS` | `not_committed` | Reconciled foreign final preserved byte-for-byte after durable owned-temp cleanup. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED` | `not_committed` | Preflight-sync failure or unsupported descriptor-bound link/open/sync/identity semantics conclusively discovered before namespace commit; no temp or final entry survives. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED` | `not_committed` | Pre-commit cleanup cannot prove or unlink the owned temp; the unresolved name is left untouched. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_CLEANUP_DURABILITY_INDETERMINATE` | `not_committed` | Pre-commit cleanup unlink succeeded but its directory sync failed; the temp is absent live and may reappear after crash. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE` | `indeterminate` | Link reconciliation cannot prove owned-final, foreign-final, or absent-final/owned-temp state, or the first directory sync fails; no cleanup mutation and every observed final/temp name remains untouched. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_VALIDATION_INDETERMINATE` | `indeterminate` | Immediate post-link parent/final identity validation fails; final and temp names remain untouched. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_TEMP_CLEANUP_FAILED` | `committed` | First directory sync succeeded but temp identity proof or unlink failed; committed final is preserved and residue/foreign names remain as found. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_CLEANUP_DURABILITY_INDETERMINATE` | `committed` | Temp unlink succeeded but second directory sync failed; final is preserved, temp is absent live and may reappear after crash. |
| `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_FINAL_VALIDATION_FAILED` | `committed` | Both directory barriers completed but final validation failed; final/foreign entry is preserved and temp is never recreated. |

Conclusive pre-commit failures and reconciled foreign-destination failures use the same canonical envelope with `commitState: "not_committed"`, `artifactIdentity: null`, zero output files, and no identity tuple; a bare code-plus-LF line is noncanonical and fails the accepted parser. Exact RED vectors use the fixed non-qualifying identity to pin all thirteen JSON code/state strings byte-for-byte in both phases — the twenty-six frozen `FINCH_WORKER_FAILURE_VECTORS` of the accepted darwinian-services module, with identity-bearing byte lengths root 359/370/364/377/368 and tools 360/371/365/378/369, phase-independent `not_committed` lengths 191/195/205/199/191/208/214/227, and the `512`-byte ceiling; those vectors are process-contract fixtures, never Finch authority.

Immediately after an owned final is reconciled, and again before returning any identity or clean success, the adapter proves that the canonical parent pathname still has the frozen admitted device/inode and that the descriptor-relative final target is a regular file with the captured temporary inode identity. If either immediate post-link check fails before the first directory sync, namespace state is unvalidated and not durably classified: the adapter returns sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_VALIDATION_INDETERMINATE` with `commitState: "indeterminate"`, bounded artifact identity, and retry forbidden; leaves the final and owned temporary names untouched; and performs no cleanup mutation. A mismatch at the final check after both directory syncs returns sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_FINAL_VALIDATION_FAILED` with `commitState: "committed"`, bounded artifact identity, and retry forbidden; preserves the durably committed or foreign final entry exactly as found; and never recreates a removed temp. Path-only confinement or a once-only admission check is insufficient.

The hard link alone is not crash-durable publication. After the immediate post-link identity checks succeed, the adapter syncs the opened parent-directory handle before unlinking the temporary name. Only a successful first directory sync makes the validated final name durably committed. A first directory-sync failure returns sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE` with `commitState: "indeterminate"`, bounded artifact identity, and retry forbidden; leaves both final and temporary names untouched for recovery; and never claims success because a later crash may preserve either namespace state. Once the first directory sync succeeds, the committed final is never removed, replaced, or rewritten.

Before unlinking a temporary name on either success or failure, descriptor-relative identity lookup must prove it still resolves to the adapter-owned captured inode; an identity mismatch leaves the name untouched and fails closed rather than deleting another writer's object. Cleanup unlinks only that proven name relative to the frozen parent handle, never through a substituted pathname. After durable final commit, failure of either the identity proof or the unlink returns sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_TEMP_CLEANUP_FAILED` with `commitState: "committed"`, bounded artifact identity, and retry forbidden; preserves the committed final and any temporary or foreign name; and never claims clean success. After a successful unlink, the adapter syncs the same opened parent-directory handle a second time. Failure of that second sync returns sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_CLEANUP_DURABILITY_INDETERMINATE` with `commitState: "committed"`, bounded artifact identity, and retry forbidden: the final remains durably committed and untouched, while the temporary name is absent in the live namespace but its removal is not crash-durable. Only descriptor-bound link plus first directory sync plus owned-temp unlink plus second directory sync is clean success; it emits no stdout or stderr bytes and leaves no temporary residue.

Before namespace commit, parse, identity, derivation, serialization, open, short-write, file-sync, close, or conclusively uncommitted link failure removes only the still-owned temporary inode and syncs the parent directory after a successful cleanup unlink. A reconciled foreign final, including `EEXIST`, maps to sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_EXISTS` only after that identity-safe unlink and directory sync complete, while preserving the competing final byte-for-byte. If pre-commit cleanup cannot prove the temp identity or cannot unlink it, the adapter instead returns sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED`, leaves the unresolved name untouched, carries a null artifact identity, and forbids blind retry. If the unlink succeeds but its directory sync fails, it returns sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_CLEANUP_DURABILITY_INDETERMINATE`; no owned final was observed, the temp is absent in the live namespace but may reappear after a crash, the artifact identity is null, and blind retry remains forbidden pending reconciliation. Unsupported descriptor-bound hard link or directory open/sync semantics conclusively discovered before namespace commit map to sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED`; after an owned final is observed, every failure uses its identity-bearing post-link phase outcome instead. No rename/copy fallback is permitted, and none of these outcomes removes or rewrites a final path.

No path, command, URL, environment, credential, secret, or mutable target is accepted inside input v1 as adapter control or ambient-lookup authority. Exact path, command/argv, and public Git URL strings that occur inside the encoded canonical manifest or `card.lock` bytes remain passive derivation material: the adapter may hash and strictly parse them but never executes, interpolates, installs, dereferences, opens/fetches, connects to, exposes them to process environment/output, or treats them as process, filesystem, environment, network, output, diagnostic, or publication authority.

The no-secret decision is executable and independently reproducible. `cl.i268.finch-nested-inert-rule-config.v1`, schema version 1, is exactly 1,225 canonical UTF-8 bytes with SHA-256 `32225d0b5dda0d2a7ad37981d7441cde12a83a1200d2bdafbff25add0f300c2a`. It allows only the exact `buzz-tools` stdio command/args/optionality and absent provider/env/headers/url; the root Card has no server; lock paths are bounded inert strings; Git URLs are the two reviewed public Finch repositories with exact HTTPS host/path and empty userinfo/query/fragment; lock auxiliary fields are closed empty/absent values. Its `file|store|git` origin list is only the nested inert security subset and never overrides Worker production deploy's independent `file`/`npm` rejection.

Both producer adapters embed and rehash that exact config, rerun the pure rule over the decoded candidate/manifests/lock, refuse a forged caller `pass`, and bind their own `security.nestedInertRule` schema/version/config/result plus exact coverage into output v2. I268's externally identified evidence corroborates exact byte coverage but never substitutes for producer enforcement. C45–C50 cover zero effects, incomplete coverage, forged pass, rule drift, Git URL authority, server drift, and no raw diagnostics.

The adapter calls only the production Worker derivation and derives canonical envelope/application bytes plus the listed semantic hashes. Output v2 exactly binds `candidateIdentity`; the raw `derivationInputIdentity`; admitted entrypoint, Card-manifest, lock, and store identities; canonical envelope and application-requirements bytes; all component hashes; and exact phase evidence. It validates and binds I268-owned phase/publication identities but does not create them. I268 owns the v1/v2 schemas/parser, candidate inputs, process invocation, failure-payload acceptance, phase policy, comparator, and publication/refetch binding. The adapter never imports Services/I268 implementation or becomes a third derivation.

Event `i265-owner-20260809T235736Z-015` records I265's fresh exact-digest acceptance and supersedes only the verdict of the premature event, not its audit history. Any later schema, bound, file, command, runtime, version, ownership, lookup, or rule change invalidates acceptance. The identity-bearing failure payload was such a process-contract change; event `architecture-coordinator-20260810T081731Z-181` records its acceptance at the exact darwinian-services ref `c0d106b67695e9a1359be86e63fc6db54d899547`. Adapter RED/source requires I265 G2 PASS, the corrected immutable I268 schema ref's ordered G1 then G2 PASS, and byte-exact conformance to that accepted ref. The synthetic vector remains non-authoritative. I265's core declaration/producer/materializer tasks require I265 G2 but do not wait on unrelated I268 publication authority.

The corrected I268 schema is immutable in the darwinian-services repository at commit `75970eb09c6292f7c418bb5216e9ef006921ce55`, tree `821e917e874cf39412dad0bb73db9602b5bdfae6`: architecture SHA-256 `6d20dcb017d8f592e9899be2c9de783143194e56f2440c81eca9109377f249ae`, plan SHA-256 `f2f399f5a4ad82837bc3e9c498f070f6ae0ac90cdf020448afadad3062520763`. Event `i268-owner-reviewer-20260810T000303Z-014` records remote readback, 9/9 JSON parsing, config recomputation, 13/13 contract assertions, and 242/242 ops tests; events `i268-owner-reviewer-20260810T000705Z-015` and `i268-owner-reviewer-20260810T001306Z-018` record its ordered G1/G2 passes. The tracker now reads `Building / Before G3`. Those gates accept the handshake but grant I265 no adapter source authority until replacement ordered I265 G1/G2 passes.

### 7.2 Producer ownership boundary

Coordinator event `architecture-coordinator-20260810T065820Z-176` resolves Worker fixture ownership under the accepted parent-program architecture §7:

- I265 is the sole Worker runtime-admission producer and fixture owner. No other lane produces, mirrors, or substitutes a producer or producer fixture.
- I264's untracked exploration fixture is superseded, non-consumable exploration. It exists only as uncommitted working-tree bytes at the frozen base and may never be consumed, extended, or cited as evidence.
- I267 owns later release adoption — candidate, qualification, tag, publication, registry reconciliation, image adoption, final receipts — and never producer fixtures.
- I268 owns the actual Finch Cards, the derivation input/output schemas, process invocation, and result parsing; it consumes producer outputs and never becomes a producer.
- I266 F3 consumes exactly one artifact from this lane: the immutable Task 5 receipt in §7.3. It consumes no working-tree bytes, no I264 material, and no pre-receipt draft.

### 7.3 Immutable Task 5 receipt consumed by I266 F3

Task 5 ends by publishing one closed external receipt to the coordination log. Its field set is exact and closed:

- `repository` — the Worker repository, named explicitly (`remyjkim/darwinian-worker`); cross-repo consumers never resolve the receipt against another repository.
- `commit` — the exact 40-hex commit that froze the fixture and sidecar bytes; `tree` — that commit's tree hash.
- `files` — exactly three entries, each carrying `path`, `gitBlobSha` (40-hex blob at `commit`), `byteLength` (decimal UTF-8 byte count), and `sha256` (lowercase 64-hex over the committed blob bytes):
  1. producer source `cli/core/runtime-admission-manifest.ts`;
  2. fixture `test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.json`; and
  3. sidecar `test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.source.json`.
- `generation` — the statement that fixture and sidecar bytes were read back from the committed tree (`git show <commit>:<path>`), byte-equal to the generator output, with `git status --porcelain` empty at generation.

The sidecar is canonical JSON per §4.1 plus one trailing LF, schema `cl.i265.runtime-admission-fixture-source.v1`, with the exact closed field set `schema`, `fixtureFile` (sibling-relative fixture filename), `fixtureByteLength`, `fixtureSha256`, `derivationVersion` (`worker-runtime-admission-v1`), `sourcePaths` (sorted repo-relative committed paths of the pure producer module and its declaration inputs), and `syntheticNonpublishable: true`. It records source paths and the fixture-byte SHA-256; it never hashes itself and never embeds the receipt commit. The receipt alone binds commit/tree and all three blob identities, avoiding self-reference.

I266 F3 consumes the fixture only by reading all three files at exactly the receipt `commit` from the committed object store, recomputing each `byteLength`/`sha256`, and matching the sidecar's fixture identity against both the receipt and the actual fixture bytes. Any mismatch fails closed; working-tree bytes are never a fallback.

### 7.4 Committed provenance and successor identity

Fixture, sidecar, vector, and receipt bytes qualify only from committed provenance. Generation runs at a committed ref with a clean working tree, and every consumed byte must equal the blob at the receipt commit. Uncommitted or dirty-working-tree bytes never qualify — this is the rule under which I264's exploration fixture was rejected. Ambient mutable surfaces, including any globally linked executable that resolves into a mutable worktree, are nonqualifying evidence for fixtures, vectors, or receipts.

Successor release identity fails closed. No 1.3.0 release tuple — tag, tagged commit, package digest, published Card identity — exists at architecture time, and none may be guessed. Every reference to it is structural: "the reviewed successor release tuple qualified by I267". No document, fixture, sidecar, receipt, test, or adapter output embeds a concrete successor tag, hash, digest, or Card reference before I267 publishes it. Any consumer requiring the successor identity fails closed while it is absent and revalidates against the exact I267-published tuple once it exists; a mismatch is rejection, never fallback.

## 8. Coherent Worker 1.3 source

Advance together: package/changelog, build identity, auth qualification identity, readiness target, release candidate/tag/recovery provenance and filenames, both release workflows, publication-control tag, release docs, and tests/fixtures whose semantic role is the current release.

Preserve unrelated semver examples, dependency versions, Bun engine floor, historical changelog sections, and historical receipts. Leave `bun.lock` untouched unless dependency resolution changes. The changelog names the hard cut: existing deployments must be deliberately recreated or handled by a separately reviewed offline migration.

Source coherence creates no candidate or release. I267 later starts from reviewed merged I265 source and independently proves that the qualifying source is the latest `origin/main`, then binds candidate bytes, tag/peeled commit, registry state, image adoption, and final receipts. No older source commit is eligible merely because it carries version 1.3.0.

## 9. Legacy registry retirement

Delete the legacy Card and remove it from npm requirements, artifact qualification, version checks, and I105 executable tests. Package readiness must assert its absence from the 1.3.0 tar. Retained I105 artifacts become non-actionable history without a live file pointer. I239 remains dated context.

No replacement Card is created here. I268 alone owns actual tools-first/root-second Finch Cards, each with exact 1.3.0 `harness.minVersion` and `lastValidatedWith`.

## 10. Alternatives

### Recommended: one pure Worker module

Producer and materializer reuse one side-effect-free implementation. This prevents intra-Worker drift while Services remains the independently implemented trust boundary.

### Rejected: two inline Worker derivations

This duplicates a large strict schema/hash surface. Independent trust is required between Worker and Services, not between two Worker entrypoints.

### Rejected: import Services contracts at runtime

This collapses trust independence, creates cross-repository release coupling, and risks circular adoption. Only stable vectors are shared.

## 11. Acceptance and security

| Requirement | Proof |
|---|---|
| Strict declarations and lock preservation | unknown/null/old/collision/round-trip tests |
| All-present-only deploys | absent/mixed/partial pre-archive effect spies |
| I259 canonical parity | exact cross-repo vectors and reorder/mutation cases |
| Required bounded envelope | size boundary and leakage tests |
| Pre-effect materializer rejection | direct-entry zero-effect matrix |
| 1.3.0 capable floor/source | lock-floor tests and classified version inventory |
| Legacy registry retirement | source absent, nine consumers retired, tar excludes it |
| Synthetic/actual separation | marker, external digests, publication-evidence rejection |
| Closed Task 5 receipt for I266 F3 | exact sidecar field set, three-blob receipt, committed-tree readback equality, fail-closed consumer rule |
| Independent I268 comparison handshake | packaged Worker v2 adapter exact-file/command tests; pre-open admitted parent dev/ino matched to the no-follow handle and post-open pathname; preflight sync plus pre-link, post-link, and pre-success revalidation; descriptor-relative mode-0600 temp/create/check/link/unlink, link-error inode reconciliation, file sync, atomic no-replace commit, first and second parent-directory syncs, adversarial parent-open/temp-open/cleanup/destination/ambiguous-link races, exact identity-null conclusive-precommit/foreign and bounded identity-bearing commit-uncertain/owned-final outcomes, recorded I268/coordinator failure-process acceptance at the exact darwinian-services ref, no success stdout or stderr, plus ordered gate receipt |

Invalid intent fails before archive/filesystem effects; unknown versions/keys/probes fail closed; NFC duplicates never last-win; caller data cannot author derived values; errors are sanitized; and no obsolete Finch authority ships in the package. The pre-existing full-Blueprint Workflow size limit is not repaired here and remains a separate qualification gate.

## 12. Authority boundary

I265 may edit, test, commit, push, review, and merge the Worker source PR under the governed workflow, and publish exact source/test/fixture/adapter receipts to Notion/the coordination log. The offline adapter is evidence production, not a deployment/publication control plane.

I265 does not authorize or perform package/Card publication, tag/release candidate creation, registry mutation, Services image adoption, migration application, key provisioning, environment deployment, mode changes, leases, ACP/Buzz traffic, rollback, retry, or cleanup. Completion hands exact merged commit/tree plus reviews to I267 and I268 and states source only.
