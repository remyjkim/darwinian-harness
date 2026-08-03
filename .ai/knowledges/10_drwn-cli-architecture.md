# ABOUTME: As-built architecture reference for the first supported drwn project Worker contract.
# ABOUTME: Covers state authority, graph resolution, transactions, projection, diagnostics, deploy, and machine boundaries.

# drwn CLI Architecture

## Contract

The first supported project model is:

```text
Card capabilities -> one Blueprint root -> one selected Worker -> pure projection
```

Cards remain the only reusable distribution unit. A Blueprint is a Card with `kind: "blueprint"` and an ordered `composedFrom` list of plain Cards. Projects may install multiple roots as alternatives but select at most one.

See [`docs/contracts/project-worker-v1.md`](../../docs/contracts/project-worker-v1.md) for serialized contracts.

## Process And Context

`cli/index.ts` registers Clipanion commands and creates `AgentsContext` from environment/path resolution. Core modules do not import Clipanion; they return typed values or throw `DrwnError` with stable codes.

Important roots:

- repository assets: `AGENTS_REPO_ROOT` or packaged files;
- machine state root: `AGENTS_DIR/drwn`, normally `~/.agents/drwn`;
- user home: `AGENTS_HOME_DIR` or the OS home;
- project root: nearest ancestor containing `.agents/drwn/config.json`.

Tests override every root. Project tests must never inspect the developer's real user-home target files.

## State Ownership

### Machine State

`~/.agents/drwn/` owns:

```text
store.json
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

The root contains standalone inventory, machine intent, authoring preferences,
caches, generated machine output, registrations, and credentials. `config.json`
is strict `drwn.user-preferences` V1 state: configured catalog checkouts and an
optional default author scope. It is distinct from capability intent in
`machine.json`. These categories do not share one portability or ownership
policy. No public whole-root archive command exists. A pre-I176 `sources/` tree
may remain as legacy operator data, but drwn does not use, migrate, or delete it.

### Project Intent

Committed project authority is:

```text
.agents/drwn/config.json
.agents/drwn/card.lock
```

Machine-local authority is:

```text
.agents/drwn/config.local.json
.agents/drwn/card.lock.local
```

Generated directories, downstream target files, and write records are projections. They are never read to reconstruct root requirements or selection.

## Supported Schemas

| Record | Identity | Version |
| --- | --- | --- |
| committed config | `drwn.project-config` | `1` |
| committed/local Card lock | `drwn.project-lock` | `1` |
| local overlay | `drwn.project-local` | `1` |
| project status | `drwn.project-status` | `1` |
| generated root index | `drwn.generated-worker` | `1` |
| generated root registry | `drwn.generated-workers` | `1` |
| generated selected root | `drwn.generated-active-worker` | `1` |

Validators require both schema identity and version, reject unknown fields where the contract is closed, and fail before side effects.

## Root Graph Resolution

`cli/core/worker-graph.ts` resolves ordered root requirements:

1. Resolve each root ref through `card-store.ts`.
2. Convert the immutable artifact to a `CardLockEntry`.
3. For a Blueprint, resolve each ordered `composedFrom` member.
4. Reject nested Blueprints, duplicate members, duplicate roots, and incompatible artifacts for the same Card name.
5. Return `roots` plus a deduplicated `cards` sequence.

Example:

```text
requirements = [Blueprint(R, A, B), Card(C)]
roots        = [R, C]
cards        = [R, A, B, C]
```

`workerRoots[].members` preserves closure order. `cards` preserves first reachability order and carries exact artifact provenance.

## Selection

`cli/core/effective-state.ts` is the selection and declared-capability authority:

- committed `activeWorker` is one installed root or `null`;
- local config may override selection or add local roots/replacements;
- one selected root expands to `[root, ...members]`;
- inactive roots remain installed alternatives;
- selected closure Cards produce Card skills, MCP definitions, hooks, persona/beliefs/memory, and generated Worker content;
- explicit project overlays apply after Card capability selection;
- machine profile and explicit machine inventory selections are not project declarations.

No command should rebuild this state independently. Status, doctor, MCP listing, add flows, capture, write, and generated Worker materialization consume the same authority or a focused derivative.

## Project Transactions

`cli/core/project-state-transaction.ts` owns config/lock mutations:

1. Acquire one exclusive owner lock.
2. Recover any supported interrupted transaction using retained immutable sources and hashes.
3. Read one config/lock snapshot.
4. Resolve and validate complete next bytes.
5. Persist retained sources and a phase journal.
6. Replace targets in explicit phases.
7. Verify committed hashes and remove transaction state.

Stale-owner handling is fail-closed unless owner identity and liveness prove recovery is safe. Dry-run computes the same next bytes without locking or mutation.

`worker-project.ts` implements add, apply, remove, pin, update, and use on top of this transaction. A projection failure after `use` does not roll back valid project intent; it leaves projection unchanged and tells the operator to fix the error and rerun `drwn write`.

## Canonical Command Surface

Project mutation:

```text
drwn add <root-ref>
drwn apply <root-ref>... [--active <root>|--none]
drwn remove <root-name>
drwn pin <root-ref>
drwn update [root-name]
drwn use <root-name-or-ref>|--none
```

Card authoring remains under `drwn card`: source creation/editing, validation,
publication, catalogs, remotes, trust, inspection, and capture. Editable sources
are ordinary repositories selected by explicit path or by a unique manifest
match under user-configured `catalogCheckouts`; the machine Store contains only
immutable publications and operational state. Blueprint authoring uses
`drwn worker new`, `drwn worker compose`, and `drwn worker publish`, with the
same source-path contract. Remote runtime operations remain under
`drwn worker deploy/list/status/...`.

## Pure Projection

`cli/core/sync.ts` builds one `EffectiveState`, plans ownership-safe writes, and synchronizes selected targets. Modes include:

- full write;
- `--dry-run`;
- `--skills-only`;
- `--mcp-only`;
- `--target`;
- explicit project or machine scope.

All project modes leave config and locks byte-identical. The write record tracks owned paths and hashes so cleanup never claims foreign bytes.

Project skill resolution does not scan machine-curated or target-specific compatibility directories. Project MCP registry construction includes only explicit built-ins/extensions, selected closure definitions, and full project-owned definitions.

## Generated Workers

`cli/core/worker-generator/sync-worker.ts` iterates `installedRoots`, not every locked Card.

For each root it:

1. Expands the root/member closure from selected graph state.
2. Validates capability conflicts.
3. Creates one stable root directory.
4. Materializes closure skills with Card attribution.
5. Merges MCP definitions.
6. Bundles consented hooks for selected runtimes.
7. Composes root and capability instructions.
8. Writes `worker.json` with root and member provenance.

`workers.json` lists all installed alternatives. `active-worker.json` and aggregate `instructions.md` identify the selected root. Dynamic labels and warnings never change stable directory dimensions or ownership paths.

## Effective Project Diagnostics

`buildProjectStatusV1` emits:

- installed Worker roots;
- one selected root and its source lane;
- active closure Cards;
- local override details;
- project skill/MCP/extension/target/hook overlays;
- declared skills, MCP definitions, and hooks with source provenance;
- ambient user-home observations;
- projection currency.

Ambient observations are diagnostic-only state. Task 83 implements target-specific collision classification and selected-target write preflight.

`status --why` uses the same provenance model. `doctor` is report-only and uses stable codes for invalid schema, graph, ownership, runtime, and ambient findings.

## Machine Inventory Boundaries

The pinned machine profile and explicit machine inventory selections remain a
separate authority for machine writes. They are not prepended to project
capability state.

Task 80 defines the clean namespaced machine schema and the Recommended
Darwinian Operator guided profile. The profile projects machine-safe skills and
approved MCP definitions only; it does not create a project Worker or project
declaration.

Task 81 defines drwn-managed standalone skill packages and MCP records.
Inventory is inactive until selected. Skill lifecycle is package-scoped,
package versions are immutable, MCP persistence is record-level, and stored
definitions retain secret references. Reference-sensitive operations follow
`inventory -> machine -> project`; stale registrations are repaired with
`drwn projects unregister`. Removal uses tombstone recovery, and inventory GC
is a dry-run by default. Cards own their bundled content.

Task 82 implements `drwn machine inventory export|bundle|verify|sync` over a
strict `drwn.portable-inventory` V1 manifest. Export and bundle snapshot only
active standalone records under the global inventory lock. Bundle staging uses
typed record paths rather than a Store-root walk. Verify is exact and
read-only. Sync validates and stages all bytes before target mutation,
revalidates source and target state under the lock, blocks all conflicts, and
installs only missing inactive records through Task 81 helpers. Extras are
preserved. Fresh sync creates inventory infrastructure but no `machine.json`.

## MCP Runtime State

Card and project files describe MCP definitions, not runtime authorization:

- hosted OAuth such as Notion is completed in the downstream client;
- API keys such as an `ntn` token remain in environment/secret storage;
- stdio tools such as Momentic are separately installed on the machine;
- startup failures are readiness diagnostics unless the definition itself is invalid.

Secret values never enter manifests, project state, generated provenance, status output, or deploy archives.

## Deploy Adapter

`cli/core/worker-deploy.ts` preserves remote contract version 1:

- one `entrypoint`;
- remote config `{ version: 1, cards: [rootRef] }`;
- remote lock shape used by existing consumers;
- root followed by pinned closure Cards;
- allowlisted Store export containing only required bare repositories, extracted trees, and Store metadata.

When run in project context, deploy accepts only the selected root. A member or inactive root fails locally before authentication/network access. Local schema names never enter the remote payload.

## Mind Adapter

Project Mind loading resolves the selected root followed by its ordered members. `mind.json` records:

- one `worker` provenance record;
- ordered `cards` provenance;
- persona/belief indexes;
- memory shape;
- seeded-file ledger and ETags.

Seed and sync reject an empty closure. Checkpoint maps provenance back to
editable Card sources by consulting project-local `sourceOverrides` first and
catalog checkouts second. Changed content with no resolved source fails with
`MIND_CHECKPOINT_NO_SOURCE`; unattributed persona content also fails.

## Capture

`card new --from-project` captures the selected closure and explicit project
overlays into the current directory or an explicit `--into` collection. It
excludes inactive alternatives, machine profile and inventory selections,
ambient user-home state, generated bytes, platform connectors, and resolved
secrets. No selected root fails without creating a source.

## Machine State Safety

No public command archives the whole machine state root. Credentials, machine
intent, registrations, write records, and caches therefore cannot be
accidentally bundled by an inventory lifecycle command.

Deploy's scoped export is a separate allowlist-built internal path. Task 82 now
provides a deterministic manifest and additive bundle format without changing
deploy. Portable artifacts are not a backup or restore and must not archive the
Store root. Their checksums detect corruption; a checksum is not authenticity.
Known-value, private-key, and risky-filename screening is a source-content
safeguard, not a general secret detector.

## Testing Boundaries

- Unit: validators, graph selection, policy, merge, serialization.
- Integration: project transactions, machine state resolution, target adapters.
- Command: canonical routing, JSON/human output, non-mutation failures.
- Smoke: clean project initialize/apply/use/write/status/doctor.
- E2E: published Blueprint resolution, consumer reset, downstream runtime observation, remote services only when credentials are available.

Every filesystem test uses isolated roots. External OAuth/install prerequisites are reported as skips, not converted into CLI schema failures.

## Reset

Unsupported development projects are deliberately reset using [`docs/prelaunch-project-reset.md`](../../docs/prelaunch-project-reset.md). The supported runtime contains no compatibility readers or mutation aliases.
