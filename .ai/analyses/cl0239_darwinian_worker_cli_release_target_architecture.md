# ABOUTME: G1 target architecture for I239, the independently gated Darwinian Worker CLI 1.2.0 release and immutable ACP/Buzz handoff.
# ABOUTME: Defines truthful governance status, fail-closed release identity, packed-artifact qualification, documentation, provenance, and strict Services/I238 boundaries.

# [I239] Darwinian Worker CLI 1.2.0 release and operational ACP/Buzz handoff — target architecture

**Issue:** [I239] Darwinian Worker CLI 1.2.0 release and operational ACP/Buzz handoff
**Date:** 2026-08-07
**Status:** G1 proposal; no G2 plan, implementation, publication, Services mutation, staging action, candidate, secret, or live test is authorized by this document
**Owner:** Remy K
**Reviewer:** Remy K (user-authorized G1 reviewer control)
**Publication environment reviewer:** `leeminseung` (independent GitHub account with verified repository write access)
**Repository:** `remyjkim/darwinian-worker`
**Parent:** I232 cross-repository architecture program
**Downstream:** separately numbered Services runtime-adoption child, then I238 controlled staging qualification
**References:** [I232, I238, I105, I106, I107, I220, I221, `.github/workflows/release.yml`, `.github/workflows/release-command-bridge.yml`, `cli/commands/worker/status.ts`, `scripts/verify-release-readiness.ts`, `test/package-readiness.test.ts`, `test/commands-worker-status-governance.test.ts`, `docs/release-process.md`, `CHANGELOG.md`, `https://www.npmjs.com/package/darwinian`, `https://github.com/remyjkim/darwinian-worker/releases/tag/v1.1.0`]

---

## 1. Executive decision

I239 produces one provenance-verifiable `darwinian@1.2.0` release from the reviewed Worker
source already carrying I105/I220/I221. Before that release can be qualified, the Worker
must correct its stale governance-status claim, document every new public command, replace
the idempotent-but-unsafe version-reuse behavior with fail-closed version freshness, and
prove the actual packed artifact exposes the required surfaces.

The release is deliberately separated from its consumers:

```text
I239 Worker source + release qualification
  -> explicit publication authorization
  -> immutable npm/tag/commit/package handoff
  -> separately gated Services image/runtime adoption
  -> I238 immutable governed staging qualification
```

I239 does not update Services, deploy staging, create a candidate, install secrets, contact
Buzz, or establish public multi-user/production readiness. It stops at the publication
gate until explicit authorization, and after publication it emits evidence rather than
performing downstream mutations.

The target version is exactly `1.2.0`, not a moving release-series label. If `1.2.0`
appears on npm or as a conflicting release before the candidate is published, the lane
stops and records a new version decision; it never silently advances or reuses an existing
version.

## 2. Evidence baseline and explicit non-claims

### 2.1 Immutable baseline at G1 authoring

| Fact | Verified evidence |
|---|---|
| Worker `origin/main` | `bfbbffa5b413abd32eb689f4f545cfadcd6a554d` (`[I105] Close ACP and Buzz source evidence (#101)`) |
| npm latest | `darwinian@1.1.0`, published 2026-08-05 |
| npm 1.1.0 source | `gitHead=ece98cb2db30f70b97a8a027445ba790b836ca20` |
| npm 1.1.0 artifact | shasum `e1f93839b60a040f79eb8a44189e11fb7ae06968`; integrity `sha512-c8ZtMzGxLBa4LtKLMLBAIJXGOlABHEaSNui8AD0LCGXJNBvJQ8U4xaRny5H7zTA+KhUU0EWyRVB+D87CUXdK4Q==` |
| Latest GitHub release | `v1.1.0`, published 2026-08-05 |
| Unreleased source delta | 90 files, 8,071 insertions, 170 deletions from published `ece98cb2` to `bfbbffa5` |
| Current package/runtime version | `package.json=1.1.0`; `cli/core/version.ts=1.1.0` |
| Governed Buzz Card floor | `harness.minVersion=1.2.0` |
| Clean Worker baseline | isolated `bfbbffa5` worktree: typecheck passed; 1,998 tests passed, 8 opt-in/live tests skipped, 0 failed |
| Live GitHub publication environment | shared `npm-publish`: `protection_rules=[]`; `can_admins_bypass=true`; `deployment_branch_policy=null` |
| GitHub `main` protection | no branch-protection rule is configured |
| npm provenance evidence | `darwinian@1.1.0` has SLSA provenance for `release.yml` at `ece98cb2`; this proves that historical publish, not the mutable current trusted-publisher configuration |

