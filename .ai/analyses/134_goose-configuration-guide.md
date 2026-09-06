# Goose Configuration Manual — Instructions, MCP, Skills, Hooks & Recipes

A practical, end-to-end reference for wiring Block's goose agent harness, written as
phase-1 evidence for the I214 goose-target decision. Covers the surfaces an external
manager (drwn) can project into: standing instructions, MCP servers ("extensions"),
skills, lifecycle hooks, and recipes/sub-workers.

> Version note: probed against **goose 1.41.0** (`/opt/homebrew/bin/goose`, released
> 2026-07-03). Upstream moves on a roughly **weekly minor-release cadence** (v1.38
> 2026-06-17 → v1.45 2026-07-29; canary channel via `goose update --canary`), and the
> docs on `block/goose@main` drift both ahead of and behind any installed binary.
> Re-verify on upgrade.
>
> Evidence annotations used throughout:
> - **[verified: probe X]** — observed live against goose 1.41.0; probe records in
>   `~/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/07-goose-target-evidence/NOTES.md`
> - **[docs-claimed]** — from `block/goose@main` `documentation/docs/` (v1.45-era), not probed
> - **[binary-evidence]** — strings/paths present in the 1.41.0 binary, behavior not probed
>
> Live-probe caveat: probes ran with goose's `claude-code` provider (the configured
> z.ai key returns 401). That provider embeds the Claude Code harness, which ingests
> its own context files and runs shell with its own tools — every instruction result
> below was attribution-controlled (see §1.4 and §4.4).

---

## 0. Mental model

| Surface | What it does | Config file(s) | Scope | Trigger |
| --- | --- | --- | --- | --- |
| **Context files** | Standing instructions injected into system context | `AGENTS.md`, `.goosehints` | project + global | every session |
| **Extensions (MCP)** | Connect agent to external tools (stdio / streamable HTTP / bundled) | `~/.config/goose/config.yaml` `extensions:`; plugin `.mcp.json`; CLI flags; recipe `extensions:` | global / project-via-plugin / per-run | agent calls a tool |
| **Skills** | On-demand SKILL.md instruction packages | `.agents/skills/`, `.claude/skills/`, `.goose/skills/` (+ user-level) | project + global | agent picks, or `/skills` |
| **Hooks** | Shell commands on lifecycle events, via plugins | `.agents/plugins/<name>/hooks/hooks.json` | project + user | lifecycle event |
| **Recipes** | Parameterized agent definitions; sub-worker analog | `.goose/recipes/`, `.agents/recipes/`, `~/.config/goose/recipes/` | project + global | `goose run --recipe`, subrecipe tools, scheduler |

Cross-cutting facts an external manager must know:

- There is **no project-level `config.yaml`** — goose reads exactly one user config
  (`~/.config/goose/config.yaml`) **[verified negative: probe F — a scratch
  `.goose/config.yaml` declaring an extension is silently ignored; docs concur]**.
  Project-scoped delivery happens through *directories* (`.agents/`, `.goose/`,
  `.claude/`), not a config file.
- `XDG_CONFIG_HOME` redirects the config dir (config.yaml, global hints)
  **[verified: probe E / `goose info`]** — useful for sandboxed qualification runs.
  Sessions DB and logs stay under `~/.local` regardless.
- Env vars override config keys (env > config.yaml > defaults) **[docs-claimed;
  verified for `CONTEXT_FILE_NAMES`, `GOOSE_PROVIDER`-equivalent CLI overrides]**.
- `/etc/goose/config.yaml` exists as a system-level path **[binary-evidence]**.

---

# 1. Context files (standing instructions)

## 1.1 Defaults & load order

Goose loads **`AGENTS.md` then `.goosehints`**, in that order, by default.

