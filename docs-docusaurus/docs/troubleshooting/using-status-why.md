---
sidebar_position: 2
---

# Using `status --why`

`drwn status --why <query>` answers a provenance question: which selected Card closure, project overlay, inventory source, or registry entry explains the item.

The query is either `kind:name` (typed) or a bare `name` (untyped, ambiguous-resolution allowed).

```bash
drwn status --why skill:<name>
drwn status --why server:<name>
drwn status --why extension:<name>
drwn status --why target:<name>
drwn status --why card:<name>
drwn status --why <name>
```

## Per-Form Output

Each typed form returns a one-line provenance message.

### `--why skill:<name>`

```bash
drwn status --why skill:reviewer
```

Possible answers:

- `skill:reviewer is active or available from card @your-handle/backend@0.2.0.`
- `skill:reviewer is active or available from project config.`
- `skill:reviewer is active from machine card @curation-labs/workflow-skills@1.2.0.`
- `skill:reviewer is active or available from repo or installed skill inventory.`
- `not found: skill:reviewer`

For project writes, Card-bundled skills in the selected Worker closure win over
project-safe inventory sources. For machine writes, only the selected,
integrity-verified Card closure activates skills; standalone inventory is merely
available.

### `--why server:<name>`

```bash
drwn status --why server:context7
```

Possible answers:

- `server:context7 is active from card @your-handle/backend@0.2.0.`
- `server:context7 is available from project config.`
- `server:context7 is active from registry or standalone machine inventory.`

`active` means the server is included in the effective `mcpServers` after merging toggles. `available` means it is registered somewhere but currently disabled.

### `--why extension:<name>`

```bash
drwn status --why extension:parallel
```

Possible answers:

- `extension:parallel is known from project config.`
- `extension:parallel is known from extension registry.`

Project-config presence means `<project>/.agents/drwn/config.json` has an `extensions.parallel` block. Extension-registry presence means `drwn` knows the extension type but no project has opted into it.

### `--why target:<name>`

```bash
drwn status --why target:claude
drwn status --why target:codex
drwn status --why target:cursor
```

Answers report enabled/disabled state and which layer is responsible:

- `target:claude is enabled by machine config.`
- `target:cursor is disabled by project config.`

### `--why card:<name>`

```bash
drwn status --why card:@your-handle/backend
```

Returns the locked version and the requested ref:

- `card:@your-handle/backend is locked at 0.2.0 from @your-handle/backend@^0.2.0.`

If the project does not consume the card, returns `not found: card:@your-handle/backend`.

## Disambiguating Untyped Queries

A bare `name` searches every category. If more than one kind matches the same name, `drwn` refuses to guess:

```bash
drwn status --why parallel
```

```text
ambiguous: parallel matched extension:parallel, server:parallel-web-search
```

Re-run with the typed form (`drwn status --why extension:parallel`) to pick the layer you mean.

## Common Workflows

Before a write, when an unexpected item is about to be materialized:

```bash
drwn status
drwn status --why skill:<unexpected-skill>
drwn write --dry-run
```

After `drwn doctor` flags a `projectConfigIssues` entry, trace where the reference is coming from:

```bash
drwn doctor --json
drwn status --why skill:<the-unresolved-name>
```

When a card update changes effective state, compare before and after:

```bash
drwn card outdated
drwn status --why card:@your-handle/backend
drwn update --dry-run
```

## Cross-References

- [reference/cli/status](../reference/cli/status) for the full command surface
- [Diagnostics Model](../concepts/diagnostics-model) for the `doctor` / `status` split
- [Reading Doctor](./reading-doctor) for the report categories that often prompt a `--why` follow-up
