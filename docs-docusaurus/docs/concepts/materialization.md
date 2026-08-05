---
sidebar_position: 7
---

# Materialization

Materialization is the second half of `drwn write`: resolving the effective harness, then applying it to downstream agent tool directories with explicit ownership. The first half is the layered config model; this page covers how the resolved state actually reaches Claude, Codex, and Cursor (deprecated) on disk.

## The Five-Layer Model

Every materialization run composes effective harness state from up to five surfaces, in precedence order:

- packaged policy and available built-in skills/MCP definitions
- standalone inventory: package-backed skill bundles under `~/.agents/drwn/skills` and user MCP definitions under `~/.agents/drwn/mcp-servers`
- explicit machine intent: one selected immutable Worker closure in strict `drwn.machine` V2
- project intent: one selected Worker closure plus explicit overlays in strict project V1
- downstream state: Claude, Codex, Cursor config files plus generated MCP configs

Machine and project evaluation are separate. Inside a configured project,
the machine Worker never contributes to declared state. User-home output can
remain ambient in a downstream session and is diagnosed separately.

## The Resolved-State Engine

`buildEffectiveState` is the single function every command consults before reading or writing. It returns:

- the as-written shapes (`repoConfig`, `projectConfig`, `lockedCards`)
- the as-active shapes (`effectiveConfig`, `effectiveRegistry`, `activeServers`, `skillSelection`)
- the target scope (`scopeRoot`, `writeScope` of `project` or `machine`, `generatedDir`, `recordPath`)

The separation between as-written and as-active is load-bearing. Every command renders one or the other and never re-derives the merge itself. That keeps `status`, `doctor`, and `write` consistent about what they call "effective."

## Materialization Mechanisms

`drwn write` uses mechanisms chosen per target:

- **Copied directories** for selected skills. Each copied directory is recorded as a `managed-directory` entry.
- **Per-server managed fields** for machine MCP projection. Claude, Codex, and Cursor record hashes for only the server IDs drwn owns, preserving unrelated fields and siblings.
- **Project-owned target files** for project projection, with target-specific merge behavior and a project write record.
- **Generated aggregate Workers** for the selected root closure.
- **Managed instruction blocks** in project or harness-specific machine adapters.
- **Managed hook/settings fields** for consented hook projection.

See [Ownership and Write Records](./ownership-and-write-records) for how these variants are recorded and cleaned up.

## Common Flags

Preview before mutating:

```bash
drwn write --dry-run
drwn write --dry-run --json
```

Run only one side:

```bash
drwn write --mcp-only
drwn write --skills-only
```

Limit to a single target:

```bash
drwn write --target=claude
drwn mcp write --target=cursor
```

`--force` is for replacing drift inside paths drwn already owns. It is not a general cleanup flag for user-managed files.

See [reference/cli/write](../reference/cli/write) for the full flag surface.

## Card-Overlay Wins Rule

Card-bundled skill content is authoritative inside the selected Worker closure. A selected Card's extracted copy wins over any same-named repo-native or package-backed source. There is no merge semantic: the returned path is single-source.

`drwn write --dry-run` annotates each planned skill copy with the winning resolution layer. When another inventory source could have provided the same skill, the dry run records it as `also available:`:

```text
skills/inspect-worker from card foo@1.0.0 (also available: installed inventory)
```

If a Card's `skills.include` names content its immutable extraction cannot resolve, resolution returns `missing` with an actionable reason. drwn does not silently fall through to another source on a corrupt Card store.

## Unresolved-Skill Hard Fail

`drwn write` resolves every requested `skills.include` up front. If any include is unresolvable, the run fails **before** touching the filesystem:

```text
drwn write cannot resolve all skills:
  - <name>: <reason>
```

This is a write-time contract. `drwn doctor` reports the same condition as a diagnostic without mutating state — see [Diagnostics Model](./diagnostics-model).

## Cross-References

- [Cards](./cards) for what a card contributes to the resolved state
- [Ownership and Write Records](./ownership-and-write-records) for how managed paths are recorded
- [reference/cli/write](../reference/cli/write) for command-line surface
