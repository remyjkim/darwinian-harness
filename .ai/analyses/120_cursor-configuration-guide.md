# Cursor Configuration Manual — MCP, Hooks & Skills

> **HISTORICAL (2026-08-05):** Cursor support is deprecated (owner decision, tracked as
> I213; deprecation signal shipped in PR #89, removal gated separately). This guide is
> retained as a point-in-time reference; nothing here was ever live-verified (the
> planned qualification was cancelled by direction). Goose replaces Cursor as the
> fourth target — see analysis 134 and issue I214.

A practical, end-to-end reference for wiring Cursor's agent harness. Covers the three
extension surfaces that let you connect external tools, intercept the agent loop, and
package reusable capabilities.

> Version note: Hooks shipped in **Cursor 1.7** (beta) and Agent Skills in **Cursor 2.4**
> (Jan 2026). MCP resources arrived in v1.6 and elicitation in v1.5. Features are moving
> fast — re-check the changelog when you upgrade. All three systems are file-driven and
> version-controllable.

---

## 0. Mental model

| Surface | What it does | Config file | Trigger |
| --- | --- | --- | --- |
| **MCP** | Connects the agent to external tools/data (DBs, APIs, GitHub, Figma) | `mcp.json` | Agent calls a tool |
| **Hooks** | Runs your scripts before/after stages of the agent loop | `hooks.json` | Lifecycle event |
| **Skills** | Packages on-demand "how-to" instructions + scripts | `.cursor/skills/<name>/SKILL.md` | Agent picks it, or `/skill-name` |

Related surfaces you'll see referenced: **Rules** (`.cursor/rules/*.mdc`, always-on or
glob-scoped guidance), **Commands** (`.cursor/commands/`, manual `/command`), and
**Subagents** (`.cursor/agents/`, isolated context). Rules *guide*, Skills *do*, Commands
*trigger*.

---

# 1. MCP (Model Context Protocol)

MCP is the open standard that lets Cursor's agent call external tools. Out of the box the
agent only sees your codebase; MCP servers bridge it to databases, issue trackers, design
tools, and any API you expose. Cursor is the **host**; each server connection is a
**client**; the external program is the **server**, exposing **tools**, **resources**
(v1.6+), and **prompts**.

## 1.1 Where config lives

| Scope | Path | Notes |
| --- | --- | --- |
| Project | `<project>/.cursor/mcp.json` | Committed with the repo; applies to this project only |
| Global (user) | `~/.cursor/mcp.json` | Applies across all projects |
| Enterprise | MDM-managed | Pushed by IT |

If the same server name exists in both project and global files, **project wins**.

## 1.2 Config schema

All servers live under an `mcpServers` object keyed by a unique name. Two transport styles:

**Local (stdio)** — Cursor spawns a process and talks over stdin/stdout. Best for local
experimentation.

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "DATABASE_URL": "postgresql://db-host/app_db" }
    }
  }
}
```

**Remote (Streamable HTTP / SSE)** — recommended for basically everything else.

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${env:GITHUB_PAT}" }
    }
  }
}
```

| Field | Applies to | Purpose |
| --- | --- | --- |
| `command` | local | Executable to launch (e.g. `npx`, `docker`, `node`, `python`) |
| `args` | local | Argument array passed to the command |
| `env` | local | Environment variables set at spawn time (put secrets here) |
| `url` | remote | HTTP(S) endpoint of the server |
| `headers` | remote | Auth and other headers (e.g. `Authorization: Bearer …`) |

Use `${env:VAR_NAME}` to reference a system environment variable instead of hard-coding a
secret. Cursor reads `env` **at process spawn time** — if you add a variable after Cursor
is running, restart the editor.

## 1.3 Three ways to install a server

