# ABOUTME: G2 implementation plan for I239, the independently gated Darwinian Worker CLI 1.2.0 release.
# ABOUTME: Converts the approved truthful-governance, immutable-artifact, fail-closed publication, recovery, and documentation contracts into reviewable TDD increments.

# [I239] Darwinian Worker CLI 1.2.0 release and operational ACP/Buzz handoff — Implementation Plan (GATE 2)

> Execute via the plan-execution skill (`executing-plans`) with `test-driven-development`, `incremental-commits`, and `verification-before-completion` after G2 passes.

**Goal:** Ship a reviewable Worker-only `darwinian@1.2.0` candidate whose status output is truthful, whose exact packed bytes are qualified and provenance-bound before publication, and whose public documentation supports the ACP/Buzz surfaces without claiming Services adoption or I238 staging success.

**Architecture:** Build one typed local governance model shared by JSON and human renderers. Put registry, tarball, receipt, control-readback, and provenance rules in small TypeScript modules with injected process/API boundaries; invoke them from a thin release CLI and explicit dry-run, tag-publication, and non-publishing recovery workflows. `package.json` is the current-version source of truth while compatibility floors remain separate constants.

**Tech Stack:** TypeScript 6, Bun 1.2.21, Clipanion, npm 11 OIDC trusted publishing, GitHub Actions/REST APIs, Node crypto/filesystem/process primitives, Bun test, Docusaurus 3.9.2.

---

