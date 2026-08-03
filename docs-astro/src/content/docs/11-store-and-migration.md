---
title: "Local State And Inventory"
description: "The V2 machine state, immutable Card store, and standalone inventory boundaries."
date: 2026-05-20
order: 11
---

## Store Layout

Cards-era `drwn` stores local user-managed inventory under:

```text
~/.agents/drwn/
|-- store.json
|-- machine.json
|-- cards/
|-- sources/
|-- skills/
|-- mcp-servers/
|-- generated/
|-- extracted/
|-- catalogs/
|-- catalogs.json
|-- url-card-map.json
`-- global-write-record.json
```

| Path | Purpose |
|---|---|
| `store.json` | Store metadata and schema version |
| `machine.json` | V2 machine Worker selection and immutable lock |
| `cards/` | Per-card bare Git repositories |
| `skills/` | Package-backed skill bundles |
| `mcp-servers/` | User MCP server definitions, one JSON file per server |
| `generated/` | Machine-scope generated files such as Cursor MCP payloads |
| `extracted/` | Content-addressed card materializations keyed by Git tree SHA |
| `catalogs/` | Local clones of Git-backed card catalogs |
| `catalogs.json` | Registered card catalog index |
| `url-card-map.json` | Cached Git URL to card-name mappings for repeat resolution |
| `global-write-record.json` | Machine-scope materialization ownership record |

## Inspect Machine State

```bash
drwn status --machine
drwn status --machine --json
```

Machine status reports the selected Worker root, installed alternatives, active
Card closure, integrity and consent state, projected capabilities, and
projection currentness.

## Hard-Cut Boundary

Machine V2 does not read or migrate prototype profile/default selections. The
supported recovery path is to select a published Blueprint and project it:

```bash
drwn apply --root <blueprint-ref>
drwn write --root
```

Standalone skills and MCP records remain inventory only. Inspect or transfer
them without activating them:

```bash
drwn machine skill list
drwn machine mcp list
drwn machine inventory export --out ./inventory
```

## Project Write Records

Configured projects use their own write record:

```text
<project>/.agents/drwn/write-record.json
```

Machine-scope writes use:

```text
~/.agents/drwn/global-write-record.json
```

Write records let `drwn` remove old drwn-owned materialized paths while
preserving user-owned edits and replacements.
