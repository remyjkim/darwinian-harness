---
title: "CLI Reference"
description: "Complete command catalog for drwn."
date: 2026-04-28
order: 3
---

## General Commands

| Command | Description |
|---------|-------------|
| `drwn status` | Summarize current effective state |
| `drwn status --explain` | Show provenance for cards, skills, MCP servers, targets, and write records |
| `drwn status --why <category>:<name>` | Explain why one skill, server, extension, target, or card is active |
| `drwn doctor` | Diagnose problems without mutating |
| `drwn scan` | Scan the current environment |
| `drwn init` | Start or bootstrap project config |
| `drwn write` | Write effective config to target tools |
| `drwn write --force` | Overwrite drift in drwn-managed regions |

## Card Commands

| Command | Description |
|---------|-------------|
| `drwn apply <refs...>` | Alias for `drwn card apply` |
| `drwn update` | Alias for `drwn card update` |
| `drwn card new <name> --into <collection>` | Create an independent editable Card source repository |
| `drwn card new <name> --from-project [path]` | Capture a project's effective harness as a card source |
| `drwn card publish <name>` | Publish a card source into the Git-backed local store |
| `drwn card show <ref>` | Show one resolved card version |
| `drwn card list` | List published cards in the local store |
| `drwn card diff <before> <after>` | Compare two published card versions |
| `drwn card deprecate <ref>` | Mark a published version as deprecated |
| `drwn card apply <refs...>` | Replace the current project's card set and write `card.lock` |
| `drwn card add <ref>` | Add one card to the current project |
| `drwn card pin <ref>` | Pin or replace one card ref |
| `drwn card remove <name>` | Remove one card from the project |
| `drwn card detach` | Remove all cards from the project |
| `drwn card update` | Refresh `card.lock` from configured card refs |
| `drwn card outdated` | Report cards with newer local versions available |
| `drwn card status` | Show configured refs, lock entries, and outdated cards |
| `drwn card validate <ref>` | Resolve and validate one card ref without mutating project config |

## Store Commands

| Command | Description |
|---------|-------------|
| `drwn store status` | Show cards-era store status |
| `drwn store migrate` | Migrate the pre-cards layout to `~/.agents/drwn` |
| `drwn store migrate-to-git` | Convert legacy per-version card directories into bare Git repos |
| `drwn store verify` | Verify Git-backed store health |
| `drwn store gc` | Run Git maintenance in card repos |
| `drwn store export --out <tar>` | Export the local store as a tar archive |

## Add Commands

| Command | Description |
|---------|-------------|
| `drwn add skill [name-or-query]` | Add a skill to the current project |
| `drwn add mcp [name-or-query]` | Add an MCP server to the current project |

## Search Commands

| Command | Description |
|---------|-------------|
| `drwn search skill <query>` | Search for skills in the library and online catalogs |
| `drwn search mcp <query>` | Search for MCP servers |

## Machine Inventory Commands

| Command | Description |
|---------|-------------|
| `drwn machine skill list` | List standalone skill inventory |
| `drwn machine skill show <id>` | Show skill/package details |
| `drwn machine skill install <packageSpec>` | Install a package-backed skill bundle |
| `drwn machine mcp list` | List standalone MCP records |
| `drwn machine mcp add <jsonFile> --as <serverId>` | Register a user MCP record |
| `drwn apply --root <workerRef>` | Replace/select the machine Worker Blueprint |
| `drwn use --root <nameOrRef>` | Switch the selected machine Worker |

## Extension Commands

| Command | Description |
|---------|-------------|
| `drwn extensions list` | List available extensions |
| `drwn extensions add <name>` | Enable an extension for the current project |
| `drwn extensions show <name>` | Show extension details |
| `drwn extensions status [name]` | Report extension status |
| `drwn extensions doctor [name]` | Diagnose extension issues |
| `drwn extensions setup beads` | Run Beads setup workflow |
| `drwn extensions setup parallel` | Run Parallel setup workflow |
| `drwn extensions setup markitdown` | Run MarkItDown setup workflow |

## MCP Commands

| Command | Description |
|---------|-------------|
| `drwn mcp list` | List active MCP servers |
| `drwn mcp write` | Write MCP config to targets |

## Skill Commands

| Command | Description |
|---------|-------------|
| `drwn machine skill list` | List available skill inventory |
| `drwn machine skill install <packageSpec>` | Add a package-backed skill bundle |
| `drwn machine skill show --package <packageName>` | Show package details |

Use a published Card in the selected machine Blueprint for machine activation,
or `drwn add skill <skillName>` for the current project.

## Common Flags

Most inspection commands support `--json` for machine-readable output. Write
commands support `--dry-run` to preview changes. Card project mutation commands
support `--write` to run `drwn write` after a successful mutation.

Use `--help` on any command for details:

```bash
drwn --help
drwn write --help
drwn card --help
drwn store --help
drwn status --help
drwn add skill --help
drwn machine skill list --help
drwn search skill --help
drwn extensions setup beads --help
drwn extensions setup markitdown --help
drwn machine skill install --help
```
