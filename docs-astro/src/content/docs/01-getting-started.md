---
title: "Getting Started"
description: "Install and configure darwinian in minutes."
date: 2026-04-28
order: 1
---

## Requirements

- **Bun 1.2+** — runtime for the CLI
- **Node.js** — for MCP servers that use `node`
- **npm** — when installing the published package or adding npm skill bundles
- Optional: `parallel-cli`, `markitdown`, or `markdownify-mcp` only when you enable those integrations

## Install

### Published package

```bash
npm install -g darwinian
drwn status
```

The published package includes built-in harness defaults. By default, global `drwn` uses that packaged harness source.

### Work from a checkout

Use this mode if you want to edit the registry, maintain your own fork, add built-in skills, or develop the CLI:

```bash
git clone https://github.com/remyjkim/darwinian-worker.git
cd darwinian-worker
bun install
bun run drwn -- status
```

You can also point a global install at a checkout:

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-worker
drwn status
```

For local development, link the package:

```bash
bun link
drwn --help
```

## Quickstart

Start by inspecting before writing machine-scope state:

```bash
drwn status
drwn skills list
drwn mcp list
drwn write --dry-run
```

If the dry run looks right, write the generated state:

```bash
drwn write
```

That first run gives you:

- a system overview
- the current skill inventory
- the active MCP inventory
- a planned-change preview
- an explicit write step

### Select machine capabilities

Machine capabilities come only from one selected Worker Blueprint. Install and
select that immutable root, then project its active Card closure:

```bash
drwn apply --root <blueprint-ref>
drwn write --root
drwn status --machine --json
```

The V2 machine contract is a hard cut. Prototype profile/default selections are
not read or migrated.

### Project-specific setup

For a project-specific setup, start in the project directory:

```bash
drwn init
drwn extensions add parallel
drwn add skill <skill-name-or-query>
drwn add mcp <server-name>
drwn write --dry-run
drwn write
```

When `drwn write` runs inside a project with `.agents/drwn/config.json`, it
writes project-local `.claude`, `.codex`, and `.cursor` state instead of
writing to your home-directory tool config.

### Apply a Mind Card

Cards package reusable project harness intent:

```bash
drwn init
drwn apply @me/backend@^1.0.0
drwn write --dry-run
drwn write
```

The project records card refs in `.agents/drwn/config.json` and exact resolved
versions in `.agents/drwn/card.lock`.

### Non-interactive mode

For scripts and CI-style setup:

```bash
drwn init --non-interactive
```
