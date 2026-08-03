---
sidebar_position: 1
---

# Card Spec

A Card is drwn's independently versioned capability unit. A Blueprint is a Card that composes ordered plain Cards into one Worker root.

## States

| State | Location | Meaning |
| --- | --- | --- |
| Source | `~/.agents/drwn/sources/<scope>/<name>/` | Mutable authoring tree. |
| Published | `~/.agents/drwn/cards/<scope>/<name>.git/` | Immutable Git-backed versions. |
| Extracted | `~/.agents/drwn/extracted/<tree-sha>/` | Content-addressed materialization. |
| Consumed | `<project>/.agents/drwn/card.lock` | Exact root graph and Card provenance. |

## Card Refs

| Form | Example |
| --- | --- |
| Store range | `@your-handle/backend@^1.0.0` |
| Store exact | `@your-handle/backend@1.2.3` |
| File | `file:./cards/backend` |
| Git ref | `git+https://github.com/me/card.git#v1.2.0` |
| Git range | `git+https://github.com/me/card.git@^1.0.0` |
| GitHub | `github:me/card@^1.0.0` |
| GitLab | `gitlab:me/card#v1.2.0` |

Git URLs without a ref/range fail. GitHub/GitLab shorthands expand to HTTPS Git URLs. Git authentication remains owned by Git.

## Card Manifest

Every Card has a validated `card.json` containing at least:

```json
{
  "name": "@your-handle/backend",
  "version": "1.2.0"
}
```

Cards may include skills, MCP definitions, hook policies, persona, beliefs, memory, instructions, extensions, target intent, governance, and quality metadata.

A Blueprint adds:

```json
{
  "kind": "blueprint",
  "composedFrom": [
    "@your-handle/review@^1.0.0",
    "@your-handle/testing@^1.0.0"
  ]
}
```

Blueprint members are ordered plain Cards. Nested Blueprints are rejected in the first supported contract.

## Project Lock V1

`<project>/.agents/drwn/card.lock` is self-identifying:

```json
{
  "schema": "drwn.project-lock",
  "schemaVersion": 1,
  "store": { "minDrwnVersion": "0.8.0" },
  "workerRoots": [
    {
      "name": "@your-handle/operator",
      "requested": "@your-handle/operator@^1.0.0",
      "kind": "blueprint",
      "members": ["@your-handle/review", "@your-handle/testing"]
    }
  ],
  "cards": []
}
```

### Root Fields

| Field | Meaning |
| --- | --- |
| `name` | Canonical root Card name. |
| `requested` | Requirement ref from project config. |
| `kind` | `card` or `blueprint`. |
| `members` | Ordered direct member Card names; empty for a plain Card root. |

### Card Entry Fields

Each `cards` entry contains:

| Field | Meaning |
| --- | --- |
| `name` / `requested` / `version` | Artifact identity and requirement provenance. |
| `path` | Current local extracted/content path. |
| `integrity` | Canonical `sha256-...` tree integrity. |
| `treeSha` | Git tree SHA for Store/Git artifacts. |
| `manifest` | Full validated Card manifest. |
| `skills` / `hooks` | Locked capability indexes. |
| `persona` / `beliefs` / `memory` | Locked Mind declarations when present. |
| `hookConsent` | Optional Card/version-range hook consent. |
| `instructionConsent` | Optional exact-content and version-range instruction consent. |
| `origin` | `store`, `git`, `file`, or `npm`. |
| `git` | Commit and optional URL/ref for Store/Git origins. |
| `registry` | Reserved; currently `null`. |

Every root and member must map to one Card entry. Orphan Cards, duplicate roots/members, root/member identity overlap, missing tree provenance, and incompatible same-name artifacts fail validation.

## Integrity

`computeCardIntegrity` walks regular files, excluding `.git` and `.integrity`, and hashes canonical sorted records of:

- relative path;
- executable-bit class;
- SHA-256 of file bytes.

The final value is `sha256-` plus the hash of the canonical JSON record array. This makes integrity sensitive to content, path, and executable state but not mtime/ownership.

## Project Projection

Project config lists Worker roots and one selection. The selected root expands through the lock:

```text
selected Blueprint root -> root Card -> ordered member Cards
```

Only that closure contributes Card capabilities. Explicit project `skills`, `mcpServers`, `hooks`, `extensions`, and `targets` remain project-owned overlays. Machine capabilities are not project declarations.

## Local Development

`.agents/drwn/config.local.json` uses `drwn.project-local` V1 for replacements, local-only roots, source overrides, and local selection. `.agents/drwn/card.lock.local` uses the same project-lock V1 graph. Local state is ignored and does not rewrite committed intent.

## Security

- Card content never includes resolved environment secrets, API keys, or OAuth tokens.
- Hook code requires explicit Card/version-range consent before materialization.
- Notion OAuth and external stdio tool installation remain operator state.
- Whole-Store export is disabled; deploy exports only one pinned closure through a separate allowlist.

## Related

- [Card Manifest](../schemas/card-manifest)
- [Project Config JSON](../schemas/project-config-json)
- [Cards](../../concepts/cards)
- [Local Store](../../concepts/local-store)