1. **Deep-link button** ("Add to Cursor" on a vendor's docs page) — easiest. Opens a
   pre-filled dialog with name, transport, and URL. Deep links look like
   `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=…`.
2. **UI** — `Cursor Settings > Tools & MCP > New MCP Server`. Opens/creates `mcp.json`.
3. **Manual** — edit `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) directly.

## 1.4 Common server examples

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": { "BRAVE_API_KEY": "your-key" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "github-docker": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
               "ghcr.io/github/github-mcp-server"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>" }
    },
    "notion": { "url": "https://mcp.notion.com/mcp", "headers": {} }
  }
}
```

For OAuth-based servers, after saving, open `Settings > Tools & MCP`. A **yellow** indicator
means the server needs authorization — click **Connect** to run the browser OAuth flow. A
**green** dot means connected.

## 1.5 The ~40-tool limit

Cursor performs best with roughly **40 active tools across all servers combined**. Beyond
that you get a warning and the agent silently loses visibility of some tools, because each
tool definition consumes context tokens and dilutes tool selection. Mitigations:

- Toggle off unused tools per-server in `Settings > Tools & MCP`.
- Prefer a server exposing 5–10 well-defined tools over one mega-server with 30.
- Cursor's Jan 2026 update loads tool descriptions on demand rather than front-loading all
  of them, which helps but doesn't remove the guidance.

## 1.6 Verifying & troubleshooting

- Confirm MCP is enabled: `Settings`, search "MCP", ensure the feature toggle is on, then
  restart.
- `Command Palette > MCP: View Server Status` (or the Tools & MCP panel) shows each server
  with a status dot.
- Ask the agent in chat: "List the tools you have available."
- Logs: macOS `~/Library/Logs/Cursor/` (`mcp-*.log`), Windows `%APPDATA%\Cursor\logs\`,
  Linux `~/.config/Cursor/logs/`.
- Validate JSON — a single stray comma fails the whole file silently. Check with
  `cat ~/.cursor/mcp.json | python3 -m json.tool`.
- 401/invalid token → verify `env`/headers, and restart if you added them after launch.

## 1.7 Security

MCP servers run code with the permissions you grant. Vet third-party servers, disable
auto-run, restrict credential scope, pin package versions, and keep Cursor current. For
teams, front servers with an MCP gateway to get vetted servers, scoped credentials,
per-user OAuth, and audit logs.

---

# 2. Hooks

Hooks let you **observe, control, and extend the agent loop** with your own scripts. Each
hook is a process Cursor spawns; it receives structured **JSON on stdin** and returns
**JSON on stdout**. Use hooks to run formatters, add analytics, scan for secrets/PII, gate
risky operations (e.g. SQL writes), control subagents, or inject context at session start.

## 2.1 Config locations & precedence

Hooks are defined in `hooks.json`. Multiple layers may exist; **all** matching hooks from
**every** source run, and when outputs conflict, higher-priority sources win during merge.

| Source | Path | Working directory of scripts |
| --- | --- | --- |
| **Enterprise** (MDM, system-wide) | macOS `/Library/Application Support/Cursor/hooks.json` · Linux/WSL `/etc/cursor/hooks.json` · Windows `C:\ProgramData\Cursor\hooks.json` | Enterprise config dir |
| **Team** (cloud-distributed, Enterprise only) | Configured in the web dashboard, synced every 30 min | Managed hooks dir |
| **Project** | `<project>/.cursor/hooks.json` | **Project root** |
| **User** | `~/.cursor/hooks.json` | `~/.cursor/` |

Priority (high → low): **Enterprise → Team → Project → User**.

> Path gotcha (the #1 reason a hook "does nothing"): project hooks run from the project
> root, so reference `.cursor/hooks/format.sh`, **not** `./hooks/format.sh`. User hooks run
> from `~/.cursor/`, so `./hooks/format.sh` is correct there.

## 2.2 Quickstart

`~/.cursor/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [{ "command": "./hooks/format.sh" }]
  }
}
```

`~/.cursor/hooks/format.sh`:

```bash
#!/bin/bash
# Read the JSON input, do work, exit 0
cat > /dev/null
exit 0
```

```bash
chmod +x ~/.cursor/hooks/format.sh
```

Cursor watches `hooks.json` and reloads on save (restart if it doesn't pick up).

## 2.3 Hook types

**Command hooks (default).** Any executable that reads stdin and prints JSON — shell,
Python, or TypeScript run with Bun.

```json
{
  "hooks": {
    "beforeShellExecution": [
      { "command": "./scripts/approve-network.sh", "timeout": 30, "matcher": "curl|wget|nc" }
    ]
  }
}
```

Exit codes: `0` = success, use JSON output. `2` = block the action (same as
`permission: "deny"`). Any other code = hook failed; action proceeds (**fail-open** by
default).

**Prompt hooks (`type: "prompt"`).** Hand a natural-language policy to a fast model instead
of writing a parser.

```json
{
  "hooks": {
    "beforeShellExecution": [
      { "type": "prompt",
        "prompt": "Does this command look safe? Only allow read-only operations.",
        "timeout": 10 }
    ]
  }
}
```

Returns `{ ok: boolean, reason?: string }`. `$ARGUMENTS` is auto-replaced with the hook
input JSON (auto-appended if absent). Optional `model` field overrides the default.

## 2.4 Per-script options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `command` | string | required | Script path or command |
| `type` | `"command"` \| `"prompt"` | `"command"` | Execution type |
| `timeout` | number | platform default | Timeout in seconds |
| `loop_limit` | number \| null | `5` | Max auto follow-ups for `stop`/`subagentStop`; `null` = no cap |
| `failClosed` | boolean | `false` | When `true`, hook failure **blocks** the action (use for security-critical `beforeReadFile`/`beforeMCPExecution`) |
| `matcher` | string/object | — | Filter for when the hook runs |

## 2.5 Matchers

The matcher's meaning depends on the hook:

- `preToolUse` / `postToolUse` / `postToolUseFailure`: match by **tool type** — `Shell`,
  `Read`, `Write`, `Grep`, `Delete`, `Task`, or MCP tools via `MCP:<tool_name>`.
- `subagentStart` / `subagentStop`: match by **subagent type** — `generalPurpose`,
  `explore`, `shell`, etc.
- `beforeShellExecution` / `afterShellExecution`: match against the **command string**.
- `beforeReadFile`: tool type (`Read`, `TabRead`, …). `afterFileEdit`: tool type
  (`Write`, `TabWrite`, …).
- `beforeSubmitPrompt` → `UserPromptSubmit`; `stop` → `Stop`;
  `afterAgentResponse` → `AgentResponse`; `afterAgentThought` → `AgentThought`.

## 2.6 Lifecycle events

**Agent hooks** (Cmd+K / Agent Chat):

| Event | Can block? | Notable output |
| --- | --- | --- |
| `sessionStart` | fire-and-forget | `env` (session vars), `additional_context` |
| `sessionEnd` | fire-and-forget | — |
| `beforeSubmitPrompt` | yes | `continue`, `user_message` |
| `preToolUse` | yes | `permission` allow/deny, `updated_input` |
| `postToolUse` | no | `additional_context`, `updated_mcp_tool_output` |
| `postToolUseFailure` | no | — (`failure_type`: error/timeout/permission_denied) |
| `beforeShellExecution` / `beforeMCPExecution` | yes | `permission` allow/deny/ask |
| `afterShellExecution` / `afterMCPExecution` | no | — |
| `beforeReadFile` | yes | `permission` allow/deny |
| `afterFileEdit` | no | — |
| `subagentStart` | yes | `permission` allow/deny |
| `subagentStop` | no | `followup_message` (loop) |
| `preCompact` | no (observational) | `user_message` |
| `stop` | no | `followup_message` (auto-continue loop) |
| `afterAgentResponse` / `afterAgentThought` | no | — |

**Tab hooks** (inline completions): `beforeTabFileRead`, `afterTabFileEdit`.
**App lifecycle**: `workspaceOpen` (fires on open + folder change; can return `pluginPaths`).

## 2.7 Common schema

Every hook receives a base payload:

```json
{
  "conversation_id": "…",
  "generation_id": "…",
  "model": "…",
  "hook_event_name": "…",
  "cursor_version": "1.7.2",
  "workspace_roots": ["/path"],
  "user_email": "…|null",
  "transcript_path": "…|null"
}
```

Example — `beforeShellExecution` input and output:

```json
// input
{ "command": "<full terminal command>", "cwd": "<dir>", "sandbox": false }
// output
{ "permission": "allow" | "deny" | "ask",
  "user_message": "<shown in client>",
  "agent_message": "<fed back to agent>" }
