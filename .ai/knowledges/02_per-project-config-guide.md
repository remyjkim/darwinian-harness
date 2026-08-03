# ABOUTME: Documents the first supported project config, lock, local overlay, and projection contracts.
# ABOUTME: Covers Worker roots, singular selection, explicit capabilities, extensions, and diagnostics.

# Per-Project Config Guide

## Purpose

Use project state when a repository needs an explicit, reproducible agent harness. Project capabilities come from one selected Worker closure plus project-owned overlays. They do not inherit the machine Worker.

The complete contract is in [`docs/contracts/project-worker-v1.md`](../../docs/contracts/project-worker-v1.md).

## Discovery

The committed config path is:

```text
<project>/.agents/drwn/config.json
```

Discovery walks upward from the current working directory and uses the nearest config. Commands outside a configured project operate at explicit machine scope.

Project-aware commands include `drwn add`, `drwn apply`, `drwn remove`, `drwn pin`, `drwn update`, `drwn use`, `drwn install`, `drwn write`, `drwn status`, `drwn doctor`, and project-aware skill/MCP/extension commands.

## Scaffold

```bash
drwn init
drwn init --non-interactive
```

Prompt-free setup writes:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": [],
  "activeWorker": null
}
```

Machine setup is a separate contract. Prompt-free initialization creates
explicit empty `drwn.machine` V2 intent (`activeWorker: null`,
`workerLock: null`), while guided initialization offers the opt-out recommended
`@curation-labs/machine-defaults` Blueprint. Neither choice adds a project
Worker. A project that depends on Operator includes the current Operator Card
release in its own selected Blueprint.

Machine V2 embeds a project-lock-shaped value for its own selected closure, but
that does not make it project state. `drwn write` uses the nearest project;
`drwn write --root` uses only machine intent and user-home targets. V1 and
prototype machine configurations are rejected rather than inherited or
migrated.

## Supported Config

A representative config is:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": ["@team/operator@^1.0.0"],
  "activeWorker": "@team/operator",
  "materialization": "vendored",
  "committedSurfaces": true,
  "mcpServers": {
    "context7": { "enabled": true }
  },
  "skills": {
    "include": ["frontend-design"],
    "exclude": ["unused-skill"]
  },
  "hooks": {
    "exclude": ["audit-policy"],
    "runtimes": {
      "claude-code": { "enabled": true },
      "codex": { "enabled": false }
    },
    "signals": { "enabled": true }
  },
  "extensions": {
    "parallel": { "enabled": true, "skills": true, "mcp": false },
    "beads": { "enabled": true, "targets": ["codex", "claude"], "includeSkill": true },
    "markitdown": { "enabled": true, "skills": true }
  },
  "targets": {
    "claude": { "enabled": true },
    "codex": { "enabled": true },
    "cursor": { "enabled": false }
  }
}
```

`workers` stores ordered top-level root requirements. A root is a plain Card or a Blueprint. Blueprint members are not repeated in config.

`activeWorker` is required. It is one installed canonical root name or `null`; there is no implicit selection.

## Roots And Composition

Cards are capability units. A Blueprint composes ordered plain Cards into one Worker:

```json
{
  "name": "@team/operator",
  "version": "1.0.0",
  "kind": "blueprint",
  "composedFrom": [
    "@team/notion@^1.0.0",
    "@team/fal@^1.0.0"
  ]
}
```

Given that Blueprint and an independent Card root, the lock graph is:

```text
roots = [operator, independent]
cards = [operator, notion, fal, independent]
selected = operator
active closure = [operator, notion, fal]
```

Multiple roots are alternatives. To change composition, publish or select a different Blueprint.

## Canonical Mutations

```bash
drwn add @team/operator@^1.0.0
drwn apply @team/operator@^1.0.0
drwn apply @team/operator@^1.0.0 @team/alternate@^1.0.0 --active @team/operator
drwn pin @team/operator@1.2.3
drwn update
drwn update @team/operator
drwn remove @team/alternate
drwn use @team/operator
drwn use --none
```

Config and lock are prepared and committed together. Root mutations support `--dry-run`. `drwn use` projects after selection by default; use `--no-write` to stop after committing intent.

## Lock Contract

`.agents/drwn/card.lock` uses `schema: "drwn.project-lock"` and `schemaVersion: 1`. It records:

- `workerRoots` in requirement order;
- each root's requested ref, kind, and ordered member names;
- one deduplicated `cards` entry per root/member artifact;
- exact version, integrity, manifest, origin, requested ref, and content provenance;
- tree SHA and Git commit where required;
- the minimum CLI feature floor needed by locked content.

The lock is committed. Run `drwn install --frozen` in CI to require all artifacts without allowing fetch or lock changes. Run `drwn install --no-write` when hydration should not project downstream files.

## Local Overlay

