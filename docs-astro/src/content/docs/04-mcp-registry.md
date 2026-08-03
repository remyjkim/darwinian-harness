---
title: "MCP Registry"
description: "Manage MCP server definitions, toggles, and per-target configuration."
date: 2026-04-28
order: 4
---

## Registry Files

MCP servers are defined in two places:

- **`registry/mcp-servers.json`** — server definitions (command, args, env)
- **`registry/config.json`** — target config and optional server toggles

In a checkout, edit these files directly. With the published package, they ship as packaged defaults.

## User Registry

In the cards-era store, user-registered MCP servers live as one JSON file per
server:

```text
~/.agents/drwn/mcp-servers/<server-id>.json
```

Add a user MCP server:

```bash
drwn machine mcp add my-server.json --as my-server
```

Machine MCP definitions come only from Cards in the active Worker Blueprint
closure embedded in `~/.agents/drwn/machine.json` V2. Select a published
Blueprint with `drwn apply --root <ref>` and project with `drwn write --root`.
Standalone MCP records remain inactive inventory.

Reusable MCP definitions use the current `~/.agents/drwn/mcp-servers/`
directory.

## Inspecting MCP State

```bash
drwn mcp list
drwn mcp list --json
```

## Writing MCP Config

Preview before writing:

```bash
drwn mcp write --dry-run
```

Write to all targets:

```bash
drwn mcp write
```

Limit to one target:

```bash
drwn mcp write --target=cursor
drwn mcp write --target=opencode
```

## Notes

- **Platform-provided entries** can live in the registry but are excluded from generated local tool configs
- **Optional servers** are included only when enabled in `registry/config.json`
- **Parallel MCP** is controlled by `config.parallel.mcp.enabled`
- **Card-provided servers** apply from the selected project or machine Worker closure; project-local server overrides apply only inside that project
- **Project-local extension settings** such as `extensions.parallel.mcp` are applied when commands run inside that project
