# ABOUTME: Preserves the historical Goose 1.41.0 same-ID precedence probe and its immutable evidence identity.
# ABOUTME: Adds the authoritative Goose 1.45.0 source delta that candidate v5 must qualify separately.

# I214 Goose Skill Precedence Probe and Latest-Source Audit

**Status:** Historical frozen live probe plus authoritative latest-source audit; candidate v5 integrity pending

**Date:** 2026-08-11

## Historical live probe — Goose 1.41.0

This section preserves the exact live evidence used by candidates v2 through v4. It remains
valid evidence for the identified 1.41.0 binary and source commit; it is not a live-runtime
qualification of Goose 1.45.0. The frozen candidate-v2/v3/v4 document digest remains
`7a21ec6156717f1abdd43479026ff043de4ef13a94640f8aeb1db553093ae280` in the decision register.

**Runtime:** `/opt/homebrew/bin/goose` 1.41.0, arm64 Mach-O

**Binary SHA-256:** `ccbc134fdc59cb75c929fbb337951a3a1fd0b66231a9283515bbfb620fb01d50`

## Question

When the same skill ID is visible from multiple Goose-supported roots, which source does
Goose 1.41.0 select? This decides whether drwn can use project `.agents/skills` while
preserving existing Claude target projections in `.claude/skills`.

## Isolation