### 2.2 Artifact reproduction

The current-source tarball already contains the five critical members:

- `cli/commands/acp/serve.ts`
- `cli/commands/worker/materialize.ts`
- `cli/commands/worker/buzz-tools.ts`
- `cli/commands/worker/secret-set.ts`
- `registry/cards/buzz-delivery-worker/card.json`

A clean install of a locally packed current-source artifact passes `drwn --version` and
safe `--help` invocations for ACP, materialize, Buzz tools, and secret set. A clean install
of published `darwinian@1.1.0` passes `drwn --version` but lacks the four new command
surfaces. Therefore the missing release is an identity/qualification problem, not a
source-tar membership failure.

### 2.3 Non-claims

- Green source tests do not prove the registry artifact contains current source.
- A successful `drwn --version` does not prove any new command exists.
- I107 source/deployment evidence does not let this CLI infer enforcement from version,
  readiness, dates, or Card presence.
- The Services `/api/minds/:slug/deployments` DTO reports deployments and
  `active_deployment_id`; it does not currently report authoritative governance
  capability or `policyHash` state.
- I105's opt-in live harness is not live Buzz qualification; I238 owns that later proof.

## 3. Root-cause decomposition

### 3.1 Release workflow can qualify the wrong bytes

`release.yml` asks npm whether the package version exists. If it does, the workflow sets
`already_published=true`, skips `npm publish`, installs that registry version, and checks
only `drwn --version`. This behavior makes a source/version collision look idempotently
successful even when npm contains older bytes. The online check also lives in the publish
job, which does not execute during `dry_run=true`; a dry run cannot currently establish
version freshness.

Manual dispatch can be selected from an arbitrary ref. The command-bridge workflow already
demonstrates the missing main-ref and unpublished-version checks, but its binary
success/failure probe must be strengthened: registry/network ambiguity cannot count as
"unpublished."

### 3.2 Governance status uses unrelated and obsolete evidence

`worker status` reads the locally active project Card, counts `tools.allow`/`tools.deny`,
labels the section `Governance (deployed)`, and prints an unconditional "not enforced"
statement. The command does not prove that the local Card is the Card reported by the
remote deployment, does not consume a server capability, and omits governance entirely
from JSON. Local read errors are swallowed, so human and machine output can silently
diverge.

### 3.3 Release identity is repeated as policy

`package.json` and `cli/core/version.ts` both encode the current version. Release-readiness
contains two exact `1.1.0` gates, while tests require both the exact runtime version and
the exact first-supported Worker release identity. This conflates three different facts:

1. the current package version (`1.2.0` for this release);
2. the runtime-reported version (must equal the package); and
3. compatibility floors (`1.1.0` first-supported Worker hard cut and `1.2.0` Buzz Card
   minimum), which must remain stable until separately changed.

### 3.4 Public documentation and release evidence are incomplete

README, quick reference, Docusaurus CLI reference/sidebar, release-process documentation,
and the changelog do not jointly cover ACP, materialize, Buzz tools, secret set, truthful
governance status, or installed-artifact qualification. The changelog has no dated 1.0.0
or 1.1.0 sections and cannot currently explain the delta a 1.2.0 consumer receives.

## 4. Options and decision

### Option A — version bump and publish only

Update the two version constants and publish current source.

**Benefit:** shortest edit.
**Rejected because:** stale governance becomes public, commands remain undocumented, dry
run still cannot reject version reuse, and post-publish smoke still proves only the version
string.