- Repo-root `AGENTS.md` is ingested natively **[verified: probe A — sentinel visible;
  probe A2 exclusion control + bare-`claude` control prove the injection is goose's,
  not the provider's]**.
- Project `.goosehints` is ingested **[verified: probe B]**.
- Both present → **both are loaded and combined** in one session **[verified: probe C]**.
- `CLAUDE.md` is **not** a goose default **[verified negative: probe D/D2 — the
  sentinel only appears via the claude-code provider layer; with goose's loader
  restricted it still appears, and bare `claude -p` shows it too]**.

## 1.2 Locations

| Location | Path | Status |
| --- | --- | --- |
| Project (local) | `<cwd>/AGENTS.md`, `<cwd>/.goosehints` | **[verified: probes A–C]** |
| Global | `~/.config/goose/.goosehints` (config dir + each configured filename) | **[verified: probe E, via XDG sandbox — global and local `.goosehints` combine]** |
| Hierarchical | configured files from working dir **up to repo root**, plus on-access discovery in nested dirs | **[docs-claimed]** |

Precedence on conflict: local wins over global **[docs-claimed]**. Hint files support
`@file` import references (relative paths only; absolute rejected) **[binary-evidence:
`hints/import_files.rs`]**.

## 1.3 `CONTEXT_FILE_NAMES`

Environment variable (also settable as a config key), JSON array of filenames:

```bash
export CONTEXT_FILE_NAMES='["AGENTS.md", ".goosehints"]'   # the default
```

**[verified: probe A2 — setting `'[".goosehints"]'` in an AGENTS.md-only project
yields NONE]**. Each configured name is looked up in both global and local locations
**[docs-claimed]**. This is the lever for adding `CLAUDE.md` or swapping filename
conventions without writing files.

## 1.4 Provider-layer contamination (caveat)

When goose runs on a CLI-harness provider (`claude-code`, `gemini-cli`, `codex-acp`,
`amp-acp`, `pi-acp`, `copilot-acp` — all shipped), the inner harness contributes its
*own* context ingestion and tool execution:

- `CLAUDE.md` leaks into sessions via the claude-code provider **[verified: probe D2]**.
- Shell commands execute in the inner harness's Bash tool, bypassing goose's
  `developer__shell` — goose's `AfterShellExecution` hook never fires for them
  **[verified: probe K2]**.

Any drwn qualification of goose must pin the provider class; behavior differs
structurally between API providers and CLI-harness providers.

---

# 2. Extensions (MCP)

## 2.1 Where config lives

**Global (the only config file):** `~/.config/goose/config.yaml`, `extensions:` map
**[verified: read from the live user config, READ-ONLY]**. Companion files in the same
dir: `secrets.yaml` (when keyring disabled via `GOOSE_DISABLE_KEYRING`),
`permission.yaml`, `permissions/tool_permissions.json`, `prompts/`, `recipes/`
**[docs-claimed; config.yaml + secrets.yaml observed]**.

**Project-level config file: none.** `.goose/config.yaml` in a project is ignored
**[verified negative: probe F]**. Docs: "Project/directory-local config: No support
documented."

## 2.2 Global schema

```yaml
extensions:
  my_stdio_server:            # key = extension id
    enabled: true
    type: stdio               # platform | builtin | stdio | streamable_http | sse (legacy)
    name: my_stdio_server
    cmd: npx
    args: ["-y", "@example/mcp-server"]
    envs: { EXAMPLE_FLAG: "1" }     # literal env vars
    env_keys: [EXAMPLE_API_KEY]     # secret names resolved from keyring/secrets.yaml
    timeout: 300
    available_tools: []             # optional filter
  my_http_server:
    enabled: true
    type: streamable_http
    name: my_http_server
    uri: https://example.com/mcp
    headers: { Authorization: "Bearer ..." }
    timeout: 300
```

**[docs-claimed schema; `platform`-type entries observed live in the user config]**.
Bundled `platform` extensions in 1.41: developer, extensionmanager, skills, apps,
analyze, summon, tom, todo, orchestrator, summarize, code_execution, chatrecall
**[verified: user config listing]**.

## 2.3 Delivery paths for an external manager (ranked)

1. **Project plugin `.mcp.json` — the managed-file vehicle.**
   `<project>/.agents/plugins/<name>/` containing:

   ```
   .agents/plugins/drwn/
   ├── plugin.json      # {"name": "drwn", "version": "1.0.0", "description": "..."}
   └── .mcp.json        # {"mcpServers": {"<id>": {"command": "...", "args": [...]}}}
   ```

   **[verified: probe K — a plugin-declared stdio server's tool executed and wrote
   `.goose/memory/probe.txt` to disk, with the user's global config untouched]**.
   `${PLUGIN_ROOT}` substitution and per-server `cwd`/`env` exist
   **[binary-evidence: `plugins/mcp_servers.rs`, `McpServerConfig`]**. Note: this
   capability is in the 1.41 binary but missing from the plugins docs page (which
   lists only skills + hooks as plugin contents) — binary+live evidence leads docs.
   Plugins are also installable/updatable from git (`goose plugin install <url>`,
   `--auto-update`) and disable-able via `disabledPlugins` **[docs-claimed]**.

   **Side effect [verified: probe K post-hoc diff]**: first load of a project plugin
   appends a registration to the **global** `~/.config/goose/config.yaml`
   (`plugins: {<abs plugin path>: {enabled: true}}`). A project drop-in is not
   side-effect-free on user-global state; drwn uninstall/GC must reconcile these
   entries.

2. **Per-invocation CLI flags** (headless runs):
   - `--with-extension 'ENV=val command args...'` — stdio **[verified: probe M3,
     filesystem evidence]**
   - `--with-streamable-http-extension 'url [timeout=100]'` **[help-verified]**
   - `--with-builtin <names>` — **sharp edge**: unknown names are a *silent no-op*
     (`--with-builtin memory` loaded nothing, no error) **[verified: probe M2]**
   - `--no-profile` — run with only CLI-specified extensions **[help-verified]**

3. **Recipe `extensions:` blocks** — full MCP declarations inline in a recipe
   (see §5.2) **[docs-claimed]**.

4. **Global `config.yaml`** — via `goose configure` (interactive-only; no
   non-interactive add subcommand in 1.41) or direct YAML writes. Off-limits for
   drwn's non-invasive posture except with explicit user consent.

`goose mcp <server>` runs goose's bundled MCP servers standalone (e.g.
`goose mcp memory`) — handy as a dependency-free probe server **[verified]**.

## 2.4 Transports & misc

stdio and streamable HTTP are first-class; SSE is legacy-compat **[docs-claimed;
"SSE is unsupported, skipping" appears in the binary for recipes]**. MCP roots,
sampling, and elicitation have dedicated docs pages **[docs-claimed]**. Secrets go in
keyring or `secrets.yaml`; extension `env_keys` resolve from secret storage.

---

# 3. Skills

## 3.1 Directory layout & discovery

`goose skills list` discovers, at minimum **[verified: probe G + live user listing]**:

| Scope | Path | Status |
| --- | --- | --- |
| Project | `<cwd>/.agents/skills/<name>/SKILL.md` | **[verified]** (canonical per docs) |
| Project | `<cwd>/.claude/skills/<name>/SKILL.md` | **[verified]** (compat) |
| Project | `<cwd>/.goose/skills/<name>/SKILL.md` | **[verified]** (compat) |
| User | `~/.agents/skills/` | **[verified]** (canonical) |
| User | `~/.claude/skills/` | **[verified]** (compat) |
| Plugin | `~/.agents/plugins/<plugin>/skills/` (namespaced `plugin:skill`) | **[docs-claimed + binary-evidence]** |

Duplicate-name precedence across dirs: **undocumented, unprobed** — open question if
the same skill id is projected to two dirs.

## 3.2 SKILL.md format

```markdown
---
name: my-skill
description: Use when ... (loaded into context for skill selection)
---
Body: workflow instructions, loaded on demand.
```

`name` + `description` frontmatter required **[verified: fixtures with only these
fields list correctly, with per-skill description/content token counts shown]**.
Supporting files may sit alongside in the skill dir **[docs-claimed]**.

## 3.3 Runtime

Skills load through the `skills` **platform extension**, enabled by default
**[verified: enabled in live config; discovery output confirms the catalog]**.
Activation: model-driven match on description, explicit request ("use the X skill"),
or `/skills` in interactive sessions **[docs-claimed]**. Goose advertises Agent
Skills compatibility (agentskills.io) **[docs-claimed]** — in practice it reads
Claude-format skill dirs unchanged **[verified]**.

---

# 4. Hooks & permissions

## 4.1 Config location — hooks live inside plugins

```
<project>/.agents/plugins/<name>/     # project scope  [verified: probe K discovery]
~/.agents/plugins/<name>/             # user scope     [docs-claimed]
├── plugin.json                       # {"name","version","description"} (also .plugin/ or .goose-plugin/ subdir)
└── hooks/hooks.json
```

## 4.2 Events

11 lifecycle events **[binary-evidence: all names in the 1.41 binary; docs-claimed
semantics]**: `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PostToolUseFailure`, `BeforeReadFile`, `AfterFileEdit`,
`BeforeShellExecution`, `AfterShellExecution`.

Live verification status on 1.41 headless (`goose run`, claude-code provider):

| Event | Fired? |
| --- | --- |
| `SessionStart` | **YES [verified: probe K — marker file written; log `Loaded plugin hooks rule_count=2`]** |
| `PreToolUse` | **NO — did not execute** (JSON block, exit-2 script, and matcher-less marker variants all inert while the goose-delivered tool ran) **[verified negative: probes K2–K4]** |
| `AfterShellExecution` | **NO for provider-layer shell** (shell ran in the claude CLI, not goose's developer extension) **[verified: probe K2]** |
| others | unprobed |

**Open question (requires-config-sandbox)**: whether `PreToolUse` fires under (a) a
direct API provider and/or (b) interactive `goose session`. The probe environment
could not separate "v1.41 headless dispatch gap" from "CLI-harness provider bridge
bypasses goose's tool-execution pipeline" — the only configured API provider key is
dead (401) and the user config is read-only. Do not rely on goose PreToolUse for
policy enforcement until re-probed.

## 4.3 hooks.json schema & protocol **[docs-claimed; loading verified]**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "developer__shell",
        "hooks": [
          { "type": "command", "command": "${PLUGIN_ROOT}/guard.sh", "timeout": 30 }
        ]
      }
    ]
  }
}
```

- `matcher`: optional regex against event context (tool name, file path, shell
  command, prompt text depending on event); omit to match all.
- Commands run via `sh -c` with `PLUGIN_ROOT` in env; stdin receives JSON:
  `event`, `session_id`, `matcher_context`, `tool_name`, `tool_input`,
  `working_dir` (+ `message` / `last_assistant_message` for prompt/stop events).
- Blocking (docs): `PreToolUse` only — exit code `2` (reason from stderr) or stdout
  `{"decision":"block","reason":"..."}`; `Stop` hooks can force the turn to continue.
  Fail-open on errors/timeouts. **[unverified — see §4.2]**

## 4.4 Permission modes (adjacent governance)

`GOOSE_MODE`: `auto` (default-ish; no approval), `approve` (confirm every tool),
`smart_approve` (risk-based), `chat` (no tools) **[docs-claimed; all four mode
descriptions present in the binary]**. Set via `goose configure` → goose settings, or
`/mode` in-session. Per-tool permission tiers (Always Allow / Ask Before / Never
Allow) persist under the config dir (`permission.yaml`,
`permissions/tool_permissions.json`) **[docs-claimed]**. Extension allowlisting via a
`GOOSE_ALLOWLIST` URL **[docs-claimed]**. A prompt-injection scanner with
ALLOW/BLOCK/ALERT actions ships in-binary **[binary-evidence]**. None of these are
project-scoped files an external manager can safely own.

---

# 5. Recipes & sub-workers

## 5.1 Discovery **[verified: probe H for the project dirs]**

`goose recipe list` / `goose run --recipe <name>` resolve from:

1. current directory (`*.yaml` / `*.json`) **[docs-claimed]**
2. `GOOSE_RECIPE_PATH` dirs **[docs-claimed; binary-evidence]**
3. `~/.config/goose/recipes/` **[docs-claimed]**
4. `<project>/.goose/recipes/` **[verified live]**
5. `<project>/.agents/recipes/` **[verified live — in the binary and working, but
   absent from the storing-recipes docs page]**
6. GitHub repo via `GOOSE_RECIPE_GITHUB_REPO` **[docs-claimed]**

`.yml` is not accepted by the CLI (use `.yaml`/`.json`) **[docs-claimed]**.
`goose recipe validate <file>` works offline **[verified]**.

## 5.2 Recipe format

Minimal valid recipe **[verified via `goose recipe validate`]**:

```yaml
version: 1.0.0
title: Probe recipe
description: What this agent run is for
instructions: Do the thing and stop.
```

Full schema **[docs-claimed]**: `instructions` and/or `prompt` (one required),
`parameters` (typed, `required|optional|user_prompt`, Jinja-style `{{ param }}`),
`extensions` (inline MCP declarations — per-recipe tool delivery), `settings`
(provider/model pinning), `sub_recipes`, `response` (JSON output schema), `retry`,
`activities`, `author`. Run: `goose run --recipe <name|path> --params k=v --explain
--render-recipe`.

## 5.3 Subrecipes & subagents (sub-worker analogs)

- **Subrecipes** **[docs-claimed]**: parent declares
  `sub_recipes: [{name, path, values}]`; each becomes a **tool** on the parent agent;
  every invocation runs an **isolated session** (no shared history/state); sequential
  by default, parallel documented separately; `--sub-recipe` adds them at run time.
- **Subagents** **[docs-claimed; summon extension enabled in live config]**: `summon`
  platform extension provides `delegate`/`load`; `GOOSE_SUBAGENT_MAX_TURNS` (default
  25); subagents inherit extensions but cannot enable new ones. Custom agent
  definition dirs `.goose/agents`, `.claude/agents`, `.agents/agents`
  **[binary-evidence, unprobed]**.

Candidate drwn mapping: **recipes in `.goose/recipes/`** are the closest sub-worker
analog — project-discoverable, name-addressable, parameterized, isolated execution,
with per-recipe extension sets.

---

# 6. Sessions, headless runs & version channel

- **Headless**: `goose run -t "..."` / `-i file` / `--recipe`; `--no-session`,
  `--quiet`, `--output-format text|json|stream-json`, `--max-turns`,
  `--max-tool-repetitions`, `--provider`/`--model` per-run overrides
  **[verified: used throughout the probes]**.
- **Sessions**: sqlite at `~/.local/share/goose/sessions/sessions.db`
  **[verified: `goose info`]**; named sessions, resume, fork, `--edit` (transcript in
  `$EDITOR`), export/import — imports Claude Code / Codex `.jsonl`
  **[help-verified]**. Logs: `~/.local/state/goose/logs/cli/<date>/*.log`, JSON
  lines (hook loading and MCP spawn events appear there) **[verified]**.
- **Other frontends**: `goose session`, `term`, `tui`, Desktop app; `goose acp`
  (ACP agent on stdio) and `goose serve` (ACP over HTTP/WS) **[help-verified]**;
  scheduler (`goose schedule`, cron + recipes) **[help-verified]**.
- **Version channel**: weekly minors (v1.38→v1.45 across 2026-06-17→07-29); the
  probed 1.41.0 was 4 minors stale within a month **[verified: gh releases]**.
  Config is additive-churn (new platform extensions per release); the `.agents/`
  directory family (skills/plugins/recipes/agents) is the converging cross-tool
  convention. Docs-vs-binary drift is real in both directions (see §2.3, §5.1) —
  pin qualification gates to a binary version.

---

# 7. Decisive facts for the drwn target design

1. **AGENTS.md is native** — the instructions spine needs **no goosehints adapter**
   **[probe A/A2]**. `.goosehints` exists as an optional goose-specific overlay, and
   both load together when present **[probe C]**.
2. **No project config file** — MCP cannot be delivered via a managed
   `.goose/config.yaml` **[probe F]**. The working project-local vehicle is a
   **drwn-owned plugin dir**: `.agents/plugins/drwn/{plugin.json,.mcp.json}`
   **[probe K]** — analogous to drwn's managed-file approach, just directory-shaped
   (note the global-config registration side effect, §2.3).
   Fallbacks: recipe `extensions:` blocks, or `--with-extension` for one-shot runs
   **[probe M3]**.
3. **Skills are free** — drwn's existing `.claude/skills` projections are discovered
   by goose unchanged **[probe G]**; `.agents/skills` is the forward-canonical path.
4. **Hooks: lifecycle yes, tool-governance unproven** — project plugins load and
   `SessionStart` fires **[probe K]**, but `PreToolUse` never executed in the probe
   environment **[K2–K4]**; treat goose tool-call policy enforcement as unavailable
   pending an API-provider re-probe (requires-config-sandbox).
5. **Provider class changes the harness contract** — CLI-harness providers
   (claude-code et al.) inject foreign context (CLAUDE.md) and execute shell outside
   goose's extension/hook pipeline **[probes D2, K2]**. Qualification must pin the
   provider class.
6. **Fast-moving target** — weekly minors, additive config churn, docs drift; gate
   on binary-version-pinned probes, not docs.

---

## Appendix — file map at a glance

```
~/.config/goose/                     # XDG_CONFIG_HOME-redirectable [verified]
├── config.yaml                      # THE config: provider, extensions:, settings [verified]
├── secrets.yaml                     # secrets when keyring disabled [observed; never read]
├── .goosehints                      # global standing instructions [verified via sandbox]
├── permission.yaml                  # per-tool permissions [docs-claimed]
├── permissions/tool_permissions.json# runtime permission decisions [docs-claimed]
└── recipes/                         # global recipe library [docs-claimed]

<project>/
├── AGENTS.md                        # ingested natively [verified]
├── .goosehints                      # ingested, combines with AGENTS.md [verified]
├── .agents/
│   ├── skills/<name>/SKILL.md       # canonical project skills [verified]
│   ├── recipes/*.yaml               # project recipes [verified]
│   ├── agents/                      # custom agents [binary-evidence]
│   └── plugins/<name>/
│       ├── plugin.json              # required manifest [verified]
│       ├── .mcp.json                # project-local MCP delivery [verified]
│       ├── hooks/hooks.json         # lifecycle hooks [SessionStart verified]
│       └── skills/                  # plugin skills [docs-claimed]
├── .claude/skills/<name>/SKILL.md   # compat: discovered as-is [verified]
├── .goose/
│   ├── skills/<name>/SKILL.md       # compat skills dir [verified]
│   ├── recipes/*.yaml               # project recipes [verified]
│   ├── memory/                      # memory-server local store [verified side-effect]
│   └── config.yaml                  # NOT read by goose [verified negative]

~/.local/share/goose/sessions/sessions.db   # session store (sqlite) [verified]
~/.local/state/goose/logs/cli/<date>/*.log  # JSON-line logs [verified]
/etc/goose/config.yaml                      # system-level config [binary-evidence]
```

Experiment record: `~/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/07-goose-target-evidence/NOTES.md`
(probe outputs + fixtures under `evidence/`).
