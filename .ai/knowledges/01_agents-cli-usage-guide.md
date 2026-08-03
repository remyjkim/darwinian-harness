# ABOUTME: Comprehensive CLI usage reference for drwn — commands, flags, workflows, and examples.
# ABOUTME: Covers skills, cards, MCP servers, extensions, machine inventory, auth, and diagnostics.

# DRWN CLI Usage Guide

## Purpose

This is the operator-facing guide for the `drwn` CLI.

Use it for:

- day-to-day command usage
- understanding the local state model
- safe write workflows
- locating deeper manuals for project config, extension bundles, and publishing

For focused subsystem docs, see:

- [02_per-project-config-guide.md](./02_per-project-config-guide.md)
- [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md)
- [04_homebrew-release-checklist.md](./04_homebrew-release-checklist.md)
- [05_npm-publishing-analysis-and-manual.md](./05_npm-publishing-analysis-and-manual.md)

## What `drwn` Is

`drwn` is the operator CLI for `darwinian-minds`.

`darwinian-minds` is the local meta-harness control plane around the agent tools you already use. It organizes reusable inventory, explicit machine capabilities, project Workers, downstream tool state, and diagnostics into one local harness.

It operates on this model:

- the packaged or checkout harness source provides policy and available built-in capabilities
- `~/.agents/drwn` is the machine state root
- `~/.agents/drwn/machine.json` stores strict `drwn.machine` V1 intent
- `<project>/.agents/drwn/config.json` stores strict project Worker V1 intent
- package-backed skill bundles and MCP definitions are drwn-managed standalone inventory
- Claude/Codex/Cursor state is an explicit projection of machine or project intent

The CLI is intentionally conservative:

- write is non-destructive by default
- drwn-owned stale materialization is cleaned up through write records
- user-owned stale state is reported, not silently removed
- `doctor` is report-only
- package-backed skills are made available first, then selected explicitly

## Execution Modes

### Repo-local usage

Use this while developing inside the repo:

```bash
bun run drwn -- --help
bun run drwn -- status
bun run drwn -- write --dry-run
bun run drwn -- machine skill list
bun run drwn -- mcp list
```

### Global usage

Link the package globally:

```bash
bun link
```

Then use:

```bash
drwn --help
drwn status
drwn write --dry-run
drwn machine skill list
drwn mcp write --dry-run
```

Both modes execute the same command implementations.

## Local State Model

`drwn` can read and write:

- the packaged or checkout harness source
- `~/.agents`
- `~/.agents/drwn`
- `~/.claude`
- `~/.codex`
- `~/.cursor`
- `<project>/.agents/drwn/config.json`

Important directories:

- built-in shared skills: `skills/shared`
- package-backed skill bundles: `~/.agents/drwn/skills`
- standalone MCP records: `~/.agents/drwn/mcp-servers`
- card bare repositories: `~/.agents/drwn/cards/@scope/name.git`
- card extracted trees: `~/.agents/drwn/extracted/<tree-sha>`
- card catalogs: `~/.agents/drwn/catalogs`
- card catalog index: `~/.agents/drwn/catalogs.json`
- machine-scope Claude downstream skills: `~/.claude/skills`
- machine-scope Codex downstream skills: `~/.codex/skills`
- project-scope downstream state: `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor`

## Recommended First-Run Sequence

```bash
drwn status
drwn machine skill list
drwn mcp list
drwn write --dry-run
drwn write
```

If you want project-local overrides, scaffold them before writing from that project:

```bash
drwn init
drwn init --non-interactive
```

## Command Groups

Implemented groups:

- `init`
- `add`
- `install`
- `search`
- `machine`
- `write`
- `scan`
- `mcp`
- `worker`
- `extensions`
- `card`
- `catalog`
- `projects`
- `analyze`
- `export`
- `status`
- `doctor`

Top-level auth commands are also registered: `login`, `logout`, and `whoami`.

The `card` group includes `card audit`, `card trust`, and `card untrust`
alongside its source, remote, and lifecycle subcommands. `catalog validate`
validates a card catalog manifest.

## Init Command

Use:

```bash
drwn init
drwn init --non-interactive
drwn init --minimal
drwn init --force
drwn init --guided
```

What it does:

- creates `<project>/.agents/drwn/config.json`
- defaults to guided setup in interactive terminals
- `--guided` forces the interactive guided flow when stdin and stdout are TTYs
- writes a minimal `drwn.project-config` V1 document with `workers: []` and `activeWorker: null` when `--non-interactive` or `--minimal` is used
- initializes missing machine state as explicit empty intent for `--non-interactive` and `--minimal`
- offers the opt-out Recommended Darwinian Operator profile when guided setup initializes machine state
- warns if `.gitignore` appears to exclude `.agents`

