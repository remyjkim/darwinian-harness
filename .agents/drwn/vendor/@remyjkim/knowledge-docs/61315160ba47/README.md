# @remyjkim/knowledge-docs

> Keep a codebase's knowledge documentation honest — draft it, audit it, and restructure it against the live code.

## What it does

- **Draft** a complete categorized knowledge-docs directory from scratch by reading the code, with coverage proportional to risk and every claim traceable to a file (`drafting-knowledge-docs`)
- **Audit** existing docs against the codebase to find drift, producing per-doc verdicts, severity, and root-cause analysis (`auditing-knowledge-docs`)
- **Restructure** drifted or disorganized docs into a categorized hierarchy that mirrors the architecture, merging redundancy and preserving detail (`restructuring-knowledge-docs`)

The three skills form a lifecycle: **draft** greenfield docs, **audit** them as the code evolves, and **restructure** once drift is significant.

## Recommended for users who...

- Maintain internal knowledge/reference docs that drift out of sync with the code
- Are onboarding a codebase that has no docs, or reorganizing docs after a major migration or architecture shift
- Want documentation whose structure mirrors the codebase, with claims verified against source rather than inferred

## Installation

> Requires the [drwn CLI](https://darwiniantools.com).

Clone the card to your local store. The `#v<tag>` selector pins to an
explicit Git tag; use the latest tag listed under `## Versions` below:

```sh
drwn card clone github:remyjkim/knowledge-docs#v1.0.0
```

If this is a new project, run `drwn init` first.

Apply the card. The `^1.0.0` range accepts any compatible release; pin to a
strict version (e.g. `@1.0.0`) for reproducible installs:

```sh
drwn card apply @remyjkim/knowledge-docs@^1.0.0
```

## What's included

| Asset | Purpose |
|---|---|
| `drafting-knowledge-docs/SKILL.md` | Draft a full knowledge-docs directory from scratch by reading the code |
| `auditing-knowledge-docs/SKILL.md` | Audit existing docs against the codebase to find and prioritize drift |
| `restructuring-knowledge-docs/SKILL.md` | Reorganize docs into a categorized hierarchy mirroring the architecture |

## Versions

| Version | Notes |
|---|---|
| v1.0.0 | Initial release — drafting, auditing, and restructuring knowledge-docs skills |

---

See the [Darwinian Tools documentation](https://docs.darwiniantools.com) for more information on drwn Mind Cards, installation, version pinning, and project configuration.
