---
sidebar_position: 15
---

# Login

`drwn login` authenticates the CLI with Darwinian Auth Hub (DAH) through the
native OAuth device flow.

The command uses the complete production cloud profile by default. It requests the
exact scopes `openid email offline_access dah:management.delegate`; the final access
token must contain that exact scope set plus the approved issuer, audience, authorized
party, human subject, and expiry before anything is persisted.

Select the complete admitted staging tuple with one variable:

```bash
DRWN_CLOUD_PROFILE=staging drwn login
```

Local development requires a reviewed strict profile file:

```bash
DRWN_CLOUD_PROFILE=local \
DRWN_CLOUD_PROFILE_FILE=/absolute/path/to/drwn-cloud-profile.json \
drwn login
```

API, web, Auth Hub, issuer, audience, client, and scope fields cannot be overridden
independently. Old-scope stored credentials remain available to `drwn whoami` and
`drwn logout`, but deployed Worker management requires a fresh interactive login. An
old credential is refused before refresh so consent cannot be silently elevated.

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
