---
title: "How Write Works"
description: "How drwn resolves machine, project, card, and local-store state."
date: 2026-04-28
order: 2
---

## Scope Detection

`drwn write` first decides whether it is running in a configured project.
Discovery walks upward from the current directory for:

```text
<project>/.agents/drwn/config.json
```

That one decision controls both the effective state and the write destination.

## Machine-Scope Writes

Outside a configured project, effective state is:

```text
packaged policy + one selected, verified Worker closure in strict drwn.machine V2
```

Machine-scope writes materialize into:

```text
~/.claude/
~/.codex/
~/.cursor/
~/.config/opencode/opencode.json   # when the opencode target is enabled
~/.agents/drwn/generated/
~/.agents/drwn/global-write-record.json
```

Use the selected machine Worker for user-home sessions. Projects never inherit
it as a declaration, though downstream tools may expose user-home state
ambiently.

## Project-Scope Writes

Inside a configured project, effective state is:

```text
packaged project-safe policy + one selected Worker closure + explicit project overlays
```

Project-scope writes materialize into:

```text
<project>/.claude/
<project>/.codex/
<project>/.cursor/
<project>/opencode.json            # when the opencode target is enabled
<project>/.agents/drwn/generated/
<project>/.agents/drwn/write-record.json
```

Machine-only defaults from `~/.agents/drwn/machine.json` do not apply inside a
configured project. The project config, selected cards when present, and
explicit project overlay are the project source of truth.

## Cards And Lockfiles

A project selects cards in:

```text
<project>/.agents/drwn/config.json
```

`drwn apply`, `drwn card add`, `drwn card pin`, and `drwn card update` resolve
those refs into:

```text
<project>/.agents/drwn/card.lock
```

The lockfile records exact versions and integrity so repeated writes are
deterministic.

## Write Records

Write records let `drwn` distinguish paths it owns from user-owned state.

On the next write:

- drwn-owned paths that left the effective state are removed
- user-owned replacements are preserved and reported
- generated files are rewritten from the effective state

Use `--force` only when you intentionally want to overwrite drift inside
drwn-managed file regions.

## Running Write

Preview before writing:

```bash
drwn write --dry-run
```

Write everything:

```bash
drwn write
```

Run only one side when needed:

```bash
drwn write --mcp-only
drwn write --skills-only
```

Limit write to one target:

```bash
drwn write --target=claude
drwn mcp write --target=cursor
```

Resolve managed-field drift intentionally:

```bash
drwn write --force
```

## Usage Modes

### Packaged harness

Use the published package when you want the default config and CLI behavior:

```bash
npm install -g darwinian
drwn write --dry-run
```

### Editable harness source

Use a checkout when you want to own the source of truth:

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-worker
drwn status
```

In checkout mode, edit:

- `registry/config.json` for target and optional-server toggles
- `registry/mcp-servers.json` for MCP server definitions
- `skills/` for built-in skill content
