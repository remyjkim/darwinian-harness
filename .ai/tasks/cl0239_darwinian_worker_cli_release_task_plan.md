# ABOUTME: G2 implementation plan for I239's Worker CLI 1.2.0 credential hard cut and independently gated release.
# ABOUTME: Converts the fresh G1 contracts into ordered RED-GREEN slices, immutable evidence, and explicit downstream stops.

# [I239] Darwinian Worker CLI 1.2.0 release and operational ACP/Buzz handoff — Implementation Plan (GATE 2)

> After G2 passes and the Owner acknowledges the pass into Building, execute this plan with `executing-plans`, `test-driven-development`, `incremental-commits`, and `verification-before-completion`.

**Issue:** I239

**Owner:** Remy K

**Reviewer:** Remy K, acting under the user's explicit owner/reviewer authorization

**Branch:** `chore/i239-worker-cli-release-g1`

**PR:** [#102](https://github.com/remyjkim/darwinian-worker/pull/102)

**Binding G1 artifact:** [`cl0239_darwinian_worker_cli_release_target_architecture.md`](../analyses/cl0239_darwinian_worker_cli_release_target_architecture.md)

**Binding G1 head:** `db6efaa835e9da36182c8004da294ce7461d57c8`

**Fresh G1 review:** [PASS on exact head](https://github.com/remyjkim/darwinian-worker/pull/102#pullrequestreview-4887252699)
**Target release:** exactly `darwinian@1.2.0` / annotated tag `v1.2.0`

## Goal and controlling outcome

Deliver a reviewable Worker-only `darwinian@1.2.0` implementation that:

1. makes the deliberate stored-credential hard cut to payload v3 and envelope v2;
2. isolates each credential home across every supported key backend;
3. exposes sanitized, provenance-bound login, forced-refresh, and strict-revoke receipts;
4. reports Worker governance truthfully without inventing deployed enforcement;
5. qualifies one exact packed tarball and publishes only those authorized bytes through a fail-closed OIDC lane; and
6. hands immutable released capability evidence to I236, the Services runtime-adoption owner, and I238 without performing or claiming their live work.

The plan intentionally spends no implementation effort on pre-DAH, payload-v2, envelope-v1, or global-key compatibility. Re-login is the supported transition. The historical global key is left untouched because its ownership cannot be established safely.

## Authorization and stop boundaries

- This document is a G2 candidate until it passes review. No production source, test, workflow, credential, or release mutation begins before the separate Owner acknowledgment into Building.
- A G2 pass authorizes repository implementation and source-only G3 evidence. It does not authorize a merge, release dispatch, GitHub/npm setting change, tag, npm publication, GitHub Release, recovery dispatch, credential operation, Services adoption, staging lease, candidate, secret, deployment, ACP/Buzz traffic, or downstream tracker mutation.
- I239 may implement offline mocks and command behavior, but it must not perform a real login, refresh, revoke, or keychain mutation as release evidence.
- `DRWN_TOKEN` remains a validated, non-persistent product input. It is never stored and never represented as stored-credential qualification evidence. I238 independently forbids it in qualification.
- I239 adds no I236 host, issuer, resource, client, environment, deployment, candidate, lease, or secret constant. I236 supplies reviewed coordinates and owns its fresh post-cut live credential operations.
- I238 may proceed with its independently approved source/offline work, but Tasks 8+ and every environment/live action remain stopped on the released I239 capability, the separate Buzz child-environment receipt, the complete dependency join, and explicit operation authorities.
- Services DTO/runtime adoption is a separately numbered child. Current Deploy API evidence can support only `unknown` or `not_applicable` enforcement in I239.
- Routine PR #67 and obsolete PRs #99/#57 remain independent. I239 does not modify, merge, close, or supersede them.
- Work only in the clean I239 worktree. Preserve the dirty primary checkout.

## Evidence-based implementation shape

Use small typed cores with injected filesystem, clock, random, process, fetch, platform, and GitHub/npm boundaries. Command classes and workflows orchestrate these cores but do not duplicate policy.

This shape is required because the highest-risk rules—scope identity, format rejection, refresh persistence, revoke/delete ordering, receipt disclosure, registry classification, and exact artifact provenance—must be exhaustively testable without real credentials or external mutation. Workflow-only shell would duplicate those rules and make negative cases difficult to prove.

### Target source layout

```text
cli/core/auth/credential-scope.ts
  normalizeCredentialPath(...)
  deriveCredentialScope(...)
  CredentialScopeV1

cli/core/secret-store.ts
  CredentialEnvelopeV2
  scope-bound backends and fail-closed read/write/clear

cli/core/auth/credentials.ts
  CliDahCredentialFileV3 only
  stable credential error taxonomy

cli/core/auth/device-flow.ts
  native DAH device exchange, refresh, and typed revoke result only

cli/core/auth/resolve-token.ts
  validated DRWN_TOKEN or v3 store; automatic refresh with v3 generation semantics

cli/core/build-identity.ts
  strict packaged identity loader and explicit non-qualifying development identity

cli/generated/build-identity.json
  generated during packing from package version and checked-out Git object; never caller supplied

cli/core/auth/receipt.ts
  AuthOperationReceiptV1 construction, validation, classification, and disclosure guard

cli/commands/auth/login.ts
cli/commands/auth/refresh.ts
cli/commands/auth/logout.ts
  thin human/JSON command surfaces

cli/core/worker-governance-status.ts
  one typed governance model shared by human and JSON output

scripts/release/build-identity.ts
scripts/release/registry-probe.ts
scripts/release/artifact-contract.ts
scripts/release/provenance.ts
scripts/release/publication-controls.ts
scripts/release-cli.ts
  reusable offline-testable release contracts and thin process adapter

.github/workflows/release.yml
  main-only dry run and annotated-tag exact-artifact publication

.github/workflows/release-recovery.yml
  separately authorized, non-publishing verification/metadata recovery
```

Internal helper names may be refined during implementation, but module ownership and the G1 contracts may not be weakened without a reviewed G1 amendment.

## Frozen contracts used by every task

### Credential scope and key custody

For a requested credential-file path:

1. resolve it to an absolute path;
2. realpath the nearest existing ancestor and append the unresolved tail;
3. normalize separators to `/`, Unicode to NFC, and Windows drive/path case consistently with case-insensitive identity;
4. derive `scopeDigest = SHA-256("darwinian.worker.credential-scope.v1\0" + normalizedPath)`;
5. derive internal key identity `drwn-credentials-v2:<scopeDigest>`; and
6. derive public `qualificationNamespaceDigest = SHA-256("darwinian.worker.qualification-namespace.v1\0" + scopeDigest)`.

The normalized path and internal `scopeDigest` never enter command or retained evidence. The public namespace digest is domain-separated from both the path and backend key identity.

Envelope v2 contains exactly `v`, `algo`, `scopeDigest`, `keyRef`, `nonce`, `ciphertext`, and `tag`. Read validates the re-derived scope and key reference before backend key lookup or decryption. macOS account, Linux account/label, Windows sibling-key path/identity, and test-backend key filename all derive from the same scope. Scope A cannot read, overwrite, or delete scope B.

### Stored payload hard cut

The only accepted stored payload is `CliDahCredentialFileV3` from G1 §10.2:

- `version: 3`;
- random UUID `credentialId`;
- integer `generation`, starting at 1 and incrementing once per successful persisted refresh;
- `issuer`, literal client `drwn-cli`, and `resource`;
- encrypted-local-only access token, refresh token, and user email;
- canonical `issuedAt`, `expiresAt`, and `savedAt`.

Pre-DAH credentials, payload v2, envelope v1, compatibility aliases, the legacy device-flow overload, and the Analyzer-client legacy auth branch are removed. There is no migration, old-global-key lookup/import, or automatic old-key deletion.

Stable stored-credential errors are:

- `CREDENTIAL_SCHEMA_UNSUPPORTED` for unsupported/malformed stored schema;
- `CREDENTIAL_SCOPE_MISMATCH` for envelope/path/key identity mismatch;
- `CREDENTIAL_INTEGRITY` for authenticated-decryption/integrity failure; and
- `CREDENTIAL_ABSENT` where strict operations require a valid store and none exists.

### Auth operations and receipt

- Login creates a UUID and generation 1 only after a validated DAH exchange, then atomically writes the scoped store.
- Explicit `drwn refresh --json` always refreshes. It keeps the ID and increments generation only after the remote exchange and atomic scoped write succeed.
- Automatic near-expiry refresh uses the same persistence invariant but is not a substitute for explicit qualification refresh.
- Ordinary logout remains best-effort remote revoke followed by scoped local containment and is never qualification-eligible.
- Strict `drwn logout --json --require-remote-revoke` requires valid v3 custody, confirms remote revoke before any delete, preserves local custody on remote failure, and reports the ordered remote/local result.

`AuthOperationReceiptV1` is the exact G1 §10.4 allowlist: schema/version; packaged Worker version/source commit; public namespace; credential ID/generation/profile/timing; action/mode/action timestamp/outcome/eligibility; redacted remote action/result/HTTP class; local action/result/after-confirmed-revoke; and stable reason. It forbids identity, email, tokens, codes, response bodies, URLs with queries, raw paths, internal scope, key references, keychain labels, and secrets.

The minimum stable reason vocabulary is closed for 1.2.0:

- `BUILD_IDENTITY_UNQUALIFIED` for an otherwise successful source/development operation;
- the four stored-custody codes above;
- `CREDENTIAL_PROFILE_MISMATCH`;
- `AUTH_REMOTE_REJECTED` for a definite protocol rejection;
- `AUTH_REMOTE_INDETERMINATE` for redirect, server, or network outcomes that do not prove success;
- `AUTH_RESPONSE_INVALID` for a malformed or cryptographically invalid success-shaped response;
- `CREDENTIAL_WRITE_FAILED`; and
- `CREDENTIAL_DELETE_FAILED`.

Successful qualifying operations use `reason=null`. A command may add no free-form receipt reason; any new code requires a test and public schema documentation in the same reviewed change. Human stderr may add safe explanatory text, but downstream logic keys only on the stable code and structured remote/local fields.

Source/development identity and every failed operation are `qualificationEligible=false`. Failed operations emit a receipt only when the credential identity can be established safely; otherwise stdout is empty and stderr contains only a stable diagnostic. Device instructions are transient stderr and are excluded from retained downstream evidence.

#### AuthOperationReceiptV1 producer state table

The producer emits only the rows below; consumers do not infer additional combinations. `packaged` means the strict 1.2.0 build identity is present. In each successful packaged row, `reason=null` unless the row names an explicit degradation reason.

| Action / mode | Preconditions and remote state | Local state | Outcome / reason | Eligible |
|---|---|---|---|---|
| `login` / `ordinary` | validated token exchange; `token_exchange / confirmed / 2xx` | `write / confirmed / false` | `succeeded / null` when packaged; `succeeded / BUILD_IDENTITY_UNQUALIFIED` in development | packaged only |
| `login` / `ordinary` | validated token exchange; `token_exchange / confirmed / 2xx` | `write / failed / false` | `failed / CREDENTIAL_WRITE_FAILED` | false |
| `refresh` / `ordinary` | safely identified credential but profile mismatch; `refresh / not_applicable / not_applicable`; no request | `write / not_performed / false` | `failed / CREDENTIAL_PROFILE_MISMATCH` | false |
| `refresh` / `ordinary` | definite remote rejection; `refresh / rejected / 4xx` | `write / not_performed / false` | `failed / AUTH_REMOTE_REJECTED` | false |
| `refresh` / `ordinary` | redirect, server, or network result; `refresh / indeterminate / 3xx|5xx|network_error` | `write / not_performed / false` | `failed / AUTH_REMOTE_INDETERMINATE` | false |
| `refresh` / `ordinary` | success-shaped response fails schema/JWT validation; `refresh / rejected / 2xx` | `write / not_performed / false` | `failed / AUTH_RESPONSE_INVALID` | false |
| `refresh` / `ordinary` | validated refresh; `refresh / confirmed / 2xx` | `write / confirmed / false` | `succeeded / null` when packaged; `succeeded / BUILD_IDENTITY_UNQUALIFIED` in development | packaged only |
| `refresh` / `ordinary` | validated refresh; `refresh / confirmed / 2xx` | `write / failed / false` | `failed / CREDENTIAL_WRITE_FAILED` | false |
| `logout` / `ordinary` | safely identified credential but profile mismatch; `revoke / not_applicable / not_applicable`; no request | `delete / confirmed / false` | `succeeded / CREDENTIAL_PROFILE_MISMATCH` | false |
| `logout` / `ordinary` | `revoke / confirmed / 2xx` | `delete / confirmed / true` | `succeeded / null` | false |
| `logout` / `ordinary` | `revoke / rejected / 4xx` | `delete / confirmed / false` | `succeeded / AUTH_REMOTE_REJECTED` | false |
| `logout` / `ordinary` | `revoke / indeterminate / 3xx|5xx|network_error` | `delete / confirmed / false` | `succeeded / AUTH_REMOTE_INDETERMINATE` | false |
| `logout` / `ordinary` | any remote row above | `delete / failed / true` only after confirmed remote; otherwise `false` | `failed / CREDENTIAL_DELETE_FAILED` | false |
| `logout` / `require_remote_revoke` | safely identified credential but profile mismatch; `revoke / not_applicable / not_applicable`; no request | `delete / not_performed / false` | `failed / CREDENTIAL_PROFILE_MISMATCH` | false |
| `logout` / `require_remote_revoke` | `revoke / rejected / 4xx` | `delete / not_performed / false` | `failed / AUTH_REMOTE_REJECTED` | false |
| `logout` / `require_remote_revoke` | `revoke / indeterminate / 3xx|5xx|network_error` | `delete / not_performed / false` | `failed / AUTH_REMOTE_INDETERMINATE` | false |
| `logout` / `require_remote_revoke` | `revoke / confirmed / 2xx` | `delete / failed / true` | `failed / CREDENTIAL_DELETE_FAILED` | false |
| `logout` / `require_remote_revoke` | `revoke / confirmed / 2xx` | `delete / confirmed / true` | `succeeded / null` when packaged; `succeeded / BUILD_IDENTITY_UNQUALIFIED` in development | packaged only |

The table has these binding interpretations:

- ordinary logout's operation goal is scoped local containment, so confirmed local deletion yields `outcome=succeeded` even when remote revoke was rejected or indeterminate; the structured remote fields and required stable reason preserve that degradation, while `qualificationEligible` remains false;
- strict logout's operation goal is confirmed remote revoke followed by scoped local deletion, so every unconfirmed remote result fails and preserves local custody;
- `remote.result=not_applicable` appears only in the emitted, safely identified profile-mismatch refresh/logout rows before a request; `remote.action=not_applicable` is reserved by the schema and is not emitted by Worker 1.2.0;
- `local.result=not_performed` always implies `afterConfirmedRemoteRevoke=false`;
- login/refresh writes always set `afterConfirmedRemoteRevoke=false`;
- a logout delete attempt after a confirmed revoke sets `afterConfirmedRemoteRevoke=true` whether the delete confirms or fails; an ordinary delete after an unconfirmed/not-applicable revoke sets it false; strict mode never attempts deletion without confirmation; and
- when multiple components fail, `CREDENTIAL_DELETE_FAILED` or `CREDENTIAL_WRITE_FAILED` is the primary `reason`; the structured remote fields retain any remote degradation. Otherwise reason precedence is response/profile/remote classification, then `BUILD_IDENTITY_UNQUALIFIED`, then null.

Before credential identity is safely established—including absent custody, unsupported schema, scope mismatch, integrity failure, and login failures before a credential ID exists—no receipt is emitted. Stdout stays empty; command exit/stderr behavior follows the stable diagnostic and ordinary-versus-strict command contract. Automatic refresh uses the refresh state transition but never emits an operation receipt from the unrelated calling command.

### Packaged and release identity

The package-generated member is strict JSON:

```json
{"schema":"darwinian.worker.build-identity","schemaVersion":1,"version":"1.2.0","sourceCommit":"<40 lowercase hex>"}
```

The pack generator reads version from package metadata and source commit from the checked-out Git object. It accepts no version/commit argument or mutable dispatch value. Development fallback is explicit and non-qualifying; artifact qualification rejects it.

The independent release receipt binds `(version, sourceCommit)` to the tar filename, byte length, SHA-256, npm shasum/integrity, exact Actions run/attempt/artifact ID/digest, annotated tag, npm `gitHead`, and registry integrity. No component claims the tarball embeds its own final hash.

The candidate contains the existing five release-defining members plus generated build identity. Its eight safe installed smokes are:

1. `drwn --version`;
2. `drwn acp serve --help`;
3. `drwn worker materialize --help`;
4. `drwn worker buzz-tools --help`;
5. `drwn worker secret set --help`;
6. `drwn login --help`;
7. `drwn refresh --help`; and
8. `drwn logout --help`.

### Governance truth

One `WorkerGovernanceStatusV1` feeds both renderers. Local declaration may be `matched` or `unavailable`; deployment enforcement may be only `unknown` or `not_applicable`. The result includes counts and stable reasons but no selectors, secrets, inferred hash, or `enforced`/`not enforced` claim.

### Release state machine

- Registry probing is `published | unpublished | indeterminate`; only a confirmed exact-version npm 404 advances.
- Manual dispatch is main-only and dry-run-only. It validates selected ref, package version, checkout SHA, and freshly fetched `origin/main` before qualification.
- Dry run packs once, verifies once, uploads that `.tgz` plus receipt once, and records artifact identity.
- Publication begins only from a strict annotated tag whose machine block names the exact authorized dry-run run/attempt/artifact/digest.
- Tag, checkout, dry-run receipt, build identity, and current `origin/main` must name the same commit.
- Only the independently protected publish job receives `id-token: write`; it publishes the downloaded relative tar path without repacking.
- Post-publish registry shasum/integrity and `gitHead` must equal the qualified receipt before installed smokes and GitHub Release verification.
- Recovery can verify, smoke, and repair missing release metadata only. It has no OIDC, token, publish, tag, dist-tag, or unpublish capability.

## TDD and evidence protocol

For every behavior slice:

1. add the smallest focused test that expresses the approved contract;
2. run it with Bun 1.2.21 and observe the expected assertion/nonzero RED result;
3. implement the smallest production change that makes it GREEN;
4. rerun the focused test, adjacent tests, and typecheck;
5. refactor only while green;
6. inspect the diff for disclosure, boundary, and unrelated-change risk; and
7. commit implementation and proof together at the named seam.

Tests use disposable directories, injected key backends, fake tokens whose claims include valid `iat`/`exp`/issuer/audience, injected fetch/process/time/random/platform adapters, and sentinel secrets. They do not use a developer's keychain, real credential file, real browser, real Auth Hub, npm mutation, GitHub mutation, or live Services endpoints.

Any unexpected failure invokes `systematic-debugging`. Do not broaden scope or weaken an assertion to make the suite green.

### Required proof layers

- **Pure unit:** normalization and digests; schema guards; generation transitions; receipt construction/disclosure; registry/result classification; provenance comparisons.
- **Backend contract:** injected command/filesystem assertions for macOS, Linux, Windows, and test backend scope identities and deletion isolation.
- **Command integration:** real Clipanion command surfaces with fake network/key store; exact stdout/stderr/exit semantics.
- **CLI process integration:** disposable agents homes and fake local DAH server only; no external auth.
- **Artifact integration:** actual local `npm pack`, clean isolated installation, member/build-identity checks, and eight safe smokes.
- **Workflow contract:** parsed YAML/source assertions plus offline fixtures for events, refs, permissions, jobs, run/artifact identities, control readbacks, and recovery prohibitions.
- **Documentation contract:** command and safety coverage, Docusaurus typecheck/build, and hosted internal-link check.
- **Post-merge operations:** real registry, GitHub configuration, OIDC publish, and registry smokes occur only after G3/merge and their separate explicit authorities.

## Execution tasks

### Task 0 — Establish the exact approved baseline

**Files:** no production changes.

1. Confirm Notion is `Building / G2 Passed / Before G3` after separate G2 reviewer and Owner transactions.
2. Fetch origin and record branch, upstream, exact head, `origin/main`, submodule state, and clean `git status --short`.
3. Confirm the implementation branch descends from binding G1 head `db6efaa` and contains the freshly passed G2 plan head.
4. Run the pinned baseline:

   ```bash
   bunx bun@1.2.21 run typecheck
   bunx bun@1.2.21 test test/core-secret-store.test.ts test/core-secret-store-backends.test.ts test/core-auth-credentials.test.ts test/core-auth-device-flow.test.ts test/core-auth-resolve-token.test.ts test/commands-auth.test.ts test/cli-auth-e2e.test.ts
   bunx bun@1.2.21 test test/commands-worker-status-governance.test.ts test/package-readiness.test.ts
   QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release
   bunx bun@1.2.21 run verify:bridge
   bunx bun@1.2.21 test ./test/
   ```

5. Record the expected pre-change facts: package/runtime 1.1.0; v2 payload; v1 envelope; global key identity; no refresh command; unsafe version-reuse release path; stale governance wording.
6. If the baseline differs or fails, stop and investigate before modifying source. Do not absorb unrelated repair work.

**Commit:** none.

### Task 1 — Derive one credential scope and enforce envelope v2 custody

**Files:**

- Create `cli/core/auth/credential-scope.ts`.
- Modify `cli/core/secret-store.ts`.
- Create `test/core-auth-credential-scope.test.ts`.
- Rewrite/extend `test/core-secret-store.test.ts`.
- Rewrite/extend `test/core-secret-store-backends.test.ts`.

1. RED: table-test absolute/relative aliases, nearest-existing-ancestor plus missing tail, symlink aliases, separator normalization, Unicode NFC, Windows drive/path case, same-target stability, distinct-target separation, and the exact two domain-separated digest formulas.
2. GREEN: implement a pure normalizer with injected cwd/platform/realpath/stat boundaries. Return a typed object carrying internal normalized path/scope/key data and public namespace digest; do not provide a JSON/output formatter for internal fields.
3. RED: require v2 envelope strictness, including exact keys, valid base64/nonce/tag sizes, matching derived `scopeDigest` and `keyRef`, and stable classification of malformed JSON, v1, wrong scope, wrong key reference, missing key, and decrypt failure.
4. RED: spy on backends to prove wrong scope/key fails before `loadKey`; prove no fallback to global `drwn-credentials` is attempted.
5. GREEN: make encrypt/decrypt/clear derive scope once from the requested path, select the scoped backend, write envelope v2, and validate binding before key access.
6. RED/GREEN: prove macOS account, Linux account/non-sensitive label, Windows sibling key identity, and test filename derive from the same key identity. Assert two homes never share backend lookup/store/delete arguments.
7. RED/GREEN: prove scope A cannot read or overwrite scope B and `clear(A)` cannot touch B's file/key even when A or B is absent/unreadable. Preserve owner-only file permissions and atomic file replacement.
8. Run:

   ```bash
   bunx bun@1.2.21 test test/core-auth-credential-scope.test.ts test/core-secret-store.test.ts test/core-secret-store-backends.test.ts
   bunx bun@1.2.21 run typecheck
   ```

9. Inspect tests for literal normalized paths or key identities escaping result objects/snapshots. Internal unit assertions may compare them; command/evidence fixtures may not retain them.

**Commit seam:** `[auth] [I239] scope credential key custody`.

### Task 2 — Enforce payload v3 and delete legacy product paths

**Files:**

- Modify `cli/core/auth/credentials.ts`.
- Modify `cli/core/auth/device-flow.ts`.
- Modify `cli/core/auth/resolve-token.ts`.
- Modify `cli/core/http/analyzer-client.ts` and `cli/core/http/schemas.ts` only to remove the legacy auth methods/types.
- Modify `cli/commands/analyze/sessions.ts` to retain explicit Analyzer transport configuration without stored legacy auth fallback.
- Modify `test/core-auth-credentials.test.ts`.
- Modify `test/core-auth-device-flow.test.ts`.
- Modify `test/core-auth-resolve-token.test.ts`.
- Modify `test/commands-analyze-sessions.test.ts`.
- Update v2 credential fixtures in `test/core-worker-http.test.ts`, `test/core-acp-auth.test.ts`, `test/core-worker-error.test.ts`, command tests, and CLI tests.

1. RED: require exact v3 fields/types, literal client ID, UUID, positive integer generation, canonical timestamps, and signed-token `iat`/expiry coherence. Reject unknown compatibility fields.
2. RED: feed pre-DAH, payload v2, malformed plaintext/JSON, and unsupported versions through the real encrypted-store boundary. Require `CREDENTIAL_SCHEMA_UNSUPPORTED`; never return unauthenticated `null`, inspect a global key, or attempt migration.
3. GREEN: replace the credential union with `CliDahCredentialFileV3` only, add stable typed errors, and make read/write validate strictly.
4. RED/GREEN: delete the `LegacyRunDeviceFlowInput` overload and Analyzer device-auth methods/types. Keep the native DAH device session → authorize → token exchange path.
5. RED/GREEN: delete `api_url`/`access_token` stored aliases and the legacy branch in token resolution. Analyzer commands obtain bearer identity from validated `DRWN_TOKEN` or v3 custody and transport URL only from current explicit configuration/environment.
6. RED/GREEN: construct login credentials with injected cryptographic UUID/clock, generation 1, `issuedAt` from validated JWT `iat`, expiry, saved time, and encrypted-local `userEmail`.
7. Update every relevant fake JWT to include valid `iat`, `exp`, issuer, and audience. A fixture update must express v3 semantics; do not introduce a compatibility adapter for tests.
8. Confirm `DRWN_TOKEN` remains validated/unexpired, bypasses stored read/refresh, is never persisted, and supplies no stored credential/receipt.
9. Run:

   ```bash
   bunx bun@1.2.21 test test/core-auth-credentials.test.ts test/core-auth-device-flow.test.ts test/core-auth-resolve-token.test.ts test/commands-analyze-sessions.test.ts test/core-worker-http.test.ts test/core-acp-auth.test.ts test/core-worker-error.test.ts
   bunx bun@1.2.21 run typecheck
   rg -n 'DrwnCredentials|LegacyRunDeviceFlowInput|api_url|access_token' cli/core/auth cli/commands/analyze cli/core/http
   ```

   Any remaining snake-case token keys must be justified as external OAuth wire schema, not stored compatibility.

**Commit seam:** `[auth] [I239] hard-cut stored credentials to v3`.

### Task 3 — Bind packaged build identity and sanitized login receipts

**Files:**

- Create `cli/core/build-identity.ts`.
- Create `cli/core/auth/receipt.ts`.
- Create `scripts/release/build-identity.ts`.
- Modify `.gitignore` and `package.json` only as needed for deterministic pack generation/cleanup.
- Modify `cli/commands/auth/login.ts`.
- Create `test/core-build-identity.test.ts`.
- Create `test/core-auth-receipt.test.ts`.
- Extend `test/commands-auth.test.ts` and `test/cli-auth-e2e.test.ts`.

1. RED: strictly parse packaged build identity—exact schema/keys, package version parity, 40 lowercase hex source commit—and distinguish an explicit development identity that can never qualify.
2. GREEN: implement the runtime loader. Runtime receipts read only this loader, never `GITHUB_SHA`, a command argument, dispatch input, or arbitrary environment variable.
3. RED: verify the pack generator reads `git rev-parse HEAD` and adjacent package metadata itself, accepts no caller-supplied version/commit, writes the exact generated member, and cannot leave a stale qualifying identity after failure. Include dirty/missing-git/invalid-version/invalid-SHA failures.
4. GREEN: implement generation in the pack lifecycle or isolated pack staging. Ensure the later artifact verifier compares the generated tuple to checkout and receipt; do not attempt a self-tar hash.
5. RED: table-test every permitted producer row above and reject every unlisted action/mode/remote/local/outcome/reason/eligibility combination; also validate canonical timestamps, credential epoch, public profile, and packaged identity.
6. RED: inject unique sentinels for subject/email/operator, access/refresh token, device/authorization code, response body, raw path, internal scope, key reference, keychain label, secret, and query-bearing URL. Assert none can be serialized to receipt stdout or retained fixtures.
7. GREEN: implement receipt construction from typed allowlisted inputs rather than redacting a larger object after construction.
8. RED/GREEN login command behavior:
   - device/browser instructions use transient stderr in JSON mode;
   - successful atomic write precedes receipt success;
   - stdout is one receipt and no email or instruction;
   - human mode may retain current email UX;
   - credential identity/write failure yields no false success;
   - a source/development build emits a valid but non-qualifying success receipt.
9. Run:

   ```bash
   bunx bun@1.2.21 test test/core-build-identity.test.ts test/core-auth-receipt.test.ts test/commands-auth.test.ts test/cli-auth-e2e.test.ts
   bunx bun@1.2.21 run typecheck
   ```

**Commit seams:**

- `[release] [I239] bind runtime receipts to packaged source identity`;
- `[auth] [I239] emit sanitized login operation receipts`.

### Task 4 — Add forced refresh and make generation atomic

**Files:**

- Create `cli/commands/auth/refresh.ts`.
- Modify `cli/index.ts`.
- Modify `cli/core/auth/device-flow.ts` for typed refresh outcomes.
- Modify `cli/core/auth/resolve-token.ts`.
- Modify `cli/core/auth/receipt.ts` only through its existing typed contract.
- Extend `test/core-auth-resolve-token.test.ts`, `test/core-worker-http.test.ts`, `test/commands-auth.test.ts`, `test/cli-auth-e2e.test.ts`, and command-help coverage.

1. RED: register `drwn refresh`; require Details/Examples and `--json`; prove help is side-effect-free.
2. RED: explicit refresh always invokes DAH even for a fresh access token, keeps credential ID, increments generation exactly once, replaces token/timing/profile fields from validated response, and atomically persists before success.
3. RED: automatic near-expiry and 401 retry refresh use the same ID/generation/persistence state transition but do not emit a qualification receipt from an unrelated command.
4. RED: classify 2xx, 3xx, 4xx, 5xx, network failure, malformed body, audience/issuer failure, and missing refresh token without retaining the response body. Prove a safely identified profile mismatch is the only emitted refresh row with `remote.result=not_applicable` and performs no request/write.
5. RED: inject local atomic-write failure after successful exchange. Require nonzero exit, no success/eligibility claim, retained local generation unchanged, and a stable re-login-oriented failure. Do not pretend the possibly rotated remote refresh token remains reusable.
6. GREEN: centralize one refresh transaction returning typed sanitized facts. Increment only in the candidate v3 object written atomically; return the new generation only after persistence.
7. GREEN: emit the forced-refresh receipt with action `refresh`, mode `ordinary`, remote `refresh`, exact HTTP class, local `write`, and eligibility derived from successful operation plus packaged identity.
8. Confirm `DRWN_TOKEN` never refreshes or persists and explicit refresh without v3 custody fails `CREDENTIAL_ABSENT` with empty stdout.
9. Run:

   ```bash
   bunx bun@1.2.21 test test/core-auth-resolve-token.test.ts test/core-worker-http.test.ts test/commands-auth.test.ts test/cli-auth-e2e.test.ts test/commands-worker.test.ts
   bunx bun@1.2.21 run typecheck
   ```

**Commit seam:** `[auth] [I239] add provenance-bound forced refresh`.

### Task 5 — Separate ordinary containment from strict confirmed revoke

**Files:**

- Modify `cli/commands/auth/logout.ts`.
- Modify `cli/core/auth/device-flow.ts` for typed revoke classification.
- Modify `cli/core/auth/credentials.ts`/`cli/core/secret-store.ts` only where scoped deletion proof requires it.
- Extend `test/commands-auth.test.ts`, `test/cli-auth-e2e.test.ts`, `test/core-secret-store.test.ts`, and `test/core-auth-receipt.test.ts`.

1. RED: add `--json` and `--require-remote-revoke`; ensure help describes the ordinary/strict distinction without claiming access-token invalidation.
2. RED ordinary mode:
   - remote confirmation then scoped delete succeeds;
   - 3xx/4xx/5xx/network remote failure is disclosed without body, followed by scoped local delete; confirmed deletion yields `outcome=succeeded` with the exact remote degradation reason while eligibility remains false;
   - a safely identified profile mismatch emits `revoke/not_applicable/not_applicable`, performs scoped local deletion, succeeds with `CREDENTIAL_PROFILE_MISMATCH`, and remains non-qualifying;
   - absent custody remains safe/idempotent in human mode;
   - any JSON receipt is accurately non-qualifying; and
   - deletion never touches another scope.
3. RED strict mode:
   - absent/unsupported custody exits nonzero and stdout is empty;
   - credential/scope metadata is captured before mutation;
   - 2xx confirmation occurs before any file/key delete call;
   - every 3xx/4xx/5xx/network failure preserves file and key;
   - confirmed revoke deletes exactly the bound file/key;
   - local deletion failure cannot claim success and sets `afterConfirmedRemoteRevoke=true` only when the attempt followed 2xx confirmation; and
   - successful receipt proves remote confirmed, local confirmed, and `afterConfirmedRemoteRevoke=true`.
4. GREEN: implement explicit state machines. Ordinary containment and strict qualification may share typed primitives but never share a success predicate.
5. RED/GREEN: test partial local-delete failures and accurate failure receipts where safe identity is available. Never print or retain a remote body/token/path/key identifier.
6. Run:

   ```bash
   bunx bun@1.2.21 test test/commands-auth.test.ts test/cli-auth-e2e.test.ts test/core-secret-store.test.ts test/core-auth-receipt.test.ts
   bunx bun@1.2.21 run typecheck
   ```

**Commit seam:** `[auth] [I239] require confirmed revoke for qualifying logout`.

### Task 6 — Render truthful governance from one model

**Files:**

- Create `cli/core/worker-governance-status.ts`.
- Modify `cli/commands/worker/status.ts`.
- Modify `cli/commands/worker/types.ts` only if the successful DTO belongs there.
- Rewrite `test/commands-worker-status-governance.test.ts`.
- Update focused status/help assertions in `test/commands-worker.test.ts`.

1. RED: table-test resolved active deployment, null active with history, null active with empty history, and non-null active ID absent from history. The last case must not fall back to latest.
2. GREEN: implement pure target selection and exact `WorkerGovernanceStatusV1` constructors.
3. RED: cover locked `requested` and canonical `name@version` matches, zero rules, unrelated active root, target mismatch, and missing/malformed config/lock.
4. GREEN: read local state defensively, associate one exact selected root only, return stable unavailable reasons, and never borrow another Card's rules.
5. RED: successful JSON always contains governance; human and JSON render the same model; output includes only counts/reasons and contains no selectors, secrets, guessed hash, `enforced`, or `not enforced` text.
6. GREEN: construct once and render twice. Delete the stale hard-coded renderer.
7. Run:

   ```bash
   bunx bun@1.2.21 test test/commands-worker-status-governance.test.ts test/commands-worker.test.ts
   bunx bun@1.2.21 run typecheck
   ```

**Commit seam:** `[worker] [I239] make governance status evidence-bound`.

### Task 7 — Make version, tarball, and offline release identity exact

**Files:**

- Modify `package.json`, `cli/core/version.ts`, and `cli/index.ts`.
- Modify `scripts/verify-release-readiness.ts`.
- Create `scripts/release/registry-probe.ts`, `scripts/release/artifact-contract.ts`, `scripts/release/provenance.ts`, `scripts/release/publication-controls.ts`, and `scripts/release-cli.ts`.
- Modify `test/core-version.test.ts`, `test/scripts-verify-worker-contract.test.ts`, and `test/package-readiness.test.ts`.
- Create `test/scripts-release-registry-probe.test.ts`, `test/scripts-release-artifact-contract.test.ts`, `test/scripts-release-provenance.test.ts`, and `test/scripts-release-publication-controls.test.ts`.
- Add sanitized fixtures under `test/fixtures/release/` only where stable input contracts require them.
- Inspect `bun.lock`; change it only if package-manager evidence requires root-version metadata.

1. RED/GREEN version identity:
   - exact candidate 1.2.0;
   - runtime/package/build-identity parity;
   - loud invalid/missing package metadata failure;
   - release hard-cut floor 1.1.0;
   - project floor 0.8.0;
   - Mind floor 0.9.0; and
   - Buzz Card `harness.minVersion=1.2.0` as separate assertions.
2. Remove duplicate runtime version reads/fallbacks. Set package version to 1.2.0. Run `bun install --frozen-lockfile` and retain `bun.lock` byte-identical unless proven otherwise.
3. RED/GREEN registry classification for exact published response, exact E404, timeout, DNS/TLS, E401/E403, E429, npm 5xx, malformed/empty success, mismatched version, and unstructured nonzero. Only exact E404 is `unpublished`.
4. RED/GREEN required-member qualification for each existing source member and generated build identity independently. Preserve forbidden-state checks for `.env`, `.ai/`, tests, scripts, local config, and secret-bearing state.
5. RED/GREEN actual pack-result parsing and measurement: relative safe filename, byte length, SHA-1, SHA-256, integrity, path traversal rejection, and checkout/build tuple equality.
6. RED/GREEN clean-prefix/cache installation and all eight safe smokes. Prove bin resolution is inside the installed prefix and help causes no auth, network, keychain, or project write.
7. RED/GREEN strict release receipt/tag annotation parsing and exact run/job/artifact/tag/main/build/tar comparisons. Reject unknown/duplicate keys, non-40-hex SHAs, bad digests, expired/renamed/multiple artifacts, rerun mismatch, and main movement.
8. RED/GREEN GitHub and normalized timestamped npm control schemas, including stale/absent fields and secret-bearing input rejection. Do not rely on an undocumented npm settings API.
9. Wire thin CLI subcommands; policy stays in importable modules. Ensure process errors cannot echo secret-bearing raw input.
10. Run:

   ```bash
   bun install --frozen-lockfile
   bunx bun@1.2.21 test test/core-version.test.ts test/scripts-verify-worker-contract.test.ts test/package-readiness.test.ts
   bunx bun@1.2.21 test test/scripts-release-registry-probe.test.ts test/scripts-release-artifact-contract.test.ts test/scripts-release-provenance.test.ts test/scripts-release-publication-controls.test.ts
   bunx bun@1.2.21 run typecheck
   QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release
   ```

**Commit seams:**

- `[release] [I239] derive candidate identity from package metadata`;
- `[release] [I239] qualify exact Worker tarball and provenance`;
- `[release] [I239] validate publication controls fail closed`.

### Task 8 — Build the main-only immutable dry-run workflow

**Files:**

- Modify `.github/workflows/release.yml`.
- Create `test/scripts-release-workflow.test.ts` or extend package-readiness assertions where parsing already exists.
- Extend release module tests only for newly exercised orchestration boundaries.

1. RED: require dispatch to be dry-run-only, selected ref exactly `refs/heads/main`, input version equal package version, checkout equal fresh `origin/main`, and real online registry freshness before expensive qualification.
2. RED: require the dry-run job to have `contents: read` only and no environment, OIDC, token, tag, Release, or publish path.
3. GREEN: implement one dry-run validation path that runs typecheck, full tests, bridge verification, release readiness, generates build identity from checked-out Git, packs once, verifies required members, installs once, and runs eight smokes.
4. GREEN: write the strict release candidate receipt from measured data and validated workflow context; upload exactly the `.tgz` and receipt once with fixed artifact name, `if-no-files-found: error`, overwrite disabled, and fixed documented retention.
5. GREEN: record artifact ID/URL/digest, build tuple, and tar identities in `$GITHUB_STEP_SUMMARY`. Never inject artifact outputs retroactively into the uploaded receipt or leak mutable/secret inputs.
6. Delete `already_published` and every branch that treats an existing version as successful qualification.
7. RED/GREEN: prove a source fixture or old 1.1.0 artifact can pass version output yet fails required command/build qualification.
8. Run workflow tests, package readiness, release readiness, typecheck, and full suite. Do not dispatch.

**Commit seam:** `[ci] [I239] qualify one main-only Worker release artifact`.

### Task 9 — Bind publication controls and non-publishing recovery

**Files:**

- Modify `.github/workflows/release.yml`.
- Create `.github/workflows/release-recovery.yml`.
- Extend `scripts/release/provenance.ts` and `scripts/release/publication-controls.ts` only behind focused tests.
- Extend `test/scripts-release-workflow.test.ts`, `test/scripts-release-provenance.test.ts`, and `test/scripts-release-publication-controls.test.ts`.

1. RED: require a strict annotated `v1.2.0` tag message containing exact dry-run run ID/attempt, artifact ID, and normalized artifact digest. Reject lightweight, missing, unknown, duplicate, or mismatched fields.
2. RED: verify the exact run URL/API result, workflow path/event/head/attempt, successful dry-run job, skipped mutation jobs, exact unexpired artifact, archive digest, receipt, build tuple, and tar identity. Never search for a merely matching run.
3. RED: require peeled tag = dry-run receipt source = packaged build source = checkout = freshly fetched `origin/main`. Ancestor-only equality is insufficient.
4. GREEN: add unprotected tag validation with minimal `actions: read`; download by exact artifact ID, verify archive digest before extraction, and re-run receipt/tar checks.
5. RED/GREEN: require only the minimal protected job to use environment `darwinian-npm-publish` and `id-token: write`. After approval it repeats default-branch, freshness, control, identity, and tar validation and runs `npm publish ./<qualified>.tgz --access public` without checkout repack.
6. RED/GREEN: after propagation, require npm version, `gitHead` where reported, shasum, and integrity to match before Ubuntu/macOS installed smokes and exact GitHub Release create-or-verify. Existing mismatched metadata fails.
7. RED/GREEN control evidence:
   - GitHub environment matches the checked-in approval policy `scripts/release/release-policy.json` for `requiredReviewers` and `preventSelfReview`, and always has `can_admins_bypass=false`, custom policies enabled, one exact tag policy `v1.2.0`, and no branch policy;
   - the approval policy itself is validated: a non-empty named reviewer list, boolean self-review setting, `canAdminsBypass=false`, and environment `darwinian-npm-publish`, so no policy value can remove the approval click, enable admin bypass, or break the npm OIDC environment binding;
   - normalized authenticated npm Settings evidence names package `darwinian`, GitHub owner/repo/workflow/environment, allowed action exactly `npm publish`, and `require_2fa_disallow_tokens`;
   - any absent, stale, unverifiable, or secret-bearing field fails.
8. RED recovery workflow: exact annotated tag and failed canonical publish run/authorization receipt are required; every identity is derived/read back.
9. RED: structurally prohibit recovery OIDC, `NODE_AUTH_TOKEN`, `NPM_TOKEN`, publish, repack, tag mutation/push, dist-tag, and unpublish paths.
10. GREEN: recovery may verify existing npm/tag/commit/tar identity, run registry smokes, and create/verify missing GitHub Release metadata at the existing tag only. It enters the protected environment for policy-conformant approval without publish authority.
11. Run all workflow/provenance/control tests, release readiness, typecheck, and full suite. Do not tag, publish, configure controls, or dispatch recovery.

**Commit seams:**

- `[ci] [I239] publish only the authorized Worker tarball`;
- `[ci] [I239] add non-publishing Worker release recovery`.

### Task 10 — Publish coherent auth, ACP, Worker, and release documentation

**Files:**

- Modify `README.md`, `docs/cli-quickref.md`, `docs/release-process.md`, and `docs/maintainers/publishing.md`.
- Create `docs-docusaurus/docs/reference/cli/acp.md` and `docs-docusaurus/docs/reference/cli/worker.md`.
- Create or modify the relevant Docusaurus auth reference for login/refresh/logout.
- Modify `docs-docusaurus/sidebars.ts` and `CHANGELOG.md`.
- Modify `test/docs-readiness.test.ts` and release-readiness documentation assertions.

1. RED: assert discoverable syntax and safety boundaries for ACP serve, Worker status/materialize/Buzz tools/secret set, login, explicit refresh, ordinary logout, and strict logout.
2. RED: assert the stored-format hard cut, stable re-login diagnostics, scoped custody, non-persistent `DRWN_TOKEN`, receipt allowlist/non-disclosure, development non-eligibility, and capability-versus-live-evidence boundary.
3. RED: assert truthful governance states/reasons, declaration-versus-enforcement distinction, zero counts, and absence of false enforcement claims.
4. GREEN: update README/quick reference/Docusaurus pages/sidebar using registered command help as syntax truth. Mark the eight help smokes safe; actual auth/serve/materialize/secret/Buzz operations are not release smokes.
5. GREEN: rewrite release/maintainer docs around main-only dry run, build identity, exact run/artifact authorization, current-main recheck, annotated tag, dedicated environment, exact-tar OIDC publish, control readback, registry equality, stop/recovery, and retirement of token publication for `darwinian`.
6. GREEN: add dated, evidence-backed 1.0.0, 1.1.0, and 1.2.0 changelog sections covering ACP/materialize/Buzz/secret/auth/governance/release work without inventing live success.
7. Explicitly distinguish HTTP 202 cancellation acceptance from terminal cancellation, source availability from installed qualification, released capability from I236/I238 live operation proof, and Worker publication from Services adoption.
8. Run:

   ```bash
   bunx bun@1.2.21 test test/docs-readiness.test.ts test/package-readiness.test.ts
   bunx bun@1.2.21 run typecheck
   cd docs-docusaurus && bun install --frozen-lockfile && bun run typecheck && bun run build
   ```

   Hosted CI remains the exact internal-link/lychee evidence.

**Commit seams:**

- `[docs] [I239] document Worker auth and command hard cut`;
- `[docs] [I239] document exact CLI release and recovery`.

### Task 11 — Converge the exact source candidate and request G3

**Files:** all I239 changes; PR #102 description. Do not create a completion document yet.

1. Audit the complete diff against the Worker-only boundary and prohibited data/actions:

   ```bash
   git diff --name-only origin/main...HEAD
   git diff --check
   rg -n 'NPM_TOKEN|NODE_AUTH_TOKEN|npm publish|npm unpublish|npm dist-tag|git tag|DrwnCredentials|LegacyRunDeviceFlowInput' .github/workflows cli scripts test docs README.md CHANGELOG.md
   ```

   Interpret matches semantically: one exact-tar publish command and tag-validation code are required; token publication, recovery mutation, and legacy product paths are forbidden.
2. Run every focused test from Tasks 1–10 and record commands/results, including observed RED→GREEN history per vertical slice.
3. Run the exact full local gate:

   ```bash
   bun install --frozen-lockfile
   bunx bun@1.2.21 run typecheck
   QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release
   bunx bun@1.2.21 run verify:bridge
   bunx bun@1.2.21 test ./test/
   cd docs-docusaurus && bun install --frozen-lockfile && bun run typecheck && bun run build
   ```

4. Perform actual local pack qualification in a disposable directory/cache. Record version/source commit, tar filename/length/SHA-256/npm shasum/integrity, generated-member validation, required-member validation, forbidden-state validation, and eight installed-smoke exit codes. This is source evidence, not the post-merge Actions artifact.
5. Prove credential scope/receipt tests contain no real home path, keychain value, token, email, code, body, or identity in retained output. Prove no test touched the real keychain or credential path.
6. Confirm I236 still consumes only the generic immutable package/build/auth-surface receipt and I238 still retains both Worker and Buzz pre-live stops. A downstream contract change triggers coordination/review, not silent plan drift.
7. Ensure the worktree is clean, push one exact head, and wait for all required hosted checks on that head.
8. Update PR #102 with the mandatory `Testing & CI evidence` section: plan-to-test mapping, RED/GREEN observations, exact local results, actual-pack receipt, disclosure/security audit, hosted run/checks, docs build, boundary/non-actions, and residual risks.
9. Submit G3 only on the exact hosted-green head. The reviewer examines source, tests, workflow permissions, receipts, docs, and immutable evidence before PASS or Changes requested.
10. Do not merge, dispatch, configure external controls, create a tag, publish, or operate downstream systems as part of G3.

**Commit seam:** only a narrowly scoped convergence correction if verification finds one; otherwise none.

## Required CI definition of green

- CLI CI `Validate` passes on Ubuntu and Windows.
- `Command bridge` passes on Ubuntu, macOS, and Windows.
- Linux secret-tool backend job retains or strengthens its current explicit semantics; no new hidden failure is accepted.
- Docs preview validates docs readiness, Docusaurus typecheck/build, and internal links.
- Exact-head local typecheck, full Worker suite, `verify:release`, bridge verification, actual-pack qualification, and Docusaurus checks exit zero.
- No tracked test is removed or weakened to accommodate the change. Every changed assertion names the new contract.

## Post-G3 sequence — separately gated and not authorized by G2/G3 alone

1. After exact-head G3 PASS, Owner acknowledges `Received` into `In Review`, then merges only the reviewed head under the repository merge policy.
2. Verify the merge commit is the exact current `origin/main` tip.
3. Dispatch `.github/workflows/release.yml` at `refs/heads/main` with exact version 1.2.0 and dry-run enabled. Record run ID/attempt/URL/SHA, artifact ID/URL/digest, build tuple, receipt, and tar identity.
4. Stop. Obtain explicit authorization naming that exact run/artifact and separately authorizing GitHub/npm control configuration/readback and publication.
5. Configure/read back `darwinian-npm-publish` and npm package settings; validate sanitized evidence. Any mismatch stops before tagging.
6. Re-fetch `origin/main`. If it moved, inventory the delta and run a new dry run; never reuse the old artifact.
7. Create/push only the annotated `v1.2.0` tag carrying the authorized run/artifact identity. The workflow revalidates, waits for independent environment approval, publishes the exact tarball, and verifies registry bytes/smokes/Release metadata.
8. If npm publication succeeded and a later step failed, stop for separately authorized recovery or patch roll-forward. Never reuse 1.2.0 and never unpublish as an automatic response.
9. Create the I239 completion/immutable release receipt only after the full post-merge gate passes. Hand the released package/build/auth-schema capability receipt to I236, Services R2, and I238; perform none of their live operations.
10. I236 must mint a fresh v3 credential after its canonical cut and bind its authorized live receipts to the I239 release tuple. I238 still requires the separate Buzz child-environment receipt, lease, candidate, operation authorities, and its own live receipts.

## G2 success criteria

This plan passes G2 only if the reviewer can trace every fresh G1 acceptance criterion to an ordered implementation task and proof:

- deterministic cross-platform scope and key isolation;
- envelope v2/payload v3 only, with stable hard-cut diagnostics and no migration/global-key compatibility;
- correct login/refresh/logout identity, generation, persistence, and revoke/delete ordering;
- sanitized provenance-bound receipt schema and forbidden-data tests;
- truthful governance parity;
- exact package/build/tar/run/tag/npm identity;
- main-only fail-closed dry run and protected exact-tar OIDC publication;
- non-publishing recovery and external-control readback;
- eight installed smokes and all required package members;
- coherent public/maintainer documentation;
- source-only G3 and separate post-G3 mutation authorities; and
- explicit I236/Services/I238/Buzz ownership and stop conditions.

Any plan change that weakens those contracts, introduces credential migration, imports downstream staging constants, or treats schema availability as live evidence requires a new G1 amendment and review.
