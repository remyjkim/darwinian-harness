---
sidebar_position: 5
---

# MCP Servers

MCP servers are reusable tool definitions that `drwn` can attach to Cards or projects and write into downstream agent tool configs.

Built-in definitions come from the harness registry. User inventory definitions live under `~/.agents/drwn/mcp-servers`. Card-declared definitions come from the selected project or machine Worker closure. Machine V2 has no bare MCP-ID selection; project choices live in `.agents/drwn/config.json`.

Inspect active MCP state:

```bash
drwn mcp list
drwn mcp list --json
drwn doctor
```

Register reusable inventory, then add a reviewed definition to a Card or project:

```bash
drwn machine mcp add ./context7.json --as context7
drwn machine mcp list
drwn card source add-mcp <card-source> context7 --from ./context7.json
drwn apply --root <published-blueprint-ref>
```

Attach MCP servers to a card source:

```bash
drwn card source add-mcp @your-handle/backend context7
drwn card source add-mcp @your-handle/backend context7 --from ./context7.json
drwn card source remove-mcp @your-handle/backend context7
drwn card source doctor @your-handle/backend
```

Card-local MCP definitions do not have to be standalone inventory records. If a Card ships a definition with `optional: true`, consuming the Card does not activate that server immediately. `drwn write` reports the skipped optional MCP, and the project can opt in with:

```bash
drwn add mcp context7
```

Write the effective MCP config:

```bash
drwn mcp write --dry-run
drwn mcp write
drwn write --mcp-only
```

Standalone inventory remains inactive at machine scope. The retired machine MCP
enable/disable commands fail with Blueprint guidance.
