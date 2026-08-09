<!-- ABOUTME: Freezes I265's hard-cut Worker 1.3 runtime-admission producer and materializer contract. -->
<!-- ABOUTME: Separates source implementation from I267 release execution and I268 Finch Card publication. -->

# I265 — Worker 1.3 Runtime-Admission Producer Target Architecture

**Date:** 2026-08-09
**Author:** I265 Worker A
**Status:** In Review
**Issue:** I265, child of I238
**Repository:** `curation-labs/darwinian-worker`
**Frozen base:** `53da51e68e3d8f426b80a1830818fc36bb0a9a01`
**References:** I265 handoff; stable I264 child handoff plus direct coordination events `architecture-coordinator-20260809T221527Z-010`, `architecture-coordinator-20260809T221721Z-011`, `architecture-coordinator-20260809T222052Z-013`, and `architecture-coordinator-20260809T224145Z-017`; I268 handshake request `i268-owner-reviewer-20260809T225639Z-004`; Services `origin/main` I259 runtime-admission contracts. Mutable I264 PR corrections are informative but do not supersede I265's direct reviewed lane contract.

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

This exact-key Worker schema preserves the existing Services v1 meaning: each app has `card`, `pipedreamApp`, or both; bearer requires `tokenRef`; none/oauth forbid it; app IDs are NFC-unique; strings and the 128-entry array are bounded. Across a complete closure, identical declarations for one normalized app ID deduplicate, conflicting declarations fail, and the canonical aggregate sorts by the same code-unit app-ID comparator used by Services. The field survives the lock and binds `closureHash` but remains separate from the runtime-requirements envelope. Finch later uses explicit `{ "version": 1, "apps": [] }` on every closure Card.

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

Its artifact digest is syntactically valid but unmistakably synthetic and must not be presented as the unresolved production Finch digest. A `syntheticNonpublishable` marker stays outside canonical Card bytes. A sidecar records source paths and the fixture-byte SHA-256; it does not hash itself or embed the final commit. The final coordination receipt externally binds commit/tree and both file digests, avoiding self-reference.

This vector pins the pure semantic contract. I265 also accepts I268's request for one production-backed offline adapter so I268 can compare independent Worker and Services processes without importing either implementation.

### 7.1 Accepted Worker adapter binding

The binding is:

- production derivation: `cli/core/runtime-admission-manifest.ts`;
- process adapter: `cli/tools/runtime-admission-derive.ts`;
- package command: `runtime-admission:derive:v2`;
- invocation: `bun run runtime-admission:derive:v2 -- --input <candidate.json> --output <result.json>`;
- command version: `cl.i265.worker-runtime-admission-adapter.v1`;
- interchange schema: `cl.i268.finch-derivation-output.v2`;
- producer discriminator: `worker`; and
- runtime: the exact packaged Bun-compatible Worker runtime, with I267's qualified `darwinian@1.3.0` build identity required for production-candidate evidence.

The adapter accepts one value-free input file bounded at 1,048,576 UTF-8 bytes and writes one closed v2 JSON result bounded at the same limit through a same-directory temp file, close/fsync, and atomic rename. It emits no success stdout and leaves no partial output after failure. Diagnostics are bounded/sanitized.

I265 accepts all v2 common fields, phase evidence, comparison mapping, and external non-circular serialized-artifact identity named by I268 event `...-004`. The input may contain exact entrypoint/Card/lock identities, store-export format/compression/encoding/digest/length (never store bytes), candidate identity, phase, and an already immutable tools-publication/refetch binding for the root phase. It accepts no credential, secret, environment authority, command/shell field, mutable publication target, archive bytes, or fallback field.

The adapter calls only the production Worker derivation and derives canonical envelope/application bytes plus the listed semantic hashes. It validates/binds but does not create publication identities. I268 owns the v2 schema/parser, candidate inputs, process invocation, phase policy, comparator, and publication/refetch binding. The adapter never imports Services/I268 implementation or becomes a third derivation.

The synthetic vector remains non-authoritative. The adapter contract freezes only after I268 incorporates both producer acknowledgments into an immutable ref and obtains ordered I268 G1 then G2 PASS. Adapter source therefore requires both I265 G2 PASS and the applicable I268 G2 PASS. I265's core declaration/producer/materializer tasks require I265 G2 but do not wait on unrelated I268 publication authority.

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
| Independent I268 comparison handshake | packaged Worker v2 adapter exact-file/command tests plus dual G2 receipt |

Invalid intent fails before archive/filesystem effects; unknown versions/keys/probes fail closed; NFC duplicates never last-win; caller data cannot author derived values; errors are sanitized; and no obsolete Finch authority ships in the package. The pre-existing full-Blueprint Workflow size limit is not repaired here and remains a separate qualification gate.

## 12. Authority boundary

I265 may edit, test, commit, push, review, and merge the Worker source PR under the governed workflow, and publish exact source/test/fixture/adapter receipts to Notion/the coordination log. The offline adapter is evidence production, not a deployment/publication control plane.

I265 does not authorize or perform package/Card publication, tag/release candidate creation, registry mutation, Services image adoption, migration application, key provisioning, environment deployment, mode changes, leases, ACP/Buzz traffic, rollback, retry, or cleanup. Completion hands exact merged commit/tree plus reviews to I267 and I268 and states source only.
