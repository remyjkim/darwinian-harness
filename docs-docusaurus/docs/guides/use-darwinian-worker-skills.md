---
sidebar_position: 5
---

# Use Darwinian Minds Skills

Darwinian Minds Skills is the workflow skill pack for operating `drwn` from
agent runtimes. Install it when you want agents to follow the same inspect,
dry-run, approval, mutation, and verification sequence you would use manually.

The full skill bodies live in the
[darwinian-worker-skills](https://github.com/remyjkim/darwinian-worker-skills)
repo. This page covers installation, activation, and choosing the right skill.

## Install The Bundle

Install from GitHub:

```bash
drwn machine skill install github:remyjkim/darwinian-worker-skills
drwn machine skill show --package darwinian-worker-skills
```

For local development, install from a checkout:

```bash
git clone git@github.com:remyjkim/darwinian-worker-skills.git
drwn machine skill install ./darwinian-worker-skills
drwn machine skill show --package darwinian-worker-skills
```

Installing a bundle makes its skills available. It does not activate them in a
project and does not select them for machine scope.

## Add One Skill To A Project

Inside a project:

```bash
drwn init --non-interactive
drwn add skill inspect-harness --dry-run --json
drwn add skill inspect-harness
drwn write --dry-run
```

Use `drwn write` only after the dry run shows the downstream changes you expect.

## Use The Operator Card At Machine Scope

Machine capabilities come from one immutable Blueprint closure. Select a
Blueprint that includes the current `@darwinian/operator` Card; projects remain
independent:

```bash
drwn apply --root <blueprint-ref-containing-operator>
drwn write --root --dry-run
drwn write --root
```

Installing the npm bundle alone is inventory, not machine activation. The
retired machine skill enable/disable commands fail with Blueprint guidance.

## Use The Stable Card During Development

The skills repo also ships a stable Mind Card source. From a checkout:

```bash
drwn apply file:/path/to/darwinian-worker-skills/cards/harness-skills
drwn write --dry-run
```

Use the card when a project should carry a locked harness baseline. Use the
package-backed bundle when you only need the workflow skills available for
selection.

## Choose The Right Skill

| User ask | Skill |
| --- | --- |
| Set up this repo | `bootstrap-project` |
| I cloned this repo and it has `card.lock` | `bootstrap-project` |
| Apply or update a project Worker | `manage-project-worker` |
| Create or publish a Card | `author-card` |
| Push, fetch, or clone a Card through Git | `share-card` |
| Install a bundle or MCP inventory record | `manage-machine-inventory` |
| Select/trust/project a machine Worker | `manage-machine-capabilities` |
| Explain current state or provenance | `inspect-worker` |
| Fix projection drift or inventory-reference issues | `repair-worker` |

`organize-workspace` is experimental and should not be treated as a stable
workflow until `drwn scan` is implemented.

## Keep Procedures Canonical

Do not copy entire `SKILL.md` bodies into project docs. The skills repo is the
canonical source for exact agent procedures. Docusaurus should explain how to
install, activate, and choose the skills.
