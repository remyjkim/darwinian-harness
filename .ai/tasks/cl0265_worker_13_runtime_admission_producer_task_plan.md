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
- Branch: `feat/i265-g1-no-replace-correction`.
- Worktree: `/Users/pureicis/.config/superpowers/worktrees/darwinian-worker/i265-g1-no-replace-correction`.
- Frozen base/head: `53da51e68e3d8f426b80a1830818fc36bb0a9a01`.
- Exact tool: Bun 1.2.21 copied immediately from `bunx bun@1.2.21` to a task-specific `mktemp` path; recorded SHA-256 `2803929d4d8a82b6d0a76b1cefb3c929dd6d0c3888604e449d59b64ba891d82a`.
- Tracked submodule: `darwinian-worker-skills` at gitlink `e01dc06f2bac4594ddc6539fea47937d415972b8`, initialized recursively.
- Baseline: focused deploy/materialize 14/14 pass; typecheck pass; all `verify:release` gates pass; full suite 2,203 pass, 10 explicit skips, 0 fail across 350 files.
- Immutable adapter-contract dependency: I268 commit `75970eb09c6292f7c418bb5216e9ef006921ce55` in the darwinian-services repository, tree `821e917e874cf39412dad0bb73db9602b5bdfae6`, architecture SHA-256 `6d20dcb017d8f592e9899be2c9de783143194e56f2440c81eca9109377f249ae`, plan SHA-256 `f2f399f5a4ad82837bc3e9c498f070f6ae0ac90cdf020448afadad3062520763`; ordered I268 G1/G2 passed in events `i268-owner-reviewer-20260810T000705Z-015` and `i268-owner-reviewer-20260810T001306Z-018`, and the authoritative tracker now reads `Building / Before G3`.
- Accepted process-result contract: darwinian-services repository commit `c0d106b67695e9a1359be86e63fc6db54d899547`, module `ops/i268/finch-process-result-contract.mjs`, blob SHA-256 `876621634dd4a8b69b5a69f213469662d5b60b6e96fcf0ba4ec3bc96f05bac41`; coordinator event `architecture-coordinator-20260810T081731Z-181` records J1 acceptance at that exact ref, superseding `6152fa52519d865da4f33143e771f19462799066`, and releases the I265 integration hold against it. Its rulings bind this plan: integrate the byte-equal ceec1763 vector contract or amend only the mismatch, and name the repository in every cross-repo reference.

No source or RED test task begins until the corrected architecture passes replacement formal G1 and this corrected plan passes replacement ordered G2. They may share one exact review ref, but the gate record remains G1 then G2. The I268 comparison contract at exact darwinian-services ref `75970eb0` has already passed its own ordered G1/G2; this satisfies only the cross-lane schema dependency and does not authorize I265 source. Both producer-owned application comparators are acknowledged. I265 events `i265-owner-20260809T235736Z-015` and `i265-owner-20260809T235950Z-016`, plus I266 event `i266-owner-reviewer-20260809T235908Z-212`, accept the exact 1,225-byte producer-enforced rule config at SHA-256 `32225d0b5dda0d2a7ad37981d7441cde12a83a1200d2bdafbff25add0f300c2a`. Any later I268 schema, config, path, command, bound, ownership, or rule drift reopens this dependency.

Coordinator events `architecture-coordinator-20260810T004351Z-032`, `architecture-coordinator-20260810T005202Z-034`, `architecture-coordinator-20260810T033057Z-038`, `architecture-coordinator-20260810T041432Z-055`, `architecture-coordinator-20260810T041433Z-056`, `architecture-coordinator-20260810T041614Z-057`, `architecture-coordinator-20260810T042545Z-060`, `architecture-coordinator-20260810T043108Z-062`, and `architecture-coordinator-20260810T043800Z-065` supersede the earlier I265 G1/G2 passes and the incomplete no-replace corrections. Task 1 commit `d3562399974c0a29439938f1677c79ca4aab63f9` and Task 2 commit `d69f437c71a47801db99af808a96ffcdcba85bd3` are preserved without destructive rollback as frozen, unaccepted work. Raced PR commit `d9db2e14ca66a103b0a45a5bf8251d450ce2fd4b` and isolated commits `318feb91e214658229186ea32f0bb54f7a346f0d` and `85d3f333dfec71362dcf6f7f76d18a4b5043c3e3` are also unaccepted documentation ancestry; they authorize neither PR integration nor formal G1. No frozen source may be reused, extended, merged, or represented as gate-authorized until replacement ordered I265 G1/G2 passes and an exact reuse review accepts it.

