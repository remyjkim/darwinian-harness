---
sidebar_position: 1
---

# Per-Project Override Patterns

This guide shows when to use per-project config, how to scaffold it, and the
common patterns for declaring one reproducible project harness.

## When To Use Per-Project Config

Use a project config whenever a project needs a Worker or explicit capability
intent. Examples:

- a project should select one Blueprint from several alternative roots
- a project should add its own local MCP server
- a project should enable Parallel, Beads, or MarkItDown without enabling them globally
- a project should disable a downstream target (e.g. no Cursor)

Machine capabilities remain machine-scoped and may be visible ambiently in project
sessions. They are not inherited as project declarations.

## Scaffold

```bash
cd /path/to/project
drwn init
```

This creates:

```text
<project>/.agents/drwn/config.json
```

Use `--non-interactive` or `--minimal` for scripts. `--force` overwrites an
existing config.

## What Project Config Can Do

A project config can:

- declare alternative Card or Blueprint roots and select at most one
- toggle existing MCP servers on or off for one project
- add project-local MCP server definitions
- enable extensions (Parallel, Beads, MarkItDown) for one project
- include or exclude skills during write
- enable or disable downstream targets for one project

## Discovery

Discovery walks **upward** from the current working directory and stops at the
first matching config. Commands outside a configured project fall back to the
machine-wide harness view. Discovery affects `drwn write`, `drwn mcp list`,
`drwn mcp write`, `drwn status`, `drwn doctor`, and all `drwn extensions`
subcommands.

## Full Extension Example

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": ["@team/operator@^1.0.0"],
  "activeWorker": "@team/operator",
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

## Include vs Exclude Precedence

`skills.include` adds repo-native and package-backed skills into the project
write. `skills.exclude` removes matching skills from project write.

If an extension derives a skill and `skills.exclude` names the same skill,
**`skills.exclude` wins**. Unknown skill names in `skills.include` fail
`drwn write` before mutation and are also reported by `drwn doctor`.

## Declared And Ambient Scope

Project capabilities are resolved only from project-owned inputs:

```text
selected Worker root closure -> explicit project overlays -> explicit local overlay
```

Machine capability selections and user-home target files are not copied into project intent,
lock state, or generated Worker aggregates. Status and doctor may report them as
diagnostic-only ambient observations because downstream clients can still expose
user-home state during a project session.

## Recommended Workflow

```bash
cd /path/to/project
drwn init
drwn add @team/operator@^1.0.0
drwn use @team/operator --no-write
drwn add mcp context7
drwn status
drwn write --dry-run
drwn doctor
drwn write
```

## Multiple Agent Profiles In One Worktree

Keep the capabilities shared by every agent in the active Worker, then install
role-specific alternatives without selecting them project-wide:

```bash
drwn apply @team/base@^1 @team/reviewer@^1 @team/implementation@^1 \
  --active @team/base
drwn write

drwn worker launch-context prepare @team/reviewer --target claude --json
drwn worker launch-context prepare @team/reviewer --target codex --json
drwn worker launch-context prepare @team/implementation --target codex --json
```

An orchestrator passes each returned `context.launch.args` and
`context.launch.env` unchanged to the matching target executable. It owns agent
roles, panes, prompts, and live bindings; it does not read Card manifests or
generated target files. Several agents may reuse one context when their target,
assigned root, optional MCP selection, and effective materialization inputs are
identical.

The project must remain coordinated like any shared worktree: launch contexts
separate capabilities, not filesystem writes. Use explicit writer roles and
review Git diffs before combining concurrent agent changes.

## See Also

- [init CLI reference](../reference/cli/init)
- [Project config schema](../reference/schemas/project-config-json)
- [Layered model](../concepts/layered-model)
- [Per-agent Worker launch contexts](../concepts/per-agent-worker-launch-contexts)
