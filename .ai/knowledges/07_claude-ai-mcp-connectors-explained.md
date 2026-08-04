# ABOUTME: Explains how Claude.ai platform-managed MCP connectors work in Claude Code, where auth state lives, and how they differ from locally-installed MCP servers.
# ABOUTME: Grounded in artifacts observed on a working machine in 2026-05; flags inferences vs verified facts.

# Claude.ai MCP Connectors

**Category**: Reference
**Tags**: mcp, claude-code, claude.ai, connectors, oauth, authentication
**Last Updated**: 2026-05-24
**References**: [knowledges/06_notion-mcp-setup-guide.md, analyses/35_notion_mcp_manual.md]

---

## Overview

Claude.ai exposes a set of **pre-registered MCP servers** — Notion, Gmail, Google Drive, Google Calendar, Parallel Web Search, and others — that show up automatically in Claude Code without any local `claude mcp add` or `.mcp.json` entry. These are called **connectors**. Their tool names use the prefix `mcp__claude_ai_<service>__<tool>` (with spaces in the service name converted to underscores).

A connector is not a separate kind of MCP server — it's still a Streamable HTTP MCP endpoint at the same URL the service would publish to anyone (e.g., Notion's connector is at `https://mcp.notion.com/mcp`, identical to a manual install). What's different is **who manages the OAuth flow and token**: claude.ai does, on behalf of your Anthropic account, instead of you wiring it up locally.

This document explains how that works on the client side, where state lives, and the practical implications.

---

## Evidence from a working machine

| Artifact | Location | What it tells us |
| --- | --- | --- |
| Feature flag | `~/.claude.json` → `"tengu_claudeai_mcp_connectors": true` | The connector layer is gated behind a Claude Code feature flag. Without it, claude.ai's connectors do not surface as MCP servers. |
| Connection history | `~/.claude.json` → `"claudeAiMcpEverConnected": [...]` | Local list of connector names that have ever been authenticated. Used to decide which to mount on session start. |
| Auth-needed cache | `~/.claude/mcp-needs-auth-cache.json` | Map of connector name → timestamp for connectors whose OAuth has expired or never completed. Shown as `! Needs authentication` in `claude mcp list`. |
| Connector name format | `claude mcp list` output | Connectors appear as `claude.ai <Service Name>` (note the space). Local MCP servers appear unprefixed. Plugins appear as `plugin:<plugin-name>:<server>`. |
| No CLI surface | `claude mcp --help` | The `claude mcp` subcommand has only `add`, `get`, `list`, `remove`, `add-from-claude-desktop`, `add-json`, `reset-project-choices`, `serve`. **No connector subcommand.** Connectors are not managed through this CLI. |

What this means in practice: a connector is a small piece of cloud-managed configuration (the OAuth token and possibly the URL) that Claude Code fetches and mounts at startup, distinct from anything you can write into `~/.claude.json` directly via the CLI.

---

## Three kinds of MCP servers in Claude Code

Useful to keep straight, because they have different management surfaces:

| Kind | Naming | Where it's configured | Where auth lives | Cross-project? |
| --- | --- | --- | --- | --- |
| **Connector** | `claude.ai <Name>` | claude.ai web UI (Settings → Connectors). Tied to your Anthropic account. | Anthropic / claude.ai side. Local cache in `~/.claude/mcp-needs-auth-cache.json`. | Yes — same Anthropic account, every Claude Code session. |
| **Local MCP server** | bare name (e.g., `context7`) | `claude mcp add` (writes to `~/.claude.json` user or project scope) or `.mcp.json` at repo root | Local OAuth tokens stored by Claude Code (managed by the client itself). | User-scope: yes. Project-scope: per-repo. |
| **Plugin MCP server** | `plugin:<plugin>:<server>` | Bundled inside a Claude Code plugin under `~/.claude/plugins/` | Whatever the plugin specifies | Per plugin install scope |