Existing valid machine intent is never reset or re-prompted.

## Machine Capability Contract

The only supported machine format is `~/.agents/drwn/machine.json` with this
namespaced V1 shape:

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

Prototype machine shapes are rejected. The CLI does not migrate, dual-read, or
infer them. Non-interactive and minimal setup create the exact empty intent.

Guided setup preselects **Recommended Darwinian Operator** as `[Y/n]`. The
approved `@darwinian/operator@1.0.2` profile is pinned to the exact Git tag,
commit, tree SHA, and content integrity. Runtime verifies its extracted bytes
offline. The profile filters the Card to 17 approved machine-safe skills and
zero MCP servers. It contributes no Worker identity, instructions, hooks,
permissions, governance, or project state.

Machine activation is only:

```text
approved capabilities from the selected immutable profile
+ explicit capabilities.skills
+ explicit capabilities.mcpServers
```

Available machine inventory is selected explicitly with:

```bash
drwn machine skill enable <skill-name>
drwn machine skill disable <skill-name>
drwn machine mcp enable <server-name>
drwn machine mcp disable <server-name>
```

These commands mutate machine intent only. They do not project target files.
Packaged optional flags, Parallel flags, ambient compatibility directories, and
existing target output are not activation authority.

Project with `drwn write --scope machine --dry-run`, then write with
`drwn write --scope machine`. A first write refuses every foreign destination
or same-ID MCP field with `MACHINE_PROJECTION_CONFLICT`, including identical
bytes and `--force`. Force repairs only drift in prior drwn-owned state.
Removal deletes only unchanged prior-owned bytes or fields; foreign and drifted
state remains untouched and reportable through status and doctor.

For a controlled prelaunch reset, record only non-secret current intent, back
up `machine.json` and `global-write-record.json` outside the state root, remove the
unsupported prototype state, rerun setup, and reselect capabilities. Resolve
foreign ownership findings explicitly; never use force to claim foreign paths.

## Add Commands

`add` mutates the current project config. It does not make skills or MCP servers global defaults and does not silently mutate global target config.

```bash
drwn extensions add parallel
drwn extensions add parallel --mcp
drwn extensions add beads --target=codex,claude --include-skill
drwn extensions add markitdown
drwn add <card-ref>
drwn add skill <skill-name-or-query>
drwn add mcp <server-name>
```

`drwn add <card-ref>` is the top-level card add path. It resolves the card immediately, writes the card ref to the current project config, and refreshes `<project>/.agents/drwn/card.lock`.

Use `--library` on skill and MCP adds to restrict lookup to local inventory only. Without `--library`, `add skill` can search configured npm skill catalogs and install an unambiguous result when `--yes` is supplied. `add mcp` can add from trusted MCP catalog files when configured and confirmed with `--yes`.

## Card Commands

Cards package reusable project capabilities. Blueprints compose ordered Cards
into one Worker root. A project records root refs in
`<project>/.agents/drwn/config.json`, exact resolutions in
`<project>/.agents/drwn/card.lock`, and project-local materialized state under
`<project>/.claude`, `<project>/.codex`, and `<project>/.cursor`.

Published cards are stored as per-card bare Git repositories under
`~/.agents/drwn/cards/@scope/name.git`. Version tags identify releases, and
materialized content is extracted under `~/.agents/drwn/extracted/<tree-sha>`.
The project lock is `drwn.project-lock` V1. Its `workerRoots` records roots and
ordered members; `cards` stores the deduplicated immutable artifacts. Local and
Git-origin entries include tree SHA, integrity, and Git commit provenance.

Authoring and publishing:

```bash
drwn config set catalogCheckouts '["~/dev/darwinian-cards"]'
drwn card new @me/backend --into ~/dev/darwinian-cards/cards --no-git
# Equivalent alternative when creating a different source:
# drwn card new backend --scope @me --into <another-collection> --no-git
drwn card new @me/project-harness --from-project . --into ~/dev/darwinian-cards/cards
drwn card publish --from ~/dev/darwinian-cards/cards/backend
drwn card show @me/backend@1.0.0
drwn card diff @me/backend@1.0.0 @me/backend@1.1.0
drwn card deprecate @me/backend@1.0.0
drwn card validate @me/backend@1.0.0
```

