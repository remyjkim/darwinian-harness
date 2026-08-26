<!-- ABOUTME: End-to-end installation and project setup guide for the first supported drwn Worker contract. -->
<!-- ABOUTME: Covers CLI install, project initialization, Blueprint use, clone hydration, and operator runtime state. -->

# Install `drwn` And Set Up A Project Worker

`darwinian` is the package. `drwn` is the command. The CLI manages reusable Cards, Worker Blueprints, project state, machine inventory, and downstream Claude/Codex/Cursor projection.

## Prerequisites

- Bun 1.2 or newer;
- npm for global package installation and npm-backed skill bundles;
- Git for Card publication/resolution;
- any optional third-party runtimes used by selected skills or MCP servers.

| Goal | Requirements |
| --- | --- |
| Run the published package | **Bun 1.2+** and **npm** |
| Develop from source | **Bun 1.2+**, **npm**, and **Git** |

## Install

```bash
curl -fsSL https://bun.sh/install | bash
npm install -g darwinian
drwn --version
drwn status
```

From a source checkout:

```bash
git clone https://github.com/remyjkim/darwinian-worker.git
cd darwinian-worker
bun install
bun run drwn -- status
```

For development:

```bash
bun link
drwn --help
```

## State Locations

Machine Store state lives under `~/.agents/drwn/`:

```text
machine.json
config.json
cards/
extracted/
skills/
mcp-servers/
catalogs/
generated/
projects.json
credentials.json
```

`config.json` is non-secret `drwn.user-preferences` V1 state containing
`catalogCheckouts` and an optional `defaultAuthorScope`; `machine.json` remains
capability intent. Keep secrets in `credentials.json`, environment variables,
or a secret manager. A pre-I176 `sources/` directory may remain as legacy
operator data, but drwn neither uses nor removes it. Verify each canonical
source repository before any manual cleanup.

Project authority lives under:

```text
<project>/.agents/drwn/config.json
<project>/.agents/drwn/card.lock
```

Local development overrides use `config.local.json` and `card.lock.local`. Generated output and downstream tool files are disposable projections.

Whole-Store export is unavailable because machine state can contain credentials and operational data. Use the bounded, inventory-only export commands documented below instead.

## Mental Model

```text
author Cards -> compose one Blueprint -> add roots -> select one Worker -> write
```

- A Card is one reusable capability.
- A Blueprint composes ordered plain Cards into one Worker.
- A project may install multiple roots as alternatives.
- `activeWorker` explicitly selects one root or is `null`.
- `drwn write` projects the selected root closure and explicit project overlays.
- The selected machine Worker is not inherited into project declarations.

## Initialize A Project

```bash
cd /path/to/project
drwn init --non-interactive
```

