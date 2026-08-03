# ABOUTME: Manual acceptance guide for the first supported Card, Blueprint, and project Worker contract.
# ABOUTME: Exercises authoring, graph mutation, singular selection, projection, isolation, and reset safety.

# Cards And Workers Manual Test Guide

## Purpose

Use this guide after unit/integration tests to validate the CLI as an operator would. Run it only in disposable directories with isolated `HOME`, `AGENTS_DIR`, and downstream target paths.

## Sandbox

```bash
export DRWN_REPO=/absolute/path/to/darwinian-minds
export DRWN_SANDBOX="$(mktemp -d)"
export HOME="$DRWN_SANDBOX/home"
export AGENTS_HOME_DIR="$HOME"
export AGENTS_DIR="$HOME/.agents"
export AGENTS_REPO_ROOT="$DRWN_REPO"
mkdir -p "$HOME" "$DRWN_SANDBOX/project"
cd "$DRWN_SANDBOX/project"
```

Run the source CLI as:

```bash
drwn() { bun run "$DRWN_REPO/cli/index.ts" "$@"; }
```

Do not point this test at a real home directory or production project.

## 1. Initialize Supported State

```bash
drwn init --non-interactive
cat .agents/drwn/config.json
```

Expected:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": [],
  "activeWorker": null
}
```

The project config and lock are intent. Generated files and downstream tool files are projection.

## 2. Author Capability Cards

```bash
CARD_COLLECTION="$PWD/cards"
drwn card new @manual/notion --into "$CARD_COLLECTION" --no-git
drwn card source add-skill "$CARD_COLLECTION/notion" notion-knowledge
drwn card source add-mcp "$CARD_COLLECTION/notion" notion
drwn card source doctor "$CARD_COLLECTION/notion" --json
drwn card publish --from "$CARD_COLLECTION/notion"