`card new --from-project` snapshots the current project's effective harness
into a self-contained source repository under the current directory or the
explicit `--into` collection.
It copies active skill content, records active MCP server definitions, and
preserves effective extension and target intent. It never reads host environment
variable values into the captured card.

Card source commands edit that source tree before publication. A card source is
mutable authoring state. A published card is an immutable Git-backed release in
the local store. A consumed card is a project ref and lock entry that points at
a published store release, file source, or Git origin.

Inspect source state by path, or by a uniquely matched manifest name under
`catalogCheckouts`:

```bash
drwn card source list # deprecated guidance only
drwn card source show @me/backend
drwn card source show @me/backend --json
drwn card source doctor @me/backend
drwn card source show ~/dev/darwinian-cards/cards/backend --json
```

The name-only examples below depend on the checkout configured above and on the
source living at its immediate `cards/backend/card.json`. Without that setup,
pass the source path directly. Every source command's first operand is
path-or-name; for example:

```bash
drwn card source doctor ~/dev/darwinian-cards/cards/backend --json
drwn card source set ~/dev/darwinian-cards/cards/backend --description "Backend review harness"
drwn card source sync ~/dev/darwinian-cards/cards/backend --check --json
drwn card release --from ~/dev/darwinian-cards/cards/backend --bump patch
```

Edit bundled skills and MCP definitions:

```bash
drwn card source add-skill @me/backend reviewer
drwn card source add-skill @me/backend reviewer --from ./skills/reviewer
drwn card source add-skill @me/backend reviewer --replace
drwn card source add-skill @me/backend reviewer --dry-run
drwn card source remove-skill @me/backend reviewer
drwn card source remove-skill @me/backend reviewer --keep-files
drwn card source remove-skill @me/backend reviewer --dry-run
drwn card source add-mcp @me/backend context7
drwn card source add-mcp @me/backend context7 --from ./context7.json
drwn card source add-mcp @me/backend context7 --replace
drwn card source remove-mcp @me/backend context7
drwn card source remove-mcp @me/backend context7 --keep-files
```

`--replace` lets `add-skill` and `add-mcp` overwrite an existing entry by name.
`--keep-files` retains bundled skill or MCP files on disk while dropping the
`card.json` declaration. Every mutating source subcommand accepts `--dry-run`
and `--json`.

Edit bundled hooks:

```bash
drwn card source add-hook @me/backend audit-tool-calls
drwn card source remove-hook @me/backend audit-tool-calls
drwn card source remove-hook @me/backend audit-tool-calls --keep-files
```

- `add-hook` scaffolds `hooks/<name>/policy.ts` from an observer policy template
  and appends the name to `hooks.include`. New hook stubs are observers by
  default so a fresh scaffold cannot fail closed.

`remove-hook` deletes the hook's files by default; `--keep-files` drops only
the `card.json` declaration. These subcommands accept `--dry-run` and `--json`.

Update manifest metadata and quality signals:

```bash
drwn card source set @me/backend --description "Backend review harness"
drwn card source set @me/backend --version 0.1.0 --stability stable
drwn card source set @me/backend --license Apache-2.0
drwn card source set @me/backend --harness-min-version 0.1.0
drwn card source set @me/backend --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
```

Source commands honor `DRWN_STORE_READONLY=1`: inspection and dry runs work,
but real source mutations fail before writing. `doctor` is report-only and exits
successfully after printing any source issues it found.

Card manifests may include optional quality signals:

```json
{
  "stability": "stable",
  "lastValidatedWith": "0.1.0",
  "testStatusBadge": "https://example.com/status.svg"
}
```

These fields are informational and appear in `drwn card show` and
`drwn card show --json`. `skills.shared` remains reserved; cards should continue
to bundle skills through `skills.include` until a later registry wave activates
shared registry references.

Project consumption:

```bash
drwn apply @me/backend@^1.0.0
drwn add @me/backend@^1.0.0
drwn apply @me/backend@^1.0.0 @me/observability@^1.0.0 --active @me/backend
drwn pin @me/backend@1.0.0
drwn remove @me/observability
drwn update
drwn use @me/backend
drwn use --none
drwn card outdated
drwn card outdated --check
drwn card outdated --fetch
drwn card list
drwn card status --explain
```

Supported card refs:

```bash
drwn add @me/backend@^1.0.0
drwn add file:../path/to/card-source
drwn add git+https://github.com/owner/repo.git#v1.0.0
drwn add git+https://github.com/owner/repo.git@^1.0.0
drwn add github:owner/repo#v1.0.0
drwn add github:owner/repo@^1.0.0
drwn add gitlab:owner/repo#v1.0.0
drwn add gitlab:owner/repo@^1.0.0
```

