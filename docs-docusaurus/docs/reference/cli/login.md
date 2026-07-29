---
sidebar_position: 15
---

# Login

`drwn login` authenticates the CLI with Darwinian Auth Hub through the device flow.

The command uses the production Auth Hub and requests the
`https://api.darwinian.dev` services resource by default. To test against another
Auth Hub, set `DRWN_DAH_HUB_URL`:

```bash
DRWN_DAH_HUB_URL=https://darwinian-auth-hub-staging.dev-726.workers.dev drwn login
```

Use `DRWN_DAH_RESOURCE` when the target environment requires a different services
audience. During the migration grace window, a previous-resource login can be
created explicitly:

```bash
DRWN_DAH_RESOURCE=https://api.darwiniantools.com drwn login
```

Changing the resource intentionally invalidates a stored credential for the other
resource; the CLI asks you to sign in again instead of silently discarding it.

Emit machine-readable output:

```bash
drwn login --json
```

In JSON mode, the browser sign-in URL is written to stderr while stdout remains the final JSON success object.

On success, credentials are written to `~/.agents/drwn/credentials.json` with owner-only permissions.

## Related

- [Whoami](./whoami) — validate the current session
- [Logout](./logout) — revoke best-effort and remove local credentials
- [Analyze](./analyze) — upload session archives after authentication
