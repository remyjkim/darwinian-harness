---
title: "Per-Project Config"
description: "Repository-specific overrides for agent behavior."
date: 2026-04-28
order: 7
---

## Creating a Project Config

Use per-project config to declare project-owned Worker roots, selection, and
explicit overlays independently of machine intent.

```bash
cd /path/to/project
drwn init
```

This creates:

```text
<project>/.agents/drwn/config.json
```

## Capabilities

Project config can:

- Declare alternative Worker roots and select at most one
- Enable or disable MCP servers for one project
- Add project-local MCP server definitions
- Enable extensions such as Parallel, Beads, or MarkItDown for one project
- Include or exclude skills during write
- Enable or disable targets locally

## Discovery

Project config is applied by `drwn write`, `drwn mcp list`, `drwn mcp write`, `drwn status`, `drwn doctor`, and extension status/doctor/setup commands.

Discovery walks upward from the current working directory and uses the nearest config file.

## Example

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": ["@me/backend@^1.0.0"],
  "activeWorker": "@me/backend",
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": false
    },
    "beads": {
      "enabled": true,
      "targets": ["codex", "claude"],
      "includeSkill": true
    },
    "markitdown": {
      "enabled": true,
      "skills": true
    }
  }
}
```

## Workers And Lockfiles

`workers` is an ordered array of root requirements. `activeWorker` is one
canonical installed root name or `null`. A Blueprint root expands to its one
immutable ordered Card closure; member Cards are not independently active. The
lockfile records exact resolved versions and integrity:

```text
<project>/.agents/drwn/card.lock
```

Track `config.json` and `card.lock` with the project. The write record is
machine-local materialization state:

```text
<project>/.agents/drwn/write-record.json
```

When a Worker is selected, effective state is:

```text
packaged project-safe policy + selected Worker closure + explicit project overlay
```

Machine capabilities from `~/.agents/drwn/machine.json` do not apply inside a
configured project.

## Project-local Materialization

When `drwn write` runs inside a configured project, it writes downstream state
under the project root:

```text
<project>/.claude/settings.json
<project>/.claude/skills/
<project>/.codex/config.toml
<project>/.codex/skills/
<project>/.codex/hooks.json
<project>/.cursor/mcp.json
<project>/.cursor/hooks.json
<project>/opencode.json                    # opencode target enabled
<project>/.opencode/plugins/drwn-hooks.js  # opencode target enabled, trusted hooks
```

Cursor reads `.claude/skills/` and `.codex/skills/` directly, so skill
materialization covers every enabled target that reads those directories,
including cursor-only projects.

## Skill Include / Exclude

Lower-level `skills.include` and `skills.exclude` work for repo-native and package-backed skills. If both extension-derived includes and explicit excludes mention the same skill, `skills.exclude` wins.

## Useful Workflow

```bash
drwn status
drwn write --dry-run
drwn doctor
```
