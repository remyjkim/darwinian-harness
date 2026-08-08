# ABOUTME: Preserves the historical npm authentication-precedence incident without retaining an executable publication fallback.
# ABOUTME: Marks the old local-token CLI path superseded by I239 exact-artifact OIDC publication.

# NPM Publishing Incident Record (Superseded)

## Status

This is a **Historical incident record**. Its local-token publication procedure
is superseded by I239 and must not be used for the `darwinian` CLI.

The current operator contract is authoritative in:

- [`docs/release-process.md`](../../docs/release-process.md); and
- [`docs/maintainers/publishing.md`](../../docs/maintainers/publishing.md).

The only supported CLI publication path is the protected, exact-artifact GitHub
Actions workflow. Manual dispatch qualifies current `main` without mutation. A
later exact annotated tag joins that dry-run run/artifact to one protected OIDC
publish job. There is no local CLI token fallback.

## Historical incident

During the first npm publication path, a local publish used ambient npm
configuration instead of the credential the operator believed was selected.
Authentication and package dry-run checks succeeded, but the real publish
failed at the registry policy boundary. An explicitly isolated configuration
then demonstrated that credential-source precedence was the immediate cause.

The incident established three durable lessons:

1. successful identity lookup proves only that some credential authenticated;
2. package dry-run does not prove publish-time identity, policy, or exact-byte
   acceptance; and
3. ambient machine configuration is not reproducible release authority.

Those lessons remain valid. The old command sequence does not.

## I239 hard cut

I239 removes the unsafe response of making the local token procedure more
careful. For `darwinian@1.2.0` and later:

- package, runtime, generated build, source commit, dry-run run/attempt,
  artifact ID/digest, and tar identity are joined fail closed;
- only the dedicated independently reviewed publication environment receives
  OIDC permission;
- the protected job downloads and publishes the already-qualified tarball and
  never repacks source;
- registry shasum/integrity equality and installed smokes precede exact GitHub
  Release metadata;
- recovery can verify published bytes and repair metadata, but cannot publish,
  repack, retag, change dist-tags, or unpublish; and
- unavailable CI is a stop, not permission to switch to local credentials.

The separately packaged `drwn-command-bridge` retains its own independently
governed emergency procedure. That boundary must never be generalized to the
`darwinian` CLI.

## Packaging lessons retained

The original hardening also established still-relevant package hygiene:

- use an explicit `package.json.files` allowlist;
- exclude local environment files, planning documents, tests, and generated
  operator state;
- keep package contents repository-owned and inspectable rather than relying on
  local symlinks or other machine-specific content;
- verify npm-normalized metadata rather than assuming source metadata is
  reproduced verbatim; and
- qualify an installed tarball, not only repository source or a package listing.

I239 encodes these lessons in executable release-readiness, artifact-contract,
provenance, workflow, and recovery tests. This record explains why those checks
exist; it does not authorize a release action.
