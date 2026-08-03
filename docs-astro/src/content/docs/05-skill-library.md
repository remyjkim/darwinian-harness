---
title: "Skill Library"
description: "Built-in skills, project selection, machine Worker closures, and package-backed bundles."
date: 2026-04-28
order: 5
---

## Built-In Skills

Built-in skills live in four directories:

- `skills/shared` — available to all agent tools
- `skills/claude-only` — applied only to Claude Code
- `skills/codex-only` — applied only to Codex
- `skills/experimental` — not applied by default

## Machine Worker Selection

Typical flow:

```bash
drwn machine skill list
drwn apply --root <worker-blueprint-ref>
drwn write --root --skills-only --dry-run
drwn write --root --skills-only
```

The selected immutable Card closure writes strict machine intent. Projection is
a separate, ownership-recorded step; standalone inventory IDs are never machine
activation authority.

## Package-Backed Skill Bundles

`darwinian` supports package-backed skill bundles for skills that should be available without being added to the built-in first-party tree.

Typical flow:

```bash
drwn machine skill install <npm-package-or-local-path>
drwn machine skill list
drwn machine skill show <skillName>
drwn add skill <skillName>
drwn write --dry-run
drwn write
```

To use installed bytes in machine sessions, copy/review them into a Card source,
publish it, and select a Blueprint containing that Card:

```bash
drwn machine skill install <npm-package-or-local-path>
drwn card source add-skill <card-source> <skillName> --from <skill-directory>
drwn apply --root <published-blueprint-ref>
```

## Added vs. Selected vs. Written

The distinction matters:

- **Added** — the bundle is available under `~/.agents/drwn/skills` in the cards-era store
- **Project-selected** — project intent names the skill or its selected closure owns it
- **Machine-active** — the selected machine Blueprint closure owns it
- **Written** — selected bytes are copied into owned downstream tool directories

Package-backed bundles use the current `~/.agents/drwn/skills` store path.