The frozen Task 1/Task 2 commits already carry `cli/core/runtime-admission-manifest.ts` — exporting `validateRuntimeAdmissionDeclarations`, `compareRuntimeAdmissionIds`, `canonicalizeRuntimeAdmissionJson`, `computeEffectiveMcpActivationHash`, `computeRuntimeRequirementsHash`, and `deriveRuntimeAdmissionForClosure` — plus the `card-manifest`/`mind-capability` declaration seams and their tests, identically on both I265 branches. Tasks 1 and 2 therefore execute as conformance verification of that frozen source under the exact reuse review, not as a second implementation: write each RED case first and run it against the frozen source; a case the frozen source already satisfies is recorded as reuse-conformance evidence, and only a failing case authorizes new GREEN work scoped to that gap. The Task 5 fixture, its sidecar, and the external receipt exist on no branch and are produced fresh.

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

This task produces the one artifact I266 F3 consumes: producer conformance evidence plus the fixture, sidecar, and external receipt of architecture §7.3. The producer module already exists as frozen Task 1/Task 2 source; this task verifies its conformance and freezes fixture bytes from it — it does not reimplement derivation.

### RED

Add a fixture-consumer test before fixture bytes exist. Require a complete synthetic closure/expected envelope, one required `buzz-tools`, only the approved probes, a distinct synthetic 64-hex artifact digest, `glibc>=2.31`, adjacent exact I107 selectors outside the envelope, explicit empty apps, no third probe/archive/secret, and a `syntheticNonpublishable` marker outside canonical Card bytes.

Require the sidecar's exact closed field set per architecture §7.3 — `schema` exactly `cl.i265.runtime-admission-fixture-source.v1`, `fixtureFile`, `fixtureByteLength`, `fixtureSha256`, `derivationVersion` exactly `worker-runtime-admission-v1`, sorted `sourcePaths`, and `syntheticNonpublishable: true` — serialized as canonical JSON plus one trailing LF. Unknown, missing, or reordered sidecar fields, a self-hash, or an embedded receipt commit fail. The sidecar's fixture identity must equal the actual fixture bytes.

### GREEN

Freeze deterministic fixture/sidecar bytes from the frozen pure producer. Regenerate and byte-compare to prove determinism. Ensure package/publication readiness never consumes them as Card, Blueprint, lock, store, candidate, or receipt.

### Verify and commit

```bash
bun test test/core-runtime-admission-manifest.test.ts test/core-worker-deploy.test.ts
sha256sum test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.json test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.source.json
git diff --check
```

Commit fixture work atomically, then prove committed provenance before publishing the receipt:

```bash
git status --porcelain
git show HEAD:cli/core/runtime-admission-manifest.ts | sha256sum
git show HEAD:test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.json | sha256sum
git show HEAD:test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.source.json | sha256sum
git rev-parse HEAD 'HEAD^{tree}'
git rev-parse HEAD:cli/core/runtime-admission-manifest.ts HEAD:test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.json HEAD:test/fixtures/runtime-admission/finch-runtime-admission.synthetic.v1.source.json
```

