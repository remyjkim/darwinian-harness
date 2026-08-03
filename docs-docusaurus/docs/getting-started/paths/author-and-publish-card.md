---
sidebar_position: 5
---

# Author and Publish a Card

Cards let you package reusable harness intent, skills, MCP definitions, and metadata as a versioned unit. The authoring flow has three states:

- source: an independent editable repository under an explicit Card collection
- published card: immutable Git-backed releases under `~/.agents/drwn/cards`
- consumed card: a project ref in `.agents/drwn/config.json` plus a locked resolution in `.agents/drwn/card.lock`

Create a source:

```bash
drwn card new @your-handle/backend --into <card-collection> --no-git
drwn card source show <card-collection>/backend
drwn card source doctor <card-collection>/backend
```

Add local content before publishing:

```bash
drwn card source add-skill <card-collection>/backend reviewer --from ./skills/reviewer
drwn card source add-mcp <card-collection>/backend context7
drwn card source set <card-collection>/backend --description "Backend review harness" --version 0.1.0
drwn card source set <card-collection>/backend --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
```

Publish and inspect the release:

```bash
drwn card publish --from <card-collection>/backend
drwn card show @your-handle/backend@0.1.0
drwn card validate @your-handle/backend@0.1.0
```

Use `DRWN_STORE_READONLY=1` when validating a store snapshot. Source inspection and dry runs continue to work, while commands that would mutate source files or publish releases fail before writing.