### Option B — coherent Worker-only 1.2.0 train (selected)

Correct governance truth, centralize release identity, document the public surface, add
fail-closed freshness and packed-artifact gates, bump to 1.2.0, obtain exact-head review,
run a merged dry qualification, and stop for publication authorization.

**Benefits:** smallest evidence-complete release; keeps one rollback/provenance boundary;
unblocks Services/I238 without importing their authority.
**Cost:** adds focused release tooling, tests, and documentation before the bump can ship.

### Option C — combine Worker release, Services adoption, and I238 proof

**Benefit:** one apparent milestone.
**Rejected because:** package publication, image adoption, staging deployment, secrets, and
live external messages have different owners, gates, failure recovery, and authorization.
Combining them would make evidence uninterpretable and rollback unsafe.

### Adjacent Routine queue

Routine PR #67 and stale PRs #99/#57 remain a separate Worker queue lane. I239 records an
include/defer decision at release freeze but does not make their refresh/closure a G3
dependency. If unrelated work merges into `main` before the release candidate, I239 must
inventory the new delta and explicitly accept or stop; it cannot describe merged bytes as
excluded.

## 5. Contract A — truthful governance status

### 5.1 One model, two renderers

`worker status` must construct one typed result before choosing JSON or human rendering.
The additive `governance` member is always present on a successful status response:

```typescript
interface WorkerGovernanceStatusV1 {
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

I239 emits no `enforced` or `not_enforced` state because the consumed DTO cannot prove
either. Those states and a non-null server `policyHash` require a separate Services DTO
issue and an independently reviewed Worker consumer change.

### 5.2 Exact declaration association

Declaration targeting and enforcement applicability are separate decisions:

1. When `active_deployment_id` resolves to a deployment row, that active deployment Card
   is the declaration target and enforcement is `unknown` because the API reports no
   governance capability.
2. When `active_deployment_id` is null and deployment history is non-empty, the latest
   deployment Card is the declaration target, but enforcement is `not_applicable` because
   no deployment is active.
3. When `active_deployment_id` is null and history is empty, there is no declaration
   target. Declaration is `unavailable` with `LOCAL_TARGET_UNAVAILABLE`, while enforcement
   remains `not_applicable` with `NO_ACTIVE_DEPLOYMENT`.
4. A non-null `active_deployment_id` absent from the returned history is a fail-closed
   inconsistent response: declaration is unavailable rather than falling back to latest;
   enforcement is `unknown` because an active alias was reported but capability was not.

The local active Worker root is associated only when the selected target `card_ref`
exactly matches either:

- the root's locked `requested` ref; or
- the canonical locked `${name}@${version}` ref.

On an exact match, the command reports zero-or-positive counts from the root Card
manifest. If the local project is absent, malformed, has no target deployment, or names a
different Card, declaration state is `unavailable` with the stable reason code. It never
borrows counts from an unrelated active Card and never emits a policy hash.

### 5.3 Human rendering

Matched example:

```text
Governance:
  declaration: local project lock @test/blueprint@1.0.0 (matches active deployment)
  tools.allow: 3
  tools.deny: 1
  deployment enforcement: unknown — Deploy API does not report governance capability
```

No active alias, latest history exists:

```text
Governance:
  declaration: local project lock @test/blueprint@1.0.0 (matches latest deployment; no active deployment)
  tools.allow: 3
  tools.deny: 1
  deployment enforcement: not applicable — no active deployment
```

No active alias, empty history:

```text
Governance:
  declaration: unavailable — no deployment Card is available for an exact local match
  deployment enforcement: not applicable — no active deployment
