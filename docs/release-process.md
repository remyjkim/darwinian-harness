# Release Process

## Releasing a new CLI version: Darwinian Worker 1.2.0

The CLI release is a two-event, exact-byte process. Manual dispatch can only
qualify current `main`; it cannot publish. A later exact annotated `v1.2.0` tag
authorizes publication of the one artifact uploaded by that dry run. No path
treats an already-published version as successful qualification of new source.

### 1. Complete and qualify source

Finish the issue work and run the consolidated local and hosted gates on the
exact candidate head:

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run verify:bridge
bun run verify:release
```

Package version, runtime version, and generated build identity must agree on
`1.2.0`. A source/development identity is explicitly non-eligible. Source
availability is not installed qualification: the workflow must generate the
build identity from clean Git, pack once, require the ACP/materialize/Buzz/secret
members, install that exact tar, and run all eight safe version/help smokes.
The distinction between source availability and installed qualification remains
part of the retained release evidence.

### 2. Run the immutable dry run

Dispatch `CLI Release` from `main` with version `1.2.0` and `dry_run: true`.
The workflow rejects any other ref, a moved `origin/main`, a package-version
mismatch, an indeterminate registry result, or an existing `darwinian@1.2.0`.
It runs the full qualification gates, packs once, installs once, and uploads
exactly:

- `darwinian-1.2.0.tgz`; and
- `release-candidate.json`.

Record the dry-run run ID and attempt, artifact ID and digest, source commit,
tar SHA-1/SHA-256/integrity/byte length, and workflow URL from the completed run.
The uploaded receipt was written before upload; mutable artifact outputs are not
injected into it later.

Stop after the dry run. Obtain explicit authorization naming that exact
run/artifact and separately authorizing publication-control configuration,
readback, and publication. A successful dry run is not publication authority.

### 3. Read back publication controls

Before creating a tag, an authorized administrator must configure and read back
fresh, normalized evidence for both external control planes:

- GitHub environment `darwinian-npm-publish` matches the declared approval
  policy in `scripts/release/release-policy.json` for required reviewers and
  self-review, disallows admin bypass, enables custom deployment policies, and
  admits only tag `v1.2.0`. Under the current policy the `remyjkim` release
  operator approves their own protected deployment; changing that is a reviewed
  edit to the policy file, never an undeclared change to GitHub settings.
- npm trusted publishing binds package `darwinian` to
  `remyjkim/darwinian-worker`, workflow `release.yml`, environment
  `darwinian-npm-publish`, and action `npm publish` only.
- npm publishing access is `require_2fa_disallow_tokens`.

Attach the sanitized, timestamped readback receipts to I239. Missing,
unverifiable, stale, differently scoped, or secret-bearing evidence is a stop.
The workflow revalidates these receipts inside the protected job; architecture
or source review is not a substitute for external configuration readback.

### 4. Authorize with one annotated tag

Create a tag message containing a human title and exactly one closed machine
block. Substitute only values copied from the successful dry run:

```text
Darwinian Worker CLI v1.2.0