Use `file:../path/to/card-source` refs for local card development. Use `git+`,
`github:`, or `gitlab:` refs when a project should consume a card from a Git
remote. Git credentials are handled by Git itself; `drwn` does not store them.
When drwn discovers a card name from a Git URL, it records the mapping in
`~/.agents/drwn/url-card-map.json`. This cache is an optimization only; stale
or corrupt entries are corrected or ignored during resolution.

Team sharing:

```bash
drwn card remote add @team/backend <git-url>
drwn card remote list @team/backend
drwn card remote set @team/backend <git-url>
drwn card remote remove @team/backend
drwn card push @team/backend
drwn card fetch @team/backend
drwn card clone git+<git-url>#v1.0.0
drwn card clone git+<git-url>@^1.0.0 --json
drwn card catalog publish @team/backend@1.0.0 --catalog @team --mode direct
```

The default remote name is `origin`. Use `--name <remote>` with `card remote`
commands and `--remote <remote>` with `card push` / `card fetch` when a card has
more than one remote.

`card push` publishes the card to its Git remote. It pushes the card's main
branch and version tags to the configured remote:

```bash
drwn card push @team/backend
drwn card push @team/backend --remote upstream
```

Git credentials are handled by Git itself; `drwn` does not store them.

`card catalog publish` adds an already-published immutable card ref to a
Git-backed catalog manifest. `--catalog` accepts a registered scope such as
`@team`, a catalog Git URL, or a local catalog checkout path. `--mode local`
updates `catalog.json` only. `--mode direct` requires a clean catalog worktree,
commits `catalog.json`, pushes the current branch, and refreshes the registered
catalog cache when possible. Use `--dry-run --json` before publishing to validate
the card ref, catalog schema, install URL, and duplicate behavior.

Machine-readable card output is available on inspection commands:

```bash
drwn card show @me/backend@1.0.0 --json
drwn card list --json
drwn card diff @me/backend@1.0.0 @me/backend@1.1.0 --json
drwn card outdated --json
drwn card status --json
drwn card validate @me/backend@1.0.0 --json
```

`card show --json` includes recent Git history for Git-backed cards. `card diff`
combines the semantic card-change classification with the real Git diff between
the selected versions.

## Worker Commands

A Worker is one installed root: either a plain Card or a Blueprint whose ordered
Cards form its closure. Multiple installed roots are alternatives. A project
selects at most one root, and selection is explicit even when it is `null`.

```bash
drwn use @team/operator
drwn use @team/operator --no-write
drwn use --none
drwn status --json
```

`drwn use` selects an installed root or installs it additively, then runs
projection unless `--no-write` is passed. `drwn use --none` clears selection
without removing roots. `drwn write` creates one aggregate generated bundle per
root; a Blueprint's member Cards are inside that aggregate and never become
sibling Workers. Only the selected root closure supplies project Card
capabilities.

## Install Command

Use `install` after cloning a project that already has
`<project>/.agents/drwn/card.lock`.

```bash
drwn install
drwn install --no-write
drwn install --frozen
drwn install --json
```

Behavior:

- reads the project card lockfile
- ensures every locked store/Git-origin card is present locally
- clones or fetches Git-backed card repos when needed
- refreshes extracted paths if the lockfile points at content not yet materialized
- runs `drwn write` unless `--no-write` is passed
- fails with `--frozen` instead of cloning, fetching, or changing `card.lock`

## Search Commands

`search` discovers candidates from standalone inventory and configured catalogs by default.

```bash
drwn search skill <query>
drwn search skill <query> --library
drwn search skill <query> --catalog
drwn search skill <query> --json
drwn search mcp <query>
drwn search mcp <query> --json
drwn search card <query>
drwn search card <query> --json
```

`--library` is a search filter meaning the user's local inventory only. Online
sources are catalogs, not standalone inventory.

`search card` searches registered Git-backed card catalogs. Catalog repos expose
cards through a `catalog.json` file and must be registered locally before their
entries appear. `drwn init` registers the public Curation Labs community catalog
by default:

```text
https://github.com/curation-labs/dm-cards-catalog-v1.git
```

## Machine Inventory Commands

Machine inventory contains drwn-managed standalone skill packages and MCP
records. Repository skills and bundled registry MCP definitions are immutable
discovery inputs. Inventory is inactive until explicit machine or project
intent selects it.