```

The output never prints selectors, secret values, or a guessed policy hash. A local
project-read failure does not fail the remote status command, but it remains visible in
both renderers instead of disappearing.

## 6. Contract B — release identity and authorization state machine

### 6.1 Registry probe is tri-state and fail-closed

The online probe returns exactly one state:

| State | Evidence | Decision |
|---|---|---|
| `published` | npm returns the exact version | fail: source version is already owned |
| `unpublished` | npm returns a confirmed package-version 404 | continue |
| `indeterminate` | timeout, DNS, TLS, rate limit, malformed response, auth, or any other error | fail: registry freshness is unproven |

The probe logic is isolated behind an injected command/registry runner so unit tests are
network-independent. The workflow validate job invokes the real online probe. The
ordinary test suite never requires npm availability.

### 6.2 Dry-run path

```text
workflow_dispatch from refs/heads/main
  -> input version equals package.json
  -> package version is confirmed unpublished
  -> typecheck + full tests + bridge + release gate
  -> create and qualify one actual local tarball
  -> Dry run complete job succeeds while every publish/release job is skipped
  -> one immutable-per-run Actions artifact uploads that exact .tgz plus a JSON receipt
     recording workflow path, run ID/URL, version, exact GITHUB_SHA, tar filename, byte
     length, SHA-256, npm shasum, and npm integrity
  -> Actions API metadata records the artifact ID and digest over the uploaded bundle
  -> no protected publish environment and no registry mutation
