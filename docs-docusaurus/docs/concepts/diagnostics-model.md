---
sidebar_position: 9
---

# Diagnostics Model

`drwn doctor` and `drwn status` share one diagnostics engine. Both are report-only: they never mutate the store, downstream tool config, or write records. This page covers what each command checks, how they overlap with the write pipeline's hard-fail contracts, and where to look when something looks wrong.

## Doctor: Report-Only Across Five Detector Categories

`drwn doctor` runs every detector and renders a structured report:

```bash
drwn doctor
drwn doctor --json
```

The categories surfaced:

- **Broken skill entries** in downstream skill directories — drwn-owned entries whose content no longer exists
- **Stale downstream skill entries** — drwn-owned skill entries that no longer correspond to any active skill
- **MCP drift** in Claude `settings.json`, Codex `config.toml`, or Cursor `mcp.json` — the managed content has been modified outside drwn
- **Hook issues** — a locked card declares hook policies but no hook consent has been recorded via `drwn card trust`. `drwn write` will not materialize hooks until consent is granted.
- **Instruction delivery** — consent, root `AGENTS.md` block state and ownership, and Claude adapter state without exposing instruction text.
- **Project config issues** — invalid Worker roots or selection, unknown `mcpServers`, unknown skills in `skills.include`, unknown extensions, stale target overrides, and unavailable selected-closure skills

`doctor` reports issues. It never fixes them. The intent is that an operator (or an agent following a skill) reads doctor output, decides what to do, and then runs the right command (`drwn write`, `drwn update`, `drwn machine skill disable`, and so on).

See [reference/cli/doctor](../reference/cli/doctor) for the command surface and [troubleshooting/reading-doctor](../troubleshooting/reading-doctor) for how to triage common output.

### Hook issues

`hookIssues` fires when a locked card declares hook policies (in its `card.lock` entry) but no hook consent has been recorded for that card. `drwn write` will skip hook materialization for the card until consent is granted.

Resolve by reviewing and trusting the card's hooks:

```bash
drwn card trust @your-handle/backend --hooks
drwn write
```

Use `--range` to scope consent to a specific semver range. `drwn card untrust @your-handle/backend` revokes consent.

### Instruction delivery

Project status adds `instructionDelivery` with `absent`, `current`, `drifted`,
or `blocked` state; content/ownership identities; Claude adapter state; and
stable issue codes. Errors make `drwn doctor` unhealthy. Adapter warnings and
advisories remain non-fatal.

Resolve missing consent by reviewing the exact explicit contribution and
running:

```bash
drwn card trust @your-handle/backend --instructions
drwn write
```

Do not repair ownership drift by deleting user content. Inspect the marked
region and write record first; `--force` can replace only a recorded owned
block.

## Status: As-Written vs As-Active, Plus Provenance

`drwn status` has three modes:

```bash
drwn status
drwn status --explain
drwn status --why <name>
```

- Default mode renders concise per-target and per-source counts plus the full diagnostics sections in JSON form.
- `--explain` adds a human-readable explanation of the same sections.
- `--why <name>` answers a provenance question: which layer (Card, project overlay, machine profile or explicit selection, packaged registry) is making this skill, server, extension, or Card active.

`--why` is the right command before a write when an operator is unsure why a given skill or server is appearing in the effective state. It is the inverse of `doctor`: doctor surfaces problems, `--why` explains decisions.

See [reference/cli/status](../reference/cli/status) for flag details.

## The Write-Time vs Doctor-Report Split

`skills.include` is the canonical example of how the two surfaces relate:

- At write time, an unresolved `skills.include` name **fails** the run before any filesystem mutation. `drwn write` refuses to leave the project half-applied.
- At report time, `drwn doctor` surfaces the same condition as a project-config diagnostic and returns normally so the rest of the report still renders.

This split is deliberate. Materialization must be all-or-nothing for skills; diagnostics must always finish so the operator gets a complete picture.

The same pattern applies to other write-time invariants (corrupt card store, integrity mismatch, name collision): `write` and `install` raise typed errors; `doctor` and `status` surface them as diagnostics.

## Managed-Field Drift Detection

The `_drwn` meta block written into Claude `settings.json` and Codex `config.toml` is how diagnostics know whether a user has hand-edited drwn-managed content.

The block contains:

```json
{
  "version": 1,
  "managedKeys": ["mcpServers"],
  "fieldHashes": { "mcpServers": "sha256-..." },
  "lastWriteAt": "..."
}
```

On each write, drwn parses the current file, reads the prior `_drwn` block, recomputes the canonical hash of each managed key, and aborts the merge if any recorded hash diverges (unless `--force` is passed). `doctor` runs the same comparison and reports the divergence as MCP drift without aborting anything.

Canonical hashing sorts object keys recursively before sha256 so semantically equivalent edits — reordered keys, whitespace differences — do not register as drift. Only meaningful content changes trigger the report.

Cursor's standalone JSON format means drwn owns the whole file as `managed-content`. There is no meta block; doctor instead reports `mcpDrift` when the written content no longer matches the recorded hash.

## Machine State and Write Record Diagnostics

Both `doctor` and `status --explain` include:

- machine-state status: schema version, Card count, source count, skill-package count, and MCP-record count
- write-record status: presence, corruption, managed-path count, last write timestamp, and the harness version that produced the last write

A missing write record is normal on a fresh project; a corrupt one is reported so the operator can decide whether to delete it and re-run `drwn write`.

## Cross-References

- [reference/cli/doctor](../reference/cli/doctor) for the command surface
- [reference/cli/status](../reference/cli/status) for status modes
- [troubleshooting/reading-doctor](../troubleshooting/reading-doctor) for triage
- [Ownership and Write Records](./ownership-and-write-records) for the meta-block and ledger model