This writes:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": [],
  "activeWorker": null
}
```

Interactive `drwn init` can offer the recommended machine-defaults Worker
Blueprint and guide project extension setup. Machine V2 remains separate from
this project contract; project declarations never inherit its selected closure.

Commit `.agents/drwn/config.json` and `.agents/drwn/card.lock`. Keep local overlay files ignored.

## Use A Published Worker

Apply one published plain Card or Blueprint root:

```bash
drwn apply @team/operator@^1.0.0
drwn status --json
drwn write --dry-run
drwn write
```

Applying one root selects it. For alternatives, selection must be explicit:

```bash
drwn apply @team/operator@^1.0.0 @team/alternate@^1.0.0 --active @team/operator
```

Manage roots:

```bash
drwn add @team/another@^1.0.0
drwn pin @team/operator@1.2.3
drwn update
drwn update @team/operator
drwn remove @team/another
```

Manage selection:

```bash
drwn use @team/operator
drwn use @team/operator --no-write
drwn use --none
```

`drwn use` writes by default. `--no-write` commits intent without downstream projection.

## Author A Capability Card

Explicit source paths work without configuration. To also enable name-only
source resolution, register the catalog collection once:

```bash
drwn config set catalogCheckouts '["~/dev/darwinian-cards"]'
```

```bash
drwn card new @team/notion --into ~/dev/darwinian-cards/cards --no-git
NOTION_SOURCE=~/dev/darwinian-cards/cards/notion
drwn card source add-skill "$NOTION_SOURCE" notion-knowledge
drwn card source add-mcp "$NOTION_SOURCE" notion
drwn card source doctor "$NOTION_SOURCE" --json
drwn card publish --from "$NOTION_SOURCE"
```

Editable source state is mutable. Published Card versions are immutable.

## Compose A Blueprint

```bash
drwn worker new @team/operator --into ~/dev/darwinian-cards/cards --no-git
OPERATOR_SOURCE=~/dev/darwinian-cards/cards/operator
drwn worker compose "$OPERATOR_SOURCE" --add @team/notion@^1.0.0
# Assume @team/fal is an already-published Card in this example.
drwn worker compose "$OPERATOR_SOURCE" --add @team/fal@^1.0.0
drwn card source doctor "$OPERATOR_SOURCE" --json
drwn worker publish --from "$OPERATOR_SOURCE"
```

The Blueprint's member order determines closure order. Members remain independently authored Cards, but the project selects the Blueprint as one Worker.

## Clone A Managed Project

After cloning a project that already commits supported config and lock:

```bash
drwn install --frozen --json
```

`--frozen` requires every locked artifact to be present and refuses fetch/lock changes. For normal hydration:

```bash
drwn install --no-write --json
drwn write --dry-run --json
drwn install --json
```

Install hydrates exact locked Cards and writes by default. It never changes root requirements or selection.

## Direct Project Capabilities

Explicit project overlays remain available:

```bash
drwn add skill <skill-name-or-query>
drwn add mcp <server-name>
drwn extensions add parallel
drwn extensions add beads --target=codex,claude --include-skill
drwn extensions add markitdown
drwn write --dry-run
```

These mutate only project intent. They do not make capabilities machine defaults.

## Machine Capabilities

Machine scope selects one immutable Worker Blueprint separately:

```bash
drwn apply --root <worker-blueprint-ref>
drwn card trust <card-name> --hooks --scope machine
drwn card trust <card-name> --instructions --scope machine
drwn write --root --dry-run
drwn write --root
```

Standalone skill/MCP inventory is not machine activation. Machine capabilities
may be ambient to downstream project sessions because the downstream tool reads
user-home configuration. Project status and doctor distinguish that ambient
visibility from project declarations.

## Notion, `ntn`, And Momentic

Cards may carry definitions and skills, but installation and credentials are operator state:

- authorize Notion's hosted MCP in each downstream client that needs it;
- place an `ntn` API key in operator environment/secret storage;
- install and authenticate Momentic or another stdio executable separately;
- keep `.env`, tokens, cookies, and OAuth grants out of Cards, Blueprints, config, lock, and generated files.

An OAuth-required, executable-missing, timeout, or initialize-handshake error is a runtime readiness diagnosis. It does not imply that the project Worker graph is corrupt.

## Verify

```bash
drwn status --json
drwn status --why skill:<name>
drwn doctor --json
drwn write --dry-run
```

Verify:

- config is `drwn.project-config` V1;
- lock is `drwn.project-lock` V1;
- one intended root is selected or selection is explicit `null`;
- Blueprint member order is correct;
- generated state has one aggregate directory per root;
- declared and ambient capabilities are separated;
- config and lock do not change during write;
- no secret appears in project state.

## Unsupported Development Projects

The first supported contract does not read prototype project state. Follow [`docs/prelaunch-project-reset.md`](docs/prelaunch-project-reset.md) to preserve authored Card sources, remove unsupported project intent/projection, and initialize clean V1 state. There is no automated migration.

## Environment Overrides

| Variable | Purpose |
| --- | --- |
| `AGENTS_REPO_ROOT` | Use a source checkout as packaged assets. |
| `AGENTS_DIR` | Override the machine Agents directory. |
| `AGENTS_HOME_DIR` | Override user-home resolution for isolated tests. |
| `DRWN_STORE_READONLY=1` | Reject Store mutation while allowing reads/dry-runs. |
| `DRWN_TOKEN` | Headless Darwinian API authentication. |
| `DRWN_CLOUD_PROFILE` | Select the complete `production` (default), `staging`, or `local` cloud tuple. |
| `DRWN_CLOUD_PROFILE_FILE` | Absolute strict profile file, required and accepted only for `local`. |
| `DRWN_FETCH_CONCURRENCY` | Concurrent Card/skill fetch limit. |
| `DRWN_GIT_TIMEOUT_MS` | Git operation timeout. |

Cloud endpoints cannot be overridden independently. Use the bundled staging tuple or
one reviewed local profile so API, web, Auth Hub, issuer, audience, client, and scopes
cannot be mixed across environments. Retired endpoint variables are not interpreted.

## References

- [`docs/contracts/project-worker-v1.md`](docs/contracts/project-worker-v1.md)
- [`docs/cli-quickref.md`](docs/cli-quickref.md)
- [`.ai/knowledges/10_drwn-cli-architecture.md`](.ai/knowledges/10_drwn-cli-architecture.md)
