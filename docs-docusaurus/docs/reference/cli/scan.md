---
sidebar_position: 6
---

# Scan

`drwn scan` is a reserved placeholder for a future non-mutating local harness discovery surface. Today it is a safe no-op that exits cleanly and reports its planned role.

Run it to see the current placeholder status:

```bash
drwn scan
drwn scan --json
```

Text output enumerates the planned role; JSON output returns:

```json
{
  "implemented": false,
  "changes": [],
  "plannedRole": [
    "inspect existing local agent tool config",
    "report import candidates for machine inventory, machine Worker selection, and project config",
    "avoid writing files unless a future explicit import/write step is added"
  ],
  "message": "drwn scan is not implemented yet."
}
```

## Planned role

When implemented, `drwn scan` will:

- inspect existing local agent tool config (Claude, Codex, Cursor, MCP) without mutating any files
- report import candidates for machine inventory, machine Worker selection, or current project overlays
- remain non-mutating by construction — the eventual import/promotion step will be a separate explicit command

## What it does today

Nothing. The command has no filesystem-mutation imports — read-only by construction (`cli/commands/scan.ts`). Do not rely on it for any current discovery use case. For inspection today, use:

- [`drwn status`](./status) — effective harness summary
- [`drwn mcp list`](./mcp) — active MCP state
- [`drwn machine skill list`](./machine) — available standalone skill inventory
- [`drwn doctor`](./doctor) — drift, broken links, and project config issues