The probe used `/tmp/i214-goose-skill-precedence.RHBPU9` with distinct temporary `HOME`,
`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, and `XDG_CACHE_HOME`. The real home,
Goose configuration, credentials, and target worktree were not written.

Goose created only isolated `projects.json` and CLI logs under the temporary XDG data/state
roots. It did not create or modify an isolated `config.yaml`.

## Fixture

Five `collision/SKILL.md` files had identical `name: collision` and distinct description/body
sentinels:

- project `.agents/skills`: `PROJECT_AGENTS_SENTINEL`;
- project `.goose/skills`: `PROJECT_GOOSE_SENTINEL`;
- project `.claude/skills`: `PROJECT_CLAUDE_SENTINEL`;
- user `.agents/skills`: `USER_AGENTS_SENTINEL`;
- user `.claude/skills`: `USER_CLAUDE_SENTINEL`.

Each observation ran this command from the isolated project root:

    HOME=<isolated-home> \
    XDG_CONFIG_HOME=<isolated-xdg-config> \
    XDG_DATA_HOME=<isolated-xdg-data> \
    XDG_STATE_HOME=<isolated-xdg-state> \
    XDG_CACHE_HOME=<isolated-xdg-cache> \
    /opt/homebrew/bin/goose skills list

After each observation, the winning project/user file was removed from the fixture so the
next candidate could be observed. No network or provider was required.

## Observations

| Present same-ID roots | Selected description | Selected location |
| --- | --- | --- |
| all five | `PROJECT_AGENTS_SENTINEL` | project `.agents/skills/collision` |
| without project `.agents` | `PROJECT_GOOSE_SENTINEL` | project `.goose/skills/collision` |
| without project `.agents` and `.goose` | `PROJECT_CLAUDE_SENTINEL` | project `.claude/skills/collision` |
| user roots only | `USER_AGENTS_SENTINEL` | user `.agents/skills/collision` |
| user `.claude` only | `USER_CLAUDE_SENTINEL` | user `.claude/skills/collision` |

Observed precedence subset:

    project .agents > project .goose > project .claude > user .agents > user .claude

Goose listed one `collision` result rather than exposing all duplicates.

Immutable source inspection at Goose v1.41.0 commit
`39c27c387d726ce4605108d2f974d4feec158ed5` independently confirms first-name-wins and
the complete root order: project `.agents`, project `.goose`, project `.claude`, user
`.agents`, Goose config-dir `skills`, user `.claude`, user `.config/agents/skills`,
installed-plugin skill roots, then built-ins. The live fixture intentionally covered the
five unnamespaced roots most likely to collide with drwn output.

## Historical architecture consequence

Project `.agents/skills` is the default and authoritative drwn-owned Goose projection. It
wins over existing project `.claude/skills` output, so enabling Goose and Claude together
does not require changing Claude's established projection. Drwn still reports shadowed
same-ID sources, and a runtime version other than the exact qualified 1.41.0 cannot rely on
this precedence without new evidence.

## Authoritative latest-source audit — Goose workspace 1.45.0

The authoritative current local source supplied by the Owner is `/Users/pureicis/dev/goose` at
commit `db7a704446975c88d3b67490c74d33bcd684404e`, whose workspace version is `1.45.0`.
This is source evidence, not a fresh live-binary precedence probe.

The latest source retains the ordered exact-working-directory roots `.agents`, `.goose`, and
`.claude`, followed by global roots and installed plugins, and still applies first exact,
case-sensitive frontmatter-name wins. Same-root enumeration remains unsorted. Exact seams:
`crates/goose/src/skills/mod.rs:313-342,383-488`. The 1.41.0 live observation therefore remains
directionally corroborated, but a candidate-v5 positive runtime claim must bind the latest
source identity and its invocation engine instead of silently extending the old binary claim.

### Latest-source qualification deltas

| Delta | Source-backed consequence for candidate v5 |
| --- | --- |
| Two skill engines | `GOOSE_STATE_MACHINE=1|true|TRUE|yes` selects the new state-machine reply path; a bang-shell message also selects it for that reply (`crates/goose/src/agents/state_machine/mod.rs:56-60`; `crates/goose/src/agents/agent.rs:1888-1894`). That path always installs `SkillOperation`, which discovers skills directly from the session working directory (`crates/goose/src/agents/agent.rs:1631-1659`; `crates/goose/src/agents/state_machine/ops_skills.rs:54-76,93-113,292-340`). The legacy path still requires the effective `skills` platform extension. `--no-profile`, recipe extension ownership, and persisted MCP vectors therefore suppress or carry MCP without necessarily suppressing state-machine skills. |
| Chat mode | Both engines can load instructions and disclose skills, but state-machine `load_skill` and backend extension calls are skipped in Chat mode (`crates/goose/src/agents/state_machine/ops_skills.rs:303-340`; `crates/goose/src/agents/state_machine/ops_toolcalling.rs:643-725`). Positive tool-invocation evidence remains non-chat. |
| `GOOSE_PATH_ROOT` | Latest `Paths` uses `var_os` and accepts the override only when it is absolute; unset, empty, or relative values fall through to platform paths, while an absolute non-Unicode OS path is accepted (`crates/goose/src/config/paths.rs:40-45,103-119`). Plugin settings use that same validated root (`crates/goose/src/plugins/discovery.rs:194-209`). This supersedes, for candidate v5 only, the historical 1.41.0 model where Unicode-readable empty/relative values won and non-Unicode values fell through. |
| HTTP surface | The legacy `crates/goose-server` and `/agent/start` surface were removed. `goose serve` is ACP over HTTP/WebSocket and shares ACP new/load/fork activation; candidate v5 must delete the separate legacy-HTTP coverage row rather than invent replacement precedence. |
| TUI | The repository no longer contains the TUI runtime used by the launcher. `goose tui` defaults to mutable `@aaif/goose@latest` and searches for local code only relative to executable ancestors (`goose-cli/src/commands/tui.rs:5-43`). Static source evidence can qualify the launcher only; TUI activation remains unverified without a separately pinned npm artifact. |
| Summon hooks | Summon marks child Agents as subagents, and subagent construction installs an empty HookManager (`crates/goose/src/agents/agent.rs:406,433-440`; `crates/goose/src/agents/platform_extensions/summon.rs:1302,1859`). The child still inherits or filters the parent's persisted extension vector, but no project-hook registration occurs in that child. |

## Candidate-v5 architecture consequence

The Owner's `.agents/` direction remains consistent with both the historical live probe and the
latest root order. Candidate v5 must nevertheless report precedence and activation separately:

- projection to project `.agents/skills` remains the default;
- same-root exact-name contenders remain fail-closed because their winner is enumeration-order
  dependent;
- later-root contenders remain warnings only under an exactly qualified source/runtime model;
- positive skill activation must name the selected legacy or state-machine engine;
- legacy activation requires an observed effective vector containing `skills`, while the
  state-machine engine discovers project skills directly from the concrete session CWD; and
- latest-source evidence does not become a frozen candidate-v5 integrity set until the amended
  architecture, strategy, coverage, probe, and decision-register bytes are hashed and reviewed.
