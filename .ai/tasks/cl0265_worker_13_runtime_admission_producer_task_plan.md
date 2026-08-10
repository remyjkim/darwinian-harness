<!-- ABOUTME: Defines the executable RED-to-GREEN plan for I265's Worker 1.3 admission producer. -->
<!-- ABOUTME: Holds all source implementation until the ordered combined G1 then G2 review passes. -->

# I265 — Worker 1.3 Runtime-Admission Producer Implementation Plan

> **Required execution skills:** use `executing-plans`, `test-driven-development`, `incremental-commits`, `requesting-code-review`, and `verification-before-completion`. Every behavior change starts with a focused failing test. Obtain requirements review before code-quality/security review.

**Goal:** Deliver a reviewed Worker source PR in which every admissible deployment carries a strictly derived runtime-admission envelope, every invalid/old/absent/partial input fails before archive or filesystem effects, current release source is coherently `1.3.0`, and the obsolete packaged Buzz registry Card is retired.

**Architecture:** Add one pure Worker-owned declaration/derivation module used by `buildWorkerDeployPayload()` and materializer revalidation. Preserve declarations in `card.lock`, enforce the 1.3.0 floor, derive I259-compatible canonical hashes, emit a required bounded envelope before store export, and rederive/deep-compare before the materializer's first effect. Services remains independent; I267 owns release/adoption; I268 owns actual Finch Cards.

**Tech Stack:** TypeScript, Bun 1.2.21, Node crypto, existing Card/lock/deploy/materialize contracts, GitHub Actions YAML, npm release qualification scripts.

---

## 1. Frozen inputs and execution gate

- Repository: `remyjkim/darwinian-worker`.
- Branch: `feat/i265-runtime-admission-producer`.
- Worktree: `/Users/pureicis/dev/darwinian-minds-worktrees/i265-runtime-admission-producer`.
- Frozen base/head: `53da51e68e3d8f426b80a1830818fc36bb0a9a01`.
- Exact tool: Bun 1.2.21 copied immediately from `bunx bun@1.2.21` to a task-specific `mktemp` path; recorded SHA-256 `2803929d4d8a82b6d0a76b1cefb3c929dd6d0c3888604e449d59b64ba891d82a`.
- Tracked submodule: `darwinian-worker-skills` at gitlink `e01dc06f2bac4594ddc6539fea47937d415972b8`, initialized recursively.
- Baseline: focused deploy/materialize 14/14 pass; typecheck pass; all `verify:release` gates pass; full suite 2,203 pass, 10 explicit skips, 0 fail across 350 files.
- Immutable adapter-contract dependency: I268 commit `75970eb09c6292f7c418bb5216e9ef006921ce55`, tree `821e917e874cf39412dad0bb73db9602b5bdfae6`, architecture SHA-256 `6d20dcb017d8f592e9899be2c9de783143194e56f2440c81eca9109377f249ae`, plan SHA-256 `f2f399f5a4ad82837bc3e9c498f070f6ae0ac90cdf020448afadad3062520763`; ordered I268 G1 review is open and G2 remains unapproved.

No source or RED test task begins until the architecture passes formal G1 and this plan passes ordered G2. They may share one exact review ref, but the gate record remains G1 then G2. The I268 comparison adapter additionally waits for exact ref `75970eb0` to receive its own ordered I268 G1 then G2 PASS. Both producer-owned application comparators are acknowledged. I265 events `i265-owner-20260809T235736Z-015` and `i265-owner-20260809T235950Z-016`, plus I266 event `i266-owner-reviewer-20260809T235908Z-212`, accept the exact 1,225-byte producer-enforced rule config at SHA-256 `32225d0b5dda0d2a7ad37981d7441cde12a83a1200d2bdafbff25add0f300c2a`. Any later I268 schema, config, path, command, bound, ownership, or rule drift reopens this dependency.

Before each implementation task:

1. read the newest coordination-log events;
2. fetch Worker `origin` and prove frozen seams have not drifted;
3. verify Issue Tracker Owner/Reviewer statuses and approved gate;
4. add a Notion checkpoint toggle at dependencies, stops, immutable commits, and reviews; and
5. keep the exact Bun executable first on `PATH` for every command/child.

## 2. Planned files

### Admission source/tests