Machine-local development overrides belong in `.agents/drwn/config.local.json`:

```json
{
  "schema": "drwn.project-local",
  "schemaVersion": 1,
  "activeWorker": "@team/operator",
  "cardReplacements": {},
  "localOnlyRoots": [],
  "sourceOverrides": {}
}
```

The local lock is `.agents/drwn/card.lock.local` and uses the project-lock V1 schema. Local state is ignored by Git, never rewrites committed root requirements, and remains separately attributed in status.

## Skills

`skills.include` resolves explicit project skills from project-safe sources. `skills.exclude` wins over Card, extension-derived, or explicit includes. Unknown and ambiguous IDs fail before mutation.

Card-bundled content takes precedence within the selected closure according to root/member order. Inactive roots do not contribute skills.

## MCP Servers

`mcpServers` may enable/disable a known project definition or provide a complete project-owned definition. Optional Card MCP definitions can be enabled only when their owning Card is in the selected closure.

Notion OAuth, an `ntn` API key, and external stdio installations such as Momentic remain operator state. Definitions may reference environment variables, but project files must not contain resolved secrets.

User-home target MCP entries remain ambient in project sessions. They are not
part of the project Worker, Card, lockfile, or generated state. `status`, `doctor`, and
`mcp list` report declared and ambient provenance through redacted references;
definition payloads and secret-bearing values are never emitted.

Project writes apply the target-native collision policy before any projection
mutation. Claude's whole-entry precedence makes a differing user or local entry
a shadowing warning. Codex merges project fields over user fields, so compatible
augmentation is a warning while an effective entry containing both `command`
and `url` fails with `CODEX_INCOMPATIBLE_TRANSPORTS`. Cursor collisions are
warnings, including transport changes, because its duplicate-ID merge behavior
is characterization-tested rather than a published contract. Identical entries
are accepted for every target.

Only enabled targets selected for the operation can block a standard or
MCP-only write. Skills-only projection reports collisions without blocking;
dry-run applies the same fatal policy without mutation. `--force` cannot bypass
the classifier. Remediation removes, renames, or aligns the conflicting target
entry instead of importing ambient machine state into project declarations.

This policy validates configuration composition only. OAuth grants, API keys,
external executables, environment expansion, timeouts, and MCP initialize
handshakes remain separate operator-owned runtime-readiness concerns.

## Extensions

`extensions.parallel`, `extensions.beads`, and `extensions.markitdown` store semantic project intent:

- Parallel can derive `parallel-web-search`, `parallel-web-extract`, `parallel-deep-research`, and `parallel-data-enrichment`.
- Beads can derive `beads-task-tracking` when `includeSkill` is true.
- MarkItDown derives `markitdown-document-conversion` unless `skills` is false.

Extension setup does not silently authenticate third-party services. `skills.exclude` still wins over extension-derived includes.

## Projection

Project write targets include:

```text
<project>/.mcp.json
<project>/.claude/settings.json
<project>/.claude/skills/
<project>/.codex/config.toml
<project>/.codex/skills/
<project>/.codex/hooks.json
<project>/.cursor/mcp.json
<project>/.agents/drwn/generated/
<project>/.agents/drwn/write-record.json
```

`drwn write` is a pure projection. Full, dry-run, target-specific, skill-only, and MCP-only modes leave config, lock, root requirements, and selection byte-identical.

Generated state contains one aggregate directory per root. A selected Blueprint projects its root plus ordered members as one closure. Generated bytes are disposable; project intent is never reconstructed from them.

## Status And Doctor

```bash
drwn status --json
drwn status --why skill:<name>
drwn doctor --json
```

Project JSON status uses `drwn.project-status` V1 and separates:

- installed roots;
- one selected root;
- active closure Cards;
- committed and local overlays;
- declared skills, MCP servers, and hooks;
- ambient user-home observations;
- projection health.

`doctor` is report-only. Neither command repairs project state.

## Recommended Workflow

```bash
cd /path/to/project
drwn init --non-interactive
drwn apply @team/operator@^1.0.0
drwn use @team/operator --no-write
drwn status --json
drwn write --dry-run
drwn doctor --json
drwn write
```

## Reproducibility Boundary

Cards and locks pin harness content, not the host:

- use package lockfiles for application dependencies;
- use mise/asdf/Flox/Nix for runtimes and system libraries;
- use Docker/Compose for services;
- use drwn for Worker/Card capability state.

MCP runtimes should be version-pinned in their command args when reproducibility matters. Agent tool versions, OAuth grants, API keys, and external executables remain separately managed.

## Safety

There is no public whole-Store archive command. Project and deploy flows never use a broad Store archive. For an unsupported development project, follow [`docs/prelaunch-project-reset.md`](../../docs/prelaunch-project-reset.md); do not ask the supported CLI to interpret old files. Portable machine inventory transfer remains a separate Task 82 contract.
