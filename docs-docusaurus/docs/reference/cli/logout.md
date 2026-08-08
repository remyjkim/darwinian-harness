---
sidebar_position: 17
---

# Logout

`drwn logout` attempts to revoke the stored DAH refresh token and contains local
credential custody.

```bash
drwn logout
```

Emit machine-readable output:

```bash
drwn logout --json
drwn logout --json --require-remote-revoke
```

Ordinary logout is local-containment-first: it attempts remote revoke and then
removes the local envelope even when the server rejects the request or is
indeterminate. It may therefore succeed with a sanitized warning receipt. The
revoke contract covers the refresh token; it does not claim already-issued
access tokens are invalidated.

`--require-remote-revoke` is the qualification mode. It deletes local custody
only after a confirmed 2xx remote revoke, and qualification requires both that
remote confirmation and successful local deletion. A rejected, indeterminate,
profile-mismatched, or malformed remote result leaves custody in place and
fails. This mode ignores `DRWN_TOKEN`; it operates on the stored payload v3 in
its encrypted envelope v2.

JSON receipts are sanitized and do not include the access token, refresh token,
email, credential path, key reference, secret values, or response bodies. A
source/development build remains non-qualifying even when both operations
succeed.

## Related

- [Login](./login) — authenticate with the analyzer
- [Refresh](./refresh) — explicitly refresh stored custody
- [Whoami](./whoami) — validate the current session