- Add `cli/core/runtime-admission-manifest.ts`.
- Add `cli/tools/runtime-admission-derive.ts` and package command `runtime-admission:derive:v2` after the I268 schema gate.
- Modify `cli/core/card-manifest.ts`, `cli/core/mind-capability.ts`, `cli/core/worker-deploy.ts`, and `cli/core/worker-materialize.ts`.
- Modify `cli/core/card-lock.ts` only if explicit typing/preservation needs it.
- Add `test/core-runtime-admission-manifest.test.ts`.
- Modify `test/core-card-manifest.test.ts`, `test/core-card-lock.test.ts`, `test/core-worker-deploy.test.ts`, `test/core-worker-materialize-validate.test.ts`, `test/core-worker-materialize-e2e.test.ts`, and `test/worker-materialize-fixture.ts`.
- Add `test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.json` and its `.source.json` sidecar.
- Add `test/scripts-runtime-admission-derive.test.ts` after the I268 schema gate.

### Release/version source/tests

- Modify `package.json`, `CHANGELOG.md`, `cli/core/build-identity.ts`, and `cli/core/auth/receipt.ts`.
- Modify `scripts/verify-release-readiness.ts`, `scripts/release/artifact-contract.ts`, `scripts/release/provenance.ts`, and `scripts/release/publication-controls.ts`.
- Modify `.github/workflows/release.yml` and `.github/workflows/release-recovery.yml`.
- Modify `docs/release-process.md`, `docs/maintainers/publishing.md`, and current-release tests/fixtures.
- Preserve unrelated semver examples, dependencies, Bun floor, and historical receipts.

### Registry retirement

- Delete `registry/cards/buzz-delivery-worker/card.json`.
- Retire the nine current consumers enumerated in the architecture.
- Keep I239 dated analysis; make retained I105 material explicitly historical/non-actionable.

## 3. Task 1 — Strict declarations, lock preservation, and floor

### RED

Add focused table tests before production edits for:

1. exact `runtimeAdmission` and `applicationRequirements` v1 acceptance;
2. nested unknown keys, `null`, wrong versions/types, oversized arrays/strings;
3. exact raw-server/declaration ownership equality;
4. enabled-only override, non-stdio transport, non-none auth, and token rejection;
5. public command/argv/env/URL/parser fields rejection;
6. the exact two-probe allowlist and probe-specific expectations;
7. exact/NFC Card identity, server, requirement, reference, and app collisions;
8. missing references and orphan requirements;
9. lock create/validate round trip;
10. explicit empty versus absence; and
11. either new field raising `store.minDrwnVersion` to 1.3.0.

Record this failing command:

```bash
bun test test/core-card-manifest.test.ts test/core-card-lock.test.ts test/core-runtime-admission-manifest.test.ts
```

### GREEN

Add strict optional source types/validators. Extend `minimumDrwnVersionForManifests()` with exact 1.3.0. Preserve both fields inside embedded lock manifests. Add only the minimum pure declaration/coverage helpers; do not emit deploy payloads yet.

### Verify

```bash
bun test test/core-card-manifest.test.ts test/core-card-lock.test.ts test/core-runtime-admission-manifest.test.ts
bun run typecheck
git diff --check
```

### Commit checkpoint

Commit declaration/lock work atomically. Append commit/tree/RED/GREEN evidence to the coordination log and add a Notion checkpoint toggle.

## 4. Task 2 — Pure canonical derivation and vectors

### RED

Extend the pure-module tests first for:

1. required and optional local stdio activation;
2. requirement criticality escalation through required servers;
3. valid explicit-empty closure output;
4. Card/object/set reorder stability;
5. meaningful raw server/declaration/application/identity/ref/tree/integrity mutations changing closure hash;
6. activation/requirement mutations changing component hashes;
7. exact I259 activation/requirements vector parity;
8. safe-integer canonical JSON and unsupported-value rejection;
9. all-absent, either-field absent, `null`, old, mixed, and partial rejection;
10. exact/NFC collisions failing before ordering;
11. apps excluded from the envelope but included in closure binding;
12. canonical closure-wide application aggregation: identical duplicates dedupe, conflicts fail, and app IDs sort with the explicit JavaScript UTF-16 code-unit comparator; and
13. discriminating cross-repository ordering vectors, including `"B"` versus `"a"`, fail against current Services `localeCompare` behavior until I266 adopts the same locale-independent comparator.

### GREEN

