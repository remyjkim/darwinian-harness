---
sidebar_position: 1
slug: /
---

# Darwinian Minds

`darwinian` is a local meta-harness for AI agent tools: one CLI to organize skills, MCP servers, extensions, defaults, project overlays, downstream tool configs, and diagnostics.

The CLI is `drwn`.

Agents are only as reliable as the harness around them. `darwinian` makes that harness explicit, inspectable, reusable, and safe to write into downstream tools.

## What it harnesses

- **Skills and instructions** that guide agent behavior
- **MCP servers and tool definitions** that control capability access
- **Extensions** such as Parallel, Beads, and MarkItDown that bundle project-level setup and diagnostics
- **Explicit machine intent** for reusable local capabilities
- **Project overlays** for repository-specific agent behavior
- **Downstream state** for Claude Code, Codex, Cursor (deprecated), and `~/.agents`
- **Diagnostics** that report drift before mutating local files

## Why this exists

Local agent setups tend to drift. One tool gets a new MCP server, another has an older skill directory, and a project needs a slightly different harness than the global baseline.

The harness around an agent is usually scattered across dotfiles, skill directories, MCP configs, extension setup scripts, and project conventions. `darwinian` gives those pieces a local control plane you can inspect, version, dry-run, and write deliberately.

It is useful when you want:

- one reusable MCP and skill inventory instead of separately hand-edited tool configs
- one harness layer shared across compatible agent tools
- project-specific overrides without rewriting global config
- diagnostics for stale links, drifted config, and missing generated files
- an operator CLI that reports before it mutates

If you only need a single MCP config file for one tool, this project is probably more structure than you need.

## Core ideas

If you want to understand how drwn thinks before installing it:

- [The Layered Model](./concepts/layered-model) — how packaged policy, machine inventory, strict machine intent, and project Workers resolve into separate projections.
- [Cards](./concepts/cards) — versioned harness bundles you can author, share, and lock.
- [Local Store](./concepts/local-store) — the durable shape of `~/.agents/drwn/`.
- [Disciplines](./concepts/disciplines) — the six load-bearing commitments that shape every command.
- [Safety Model](./concepts/safety-model) — preview-first, doctor-is-report-only, and the rules that flow from it.

## What's next

- **New here?** Start with [Installation](./getting-started/installation).
- **Want the conceptual map first?** Read [The Layered Model](./concepts/layered-model).
- **Joining a team that already uses `darwinian`?** Skip to [Use a Team's Harness](./getting-started/paths/use-team-harness).
