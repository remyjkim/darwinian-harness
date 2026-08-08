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
- sole required reviewer `leeminseung`, self-review prevented, admin bypass
  disabled, and one exact `v1.2.0` tag policy;
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
TMP_NPMRC="$(mktemp)"
chmod 600 "$TMP_NPMRC"

cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_BRIDGE_TOKEN}
EOF

npm whoami --userconfig="$TMP_NPMRC"
bun install --frozen-lockfile
bun run verify
npm view drwn-command-bridge@<version> version --userconfig="$TMP_NPMRC"
npm publish --access public --userconfig="$TMP_NPMRC"

rm -f "$TMP_NPMRC"
```

An exact `E404` is required before publishing a new bridge version. Ensure the
temporary config is mode 0600, delete it after the attempt, and never reuse its
credential for the `darwinian` CLI.
