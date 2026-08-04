# ABOUTME: Records the npm publishing failure analysis and the verified manual publishing workflow.
# ABOUTME: Covers token precedence, 2FA behavior, config isolation, and the CI publishing path.

# NPM Publishing Analysis And Manual

## Purpose

This document records the publishing failure analysis from the first npm publishing path and the correct manual publishing workflow that was verified to work.

It exists to prevent repeated confusion around npm token precedence, 2FA behavior, and local machine config leakage.

The current package name is `darwinian-minds`. Version `0.4.0` was the first publish (2026-06-29). CI-driven publishing is available via `.github/workflows/release.yml` (triggered by `v*` tags, requires an `NPM_TOKEN` repository secret). The manual flow below remains valid as a fallback.

## Outcome

The package was publishable, but plain `npm publish` in this repo was not using the intended token from `.env`.

The working solution was:

1. load `NPM_ORG_TOKEN` from `.env`
2. write a temporary npm config file containing only the desired registry token
3. invoke `npm whoami` and `npm publish` with `--userconfig=<temp file>`

This bypassed the machine-level `~/.npmrc` token that was interfering with publish behavior.

## What Happened

### Observed behavior

- `npm whoami` succeeded
- `npm publish --dry-run --access public` succeeded
- real `npm publish --access public` failed with `EOTP`
- a newer token had been created and believed to be bypass-enabled
- later, publishing with an explicit temporary npm config worked

### Key hidden factor

The machine already had a user-level npm config file:

```bash
~/.npmrc
```

It contained:

```ini
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=...
```

That meant plain `npm publish` was likely authenticating with the token in `~/.npmrc`, not the token stored in `.env`.

### Why that caused confusion

Several signals looked individually valid but were misleading when combined:

- `npm whoami` working only proved that **some** valid token was being used
- `npm publish --dry-run` does not prove final publish auth is correct
- `EOTP` looked like a token-capability problem, but the more immediate issue was token selection

The local config source and the intended env token were being conflated.

## Root Cause

The real root cause was **npm auth source precedence on the machine**.

Plain `npm publish` was not reliably isolated to the new token in `.env`.

Instead, the publish path was influenced by:

- `~/.npmrc`
- default npm config resolution
- registry auth settings already present on the machine

So even though a new token existed, the command path was not guaranteed to use it.

## Secondary Lessons

### 1. `npm whoami` is not enough

`npm whoami` only proves that npm can authenticate a user.

It does **not** prove:

- the exact token source being used
- that the token has publish rights
- that the token bypasses 2FA
- that publish-time policy checks will pass

### 2. `npm publish --dry-run` is necessary but not sufficient

`--dry-run` validates package contents and most packaging behavior.

It does **not** fully prove:

- publish-time 2FA behavior
- final registry acceptance path
- package-level access/policy handling

### 3. Local machine config must be treated as hostile by default

If the goal is reproducible publishing, do not assume:

- `~/.npmrc` is harmless
- env token injection will override everything cleanly
- your machine state matches a clean publishing environment

For publish operations, explicit config isolation is safer than inference.

## Correct Manual Publishing Flow

Use this exact flow for manual npm publishing from this repo.

### 1. Move to the repo

```bash
cd /path/to/darwinian-minds
```

### 2. Load the token from `.env`

```bash
set -a
source .env
set +a
```

### 3. Create a temporary npm config that uses only the intended token

```bash
TMP_NPMRC="$(mktemp)"
chmod 600 "$TMP_NPMRC"
trap 'rm -f "$TMP_NPMRC"' EXIT HUP INT TERM

cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_ORG_TOKEN}
EOF
```

### 4. Verify auth against that isolated config

```bash
npm whoami --userconfig="$TMP_NPMRC"
```

Expected result:

- the intended npm username should be returned

### 5. Run the repo release gate

```bash
bun run verify:release --json
```

Expected result:

- all checks `ok: true`
- no warnings

### 6. Publish with the isolated config

```bash
npm publish --access public --userconfig="$TMP_NPMRC"
```

### 7. Remove the temporary config

```bash
rm -f "$TMP_NPMRC"
trap - EXIT HUP INT TERM
unset NPM_ORG_TOKEN
```

## Safer Preflight Sequence

If you want a more explicit manual checklist, use this:

```bash
cd /path/to/darwinian-minds

set -a
source .env
set +a

TMP_NPMRC="$(mktemp)"
chmod 600 "$TMP_NPMRC"
trap 'rm -f "$TMP_NPMRC"' EXIT HUP INT TERM

cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_ORG_TOKEN}
EOF

npm whoami --userconfig="$TMP_NPMRC"
bun test
bun run typecheck
bun run verify:release --json
npm pack --dry-run --json
npm publish --access public --userconfig="$TMP_NPMRC"

rm -f "$TMP_NPMRC"
trap - EXIT HUP INT TERM
unset NPM_ORG_TOKEN
```

## When To Suspect Config Precedence Problems

Suspect npm config leakage when any of these are true:

- `npm whoami` succeeds but publish behavior is surprising
- a token was rotated but npm behaves like the old token is still active
- `EOTP` appears even though the intended token should bypass 2FA
- publish works only on one machine
- `~/.npmrc` already contains auth configuration

## Useful Diagnostic Commands

Inspect the user-level npm config:

```bash
cat ~/.npmrc
```

Inspect effective npm config related to auth and registry:

```bash
npm config list -l | rg 'registry|otp|auth-type|_authToken|//registry.npmjs.org'
```

Test with no user config:

```bash
npm whoami --userconfig=/dev/null
```

Test with an explicit isolated config:

```bash
npm whoami --userconfig="$TMP_NPMRC"
```

## Packaging Lessons Captured During Release Hardening

The release hardening pass also uncovered several package-quality issues that had to be fixed before publishing:

1. `.env` was being included in `npm pack`
2. `.ai/` planning docs were being included in `npm pack`
3. `test/` was being included in `npm pack`
4. `skills/shared/frontend-design` was a local symlink instead of repo-owned content
5. the README was still written primarily as an internal operator document
6. `drwn` needed to fall back to the packaged repo root when run outside a checkout
7. npm normalized some package metadata during publish-facing operations
8. internal operator docs expanded as per-project config and package-backed skill bundles became real supported subsystems

These were fixed by:

- adding an explicit `files` allowlist in `package.json`
- ignoring `.env` and tarballs in `.gitignore`
- vendoring `skills/shared/frontend-design`
- rewriting the README for outside users
- adding packaged-install coverage and package-content checks
- aligning verification with npm-normalized metadata

## Policy

For future manual publishes from this repo:

- do **not** rely on ambient `~/.npmrc` state
- do **not** assume `npm whoami` proves publish readiness
- do **not** publish before `bun run verify:release --json` passes
- prefer explicit `--userconfig` isolation when using tokens from `.env`

## Recommendation

The preferred long-term publishing path is:

1. use CI publishing via `.github/workflows/release.yml` for tagged releases (push a `v*` tag to trigger)
2. keep the manual temporary-`npmrc` flow for ad hoc local publishes when CI is not available

CI publishing is the primary path. It uses a repository-scoped `NPM_TOKEN` secret, runs the release gate, and creates a GitHub Release alongside the npm publish.