```

Example — `stop` loop (auto-submit a follow-up until a goal is met):

```json
// input:  { "status": "completed" | "aborted" | "error", "loop_count": 0 }
// output: { "followup_message": "Run the tests again and fix failures." }
```

## 2.8 Worked example — block raw `git`, gate `gh`

`.cursor/hooks.json`:

```json
{ "version": 1, "hooks": { "beforeShellExecution": [{ "command": ".cursor/hooks/block-git.sh" }] } }
```

`.cursor/hooks/block-git.sh` reads stdin, parses `.command` with `jq`, and emits
`{"permission":"deny", …}` for `git`, `{"permission":"ask", …}` for `gh`, and
`{"permission":"allow"}` otherwise. (Full script in Cursor's hooks docs.)

## 2.9 Environment variables passed to scripts

| Variable | Description |
| --- | --- |
| `CURSOR_PROJECT_DIR` | Workspace root (always present) |
| `CURSOR_VERSION` | Version string |
| `CURSOR_USER_EMAIL` | If logged in |
| `CURSOR_TRANSCRIPT_PATH` | If transcripts enabled |
| `CURSOR_CODE_REMOTE` | `"true"` in remote workspaces |
| `CLAUDE_PROJECT_DIR` | Alias for project dir (Claude Code compatibility) |

## 2.10 Cloud agents & team distribution

Cloud agents run **command-based** hooks from `.cursor/hooks.json` (plus Team/Enterprise
hooks on Enterprise). Not available in the cloud: `sessionStart/End`, `beforeSubmitPrompt`,
Tab hooks, `workspaceOpen`, MCP hooks, `afterAgentResponse/Thought`, and `stop`.
Distribute via version control (project hooks), MDM (user or global dirs), or Enterprise
cloud sync (dashboard). Cursor supports loading **third-party (Claude Code) hooks** too.

## 2.11 Debugging

There's a **Hooks tab** in Cursor Settings showing configured and executed hooks, plus a
**Hooks output channel** for errors. If nothing fires: save/restart to force a reload, and
double-check relative paths against the working-directory rules in 2.1.

---

# 3. Skills (Agent Skills)

Skills package domain-specific, procedural "how-to" knowledge — optionally with executable
scripts — that the agent loads **on demand**. Compared with always-on Rules, skills keep the
context window lean via **progressive disclosure**: at session start the agent sees only each
skill's `name` + `description`, and pulls the full body only when a task matches.

Skills follow the open **Agent Skills** standard, so the same `SKILL.md` works across Cursor,
Claude Code, Codex, and other compatible agents.

## 3.1 Directory layout & discovery

One folder per skill, each containing a `SKILL.md`. Cursor auto-discovers at startup from
(in priority order):

| Location | Scope |
| --- | --- |
| `.cursor/skills/` | Project (version-controlled) |
| `.claude/skills/` | Project (Claude compat) |
| `.codex/skills/` | Project (Codex compat) |
| `~/.cursor/skills/` | User / global |
| `~/.claude/skills/` | User (Claude compat) |
| `~/.codex/skills/` | User (Codex compat) |

Minimal structure:

```
.cursor/
└── skills/
    └── my-skill/
        └── SKILL.md
