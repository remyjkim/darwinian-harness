---
sidebar_position: 15
---

# Login

`drwn login` authenticates the CLI with Darwinian Auth Hub (DAH) through the
native OAuth device flow.

The command uses the production Auth Hub and requests the
`https://api.darwinian.dev` services resource by default. To test against another
Auth Hub, set `DRWN_DAH_HUB_URL`:

```bash
DRWN_DAH_HUB_URL=https://darwinian-auth-hub-staging.dev-726.workers.dev drwn login
```

Use `DRWN_DAH_RESOURCE` when the target environment requires a different services
audience. For example, an explicitly provisioned staging environment can request its
matching resource:

```bash
DRWN_DAH_RESOURCE=https://api-staging-main.darwinian.dev drwn login
```

Changing the resource intentionally invalidates a stored credential for the other
resource; the CLI asks you to sign in again instead of silently discarding it.

Emit machine-readable output:

```bash
drwn login --json
```

In JSON mode, browser instructions are written to stderr while stdout contains
exactly one sanitized `darwinian.worker.auth-operation` receipt after local
credential persistence succeeds. The receipt allowlist contains Worker
version/source identity, a qualification namespace digest, credential ID and
generation, public issuer/client/resource, canonical timestamps, and
remote/local outcome. It does not include the access token, refresh token,
email, credential path, key reference, device code, browser query URL, secret
values, or response bodies.

On success, an exact DAH payload v3 is encrypted inside a credential-scope-bound
envelope v2 at `~/.agents/drwn/credentials.json`, with owner-only permissions
and a platform-keychain-held key. This is a hard cut: legacy payloads and
envelopes are not migrated or dual-read. Unsupported or malformed custody fails
with `CREDENTIAL_SCHEMA_UNSUPPORTED`; run `drwn login` again to replace it.
Absence is reported separately as `CREDENTIAL_ABSENT` by commands that require
stored custody.

`DRWN_TOKEN` is a validated headless bearer override for commands that accept
it. It is never persisted, never refreshed, and does not satisfy the explicit
stored-custody contract of [`drwn refresh`](./refresh).

A source/development build can emit a structurally valid receipt, but it is not
qualification eligible. Only an installed qualifying build can bind a
successful operation to its packaged source commit.

## Related

- [Whoami](./whoami) — validate the current session
- [Refresh](./refresh) — force-refresh stored custody
- [Logout](./logout) — revoke best-effort and remove local credentials
- [Analyze](./analyze) — upload session archives after authentication
