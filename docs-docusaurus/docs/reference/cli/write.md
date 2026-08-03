---
sidebar_position: 5
---

# Write

`drwn write` materializes the effective harness into downstream local agent tool files. It is the command that turns the resolved model into Claude, Codex, Cursor, and MCP config state.

Preview first:

```bash
drwn write --dry-run
drwn write --json
```

Write all effective state:

```bash
drwn write
```

Limit the operation:

```bash
drwn write --target=claude
drwn write --skills-only
drwn write --mcp-only
drwn mcp write --dry-run
```

`drwn write --force` repairs drift only inside paths or MCP fields already recorded as drwn-owned. It never claims foreign files or fields.

Write at explicit machine scope rather than project scope:

```bash
drwn write --scope machine --dry-run
drwn write --scope machine
```

`--scope machine` ignores project config and projects strict machine intent to user-scope tool configs (`~/.claude/`, `~/.codex/`, `~/.cursor/`). The write record lives at `~/.agents/drwn/global-write-record.json`.

Project writes use `<project>/.agents/drwn/write-record.json` and project intent only. User-home capabilities may remain ambient in the downstream client but are never copied into project declarations.

A first machine write refuses an existing unrecorded destination or same-ID MCP
field with `MACHINE_PROJECTION_CONFLICT`, even when bytes are identical.
Removal deletes only unchanged prior-owned state; drifted and foreign state is
preserved.

Enforcement flags:

```bash
drwn write --strict-hooks   # fail if any hook policy file cannot be materialized
drwn write --strict         # fail on version-floor or instruction-consent violations
drwn write --apply-claude-adapter # add a managed import to a foreign Claude file
```

`--strict-hooks` is relevant when you expect hook policies to be present;
without it, missing policies are warnings rather than failures. `--strict`
does not promote every warning: it enforces the supported Worker version floor
and requires valid consent for every selected explicit instruction
contribution.

Full project writes compose consented Card instructions into one owned block in
root `AGENTS.md`. Machine, target-only, MCP-only, and skills-only writes retain
that block and its write-record ownership unchanged. An absent
`.claude/CLAUDE.md` receives the exact `@../AGENTS.md` adapter. Foreign files are
preserved; use `--apply-claude-adapter` to add a managed import block.

See [Worker Instructions](../../concepts/worker-instructions) for consent,
hashing, drift, cleanup, and adapter rules.

When locked cards declare optional MCP servers, `drwn write` includes an optional MCP report. Human output lists each card server as active, skipped, or shadowed. JSON output includes the same data under `optionalMcpReport`. Skipped card MCPs can be enabled for the current project with:

```bash
drwn add mcp <server-name>
drwn write --dry-run
```