The status output must be empty and every committed-tree digest must equal the working output. Publish the closed §7.3 receipt externally in Notion/the coordination log: repository, commit, tree, and the producer/fixture/sidecar entries each with path, git blob SHA, byte length, and SHA-256. I266 F3 consumes only via committed-tree readback at exactly that commit; dirty-worktree bytes never qualify.

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
10. preservation of unrelated examples/dependencies/history;
11. continued legacy Buzz Card absence from source, package members, release verification, and current documentation; and
12. no current source, test, fixture, or doc embeds a concrete successor release tuple — tag, tagged commit, package digest, or published Card identity; successor references stay structural and fail closed while the reviewed I267 tuple is absent, per architecture §7.4.

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

This task is held until replacement I265 G2 passes. Exact I268 ref `75970eb0` in the darwinian-services repository has already received ordered I268 G1/G2 PASS for the original handshake, and the identity-bearing failure payload amendment is accepted at exact darwinian-services ref `c0d106b67695e9a1359be86e63fc6db54d899547`, module `ops/i268/finch-process-result-contract.mjs`, blob SHA-256 `876621634dd4a8b69b5a69f213469662d5b60b6e96fcf0ba4ec3bc96f05bac41`, recorded by coordinator event `architecture-coordinator-20260810T081731Z-181`. Before RED, re-read the tracker/log, reverify that module blob SHA-256 at that exact ref plus the accepted `cl.i268.finch-derivation-input.v1` / `cl.i268.finch-derivation-output.v2` schemas, and append the dependency transition to Notion/the shared log. Any drift from the accepted ref reopens the dependency and stops work.

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
9. only the `--input` and `--output` CLI operands are path controls; each is a relative normalized path confined beneath the real process-start working directory, with absolute/empty/dot/traversal/NUL/outside-root/symlink paths, backslash separators, lone-surrogate code units that cannot round-trip UTF-8, operands larger than 4,096 UTF-8 bytes, missing parents, non-regular input, pre-existing final output, or identical input/output identity rejected before derivation or output creation;
10. top-level input-v1 paths, commands, URLs, credentials, secrets, store/archive bytes, environment authority, mutable targets, executable shell authority, unknown, and fallback fields fail; each adapter independently embeds, rehashes, and reruns `cl.i268.finch-nested-inert-rule-config.v1` version 1 at exact SHA-256 `32225d0b5dda0d2a7ad37981d7441cde12a83a1200d2bdafbff25add0f300c2a`, then binds its own pass/digest in output v2 rather than trusting caller-authored evidence;
11. store-export format/compression/encoding/digest/length bind without accepting its bytes;
12. production-candidate output requires the qualified packaged 1.3.0 build identity derived by the running Worker rather than caller-supplied source authority;
13. success has the production derivation serialize and size-check complete canonical bytes in memory, then a separate persistence consumer computes but does not embed their exact `cl.i268.serialized-artifact-identity.v1` phase/byteLength/SHA-256 tuple; after output-parent realpath admission, no-follow metadata freezes the existing non-symlink parent's admitted device/inode before open, the directory/no-follow handle must match it, and the post-open pathname must still match before preflight-syncing that handle or creating any temp; the same matched handle then exclusively creates one unpredictable same-directory temporary regular file at mode `0600` where supported, captures its identity, writes all bytes, syncs and closes it, revalidates parent plus descriptor-relative owned temp immediately before publication, commits with descriptor-bound same-directory `linkat` or an exact atomic no-replace equivalent, reconciles descriptor-relative final/temp identities regardless of the link call's return/error, revalidates parent plus owned final, syncs the opened parent-directory handle, unlinks only the identity-matched owned temporary name relative to that handle, syncs that directory handle again, and revalidates parent plus final before identity/success; path-only link, ordinary rename, copy, direct-final write, and any replace-capable fallback are forbidden; only completion of pre-open identity binding, preflight, reconciliation, both post-link directory syncs, and all identity checks is clean success, which emits no stdout or stderr bytes and leaves no temporary residue;
14. inject a competing destination after admission and the early absence precheck but immediately before `link`; require `EEXIST` to map to sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_EXISTS` only after identity-safe owned-temp unlink and parent-directory sync, preserve the competing destination byte-for-byte, emit the canonical `not_committed` envelope with `artifactIdentity` null and zero output files, and perform no retry or replace-capable fallback;
15. replace the admitted parent pathname with another directory or symlink (a) inside parent-directory-handle open after the pre-open admitted identity is captured but before the underlying open, (b) inside the temp-create/open seam after its last pathname check, (c) after temp persistence but immediately before link, and (d) inside failure cleanup immediately before owned-temp identity proof/unlink; the parent-open case must reject the handle/admitted-inode mismatch before preflight or any temp/final exists, and every case must fail closed without opening or writing any byte outside the frozen admitted directory, qualify no output, preserve every foreign path, perform zero outside unlink or mutation, and clean only a temp independently proven through the frozen handle to be owned; then substitute parent or final target immediately after an owned final is observed but before the first directory sync and require `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_VALIDATION_INDETERMINATE`, `commitState: "indeterminate"`, bounded artifact identity, retry forbidden, no cleanup mutation, and final/temp names left untouched; separately substitute at the final pre-success check and require `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_FINAL_VALIDATION_FAILED`, `commitState: "committed"`, bounded artifact identity, retry forbidden, no temp recreation, and the durably committed or foreign final entry left exactly as found;
16. make the real descriptor-bound link create the owned final and then throw; require reconciliation to recognize the final/temp inode equality and continue both durability barriers to verified success with exactly one final and no temp; separately inject reconciliation failure (a) after an owned final lookup succeeds but temp lookup/identity fails and (b) before any owned final can be proved, and require both to emit `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE`, `commitState: "indeterminate"`, bounded artifact identity, retry forbidden, no cleanup mutation, and every observed name untouched; prove a reconciled foreign final maps to output-exists only after durable owned-temp cleanup, while a conclusively absent final plus owned temp alone may use ordinary pre-commit failure;
17. inject failure of the first parent-directory sync after an owned final is reconciled; require sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE`, `commitState: "indeterminate"`, bounded artifact identity, retry forbidden, both final and temporary names left untouched, and no success claim or final removal/replacement;
18. after a successful first directory sync, separately inject owned-temp descriptor-relative identity-proof failure and owned-temp unlink failure; each requires sanitized `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_TEMP_CLEANUP_FAILED`, `commitState: "committed"`, bounded artifact identity, retry forbidden, the committed final preserved, and residue/foreign names left visible; then inject failure of the second directory sync after successful unlink and require `WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_CLEANUP_DURABILITY_INDETERMINATE`, committed state, bounded artifact identity, retry forbidden, final preserved, live temp absence, and possible crash reappearance;
19. while handling an otherwise pre-commit failure, separately inject owned-temp identity-proof failure or unlink failure and require `WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED`, unresolved name untouched, no owned final or artifact identity, and no blind retry; then inject parent-directory sync failure after successful pre-commit temp unlink and require `WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_CLEANUP_DURABILITY_INDETERMINATE`, no owned final or identity, live temp absence but possible crash reappearance, and no blind retry; repeat both cleanup faults after `EEXIST` and prove the competing destination remains byte-identical and the cleanup-specific code is not hidden by output-exists;
20. inject failure of the no-mutation preflight directory sync and require `WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED` before any temp or final entry exists; injected parse/identity/derivation/serialization/open/short-write/file-sync/close and conclusively uncommitted link failures otherwise emit their exact accepted `not_committed` envelope (`WORKER_RUNTIME_ADMISSION_INPUT_INVALID`, `WORKER_RUNTIME_ADMISSION_DERIVATION_FAILED`, `WORKER_RUNTIME_ADMISSION_OUTPUT_SERIALIZATION_FAILED`, or `WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED`), remove only a temp name still proven to be the captured owned inode, directory-sync any successful pre-commit cleanup unlink, leave no owned final before commit, and never truncate/overwrite/remove a pre-existing path; a directory/temp/final identity mismatch deletes no foreign object, and unsupported descriptor-bound hard-link or inode-revalidation semantics conclusively discovered before link fail closed as persistence-unsupported without a path-only or replace-capable fallback; after an owned final is observed, every failure uses its exact identity-bearing post-link outcome and is never reclassified as unsupported;
21. per the accepted process contract at darwinian-services ref `c0d106b6`, every non-clean outcome exits `1` with exactly one canonical UTF-8 stderr JSON line no larger than 512 bytes and no stdout; pin byte-exact literal vectors for all thirteen allowed `cl.i265.worker-runtime-admission-persistence-outcome.v1` code/state pairs in both phases — the twenty-six frozen `FINCH_WORKER_FAILURE_VECTORS` of the accepted module — with exact top-level/nested key order, no whitespace plus one LF, `retry: "forbidden"`, `artifactIdentity` null on every `not_committed` outcome, and the separate persistence consumer's bounded artifact identity otherwise; require both ambiguous-reconciliation observation cases to use that envelope and treat any identity not independently recomputable from safely observed bytes as recovery-only/non-qualifying; reject exit-status drift, extra/missing/reordered keys, oversize/noncanonical diagnostics, bare code-plus-LF lines, raw paths/output/commands/environment/credentials/secrets/exception text, self-identity inside output v2, and a non-null artifact identity on conclusive pre-commit or reconciled foreign-destination failure; those `not_committed` failures exit `1` with the same envelope carrying `artifactIdentity` null and zero output files; and
22. hostile nested manifest command/environment values and lock path/Git URL values cause no process, filesystem, environment, network, output, or diagnostic side effect before rejection or successful pure derivation; forged caller `pass`, changed rule/config digest, URL userinfo/query/fragment, authorization/cookie/API-key header, unexpected env/header/provider, and missing/changed byte coverage fail without output or raw diagnostics.