```bash
drwn machine skill list
drwn machine mcp list
drwn machine skill show <skill-id>
drwn machine skill show --package <package-name>
drwn machine skill references --package <package-name> --project <root>
drwn machine skill install <npm-package-or-local-path>
drwn machine skill update <package-name> --from <source>
drwn machine skill uninstall <package-name>
drwn machine mcp show <server-id>
drwn machine mcp references <server-id> --project <root>
drwn machine mcp add <json-file> --as <server-id>
drwn machine mcp update <server-id> --from <json-file>
drwn machine mcp remove <server-id>
drwn catalog list
drwn catalog add <git-url>
drwn catalog refresh [@scope]
drwn catalog remove <scope-or-url>
drwn machine skill enable <skill-name>
drwn machine skill disable <skill-name>
drwn machine mcp enable <server-name>
drwn machine mcp disable <server-name>
drwn machine inventory gc --json
```

Skill update and uninstall are package-scoped and enumerate all exported skill
IDs. Package versions are immutable and `current` is changed atomically. MCP
definitions use record-level atomic files and retain secret references instead
of resolved credentials. Referenced inventory cannot be removed through a force
bypass.

`drwn catalog` manages Git-backed Card catalogs used by `drwn search card`. The default community catalog is
`https://github.com/curation-labs/dm-cards-catalog-v1.git` with scope
`@community`. `drwn init` pre-registers and shallow-clones it when reachable
unless `--no-default-catalogs` is passed.
`catalog add` clones the catalog and records it in
`~/.agents/drwn/catalogs.json`; `catalog refresh` fetches registered
catalog remotes and updates Card counts; `catalog remove` removes
catalog registrations and local clones by scope or URL.

Reference-sensitive mutations follow `inventory -> machine -> project`.
Registered roots that are missing or unreadable fail closed; repair stale
entries explicitly with `drwn projects unregister <root>`. Inventory GC is a
dry-run by default and uses tombstone recovery. Current inventory is never
garbage merely because known references are zero.

## Write Command

Use:

```bash
drwn write
drwn write --dry-run
drwn write --json
drwn write --target=claude
drwn write --mcp-only
drwn write --skills-only
drwn write --force
drwn write --scope machine
drwn write --strict-hooks
drwn write --strict
```

`write` is the primary one-way materialization command. It projects either strict machine intent or the selected project Worker closure plus explicit project overlays into downstream tools.

When run inside a project with `<project>/.agents/drwn/config.json`, `write`
materializes project-local state under `<project>/.claude`,
`<project>/.codex`, and `<project>/.cursor`. Outside a configured project, it
materializes machine-scope state under `~/.claude`, `~/.codex`, and `~/.cursor`.

Write records make cleanup explicit:

- project writes use `<project>/.agents/drwn/write-record.json`
- machine writes use `~/.agents/drwn/global-write-record.json`
- drwn-owned paths that leave the effective state are removed on the next write
- user-owned replacements are preserved and reported
- `--force` repairs only drift already recorded as drwn-owned; it never claims foreign state
- `--scope machine` explicitly ignores project config and targets user-home surfaces
- `--strict-hooks` fails when card hooks are present but missing valid hook consent
- `--strict` fails when this project's `card.lock` requires a newer drwn than you are running

## Machine State And Safety

The local store lives under `~/.agents/drwn`. Card content is Git-backed:

- per-card bare repos: `~/.agents/drwn/cards/@scope/name.git`
- extracted trees: `~/.agents/drwn/extracted/<tree-sha>`
- catalogs: `~/.agents/drwn/catalogs`
- machine config: `~/.agents/drwn/machine.json`
- authoring preferences: `~/.agents/drwn/config.json`
- Git URL name cache: `~/.agents/drwn/url-card-map.json`

The strict `drwn.user-preferences` file stores `catalogCheckouts` and optional
`defaultAuthorScope`; it is separate from capability intent in `machine.json`.
When loaded, a valid legacy `machine.policy.authoring.scope` is durably moved
to `config.json.defaultAuthorScope` and removed from `machine.json`. A legacy
`~/.agents/drwn/sources/` tree is not an authoring location: drwn inventories it
read-only and never migrates or deletes it. Verify canonical repositories before
manual cleanup.

Inspect machine state:

```bash
drwn status --machine
drwn status --machine --json
drwn doctor
drwn doctor --json
```

Maintenance:

```bash
drwn machine inventory gc --json
drwn machine inventory gc --prune --json
DRWN_STORE_READONLY=1 drwn card publish --from ./cards/backend
```

