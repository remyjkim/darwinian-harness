---
sidebar_position: 14
---

# Worker

The operational Worker surface complements the Card/Blueprint authoring
commands:

```bash
drwn worker status <slug> --json
drwn worker materialize --payload payload.json --project-root /srv/worker
drwn worker buzz-tools
printf '%s' "$WORKER_SECRET" | drwn worker secret set <slug> <name>
```

## Status and governance truth

`drwn worker status <slug>` reads the Worker and deployment endpoints, shows the
latest and active deployments separately, and always includes one governance
model in successful JSON output.

Governance declaration and deployment enforcement are different claims.
Declaration is derived only from an exact match between the deployment Card and
the selected local project's locked Worker root. It reports the real
`tools.allow` and `tools.deny` counts, including zero. When exact evidence is
unavailable it reports one stable reason:

- `LOCAL_PROJECT_UNAVAILABLE`
- `LOCAL_TARGET_UNAVAILABLE`
- `LOCAL_CARD_REF_MISMATCH`

The Deploy API does not currently report authoritative governance capability.
An active deployment therefore reports enforcement `unknown` with
`CAPABILITY_NOT_REPORTED`; no active deployment reports `not_applicable` with
`NO_ACTIVE_DEPLOYMENT`. The CLI does not infer enforcement, borrow another
Card's rules, guess a policy hash, or print an “enforced”/“not enforced” claim.

## Materialize

`drwn worker materialize` validates a V1 deploy payload and store byte identity,
seeds the Card store, stages the derived V2 project config and lock, installs
frozen, and runs the normal write projection. Required inputs are `--payload`
and `--project-root`. `--store-export` supplies external store bytes;
`--emit-store-tar` and `--emit-project-tar` produce bounded snapshots. This is a
filesystem-mutating operator command.

## Buzz tools

`drwn worker buzz-tools` runs an MCP stdio server exposing exactly
`buzz_messages_send` and `buzz_messages_thread`. It invokes Buzz without a shell
and sends message content on stdin. It is intended for Card-declared runtime
use. Its presence in source or a package does not prove live Buzz delivery.

## Secrets

`drwn worker secret set` reads one secret from non-interactive stdin. Secret
bytes are never accepted on argv or rendered to stdout, stderr, or an error.
Use `--kind mcp` for an MCP secret, or `--kind env --env-var NAME` for an
environment binding.

The `materialize`, `buzz-tools`, and `secret set` help commands are members of
the fixed installed-package release-smoke set. `status --help` is also read-only,
but is outside that fixed set. Actual status calls use auth/network, and the
other actual commands may mutate state or start a runtime; they are not release
smokes. Released Worker capability is also separate from Services adoption and
I236/I238 staging or live qualification.

## Related

- [ACP](./acp) — serve a deployed Worker to ACP clients
- [Login](./login) — authenticate operational commands