Implement canonical JSON, SHA-256, ordering, coverage classification, activation, requirements, closure hash, and envelope derivation in the pure module. Copy the small I259 algorithm with provenance comments/vectors; do not import Services.

### Verify and commit

```bash
bun test test/core-runtime-admission-manifest.test.ts test/core-card-lock.test.ts
bun run typecheck
git diff --check
```

Commit pure derivation atomically and record vector digests.

## 5. Task 3 — Required pre-archive deploy envelope

### RED

Modify deploy tests first to prove:

1. fully declared bare and Blueprint closures emit the exact required envelope;
2. all-absent, either-field absent, old, `null`, mixed, and partial closures fail stably;
3. each failure occurs before store export, temp directory, archive, or network;
4. 65,536 envelope bytes pass and 65,537 fail before archive work;
5. no archive/base64, raw command/argv/env/URL/parser, token, secret, or Services artifact leaks;
6. caller-injected derived fields cannot override output;
7. top-level contract v1 remains while envelope is mandatory; and
8. existing root/member/origin failures remain unchanged.

Use an explicit archive-effect spy in RED.

### GREEN

Add required `WorkerDeployPayload.runtimeAdmission`. Resolve/make portable the closure, derive/size-check the envelope, then call `buildStoreExport()`. Map failures to stable bounded `DrwnError` codes. Do not read admission mode or add an omission branch. Make existing deploy fixtures fully declared.

### Verify and commit

```bash
bun test test/core-runtime-admission-manifest.test.ts test/core-worker-deploy.test.ts test/commands-worker-deploy.test.ts
bun run typecheck
git diff --check
```

Commit deploy-envelope work atomically and record RED/GREEN evidence.

## 6. Task 4 — Materializer pre-effect revalidation

### RED

Modify validation/e2e tests first for:

1. absent, `null`, old/unknown, malformed, oversized, noncanonical, and unknown-key envelope;
2. absent/old/mixed/partial lock declarations;
3. one-bit closure/activation/requirement/component-hash/derivation mutation;
4. closure or application mutation after envelope production;
5. direct exported materializer calls with typed-but-tampered payloads;
6. stable `WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID` and sanitized text; and
7. zero mkdir, mkdtemp, archive write/extract, config/lock write, hydration, sync, project tar, and store tar calls/paths;
8. malformed or unknown outer payload, entrypoint/root mismatch, wrong root kind, invalid lock version/floor, duplicate or NFC-colliding Card/root/member identities, inconsistent composition membership, non-portable Card path, disallowed origin, missing tree/integrity/commit identity, and reconstructed-lock validation failure; and
9. every case in item 8 failing before inline/external store decoding, digest work, mkdir, mkdtemp, archive write/extract, config/lock write, hydration, sync, or emitted artifacts.

Retain separate store-digest error coverage.

### GREEN

Inside the exported materializer, strictly validate the complete outer payload and entrypoint, derive a sentinel-path reconstructed lock, run the existing strict lock validator, validate/rederive the admission envelope, and deep-compare the exact canonical result before decoding or hashing store bytes and before every filesystem effect. Validation performs no ambient repository/network lookup. Keep envelope failures distinct from outer payload/store errors and redact full input data.

### Verify and commit

```bash
bun test \
  test/core-runtime-admission-manifest.test.ts \
  test/core-worker-deploy.test.ts \
  test/core-worker-materialize-validate.test.ts \
  test/core-worker-materialize-e2e.test.ts \
  test/core-worker-materialize-store-export.test.ts \
  test/core-worker-materialize-emit.test.ts
bun run typecheck
git diff --check
```

Commit materializer work atomically and record the zero-effect matrix.

## 7. Task 5 — Synthetic non-publishable Finch vector

### RED

Add a fixture-consumer test before fixture bytes exist. Require a complete synthetic closure/expected envelope, one required `buzz-tools`, only the approved probes, a distinct synthetic 64-hex artifact digest, `glibc>=2.31`, adjacent exact I107 selectors outside the envelope, explicit empty apps, no third probe/archive/secret, and a `syntheticNonpublishable` marker.

Require a sidecar that hashes the fixture but never itself or the final commit.

### GREEN

Freeze deterministic fixture/sidecar bytes from the pure function. Ensure package/publication readiness never consumes them as Card, Blueprint, lock, store, candidate, or receipt.

### Verify and commit