**Issue:** I239 · **Owner:** Remy K · **Reviewer:** Remy K (durable reviewer-of-record fallback)
**Branch:** `chore/i239-worker-cli-release-g1`
**PR:** [#102](https://github.com/remyjkim/darwinian-worker/pull/102)
**Binding G1 input:** [`cl0239_darwinian_worker_cli_release_target_architecture.md`](../analyses/cl0239_darwinian_worker_cli_release_target_architecture.md), approved on exact commit `9f867b33e9e3f79eabde8cc76443c642fb8324fb`
**Target release:** exactly `darwinian@1.2.0` / annotated tag `v1.2.0`

## Authorization and repository boundary

- G2 authorizes planning review only. No implementation begins until G2 passes and the Owner acknowledges that pass into Building.
- G3 is source-only. It does not require or authorize a merge, dry-run dispatch, GitHub/npm configuration mutation, tag creation, npm publication, GitHub Release creation, recovery dispatch, Services image adoption, staging deployment, candidate creation, secret installation, or live Buzz traffic.
- After G3 and merge, the lane may run the main-only dry run. It then stops for separate authorization naming the exact run ID, artifact ID, and artifact digest before any external configuration or publication action.
- I238 and the Services runtime-adoption child remain independent. This plan only produces their immutable Worker release handoff.
- Routine PR #67 and obsolete PRs #99/#57 remain separate. At release freeze, inventory intervening `main` changes and explicitly include or defer them; do not modify those PRs from I239.
- Work only in the clean I239 worktree. Preserve the dirty primary checkout.

## Evidence-based implementation choice

Two implementation shapes were evaluated:

1. **Workflow-embedded shell:** put registry probing, tar inspection, receipt parsing, API comparison, and tag checks directly in `release.yml`. This minimizes source files but duplicates security rules across dry-run, publish, and recovery paths; its network failures and malformed responses are difficult to exercise offline.
2. **Typed release-contract modules plus a thin CLI (selected):** isolate deterministic classification and identity comparison behind injected runners, keep workflow YAML responsible only for event/job/permission orchestration, and reuse the same verifier for local tarballs, downloaded dry-run artifacts, registry metadata, and recovery.

Select option 2. The current repository already uses importable verification cores in `scripts/verify-release-readiness.ts`; Bun tests can exercise TypeScript modules without npm or GitHub availability. Official GitHub APIs expose environment, branch-policy, exact-run/job, and artifact metadata. Official npm documentation exposes trusted-publisher and package publishing-access settings through the authenticated package Settings UI, but documents no stable read API for those fields; therefore the implementation must validate a normalized, timestamped npm settings readback captured from that UI and must not depend on an undocumented npm endpoint.

Current primary interface references, rechecked during G2 authoring and to be rechecked before post-G3 operations:

- GitHub deployment environments REST API: <https://docs.github.com/en/rest/deployments/environments>
- GitHub Actions artifact outputs/API identity: <https://github.com/actions/upload-artifact>
- npm trusted publishing fields and allowed actions: <https://docs.npmjs.com/trusted-publishers>
- npm package 2FA/token publication controls: <https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/>

## Target module and workflow layout

```text
cli/core/worker-governance-status.ts
  WorkerGovernanceStatusV1
  resolveGovernanceTarget(history)
  readLocalGovernanceDeclaration(projectRoot, target)
  buildWorkerGovernanceStatus(projectRoot, history)

scripts/release/registry-probe.ts
  probeRegistryVersion(runner, packageName, version) -> published | unpublished | indeterminate

scripts/release/artifact-contract.ts
  qualifyPackedArtifact(options) -> ReleaseTarballIdentity
  verifyRequiredMembers(files)
  smokeInstalledArtifact(tarPath, expectedVersion, runner)

scripts/release/provenance.ts
  ReleaseCandidateReceiptV1 parsing/writing
  release-tag annotation parsing
  exact run/job/artifact/tag/main/package identity comparison

scripts/release/publication-controls.ts
  normalized GitHub environment/policy and authenticated npm Settings readback schemas
  fail-closed expected-control comparison

scripts/release-cli.ts
  thin subcommands for registry probe, candidate qualification, provenance verification,
  control-readback verification, published-byte verification, and safe installed smokes

.github/workflows/release.yml
  main-only dry-run lane + annotated-tag publication lane

.github/workflows/release-recovery.yml
  separately authorized identity verification and metadata/smoke recovery only
```

The release modules return typed data and accept injected command/API runners. Only `scripts/release-cli.ts` reads process arguments, environment variables, GitHub output files, or the network. No release helper imports command-layer code with side effects.

## Target contracts and scaffolding

### Governance model

Use the G1 model verbatim and include `governance` in every successful status result:

```ts
export interface WorkerGovernanceStatusV1 {
  declaration: {
    state: "matched" | "unavailable";
    source: "local_project_lock";
    cardRef: string | null;
    allowCount: number | null;
    denyCount: number | null;
    reason:
      | null
      | "LOCAL_PROJECT_UNAVAILABLE"
      | "LOCAL_TARGET_UNAVAILABLE"
      | "LOCAL_CARD_REF_MISMATCH";
  };
  enforcement: {
    state: "not_applicable" | "unknown";
    source: "deployment_api";
    policyHash: null;
    reason: "NO_ACTIVE_DEPLOYMENT" | "CAPABILITY_NOT_REPORTED";
  };
}
```

Target selection is pure: resolved active row, latest history only when the active ID is null, no target for empty history, and no latest fallback for a non-null active ID absent from history. Local association succeeds only when the target `card_ref` equals the selected root's locked `requested` value or canonical `${name}@${version}`. Missing/malformed local state never fails the remote status call and never borrows another Card's rules.

### Registry probe

```ts
export type RegistryProbe =
  | { state: "published"; version: string }
  | { state: "unpublished"; code: "E404" }
  | { state: "indeterminate"; reason: string };

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}
```

The real adapter runs `npm view darwinian@1.2.0 version --json --prefer-online` with a disposable cache and bounded timeout. Exit zero with an exact parsed version is `published`; only a parseable npm `E404` for the exact package/version is `unpublished`; every other exit, timeout, transport/TLS/DNS/auth/rate-limit response, empty/malformed success, or mismatched version is `indeterminate`. Both `published` and `indeterminate` exit nonzero at the workflow boundary.

### Candidate receipt and tag authorization

```ts
export interface ReleaseCandidateReceiptV1 {
  schema: "darwinian.release-candidate";
  schemaVersion: 1;
  workflow: {
    path: ".github/workflows/release.yml";
    runId: number;
    runAttempt: number;
    runUrl: string;
  };
  package: { name: "darwinian"; version: "1.2.0"; gitSha: string };
  tarball: {
    filename: string;
    byteLength: number;
    sha256: string;
    npmShasum: string;
    npmIntegrity: string;
  };
  smokes: readonly [
    "drwn --version",
    "drwn acp serve --help",
    "drwn worker materialize --help",
    "drwn worker buzz-tools --help",
    "drwn worker secret set --help",
  ];
  qualifiedAt: string;
}
```

The receipt is inside a fixed-name Actions artifact beside the exact `.tgz`. `actions/upload-artifact@v4` supplies the artifact ID, URL, and SHA-256 digest after upload; those values are recorded in the run summary and I239 authorization record, not retroactively inserted into the already-uploaded receipt. Normalize raw-hex and `sha256:<hex>` API forms before exact comparison.

Every candidate tarball must contain all five release-defining members:

- `cli/commands/acp/serve.ts`
- `cli/commands/worker/materialize.ts`
- `cli/commands/worker/buzz-tools.ts`
- `cli/commands/worker/secret-set.ts`
- `registry/cards/buzz-delivery-worker/card.json`

Removal of any one member fails qualification. Existing exclusions for `.env`, `.ai/`, tests, scripts, local configuration, and secret-bearing state remain enforced.

The annotated tag message has a strict machine-readable block containing schema marker, exact dry-run run ID and attempt, artifact ID, and artifact digest. Unknown/duplicate/missing fields fail. Publication queries `GET /repos/remyjkim/darwinian-worker/actions/runs/{run_id}`, its exact jobs, and artifacts; it never searches for a merely matching run. It downloads the artifact archive by artifact ID, verifies the archive SHA-256 before extraction, then verifies the receipt and tarball identities.

### Publication-control evidence

`publication-controls.ts` validates two explicit inputs without retaining secrets:

- GitHub JSON read through `gh api` from the exact `darwinian-npm-publish` environment and its deployment branch/tag policies. Require reviewer login `leeminseung`, `prevent_self_review=true`, `can_admins_bypass=false`, custom policies enabled, and one exact tag policy `v1.2.0` with no branch policy.
- A normalized, timestamped authenticated npm package-Settings readback. Require package `darwinian`, GitHub owner `remyjkim`, repository `darwinian-worker`, workflow `release.yml`, environment `darwinian-npm-publish`, allowed action exactly `npm publish`, and publishing access `require_2fa_disallow_tokens`. The capture contains setting values and timestamp only—never cookies, tokens, OTPs, headers, or HTML.

Any absent/unverifiable field fails. Tests use fixtures; G3 does not perform the live readback. Post-G3 configuration and evidence capture require separate authorization.

## Testing strategy (TDD contract)

### Behaviors & invariants

- Every production behavior begins with a focused failing test observed under Bun 1.2.21.
- Human and JSON status render from the same `WorkerGovernanceStatusV1`; successful JSON always contains it, including zero-rule and unavailable states.
- Current Deploy API evidence can yield only `unknown` or `not_applicable`, never `enforced` or `not_enforced`; `policyHash` is always null.
- Local governance uses one exactly matched root and reports counts only. Selectors, secret values, and unrelated Cards never appear.
- Registry freshness is tri-state and fail-closed; only a confirmed exact-version 404 permits progress.
- A candidate is one actual `.tgz`. Dry-run uploads it, tag publication downloads it, and the protected job publishes that relative tar path without repacking.
- Run, job, artifact, receipt, tarball, annotated-tag, peeled-commit, checkout, and freshly fetched `origin/main` identities must all agree.
- Artifact absence, expiry, rename, digest drift, malformed receipt, workflow rerun mismatch, or main movement stops publication and requires a new dry run.
- The dedicated environment is the only job with `id-token: write`; no npm token appears in source or workflow configuration.
- Recovery has no OIDC, token, publish, tag mutation, dist-tag mutation, or unpublish path.
- `package.json` supplies current version identity; compatibility floors `0.8.0`, `0.9.0`, and release hard-cut floor `1.1.0` remain distinct.
- Offline unit/workflow-contract tests never require npm or GitHub availability. Exact-candidate qualification may resolve package dependencies into a disposable prefix during explicit G3 verification and the release workflow; it never probes version freshness implicitly or mutates a registry.

### Layer ownership

- **Unit:** governance target/ref association; registry classification; receipt/tag/control schemas; all exact-identity comparisons.
- **Integration:** status command human/JSON parity using stubbed Deploy API and disposable local projects; self-contained fixture-tar installation through the real smoke runner.
- **G3 candidate verification:** real local `npm pack` plus clean-prefix installation of the resulting `darwinian` tarball, isolated from the test suite's offline fixtures.
- **Workflow contract:** event/ref/permission/environment/job dependencies, exact-run APIs, artifact download/publish path, skipped dry-run mutation jobs, main-tip revalidation, and recovery prohibitions.
- **Documentation contract:** command coverage, semantics, changelog history, sidebar inclusion, maintainer process, Docusaurus typecheck/build, and internal links in hosted CI.
- **Post-merge operational evidence:** real registry probe, main-only dry run, control readback, exact OIDC publish, registry identity, Ubuntu/macOS installed smokes, and GitHub Release verification. These are not G3 source tests.

### TDD sequence

1. Truthful governance target selection and typed model.
2. Human/JSON governance parity and local-failure visibility.
3. Package-derived runtime version and separate release/floor assertions.
4. Offline tri-state registry probe classification.
5. Required-member and clean-installed-tarball qualification.
6. Receipt, tag annotation, exact-run/job/artifact, and main-tip identity validation.
7. Dedicated publication-control evidence validation.
8. Main-only dry-run workflow and exact artifact upload.
9. Annotated-tag protected publication of the downloaded tarball and post-publish byte checks.
10. Non-publishing recovery workflow.
11. Public docs, changelog, release instructions, and docs build.
12. Full local/hosted regression and exact-head G3 evidence.

For every increment: add one RED case, run it and record the expected assertion or nonzero exit, implement the smallest GREEN change, rerun the focused file, refactor only while green, run affected neighboring tests, then commit the vertical slice with its tests.

### Case catalog

- Governance: requested-ref match; canonical-ref match; zero rules; missing config; malformed config; missing lock; malformed lock; no selected root; target mismatch; unrelated active root; resolved active deployment; no active with history; no active with empty history; non-null active ID absent from history.
- Rendering: same exact model in JSON/human; stable reason codes; counts of zero; no selectors, secrets, guessed hash, `enforced`, or `not enforced` text.
- Registry: exact published response; exact `E404`; timeout; DNS; TLS; `E401`/`E403`; `E429`; npm 5xx; malformed JSON; empty success; mismatched version; nonzero without a structured npm error.
- Tarball: all five required members; each member missing independently; forbidden `.env`, `.ai/`, tests, scripts, local config, or secret state; filename/size/SHA-1/SHA-256/integrity mismatch; source-only command works while old-artifact fixture lacks commands.
- Installed smokes: expected version and four help commands succeed from the isolated installed bin; any nonzero, source-bin resolution, auth/network attempt, or project write fails qualification.
- Provenance: valid receipt; schema/version/type/filename drift; duplicate annotation field; lightweight tag; peeled-tag mismatch; checkout mismatch; current-main mismatch; wrong workflow/event/head/run attempt; Dry run job non-success; publish/release jobs non-skipped in dry run; missing/expired/renamed/multiple artifact; API/action digest normalization and mismatch.
- Controls: exact expected GitHub/npm settings; missing reviewer; self-review allowed; admin bypass; extra/missing tag policy; wrong owner/repo/workflow/environment/action; token-permitting access; stale/absent timestamp; secret-bearing field rejection.
- Recovery: exact published identity and safe smoke/GitHub-release metadata path; every mismatch stops; structural tests reject `id-token: write`, `NODE_AUTH_TOKEN`, `NPM_TOKEN`, `npm publish`, `npm dist-tag`, `npm unpublish`, `git tag`, or tag push.
- Docs: all public commands; declaration-versus-enforcement; 202 cancellation acceptance versus terminal cancellation; source versus live qualification; Worker publication versus Services adoption/I238 proof; dated 1.0.0/1.1.0/1.2.0 history.

### Harness, fixtures, and test data

- Rework `test/commands-worker-status-governance.test.ts` around a table-driven disposable project/API harness. Use valid `ProjectLockV1` fixtures and restore cwd/env/fetch after every case.
- Add release fixtures under `test/fixtures/release/` only for stable JSON/text contracts: npm results, GitHub run/jobs/artifacts, environment/policies, normalized npm settings, receipt, and tag annotation. Never store auth headers, cookies, tokens, OTPs, or live settings pages.
- Build tarballs in fresh `mkdtemp` roots with a task-specific npm cache. Do not write to the user npm cache or global prefix.
- Resolve the installed `drwn` executable from the temporary prefix; assert it is outside the repository before every smoke.
- Simulate old published `1.1.0` bytes with a minimal fixture tar/package whose version works but required commands/members do not. Do not download npm during ordinary tests.
- Inject command and GitHub API runners for failure matrices. Workflow tests inspect YAML structurally and use fixture responses; they do not dispatch Actions.
- Keep the candidate artifact and normalized control readbacks out of git. Only sanitized schemas/examples and immutable final receipts belong in later completion evidence.

### Commands and environment

```bash
git submodule update --init darwinian-worker-skills
bun install --frozen-lockfile
bunx bun@1.2.21 run typecheck
bunx bun@1.2.21 test --timeout 30000 <focused-test-files>
QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release
bunx bun@1.2.21 run verify:bridge
bunx bun@1.2.21 test --timeout 30000 ./test/

cd docs-docusaurus
bunx bun@1.2.21 install --frozen-lockfile
bunx bun@1.2.21 run typecheck
bunx bun@1.2.21 run build
```

Use local Bun only for quick RED/GREEN feedback if needed; final evidence uses the CI-pinned Bun 1.2.21. Online npm freshness is run only by the post-merge release workflow or an explicitly authorized manual diagnostic, always with a disposable cache and bounded timeout.

### Required CI jobs and definition of green

- CLI CI `Validate` passes on Ubuntu and Windows.
- `Command bridge` passes on Ubuntu, macOS, and Windows.
- Linux secret-tool job completes without introducing a new hard failure; preserve its existing explicit best-effort status unless separately changed.
- Docs preview `validate` passes docs readiness, Docusaurus typecheck/build, and lychee internal-link checks.
- Local typecheck, full Worker suite, `verify:release`, bridge verification, actual-pack qualification, and Docusaurus checks exit zero on the exact PR head.
- No tracked test is deleted or weakened merely to accommodate the release change; every changed assertion names the new contract.

### Non-goals, manual checks, and residual risk

- No Services DTO or runtime change; no inference of deployed enforcement.
- No live staging, candidate, secret, ACP, or Buzz operation.
- No command-bridge publication or environment-policy migration.
- No reliance on undocumented npm settings endpoints. The actual npm readback remains an authorized authenticated UI step with sanitized normalized evidence.
- GitHub Actions artifact retention can expire; an expired candidate always requires a fresh dry run.
- npm publication is immutable. A failure after publish transitions to recovery/roll-forward, never version reuse.
- External environment and npm settings remain mutable after source review; immediate pre-tag readback and protected-job revalidation are mandatory controls.

## Execution tasks

### Task 0 — Establish the exact clean baseline

**Files:** no production changes.

1. Fetch `origin`, confirm the implementation worktree branch and upstream, and record `git rev-parse HEAD`, `git status --short`, and submodule status.
2. Confirm G2 passed and acknowledge Owner Status into Building before editing source.
3. Run the pinned baseline: typecheck, focused existing governance/package tests, `QUALITY_GATE_TEST_MODE=1 verify:release`, bridge verification, and full suite.
4. If a baseline fails, stop and use `systematic-debugging`; do not fold an unrelated repair into I239 without explicit scope review.
5. Record npm/latest and current `origin/main` as evidence only. Do not dispatch or mutate anything.

Expected baseline identity before implementation: branch descends from G1 head `9f867b3`; package/runtime `1.1.0`; Buzz Card minimum `1.2.0`; current unsafe release workflow reproduced by existing contract assertions.

### Task 1 — Build the truthful governance model and renderers

**Files:**

- Create `cli/core/worker-governance-status.ts`.
- Modify `cli/commands/worker/status.ts`.
- Modify `cli/commands/worker/types.ts` only if the successful status result DTO is exported there.
- Rewrite `test/commands-worker-status-governance.test.ts`.
- Modify focused status assertions in `test/commands-worker.test.ts`.

1. RED: table-test all four deployment-target cases before local project reads. Prove inconsistent non-null active ID does not fall back to latest.
2. GREEN: implement pure target resolution and `WorkerGovernanceStatusV1` constructors.
3. RED: test requested/canonical exact matches, zero rules, mismatches, unrelated roots, missing/malformed config/lock, and stable reasons.
4. GREEN: load local config/lock defensively, select only `config.activeWorker`'s root/card, compare only the two accepted refs, and return unavailable states instead of swallowing errors.
5. RED: assert successful `--json` always has the exact governance object and human output renders that same object for matched/unavailable cases.
6. GREEN: construct the complete status result once, then render JSON or human. Delete `renderGovernance()` and every literal `not enforced` claim.
7. Run:

   ```bash
   bunx bun@1.2.21 test test/commands-worker-status-governance.test.ts test/commands-worker.test.ts
   bunx bun@1.2.21 run typecheck
   ```

8. Commit the model, command, and tests together, for example `[worker] make governance status evidence-bound`.

### Task 2 — Make package identity single-source and preserve floors

**Files:**

- Modify `package.json`.
- Modify `cli/core/version.ts`.
- Modify `cli/index.ts`.
- Modify `scripts/verify-release-readiness.ts`.
- Modify `test/core-version.test.ts`.
- Modify `test/scripts-verify-worker-contract.test.ts`.
- Modify `test/package-readiness.test.ts` where version/package members are asserted.
- Inspect `bun.lock`; modify only if `bun install --frozen-lockfile`/package-manager output proves root metadata requires it.

1. RED: change tests to require exact candidate `1.2.0`, runtime/package parity, release hard-cut floor `>=1.1.0`, project floor `0.8.0`, Mind floor `0.9.0`, and Buzz Card `harness.minVersion=1.2.0` as separate assertions.
2. RED: add missing/invalid adjacent `package.json` cases for the runtime version loader; require a loud deterministic failure, not `0.0.0`.
3. GREEN: make `cli/core/version.ts` parse and strictly validate adjacent `package.json.version`; use `DRWN_VERSION` in `cli/index.ts` and remove its duplicate read/fallback.
4. GREEN: set `package.json.version` to `1.2.0`; replace both exact `1.1.0` readiness policies with candidate parity plus the frozen first-supported floor.
5. Run `bun install --frozen-lockfile`; retain `bun.lock` unchanged if it remains byte-identical.
6. Run focused version/release-contract tests and typecheck.
7. Commit as a version-contract slice, for example `[release] derive runtime version from package metadata`.

### Task 3 — Add offline release identity, tarball, and control cores

**Files:**

- Create `scripts/release/registry-probe.ts`.
- Create `scripts/release/artifact-contract.ts`.
- Create `scripts/release/provenance.ts`.
- Create `scripts/release/publication-controls.ts`.
- Create `scripts/release-cli.ts`.
- Modify `package.json` to add one explicit internal `release:tool` entrypoint without adding a dependency.
- Create `test/scripts-release-registry-probe.test.ts`.
- Create `test/scripts-release-artifact-contract.test.ts`.
- Create `test/scripts-release-provenance.test.ts`.
- Create `test/scripts-release-publication-controls.test.ts`.
- Create sanitized fixtures under `test/fixtures/release/` as required.

1. RED/GREEN registry classification in the exact case order from the case catalog. Prove only confirmed `E404` returns `unpublished`.
2. RED/GREEN strict receipt and annotation parsing. Reject unknown keys, duplicate annotation keys, non-40-hex SHAs, invalid digests/integrity, path traversal, absolute tar paths, and versions other than `1.2.0`.
3. RED/GREEN required-member inspection. Add the five G1 paths to the existing readiness package-members list and reusable verifier.
4. RED/GREEN pack-result qualification using injected pack output and self-contained fixtures. Compare reported and measured byte length/SHA-1/integrity, calculate SHA-256, reject path traversal, and allow only the produced relative filename. The real adapter uses `npm pack --json --pack-destination <temp>` and is exercised against the actual candidate in Task 8.
5. RED/GREEN clean-prefix/cache installation and the five exact safe smokes using a self-contained no-dependency fixture package. Prove the executable resolves under the prefix and no command reads auth or writes a project. Run the same adapter against the actual dependency-bearing candidate separately in Task 8.
6. RED/GREEN exact run/job/artifact/receipt/tag/main comparison with injected GitHub API and git-command results.
7. RED/GREEN GitHub/npm control schemas, including secret-bearing field rejection and timestamp freshness.
8. Wire CLI subcommands without embedding policy in argument parsing. Ensure secrets and raw npm Settings HTML can never be emitted.
9. Run all four new focused test files, `test/package-readiness.test.ts`, and typecheck.
10. Commit by vertical behavior: registry; artifact/receipt; provenance/controls. Keep each implementation with its RED/GREEN tests.

### Task 4 — Replace version reuse with the main-only dry-run workflow

**Files:**

- Modify `.github/workflows/release.yml`.
- Modify `test/package-readiness.test.ts`.
- Create `test/scripts-release-workflow.test.ts` if structured workflow assertions would otherwise overload package readiness.
- Modify `docs/release-process.md` only after the workflow is green in Task 7.

1. RED: assert `workflow_dispatch` is dry-run-only, selected ref must be `refs/heads/main`, input version must equal package version, and the checked-out SHA must equal freshly fetched `origin/main`.
2. RED: assert the dry-run job has `contents: read` only—no environment, OIDC, token, tag, release, or publish capability.
3. RED: assert real registry freshness runs in the dry-run job before expensive qualification and treats non-404 ambiguity as failure.
4. GREEN: reshape dispatch into one `Dry run complete` job that checks main/version/freshness, runs typecheck/full tests/bridge/release gate, creates one actual tarball, and runs all local installed smokes.
5. GREEN: write `ReleaseCandidateReceiptV1` from validated workflow context and measured outputs; upload exactly the receipt and `.tgz` once with `actions/upload-artifact@v4`, fixed artifact name, `if-no-files-found: error`, overwrite disabled, and a documented fixed retention period.
6. GREEN: write artifact ID/URL/digest plus receipt/tar identities to `$GITHUB_STEP_SUMMARY`. Never put secrets or mutable input-derived identity into the receipt.
7. Delete `already_published` and every path that treats an existing version as success.
8. Run workflow/package focused tests, `verify:release`, and typecheck. Do not dispatch the workflow before G3/merge.
9. Commit, for example `[ci] make CLI release dry runs immutable and main-only`.

### Task 5 — Bind annotated-tag publication to the exact dry-run artifact

**Files:**

- Modify `.github/workflows/release.yml`.
- Extend `test/scripts-release-provenance.test.ts`.
- Extend `test/scripts-release-workflow.test.ts` and/or `test/package-readiness.test.ts`.

1. RED: require an annotated `v1.2.0` tag whose strict annotation names exact run/attempt/artifact/digest; reject lightweight/mismatched tags.
2. RED: fixture exact-run verification for workflow path/event/head/attempt, successful `Dry run complete`, skipped mutation jobs, exact unexpired artifact, archive digest, receipt, and tar identity.
3. RED: require peeled tag = dry-run receipt SHA = checkout SHA = freshly fetched `origin/main`; prove ancestor-only and moved-main cases fail.
4. GREEN: implement the unprotected tag validation job with explicit `actions: read`; download the exact artifact archive through the artifact-ID REST endpoint and verify its digest before extraction.
5. RED: assert only the minimal publish job has `id-token: write` and environment `darwinian-npm-publish`; it depends on validation and repeats default-branch, freshness, artifact, receipt, and tar checks after approval.
6. GREEN: publish exactly `./<qualified-file>.tgz --access public` from the downloaded artifact. Remove checkout-source `npm publish` and all repacking.
7. RED/GREEN: query exact npm version metadata after propagation and require version, `gitHead`, shasum, and integrity to match receipt/tag before Ubuntu/macOS installed smokes.
8. RED/GREEN: make GitHub Release creation verify exact existing metadata or create once after byte/smoke success. Existing mismatched metadata is a failure, not idempotent success.
9. Ensure tag/publication workflow cannot be entered from `workflow_dispatch dry_run=false`.
10. Run all release tests, release readiness, typecheck, and full suite. Do not create or push the tag.
11. Commit, for example `[ci] publish only the authorized CLI tarball`.

### Task 6 — Add fail-closed publication controls and non-publishing recovery

**Files:**

- Create `.github/workflows/release-recovery.yml`.
- Extend `scripts/release/publication-controls.ts` and `scripts/release/provenance.ts` only as required by tested recovery identity.
- Extend `test/scripts-release-publication-controls.test.ts`.
- Extend `test/scripts-release-provenance.test.ts`.
- Extend `test/scripts-release-workflow.test.ts`.

1. RED: assert source-level publication controls name the dedicated environment, exact tag policy, independent reviewer, no self-review/admin bypass, exact npm trusted publisher, `npm publish`-only action, and disallowed tokens.
2. GREEN: provide the sanitized control-readback validator and documented `gh api` GET inputs; require separate normalized authenticated npm Settings evidence because no documented stable npm settings-read API exists.
3. RED: assert recovery dispatch runs only at annotated `v1.2.0`, accepts the failed canonical publish run ID plus authorization receipt, and derives every remaining identity.
4. RED: prove recovery YAML and invoked code contain no OIDC/token/publish/retag/tag-push/dist-tag/unpublish behavior.
5. GREEN: add recovery validation for tag/package/runtime/canonical publish run/dry-run commit/npm `gitHead`/tar shasum/integrity. Only then allow safe Ubuntu/macOS registry smokes or creation/verification of missing GitHub Release metadata at the existing tag.
6. GREEN: enter `darwinian-npm-publish` for independent approval without `id-token: write`; keep permissions minimal and failure output containment-oriented.
7. Run release workflow/provenance/control tests and typecheck. Do not dispatch recovery.
8. Commit, for example `[ci] add non-publishing CLI release recovery`.

### Task 7 — Publish coherent operator and maintainer documentation

**Files:**

- Modify `README.md`.
- Modify `docs/cli-quickref.md`.
- Create `docs-docusaurus/docs/reference/cli/acp.md`.
- Create `docs-docusaurus/docs/reference/cli/worker.md`.
- Modify `docs-docusaurus/sidebars.ts`.
- Modify `docs/release-process.md`.
- Modify `docs/maintainers/publishing.md`.
- Modify `CHANGELOG.md`.
- Modify `test/docs-readiness.test.ts`.
- Modify release-readiness documentation assertions only when needed to enforce this approved contract.

1. RED: add documentation assertions for ACP serve, Worker status/materialize/Buzz tools/secret set, governance semantics, release provenance, dedicated environment, token retirement, recovery, and dated 1.0.0/1.1.0/1.2.0 entries.
2. GREEN: add concise README discovery/safety text and complete quick-reference syntax using the registered command help as source of truth.
3. GREEN: add ACP and Worker Docusaurus reference pages and sidebar entries. Document that `--help` smokes are safe; actual serve/materialize/secret/Buzz execution is not a release smoke.
4. GREEN: document truthful status examples and all reason/state meanings; distinguish declaration from deployment enforcement and avoid selectors/secrets.
5. GREEN: rewrite release process around main-only dry run, exact run/artifact authorization, immediate main-tip recheck, annotated tag, dedicated environment approval, exact-tar OIDC publish, digest equality, and stop/recovery boundaries.
6. GREEN: retire local token publication as a supported `darwinian` path in `docs/maintainers/publishing.md`; keep the separately gated bridge procedure clearly separate.
7. GREEN: add evidence-backed historical 1.0.0 and 1.1.0 sections and dated 1.2.0 release notes. Do not invent live/staging outcomes.
8. Explicitly distinguish HTTP 202 cancellation acceptance from terminal cancellation, source availability from live qualification, and Worker publication from Services adoption/I238 proof.
9. Run docs readiness, package readiness, Docusaurus install/typecheck/build, and rely on hosted lychee for the exact CI link check.
10. Commit public command docs separately from maintainer/release notes where reviewability benefits, using `[docs]` prefixes.

### Task 8 — Converge full regression and prepare exact-head G3

**Files:** all I239 files; update PR #102 description. Do not create a completion document yet.

1. Audit changed files against the Worker-only boundary:

   ```bash
   git diff --name-only origin/main...HEAD
   rg -n 'NPM_TOKEN|NODE_AUTH_TOKEN|npm publish|npm unpublish|npm dist-tag|git tag' .github/workflows scripts test docs README.md CHANGELOG.md
   git diff --check
   ```

   Interpret matches semantically: one exact-tar publish command is required in the protected job; token publication and recovery mutation are forbidden.
2. Run every focused test from Tasks 1–7 and capture commands/results.
3. Run pinned typecheck, `QUALITY_GATE_TEST_MODE=1 verify:release`, bridge verification, full suite, and Docusaurus checks.
4. Perform a local actual-pack qualification in a disposable directory and record tar filename/length/SHA-256/npm shasum/integrity plus all five installed-smoke exit codes. This is source evidence, not the post-merge Actions candidate.
5. Run `git diff --check`, confirm a clean worktree, push the exact head, and wait for all required hosted checks.
6. Update PR #102 with the mandatory `Testing & CI evidence` section: plan-to-test map, observed RED/GREEN increments, local exact commands/results, actual-pack receipt, hosted run/checks, security interpretation, docs build, non-goals, and residual risk.
7. Request G3 only against the exact hosted-green head. Do not merge or dispatch release/recovery workflows as part of G3 submission.

## Post-G3 release sequence — not authorized by this plan alone

After exact-head G3 passes:

1. Owner acknowledges Received, merges the reviewed head, and verifies the merge commit is still current `origin/main`.
2. Dispatch `.github/workflows/release.yml` at `refs/heads/main` with exact version `1.2.0` and dry run enabled. Record run ID/attempt/URL/SHA, artifact ID/URL/digest, receipt, and tar identity.
3. Stop. Obtain explicit authorization that names that exact run/artifact and separately authorizes GitHub/npm control configuration/readback and publication.
4. Configure/read back `darwinian-npm-publish` and npm package settings; validate sanitized evidence. Any mismatch stops before tagging.
5. Re-fetch `origin/main`. If it moved, inventory the delta and repeat the dry run; do not reuse the old artifact.
6. Create/push only the annotated `v1.2.0` tag carrying the authorized run/artifact identity. The workflow revalidates, pauses for independent approval, publishes the exact tarball, and verifies registry bytes/smokes/release metadata.
7. If failure occurs after npm publication, use separately authorized recovery or a separately decided deprecation/patch roll-forward. Never reuse `1.2.0`.
8. Create the I239 completion/immutable release receipt only after the post-merge gate passes, then hand it to the Services adoption owner and I238 without performing their work.

## Success criteria

- `worker status` always reports the typed governance object truthfully in both renderers, associates only an exact local lock target, and never claims enforcement the API does not report.
- Candidate version is exactly 1.2.0; runtime identity comes from packaged metadata; compatibility floors and Buzz minimum remain deliberate.
- Dry run is main-only and fails unless npm confirms exact-version 404.
- One actual tarball contains all five required members, excludes forbidden state, and passes all five isolated installed smokes.
- Annotated-tag publication is bound to one exact successful dry-run run/artifact and unchanged current `main`; the protected job publishes only the downloaded tarball.
- Dedicated GitHub/npm controls have a fail-closed, sanitized readback contract; tokens are not a supported CLI publication route.
- Post-publication npm bytes must match the qualified receipt before Ubuntu/macOS smokes and GitHub Release verification.
- Recovery can verify/smoke/repair missing release metadata but cannot publish or mutate tags/package distribution state.
- README, quick reference, Docusaurus, sidebar, release process, maintainer guide, and changelog are coherent and green.
- Exact-head local and hosted evidence passes G3 while all Services/I238 and operational mutations remain outside I239.