```

`workflow_dispatch` is dry-run only for the CLI release. It rejects another selected ref
and rejects `dry_run=false`; canonical publication remains the annotated-tag path already
documented by the repository. `dry_run_complete` uploads the JSON receipt with Actions
artifact v4 together with the already-qualified `.tgz` and a fixed retention period; its
contents are derived from workflow context and validated outputs, not dispatch strings.
The run ID, URL, SHA, version, artifact ID/digest, tar filename, byte length, SHA-256,
shasum, and integrity are recorded in I239 before publication authorization. That exact
run ID and artifact digest become authorization inputs and are embedded in the annotated
tag message. Publication has explicit `actions: read`, queries that exact run rather than
searching for any matching run, requires the successful `Dry run complete` job and skipped
publication/release jobs, downloads the named artifact, verifies the Actions digest and
receipt schema, and compares version/SHA/tar identities to the tag and checkout. An absent,
expired, renamed, or differently digested artifact fails closed and requires a new dry run
before tagging. A caller-provided SHA, a merely matching run, or an unverified run URL is
not a receipt.

### 6.3 Publication path

After I239 G3, merge, a successful dry run on the current `origin/main` tip,
publication-control readback, and explicit publication authorization naming the exact dry
run and uploaded artifact:

1. immediately before tag creation, re-fetch `origin/main` and require its tip to equal the
   recorded dry-run `GITHUB_SHA`; any movement invalidates the freeze and requires a fresh
   delta inventory and dry run;
2. create annotated tag `v1.2.0` at that exact commit; its annotation records the authorized
   dry-run run ID and Actions artifact ID/digest; push no other release tag;
3. validation requires `git cat-file -t refs/tags/v1.2.0` to equal `tag`;
4. validation peels the tag with `git rev-parse refs/tags/v1.2.0^{}` and requires that
   commit to equal the recorded successful dry-run `GITHUB_SHA`, the checked-out release
   commit, and the freshly fetched current `origin/main` tip; ancestor containment is not
   sufficient;
5. validation queries the exact run ID from the tag annotation, re-reads its jobs and exact
   artifact metadata, downloads the artifact, and rejects a missing, failed, expired,
   stale, differently versioned, differently headed, renamed, or differently digested
   receipt/tarball;
6. npm again confirms `1.2.0` is unpublished through the tri-state probe;
7. the protected `darwinian-npm-publish` environment requires independent approval before
   the minimal OIDC-capable job downloads and re-verifies the authorized artifact;
8. that job publishes the exact relative tarball with
   `npm publish ./<qualified-file>.tgz --access public`; it never republishes from or repacks
   the checkout;
9. post-publication npm shasum and integrity must equal the qualified tarball receipt before
   Ubuntu and macOS registry-artifact qualification runs;
10. only then create/verify the GitHub release.

No path treats an existing npm version or GitHub release as successful qualification of
new source.

### 6.4 Publication control is an external fail-closed precondition

The existing `npm-publish` environment is not protected and is shared by the CLI tag
workflow and the command-bridge main-branch workflow. Applying a CLI-only tag policy to it
would break bridge publication. I239 therefore selects a dedicated
`darwinian-npm-publish` environment and leaves the bridge environment as a separate lane.

Before any `v1.2.0` tag is created or pushed, an explicitly authorized administrator must
configure and read back all of the following:

- GitHub environment `darwinian-npm-publish` has required reviewer `leeminseung`,
  `prevent_self_review=true`, `can_admins_bypass=false`, and a custom deployment tag policy
  admitting exactly `v1.2.0`;
- the CLI publish job references `darwinian-npm-publish`; no other CLI-release job receives
  `id-token: write`;
- the `darwinian` npm trusted publisher names owner `remyjkim`, repository
  `darwinian-worker`, workflow `release.yml`, environment `darwinian-npm-publish`, and the
  `npm publish` action only;
- `darwinian` publishing access requires 2FA and disallows traditional tokens; and
- GitHub and authenticated npm settings receipts are timestamped and attached to I239.

The `remyjkim` release operator creates the tag or dispatches recovery; required reviewer
`leeminseung` supplies the independent environment approval. Self-review prevention means
the required reviewer cannot initiate and then approve the same protected job.

The historical `1.1.0` provenance attestation is supporting evidence only. npm trusted
publisher settings are mutable and must be read from authenticated package settings for
this release. Missing access, an unverifiable field, or any mismatch stops before tagging.
G1 acceptance defines this target state; it does not itself authorize or perform the
external configuration mutation.

## 7. Contract C — packed and published artifact qualification

### 7.1 Required tar members

The reusable artifact verifier fails unless all five files in §2.2 are present. It also
retains existing exclusions for `.env`, `.ai/`, tests, local config, and secret-bearing
state.

### 7.2 Clean install smokes

Validation must create an actual tarball, install that tarball into an empty temporary
prefix/cache, and run:

```text
drwn --version
drwn acp serve --help
drwn worker materialize --help
drwn worker buzz-tools --help
drwn worker secret set --help
```

These commands must execute the installed bin, not source imports or the repository-local
CLI. Help/version smokes must not read secrets, contact Buzz, authenticate, or mutate a
project.

The same commands run against `darwinian@1.2.0` from npm on Ubuntu and macOS after
publication. The registry shasum/integrity must first equal the exact dry-run tarball
receipt; a successful install is not a substitute for byte identity. Post-publication
verification records:

- npm version, `gitHead`, shasum, and integrity;
- annotated tag and peeled commit;
- GitHub release URL and target;
- installed `drwn --version` and all safe help receipts;
- exact workflow run and candidate SHA.

### 7.3 Failure after publication

npm publication is immutable for this workflow. If publish succeeds but a later smoke or
GitHub-release step fails, the ordinary workflow remains fail-closed because freshness is
no longer true. Re-running I239 as if the version were unpublished is forbidden.

Recovery uses a separately authorized `.github/workflows/release-recovery.yml`
`workflow_dispatch` selected at ref `v1.2.0`. It accepts the failed canonical run ID and
authorization receipt, then derives rather than trusts version, tag, and commit from the
tagged source and canonical run. The workflow has no `id-token: write`, npm publish token,
publish command, tag mutation, dist-tag mutation, or unpublish action. It enters the same
independently reviewed `darwinian-npm-publish` environment, so recovery also pauses for
approval.

Before any recovery action it requires all of these identities to agree:

- package/runtime version `1.2.0` and annotated tag `v1.2.0`;
- peeled tag, recovery checkout, canonical publish run, and recorded dry-run commit;
- npm `gitHead` and the candidate commit; and
- npm shasum/integrity and the exact uploaded dry-run tarball receipt from the canonical
  run.

Only after exact comparison may recovery run the safe Ubuntu/macOS installed-artifact
smokes or create/verify the missing GitHub Release metadata at the existing tag. It cannot
publish. Any mismatch stops recovery, records containment evidence, and opens a separately
authorized deprecation plus patch roll-forward decision; it never overwrites, silently
reuses, retags, or blindly unpublishes `1.2.0`.

## 8. Contract D — one current version, separate compatibility floors

`package.json.version` is the current-release source of truth. Runtime `DRWN_VERSION`
loads that adjacent packaged value and fails loudly if it is missing or invalid; it is not
a second manually bumped constant.

Release-readiness enforces:

- runtime/package parity;
- candidate version `1.2.0` for this release;
- current version at or above the frozen first-supported Worker floor `1.1.0`;
- current version at or above all emitted lock floors;
- Buzz delivery Card `harness.minVersion` remains exactly `1.2.0`.

The two exact `1.1.0` release assertions become parity-plus-floor assertions. Historical
fixtures remain unchanged unless they represent current release identity. `bun.lock` is
changed only if the package manager proves the root metadata actually changes; it is not
edited mechanically.

## 9. Contract E — public documentation and release notes

I239 updates these public surfaces as one contract:

- README command overview and safe operational boundary;
- `docs/cli-quickref.md`;
- Docusaurus ACP CLI reference;
- Docusaurus Worker CLI reference covering status, materialize, Buzz tools, and secret set;
- the manually enumerated Docusaurus sidebar;
- `docs/release-process.md`, including main-only dry run, fail-closed freshness, exact
  artifact smokes, publication authorization, provenance, dedicated environment readback,
  retirement of the `darwinian` maintainer-token fallback, and recovery;
- `docs/maintainers/publishing.md`, removing local token publication as a supported
  `darwinian` 1.2.0 path while keeping any independently gated bridge procedure explicit;
- `CHANGELOG.md` with a dated 1.2.0 section and evidence-backed 1.0.0/1.1.0 history rather
  than leaving the first two stable releases invisible.

Documentation must distinguish declaration from enforcement, 202 cancellation acceptance
from terminal cancellation, source availability from live qualification, and Worker
publication from Services adoption. It must not include credentials, candidate IDs, real
Buzz content, or claims that I238 has not proved.

## 10. Security and failure model

| Threat/failure | Required behavior |
|---|---|
| Old npm bytes share the source version | fail before protected environment; never smoke them as candidate bytes |
| Publish job would repack or select a merely matching dry run | fail before protected environment; publish only the exact authorized uploaded `.tgz` |
| Registry unavailable | `indeterminate`; fail closed |
| Workflow selected from feature branch | reject before tests/publication |
| Tag version or target mismatch | reject before protected environment |
| Lightweight tag or stale/mismatched dry-run receipt | reject before protected environment |
| Local Card differs from deployed Card | declaration unavailable; no borrowed counts |
| Server exposes no governance capability | enforcement unknown, never inferred |
| No active deployment | enforcement not applicable |
| Required file/command missing from tar | fail candidate qualification |
| Help smoke reaches auth, network, secret, or filesystem mutation | fail; help contract is unsafe |
| npm published, later job failed | recovery/roll-forward; never overwrite or reuse |
| GitHub environment or npm publisher setting missing/mismatched | stop before tag creation; configuration claims are not inferred from prior provenance |
| Long-lived token can publish `darwinian` | stop; 1.2.0 uses the bound OIDC workflow only |
| Secret or selector appears in output/evidence | fail and contain; do not merely redact after capture |
| Main changes after freeze | require current-main-tip equality; re-inventory delta and re-run exact-head dry-run evidence |

The target OIDC publisher is scoped to this repository, `release.yml`, the dedicated
`darwinian-npm-publish` environment, and `npm publish`. Traditional token publication is
disabled for `darwinian`. Release evidence contains hashes, identifiers, settings names,
and counts only—not credential values, selectors, prompts, replies, or user data.

## 11. G1 test intent

G2 must expand these claims into explicit RED → GREEN increments and exact commands.

| Contract | Required proof |
|---|---|
| Governance model parity | the same model produces human and JSON output for matched, zero-rule, missing-project, malformed-project, ref-mismatch, active-without-capability, no-active-with-history, no-active-empty-history, and inconsistent-active-ID cases |
| No false association | unrelated local active Card never supplies counts for the remote deployment |
| No secret/selectors | output contains counts/reasons only |
| Freshness tri-state | injected probe tests published, confirmed 404, timeout/DNS/TLS/rate-limit/malformed outcomes; only 404 passes |
| Dry-run freshness | workflow validation runs the real online check with `dry_run=true` |
| Ref/tag binding | manual non-main ref, mismatched input, lightweight tag, peeled-commit mismatch, dry-run SHA not equal to current `origin/main` tip, missing exact run/job, and stale/different-SHA receipt all fail |
| Exact published bytes | dry run uploads the qualified `.tgz` and receipt; tag binds the exact run/artifact ID/digest; publication downloads and re-verifies that artifact, publishes the relative tar path, and registry shasum/integrity must match |
| Publication controls | fixture/readback assertions require the dedicated environment name, independent reviewer, self-review prevention, disabled admin bypass, exact tag policy, exact npm trusted-publisher fields, and token prohibition |
| Required members | removal of any one of the five paths fails artifact verification |
| Installed artifact | actual packed tar installs in a clean prefix and all five safe smokes pass |
| Recovery non-publication | recovery fixtures prove exact npm/tag/commit/tar identity, verification/metadata-only behavior, and structural absence of OIDC/token/publish/tag-mutation paths |
| Source-vs-registry regression | a fixture representing old 1.1.0 bytes can pass version but fails required-command qualification |
| Version identity | package/runtime parity; 1.2.0 candidate; 1.1.0 compatibility floor; emitted floors and Buzz Card floor preserved |
| Documentation | Docusaurus build/link checks and source assertions cover every new command, governance semantics, release process, and changelog section |
| Full regression | typecheck, complete Worker suite, bridge verification, release verification, pack verification, and hosted matrix pass on exact head |

## 12. Acceptance criteria

### 12.1 G3 code-acceptance gate

I239 G3 may be requested only when the reviewable source can prove, without merge,
external configuration, tag creation, or registry mutation, that:

1. the implementation matches the exact Worker-only boundary and no Services/I238
   mutation is present;
2. governance human/JSON output shares one typed model, exact Card association, and only
   `unknown`/`not_applicable` enforcement states from current evidence;
3. the package candidate is exactly 1.2.0, runtime identity is derived from the package,
   and compatibility floors remain deliberate;
4. dry-run validation is main-only and confirms version freshness with fail-closed
   tri-state behavior;
5. workflow structure binds annotated-tag publication to the exact recorded dry-run run,
   uploaded qualified tarball, current-main-tip equality, and independently reviewed
   dedicated environment;
6. the actual local candidate tarball contains required files and passes all safe installed
   smokes;
7. README, quick reference, Docusaurus, sidebar, release process, and changelog are
   coherent and build successfully;
8. exact-head local and hosted evidence is green;
9. workflow fixtures prove exact-tar download/publish, main-tip movement rejection,
   registry digest equality, and non-publishing recovery;
10. manual token publication is retired, external publication controls have an explicit
    fail-closed readback contract, and post-publication recovery cannot publish;
11. the lane stops for explicit publication authorization and records no downstream
    operational claim.

G3 does not require a merged-main dry run, configured external protection, an npm registry
artifact, or a GitHub Release: all four can exist only after G3 pass/merge and their own
authorities.

### 12.2 Post-merge release-completion gate

Knowledge capture and the immutable I239 handoff require all of the following after G3:

1. the G3-approved commit is merged and is still the exact current `origin/main` tip;
2. the main-only dry run succeeds and uploads one qualified `.tgz` plus receipt, with exact
   run/artifact identities recorded before publication authorization;
3. separately authorized GitHub/npm controls are configured and read back fail-closed;
4. immediately before tag and publication, dry-run SHA, peeled tag, checkout, and current
   `origin/main` tip are equal;
5. the minimal OIDC job publishes the exact authorized tarball and npm shasum/integrity
   match its receipt;
6. Ubuntu/macOS registry smokes and GitHub Release verification pass; and
7. the immutable release receipt is handed to the Services R2 and I238 owners without
   performing either downstream mutation.

## 13. Gate-ordered sequence and handoff

1. Consume the recorded I232 reconciliation that names I239/I238 and the separate Services
   adoption seam; reopen the boundary only if that parent decision changes.
2. I239 G1 reviews this document; no G2 or implementation is implied by submission.
3. After G1 pass and Owner acknowledgment, author
   `.ai/tasks/cl0239_darwinian_worker_cli_release_task_plan.md`.
4. After G2 pass, implement through TDD in a clean Worker worktree.
5. Obtain exact-head G3 using §12.1 source evidence, then merge to `main`.
6. Confirm the merged commit is the current `origin/main` tip, dispatch main-only
   `dry_run=true`, and record the exact run plus uploaded tarball/artifact receipt.
7. Stop for explicit publication and external-configuration authorization naming that
   exact run/artifact.
8. Configure/read back the dedicated GitHub environment, npm trusted publisher, and token
   prohibition; stop on any mismatch.
9. Re-fetch `origin/main`; if it moved, invalidate the freeze and return to step 6. Otherwise
   create/push the annotated tag carrying the exact run/artifact identity, obtain independent
   environment approval, publish the exact qualified `.tgz`, and verify npm byte identity,
   installed artifacts, and GitHub Release. Use the non-publishing recovery workflow only
   after a separately authorized partial-publication failure.
10. Complete §12.2, knowledge-capture the immutable receipt, and hand it to the Services
    runtime-adoption owner and I238; perform no downstream mutation from I239.

Required I239 → I238 handoff:

- version, tag, release commit, npm `gitHead`, shasum, and integrity;
- qualified dry-run tar filename/length/SHA-256/shasum/integrity, exact Actions run and
  artifact ID/digest, and proof that tag/publication used those bytes at the unchanged main
  tip;
- installed ACP/materialize/Buzz/secret/governance qualification;
- exact-head CI and merged dry-run evidence;
- Buzz Card floor and canonical I107 selector-declaration evidence without selector
  leakage in public status output;
- unresolved operational prerequisites and stop conditions.

## 14. Risks and controls

| Risk | Likelihood | Control |
|---|---|---|
| Exact local/deployment Card refs use two valid forms | Medium | compare only locked `requested` and canonical `name@version`; tests cover both and mismatch |
| Registry errors resemble 404 | Medium | parse confirmed not-found separately; every ambiguous error is `indeterminate` |
| Runtime package lookup breaks global installs | Low | installed-tar smoke exercises the actual layout before merge/publication |
| Full artifact smoke lengthens validation | Low | one reusable verifier; correctness outweighs a small release-only cost |
| Partial publish cannot be rerun idempotently | Medium | explicit recovery/roll-forward contract; never qualify unknown old bytes |
| Shared environment policy couples CLI and bridge release refs | High | dedicated `darwinian-npm-publish` environment; bridge stays in its independent lane |
| Mutable GitHub/npm configuration drifts after review | High | authenticated readback after authorization and before tag creation; stop on every mismatch |
| Dry-run tarball is re-created or an arbitrary matching run is selected | High | upload the qualified `.tgz`; bind exact run/artifact identity in authorization and tag; publish that relative tar path only |
| Recovery entrypoint accidentally republishes | High | separate workflow with no OIDC/token/publish capability plus structural tests |
| Routine or unrelated work enters main after dry-run freeze | Medium | dry-run/tag/checkout/current-main-tip equality; any movement forces delta inventory and a fresh dry run |
| Documentation claims live success | Medium | source/release/adoption/staging vocabulary is normative and separately gated |

No scope-changing question remains open for G1. G2 may select internal helper names and
test-fixture organization, but it may not weaken exact Card association, tri-state
freshness, installed-artifact qualification, publication authorization, provenance, or the
Services/I238 boundary without a reviewed G1 amendment.