```bash
bun test test/core-runtime-admission-manifest.test.ts test/core-worker-deploy.test.ts
sha256sum test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.json test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.source.json
git diff --check
```

Commit fixture work atomically. Bind commit/tree and both file digests externally in Notion/the coordination log.

## 8. Task 6 — Retire legacy packaged Buzz Card

### RED

Change package/release tests first to require:

1. legacy Card absent from source and dry-run tar members;
2. artifact qualification no longer requires it;
3. Worker verification no longer reads/enforces its floor;
4. current version tests no longer depend on it;
5. obsolete I105 executable tests retired;
6. I105 docs/evidence are not current instructions/live pointers; and
7. no replacement publishable Finch Card exists in Worker.

Exclude dated I239 analysis from the current-consumer assertion.

### GREEN

Delete the Card, retire all nine current consumers, and make package readiness assert absence. Convert or retire I105 material without rewriting I239 history.

### Verify and commit

```bash
bun test test/package-readiness.test.ts test/scripts-release-artifact-contract.test.ts test/scripts-verify-worker-contract.test.ts test/core-version.test.ts
bun run verify:release
npm pack --dry-run --json
git grep -n 'registry/cards/buzz-delivery-worker/card.json' -- scripts package.json registry test .github docs README.md .ai/tasks || true
git diff --check
```

Commit retirement atomically while the source version remains 1.2.0. The updated release verifier must pass by requiring the legacy member's absence, never by advancing the obsolete Card to 1.3.0. Notify I267 to prove the path absent from the eventual 1.3 tar and I268 that Worker provides no replacement Card.

## 9. Task 7 — Coherent 1.3.0 source

This task starts only after Task 6 has removed the obsolete Card and every current verifier/qualification dependency on it. A 1.3.0 checkpoint that updates or still requires the legacy Card is invalid.

### RED

Change current-release tests first to fail on any authoritative 1.2.0 surface:

1. package/runtime equality at exact 1.3.0;
2. build identity and auth receipt eligibility;
3. readiness target/changelog;
4. candidate, tag, recovery, provenance parsers/types;
5. candidate/tar filenames;
6. publication-control tag;
7. release/recovery trigger, ref, concurrency, registry lookup, checkout, artifact, and publish literals;
8. release/maintainer docs;
9. latest-`origin/main` eligibility, so an older 1.3.0 source cannot qualify;
10. preservation of unrelated examples/dependencies/history; and
11. continued legacy Buzz Card absence from source, package members, release verification, and current documentation.

### GREEN

Advance those current release-controlled surfaces to 1.3.0. Add breaking hard-cut/migration text. Keep the retired Card absent and do not edit `bun.lock` unless dependency resolution changes.

### Verify and commit

```bash
bun test \
  test/core-version.test.ts \
  test/core-build-identity.test.ts \
  test/core-auth-receipt.test.ts \
  test/package-readiness.test.ts \
  test/scripts-release-artifact-contract.test.ts \
  test/scripts-release-provenance.test.ts \
  test/scripts-release-publication-controls.test.ts \
  test/scripts-release-registry-probe.test.ts \
  test/scripts-release-workflow.test.ts \
  test/scripts-release-recovery-workflow.test.ts \
  test/docs-readiness.test.ts
bun run typecheck
bun run verify:release
npm pack --dry-run --json
git diff --check
```

Commit source coherence atomically. State explicitly that this is not a tag, candidate, publication, registry mutation, or image adoption.

## 10. Task 8 — Offline Worker v2 derivation adapter

This task is held until I265 G2 and the exact replacement I268 input/output contracts receive ordered I268 G1 then G2 PASS. Before RED, consume the exact I268 review ref/digests, reverify the accepted `cl.i268.finch-derivation-input.v1` and `cl.i268.finch-derivation-output.v2` schemas, and append the dependency transition to Notion/the shared log.

### RED

Add `test/scripts-runtime-admission-derive.test.ts` first for the accepted binding:

