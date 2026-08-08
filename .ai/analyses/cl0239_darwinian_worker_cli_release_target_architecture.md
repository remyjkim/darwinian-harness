# ABOUTME: G1 target architecture for I239, the independently gated Darwinian Worker CLI 1.2.0 release and immutable ACP/Buzz handoff.
# ABOUTME: Defines truthful governance, fail-closed release identity, a credential-custody hard cut, sanitized auth receipts, and strict I236/Services/I238 boundaries.

# [I239] Darwinian Worker CLI 1.2.0 release and operational ACP/Buzz handoff — target architecture

**Issue:** [I239] Darwinian Worker CLI 1.2.0 release and operational ACP/Buzz handoff
**Date:** 2026-08-07
**Status:** G1 proposal; no G2 plan, implementation, publication, Services mutation, staging action, candidate, secret, or live test is authorized by this document
**Owner:** Remy K
**Reviewer:** Remy K (user-authorized G1 reviewer control)
**Publication environment reviewer:** governed by the checked-in approval policy at `scripts/release/release-policy.json`; currently the `remyjkim` release operator, who approves their own protected deployment
**Repository:** `remyjkim/darwinian-worker`
**Parent:** I232 cross-repository architecture program
**Downstream:** I236 canonical-identity qualification and separately numbered Services runtime adoption, then I238 controlled staging qualification
**References:** [I232, I236, I238, I105, I106, I107, I220, I221, `.github/workflows/release.yml`, `.github/workflows/release-command-bridge.yml`, `cli/commands/worker/status.ts`, `cli/core/auth/credentials.ts`, `cli/core/auth/resolve-token.ts`, `cli/core/secret-store.ts`, `scripts/verify-release-readiness.ts`, `test/package-readiness.test.ts`, `test/commands-worker-status-governance.test.ts`, `docs/release-process.md`, `CHANGELOG.md`, `https://www.npmjs.com/package/darwinian`, `https://github.com/remyjkim/darwinian-worker/releases/tag/v1.1.0`, `https://github.com/darwinian-org/beginning-tools/pull/53`]

---

## 1. Executive decision

I239 produces one provenance-verifiable `darwinian@1.2.0` release from the reviewed Worker
source already carrying I105/I220/I221. Before that release can be qualified, the Worker
must correct its stale governance-status claim, document every new public command, replace
the idempotent-but-unsafe version-reuse behavior with fail-closed version freshness, and
prove the actual packed artifact exposes the required surfaces. It also deliberately
hard-cuts the ambiguous pre-DAH credential payload and globally shared encrypted-store
identity. Worker 1.2.0 accepts only a path-scoped v3 DAH credential inside a v2 envelope,
performs no automatic credential migration, and emits sanitized qualification receipts.

The release is deliberately separated from its consumers:

```text
I239 Worker source + release qualification
  -> explicit publication authorization
  -> immutable npm/tag/commit/package + auth-surface handoff
  -> independently gated I236 post-cut Worker canary
  -> separately gated Services image/runtime adoption
  -> I238 immutable governed staging qualification
```

I239 does not update Services, deploy staging, create a candidate, install secrets, contact
Buzz, or establish public multi-user/production readiness. It stops at the publication
gate until explicit authorization, and after publication it emits evidence rather than
performing downstream mutations. The Worker remains configurable: I239 adds no canonical
staging host, issuer, resource, client, or Services deployment constant on behalf of I236.

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
| Stored credential payload | current login writes `CliDahCredentialFile.version=2`; the reader also accepts the pre-DAH `DrwnCredentials {api_url, access_token, user_email, saved_at}` shape and `resolveToken` can still send it to Analyzer |
| Encrypted credential envelope | `v=1`, fixed `keyRef=drwn-credentials`; macOS Keychain and Linux Secret Service default to the same service/account for every credentials path; the test backend also uses one fixed key filename |
| Cross-scope deletion failure | clearing one isolated credentials path deletes the shared macOS/Linux/test key, so another credentials file remains present but becomes unreadable; Windows is already path-adjacent but does not validate a derived envelope key identity |
| I236 current G2 candidate | PR #53 at `bc51f69613ebb9e0bfc2d56240f21481c3629acc`: canonical-only hard cut, fresh post-cut `drwn-cli` login/refresh/revoke, I239 consumed only as an immutable configurable package receipt, no staging constants imported into Worker |
| I238 accepted dependency | G2-passed I238 accepts no Analyzer compatibility or migration and requires a released, sanitized Worker login/forced-refresh/confirmed-revoke receipt with namespace, credential epoch, runtime provenance, timing, and redacted outcome bindings before live qualification |

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
- An I239 source test or unpublished tarball is not I236/I238 operational proof. Their
  live gates require the exact released artifact and their own lease and mutation authority.