### GREEN

Implement the minimum offline adapter around `cli/core/runtime-admission-manifest.ts` against the accepted process contract at darwinian-services ref `c0d106b6`. Capture the process-start working-directory realpath as the sole confinement root; accept only the two reviewed CLI path operands under it; reject path escape, symlink, alias, existing-output, and non-regular-input cases; and create no directory. Accept only the reviewed bounded passive derivation-input file, reverify its closed byte identities, and perform no ambient lookup or execution. Treat every nested manifest/lock path, command, and URL as inert bytes. Independently run the exact frozen target-specific rule: allow only the reviewed `buzz-tools` server command/args/optionality with provider/env/headers/url absent, no root server, the two exact public Finch Git URLs with empty userinfo/query/fragment, bounded inert lock paths, and closed empty/absent auxiliary fields. The rule's `file|store|git` origin set does not override the production deploy path's separate `file`/`npm` rejection. Bind the producer's own rule pass/config digest in output v2 and never echo nested values. Derive Worker-owned values; validate/bind I268-owned phase/publication inputs without creating them. Capture the admitted output-parent device/inode before open, require the no-follow directory handle and post-open pathname to equal it, and close/fail before temp creation on mismatch. Use that matched handle for descriptor-relative temp creation, identity checks, no-replace link, both syncs, and cleanup so a mutable canonical pathname never regains filesystem authority; also require pathname-to-frozen-inode revalidation and a no-mutation directory-sync preflight before temp open, parent plus owned-temp revalidation immediately before link, and parent plus final-target revalidation after reconciliation and again before identity/success. If those descriptor-bound operations, identity checks, directory sync, or hard-link semantics are unsupported, fail closed before qualification. A separate persistence consumer computes the bounded external artifact identity over final production-derived bytes, then persists them through exclusive mode-`0600` same-directory temp creation, complete write, file sync, close, atomic no-replace hard-link commit, first directory sync, identity-safe temp unlink, and second directory sync. Reconcile final/temp inode state after every link result: a recognized owned final continues the barriers even after a thrown error; a foreign final is preserved and becomes output-exists after durable temp cleanup; only a conclusively absent final may use ordinary pre-commit failure; inconclusive state is identity-bearing commit-indeterminate with retry forbidden whether or not lookup proved an owned final. Never fall back to path-only link, ordinary rename, copy, direct-final write, or another replace-capable operation. Implement the exact accepted thirteen-code outcome table and diagnostic envelope; every failure emits the canonical envelope. Every commit-uncertain or owned-final non-clean result carries bounded artifact identity, preserves the final/foreign state required by its phase, and forbids blind retry; conclusive pre-commit and reconciled foreign-destination failures carry `artifactIdentity` null and zero output files. Clean success emits no stdout or stderr bytes. Add the package command without registering a deploy/network CLI control plane.

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
- The value-free Worker v2 adapter matches the exact reviewed I268 schemas and the failure-process amendment accepted at darwinian-services ref `c0d106b6`, confines both CLI paths, binds pre-open admitted parent identity to the no-follow handle and post-open pathname, revalidates output-parent and temp/final inode identities across pre-link, post-link, and pre-success boundaries, reconciles ambiguous link completion, and persists only through descriptor-relative mode-`0600` temp operations plus preflight directory sync, file sync, atomic no-replace hard-link commit, first parent-directory sync, identity-safe temp unlink, and second parent-directory sync; it preserves a destination introduced after precheck byte-for-byte, exposes exact identity-null conclusive-precommit/foreign and bounded identity-bearing commit-uncertain/owned-final outcomes, never reports clean success with temp residue, emits no success stdout or stderr, and cannot become a control-plane/fallback path.
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
| Destination appears after precheck | Descriptor-bound same-filesystem `linkat` commit fails `EEXIST`; no rename/copy fallback, competing bytes unchanged, only identity-matched owned temp may be removed |
| Namespace update or cleanup is not crash durable | Preflight directory sync before temp creation; reconcile final/temp inodes after every link result; sync after owned final and again after temp unlink; precommit cleanup, ambiguous-link, post-link validation, first-sync, identity-proof/unlink, second-sync, and final-validation failures have exact outcomes and never remove a committed or foreign final |
| Parent path is substituted after admission | Capture admitted parent device/inode before open; require no-follow handle and post-open pathname equality; use the matched handle for descriptor-relative create/write/sync/link/check/unlink authority; inject parent-open, temp-open, and cleanup seam substitution; mismatch qualifies nothing, exposes zero outside bytes, and deletes no foreign object |
| Failure outcome parser drifts across lanes | Pin the accepted contract at darwinian-services ref `c0d106b67695e9a1359be86e63fc6db54d899547`, module blob SHA-256 `876621634dd4a8b69b5a69f213469662d5b60b6e96fcf0ba4ec3bc96f05bac41`; reverify before adapter RED/source; any drift stops work and reopens the dependency |

## Stop conditions

Stop, append a coordination event, and add a Notion checkpoint if G1/G2 is absent or changed; the adapter task lacks exact I268 G2 PASS or the accepted failure-process contract at darwinian-services ref `c0d106b6` has drifted; fixture, vector, or receipt bytes would derive from an uncommitted working tree or from an ambient globally linked executable resolving into a mutable worktree; origin changes frozen seams; lock preservation needs a broader break; validation cannot precede effects; the platform/filesystem cannot provide the reviewed atomic no-replace `link`, pre-open pathname-to-no-follow-handle identity binding, opened-parent-directory, inode-revalidation, and directory-sync semantics; cleanup cannot prove the temporary pathname is still the adapter-owned captured inode; any implementation remains path-only, can qualify a substituted parent/final, or would report clean success before both directory syncs or with temp residue; caller data becomes derived authority; v1 would widen transport/auth/probes; a test needs network/credentials/publication/migration/deployment/mode/lease/candidate/traffic; or I267/I268 ownership would be crossed.
