# drwn CLI Quick Reference

A consolidated single-file reference for the `drwn` CLI. Pairs with the [public docs site](https://darwiniantools.com) and the [as-built architecture reference](../.ai/knowledges/10_drwn-cli-architecture.md).

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
Guided setup preselects an opt-out Recommended Darwinian Operator profile.

## Machine Capability Contract

Machine intent lives only in `~/.agents/drwn/machine.json`:

```json
{
  "schema": "drwn.machine",
  "schemaVersion": 1,
  "policy": {},
  "capabilities": {
    "profile": null,
    "skills": [],
    "mcpServers": []
  }
}
```

This is the first supported machine schema. Prototype shapes are rejected, not
migrated. `drwn init --non-interactive` and `--minimal` create the exact empty
intent above. Interactive guided setup offers **Recommended Darwinian
Operator** as `[Y/n]`; declining leaves the explicit empty intent.

The profile is the immutable `@darwinian/operator@1.0.2` Card at
`git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2`. Its pin
records commit, tree SHA, and content integrity. It projects an approved subset
of 17 machine-safe skills and zero MCP servers. It never projects Worker
identity, instructions, hooks, permissions, governance, or project state.

Available machine inventory becomes active only through explicit selections:

```bash
drwn machine skill enable <skillName>
drwn machine mcp enable <serverName>
drwn machine skill disable <skillName>
drwn machine mcp disable <serverName>
drwn write --scope machine --dry-run
drwn write --scope machine
```

Selection and projection are separate. Adding or removing a selection edits
only machine intent. Packaged optional flags, Parallel flags,
`~/.agents/skills`, and existing target files are not activation authority.

Machine projection is ownership-recorded. A destination or same-ID MCP field
absent from the global write record is foreign and fails with
`MACHINE_PROJECTION_CONFLICT`, even when bytes are identical or `--force` is
present. Force repairs drift only for prior drwn-owned state. Removal deletes
only unchanged prior-owned bytes or fields; foreign and drifted state is
preserved and reported by `drwn doctor`.

For a controlled prelaunch reset, record non-secret selections, back up
`machine.json` and `global-write-record.json` outside the state root, remove the
unsupported prototype files, run setup, reselect capabilities, preview with
`drwn write --scope machine --dry-run`, and resolve ownership findings without
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
- `drwn machine skill enable <skillName>`
- `drwn machine skill disable <skillName>`
- `drwn machine mcp list`
- `drwn machine mcp show <serverName>`
- `drwn machine mcp references <serverName> [--project <root>]`
- `drwn machine mcp add <jsonFile> --as <serverName>`
- `drwn machine mcp update <serverName> --from <jsonFile>`
- `drwn machine mcp remove <serverName>`
- `drwn machine mcp enable <serverName>`
- `drwn machine mcp disable <serverName>`
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
- `drwn install [--frozen] [--no-write] [--json]`

Card commands:

- `drwn card new <name> --scope @scope`
- `drwn card new <name> --from-project [projectPath]`
- `drwn card new <name> --from-defaults`
- `drwn card publish <name>`
- `drwn card catalog publish <cardRef> --catalog <scope|git-url|path> --mode <local|direct>`
- `drwn card source list`
- `drwn card source show <name>`
- `drwn card source doctor [name]`
- `drwn card source add-skill <name> <skillName> [--from <SKILL.md|skillDir>]`
- `drwn card source remove-skill <name> <skillName>`
- `drwn card source add-hook <name> <policyName>`
- `drwn card source remove-hook <name> <policyName>`
- `drwn card source set <name> [--instructions-text <text>|--instructions-path <relative-path>|--clear-instructions] [options]`
- `drwn card source add-mcp <name> <serverName>`
- `drwn card source remove-mcp <name> <serverName>`
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

Card source commands operate on editable sources under `~/.agents/drwn/sources/<scope>/<name>/`. Published cards are immutable store releases under `~/.agents/drwn/cards/`, and consumed cards are the refs and locks recorded by a project.

Worker Blueprint authoring and remote operations:

- `drwn worker new <name>`
- `drwn worker compose <name> --add <cardRef>`
- `drwn worker publish <name>`
- `drwn worker deploy <rootRef> --name <slug>`
- `drwn worker list`
- `drwn worker status <slug>`

Cards compose capabilities into one Blueprint. Installed Worker roots are
alternatives; `drwn use` selects at most one root for project projection.

Card hooks:

- Authors scaffold policies with `drwn card source add-hook <card> <policyName>`. This creates `hooks/<policyName>/policy.ts` and adds the policy to `card.json` under `hooks.include`.
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
drwn card new @your-handle/backend --no-git
drwn card source add-skill @your-handle/backend reviewer
drwn card source add-hook @your-handle/backend audit-tool-calls
drwn card source add-mcp @your-handle/backend context7
drwn card source set @your-handle/backend --description "Backend review harness" --version 0.1.0 --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
drwn card source doctor @your-handle/backend
drwn card publish @your-handle/backend
```

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

- `drwn login [--no-browser] [--json]`
- `drwn whoami [--json]`
- `drwn logout [--json]`

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
intent, profiles, projects, Cards, credentials, generated output, caches,
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
drwn analyze sessions --help
```

## How write works

The core model has five layers:

- packaged harness policy and available built-in skill/MCP definitions
- standalone machine inventory: package-backed skills, synthetic local skill snapshots, and user MCP records under `~/.agents/drwn/skills` and `~/.agents/drwn/mcp-servers`
- explicit machine intent: one pinned profile plus explicit skill and MCP selections under `~/.agents/drwn/machine.json`
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

Analyzer-backed commands use `drwn login`, `drwn whoami`, and `drwn logout`.

The analyzer API URL is intentionally not packaged as a default. Configure it with `DRWN_ANALYZER_URL` or in user config:

```json
{
  "version": 1,
  "analyzer": {
    "apiUrl": "http://localhost:8787",
    "webBaseUrl": "https://darwinian-harness-services.pages.dev"
  },
  "optional": {}
}
```

Authenticate:

```bash
DRWN_ANALYZER_URL=http://localhost:8787 drwn login
drwn whoami
drwn logout
```

Credentials are stored at `~/.agents/drwn/credentials.json` with owner-only permissions. For automation, `DRWN_TOKEN` plus `DRWN_ANALYZER_URL` bypasses the credentials file for commands that only need bearer auth.

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
secret references. Records become active at machine scope only when selected
under `capabilities.mcpServers` through `drwn machine mcp enable`.

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

The Recommended Darwinian Operator profile is a pinned machine capability
profile, not a Worker. Guided setup preselects it with opt-out; non-interactive
setup remains explicitly empty. The `@darwinian/operator@1.0.2` pin provides 17
approved skills and zero MCP servers. Machine capabilities remain ambient to
project sessions and are never project declarations. A reproducible project
that depends on Operator includes the Operator Card in its selected Blueprint.

## Machine inventory

Built-in skills live in:

- `skills/shared`
- `skills/claude-only`
- `skills/codex-only`
- `skills/experimental`

Typical machine skill flow:

```bash
drwn machine skill list
drwn machine skill enable <skillName>
drwn write --scope machine --skills-only --dry-run
drwn write --scope machine --skills-only
```

The explicit selection resolves from repo-native or installed package-backed
inventory. Ambient compatibility directories do not activate a skill.

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

To make an installed shared skill available in machine sessions:

```bash
drwn machine skill install <npm-package-or-local-path>
drwn machine skill enable <skillName>
drwn write --scope machine --skills-only
```

For editable Card sources, copy the same loose skill into the Card source
instead of importing it into standalone inventory:

```bash
drwn card source add-skill @your-handle/backend import-mcp-from-claude --from ./SKILL.md
drwn card source doctor @your-handle/backend
```

The distinction matters:

- **added** means the bundle is available under `~/.agents/drwn/skills`
- **loose-imported** means a local `SKILL.md` was normalized into a synthetic package-backed snapshot
- **card-sourced** means the skill files were copied into an editable card source
- **machine-selected** means its ID is explicit machine intent
- **written** means selected bytes are copied into owned downstream tool directories

Skill update and uninstall are package-scoped. They enumerate every exported
skill ID and disclose known machine and project references. Package versions
are immutable; `current` is an atomic regular pointer. Referenced inventory
cannot be removed with a force bypass. Removal and GC use tombstone recovery,
and GC is a dry-run by default. Reference-sensitive writes follow
`inventory -> machine -> project`; stale registered roots are repaired with
`drwn projects unregister <root>`.

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

Project declarations do not inherit machine capability selections. User-home
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
- machine schema, profile, capability provenance, and projection ownership issues
- missing generated config files
- project config issues

It does not mutate local state. Unresolved `skills.include` names are a separate write-time contract: `drwn write` fails before mutation, while `doctor` reports the same problem in diagnostics output.

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
