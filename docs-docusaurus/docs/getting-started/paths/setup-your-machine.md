---
sidebar_position: 3
---

# Set Up Your Machine

Set up `drwn` once per machine. Machine capability intent is one selected,
immutable Worker Blueprint closure. Standalone inventory remains available for
inspection and authoring but is not activation authority.

## Prerequisites

- Bun 1.2+
- npm (for the published package and npm-backed skill bundles)
- Node.js (for optional MCP servers that spawn Node processes)

## Install And Inspect

```bash
curl -fsSL https://bun.sh/install | bash
npm install -g darwinian
drwn --version
drwn status --machine --json
drwn machine skill list
drwn machine mcp list
```

Outside a configured project, status reflects machine state. Inventory lists
what is available; it does not say what is active.

## Initialize Machine Intent

Prompt-free setup creates strict empty `drwn.machine` V2 intent:

```bash
drwn init --non-interactive
drwn status --machine --json --explain
```

```json
{
  "schema": "drwn.machine",
  "schemaVersion": 2,
  "policy": {},
  "capabilities": {
    "activeWorker": null,
    "workerLock": null
  }
}
```

Interactive `drwn init` offers the opt-out recommended
`@curation-labs/machine-defaults` Blueprint. If accepted, `activeWorker` stores
the canonical Card name and the embedded lock stores the exact versioned source
and Card integrity. V1/prototype state is rejected without migration.

## Select A Machine Worker

Use immutable Store content, a pinned Git ref, or an explicit integrity-locked
file ref allowed by trusted-source policy:

```bash
drwn apply --root <worker-blueprint-ref>
drwn status --machine --json --explain
```

Use `drwn use --root <name-or-ref> --no-write` to switch among installed roots.
Use `drwn use --root --none --no-write` to clear selection while retaining
alternatives. Mutable `catalogCheckouts` are for authoring and are never runtime
resolution sources.

If the closure declares hooks or instructions, review the exact Card release:

```bash
drwn card trust <card-name> --hooks --scope machine
drwn card trust <card-name> --instructions --scope machine
```

The legacy `drwn machine skill|mcp enable|disable` commands fail with Blueprint
guidance. To change machine capabilities, publish/select a different Blueprint.

## Preview, Then Write

```bash
drwn write --root --dry-run
drwn write --root
```

Machine projection can update user-home skills/MCP config, one generated Worker,
Claude hook fields, `~/.claude/CLAUDE.md`, and `~/.codex/AGENTS.md`. It never
writes `~/AGENTS.md`.

## Verify

```bash
drwn status --machine --json --explain
drwn doctor --json
```

Verify the canonical active root, requested immutable ref, locked closure,
content integrity, consent, and projection ownership. `doctor` is report-only.

If a planned destination exists without a matching global write-record entry,
the write fails with `MACHINE_PROJECTION_CONFLICT`. Do not use force to claim
foreign content. Force repairs only drift in prior drwn-owned state.

Run acceptance tests only with disposable `HOME`, `AGENTS_DIR`, project, and
target paths; never experiment against a real user home.

## Cross-References

- [Machine JSON](../../reference/schemas/machine-json)
- [Machine Inventory](../../reference/cli/machine)
- [Machine State](../../concepts/local-store)
- [MCP Servers](../../concepts/mcp-servers)
- [Override for One Project](./override-one-project)
- [Reading Doctor](../../troubleshooting/reading-doctor)
