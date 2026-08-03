---
sidebar_position: 5
---

# Ownership Conflicts

`drwn write` aborts when it detects that a managed field inside `~/.claude/settings.json` (or `~/.codex/config.toml`) has changed since the last write. The error is loud on purpose:

```text
Drift detected in Claude settings managed field(s): mcpServers.
Move your change into .agents/drwn/config.json or rerun drwn write --force to overwrite.
```

This page covers what that means and how to decide between editing your config or passing `--force`.

## What `drwn` is checking

Each managed file embeds a `_drwn` meta block recording the canonical sha256 hash of every managed key at the last write:

```json
{
  "_drwn": {
    "version": 1,
    "managedKeys": ["mcpServers"],
    "fieldHashes": { "mcpServers": "sha256-..." },
    "lastWriteAt": "..."
  }
}
```

On every subsequent write, `mergeClaudeSettingsText` in `cli/core/mcp.ts` recomputes the canonical hash of each managed key on disk and compares it to the recorded hash. A mismatch means somebody — a user, an editor extension, another tool — modified the managed key outside drwn. Canonical hashing sorts object keys recursively before hashing, so reordering or whitespace edits do not register as drift; only meaningful content changes do.

`drwn doctor` runs the same comparison and reports the mismatch as `mcpDrift` without aborting. `drwn write` aborts. The split is by design — see [Diagnostics Model](../concepts/diagnostics-model).

## The `--force` semantics

```bash
drwn write --force
drwn mcp write --force
```

`--force` does exactly one thing: it instructs the merge writer to skip the drift check and overwrite the managed key with the resolved harness state. It does **not** touch user-owned content elsewhere in the file. Anything outside `mcpServers` (Claude) or `[mcp_servers]` (Codex) is preserved through the merge unchanged.

This narrow scope is the whole point. `--force` is not a "trust me, wipe the file" flag; it is "trust me, the drift inside the drwn-managed region is intentional and you should publish over it."

Organization Worker materialization has a separate ownership boundary.
`drwn write --force` cannot establish bundle ownership or repair its vendor,
receipt, record, or tombstone evidence. When
`orgWorkerMaterialization` reports drift, preserve the evidence and use the
exact handoff with `drwn install --reconcile`; use `--remove` only for verified
owned cleanup.

## Decision tree

When `drwn write` aborts, ask one question: was the edit inside the managed region intentional, or did another tool write over us?

### Case 1: the edit was intentional

Somebody (often you) hand-edited `mcpServers` to add or change a server. The right resolution is to move the intent into a layer drwn understands so that the change survives future writes:

```bash
drwn machine mcp add ./my-server.json --as my-server
drwn machine mcp enable my-server
drwn write --dry-run
drwn write
```

If you do not want to migrate the intent and you want drwn to publish over the manual edit, use `--force` after reading the diff:

```bash
drwn write --dry-run
drwn write --force
```

The `--dry-run` step is non-negotiable — `--force` overwrites silently from there.

### Case 2: a tool wrote over us

The most common variant is Claude Code itself, or an editor extension, rewriting `settings.json` and clobbering the `mcpServers` key. The recorded hash no longer matches because the tool put back its own idea of what `mcpServers` should be.

The resolution is the same `--force` workflow, but the reasoning is different: there is nothing to migrate because the on-disk content was not authored by anyone, just regenerated incorrectly. Re-run `drwn write` to publish the canonical state:

```bash
drwn write --dry-run
drwn write --force
```

If this becomes recurrent for a specific tool, that tool's plugin or hook is the right place to fix it — not the `--force` flag.

## What about content outside the managed region

`drwn` does not own permissions, theme, model selection, or any field other than the ones in `managedKeys`. Edits to those land in the merged output unchanged and never trigger a drift report. If a non-managed field of yours has disappeared after a `drwn write`, the cause is somewhere other than ownership conflict — check the numbered `.bak` files drwn writes before each merge.

## Cross-References

- [Ownership and Write Records](../concepts/ownership-and-write-records) for the meta-block and write-record model
- [reference/cli/write](../reference/cli/write) for the full flag surface
- [Reading Doctor](./reading-doctor) for the report-only side of the same check
- [Common Drift](./common-drift) for related symptoms
