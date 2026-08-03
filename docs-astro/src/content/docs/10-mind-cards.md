---
title: "Mind Cards"
description: "Author, publish, apply, and update reusable project mind cards."
date: 2026-05-20
order: 10
---

## What Cards Are

Mind Cards are versioned bundles of project harness intent. A card can
include skills, MCP server definitions, extension settings, target settings,
and metadata.

A project records requested cards in:

```text
<project>/.agents/drwn/config.json
```

Exact resolved versions are written to:

```text
<project>/.agents/drwn/card.lock
```

`drwn write` then materializes the resolved project state into project-local
Claude, Codex, and Cursor files.

## Author A Card

Create an editable source:

```bash
drwn card new @me/backend --into <card-collection> --no-git
drwn card new backend --scope @me --into <card-collection> --no-git
```

Card sources are independent repositories under an explicit collection:

```text
<card-collection>/
```

Each source contains `card.json`, `skills/`, and `mcp-servers/`.

Capture a working project as a card:

```bash
cd your-project
drwn card new @me/project-harness --from-project . --no-git
```

Capture writes a self-contained source with the project's effective skills,
active MCP servers, extensions, and target settings. It preserves environment
variable references in MCP definitions but does not read host secret values into
the card.

Publish a version:

```bash
drwn card publish --from <card-collection>/backend
```

Published card versions are immutable Git tags in per-card bare repos under:

```text
~/.agents/drwn/cards/
```

Card manifests can also expose optional quality signals:

```json
{
  "stability": "stable",
  "lastValidatedWith": "0.1.0",
  "testStatusBadge": "https://example.com/status.svg"
}
```

`drwn card show` surfaces those fields for consumers. `skills.shared` remains
reserved; use `skills.include` with bundled skill directories for now.

## Inspect Cards

```bash
drwn card list
drwn card list --json
drwn card show @me/backend@1.0.0
drwn card show @me/backend@^1.0.0 --json
drwn card diff @me/backend@1.0.0 @me/backend@1.1.0
drwn card deprecate @me/backend@1.0.0 --message "use 1.1.0"
```

Version ranges use normal semver range behavior. `drwn` resolves the highest
published local version that satisfies the requested range.

Git URL card refs cache discovered URL-to-card-name mappings in
`~/.agents/drwn/url-card-map.json`. The cache is an optimization only; stale or
corrupt entries are corrected or ignored.

## Apply Cards To A Project

From the project root:

```bash
drwn init
drwn apply @me/backend@^1.0.0
drwn write --dry-run
drwn write
```

`drwn apply` is an alias for `drwn card apply`. It replaces the current
project's card set and writes a fresh lockfile.

Project mutation commands:

```bash
drwn card apply @me/backend@^1.0.0
drwn card add @me/observability@^1.0.0
drwn card pin @me/backend@1.0.0
drwn card remove @me/observability
drwn card detach
drwn card update
drwn update
```

Use `--write` with mutation commands when you want to materialize immediately:

```bash
drwn card add @me/observability@^1.0.0 --write
drwn update --write
```

## Local Development Refs

Use `file:` refs while developing a card before publishing it:

```bash
drwn apply file:../cards/backend
drwn write --dry-run
```

File refs resolve from the local path and still write `card.lock` for the
project.

## Updates And CI

Check for newer local versions:

```bash
drwn card outdated
drwn card outdated --check
```

`--check` exits non-zero when updates are available, which makes it suitable
for CI.

Update the lockfile within configured ranges:

```bash
drwn card update
drwn card update --write
```

## Status

```bash
drwn card status
drwn card status --json
drwn card status --explain
drwn status --why card:@me/backend
```

Use card status when you need the current configured refs, locked versions, and
available updates. Use general status provenance when you need to see how cards
affect skills, MCP servers, targets, and write records.
