---
sidebar_position: 8
---

# Migrate Hand-Edited Tool Configs

This guide walks through bringing an existing hand-edited
`~/.claude/settings.json` or `~/.codex/config.toml` into `drwn`'s managed model
without losing your existing MCP servers or custom skills.

## Inspect What You Already Have

`drwn scan` is the planned non-mutating discovery surface for exactly this
problem. It is currently a placeholder: the command runs and is intended to
report local agent tool config it finds and suggest machine inventory, Card
source, Worker Blueprint, and project-config candidates. Until the implementation
lands, inventory manually:

```bash
cat ~/.claude/settings.json
cat ~/.codex/config.toml
```

Record every MCP server entry, every custom skill directory, and every
hand-edited target setting.

## Register Existing MCP Servers

For each MCP server in your hand-edited config, write a small JSON definition
and add it to the standalone inventory:

```bash
drwn machine mcp add ./github-mcp.json --as github
drwn machine mcp list
```

If the server should be used in machine-scope sessions, copy the reviewed
definition into a Card, publish it, and include it in the selected Blueprint:

```bash
drwn card source add-mcp <card-source> github --from ./github-mcp.json
drwn apply --root <published-blueprint-ref>
```

If the server only applies to one project, scope it there instead:

```bash
cd /path/to/project
drwn init
drwn add mcp github
```

## Migrate Custom Skills

Inventory any custom skill directories the agent tools were already reading
from. For each one:

```bash
drwn machine skill install <npm-package-or-local-path>
drwn machine skill install <local-path>
drwn machine skill list
```

If the skill should be available through the machine Worker:

```bash
drwn card source add-skill <card-source> <skill-name> --from <skill-directory>
drwn apply --root <published-blueprint-ref>
drwn write --root --skills-only --dry-run
```

If the skill should apply only to one project, scope it through the project
config instead of selecting it for machine scope.

## Preview The Managed Write

```bash
drwn write --dry-run
```

Compare the planned changes against your hand-edited files. `drwn` will:

- preserve user-owned entries it did not write
- replace its own managed sections in the generated MCP config and managed
  symlinks
- warn when a hand-edited entry conflicts with a managed one

## Iterate

Repeat inventory operations, Card/Blueprint publication, project `add`
commands, and the appropriate scoped dry run until the plan matches what you
want. The retired machine skill/MCP enable/disable commands are not a migration
path. Then run `drwn write --root` for machine scope or, from a project:

```bash
drwn write
```

## Conservative Cleanup Model

`drwn` does **not** delete hand-edited entries it did not create. When a
managed write would otherwise replace a user-owned entry, `drwn` preserves the
user-owned version and reports the ownership conflict instead of overwriting.
This is by design: migration should never silently destroy something you
hand-wrote.

Use `drwn doctor` after migration to surface remaining ownership conflicts,
stale links, and unresolved references.

## See Also

- [Machine inventory CLI reference](../reference/cli/machine)
- [Ownership conflicts](../troubleshooting/ownership-conflicts)
