# drwn CLI Quick Reference

A consolidated single-file reference for the `drwn` CLI. Pairs with the [public docs site](https://docs.darwinian.dev) and the [as-built architecture reference](../.ai/knowledges/10_drwn-cli-architecture.md).

For project framing and install, see the [root README](../README.md).

## Contents

- [Quickstart](#quickstart)
- [What it changes on disk](#what-it-changes-on-disk)
- [Usage modes](#usage-modes)
- [Command reference](#command-reference)
- [How write works](#how-write-works)
- [How export works](#how-export-works)
- [MCP registry](#mcp-registry)
- [Machine inventory](#machine-inventory)
- [Extension skill bundles](#extension-skill-bundles)
- [Extensions](#extensions)
- [Per-project configuration](#per-project-configuration)
- [Layered reproducibility](#layered-reproducibility)
- [Diagnostics](#diagnostics)
- [Optional extensions](#optional-extensions)

## Quickstart

Start by inspecting before writing:

```bash
drwn status
drwn machine skill list
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

For a project-specific setup, start in the project directory:

```bash
drwn init
drwn extensions add parallel
drwn add skill <skill-name-or-query>
drwn add mcp <server-name>
drwn write --dry-run
drwn write
```

For scripts and CI-style setup, make `init` explicit:

```bash
drwn init --non-interactive
```

Non-interactive and minimal setup initialize explicit empty machine intent.
Guided setup offers the opt-out recommended machine-defaults Blueprint.
drwn 1.1.0 introduces machine Worker V2; Operator 2.0.2 requires drwn 1.1.0
or newer.

## Machine Capability Contract

Machine intent lives only in `~/.agents/drwn/machine.json`:

```json
{
  "schema": "drwn.machine",
  "schemaVersion": 2,
  "policy": {},
  "capabilities": {
    "activeWorker": null,
    "workerLock": null
  }
}
```

Only V2 is supported. V1 and prototype shapes are rejected without migration
or dual read. `drwn init --non-interactive` and `--minimal` create the exact
empty intent above. Guided setup offers
`@curation-labs/machine-defaults`; declining leaves it empty.

When selected, `activeWorker` contains the canonical Blueprint Card name and
`workerLock` embeds a validated `drwn.project-lock` V1 value. Its root
`requested` field preserves the versioned Store/pinned Git ref or explicit
integrity-locked file source. File-origin bytes are re-hashed before projection.
The active closure supplies skills, MCP definitions, a generated aggregate
Worker, and consented hooks and instructions. Inactive roots and standalone
inventory do not contribute.

Select or replace the machine Worker, grant Card consent, then project:

```bash
drwn apply --root <worker-blueprint-ref>
drwn use --root <worker-name-or-ref> --no-write
drwn card trust <card-name> --hooks --scope machine
drwn card trust <card-name> --instructions --scope machine
drwn write --root --dry-run
drwn write --root
```

`drwn use --root --none --no-write` clears selection while retaining installed
alternative roots. `apply --root <refs> --none` replaces the root set but keeps
those refs unselected; `apply --root --none` with no refs clears all roots.
The legacy `drwn machine skill|mcp enable|disable` commands fail nonzero with
Blueprint guidance. Inventory and authoring checkouts are not activation
authority, and mutable `catalogCheckouts` are never searched at runtime.

Machine projection is ownership-recorded. A destination or same-ID MCP field
absent from the global write record is foreign and fails with
`MACHINE_PROJECTION_CONFLICT`, even when bytes are identical or `--force` is
present. Force repairs drift only for prior drwn-owned state. Removal deletes
only unchanged prior-owned bytes or fields; foreign and drifted state is
preserved and reported by `drwn doctor`.

For a controlled prelaunch reset, record non-secret intent, back up
`machine.json` and `global-write-record.json` outside the state root, remove the
unsupported V1/prototype files deliberately, run setup, select a Blueprint,
preview with `drwn write --root --dry-run`, and resolve ownership findings without
claiming foreign paths.

## What it changes on disk

`drwn` can read and write local agent configuration under:

- `~/.agents`
- `~/.claude`
- `~/.codex`
- `~/.cursor`
- `~/.config/opencode` (when the opencode target is enabled)
- `<project>/.agents/drwn/config.json`

The normal write path is conservative:

- `drwn write --dry-run` previews changes
- write creates or replaces managed symlinks and generated MCP config
- drwn-owned stale downstream skill symlinks are removed on the next write; user-owned replacements are preserved and warned
- `drwn doctor` reports issues without fixing them

## Usage modes

### Packaged harness

Use the published package when you want the default config and CLI behavior:

```bash
curl -fsSL https://bun.sh/install | bash
npm install -g darwinian
drwn write --dry-run
```

The published `drwn` entrypoint requires Bun 1.2+ at runtime. npm installs the
package and binary; Bun executes the TypeScript CLI.

Keep using `drwn` as the primary command in examples and automation.

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

For a global `drwn` that runs the checkout's source:

```bash
bun link
drwn --help
```

## Command reference

General commands:

- `drwn status`
- `drwn doctor`
- `drwn scan`
- `drwn init`
- `drwn add skill [name-or-query]`
- `drwn add mcp [name-or-query]`
- `drwn search skill <query>`
- `drwn search mcp <query>`
- `drwn machine skill list`
- `drwn machine skill show <skillId>`
- `drwn machine skill show --package <packageName>`
- `drwn machine skill references <skillId>|--package <packageName> [--project <root>]`
- `drwn machine skill install <packageSpec|SKILL.md|skillDir>`
- `drwn machine skill update <packageName> --from <source>`
- `drwn machine skill uninstall <packageName>`
- `drwn machine mcp list`
- `drwn machine mcp show <serverName>`
- `drwn machine mcp references <serverName> [--project <root>]`
- `drwn machine mcp add <jsonFile> --as <serverName>`
- `drwn machine mcp update <serverName> --from <jsonFile>`
- `drwn machine mcp remove <serverName>`
- `drwn machine inventory gc [--prune] [--json]`
- `drwn write`
- `drwn extensions list`
- `drwn extensions show <extensionName>`
- `drwn extensions status [extensionName]`
- `drwn extensions doctor [extensionName]`
- `drwn extensions setup beads`
- `drwn extensions setup parallel`
- `drwn extensions setup markitdown`
- `drwn extensions add <extensionName>`
- `drwn add <rootRef> [--dry-run] [--write]`
- `drwn apply <rootRef>... [--active <root>|--none] [--dry-run] [--write]`
- `drwn remove <rootName> [--dry-run] [--write]`
- `drwn pin <rootRef> [--dry-run] [--write]`
- `drwn update [rootName] [--dry-run] [--write]`
- `drwn use <rootNameOrRef>|--none [--no-write] [--dry-run]`
- `drwn apply --root <rootRef>... [--active <root>|--none] [--write] [--dry-run]`
- `drwn use --root <rootNameOrRef>|--none [--no-write] [--dry-run]`
- `drwn card trust <cardName> --hooks|--instructions --scope machine`
- `drwn install [--frozen] [--no-write] [--json]`
- `drwn install --frozen --org-worker-bundle <json> --worker-artifact-snapshot <json> --operation-id <id> [--dry-run] [--no-write] [--reconcile|--remove] [--json]`
- `drwn projects list`
- `drwn projects update --all [--fetch] [--dry-run] [--json]`
- `drwn projects unregister <projectRoot> [--dry-run] [--json]`
- `drwn projects prune [--dry-run] [--json]`

Authoring preferences (persisted in non-secret
`~/.agents/drwn/config.json`, separate from capability intent in
`machine.json`):

- `drwn config get catalogCheckouts|defaultAuthorScope`
- `drwn config set catalogCheckouts <json-array>`
- `drwn config set defaultAuthorScope <@scope>`
- `drwn card new <name> [--scope @scope] [--into <collection>]`
- `drwn card new <name> --from-project [projectPath] [--into <collection>]`
- `drwn card new <name> --from-defaults [--into <collection>]`
- `drwn card publish [name] [--from <source-path>] [--json] [--force-bump-mismatch]`
- `drwn card release [name] [--from <source-path>] [--bump <patch|minor|major>] [--yes]`
- `drwn card catalog publish <cardRef> --catalog <scope|git-url|path> --mode <local|direct>`
- `drwn card source list` (deprecated migration guidance; exits non-zero)
- `drwn card source show <path-or-name>`
- `drwn card source doctor <path-or-name>`
- `drwn card source sync <path-or-name> [--check] [--json]`
- `drwn card source add-skill <path-or-name> <skillName> [--from <SKILL.md|skillDir>]`
- `drwn card source remove-skill <path-or-name> <skillName>`
- `drwn card source add-hook <path-or-name> <policyName>`
- `drwn card source remove-hook <path-or-name> <policyName>`
- `drwn card source set <path-or-name> [--instructions-text <text>|--instructions-path <relative-path>|--clear-instructions] [options]`
- `drwn card source add-mcp <path-or-name> <serverName>`
- `drwn card source remove-mcp <path-or-name> <serverName>`
- `drwn card outdated [--check]`
- `drwn card list`
- `drwn card show <cardRef>`
- `drwn card status [--explain]`
- `drwn card trust <name> (--hooks|--instructions) [--range <semverRange>]`
- `drwn card untrust <name> (--hooks|--instructions)`
- `drwn card audit`
- `drwn card diff <beforeRef> <afterRef>`
- `drwn card deprecate <cardRef>`
- `drwn card validate <cardRef>`

Card sources are ordinary repositories selected by path or by a unique manifest
match under configured catalog checkouts. `card source list` is retained only
as deprecated migration guidance. Published cards are immutable store releases
under `~/.agents/drwn/cards/`, and consumed cards are the refs and locks recorded
by a project.

Publishing requires exactly one source input. `--from` and direct paths accept
relative, absolute, `~`, `file:`, and `file://` forms. A bare Card name resolves
only when exactly one configured checkout has a matching manifest at its
immediate `cards/*/card.json`; zero matches report `--from` guidance and multiple
matches are an ambiguity error. If both a name and `--from` are supplied, the
manifest name must match. `source sync` only refreshes skills declared through
`skills.upstream`; it does not copy a Card into machine state. A pre-I176
`~/.agents/drwn/sources/` tree is read-only legacy operator data and is never
created, moved, or deleted automatically.

Worker Blueprint authoring and remote operations:

- `drwn worker new <name> [--into <collection>]`
- `drwn worker compose <path-or-name> --add <cardRef>`
- `drwn worker publish [name] [--from <source-path>]`
- `drwn org list [--limit 1-100] [--cursor <opaque>] [--json]`
- `drwn org use <organizationId> [--json]`
- `drwn worker register --organization <organizationId> --name <name> --environment development|staging|production [--json]`
- `drwn worker use <deployedWorkerId> [--json]`
- `drwn worker deploy <rootRef> [--deployed-worker <id>] [--json]`
- `drwn worker list`
- `drwn worker status [deployedWorkerId] [--json]`
- `drwn worker deployments [--deployed-worker <id>] [--limit 1-100] [--cursor <opaque>] [--json]`
- `drwn worker rollback [--deployed-worker <id>] --to <deploymentId> [--json]`
- `drwn worker chat [--deployed-worker <id>] --message <text> [--no-wait] [--json]`
- `drwn worker run status <runId> [--deployed-worker <id>] [--json]`
- `drwn worker retire [--deployed-worker <id>] --yes [--json]`
- `drwn worker materialize --payload <payload.json> --project-root <path> [--store-export <tar>] [--emit-store-tar <tar>] [--emit-project-tar <tar>] [--json]`
- `drwn worker buzz-tools`
- `drwn worker secret set <name> [--deployed-worker <id>] [--kind mcp|env] [--env-var <NAME>] [--json]` (secret bytes come from stdin)
- `drwn worker mind` (provider-neutral placeholder; returns `MIND_BACKEND_UNSELECTED` without I/O)

Cards compose capabilities into one Blueprint. Installed Worker roots are
alternatives; `drwn use` selects at most one root for project projection.

Card hooks:

- Authors scaffold policies with `drwn card source add-hook <source-path-or-name> <policyName>`. This creates `hooks/<policyName>/policy.ts` and adds the policy to `card.json` under `hooks.include`.
- Consumers must explicitly consent before hook code is materialized: `drwn card trust <card> --hooks`. Consent is stored in `card.lock` with a semver range; `card untrust <card> --hooks` clears it.
- `drwn write` silently skips hook policies without valid consent and reports a warning. Use `drwn write --strict-hooks` in CI when missing hook consent should fail the write.
- Claude Code, Codex, Cursor, and OpenCode hook generation follow the corresponding `targets.<name>.enabled` settings. Cursor hooks are written to `.cursor/hooks.json`; a pre-existing hooks.json that drwn does not own is left untouched with a warning (rerun with `--force` to overwrite). OpenCode hooks materialize as an in-process plugin at `.opencode/plugins/drwn-hooks.js` that blocks denied tools by throwing; `ask` decisions fail closed because OpenCode plugins have no interactive approval channel. Consent flows through `drwn card trust <card> --hooks` for every runtime.
- Mastra hook generation is opt-in per project with `hooks.runtimes.mastra.enabled: true` in `<project>/.agents/drwn/config.json`.
- `hooks.exclude` can skip a policy by bare policy name or by `@scope/card:policy-name`.
- drwn hook consent only gates drwn materialization. Codex project-local hooks may still require Codex's own `/hooks` review/trust flow before they run.

Card instructions:

- Authors declare exactly one explicit source with `--instructions-text` or
  `--instructions-path`; `--clear-instructions` removes it. A path must be a
  readable regular UTF-8 file inside the Card source.
- Consumers review and grant exact-content consent with
  `drwn card trust <card> --instructions`. The lock records a semver range and
  canonical content digest. Version-range or content changes drop consent.
- A normal `drwn write` excludes unconsented contributions and warns.
  `drwn write --strict` fails before instruction projection.
- Consented contributions compose into one owned block in root `AGENTS.md`.
  User bytes outside the block are preserved exactly. Unrecorded or malformed
  reserved markers and ownership drift fail closed.
- Claude reads the canonical file through `.claude/CLAUDE.md`. An absent adapter
  is created; a foreign valid import is preserved; a foreign missing import is
  advisory unless `--apply-claude-adapter` is supplied.

Typical source authoring:

```bash
drwn card new @your-handle/backend --into ~/dev/darwinian-cards/cards --no-git
CARD_SOURCE=~/dev/darwinian-cards/cards/backend
drwn card source add-skill "$CARD_SOURCE" reviewer
drwn card source add-hook "$CARD_SOURCE" audit-tool-calls
drwn card source add-mcp "$CARD_SOURCE" context7
drwn card source set "$CARD_SOURCE" --description "Backend review harness" --version 0.1.0 --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
drwn card source doctor "$CARD_SOURCE"
drwn card publish --from "$CARD_SOURCE"
```

Publishing a new version of an existing card prints a **consent-impact report**
showing which surfaces changed content between the previous and newly-published
version. Pass `--json` for machine-readable output (`consentImpact` field):

```bash
drwn card publish --from "$CARD_SOURCE" --json
```

When hooks or instructions changed, consumers must re-trust. If the new version
is still within a project's consented range, `drwn up` and `drwn update`
auto-re-grant consent (updating the digest, preserving the range). Out-of-range
changes fail loud with the exact `drwn card trust` command.

Publish a card to a shared Git catalog after pushing the card repo:

```bash
drwn card remote add @team/backend <card-git-url>
drwn card push @team/backend
drwn catalog add <catalog-git-url>
drwn card catalog publish @team/backend@0.1.0 --catalog <catalog-checkout-or-ssh-url> --mode direct --tag backend
drwn search card backend --scope <scope>
```

The default public community catalog is readable at
`https://github.com/curation-labs/dm-cards-catalog-v1.git` and uses scope
`@community`. Catalog maintainers should publish through an SSH-backed checkout
or SSH URL so Git can push the catalog commit.

Use `--mode local` with a catalog checkout path to update `catalog.json`
without committing or pushing. Use `--mode direct` with a registered scope, Git
URL, or clean local checkout to commit and push the catalog entry. `--dry-run --json`
validates the card ref, catalog manifest, and install URL without
writing.

MCP commands:

- `drwn mcp list`
- `drwn mcp write`

Machine inventory commands:

- `drwn machine skill list`
- `drwn machine skill install <packageSpec|SKILL.md|skillDir>`
- `drwn machine skill show --package <packageName>`
- `drwn machine skill update <packageName> --from <source>`
- `drwn machine skill uninstall <packageName>`
- `drwn machine mcp list`
- `drwn machine mcp add <jsonFile> --as <serverName>`
- `drwn machine mcp update <serverName> --from <jsonFile>`
- `drwn machine mcp remove <serverName>`
- `drwn machine inventory export --output <manifest.json> [--json]`
- `drwn machine inventory bundle --output <bundle.tar.gz> [--json]`
- `drwn machine inventory verify --from <manifest.json|bundle.tar.gz> [--json]`
- `drwn machine inventory sync --from <bundle.tar.gz> [--dry-run] [--json]`
- `drwn machine inventory gc [--prune] [--json]`

Auth commands:

- `drwn login [--json]`
- `drwn refresh [--json]`
- `drwn whoami [--json]`
- `drwn logout [--json] [--require-remote-revoke]`

Machine state inspection and inventory maintenance:

- `drwn status --machine [--json]`
- `drwn doctor [--json]`
- `drwn machine inventory export --output <manifest.json> [--json]`
- `drwn machine inventory bundle --output <bundle.tar.gz> [--json]`
- `drwn machine inventory verify --from <manifest.json|bundle.tar.gz> [--json]`
- `drwn machine inventory sync --from <bundle.tar.gz> [--dry-run] [--json]`
- `drwn machine inventory gc [--prune] [--json]`

No public command archives the whole `~/.agents/drwn` root. Such an archive can
contain credentials, machine intent, project registrations, write history,
generated state, and caches. Treat broad archives produced by prototype
releases as sensitive. Remote deploy uses a separate allowlisted Card payload;
portable inventory transfer uses a dedicated active-inventory allowlist.

`inventory export` writes canonical metadata only. `inventory bundle` writes
that byte-identical manifest plus active standalone skill-package and MCP
payloads. `inventory verify` is read-only and succeeds only for an exact match.
`inventory sync` accepts only a bundle, blocks all known conflicts before its
first commit, installs only missing entries, and never activates them. Target
extras are preserved and reported. A fresh sync creates standalone inventory
infrastructure but no `machine.json`; `--dry-run` creates no managed state.

Portable inventory artifacts are not a backup or restore. They exclude machine
intent, Worker locks, projects, Cards, credentials, generated output, caches,
inactive package versions, and tombstones. Repeated unchanged exports and
bundles are byte-identical, but a checksum is not authenticity. The secret scan
for known environment values, private-key markers, and credential filenames is
a source-content safeguard, not a general secret detector. Review the source
content and destination trust before sharing or syncing a bundle.

Export commands:

- `drwn export sessions [--dry-run] [--gzip] [--out <path>]`

Analyze commands:

- `drwn analyze sessions [--archive <path>] [--fresh] [--wait] [--open] [--json] [--dry-run]`

Most inspection commands support `--json`. Write commands support `--dry-run`.

Use command help for the exact surface:

```bash
drwn --help
drwn write --help
drwn scan --help
drwn add skill --help
drwn machine skill list --help
drwn search skill --help
drwn extensions setup beads --help
drwn machine skill install --help
drwn login --help
drwn refresh --help
drwn logout --help
drwn worker mind --help
drwn worker materialize --help
drwn worker buzz-tools --help
drwn worker secret set --help
drwn worker launch-context --help
drwn worker launch-context prepare --help
drwn worker launch-context list --help
drwn worker launch-context prune --help
drwn analyze sessions --help
```

`drwn --version` plus the eleven login/refresh/logout/Worker/launch-context
help invocations above are the twelve safe installed-package release smokes. `analyze sessions`
help remains documented but is not one of the release smokes. The safe set does
not authenticate, contact Buzz, read credential bytes, use the keychain, or
mutate a project. Running the commands without `--help` is operational and is
not part of artifact qualification.

## How write works

The core model has five layers:

- packaged harness policy and available built-in skill/MCP definitions
- standalone machine inventory: package-backed skills, synthetic local skill snapshots, and user MCP records under `~/.agents/drwn/skills` and `~/.agents/drwn/mcp-servers`
- explicit machine intent: one selected Worker Blueprint and embedded immutable closure lock under `~/.agents/drwn/machine.json`
- project overlay: current-project overrides under `<project>/.agents/drwn/config.json`
- downstream state: Claude, Codex, Cursor, and generated MCP config files

`drwn write` resolves the effective harness state, then writes MCP configuration and skill links into downstream local agent tool config and skill directories. Use `--dry-run` to preview writes before mutating files:

```bash
drwn write --dry-run
drwn write
```

Card behavior:

- card-bundled skill content is authoritative for materialization and writes from the immutable card store path
- if a card and a non-card source provide the same skill name, the card copy wins
- `drwn write --dry-run` annotates each planned skill symlink with the winning resolution layer
- unresolved included skill names fail `drwn write` before any downstream mutation
- card-declared optional MCP servers are skipped until enabled; write output reports them and suggests `drwn add mcp <server-name>`

Run only one side when needed:

```bash
drwn write --mcp-only
drwn write --skills-only
```

These partial writes retain instruction files and instruction ownership
unchanged. Instruction projection is project-only and target-agnostic.

Limit write to one target:

```bash
drwn write --target=claude
drwn mcp write --target=cursor
drwn mcp write --target=opencode
```

The opencode target ships disabled. Enable it per scope: machine writes via
machine policy (`policy.targets.opencode.enabled: true` in
`~/.agents/drwn/machine.json`), project writes via project config
(`targets.opencode.enabled: true` in `<project>/.agents/drwn/config.json`).
drwn merges managed servers into `opencode.json` under the `mcp` key and
preserves every user-owned key; when `opencode.jsonc` exists the write is
skipped with a warning. Trusted card hook policies additionally generate an
OpenCode plugin at `.opencode/plugins/drwn-hooks.js`.

### Target-native ambient MCP collisions

Project MCP declarations and user-home MCP entries can share an ID because
downstream tools load both scopes. Before any project write, drwn classifies
those collisions using the selected target's native merge rules:

- Claude replaces the whole lower-precedence entry (`local > project > user`).
  A differing ambient definition is reported as a shadowing warning.
- Codex merges project fields over user fields. The write is rejected with
  `CODEX_INCOMPATIBLE_TRANSPORTS` only when the merged entry would contain both
  `command` and `url`; compatible augmentation is reported as a warning.
- Cursor loads project and global MCP configuration. Matching entries are
  accepted; differing definitions, including a transport change, are reported
  as warnings because Cursor does not publish a stronger duplicate-ID contract.

Only enabled targets selected for the write can block it. Standard and
`--mcp-only` writes run this preflight before hooks, generated files, target
configuration, skills, or write records are changed. `--skills-only` reports
MCP collisions without blocking skill projection. Dry-run uses the same
classification and still rejects a fatal collision without mutation.

`--force` repairs drwn-owned projection drift; it does not bypass invalid MCP
composition. Resolve a fatal collision by removing or renaming one definition,
or by aligning its transport. Do not copy ambient credentials or machine state
into a Worker, Card, project config, lockfile, or generated output.

`drwn status`, `drwn doctor`, and `drwn mcp list` report the declared and
ambient provenance plus the disposition and reason code. Their output is
redacted: it does not expose command arguments, URLs, headers, environment
values, or other definition payloads.

## How export works

`drwn export sessions` discovers and archives all session log files (`.jsonl`) from Claude Code and Codex belonging to the current project. Sessions are discovered by matching project slug prefixes (derived by replacing every `/` in the project path with `-`); this automatically includes all git worktrees.

### Archive layout

Archives use flat, source-prefixed member paths:

- `claude/<file>.jsonl` — main Claude sessions
- `claude/agents/<file>.jsonl` — Claude subagent logs
- `codex/<file>.jsonl` — Codex rollouts

The default destination is `.agents/drwn/session-log-exports/<timestamp>.tar` (or `.tar.gz` with `--gzip`). Use `--out <path>` to override the destination, or `--dry-run` to preview files without writing.

### Upload-ready archives

Pass `--gzip` to produce a `.tar.gz` directly. The recommended artifact for web upload is the `.tar.gz` form because it is smaller and travels well over HTTP.

The archiver enforces explicit cleanliness guarantees:

- macOS metadata is suppressed (`COPYFILE_DISABLE=1`, `--no-mac-metadata`) so no AppleDouble (`._*`) companions are emitted
- every archive is validated after write — entries outside the `claude/`/`codex/` namespace, AppleDouble entries, `__MACOSX/`, `.DS_Store`, or other hidden dotfiles cause the command to fail and the polluted archive to be removed
- archive member count must match the discovered input count

**Do not manually recompress archives** (e.g. by Finder-zipping `.agents/drwn/session-log-exports/`). Manual repackaging bypasses these guarantees and can introduce AppleDouble sidecars that break downstream analyzers. Upload the file `drwn` produces as-is.

Missing source roots like `~/.claude/projects/` or `~/.codex/sessions/` are skipped silently and do not produce an error.

## How auth works

DAH-backed commands use `drwn login`, `drwn refresh`, `drwn whoami`, and
`drwn logout`. `drwn analyze sessions` retains its explicit Foundry/Analyzer
transport; authentication custody is no longer implemented by Analyzer client
methods.

The analyzer API URL is intentionally not packaged as a default. Configure it with `DRWN_ANALYZER_URL` or in user config:

```json
{
  "version": 1,
  "analyzer": {
    "apiUrl": "http://localhost:8787",
    "webBaseUrl": "https://foundry.example.com"
  },
  "optional": {}
}
```

Authenticate:

```bash
drwn login
drwn refresh --json
drwn whoami
drwn logout
drwn logout --json --require-remote-revoke
```

The only supported stored format is an exact DAH credential payload v3 inside
an encrypted, credential-scope-bound envelope v2 at
`~/.agents/drwn/credentials.json`. Older payloads, older envelopes, malformed
records, and JWT/profile mismatches are not migrated or dual-read. They fail
closed with `CREDENTIAL_SCHEMA_UNSUPPORTED` or a stable scoped diagnostic; run
`drwn login` again to replace unsupported custody deliberately. Missing custody
is distinct and reports `CREDENTIAL_ABSENT` where a stored credential is
required.

The encryption key is held by the platform keychain and is bound to the
canonical credential-file scope. `drwn refresh` always performs a remote refresh
of the stored v3 credential, preserves its credential ID, and increments its
generation only after the refreshed payload is persisted. `DRWN_TOKEN` is a
validated bearer override for headless commands: it is never refreshed and
never persisted. It does not satisfy `drwn refresh`'s stored-custody contract.

With `--json`, login, forced refresh, and logout emit one sanitized
`darwinian.worker.auth-operation` receipt. The closed allowlist includes Worker
version/source identity, a domain-separated qualification namespace digest,
credential ID and generation, public issuer/client/resource, canonical times,
and the operation's remote/local outcome. Receipts do not include the access
token, refresh token, email, credential path, key reference, secret values,
device code, browser query URL, or response bodies. A development build can
emit a structurally valid receipt but marks it non-qualifying.

Ordinary `drwn logout` attempts refresh-token revocation and then contains local
custody even when the remote result is rejected or indeterminate. It does not
claim already-issued access tokens are invalidated. Qualification uses
`drwn logout --json --require-remote-revoke`: local deletion occurs only after a
confirmed 2xx revoke, and both the remote confirmation and local deletion must
succeed.

## Worker Mind placeholder and deployed Worker operations

`drwn worker mind` is provider-neutral in 1.4.2. It returns
`MIND_BACKEND_UNSELECTED` and performs no filesystem, network, BeginningDB, R2,
S3, or provider discovery. Local Card persona, belief, and memory authoring
remains available independently of a persistence backend.

`drwn worker materialize --payload ...` validates the V1 deploy payload and
store digest, stages a V2 project, performs a frozen install, and projects it.
It is a mutating operator command. `drwn worker buzz-tools` exposes only the two
governed Buzz message tools over MCP stdio. `drwn worker secret set` accepts
secret bytes only on non-interactive stdin and never accepts or renders them as
an argument.

`drwn worker status [deployedWorkerId] --json` reads one strict typed management
resource by immutable ID. It never joins a local Card slug to a deployed Worker,
and it rejects malformed or secret-shaped server responses before rendering.
Deployment history, rollback, runs, secrets, and retirement use the same
target-bound management contract.

## How analyze works

`drwn analyze sessions` uploads a session archive to the configured analyzer backend.

Input resolution order:

1. `--archive <path>` uses an explicit `.tar`, `.tar.gz`, or `.tgz`.
2. `--fresh` builds a new gzip archive with the same session discovery used by `drwn export sessions`.
3. Without flags, the command reuses the newest archive under `.agents/drwn/session-log-exports/` when one exists.
4. If no archive exists, it builds a new inline `.tar.gz`.

Examples:

```bash
drwn analyze sessions --dry-run
drwn export sessions --gzip
DRWN_ANALYZER_WEB_URL=https://darwinian-harness-services.pages.dev drwn analyze sessions
drwn analyze sessions --wait --open
drwn analyze sessions --archive /tmp/sessions.tar.gz --json
```

`--dry-run` validates the selected archive or reports that an inline export would be built; it does not create a new archive and does not require auth. `--wait` polls the backend job until the report is ready. `--open` opens the processing URL or final report URL only when `analyzer.webBaseUrl` or `DRWN_ANALYZER_WEB_URL` is configured.

## MCP registry

Reusable MCP servers are defined in [`registry/mcp-servers.json`](../registry/mcp-servers.json). Target config and optional toggles live in [`registry/config.json`](../registry/config.json).

User-registered MCP servers live as record-level atomic files under
`~/.agents/drwn/mcp-servers`. Stored environment and header values remain
secret references. Records are standalone inventory; they do not become active
machine capabilities by ID. Machine MCP definitions come from the active
Worker Blueprint closure.

Card-declared MCP definitions are merged into the effective registry for projects that consume those cards. They do not need to exist in bundled registry or standalone inventory. If a card-declared server has `optional: true`, it is off by default and can be enabled in that project with:

```bash
drwn add mcp <server-name>
```

Inspect active MCP state:

```bash
drwn mcp list
drwn mcp list --json
```

Write active MCP state:

```bash
drwn mcp write --dry-run
drwn mcp write
```

Notes:

- `platform-provided` entries can live in the registry but are excluded from generated local tool configs
- optional servers are included only when enabled
- `drwn write` reports optional card MCPs as active, skipped, or shadowed by a different active definition
- Parallel MCP is controlled by `config.parallel.mcp.enabled`
- project-local extension settings such as `extensions.parallel.mcp` are applied when commands run inside that project

### Operator-owned MCP runtime state

Card and project declarations describe how an MCP server should be launched;
they do not install external executables or own credentials. In particular:

- Notion's hosted MCP requires OAuth authorization in each downstream client
  that uses it.
- An `ntn`/Notion API token belongs in the operator environment or secret
  storage, never in a Card, project config, lock, or generated Worker.
- Momentic and other external stdio tools must be installed and authenticated
  separately on the machine. A missing executable or closed initialize
  handshake is runtime readiness failure, not a Worker graph failure.

OAuth grants, API keys, executable availability, environment expansion,
timeouts, and initialize handshakes are runtime-readiness concerns. The ambient
collision preflight validates target configuration composition; it does not
claim that an MCP server can authenticate or start.

The recommended machine defaults are a pinned Worker Blueprint, not a special
profile. Guided setup offers it with opt-out; non-interactive setup remains
explicitly empty. Operator is a normal member Card in that closure. Machine
capabilities remain independent of project declarations. A project that needs
Operator includes the Operator Card in its own selected Blueprint.

## Machine inventory

Built-in skills live in:

- `skills/shared`
- `skills/claude-only`
- `skills/codex-only`
- `skills/experimental`

Typical machine capability flow:

```bash
drwn apply --root <worker-blueprint-ref>
drwn write --root --skills-only --dry-run
drwn write --root --skills-only
```

Machine skills resolve from Cards in the active, integrity-verified closure.
Standalone inventory and ambient compatibility directories do not activate a
skill.

Portable transfer operates only on active drwn-managed standalone package and
MCP records. Use `drwn machine inventory export` as a metadata requirements
file, `drwn machine inventory bundle` for offline payload bytes, `drwn machine
inventory verify` for exact drift detection, and `drwn machine inventory sync`
for additive installation. Bundled repository capabilities and Card-owned
content remain outside this lifecycle.

## Extension skill bundles

`darwinian` supports package-backed skill bundles and loose local `SKILL.md` imports for skills that should be available without being added to the built-in first-party tree.

Typical flow:

```bash
drwn machine skill install <npm-package-or-local-path>
drwn machine skill list
drwn machine skill show <skillName>
drwn add skill <skillName>
drwn write --dry-run
drwn write
```

Loose local skills can be imported directly. The import is a snapshot into
drwn-managed standalone inventory, not a live link to the source file:

```bash
drwn machine skill install ./SKILL.md --as import-mcp-from-claude
drwn add skill import-mcp-from-claude
drwn write --dry-run
```

To make an installed skill part of a machine Worker, author or update a Card
and include that Card in the selected Blueprint. Installing the bundle alone is
not activation:

```bash
drwn machine skill install <npm-package-or-local-path>
drwn worker new @me/machine-defaults --into <card-collection>
drwn worker compose <card-source> --add <card-ref-containing-the-skill>
drwn apply --root <published-blueprint-ref>
```

For editable Card sources, copy the same loose skill into the Card source
instead of importing it into standalone inventory:

```bash
drwn card source add-skill ./cards/backend import-mcp-from-claude --from ./SKILL.md
drwn card source doctor ./cards/backend
```

The distinction matters:

- **added** means the bundle is available under `~/.agents/drwn/skills`
- **loose-imported** means a local `SKILL.md` was normalized into a synthetic package-backed snapshot
- **card-sourced** means the skill files were copied into an editable card source
- **machine-active** means a released Card containing it belongs to the active machine Blueprint closure
- **written** means selected bytes are copied into owned downstream tool directories

Skill update and uninstall are package-scoped. They enumerate every exported
skill ID and disclose known machine and project references. Package versions
are immutable; `current` is an atomic regular pointer. Referenced inventory
cannot be removed with a force bypass. Removal and GC use tombstone recovery,
and GC is a dry-run by default. Reference-sensitive writes account for active
Card locks and registered projects; stale registered roots are repaired with
`drwn projects unregister <root>` or removed in bulk with
`drwn projects prune` (which removes entries whose `.agents/drwn/config.json`
no longer exists).

## Extensions

Extensions are named capability families that `drwn` can inspect, diagnose, and sometimes set up. They are distinct from skill bundles and MCP servers: an extension can combine CLI prerequisites, repo-native skills, optional MCP servers, project setup actions, and diagnostics under one user-facing name.

Inspect extension support:

```bash
drwn extensions list
drwn extensions show beads
drwn extensions status
drwn extensions doctor
```

Machine-readable output is available with `--json`.

Current extensions:

- `beads`: project-scoped Beads issue tracking support
- `parallel`: project-selectable Parallel support over CLI-backed skills and optional MCP overlay
- `markitdown`: document-to-Markdown conversion through Microsoft's MarkItDown CLI, with guarded uv installation

### Parallel

Parallel support is CLI+skills-first. Selecting the extension for one project writes semantic config under `<project>/.agents/drwn/config.json`; `drwn write` then derives the four Parallel skills for that project without requiring a machine skill selection.

Preview setup:

```bash
drwn extensions setup parallel --dry-run
```

Enable the Parallel skills for the current project:

```bash
drwn extensions add parallel
```

Enable project-scoped Parallel MCP as well:

```bash
drwn extensions add parallel --mcp
```

This does not install or authenticate `parallel-cli`. `drwn extensions status parallel` and `drwn extensions doctor parallel` report missing CLI or MCP prerequisites.

### MarkItDown

MarkItDown support is CLI+skills-first. Selecting the extension for one project writes semantic config under `<project>/.agents/drwn/config.json`; `drwn write` then derives the `markitdown-document-conversion` skill for that project.

Preview setup:

```bash
drwn extensions setup markitdown --dry-run
```

Run setup and choose interactively whether to install the missing CLI:

```bash
drwn extensions setup markitdown
```

For scripts:

```bash
drwn extensions setup markitdown --install
drwn extensions setup markitdown --no-install
```

The install path is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

If the command is installed but not on PATH, run `uv tool update-shell` and restart the shell.

### Beads

Beads support is CLI-first and project-scoped. `drwn` checks for `bd`, reports whether the current project has `.beads/`, can run Beads setup recipes, and can record Beads extension config for the project.

Install `bd` through one of the upstream-supported paths:

```bash
brew install beads
npm install -g @beads/bd
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

Preview setup:

```bash
drwn extensions setup beads --dry-run
```

Run setup:

```bash
drwn extensions setup beads
```

Useful flags:

- `--target=codex,claude,cursor` selects Beads setup recipes
- `--stealth` passes Beads stealth setup mode through to `bd`
- `--skip-bd-init` skips `bd init`
- `--skip-bd-setup` skips `bd setup`
- `--include-skill` sets `extensions.beads.includeSkill: true` so write derives `beads-task-tracking`

Setup never runs `bd init --force` or `bd doctor --fix` by default. Beads MCP remains optional and is not enabled by `drwn extensions setup beads`.

## Immutable organization Worker handoff

A fresh project can consume a complete, immutable
`OrgWorkerBundleV1`/artifact packet without fetching or resolving a local
source:

```bash
drwn install --frozen \
  --org-worker-bundle ./packet/org-worker-bundle.json \
  --worker-artifact-snapshot ./packet/snapshot.json \
  --operation-id operation:provision:0001
```

The three handoff arguments are atomic and require `--frozen`. The snapshot
file's parent is the packet root. The supported V1 profile accepts
directory-backed Worker-root and Card artifacts, `project_workspace`, an empty
project overlay, and `worker-materialization-receipt@1`. Compatibility, bundle,
artifact, version-floor, or consent failures occur before project mutation.
Bundle hook consent is rejected with
`ORG_WORKER_HOOK_CONSENT_UNSUPPORTED` until a versioned profile defines its
projection evidence.

Every snapshot entry declares
`darwinian-card-tree-directory@1`, a safe relative content path, content-tree
digest, Git tree/commit, integrity, and exact Card identity. Symlink/traversal
substitution and missing/extra artifacts fail closed.

Planning modes never emit a success receipt:

```bash
drwn install --dry-run --frozen \
  --org-worker-bundle ./packet/org-worker-bundle.json \
  --worker-artifact-snapshot ./packet/snapshot.json \
  --operation-id operation:preview:0001
```

`--no-write` has the same no-mutation/no-success-receipt boundary. These modes
derive the requested-state plan; for reconcile/remove they do not inspect the
prior record or prove that an owned mutation is feasible. Successful
materialization commits config and lock together, vendors verified bytes,
projects instructions, reads back all owned state, then appends a receipt and
the bounded local materialization record. A retained journal resumes the same
operation ID after interruption; a changed request with the same ID fails.

Organization instruction consent remains external evidence and is never
written as local Card consent. Status reports the source as `local`,
`organization`, or `mixed`.

Use the exact original handoff for ownership-bounded repair or removal:

```bash
drwn install --reconcile --frozen \
  --org-worker-bundle ./packet/org-worker-bundle.json \
  --worker-artifact-snapshot ./packet/snapshot.json \
  --operation-id operation:reconcile:0001

drwn install --remove --frozen \
  --org-worker-bundle ./packet/org-worker-bundle.json \
  --worker-artifact-snapshot ./packet/snapshot.json \
  --operation-id operation:remove:0001
```

Reconcile repairs only record-owned drift. Removal deletes only no-longer-needed
owned bytes: unrelated roots, overlays, user bytes, adapters still required by
a retained projection, and local consent on retained Cards remain. It then
leaves a tombstone and a receipt chained to the prior verified receipt.
Unsupported artifact/overlay kinds remain fail-closed.

## Per-project configuration

Use per-project config when a project needs a reproducible declared harness independent of machine intent.

Create a project config:

```bash
cd /path/to/project
drwn init
```

This creates:

```text
<project>/.agents/drwn/config.json
```

Project config can:

- declare ordered plain Card or Blueprint Worker roots
- select one installed root or explicit `null`
- enable or disable MCP servers for one project
- add project-local MCP server definitions
- enable extensions such as Parallel, Beads, or MarkItDown for one project
- include or exclude skills during write
- enable or disable targets locally

Project config is used by `drwn write`, `drwn mcp list`, `drwn mcp write`, `drwn status`, `drwn doctor`, and extension status/doctor/setup commands.

Project declarations do not inherit the machine Worker. User-home
capabilities may remain ambient to downstream tools and are reported separately.

Discovery walks upward from the current working directory and uses the nearest config file.

Useful workflow:

```bash
drwn status
drwn write --dry-run
drwn doctor
```

Project extension config is semantic:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": ["@team/operator@^1.0.0"],
  "activeWorker": "@team/operator",
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": false
    },
    "beads": {
      "enabled": true,
      "targets": ["codex", "claude"],
      "includeSkill": true
    },
    "markitdown": {
      "enabled": true,
      "skills": true
    }
  }
}
```

Lower-level `skills.include` and `skills.exclude` still work for repo-native and package-backed skills. If both extension-derived includes and explicit excludes mention the same skill, `skills.exclude` wins.

The lock uses `schema: "drwn.project-lock"` and `schemaVersion: 1`. It
separates `workerRoots` from the deduplicated immutable `cards` closure. Local
development overrides use `drwn.project-local` V1. Generated output contains
one aggregate bundle per root, not one Worker per member Card.

See [Project Worker Contract V1](./contracts/project-worker-v1.md) and the
[controlled reset runbook](./prelaunch-project-reset.md).

## Layered reproducibility

drwn cards pin **harness state** — the skills, MCP servers, extensions, and downstream targets a project should run on. Cards do not pin the surrounding environment. For full environmental reproducibility, layer drwn with tools that own the other layers:

```text
Layer 8: drwn cards       — harness state (this tool)
Layer 6: Docker / Compose — service stack (Postgres, Redis, etc.)
Layer 4: Flox or Nix      — Node, Python, system libs, shell hooks
Layer 3: asdf / mise / Flox — runtime / toolchain versions
Layer 2: pnpm / Cargo / pip — app dependencies + lockfile
```

What cards pin:

- card versions and content-tree integrity in `card.lock`
- per-card bundled skill attribution in `card.lock`
- inline content shipped in cards (skills, MCP server definitions) by sha256 content hashing
- the project overlay

What cards do not pin:

- agent tool versions (Claude Code, Codex, Cursor) — vendor-controlled distribution
- MCP server runtime resolution if a card's `args` uses `npx -y <pkg>` without a version pin (the shipped registry pins these; card authors should too)
- CLI dependencies of skills (`bd`, `markitdown`, `git`, etc.)
- runtime, system libraries, or shell environment

The recommended composition for a project that needs full reproducibility: use `drwn apply` for the harness, and pair with Flox/Nix (or asdf/mise) at the shell layer to pin Node/Python/system libs, and Docker Compose at the service layer for runtime dependencies. Each tool pins what it owns.

For background on the layered model and how cards composes with the broader landscape, see [`.ai/knowledges/02_per-project-config-guide.md`](../.ai/knowledges/02_per-project-config-guide.md) and [`.ai/analyses/32_harness-cards-vs-flox-and-conda.md`](../.ai/analyses/32_harness-cards-vs-flox-and-conda.md).

## Diagnostics

Use `doctor` when local state looks wrong:

```bash
drwn doctor
drwn doctor --json
```

It reports:

- broken symlinks
- stale downstream skill links
- MCP drift
- machine V2 schema, Worker lock/integrity, closure capability provenance,
  consent, and projection ownership issues
- missing generated config files
- project config issues
- local Worker materialization state, stable identities, receipt evidence,
  consent source, incomplete journals, artifact/projection drift, and removed
  tombstones

It does not mutate local state. Materialization diagnostics use only local
bounded evidence and never claim organization readiness. Error-severity
materialization issues make `doctor` exit non-zero. Unresolved `skills.include`
names are a separate write-time contract: `drwn write` fails before mutation,
while `doctor` reports the same problem in diagnostics output.

## Optional extensions

Baseline CLI usage does not require external tools beyond Bun, Node.js, and npm.

Optional extensions include:

- Beads project issue tracking through `bd`
- Parallel CLI-backed skills
- Parallel MCP overlay
- MarkItDown document conversion through `markitdown`
- local `markdownify-mcp`

### Parallel

Parallel is represented as an extension in two layers:

- default: CLI-backed shared skills
- optional: globally enabled Parallel MCP servers

Default shared skills:

- `parallel-web-search`
- `parallel-web-extract`
- `parallel-deep-research`
- `parallel-data-enrichment`

Those skills assume `parallel-cli` is installed and authenticated separately.

Install:

```bash
curl -fsSL https://parallel.ai/install.sh | bash
```

Authenticate:

```bash
parallel-cli login
parallel-cli auth
```

To enable the optional Parallel MCP overlay, edit [`registry/config.json`](../registry/config.json):

```json
"parallel": {
  "cli": { "enabled": true },
  "mcp": { "enabled": true }
}
```

Then run:

```bash
drwn mcp write
```

### MarkItDown

MarkItDown is represented as a CLI-backed extension with a project skill:

- runtime command: `markitdown`
- installer command: `uv`
- derived skill: `markitdown-document-conversion`

Setup previews first:

```bash
drwn extensions setup markitdown --dry-run
```

When `markitdown` is missing, interactive setup asks once before installing. Scripts must choose explicitly:

```bash
drwn extensions setup markitdown --install
drwn extensions setup markitdown --no-install
```

The guarded install command is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

### Markdownify

`markdownify` is treated as an optional local MCP dependency.

It is separate from the `markitdown` CLI extension.

The registry entry uses:

```json
"command": "node",
"args": ["markdownify-mcp/dist/index.js"]
```

If you enable it, make sure the path in [`registry/mcp-servers.json`](../registry/mcp-servers.json) matches your local installation and the optional toggle in [`registry/config.json`](../registry/config.json) is enabled.
