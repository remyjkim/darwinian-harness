---
sidebar_position: 8
---

# MCP

`drwn mcp` is the MCP-scoped namespace for inspecting and writing MCP server state. The two subcommands are read (`list`) and write (`write`); the write side is an alias for `drwn write --mcp-only` and shares the same materialization engine.

## drwn mcp list

List MCP servers from the merged registry, with active state under the current effective config.

```bash
drwn mcp list
drwn mcp list --json
```

The merged registry is the built-in `registry/mcp-servers.json` unioned with
standalone MCP inventory at `~/.agents/drwn/mcp-servers/` and definitions
declared by locked Cards in the current project or explicit machine Worker
scope. Card definitions participate before project activation toggles are
interpreted. Output columns are `name`, `transport`, `active`, and
`targets`.

`drwn mcp list` is project-aware: when run inside a configured project, the active set reflects the project overlay (`<project>/.agents/drwn/config.json`) and any extension-derived MCP state (e.g. `extensions.parallel.mcp`).

This command is read-only.

## drwn mcp write

Write the effective MCP configuration into enabled downstream targets.

```bash
drwn mcp write --dry-run
drwn mcp write
drwn mcp write --target=claude
drwn mcp write --target=cursor
drwn mcp write --json
```

`drwn mcp write` is equivalent to `drwn write --mcp-only`. `--dry-run` previews changes without mutating files. `--target` limits the write to one of `claude`, `codex`, or `cursor` (deprecated).

## Where MCP definitions live

| Source | Path | Owner |
|---|---|---|
| Built-in registry | `registry/mcp-servers.json` | packaged harness |
| Standalone MCP inventory | `~/.agents/drwn/mcp-servers/<id>.json` | drwn-managed machine-local records |
| Card-declared definitions | locked card manifests and card store content | card authors |
| Registry/target config | `registry/config.json` | packaged harness |
| Machine Worker definitions | Cards in `machine.json`'s active locked closure | machine-local |
| Project overlay | `<project>/.agents/drwn/config.json` | per-project |

## Inclusion rules

Machine and project evaluation use separate inclusion rules:

- Machine scope activates only MCP definitions from the active, integrity-verified Worker closure.
- `transport: "platform-provided"` entries are never projected into local tool configs.
- In a project, `drwn add mcp <name>` writes `servers.<name>.enabled = true`; this also enables optional MCPs declared only by locked cards.
- Inside a project, `extensions.parallel.mcp = true` enables the project-local Parallel MCP overlay; the project overlay can also enable or disable any individual server.
- Standalone records and packaged optional/Parallel flags never activate machine MCPs.

## Generated config

`drwn write` (and `drwn mcp write`) produce target-specific output:

- Claude: per-server owned fields in `~/.claude.json` (or project `.mcp.json`)
- Codex: per-server owned fields in `~/.codex/config.toml`
- Cursor: per-server owned fields in `~/.cursor/mcp.json`

Unrelated fields and server IDs survive machine writes. A same-ID field that is
not in the global write record is foreign and blocks projection.

## Related

- [Write](./write) — full materialization, including skills
- [Status](./status) — see which MCP servers are active and why
- [Doctor](./doctor) — detect MCP drift between recorded and live state
