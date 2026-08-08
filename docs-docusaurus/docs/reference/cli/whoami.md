---
sidebar_position: 17
---

# Whoami

`drwn whoami` validates the current DAH identity and prints the authenticated user email.

```bash
drwn whoami
drwn whoami --json
```

The command resolves auth from the scoped encrypted credential store under
`~/.agents/drwn/credentials.json`. For automation, a non-persistent `DRWN_TOKEN`
bypasses the stored credential. The token must carry the configured DAH issuer,
the Darwinian Services audience, and a future expiry:

```bash
DRWN_TOKEN=<token> drwn whoami
```

If the token is missing or expired, the command exits non-zero and asks you to run `drwn login`.

## Related

- [Login](./login) — authenticate through DAH
- [Logout](./logout) — remove local credentials