```

## 3.2 SKILL.md format

```markdown
---
name: deploy-app
description: Deploy the app to staging or production. Use when deploying code or when the
  user mentions deployment, releases, or environments.
---

# Deploy App

## When to Use
- Use when shipping a build to an environment.

## Instructions
Run `scripts/deploy.sh <environment>` where <environment> is staging or production.
Before deploying, run `python scripts/validate.py`.
```

### Frontmatter fields

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Lowercase letters/numbers/hyphens; **must match the folder name** |
| `description` | Yes | What it does + when to use it — the agent uses this to decide relevance |
| `license` | No | License name or reference to a bundled file |
| `compatibility` | No | Environment requirements (packages, network, etc.) |
| `metadata` | No | Arbitrary key-value map |
| `disable-model-invocation` | No | `true` = only runs when explicitly typed as `/skill-name` |

## 3.3 Optional supporting directories

| Directory | Purpose |
| --- | --- |
| `scripts/` | Executable code the agent runs (Bash, Python, JS, …) |
| `references/` | Extra docs loaded on demand (keep `SKILL.md` lean) |
| `assets/` | Templates, config files, static resources |

```
skills/deploy-app/
├── SKILL.md
├── scripts/{deploy.sh, validate.py}
├── references/REFERENCE.md
└── assets/config-template.json
```

Reference scripts with **relative paths from the skill root** and make them executable
(`chmod +x`). Put essentials in `SKILL.md`; push detail into `references/` so context is
loaded only when needed (progressive loading).

## 3.4 Invocation

- **Automatic**: the agent reads descriptions and loads a matching skill when relevant.
- **Manual**: type `/` in Agent chat and search, or `/skill-name` directly.
- Set `disable-model-invocation: true` to make a skill behave like a slash command (manual
  only).

## 3.5 Viewing & installing

- View discovered skills: `Cursor Settings` (Cmd/Ctrl+Shift+J) → **Rules** → they appear
  under the **Agent Decides** section.
- Install from GitHub: `Settings → Rules → Project Rules → Add Rule → Remote Rule (Github)`
  and paste the repo URL. These stay synced with their source.
- Ecosystem CLI (skills.sh): `npx skills find <query>`, `npx skills add <owner/repo@skill>`
  (add `-g` for global), `npx skills check` / `update`.

## 3.6 Migrating Rules & Commands to Skills

Cursor 2.4+ ships a built-in `/migrate-to-skills` command. Type it in Agent chat and it
converts eligible items:

- **Dynamic rules** (`alwaysApply: false`/undefined, no `globs`) → standard skills.
- **Slash commands** (user + workspace) → skills with `disable-model-invocation: true`.

Not migrated: `alwaysApply: true` rules, glob-scoped rules, and user rules (they have
explicit triggering that differs from skill behavior). Rules and skills coexist — if a rule
and a skill conflict, the **rule wins**.

## 3.7 Best practices & troubleshooting

- Names: lowercase-hyphenated, descriptive (`deploy-to-staging` not `deploy`), matching the
  folder.
- Descriptions: specific, keyword-rich, stating *when* to use it. ("Deploy stuff" is a bad
  description.)
- One skill = one job; keep it decomposable so it's reusable across commands/hooks, not
  bound to a single workflow.
- If a skill doesn't appear: confirm `.cursor/skills/<name>/SKILL.md` exists, `name` matches
  the folder, `description` is present, then restart.
- If it isn't applied: sharpen the description, or invoke manually with `/skill-name`; check
  `disable-model-invocation`.
- If scripts fail: `chmod +x`, use relative paths, test the script standalone, and document
  deps via `compatibility`.

---

## Appendix — file map at a glance

```
~/.cursor/
├── mcp.json            # global MCP servers
├── hooks.json          # global hooks
├── hooks/              # global hook scripts
└── skills/<name>/SKILL.md

<project>/.cursor/
├── mcp.json            # project MCP servers (wins over global)
├── hooks.json          # project hooks (run from project root)
├── hooks/<script>
├── rules/*.mdc         # always-on / glob-scoped guidance
├── commands/           # manual /commands
├── agents/             # subagents (isolated context)
└── skills/<name>/SKILL.md
```

**Primary sources:** Cursor Docs — MCP (`cursor.com/docs/mcp`), Hooks
(`cursor.com/docs/hooks`), Skills (`cursor.com/docs/context/skills`), and the Cursor 2.4
changelog.
