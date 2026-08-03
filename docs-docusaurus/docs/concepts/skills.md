---
sidebar_position: 4
---

# Skills

Skills are agent instructions (`SKILL.md`) plus optional supporting files that `drwn` resolves, selects, and projects into downstream tool directories (`~/.claude/skills`, `~/.codex/skills`, project-scope equivalents).

## Skill scopes

Built-in repo-native skills live under one of four scope directories:

- `skills/shared` — eligible for both Claude and Codex
- `skills/claude-only` — eligible only for Claude Code
- `skills/codex-only` — eligible only for Codex
- `skills/experimental` — available only when explicitly selected

Scope limits projection targets. It does not activate a skill.

## Where skills come from

`drwn` resolves a skill name against these layers, in this order:

1. **Selected Card closure** — a Card in the active project or machine Worker whose manifest declares the skill. Card-bundled skills are authoritative for that closure.
2. **Repo-native** — the four scope directories above, in order `shared` → `claude-only` → `codex-only` → `experimental`.
3. **Package-backed bundles** — installed via `drwn machine skill install`; live under `~/.agents/drwn/skills/<package>/<version>/` with a regular `current` pointer file naming the active version.
4. **Missing** — surfaces as a typed write-time hard fail before any downstream mutation.

There is no scope-based promotion between repo-native and bundle sources; first match wins. Cards are the only layer that can shadow other sources at write time.

## Selection

Machine activation comes only from Cards in the selected immutable Worker
closure under strict `drwn.machine` V2:

```bash
drwn apply --root <worker-blueprint-ref>
drwn write --root --skills-only --dry-run
drwn write --root --skills-only
```

Project selection comes from the selected Worker closure plus explicit project overlays. Use `drwn add skill <name>` for a project-only declaration.

Standalone inventory, mutable authoring checkouts, ambient directories, and
existing target output are never machine activation authority. To use installed
bundle bytes in a machine Worker, review/copy them into a Card source, publish
the Card, and compose it into the Blueprint.

## Materialization to downstream tools

`drwn write` resolves the selected machine or project skill set and copies skill directories into the appropriate machine or project target directories. Each copied directory is recorded as a `managed-directory` entry in the write record.

Per-write-record cleanup applies: drwn-owned stale skill directories (recorded in the previous write record) are removed when no longer in the effective state; user-owned replacements are preserved and reported as warnings.

## See also

- [Materialization](./materialization) — the write-time pipeline
- [Extensions, bundles, and cards](./extensions-bundles-cards) — the add vs select vs write model
- [Machine Inventory](../reference/cli/machine) — standalone inventory lifecycle and Blueprint activation boundary
- `.ai/knowledges/10_drwn-cli-architecture.md` §4 — full architectural reference