The `claude.ai Notion` connector and a manually-added `notion` server at the same URL are **functionally the same upstream MCP server** — same tools, same data, same rate limits. The difference is purely in who orchestrates OAuth.

---

## Lifecycle of a connector

### 1. Discovery

When Claude Code starts a session with `tengu_claudeai_mcp_connectors: true`, it asks claude.ai which connectors the user has connected. The answer is in `claudeAiMcpEverConnected` (read-through cache; the authoritative source is claude.ai).

### 2. Mount

For each connector in that list whose auth is still valid (not in `mcp-needs-auth-cache.json`), Claude Code mounts it as an MCP server. Its tools become available as `mcp__claude_ai_<service>__*`. They appear in tool search and in `/mcp`.

### 3. Use

Tool calls flow through the connector exactly like any HTTP MCP server. The MCP endpoint sees a request authenticated as the OAuth-bound Notion user. Rate limits and capabilities are whatever the upstream service publishes (for Notion: ~180 req/min, search at 30/min, see `analyses/35_notion_mcp_manual.md` §2).

### 4. Re-auth / expiry

When a token expires or is revoked, the connector lands in `mcp-needs-auth-cache.json` and shows `! Needs authentication` in `claude mcp list`. The user re-authorizes at claude.ai → Settings → Connectors. Claude Code picks up the new state at the next session start (or possibly sooner via a refresh).

### 5. Disconnect

Done from claude.ai → Settings → Connectors → Disconnect. Removes the token at the Anthropic side and (on next session start) removes the entry from `claudeAiMcpEverConnected`.

---

## Where the OAuth identity binds — and why this is the same pitfall as a local install

The Notion connector's OAuth flow opens a browser window. Whichever Notion account is **currently signed into that browser** becomes the bound account. This is true regardless of whether you initiate the flow from claude.ai's Settings page or from a local `claude mcp add` — Notion's OAuth server only knows which session cookie the browser sent.

Practical consequence observed in this repo: the browser was signed into a
different organization account than the intended account. Subsequent reads and
writes used that identity and landed in the wrong private workspace.

**Always verify identity immediately after authorizing a connector** by calling `notion-get-self` and inspecting the returned name/email. This is non-negotiable for any agent that will perform writes. The same pre-step also applies to switching connectors: log into the browser as the intended account *first*, *then* trigger the re-auth.

---

## Where the drwn harness writes MCP server definitions

The drwn harness writes MCP server definitions to these paths:

- **Claude Code (machine scope):** `~/.claude.json` under the `mcpServers` key
- **Claude Code (project scope):** `<project>/.mcp.json`
- **Codex:** `~/.codex/config.toml` or `<project>/.codex/config.toml`
- **Cursor:** `~/.cursor/mcp.json` or `<project>/.cursor/mcp.json`

Claude Code reads from `~/.claude.json` (user scope), `.mcp.json` (project scope), and `~/.claude/plugins/` (plugin scope). Servers written by the harness appear alongside connectors and manually-added servers in `claude mcp list`. See `knowledges/06_notion-mcp-setup-guide.md` for per-tool guidance.

---

## Switching connector identity (the procedure that fits this layer)

If a connector is bound to the wrong account:

1. Open https://claude.ai → **Settings → Connectors**.
2. Find the misbound connector, click **Disconnect**.
3. In the same browser, open `notion.so` (or the relevant service) and sign out of the wrong account.
4. Sign into the service as the intended account. Confirm by visiting the service's home and reading the displayed name/email.
5. Back at claude.ai → Settings → Connectors → **Connect** for that service.
6. Restart Claude Code. (Connector state is fetched at session start.)
7. From the new Claude Code session, ask the agent to call `notion-get-self` (or `mcp__claude_ai_<service>__*` equivalent). Verify it returns the intended identity before any writes.

---

## What you cannot do with connectors