- Existing v1/v2 stored credentials are not a migration input. A user must complete a
  fresh DAH login after installing 1.2.0; the old global key is not automatically deleted
  because its historical ownership cannot be assigned safely to one credential scope.
- `DRWN_TOKEN` is not a legacy stored-credential path. It remains a validated,
  non-persistent headless input, although I238 independently forbids it for qualification.

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

### 3.5 Credential identity collapses independent homes and cannot prove a post-cut epoch

The credential file path is configurable through the Worker home, but macOS and Linux
key custody is not: every path resolves to the same `drwn` / `drwn-credentials` keychain
entry. The test backend has the same collision. Deleting one isolated credential store can
therefore invalidate another store, and the v1 envelope does not validate its `keyRef`.

The reader also accepts the pre-DAH Analyzer credential shape and returns malformed or
unsupported formats as if no credential existed. Automatic near-expiry refresh has no
public forced-refresh command, logout deletes local custody even when remote revocation
fails, and none of login/refresh/logout emits a structured receipt. I236 and I238 therefore
cannot prove that one isolated qualification namespace used a fresh post-cut DAH
credential, advanced one credential generation, confirmed remote revocation, and deleted
only its own local custody.

## 4. Options and decision

### Option A — version bump and publish only

Update the two version constants and publish current source.

**Benefit:** shortest edit.
**Rejected because:** stale governance becomes public, commands remain undocumented, dry
run still cannot reject version reuse, and post-publish smoke still proves only the version
string.

### Option B — coherent Worker-only 1.2.0 train with credential migration

Add the release/governance work and introduce scoped credential custody while reading or
migrating v1/v2 and pre-DAH formats.

**Benefit:** fewer immediate re-logins for existing users.
**Rejected because:** the pre-DAH payload has different issuer/audience semantics, the
global key cannot be attributed to one path safely, migration expands the highest-risk
surface, and I236 explicitly requires a fresh post-cut credential. Compatibility would
make the qualification evidence weaker while preserving the ambiguity this issue removes.

### Option C — coherent Worker-only 1.2.0 hard cut (selected)

Correct governance truth, centralize release identity, document the public surface, add
fail-closed freshness and packed-artifact gates, replace stored credentials with one
path-scoped v3/v2 contract, add sanitized auth-operation receipts, bump to 1.2.0, obtain
exact-head review, run a merged dry qualification, and stop for publication authorization.

**Benefits:** smallest evidence-complete release; keeps one rollback/provenance boundary;
unblocks I236/Services/I238 without importing their authority; gives the canonical hard
cut a fresh, auditable credential epoch rather than preserving pre-cut ambiguity.
**Cost:** every stored-credential user must log in again after installing 1.2.0, and the
release adds focused credential, release, test, and documentation work before publication.

### Option D — combine Worker release, I236/Services adoption, and I238 proof

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
7. the protected `darwinian-npm-publish` environment requires a policy-conformant approval before
   the minimal OIDC-capable job re-reads the current default-branch tip through GitHub,
   requires it still to equal the dry-run/tag commit, then downloads and re-verifies the
   authorized artifact;
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

- GitHub environment `darwinian-npm-publish` matches the checked-in approval policy at
  `scripts/release/release-policy.json` for required reviewers and self-review, always has
  `can_admins_bypass=false`, and carries a custom deployment tag policy admitting exactly
  `v1.2.0`;
- the CLI publish job references `darwinian-npm-publish`; no other CLI-release job receives
  `id-token: write`;
- the `darwinian` npm trusted publisher names owner `remyjkim`, repository
  `darwinian-worker`, workflow `release.yml`, environment `darwinian-npm-publish`, and the
  `npm publish` action only;
- `darwinian` publishing access requires 2FA and disallows traditional tokens; and
- GitHub and authenticated npm settings receipts are timestamped and attached to I239.

