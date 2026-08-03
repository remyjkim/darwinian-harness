---
sidebar_position: 3
---

# Machine State

The machine state root is `~/.agents/drwn`. It contains strict machine intent,
standalone inventory, published Cards, catalogs, extracted Card
trees, registrations, write records, and credentials. Those categories do not
share one portability policy.

Important paths:

- `~/.agents/drwn/machine.json`: strict V2 selected Worker and embedded closure lock
- `~/.agents/drwn/config.json`: non-secret authoring preferences
- `~/.agents/drwn/skills`: installed package-backed skill bundles
- `~/.agents/drwn/mcp-servers`: user-registered MCP server definitions
- `~/.agents/drwn/cards`: Git-backed published card repositories
- `~/.agents/drwn/extracted`: immutable extracted card trees
- `~/.agents/drwn/catalogs`: local card catalog clones

Editable Card sources live in user-owned repositories, commonly beneath a
configured Card collection such as `~/dev/darwinian-cards/cards/`. The
`catalogCheckouts` preference helps authoring commands find them; runtime
selection never treats those mutable paths as immutable Card content.

Inspect state and plan scoped inventory cleanup:

```bash
drwn status --machine
drwn status --machine --json
drwn doctor
drwn machine inventory gc
```

No public command archives this root wholesale. Treat broad archives produced
by prototype releases as sensitive. Remote deploy uses a separate allowlisted
Card payload. Portable inventory transfer is a separate active-inventory
allowlist, not a Store archive.

```bash
drwn machine inventory export --output ./inventory.json
drwn machine inventory bundle --output ./inventory.tar.gz
drwn machine inventory verify --from ./inventory.tar.gz
drwn machine inventory sync --from ./inventory.tar.gz --dry-run
```

The manifest carries canonical requirements metadata; the bundle adds only
active standalone skill-package and MCP bytes. Verify requires an exact match.
Sync is additive: known conflicts block the operation, extras are preserved,
and installed entries remain inactive. A fresh real sync creates inventory
infrastructure but no `machine.json`; dry-run creates no managed state.

The artifact is not a backup or restore and excludes credentials, intent,
projects, Cards, projections, caches, inactive versions, and tombstones.
Deterministic checksums detect corruption, but a checksum is not authenticity.
Content screening is a source-content safeguard rather than a general secret
detector, so operators must review bundles before sharing them.

Readonly mode is useful for validation against mounted or unpacked snapshots:

```bash
DRWN_STORE_READONLY=1 drwn status --machine
DRWN_STORE_READONLY=1 drwn card source doctor
```

Commands that mutate machine state refuse to write when readonly mode is enabled.