No public command creates a broad archive of `~/.agents/drwn`; that root may
contain credentials and operational state. Remote deploy uses an unchanged,
allowlisted Card payload. Portable inventory transfer is a separate Task 82
contract. `DRWN_STORE_READONLY=1` refuses machine-state mutations.

## Scan Command

Use:

```bash
drwn scan
drwn scan --json
```

`scan` is currently a placeholder. Its planned role is non-mutating local
harness discovery: inspect existing local agent tool config, report candidates
for standalone inventory, machine intent, or project config, and avoid writing
files unless a future explicit import/write step is added.

## Skills Commands

### List skills

Human-readable:

```bash
drwn machine skill list
```

JSON:

```bash
drwn machine skill list --json
```

What it shows:

- skill name
- scope
- source and inventory state
- whether it is linked into Claude
- whether it is linked into Codex
- source metadata for package-backed skills in JSON mode

### Manage package-backed skill bundles

Add a bundle:

```bash
drwn machine skill install <npm-package-or-local-path>
```

List installed bundles:

```bash
drwn machine skill list
drwn machine skill list --json
```

Inspect one installed bundle:

```bash
drwn machine skill show --package <package-name>
drwn machine skill show --package <package-name> --json
```

Behavior:

- a bundle is ingested into immutable versioned inventory (`~/.agents/drwn/skills`)
- adding a bundle does not select or write any skill automatically
- bundles are content sources; `drwn` remains the only supported selection and write surface
- update and uninstall operate on the package and enumerate every exported skill ID and known reference

See [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md) for the full bundle model.

### Select a machine skill

```bash
drwn machine skill enable <name>
```

This records the skill ID as explicit machine intent after resolving it from
available repo-native or package-backed inventory.

Important:

- this does not automatically write tool directories
- preview with `drwn write --scope machine --skills-only --dry-run`
- machine projection copies supported shared/target-scoped skills into recorded owned destinations

Remove the explicit selection with:

```bash
drwn machine skill disable <name>
```

The next machine write removes only unchanged prior-owned output. A profile may
continue to supply the same ID even after an overlapping explicit selection is
removed.

### Write skills downstream

```bash
drwn write --scope machine --skills-only
```

Dry-run:

```bash
drwn write --scope machine --skills-only --dry-run
```

JSON:

```bash
drwn write --scope machine --skills-only --json
```

Behavior:

- installs missing downstream skill symlinks
- removes drwn-owned symlinks that left the effective state
- reports user-owned stale downstream skill paths instead of deleting them
- respects per-project skill exclude lists
- respects per-project skill include lists for repo-native and installed package-backed skills
- respects project extension-derived skill includes, such as `extensions.parallel`

## MCP Commands

### List harness MCP servers

Human-readable:

```bash
drwn mcp list
```

JSON:

```bash
drwn mcp list --json
```

What it shows:

- server name
- transport
- whether it is currently active
- enabled targets summary

This is the quickest way to inspect the effect of toggles like `parallel.mcp.enabled` and project-local extension MCP settings.

### Write MCP into enabled targets

```bash
drwn mcp write
```

Dry-run:

```bash
drwn mcp write --dry-run
```

Target-specific:

```bash
drwn mcp write --target=claude
```

JSON:

```bash
drwn mcp write --json
```

Behavior:

- renders active harness MCP state
- writes it to enabled targets
- preserves the current non-destructive semantics
- uses project-local server and target overrides when present
- uses project extension-derived MCP settings, such as `extensions.parallel.mcp`

## Extensions Commands

Extensions are named capability families managed by `drwn`. They can combine CLI prerequisites, repo-native skills, optional MCP servers, project setup actions, and diagnostics. They are not the same thing as package-backed skill bundles: bundles provide skill content, while extensions describe operational support around a tool or workflow.

### List extensions

Human-readable:

```bash
drwn extensions list
```

JSON:

```bash
drwn extensions list --json
```

What it shows:

- extension id and display name
- supported scope
- default modes such as `cli`, `skills`, `mcp`, or `hooks`

### Show one extension

```bash
drwn extensions show beads
drwn extensions show beads --json
```

What it shows:

- description
- command prerequisites
- related repo-native skills
- optional MCP servers
- upstream documentation links

### Check extension status

```bash
drwn extensions status
drwn extensions status beads
drwn extensions status beads --json
```

Status is read-only. It reports command availability, skill presence, MCP state, and project-local details such as whether `.beads/` exists in the current project.

