---
sidebar_position: 14
---

# Worker

The operational Worker surface complements the Card/Blueprint authoring
commands:

```bash
drwn org list --json
drwn worker status --json
drwn worker deploy @team/worker@1.0.0 --json
drwn worker chat --message "hello" --json
drwn worker materialize --payload payload.json --project-root /srv/worker
drwn worker launch-context prepare <installed-root> --target codex --dry-run --json
drwn worker buzz-tools
printf '%s' "$WORKER_SECRET" | drwn worker secret set PROVIDER_API_KEY
```

## Deployed Worker management

`drwn org list/use` selects non-authoritative organization context.
`drwn worker register/use` writes project binding only after authoritative readback.
Status, deployment history, rollback, secrets, runs, and retirement (`drwn worker retire`) use strict typed
IDs and the versioned management result envelope; names and slugs never select authority.

The client validates the frozen `deployed-worker.v1` contract before sending a
request. Unsupported protocol tuples, malformed envelopes, unknown response
fields, and secret-shaped response values fail closed as
`UNSUPPORTED_PROTOCOL` or `SERVER_RESPONSE_INVALID`. The CLI never joins local
Card names or slugs to remote authority.

## Materialize

`drwn worker materialize` validates a V1 deploy payload and store byte identity,
seeds the Card store, stages the derived V2 project config and lock, installs
frozen, and runs the normal write projection. Required inputs are `--payload`
and `--project-root`. `--store-export` supplies external store bytes;
`--emit-store-tar` and `--emit-project-tar` produce bounded snapshots. This is a
filesystem-mutating operator command.

## Per-agent launch contexts

`drwn worker launch-context` is separate from deployment `materialize`. It
derives process-local additions for an already-installed project Worker root;
it never constructs a new project, resolves a remote ref, changes
`activeWorker`, or starts an agent.

```bash
drwn worker launch-context prepare @team/reviewer --target codex --dry-run --json
drwn worker launch-context prepare @team/reviewer --target claude --enable-mcp context7 --json
drwn worker launch-context list --json
drwn worker launch-context prune --older-than 7d
drwn worker launch-context prune --older-than 7d --execute --json
```

Prepare supports only `claude` and `codex`. `--enable-mcp` is repeatable and
accepts only optional servers declared by the assigned closure. `--strict`
turns missing selected hook/instruction consent into an error. `--dry-run`
returns `drwn.worker-launch-plan` and performs no target execution or writes.
Normal JSON output is a `drwn.worker-launch-prepare-result` containing the
strict `drwn.worker-launch-context` descriptor and a verified-reuse flag.

Claude Code 2.1.212 and Codex CLI 0.149.0 are the conservative first supported
versions. Target-native trust prompts remain active. Codex uses a nested project
layer selected with `-C` and `--add-dir`; Claude uses a validated directory
plugin and optional append-system-prompt file.

List and doctor verify the bounded context store without a mutable index. Prune
is report-only by default; `--execute` requires `--older-than`. Darwinian Worker
does not know whether Herdr still has a live process attached. Cold resume is
out of scope and restored agents remain `relaunch_required` until relaunched.

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

All org/Worker management help commands plus `materialize`, `buzz-tools`, and `secret set` are members of
the fixed installed-package release-smoke set. `status --help` is also read-only,
but is outside that fixed set. Actual status calls use auth/network, and the
other actual commands may mutate state or start a runtime; they are not release
smokes. Released Worker capability is separate from Services adoption and
joint staging or live qualification.

## Related

- [Worker Mind](./mind) — provider-neutral backend placeholder
- [Login](./login) — authenticate operational commands
