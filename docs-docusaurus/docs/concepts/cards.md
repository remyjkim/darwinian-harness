---
sidebar_position: 7
---

# Cards

Cards are versioned harness bundles. They can include skills, MCP server definitions, extension intent, target defaults, and manifest metadata that a project can consume with one ref.

The model separates authoring from consumption:

- Card sources are independent user-owned repositories under an explicit collection such as `~/dev/darwinian-cards/cards/` and are edited by path with `drwn card source`
- published cards live under `~/.agents/drwn/cards/@scope/name.git` with version tags
- projects consume cards through `.agents/drwn/config.json` and lock exact resolutions in `.agents/drwn/card.lock`

Card MCP definitions become definition sources for consuming projects. Optional card MCPs stay inactive until the project enables them, so a card can advertise a credentialed or heavyweight capability without silently changing the user's live agent config.

Common card commands:

```bash
drwn card new @your-handle/backend --into <card-collection> --no-git
drwn card publish --from <card-collection>/backend
drwn card show @your-handle/backend@1.0.0
drwn card validate @your-handle/backend@1.0.0
drwn card diff @your-handle/backend@1.0.0 @your-handle/backend@1.1.0
drwn card deprecate @your-handle/backend@1.0.0
```

Source authoring commands:

```bash
drwn card source show <card-source-path> --json
drwn card source doctor <card-source-path>
drwn card source add-skill <card-source-path> reviewer
drwn card source remove-skill <card-source-path> reviewer --keep-files
drwn card source set <card-source-path> --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
drwn card source add-mcp <card-source-path> context7
drwn card source remove-mcp <card-source-path> context7 --keep-files
```

`~/.agents/drwn/config.json` may store `catalogCheckouts` for unique authoring
lookup, but runtime `apply`/`use` consumes immutable Store content, pinned Git
refs, or explicit digest-locked file refs whose live bytes are re-verified. A
pre-I176 `~/.agents/drwn/sources/` tree is unsupported legacy data.

Project root commands:

```bash
drwn apply @your-handle/backend@^1.0.0
drwn add @your-handle/backend@^1.0.0
drwn pin @your-handle/backend@1.0.0
drwn update
drwn use @your-handle/backend
drwn write --dry-run
```