### Run extension diagnostics

```bash
drwn extensions doctor
drwn extensions doctor parallel
drwn extensions doctor --json
```

Doctor is report-only. It surfaces missing commands, missing skills, inactive MCP entries, and project setup gaps with actionable hints.

### Set up Parallel

Preview:

```bash
drwn extensions setup parallel --dry-run
```

Run:

```bash
drwn extensions setup parallel
```

Common flags:

- `--mcp` enables project-scoped `parallel-search` and `parallel-task` MCP
- `--skip-skills` records the extension without deriving the Parallel skills
- `--json` returns structured output

Setup writes semantic project config under `extensions.parallel` in `<project>/.agents/drwn/config.json`. It does not install or authenticate `parallel-cli`; use status and doctor to inspect those prerequisites.

### Set up Beads

Install `bd` first:

```bash
brew install beads
npm install -g @beads/bd
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

Preview:

```bash
drwn extensions setup beads --dry-run
```

Run:

```bash
drwn extensions setup beads
```

Common flags:

- `--target=codex,claude,cursor` selects Beads setup recipes
- `--stealth` passes Beads stealth mode to `bd init` and `bd setup`
- `--skip-bd-init` skips `bd init`
- `--skip-bd-setup` skips `bd setup`
- `--include-skill` sets `extensions.beads.includeSkill: true` so write derives `beads-task-tracking`
- `--json` returns structured output

Safety constraints:

- setup requires `bd` to be available
- dry-run does not mutate project files
- setup never runs `bd init --force`
- setup never runs `bd doctor --fix`
- Beads MCP is optional and not enabled by setup

### Set up MarkItDown

Preview:

```bash
drwn extensions setup markitdown --dry-run
```

Run interactively:

```bash
drwn extensions setup markitdown
```

When `markitdown` is missing, interactive setup asks once before installing through uv. Scripts must choose explicitly:

```bash
drwn extensions setup markitdown --install
drwn extensions setup markitdown --no-install
```

The guarded install command is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

Setup writes semantic project config under `extensions.markitdown`. When skills are enabled, write derives `markitdown-document-conversion` for the project without a machine skill selection.

### Current extensions

- `beads`: project-scoped support for Beads issue tracking through the `bd` CLI, Beads setup recipes, and the repo-native `beads-task-tracking` skill
- `parallel`: project-selectable support for Parallel through existing CLI-backed skills and optional `parallel-search` / `parallel-task` MCP servers
- `markitdown`: project-selectable document conversion through Microsoft's `markitdown` CLI and the repo-native `markitdown-document-conversion` skill

## Status Command

Use:

```bash
drwn status
drwn status --json
drwn status --explain
drwn status --why skill:<name>
drwn status --why server:<name>
drwn status --why extension:<name>
drwn status --why target:<name>
drwn status --why card:<name>
```

What it reports:

- repo root
- `~/.agents` path
- enabled targets
- strict machine schema and selected profile pin
- profile/explicit capability provenance and resolved/missing counts
- machine projection health, currentness, conflicts, and write-record presence
- standalone MCP inventory counts without definition or secret-bearing values
- installed package-backed bundle counts
- active project config path when one is in scope
- project override summary when one is active
- cards and locked versions when project cards are present
- store status
- write-record status

Use `--explain` for provenance across cards, skills, MCP servers, targets, and
write records. Use `--why <category>:<name>` when you need a focused answer for
one active item.

## Doctor Command

Use:

```bash
drwn doctor
drwn doctor --json
```

What it reports:

- missing required directories or config files
- stale skill symlinks
- MCP drift indicators
- invalid or unresolved machine capability references
- missing or mutated pinned profile bytes without repair
- foreign or drifted machine projection ownership
- store and card lock issues
- write-record ownership issues
- project config issues

Typical project-config issues include:

- unknown server references
- unknown skill references
- unknown extension references
- stale project skill overrides
- card refs that cannot be resolved
- card manifests that reference unavailable skills

`doctor` is report-only. It does not auto-fix or auto-prune.

Wave 1 note: unresolved project `skills.include` names do not wait for `doctor`. `drwn write` now fails before mutating downstream state, and `doctor` reports the same issue for diagnosis.

## Export Sessions Command

Use:

```bash
drwn export sessions
drwn export sessions --dry-run
drwn export sessions --out /tmp/my-sessions.tar
drwn export sessions --gzip
```

What it does:

- discovers Claude and Codex session log files belonging to the current project (and any git worktrees)
- scans `~/.claude/projects` and `~/.codex/sessions`
- writes a `.tar` archive under `.agents/drwn/session-log-exports/` by default
- `--out` overrides the destination archive path
- `--gzip` produces an upload-ready `.tar.gz` archive instead of uncompressed `.tar`
- `--dry-run` lists files that would be archived without writing anything

## Analyze Sessions Command

Use:

```bash
drwn analyze sessions
drwn analyze sessions --fresh
drwn analyze sessions --wait --open
drwn analyze sessions --dry-run --archive /tmp/sessions.tar.gz
drwn analyze sessions --json
```

What it does:

- uploads a session-log archive to the configured analyzer API and returns a viewing URL
- selects an archive from `--archive`, `--fresh`, the newest local export under `.agents/drwn/session-log-exports/`, or a new inline gzip export
- `--archive` specifies a pre-built `.tar`, `.tar.gz`, or `.tgz` archive path
- `--fresh` builds a new gzip archive even if an existing archive is present
- `--wait` polls until the report is ready and prints the report URL
- `--open` opens the processing URL or report URL in the default browser
- `--dry-run` validates the selected input without creating archives or uploading
- `--json` emits a single machine-readable JSON object
- requires authentication; run `drwn login` first or set `DRWN_TOKEN` and `DRWN_ANALYZER_URL`

## Common Workflows

### Global machine write

```bash
drwn write --scope machine --dry-run
drwn write --scope machine
```

### Add reusable inventory and make it global

```bash
drwn machine skill install <bundle>
drwn machine skill enable <skill-name>
drwn machine mcp add ./github-mcp.json --as github
drwn machine mcp enable github
drwn write --scope machine --dry-run
drwn write --scope machine
```

Use this for machine-scope sessions. Project declarations do not inherit machine
capabilities; user-home capabilities may still be ambient to downstream tools and
are reported separately by project status and doctor.

### Project-specific override setup

```bash
cd /path/to/project
drwn init
drwn apply @team/operator@^1.0.0
drwn use @team/operator --no-write
drwn status
drwn write --dry-run
```

### Add extension skill bundle and expose one skill

```bash
drwn machine skill install <bundle>
drwn machine skill show --package <package-name>
drwn add skill <skill-name>
drwn write
```

### Inspect project issues before writing

```bash
drwn status
drwn doctor
```

### Bootstrap a cloned project with locked cards

```bash
cd /path/to/project
drwn install --no-write
drwn write --dry-run
drwn install
```

Use `--frozen` in CI when `card.lock` must already contain everything needed:

```bash
drwn install --frozen
```

### Share a card with a team Git remote

```bash
drwn card new @team/backend --into ~/dev/darwinian-cards/cards --no-git
drwn card publish --from ~/dev/darwinian-cards/cards/backend
drwn card remote add @team/backend <git-url>
drwn card push @team/backend
drwn catalog add <catalog-git-url>
drwn card catalog publish @team/backend@1.0.0 --catalog @team --mode direct
```

Another machine can import it with:

```bash
drwn card clone git+<git-url>#v1.0.0
drwn add git+<git-url>#v1.0.0
drwn install
```

### Discover cards from a catalog

```bash
drwn catalog list
drwn catalog add <catalog-git-url>
drwn search card backend
drwn add git+<card-git-url>#v1.0.0
```

## Optional Extensions

`darwinian-minds` supports optional local extensions, including:

- `bd` for Beads project issue tracking
- `parallel-cli` for Parallel-backed skills
- `markitdown` for MarkItDown-backed document conversion

These are optional and machine-dependent. Their absence should not block the baseline CLI and write model.

## Current Limits

- `doctor` is report-only
- live hosted Git authentication, credential prompts, and slow-network behavior depend on the user's Git configuration and should be smoke-tested against disposable remotes before release
- card catalogs are Git-backed local clones; there is no registry service
- portable machine inventory transfer remains deferred to the separate Task 82 contract
- package-backed bundles are extension sources, not authoritative write CLIs
- per-project `skills.include` requires skill names to resolve across the active card set and non-card sources; unresolved names fail write before mutation and are also surfaced by doctor

## Further Reading

- [02_per-project-config-guide.md](./02_per-project-config-guide.md)
- [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md)
- [04_homebrew-release-checklist.md](./04_homebrew-release-checklist.md)
- [05_npm-publishing-analysis-and-manual.md](./05_npm-publishing-analysis-and-manual.md)
- [09_cards-manual-test-guide.md](./09_cards-manual-test-guide.md)
