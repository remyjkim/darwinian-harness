---
sidebar_position: 16
---

# Refresh

`drwn refresh` forces a remote refresh of the stored DAH credential even when
the current access token is still fresh.

```bash
drwn refresh
drwn refresh --json
```

The command requires the exact stored payload v3 inside a scope-bound encrypted
envelope v2. It preserves the credential ID and increments the generation only
after the refreshed payload is persisted. A remote success followed by a local
write failure does not advance retained custody.

`DRWN_TOKEN` is never refreshed and never persisted. It is intentionally ignored
by this explicit stored-custody command. Missing custody reports
`CREDENTIAL_ABSENT`; unsupported or malformed custody reports
`CREDENTIAL_SCHEMA_UNSUPPORTED` and must be replaced with [`drwn login`](./login).

`--json` emits the same sanitized auth-operation receipt family as login and
logout. It does not include the access token, refresh token, email, credential
path, key reference, secrets, or remote response bodies. A development build
cannot produce a qualification-eligible receipt.

## Related

- [Login](./login) — establish fresh v3 custody
- [Logout](./logout) — revoke and remove custody