### Approval policy is declared, not hard-coded

The original design named a second GitHub account as the sole required reviewer and
prevented self-review, so publication required two people. For a CLI maintained by one
operator that is not a control; it is a single point of failure, because an unavailable
reviewer blocks an otherwise fully qualified release with no in-band remedy.

The approval identity is therefore declared in a single checked-in file,
`scripts/release/release-policy.json`, and `assertGitHubReceipt` validates the readback
receipt against that file instead of against constants. Changing who may approve becomes a
reviewable pull request whose diff states the intent, rather than a silent divergence
between GitHub settings and the repository.

The policy governs only approver identity and self-review. The validator keeps a fixed
floor that no policy value can relax:

- `requiredReviewers` must be a non-empty list of named accounts, so publication always
  requires a deliberate approval click by a named identity;
- `canAdminsBypass` must be `false`, so the environment gate can never be skipped;
- the environment must remain `darwinian-npm-publish`, preserving the npm trusted-publisher
  OIDC binding; and
- the exact single `v1.2.0` tag deployment policy is unchanged.

Under the current policy the `remyjkim` release operator creates the tag and supplies the
environment approval for the same protected job. The receipt therefore truthfully proves a
single-operator, self-approved control, and no longer asserts an independent second-person
control that is not in force.

The historical `1.1.0` provenance attestation is supporting evidence only. npm trusted
publisher settings are mutable and must be read from authenticated package settings for
this release. Missing access, an unverifiable field, or any mismatch stops before tagging.
G1 acceptance defines this target state; it does not itself authorize or perform the
external configuration mutation.

## 7. Contract C — packed and published artifact qualification

### 7.1 Required tar members

The reusable artifact verifier fails unless all five source files in §2.2 plus the
generated `cli/generated/build-identity.json` are present. The generated member must match
the candidate package version and source commit; a placeholder/development identity fails
release qualification. The verifier also retains existing exclusions for `.env`, `.ai/`,
tests, local config, and secret-bearing state.

### 7.2 Clean install smokes

Validation must create an actual tarball, install that tarball into an empty temporary
prefix/cache, and run:

```text
drwn --version
drwn acp serve --help
drwn worker materialize --help
drwn worker buzz-tools --help
drwn worker secret set --help
drwn login --help
drwn refresh --help
drwn logout --help
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
- installed build-identity and auth-receipt schema/version bindings;
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
policy-gated `darwinian-npm-publish` environment, so recovery also pauses for
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
- public authentication reference covering the v3/v2 hard cut, re-login requirement,
  forced refresh, ordinary versus qualification logout, sanitized JSON receipts, and
  `DRWN_TOKEN`'s non-persistent boundary;
- the manually enumerated Docusaurus sidebar;
- `docs/release-process.md`, including main-only dry run, fail-closed freshness, exact
  artifact/auth smokes, publication authorization, build identity, provenance, dedicated
  environment readback,
  retirement of the `darwinian` maintainer-token fallback, and recovery;
- `docs/maintainers/publishing.md`, removing local token publication as a supported
  `darwinian` 1.2.0 path while keeping any independently gated bridge procedure explicit;
- `CHANGELOG.md` with a dated 1.2.0 section and evidence-backed 1.0.0/1.1.0 history rather
  than leaving the first two stable releases invisible.

Documentation must distinguish declaration from enforcement, unsupported credential
formats from absence, best-effort local logout from qualification logout, 202 cancellation
acceptance from terminal cancellation, source availability from live qualification, and
Worker publication from Services adoption. It must not include credentials, candidate
IDs, real Buzz content, or claims that I238 has not proved.

## 10. Contract F — credential-custody hard cut and qualification receipts

### 10.1 One deterministic credential scope

Every stored-credential operation derives one immutable scope from the credential-file
path before selecting a key backend or reading, writing, refreshing, revoking, or deleting
anything. The normalization contract is:

1. resolve the configured credential path to an absolute path;
2. realpath the nearest existing ancestor and append any unresolved path components;
3. normalize separators to `/`, normalize Unicode to NFC, and on Windows normalize the
   drive letter and path case consistently with case-insensitive path identity; and
4. compute `SHA-256("darwinian.worker.credential-scope.v1\0" + normalizedPath)`.

The normalized path never appears in command output or retained evidence. Its digest is
used only as an internal input. The internal key identity is
`drwn-credentials-v2:<scopeDigest>`. Receipt namespace identity is separately derived as
`SHA-256("darwinian.worker.qualification-namespace.v1\0" + scopeDigest)`, so
`qualificationNamespaceDigest` is stable for one scope across login/refresh/revoke but is
not the literal keychain account or envelope key reference.

The derived internal key identity selects:

- the macOS Keychain account under the existing `drwn` service;
- the Linux Secret Service account and non-sensitive label;
- the Windows DPAPI sibling key identity and envelope binding; and
- a scope-specific test-backend key filename.

The v2 envelope records the derived key identity and scope digest. Read/decrypt requires
both to equal the values re-derived from the requested credential path before a key lookup.
Different scopes must not read, overwrite, or delete one another's credential file or key.
`clear(scope A)` removes only scope A's file and derived key, including when scope B is
unreadable or absent.

### 10.2 v3 credential payload and v2 envelope only

Worker 1.2.0 writes and accepts exactly one stored payload:

```typescript
interface CliDahCredentialFileV3 {
  version: 3;
  credentialId: string;       // cryptographically random UUID at successful login
  generation: number;         // 1 at login; incremented exactly once per successful refresh
  issuer: string;
  clientId: "drwn-cli";
  resource: string;
  accessToken: string;
  refreshToken: string;
  issuedAt: string;           // validated access-token iat, represented as RFC 3339
  expiresAt: string;
  savedAt: string;
  userEmail: string;          // encrypted local UX data; forbidden in qualification receipts
}

