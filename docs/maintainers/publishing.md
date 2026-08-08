# Publishing

This is the maintainer boundary for npm publication. The `darwinian` CLI and
`drwn-command-bridge` are separate packages with separate authorization paths.

## Publishing `darwinian`

Publish `darwinian@1.2.0` only through `.github/workflows/release.yml`, following
`docs/release-process.md`. Manual dispatch is qualification-only. The exact
annotated tag joins one successful main-only dry run to one immutable uploaded
tarball; only the protected `Publish to npm` job receives OIDC.

The external preconditions must be freshly read back before the tag is created:

- dedicated environment `darwinian-npm-publish`;
- required reviewers and self-review exactly as declared in
  `scripts/release/release-policy.json`, admin bypass disabled, and one exact
  `v1.2.0` tag policy;
- npm trusted publisher bound to owner `remyjkim`, repository
  `darwinian-worker`, workflow `release.yml`, environment
  `darwinian-npm-publish`, and action `npm publish`; and
- npm access `require_2fa_disallow_tokens`.

The workflow repeats those normalized control checks after approval, confirms
`1.2.0` is still unpublished, downloads the authorized artifact by exact ID,
verifies the archive digest before extraction, requalifies its receipt/build/tar
identity, and publishes that relative tar path. It never repacks the checkout.

No local token fallback is supported for the `darwinian` CLI. Do not use ambient
`.npmrc`, a maintainer token, a copied one-time password, or a local publish
command when GitHub Actions is unavailable. Stop and restore the reviewed
trusted-publishing path instead. This avoids qualifying one artifact while
publishing different local bytes.

After publication, require npm shasum/integrity equality before installed smokes
on Ubuntu and macOS. A GitHub Release is created or verified only after those
checks and must exactly match the existing annotated tag and source commit.

If publication has already succeeded and a later step fails, use
`.github/workflows/release-recovery.yml` with the exact failed run ID and an
independently approved closed-schema recovery receipt. Recovery has no OIDC,
token, publish, repack, retag, dist-tag, or unpublish path. It may verify npm
bytes, run installed smokes, and create or verify missing GitHub Release
metadata at the existing tag only.

## Publishing `drwn-command-bridge`

The bridge uses `.github/workflows/release-command-bridge.yml` and the separate
protected `npm-publish` environment. Prefer that trusted-publisher workflow: it
validates the requested version, runs `bun run verify`, refuses an existing
version, publishes from the bridge directory, and confirms registry visibility.

The bridge retains an independently gated local emergency procedure because its
release policy is separate from the CLI. Use it only after bridge-specific
authorization, native-client evidence, and confirmation that the intended
version is absent.

From `drwn-command-bridge/`, load the bridge-only token into the environment,
then isolate npm configuration from ambient machine state:

```bash
set -euo pipefail
: "${NPM_BRIDGE_TOKEN:?Load the authorized bridge-only token first}"

TMP_NPMRC="$(mktemp)"
REGISTRY_STDOUT="$(mktemp)"
REGISTRY_STDERR="$(mktemp)"
chmod 600 "$TMP_NPMRC" "$REGISTRY_STDOUT" "$REGISTRY_STDERR"
trap 'rm -f "$TMP_NPMRC" "$REGISTRY_STDOUT" "$REGISTRY_STDERR"; unset NPM_BRIDGE_TOKEN' EXIT

cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_BRIDGE_TOKEN}
EOF

npm whoami --userconfig="$TMP_NPMRC"
bun install --frozen-lockfile
bun run verify

set +e
npm view drwn-command-bridge@<version> version --json --prefer-online \
  --userconfig="$TMP_NPMRC" >"$REGISTRY_STDOUT" 2>"$REGISTRY_STDERR"
REGISTRY_EXIT=$?
set -e

if [ "$REGISTRY_EXIT" -eq 0 ]; then
  echo "Requested bridge version already exists." >&2
  exit 1
fi
if ! jq -e '.error.code == "E404"' "$REGISTRY_STDOUT" >/dev/null 2>&1 && \
   ! jq -e '.error.code == "E404"' "$REGISTRY_STDERR" >/dev/null 2>&1; then
  echo "Registry result was indeterminate; publication refused." >&2
  exit 1
fi

npm publish --access public --userconfig="$TMP_NPMRC"
```

Only a structured exact-version `E404` advances. A timeout, DNS/TLS/auth/rate
limit/5xx failure, malformed output, or unexpected successful value stops. The
trap deletes the temporary files and unsets the bridge credential after any
outcome. Never reuse that credential for the `darwinian` CLI.