-----BEGIN DARWINIAN WORKER RELEASE AUTHORIZATION-----
schema=darwinian.worker.release-authorization
schema_version=1
version=1.2.0
dry_run_run_id=<run-id>
dry_run_run_attempt=<attempt>
artifact_id=<artifact-id>
artifact_digest=sha256:<artifact-archive-digest>
-----END DARWINIAN WORKER RELEASE AUTHORIZATION-----
```

Create and inspect the annotated `v1.2.0` tag locally before pushing it:

```bash
git tag -a v1.2.0 --file release-tag-message.txt
git cat-file -p refs/tags/v1.2.0
git push origin v1.2.0
```

The tag workflow requires the tag to peel to the dry-run source, the checkout,
and freshly fetched `origin/main`. It retrieves the exact run, attempt, jobs, and
artifact by ID; verifies the archive digest before extraction; and rejoins the
receipt, packaged build identity, and measured tar. It never searches for a
merely similar run.

### 5. Approve exact-tar OIDC publication

Only `Publish to npm` enters `darwinian-npm-publish` and receives
`id-token: write`. After independent approval it repeats the default-branch,
control-readback, registry-freshness, archive-digest, receipt, build, and tar
checks. It then publishes the downloaded exact tarball; it does not repack the
checkout:

```bash
npm publish "./candidate/darwinian-1.2.0.tgz" --access public
```

There is no `NPM_TOKEN` or maintainer-token fallback for the `darwinian` CLI.
Failure before publication requires a new successful dry run and new annotated
authorization. Do not reuse a stale run or edit/move the tag.

### 6. Verify registry bytes and release metadata

After propagation, npm version, `gitHead` when reported, shasum, and integrity
must equal the qualified candidate before the Ubuntu and macOS installed smokes
run. Only then may the workflow create or verify a GitHub Release whose tag,
target commit, title, and body exactly match the annotated tag.

The read-only registry metadata check is:

```bash
npm view darwinian@1.2.0 version gitHead dist.shasum dist.integrity --json
```

Record the registry metadata, both installed-smoke results, tag/commit, GitHub
Release URL, workflow run, and candidate SHA in
`.ai/tasks/cl0239_darwinian_worker_cli_release_completion.md`.

Released capability is not live environment evidence. I236 and I238 own their
separate credentials, staging, ACP/Buzz, and operational qualification gates.
Worker publication is also distinct from Services adoption. Do not describe a
green release as deployment, live Buzz delivery, membership, resource
authorization, or production traffic proof.

### Recovery after npm publication

If npm publication succeeds but a later registry smoke or GitHub Release step
fails, the ordinary workflow cannot be rerun because `1.2.0` now exists. Use
`.github/workflows/release-recovery.yml` only after a new independent approval.

Dispatch `CLI Release Recovery` with ref `v1.2.0`, the exact failed canonical
release run ID, and this closed authorization JSON (with the real canonical
timestamp and run ID):

```json
{
  "schema": "darwinian.worker.release-recovery-authorization",
  "schemaVersion": 1,
  "authorizedAt": "2026-08-08T00:00:00.000Z",
  "tag": "v1.2.0",
  "failedRunId": 123456789,
  "action": "verify_and_repair_metadata"
}
```

Recovery enters `darwinian-npm-publish` for independent approval but has no
OIDC, npm token, publish, repack, tag mutation/push, dist-tag, or unpublish
capability. It requires the existing tag, failed canonical run, dry-run
authorization, unexpired artifact, receipt, npm `gitHead`, and registry tar bytes
to agree. It may run Ubuntu/macOS installed smokes and create or verify missing
GitHub Release metadata at the existing tag only. Any identity mismatch stops
for a separately authorized deprecation and patch roll-forward decision.

## Releasing `drwn-command-bridge`

`drwn-command-bridge` is a separate npm package with its own version, workflow,
trusted-publisher binding, environment, and release decision. The CLI release
gate verifies the bridge but never publishes it.

Before publishing a bridge version:

1. In `drwn-command-bridge/`, run `bun install --frozen-lockfile` and
   `bun run verify`.
2. Record a native macOS end-to-end smoke through Claude Desktop or an
   equivalent MCP stdio client: initialization, tool listing, one allowlisted
   command, one denied command, and the audit chain. Exercise `sandbox-exec`
   when present.
3. Keep Linux and Windows native-validation gaps explicit in the bridge README.
4. Confirm absence with `npm view drwn-command-bridge@<version> version`.
5. Dispatch `Command Bridge Release` from `main`, enter the exact version, and
   leave dry run disabled. Approve its separate protected `npm-publish`
   environment.

If GitHub Actions is unavailable, the bridge alone retains its independently
gated temporary-config fallback in `docs/maintainers/publishing.md`:

```bash
npm publish --access public
```

Do not add or enable an `npx`-backed registry entry until that bridge version is
available on npm. Local validation should invoke the built file with
`node /absolute/path/to/drwn-command-bridge/dist/index.js`.