- **Connect two Notion accounts simultaneously.** One Anthropic account → one Notion connector → one bound Notion user. If you need two identities (e.g., personal + work), use one as a connector and the other as a locally-installed MCP server (`claude mcp add` with a different server name).
- **Use bearer-token auth.** Connectors are OAuth-only by design; there is no way to inject an integration token.
- **Run headless / unattended.** OAuth requires interactive consent. For CI use, install the upstream MCP server locally with an integration token, or call the service's REST API directly.
- **Pin a specific URL.** The URL is whatever claude.ai's connector definition says it is. If the upstream service moves endpoints, claude.ai updates the connector. Your local config has no opinion on it.

---

## Comparison: connector vs the alternatives

For Notion specifically, in order of friction:

| Setup | Repo changes | Cross-project | Auth managed by | Bearer-token mode | Headless |
| --- | --- | --- | --- | --- | --- |
| claude.ai Notion **connector** | None | Yes | claude.ai | No | No |
| `claude mcp add --scope user` | None | Yes (per machine) | Claude Code (local) | No | No |
| `.mcp.json` (project scope) | Committed | No (per repo) | Claude Code (local, prompted) | No | No |
| drwn harness sync | Registry edit | Per-repo | Each client | No | No |
| Manual REST API calls | App code | App-defined | App | Yes | Yes |
| Open-source local Notion MCP server | App code + server install | Per-machine | Integration token | Yes | Yes |

If the connector covers the workflow, prefer it — it has the least configuration drift. Reach for the others only when the connector can't (multiple identities, headless, project pinning).

---

## What we have *not* verified

Honest delineation, since this layer is newer:

- **Where OAuth tokens actually live.** Local artifacts only show *which* connectors are connected/need-auth, never the tokens themselves. The token is presumably stored server-side at claude.ai, with Claude Code pulling tool definitions through an authenticated channel tied to the Anthropic account. This is consistent with the observation that disconnecting at claude.ai immediately changes Claude Code's behavior, but we have not confirmed it by inspecting network traffic or token storage.
- **The exact mount-time protocol.** Whether Claude Code fetches the connector list at every session start, or caches it, and how invalidations propagate.
- **Whether `tengu_claudeai_mcp_connectors` is a kill switch or a rollout flag.** The `tengu_` prefix is consistent with Anthropic-internal feature gating, but its long-term meaning is not documented externally.

Update this section as we learn more.

---

## Troubleshooting

**Connector tools missing from a session:**
- `claude mcp list` — does the connector appear?
- If yes but tagged `! Needs authentication`: re-OAuth at claude.ai → Settings → Connectors.
- If absent entirely: check that `tengu_claudeai_mcp_connectors` is `true` in `~/.claude.json`, and that the connector is connected at claude.ai. Restart Claude Code to refresh.

**Tool calls return data from an unexpected workspace:**
- The OAuth bound to a different identity than intended. Run `notion-get-self` to confirm. If wrong, run the switching procedure above.

**`claude mcp get notion` says "No MCP server found":**
- That's expected for connectors. They are named `claude.ai Notion` (with space), not `notion`. Use `claude mcp list` to see the actual names. `claude mcp get` only finds locally-installed servers from `~/.claude.json` and `.mcp.json`, not connectors.

**Two Notion entries in `claude mcp list`:**
- You probably have both the claude.ai Notion connector AND a locally-installed `notion` server pointed at the same URL. Pick one. Two registrations duplicate OAuth prompts and can produce conflicting tool sets. Mentor memo §8: do not install multiple Notion MCP servers.

---

## When to share this document

Hand to anyone who:
- Sees `mcp__claude_ai_*__` tools in Claude Code without remembering how they got there.
- Wants to understand why `claude mcp get <name>` finds locally-added servers but not connectors.
- Is debugging an MCP integration that returns data from the wrong workspace or account.
- Is evaluating whether to use the connector vs install the upstream MCP server locally.

Pair it with `knowledges/06_notion-mcp-setup-guide.md` if they're also doing fresh setup in a different repo.