interface CredentialEnvelopeV2 {
  v: 2;
  algo: "aes-256-gcm";
  scopeDigest: string;
  keyRef: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}
```

The pre-DAH `DrwnCredentials` shape, v2 DAH payload, v1 envelope, snake-case compatibility
aliases, legacy device-flow overload, and Analyzer-client legacy auth branch are deleted
from the product path. Unsupported, malformed, or scope-mismatched stored formats fail
with a stable `CREDENTIAL_SCHEMA_UNSUPPORTED`, `CREDENTIAL_SCOPE_MISMATCH`, or
`CREDENTIAL_INTEGRITY` diagnostic as applicable; they do not collapse to unauthenticated
`null` and are never decrypted through the old global key.

There is no automatic migration, global-key import, or compatibility read. Successful
`drwn login` writes a fresh v3/v2 store for its derived scope and may replace the old file
at that exact path, but it does not read the old payload first. The historical global
keychain entry is left untouched because I239 cannot prove which credential path owns it;
removing that orphan requires a separately explicit, user-directed cleanup design. Old
Analyzer users re-authenticate through DAH and configure Analyzer transport explicitly.
The validated, non-persistent `DRWN_TOKEN` path remains available and is never written to
the store or represented as a stored-credential receipt.

### 10.3 Login, forced refresh, and qualification logout

The existing `drwn login --json` becomes a strict machine-output surface: device-flow
instructions remain on stderr, while stdout contains one receipt and no email. Login
creates a new `credentialId`, sets `generation=1`, and records signed-token `issuedAt`,
expiry, and the action timestamp.

I239 adds `drwn refresh --json`. It always performs a DAH refresh even when the access
token is not near expiry, keeps the same credential ID, increments generation only after
a successful remote exchange and atomic scoped write, and emits one receipt. Automatic
near-expiry refresh remains product behavior but cannot stand in for this explicit
qualification action.

Ordinary `drwn logout` retains local-security ergonomics: it attempts remote revoke and
then deletes only the derived local scope even if the network is unavailable. That mode
must report remote failure accurately and is not qualification evidence. Qualification
uses `drwn logout --json --require-remote-revoke`:

1. require one valid stored v3 credential; absence is a nonzero `CREDENTIAL_ABSENT`, not
   a successful cleanup claim;
2. capture sanitized credential/scope metadata before any deletion;
3. require confirmed successful DAH refresh-token revocation;
4. only after that confirmation, delete the bound credential file and derived key; and
5. emit ordered remote-revoke and local-delete action results proving the deletion followed
   confirmation and affected only the bound namespace.

Remote/network failure exits nonzero and preserves the scoped credential so the controlled
run can retry or invoke separately authorized ordinary local cleanup. A failed remote
response body is never printed or retained. No command claims that access tokens already
issued by the server are invalidated beyond the server's actual revoke contract.

### 10.4 Sanitized auth-operation receipt

Machine output conforms to one versioned schema. The logical receipt is:

```typescript
interface AuthOperationReceiptV1 {
  schema: "darwinian.worker.auth-operation";
  schemaVersion: 1;
  worker: { version: "1.2.0"; sourceCommit: string };
  qualificationNamespaceDigest: string;
  credential: {
    credentialId: string;
    generation: number;
    issuer: string;
    clientId: "drwn-cli";
    resource: string;
    issuedAt: string;
    expiresAt: string;
  };
  action: "login" | "refresh" | "logout";
  mode: "ordinary" | "require_remote_revoke";
  actionAt: string;
  outcome: "succeeded" | "failed";
  qualificationEligible: boolean;
  remote: {
    action: "not_applicable" | "token_exchange" | "refresh" | "revoke";
    result: "not_applicable" | "confirmed" | "rejected" | "indeterminate";
    httpClass: "not_applicable" | "2xx" | "3xx" | "4xx" | "5xx" | "network_error";
  };
  local: {
    action: "write" | "delete";
    result: "confirmed" | "not_performed" | "failed";
    afterConfirmedRemoteRevoke: boolean;
  };
  reason: string | null;
}
```

The schema requires canonical RFC 3339 timestamps, a stable reason-code vocabulary, and
strict enum validation. Failed actions may emit a sanitized receipt only when credential
identity can be established safely; otherwise stderr carries the stable reason and stdout
stays empty. Login uses `token_exchange`, refresh uses `refresh`, and strict logout uses
`revoke`; the ordered logout outcome includes the qualification-only local deletion.
Login/refresh set `mode=ordinary` but remain eligible for their respective operation proof.
A logout receipt is qualification-eligible only when `mode=require_remote_revoke`, remote
revoke is confirmed, and scoped local deletion succeeds. This prevents a best-effort
ordinary logout receipt from being mistaken for controlled cleanup. Every operation also
requires `outcome=succeeded` and a qualifying packaged build identity before
`qualificationEligible=true`; source/development execution and every failure set it false.

Receipts never contain subject, email, operator identity, access/refresh token, device or
authorization code, response body, raw credential path, internal scope digest, key
reference, keychain label, secret value, URL query, or browser instruction. Human output
may identify the signed-in email as today, but qualification capture uses `--json` and its
schema forbids that field. Device-flow browser instructions remain transient interactive
stderr, are never part of the receipt, and must not be retained by an I236/I238 evidence
collector; retained logs contain only the final sanitized stdout receipt and stable status.

### 10.5 Installed Worker provenance binding

An installed package cannot truthfully embed its own final tarball hash. Instead, the
qualified tarball contains a generated build-identity member binding package version
`1.2.0` to the exact source commit before packing. Runtime auth receipts read that packaged
identity rather than an environment variable or dispatch input. The immutable release
receipt then binds the same `(version, sourceCommit)` tuple to the exact tar filename,
length, SHA-256, npm shasum/integrity, Actions run/artifact digest, annotated tag, npm
`gitHead`, and registry integrity.

The packaged member validates exactly as
`{schema:"darwinian.worker.build-identity", schemaVersion:1, version:"1.2.0",
sourceCommit:"<40 lowercase hex>"}` with no additional fields. The pack step derives the
commit from the checked-out Git object after the ref/main-tip gates; callers cannot supply
it as an input. Qualification compares it to the checkout, dry-run receipt, peeled tag,
and npm `gitHead` wherever the registry reports that field.

Local source execution may use an explicit non-qualifying development identity, but
release verification rejects it. The reusable artifact verifier requires and validates
the generated build-identity member, and clean-install auth help/schema tests prove the
installed bin can emit receipts bearing the packaged tuple. I236/I238 establish installed
Worker provenance by joining an auth receipt's `(version, sourceCommit)` to the immutable
I239 release receipt; neither side substitutes version text alone for byte identity.

## 11. Security and failure model

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
| Pre-DAH, v2 payload, or v1 envelope encountered | fail with stable re-login diagnostic; never migrate or fall back to the global key |
| Two Worker homes select one key | derived scope identities must differ; cross-scope read/write/delete tests fail the candidate on any collision |
| Envelope key identity differs from requested path | fail before key lookup/decrypt with scope mismatch; never try another scope |
| Scope path uses symlink, relative, Unicode, or Windows case aliases | canonical normalization yields one stable identity for the same target and distinct identities for distinct targets |
| Refresh exchange succeeds but atomic local write fails | exit nonzero, do not increment the retained local generation, and do not claim a successful receipt |
| Qualification revoke is absent, rejected, or indeterminate | exit nonzero and preserve scoped local custody; local deletion is not claimed |
| Ordinary logout remote revoke fails | disclose best-effort remote failure, delete only the selected local scope, and mark output non-qualifying |
| Receipt leaks identity or secret-bearing material | schema validation fails before evidence retention; stdout never contains the forbidden field |
| Device authorization data enters retained evidence | keep browser/user-action instructions transient on stderr; downstream collectors retain only validated stdout receipt and stable status |
| Runtime receipt uses injected/mutable provenance | reject qualification; receipt identity must come from the packaged build member joined to the immutable release receipt |
| Historical global key remains after the hard cut | leave it untouched and document explicit re-login; do not guess ownership or silently delete it |

The target OIDC publisher is scoped to this repository, `release.yml`, the dedicated
`darwinian-npm-publish` environment, and `npm publish`. Traditional token publication is
disabled for `darwinian`. Release evidence contains hashes, identifiers, settings names,
and counts only—not credential values, selectors, prompts, replies, or user data. Auth
receipts contain only the §10.4 allowlist. Credential paths and backend key identities
remain local and are never copied into workflow, Notion, PR, or downstream evidence.

## 12. G1 test intent

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
| Publication controls | fixture/readback assertions require the dedicated environment name, policy-declared reviewers and self-review setting, a non-empty reviewer list, disabled admin bypass, exact tag policy, exact npm trusted-publisher fields, and token prohibition |
| Required members | removal or mismatch of any one of the five source paths or generated build-identity member fails artifact verification |
| Installed artifact | actual packed tar installs in a clean prefix and all eight safe version/help smokes pass |
| Recovery non-publication | recovery fixtures prove exact npm/tag/commit/tar identity, verification/metadata-only behavior, and structural absence of OIDC/token/publish/tag-mutation paths |
| Source-vs-registry regression | a fixture representing old 1.1.0 bytes can pass version but fails required-command qualification |
| Version identity | package/runtime parity; 1.2.0 candidate; 1.1.0 compatibility floor; emitted floors and Buzz Card floor preserved |
| Stored-format hard cut | pre-DAH payload, v2 DAH payload, v1 envelope, malformed JSON, wrong keyRef, and wrong scope all fail with the exact stable diagnostic and never load the old global key |
| Scope normalization | relative/absolute, existing/non-existing tail, symlink, Unicode, separator, and Windows case fixtures prove same-target stability and distinct-target separation |
| Cross-scope isolation | two credential homes cannot read, overwrite, or delete each other's file/key on macOS, Linux, Windows, or test backend abstractions |
| Credential generation | login creates UUID/generation 1; explicit refresh keeps ID and increments once only after exchange plus atomic persistence; automatic refresh follows the same persistence invariant |
| Refresh failure | 4xx, 5xx, network, malformed response, and local persistence failure exit nonzero, emit no success, and record only schema-allowed classification |
| Strict revoke ordering | absent credential and every non-2xx/network revoke fail without deletion; confirmed revoke deletes only the bound scope and records ordered remote/local results |
| Ordinary logout boundary | best-effort remote failure still performs only scoped local deletion and cannot produce qualification success |
| Receipt conformance | login/refresh/logout success and failure fixtures validate schema/version, credential epoch, namespace stability, timestamps, exact profile, remote class, deletion ordering, and stable reason codes |
| Receipt non-disclosure | token/code/body/email/subject/operator/path/internal scope/keyRef/keychain-label sentinel values are absent from receipt stdout, snapshots, and retained workflow evidence; transient login stderr is explicitly excluded from capture |
| Installed provenance join | packaged build identity equals candidate version/commit; auth receipt reads it; release receipt binds that tuple to exact tar/tag/npm identities; development identity fails qualification |
| Documentation | Docusaurus build/link checks and source assertions cover every new command, governance semantics, credential hard cut/receipts, release process, and changelog section |
| Full regression | typecheck, complete Worker suite, bridge verification, release verification, pack verification, and hosted matrix pass on exact head |

## 13. Acceptance criteria

### 13.1 G3 code-acceptance gate

I239 G3 may be requested only when the reviewable source can prove, without merge,
external configuration, tag creation, or registry mutation, that:

1. the implementation matches the exact Worker-only boundary and no Services/I238
   mutation is present;
2. governance human/JSON output shares one typed model, exact Card association, and only
   `unknown`/`not_applicable` enforcement states from current evidence;
3. stored credentials accept only the reviewed v3 payload/v2 envelope, reject older
   formats without migration, and derive/validate one cross-platform key identity per
   normalized credential-file scope;
4. login, explicit forced refresh, automatic refresh, ordinary logout, and strict
   qualification logout satisfy credential-ID/generation, atomic-persistence,
   confirmed-revoke-before-delete, stable-error, and cross-scope isolation contracts;
5. auth JSON output validates against the sanitized receipt allowlist, binds the packaged
   Worker version/source commit and public namespace digest, and contains none of the
   forbidden identity, secret, path, key, or response material;
6. the package candidate is exactly 1.2.0, runtime identity is derived from the package,
   the generated build member binds the exact source commit, and compatibility floors
   remain deliberate;
7. dry-run validation is main-only and confirms version freshness with fail-closed
   tri-state behavior;
8. workflow structure binds annotated-tag publication to the exact recorded dry-run run,
   uploaded qualified tarball, current-main-tip equality, and independently reviewed
   dedicated environment;
9. the actual local candidate tarball contains required files and passes all safe installed
   smokes;
10. README, quick reference, Docusaurus, sidebar, release process, and changelog are
   coherent and build successfully;
11. exact-head local and hosted evidence is green;
12. workflow fixtures prove exact-tar download/publish, main-tip movement rejection,
   registry digest equality, and non-publishing recovery;
13. manual token publication is retired, external publication controls have an explicit
    fail-closed readback contract, and post-publication recovery cannot publish;
14. the lane stops for explicit publication authorization and records no downstream
    operational claim.

G3 does not require a merged-main dry run, configured external protection, an npm registry
artifact, or a GitHub Release: all four can exist only after G3 pass/merge and their own
authorities.

### 13.2 Post-merge release-completion gate

Knowledge capture and the immutable I239 handoff require all of the following after G3:

1. the G3-approved commit is merged and is still the exact current `origin/main` tip;
2. the main-only dry run succeeds and uploads one qualified `.tgz` plus receipt, with exact
   run/artifact identities recorded before publication authorization;
3. separately authorized GitHub/npm controls are configured and read back fail-closed;
4. immediately before tag and publication, dry-run SHA, peeled tag, checkout, and current
   `origin/main` tip are equal;
5. the minimal OIDC job publishes the exact authorized tarball and npm shasum/integrity
   match its receipt;
6. Ubuntu/macOS registry smokes and GitHub Release verification pass;
7. the immutable release receipt binds the packaged build identity and published bytes,
   and installed, offline schema fixtures confirm the auth-receipt surface without
   performing a login, refresh, or revoke;
8. the immutable release/auth-surface receipt is handed to the I236, Services R2, and I238
   owners without performing any downstream mutation; and
9. the handoff explicitly preserves I236's fresh post-cut credential requirement and
   I238's separate Buzz-environment, lease, candidate, and live-operation stops.

## 14. Gate-ordered sequence and handoff

1. Consume the recorded I232 reconciliation, I236 current G2 contract, and I238 accepted
   dependency response; reopen the boundary only if a reviewed dependency changes.
2. I239 freshly reviews this complete amended document on one exact head; the superseded
   G1 pass and rejected G2 candidate remain history and confer no implementation authority.
3. After the fresh G1 pass and separate Owner acknowledgment into Planning, amend
   `.ai/tasks/cl0239_darwinian_worker_cli_release_task_plan.md` to cover the complete
   hard-cut architecture and submit the entire plan for a fresh G2 review.
4. Only after fresh G2 pass and separate Owner acknowledgment into Building, implement
   through TDD in this clean Worker worktree.
5. Obtain exact-head G3 using §13.1 source evidence, then merge to `main`.
6. Confirm the merged commit is the current `origin/main` tip, dispatch main-only
   `dry_run=true`, and record the exact run plus uploaded tarball/artifact receipt.
7. Stop for explicit publication and external-configuration authorization naming that
   exact run/artifact.
8. Configure/read back the dedicated GitHub environment, npm trusted publisher, and token
   prohibition; stop on any mismatch.
9. Re-fetch `origin/main`; if it moved, invalidate the freeze and return to step 6. Otherwise
   create/push the annotated tag carrying the exact run/artifact identity, obtain the policy-conformant
   environment approval, publish the exact qualified `.tgz`, and verify npm byte identity,
   installed artifacts, and GitHub Release. Use the non-publishing recovery workflow only
   after a separately authorized partial-publication failure.
10. Complete §13.2, knowledge-capture the immutable release/auth-surface receipt, and hand
    it to I236, the Services runtime-adoption owner, and I238; perform no downstream
    mutation from I239.

Required I239 → I238 handoff:

- version, tag, release commit, npm `gitHead`, shasum, and integrity;
- qualified dry-run tar filename/length/SHA-256/shasum/integrity, exact Actions run and
  artifact ID/digest, and proof that tag/publication used those bytes at the unchanged main
  tip;
- installed ACP/materialize/Buzz/secret/governance qualification;
- packaged Worker version/source-commit identity and the exact auth-operation schema;
- proof that separate normalized credential scopes cannot read, overwrite, or delete one
  another across the backend abstractions;
- the hard-cut/re-login diagnostic and explicit absence of pre-DAH/v2/v1 migration;
- receipt field contract for namespace digest, credential ID/generation,
  issuer/client/resource, issued-at/expiry/action time, redacted remote HTTP class, and
  ordered confirmed revoke then scoped local deletion;
- explicit statement that the handoff proves the released capability, not a live
  credential operation; I236/I238 retain authority for their own login/refresh/revoke and
  must bind resulting receipts back to this exact release identity;
- exact-head CI and merged dry-run evidence;
- Buzz Card floor and canonical I107 selector-declaration evidence without selector
  leakage in public status output;
- unresolved operational prerequisites and stop conditions.

Required I239 → I236 boundary:

- the same immutable package/build/auth-surface identity supplied to I238;
- no staging host, issuer, resource, deployment, secret, or candidate constant added by
  I239; I236 supplies its reviewed canonical coordinates downstream;
- I236 must reject every pre-cut credential and mint a fresh v3 credential after its cut;
- I236 owns live canary, maintenance lease, credential operation, retain/rollback, and
  stabilized receipt authority; I239 neither performs nor claims them.

## 15. Risks and controls

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
| Path aliases derive different custody for one physical target | Medium | nearest-existing-ancestor realpath plus platform normalization; alias fixtures are mandatory |
| Public namespace digest exposes a raw path or backend identity | Medium | domain-separate it from both normalized path and key reference; schema forbids all three inputs from output |
| Old global key is deleted under guessed ownership | High | 1.2.0 never imports or deletes it automatically; re-login is the only supported transition |
| Remote refresh rotates a token but local atomic write fails | Medium | nonzero persistence failure, no success receipt or generation claim, explicit re-login recovery; never pretend the retained bytes are current |
| Strict logout deletes before remote confirmation | High | ordered state machine plus failure injection; non-2xx/network paths preserve scoped local custody |
| Strict logout preservation conflicts with urgent local containment | Low | ordinary logout remains an explicit non-qualifying, scoped local-deletion path with accurate remote warning |
| Build identity claims its own tarball integrity | High | prohibit self-hash claims; join packaged version/commit to the independent exact-tar release receipt |
| I236 or I238 treats schema availability as a live auth receipt | High | handoff labels capability versus operation evidence; downstream live gates require their own authorized operation receipts |

No scope-changing question remains open for G1. G2 may select internal helper names and
test-fixture organization, but it may not weaken exact Card association, tri-state
freshness, the credential hard cut, scoped custody, receipt allowlist/order, installed-artifact
qualification, publication authorization, provenance, or the I236/Services/I238 boundary
without a reviewed G1 amendment.
