---
sidebar_position: 2
---

# Project Config JSON

Path: `<project>/.agents/drwn/config.json`.

The first supported schema is:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": ["@team/operator@^1.0.0"],
  "activeWorker": "@team/operator"
}
```

## Required Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | `"drwn.project-config"` | Record identity. |
| `schemaVersion` | `1` | Local schema version. |
| `workers` | `string[]` | Ordered root requirement refs. |
| `activeWorker` | `string \| null` | One installed canonical root name or explicit no selection. |

Roots are plain Cards or Blueprints. Blueprint members are recorded in `card.lock`, not repeated as roots.

## Optional Fields

| Field | Meaning |
| --- | --- |
| `materialization` | `vendored` or `linked`. |
| `committedSurfaces` | Whether managed project surfaces are expected to be committed. |
| `mcpServers` | Project MCP toggles or complete definitions. |
| `skills.include` / `skills.exclude` | Explicit project skill overlays. |
| `hooks` | Exclusions, runtime selection, and session signals. |
| `extensions` | Semantic extension choices such as Parallel, Beads, and MarkItDown. |
| `targets` | Per-project Claude/Codex/Cursor enablement. |
| `trustedSources` | Project source trust policy. |

Unknown fields, wrong schema identity/version, missing required selection, and malformed overlays fail with `PROJECT_CONFIG_INVALID` before mutation.

## Mutation

Use:

```bash
drwn add <root-ref>
drwn apply <root-ref>... --active <root-name>
drwn remove <root-name>
drwn pin <root-ref>
drwn update [root-name]
drwn use <root-name-or-ref>
drwn use --none
```

Root mutations commit config and lock together. Write modes project state but never mutate this file.

## Local Overlay

Ignored development state belongs in `.agents/drwn/config.local.json`:

```json
{
  "schema": "drwn.project-local",
  "schemaVersion": 1,
  "activeWorker": "@team/operator",
  "cardReplacements": {},
  "localOnlyRoots": [],
  "sourceOverrides": {}
}
```

Status attributes local and committed sources separately.

## Capability Scope

Project capabilities come from the selected root closure plus explicit project
overlays. The machine Worker closure does not become a project declaration.
User-home target state may remain ambient and is reported separately.

## Related

- [Card Spec](../specs/card-spec)
- [Cards](../../concepts/cards)
- [Write](../cli/write)
