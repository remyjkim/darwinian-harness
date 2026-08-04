# Use drwn with OpenCode

The `opencode` target projects the same declared harness that Claude Code and Codex receive into OpenCode's own surfaces. This page covers what a write produces, how the dedicated skills directory shifts OpenCode's cross-scope skill dedup toward the project, the residual dedup race that remains, and the diagnostics that watch it.

## What a Project Write Produces

Inside a configured project with the `opencode` target enabled, `drwn write` maintains three OpenCode surfaces:

- **MCP servers** — merged into `opencode.json` under the `mcp` key. Every other key in the file is user-owned configuration and passes through untouched.
- **Skills** — the composed project skill set is copied into `.agents/drwn/opencode-skills/` and declared project-relative in `opencode.json` under `skills.paths`.
- **Hooks** — consented card hook policies compose into the `.opencode/plugins/drwn-hooks.js` plugin.

A projected `opencode.json` looks like:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "context7": { "type": "local", "command": ["npx", "-y", "@upstash/context7-mcp"], "enabled": true }
  },
  "skills": {
    "paths": [".agents/drwn/opencode-skills"]
  }
}
```

`opencode.json` stays user-owned: drwn records per-server field hashes plus the `skills.paths` entry it added, and cleanup removes only those. User-authored servers and user-added `skills.paths` entries are preserved — the managed path is appended, never replaced.

## Why a Dedicated Skills Directory

OpenCode discovers skills from several sources at once — `~/.agents/skills/` (the drwn machine store), `~/.claude/skills/`, project `.claude/skills/`, and project `.opencode/skills/` — and dedupes same-named skills across them. Without the declaration, the machine-home copy won that dedup on every observation made against OpenCode 1.18.4: a project's customized copy of a same-named skill silently lost, and sessions read the machine bytes.

Declaring a **novel** directory via `skills.paths` is the lever that shifts this. The effect is group-level, not path-level: with the declaration in place, OpenCode resolves one of the *project's* copies (the declared directory or another project surface such as `.claude/skills` — which carry identical composed bytes) in the large majority of resolutions. Re-declaring an already-scanned path (such as `.claude/skills`) changes nothing, which is why drwn projects a dedicated directory under its own project home instead of reusing an existing surface.

### The residual dedup race

OpenCode 1.18.4's source scan is nondeterministic. Measured over 90 probes against an identical drwn-written project, the machine-store copy still won 21 resolutions (per-run rates ranged 17–30%); the rate is condition-dependent and upstream-nondeterministic, so no fixed number can be claimed. The declaration moves the failure from *every* session to *intermittent* — a large reduction, **not** an elimination. If a customized skill occasionally behaves like the machine-store version in an OpenCode session, this race is the likely cause; the only full closure is removing the same-named machine-store copy itself.

`.agents/drwn/opencode-skills/` is a projection of the same composed skill set written to `.claude/skills/` — one composer writes both in the same step. Do not edit it; edit the card source and rerun `drwn write`. The directory is gitignored by default alongside the other projection surfaces (see `committedSurfaces` for opting in to committed projections).

## Partial Writes

The `skills.paths` declaration carries skill-surface semantics inside the shared `opencode.json` ownership record:

- `drwn write` maintains the directory, the declaration, and the `mcp` key.
- `drwn write --skills-only` writes the directory **and** updates `skills.paths`, leaving the `mcp` key untouched.
- `drwn write --mcp-only` maintains the `mcp` key only and retains `skills.paths` as recorded.

## The `opencode.jsonc` Limitation

drwn only manages `opencode.json`. When an `opencode.jsonc` file exists, the write skips the config entirely: MCP servers and the `skills.paths` declaration are withheld with a warning, while the skills directory is still projected. In that state the machine-store copy keeps winning skill dedup — migrate the config to `opencode.json`, or declare `.agents/drwn/opencode-skills` in the `.jsonc` yourself. The shadowing diagnostic recognizes a manual declaration in `opencode.jsonc` (comments and trailing commas tolerated) and downgrades the warning accordingly.

## The Shadowing Diagnostic

`drwn doctor` and `drwn status` report cross-scope skill shadowing per project. For each projected skill whose name also exists in `~/.agents/skills/` or `~/.claude/skills/`, project status carries an `OPENCODE_SKILL_SHADOWED` issue under `ambientCapabilities.opencodeSkillShadowing`:

- **warning** — the managed `skills.paths` declaration is absent or drifted; OpenCode resolves the machine copy and project customization does not reach sessions. Run `drwn write` (with `opencode.jsonc`, declare the directory manually).
- **advisory** — the declaration is present and current: shadowing risk is reduced, not eliminated. The collision remains live and the [residual dedup race](#the-residual-dedup-race) can still intermittently resolve the machine copy; eliminating the same-named machine-store skill is the only full closure.

Only skills the opencode surface actually projects (shared and Claude-surface scopes) are inspected; codex-only skills cannot produce these issues. Warnings never change doctor's exit code; only error-severity issues do.

## Machine Scope

`drwn write --root` merges machine-Worker MCP servers into `~/.config/opencode/opencode.json` and composes machine hook policies into `~/.config/opencode/plugins/drwn-hooks.js`. The dedicated skills directory is a project-scope surface only: machine writes do not create it, and the machine skill store remains `~/.agents/skills/`.

## Cross-References

- [MCP Servers](../concepts/mcp-servers) for registry and merge semantics
- [Ownership and Write Records](../concepts/ownership-and-write-records) for managed-field ownership
- [Diagnostics Model](../concepts/diagnostics-model) for doctor and status behavior