1. `cli/tools/runtime-admission-derive.ts` is invoked by `bun run runtime-admission:derive:v2 -- --input <derivation-input.json> --output <result.json>`;
2. command version is `cl.i265.worker-runtime-admission-adapter.v1`, input schema is `cl.i268.finch-derivation-input.v1`, output schema is `cl.i268.finch-derivation-output.v2`, and producer is `worker`;
3. identity-only candidates, missing/extra preimage fields, candidate/bundle/Card/lock/store identity mismatches, and one-bit Card/declaration/raw-server mutations fail;
4. the bounded passive preimage carries the exact candidate bytes, canonical Card manifests/declarations, canonical `card.lock`, and every production derivation input; command/argv/path/public-Git-URL-shaped values nested inside the admitted manifest/lock bytes are inert hash/parse input only and are never executed, interpolated, installed, dereferenced, opened, or treated as process/filesystem/environment/network authority;
5. the adapter reverifies every byte length/hash and candidate/Card/lock/store relationship before importing and calling only the production Worker derivation, never Services/I268 comparator/fixtures;
6. no ambient repository, registry, store, network, environment, credential provider, or publication lookup is permitted;
7. valid tools/root inputs emit every reviewed common field, phase evidence field, canonical envelope/application byte identity, and semantic hash, and `input.derivationInputIdentity` equals the length/SHA-256 of the actual admitted raw input file;
8. input/output exceed 1,048,576 UTF-8 bytes fail before output creation;
9. top-level paths, commands, URLs, credentials, secrets, store/archive bytes, environment authority, mutable targets, executable shell authority, unknown, and fallback fields fail; each adapter independently embeds, rehashes, and reruns `cl.i268.finch-nested-inert-rule-config.v1` version 1 at exact SHA-256 `32225d0b5dda0d2a7ad37981d7441cde12a83a1200d2bdafbff25add0f300c2a`, then binds its own pass/digest in output v2 rather than trusting caller-authored evidence;
10. store-export format/compression/encoding/digest/length bind without accepting its bytes;
11. production-candidate output requires the qualified packaged 1.3.0 build identity derived by the running Worker rather than caller-supplied source authority;
12. success writes one same-directory temp, closes/fsyncs, atomically renames, emits no stdout, and leaves no temp/partial output;
13. parse/identity/derivation/write/rename failures are sanitized and leave no result;
14. candidate/receipt self-identity is absent while the externally computed serialized-artifact identity remains downstream; and
15. hostile nested manifest command/environment values and lock path/Git URL values cause no process, filesystem, environment, network, output, or diagnostic side effect before rejection or successful pure derivation; forged caller `pass`, changed rule/config digest, URL userinfo/query/fragment, authorization/cookie/API-key header, unexpected env/header/provider, and missing/changed byte coverage fail without output or raw diagnostics.

### GREEN

Implement the minimum offline adapter around `cli/core/runtime-admission-manifest.ts`. Accept only the reviewed bounded passive derivation-input file, reverify its closed byte identities, and perform no ambient lookup or execution. Treat every nested manifest/lock path, command, and URL as inert bytes. Independently run the exact frozen target-specific rule: allow only the reviewed `buzz-tools` server command/args/optionality with provider/env/headers/url absent, no root server, the two exact public Finch Git URLs with empty userinfo/query/fragment, bounded inert lock paths, and closed empty/absent auxiliary fields. The rule's `file|store|git` origin set does not override the production deploy path's separate `file`/`npm` rejection. Bind the producer's own rule pass/config digest in output v2 and never echo nested values. Derive Worker-owned values; validate/bind I268-owned phase/publication inputs without creating them. Write one closed v2 result atomically. Add the package command without registering a deploy/network CLI control plane.

### Verify and commit

```bash
bun test test/scripts-runtime-admission-derive.test.ts test/core-runtime-admission-manifest.test.ts
bun run typecheck
npm pack --dry-run --json
git diff --check
```

Commit the adapter atomically. Record exact command/version, input/output schemas, source/package identity, test totals, and adapter file digest for I268. This receipt grants no Card/package publication authority.

## 11. Task 9 — Fresh integrated verification and reviews

Resolve a fresh exact Bun 1.2.21 into a new task-specific temp directory immediately before the final run; record path/version/SHA-256 and place it first on `PATH`. Initialize the tracked submodule and run:

```bash
bun test \
  test/core-runtime-admission-manifest.test.ts \
  test/core-card-manifest.test.ts \
  test/core-card-lock.test.ts \
  test/core-worker-deploy.test.ts \
  test/commands-worker-deploy.test.ts \
  test/core-worker-materialize-validate.test.ts \
  test/core-worker-materialize-e2e.test.ts \
  test/core-worker-materialize-store-export.test.ts \
  test/core-worker-materialize-emit.test.ts \
  test/scripts-runtime-admission-derive.test.ts
bun run typecheck
bun run verify:release
bun test --timeout 30000 ./test/
git diff --check origin/main...HEAD
git status --short --branch
```

