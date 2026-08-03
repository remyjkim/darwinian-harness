---
sidebar_position: 13
---

# Doctor

`drwn doctor` reports drift, broken links, missing generated files, and project-config issues without mutating anything. It is the read-only counterpart to `drwn write`.

Run a health check:

```bash
drwn doctor
drwn doctor --json
```

`drwn doctor` is project-aware: when run inside a configured project, the report scopes to that project's write record, generated dir, and overlay. Outside a project, the report is machine-scoped.

## What it surfaces

| Category | Detail |
|---|---|
| Broken or missing skill entries | drwn-owned skill entries in downstream skill directories whose content no longer exists |
| Stale skill entries | prior-owned downstream skill entries that no longer correspond to selected machine or project skills |
| MCP drift | Per-target managed-content drift across Claude / Codex / Cursor, comparing recorded vs recomputed hashes for each managed field |
| Hook issues | A locked card declares hook policies but no hook consent has been recorded via `drwn card trust` |
| Instruction delivery | Consent, root `AGENTS.md` block identity/ownership, and Claude adapter state without instruction text |
| Project config — unknown server | `mcpServers` references a server that is neither in the registry, standalone MCP inventory, nor the selected Worker closure |
| Project config — unknown skill | `skills.include` (or `extensions.<name>` derivations) references a skill that does not resolve in any layer |
| Project config — unknown extension | `extensions.<name>` references an extension drwn does not know |
| Project config — stale target override | `targets.<name>` references a target drwn does not know |
| Project config — invalid Worker root | A configured root cannot be parsed or matched against `card.lock` |
| Project config — unresolved Card refs | A locked Card cannot be materialized from its immutable extraction |
| Card manifest — unavailable skill | A consumed card's manifest references a skill name that does not resolve under the effective state |
| Machine capability issues | Invalid explicit IDs or missing/changed pinned profile bytes |
| Machine projection conflicts | Foreign destinations or drift in prior-owned state; report-only |
| Store + write-record status | Store schema version, card count, and last-write record presence/corruption |

## Report-only by design

`drwn doctor` never mutates files. It is safe to run anywhere, including under `DRWN_STORE_READONLY=1`.

Project JSON diagnostics include `instructionDelivery`. Block malformation,
stale content/identity, missing consent, and ownership drift are errors that
make doctor unhealthy. A missing or drifted Claude adapter is advisory or a
warning unless canonical `AGENTS.md` delivery itself is blocked.

The unresolved `skills.include` case is split across two surfaces:

- `drwn write` fails before any downstream mutation when a `skills.include` name does not resolve — this is a hard write-time contract.
- `drwn doctor` reports the same condition as a diagnostic, so operators can see it without attempting a write.

## Related

- [Status](./status) — effective harness summary (use `--why` to trace why something is active)
- [Write](./write) — the mutating counterpart; `--dry-run` previews the same writes doctor reports drift against
- [Extensions doctor](./extensions) — extension-specific diagnostics (Parallel, Beads, MarkItDown)
- [Machine Inventory](./machine) — standalone package, MCP record, reference, and GC behavior