drwn card new @manual/fal --into "$CARD_COLLECTION" --no-git
drwn card source add-skill "$CARD_COLLECTION/fal" fal-image
drwn card source doctor "$CARD_COLLECTION/fal" --json
drwn card publish --from "$CARD_COLLECTION/fal"
```

Check each ordinary source repository under `$CARD_COLLECTION`, confirm no
`$AGENTS_DIR/drwn/sources/` directory was created, and inspect each immutable
publication under the Card Store. Publishing an existing version must fail
rather than overwrite it.

## 3. Compose And Publish One Blueprint

```bash
drwn worker new @manual/operator --into "$CARD_COLLECTION" --no-git
drwn worker compose "$CARD_COLLECTION/operator" --add @manual/notion@^1.0.0
drwn worker compose "$CARD_COLLECTION/operator" --add @manual/fal@^1.0.0
drwn card source doctor "$CARD_COLLECTION/operator" --json
drwn worker publish --from "$CARD_COLLECTION/operator"
```

Inspect the Blueprint:

```bash
drwn card show @manual/operator@1.0.0 --json
```

Expected:

- `kind` is `blueprint`;
- `composedFrom` preserves Notion then Fal order;
- each member is a plain Card;
- no credential value appears in source or manifest.

## 4. Apply And Select

```bash
cd "$DRWN_SANDBOX/project"
drwn apply @manual/operator@^1.0.0
drwn status --json
```

Expected:

- config contains one root requirement and `activeWorker: "@manual/operator"`;
- lock uses `drwn.project-lock` V1;
- `workerRoots` contains one Blueprint root with two ordered members;
- `cards` order is operator, notion, fal;
- every immutable Store/Git Card has version, integrity, tree SHA, and commit provenance.

Adding an alternative root must not merge its capabilities:

```bash
drwn add @manual/notion@^1.0.0
drwn status --json
```

The selected root remains `@manual/operator`. The plain Notion root is installed as an alternative but contributes no second closure.

## 5. Singular Selection

```bash
drwn use @manual/notion --no-write
drwn status --json
drwn use @manual/operator --no-write
drwn use --none --no-write
drwn status --json
drwn use @manual/operator --no-write
```

Expected:

- every operation records exactly one root name or explicit `null`;
- selection never changes root requirements or lock bytes;
- selecting a Blueprint activates its full ordered closure;
- selecting the plain Card activates only that Card;
- an unknown member/root name fails before mutation.

## 6. Pure Projection

Record intent hashes:

```bash
shasum -a 256 .agents/drwn/config.json .agents/drwn/card.lock
drwn write --dry-run
drwn write
drwn write --skills-only
drwn write --mcp-only
drwn write --target codex
shasum -a 256 .agents/drwn/config.json .agents/drwn/card.lock
```

The before/after hashes must match for every write mode.

Generated state must contain:

```text
.agents/drwn/generated/workers.json
.agents/drwn/generated/active-worker.json
.agents/drwn/generated/workers/@manual/operator/worker.json
.agents/drwn/generated/workers/@manual/notion/worker.json
```

The operator directory is one aggregate bundle containing Notion and Fal capabilities. There are no sibling generated directories for Blueprint members solely because they are members. The independent Notion directory exists only because Notion was deliberately installed as its own alternative root.

## 7. Capability Isolation

Plant a machine-only capability:

```bash
drwn machine skill enable machine-only
drwn write --scope machine
cd "$DRWN_SANDBOX/project"
drwn write
drwn status --json
```

Expected:

- project generated output does not gain `machine-only`;
- project config and lock do not change;
- status reports user-home visibility, when present, as ambient rather than declared;
- inactive roots do not supply skills or MCP definitions.

Notion OAuth and any `ntn` token remain outside project state. A missing OAuth grant may prevent the downstream MCP client from starting, but it does not alter the Worker graph.

## 8. Local Overlay

Use source-linking commands to create local replacements, then inspect:

```bash
cat .agents/drwn/config.local.json
cat .agents/drwn/card.lock.local
drwn status --json
```

Expected:

- local config is `drwn.project-local` V1;
- local lock is `drwn.project-lock` V1;
- committed config/lock remain byte-identical;
- status attributes replaced/local-only artifacts to the local overlay;
- local files are ignored by Git.

## 9. Root Mutations

```bash
drwn pin @manual/operator@1.0.0 --dry-run
drwn update @manual/operator --dry-run
drwn remove @manual/notion --dry-run
drwn apply @manual/operator@1.0.0 @manual/notion@1.0.0 --active @manual/operator --dry-run
```

Repeat without `--dry-run` after inspecting each plan. Config and lock must change together. Removing the selected root must set selection to `null`, never choose an alternative automatically.

## 10. Install From Lock

In a second isolated home, copy only the committed project files and run:

```bash
drwn install --frozen --json
drwn install --no-write --json
drwn write --dry-run --json
drwn install --json
```

`--frozen` fails when required Card bytes are absent. The normal install hydrates exact lock artifacts and projects the selected closure. It never changes root requirements or selection.

## 11. Capture

With the operator selected:

```bash
drwn card new @manual/captured --from-project . --into "$CARD_COLLECTION"
drwn card source doctor "$CARD_COLLECTION/captured" --json
```

The captured source contains only the selected closure plus explicit project overlays. It excludes alternative roots, machine profile and inventory selections, ambient user-home capabilities, generated bytes, platform connectors, and secret values.

With `drwn use --none`, capture must fail without creating a source.

## 12. Deploy Preflight

```bash
drwn worker deploy @manual/operator@1.0.0 --name manual-operator
```

Without deployment credentials, stop after observing local payload construction. Contract tests must prove the remote payload has one entrypoint plus pinned closure and does not contain local schema names. Trying to deploy a Blueprint member or an inactive independent root from project context must fail locally before auth or network access.

## 13. Diagnostics And Safety

```bash
drwn status --why skill:notion-knowledge
drwn doctor --json
drwn machine inventory gc --json
drwn --help
```

Expected:

- provenance points to the selected closure Card;
- doctor is report-only;
- inventory GC reports a dry-run and does not prune current inventory;
- help exposes no public whole-Store archive command;
- no broad archive is created by any diagnostic command.

## 14. Controlled Reset

Use [`docs/prelaunch-project-reset.md`](../../docs/prelaunch-project-reset.md) for development projects created before this contract. Preserve Card source repositories, remove unsupported project intent/projection, initialize clean state, apply the published Blueprint, and verify again. There is no automated migration.

## Cleanup

```bash
rm -rf "$DRWN_SANDBOX"
```

Unset the sandbox environment variables before returning to normal work.