Inventory all remaining 1.2.0 literals and classify each as historical, unrelated example/test, dependency/engine floor, or defect. Any unexplained current-release literal fails.

### Requirements review

Request an exact-head requirements-only review for hard-cut coverage in every mode, pre-archive/pre-filesystem order, schemas/canonicalization, 1.3 floor/coherence, nine-consumer retirement, synthetic/actual separation, and I267/I268 authority. Record the immutable verdict in Notion/log. Changes requested return to a RED test.

### Code-quality/security review

After requirements pass, request a separate exact-head review for parser bounds, hashing, error redaction, effect ordering, fixture nonpublication, release-workflow safety, and regression risk. Repeat fresh verification after every correction.

## 12. Task 10 — Source PR completion

Update the PR with mandatory testing/CI evidence, breaking hard-cut statement, exact commit/tree, RED/GREEN commands/totals, version-literal classification, fixture digests, and both review verdicts. Only the reviewer of record approves/merges. Fetch and verify the remote merge commit/tree before completing I265.

The completion handoff states source only, exact merged identities/tests/reviews, no package/tag/registry/Card/image publication, and no migration/key/deployment/mode/lease/candidate/traffic/rollback/retry/cleanup. It routes release/adoption to I267 and actual Finch closure to I268.

## Testing Strategy

### Unit/contract

Use table-driven Bun tests for strict parsing, coverage classes, NFC collisions, canonicalization, hashes, floor, release parsers, and retirement consumers. Every accepted behavior starts with a demonstrably failing focused test.

### Integration

Exercise real Card publish/resolve/lock/payload and direct materializer entrypoints in isolated temp roots. Spy/inject archive/filesystem effects. No test contacts network, registry, staging, production, Engine, Pipedream, or secret providers.

### Regression

Run exact Bun typecheck, `verify:release`, and the full canonical suite. Preserve the 10 documented environment/live skips unless legitimately changed; investigate any count change.

### Release content

Use non-mutating `npm pack --dry-run --json` and repository qualification helpers. Never create/upload a candidate, tag, package, Card, image, or publication-like receipt.

## Acceptance Criteria

- Ordered G1 then G2 pass precedes source work.
- All-present declarations are the only deployable state in every mode.
- Invalid/old/absent/partial closures fail before store archive generation.
- Invalid/tampered materialization fails before every filesystem effect.
- Worker/I259 vectors produce byte-identical component hashes.
- Every admissible payload has one <=65,536-byte envelope with no archive, executable configuration, or secrets.
- Declarations survive the lock and force 1.3.0.
- Current release source is coherent at 1.3.0; surviving 1.2.0 literals are classified.
- Legacy Card is deleted and all nine current consumers retired.
- Synthetic vector is externally digest-bound and not actual Finch authority.
- The value-free Worker v2 adapter matches the exact reviewed I268 schema and cannot become a control-plane/fallback path.
- Focused/full/typecheck/release/diff and both reviews pass at final exact head.
- No prohibited outward/environment action occurs.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Historical parser tolerance becomes fallback | Optional only at general parse; explicit absent/null/mixed RED cases at producer/materializer |
| Archive precedes rejection | Derive before `buildStoreExport()` with effect spy |
| Direct materializer bypass | Validate in exported `materializeWorkerPayload()` |
| Worker/Services drift | Copy exact I259 algorithm, pin vectors, no runtime import |
| Synthetic digest mistaken for truth | Synthetic naming/marker, external receipt, publication rejection |
| Version bump touches unrelated fixtures | Classify literals by semantic role |
| Legacy Card remains packed | Source deletion plus explicit dry-run tar absence |
| Source merge triggers outward work | I267 retains all release/adoption authority |

## Stop conditions

Stop, append a coordination event, and add a Notion checkpoint if G1/G2 is absent or changed; the adapter task lacks exact I268 G2 PASS; origin changes frozen seams; lock preservation needs a broader break; validation cannot precede effects; caller data becomes derived authority; v1 would widen transport/auth/probes; a test needs network/credentials/publication/migration/deployment/mode/lease/candidate/traffic; or I267/I268 ownership would be crossed.
