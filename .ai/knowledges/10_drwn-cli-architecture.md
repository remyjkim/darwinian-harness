# ABOUTME: As-built architecture reference for project and machine Worker Blueprint contracts.
# ABOUTME: Covers state authority, immutable graph resolution, transactions, projection, diagnostics, and safety.

# drwn CLI Architecture

## Contract

`drwn` is a local control plane for declared agent-harness state. Cards package
capabilities. A Worker Blueprint composes Cards. Each scope selects at most one
root closure, and `write` projects only that effective closure plus supported
scope-owned overlays.

The two selection scopes use the same Card-lock governance and remain exclusive:

- project scope: one selected Worker for one repository;
- machine scope: one selected Worker for user-home ambient defaults.

A project does not inherit the machine Worker. `drwn write` in a project and
`drwn write --root` are separate resolutions, plans, destinations, and ownership
records.

## Process And Context

The package exposes `drwn` from `cli/index.ts`. It discovers:

- machine state root: `AGENTS_DIR/drwn`, normally `~/.agents/drwn`;
- nearest project config by walking upward from CWD;
- authoring preferences from machine `config.json`; and
- packaged registries and policy shipped with the CLI.

`--root` forces machine scope even inside a project. Scope forcing must carry
through intent mutation, consent replay, planning, projection, diagnostics, and
write-record selection.

## State Ownership

### Machine state

```text
~/.agents/drwn/
  machine.json                  # V2 machine policy + selected Worker lock
  config.json                   # non-secret user authoring preferences
  skills/                       # standalone package/loose-skill inventory
  mcp-servers/                  # standalone MCP record inventory
  cards/                        # immutable Card Store content
  generated/                    # disposable machine projection artifacts
  global-write-record.json      # user-home projection ownership
  credentials/                  # operator-owned secrets/auth state
  projects/                     # project registrations
```

These categories are deliberately separate:

- `machine.json` says what immutable machine Worker is selected;
- `config.json` says where the user authors Cards (`catalogCheckouts`,
  `defaultAuthorScope`);
- inventory says which standalone packages/records are locally available;
- the Card Store holds immutable releases and content provenance;
- generated files are disposable projections;
- credentials and external runtime readiness are never Card content.

`~/.agents/drwn/sources/` is unsupported legacy data. Runtime resolution never
searches it or mutable `catalogCheckouts`.

### Project state

```text
<project>/.agents/drwn/
  config.json
  card.lock
  config.local.json             # ignored local overlay
  card.lock.local               # ignored local lock
  generated/
  write-record.json
```

Committed config records ordered root requirements and a canonical
`activeWorker`. The lock records exact roots, deduplicated Card entries,
integrity, provenance, topology, compatibility floors, and consent evidence.
Local overlays remain attributed and cannot rewrite committed intent.

## Supported Schemas

| State | Schema | Version |
|---|---|---|
| project intent | `drwn.project-config` | 1 |
| Card closure lock | `drwn.project-lock` | 1 |
| project local overlay | `drwn.project-local` | 1 |
| machine intent | `drwn.machine` | 2 |
| user preferences | `drwn.user-config` | 1 |

Machine V2 is a pre-launch hard cut:

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

An active machine stores a canonical Card name in `activeWorker` and embeds a
validated `drwn.project-lock` V1 value in `workerLock`. The lock root's
`requested` field retains the immutable versioned source. V1 profile, skill,
MCP, and `policy.authoring` fields are invalid. V1/prototype state is rejected
with controlled-reset guidance; it is never migrated, dual-read, or silently
deleted.

## Root Graph Resolution

`resolveCard` resolves only reproducible sources allowed by trusted-source
policy:

- immutable local Store content;
- explicit Git refs; and
- explicit file refs.

The resolver validates manifest identity, version, kind, composed membership,
content hashes, origin, and CLI compatibility. A Blueprint root composes ordered
plain Cards under the current validator. Multiple roots are installed
alternatives, not a merged capability set.

`catalogCheckouts` is an authoring lookup used by source-oriented commands. It
is intentionally absent from runtime `apply`, `use`, effective state, install,
and write resolution.

## Selection And Transactions

Project and machine mutations prepare config and lock together, validate the
result, then commit through the scope's locked transaction.

Project commands:

```text
drwn add|apply|remove|pin|update|use|install ...
```

Machine selection commands:

```text
drwn apply --root <refs> [--active <name>|--none]
drwn use --root <name-or-ref>|--none
```

`activeWorker` is canonical; version/transport stays in the lock. Machine
`apply` replaces installed roots. Machine `use` selects or adds a root while
retaining alternatives; `use --root --none` clears only selection. Consent uses
the shared project range contract: same content in range is preserved, changed
consent-relevant content in range is re-granted with current digest/timestamp
and a warning, and out-of-range or removed contributions drop consent.

Mutation and projection are distinct transactions. Selection commits valid
intent before an optional projection. If projection fails, intent remains and
the operator fixes the reported condition before rerunning `write`.

The legacy `drwn machine skill|mcp enable|disable` surface exits nonzero with
Blueprint guidance. Inventory lifecycle commands remain supported.

## Consent

Card hooks and instructions are denied until their exact locked release/digest
is trusted. Consent lives on Card lock entries.

Project trust targets the project lock. Machine trust uses:

```bash
drwn card trust <card> --hooks --scope machine
drwn card trust <card> --instructions --scope machine
```

The acknowledgement key carries a typed scope identity. `use`, `apply`, and
`write` replay acknowledgements in the selected scope, including `write --root`
from inside a project. Machine trust accepts only a Card in the active closure;
consent recorded while a Card was active remains on its lock entry if that root
later becomes inactive. Dry-run and non-interactive refusal never write an
acknowledgement.

## Effective State

`buildEffectiveState` selects exactly one authority:

1. nearest project config and its committed/local lock state; or
2. machine V2 and its embedded lock when machine scope is explicit.

For either selected Worker it:

- validates the lock/version floor;
- locates the canonical active root;
- reconstructs the active closure in deterministic order;
- loads immutable Card content;
- verifies locked content integrity;
- composes consented instructions and hooks;
- derives Card skill and MCP definitions; and
- applies supported scope policy and filters.

Machine state never derives capabilities from standalone inventory IDs.
Inactive alternative roots, mutable authoring checkouts, ambient compatibility
directories, and user-home target files are not activation authority.

## Pure Projection

`write` performs resolution and a complete ownership preflight before changing
any destination. It does not mutate config, locks, root requirements, or
selection.

Project destinations include repository-local Claude, Codex, Cursor, MCP,
generated Worker, hook, skill, and instruction surfaces. Machine destinations
include user-home equivalents plus the global generated directory.

Ownership rules:

- an unrecorded existing destination/managed field is foreign and blocks first write;
- recorded content with a mismatched digest is drift and blocks without force;
- force repairs only prior drwn-owned content;
- unrelated bytes/fields are preserved;
- stale unchanged owned output is removed;
- a late conflict discovered in preflight causes zero writes;
- dry-run applies identical planning and conflict rules without mutation.

Target filters, `--skills-only`, and `--mcp-only` limit both planning and
mutation. Excluded surfaces are not claimed or cleaned.

## Generated Workers

Each installed root may have one aggregate generated Worker directory, but only
the active closure projects downstream capabilities. A generated Worker carries
root identity, member topology, effective skills/MCP, consented instructions,
and consented hook assets. Member Cards do not become sibling Workers solely by
being composed.

Machine generated output is beneath `~/.agents/drwn/generated`; project output
is beneath `<project>/.agents/drwn/generated`. Generated bytes are disposable
and never reconstructed into intent.

## Machine Instruction And Hook Adapters

Machine instructions compose from the active root and member Cards and are
stored in the generated Worker. Managed blocks adapt the same bytes to:

- `~/.claude/CLAUDE.md`;
- `~/.codex/AGENTS.md`.

drwn never writes `~/AGENTS.md`. Cursor/OpenCode user adapters remain
unsupported until their discovery behavior is established.

Machine Claude hooks use managed fields in `~/.claude/settings.json` and
preserve unrelated settings. Unsupported target hook encoders fail/report as
defined by their current target contract; I177 does not invent new encodings.

## Skills And MCP

Project overlays may explicitly include available standalone skills or define
project MCP servers. Machine capability derivation is stricter: only Cards in
the active machine closure contribute skills/MCP definitions.

MCP definitions may contain environment-variable references but never resolved
secrets. OAuth grants, executables, environment expansion, timeouts, and
initialize handshakes remain operator runtime readiness. Target-native ambient
entries are observed for collision diagnostics, not imported into declarations.

## Machine Inventory Boundary

Package-backed skills and MCP records under the machine Store are standalone
inventory. Install/update/remove/list/show/reference commands manage
availability, not machine activation.

Portable inventory `export|bundle|verify|sync` remains inventory-only:

- deterministic metadata manifest;
- allowlisted package/MCP payload bytes in bundles;
- additive sync that preserves extras and keeps imported entries inactive;
- no machine intent, Worker lock, Cards, credentials, generated output,
  projects, caches, write history, inactive versions, or tombstones.

Checksums prove equality, not authenticity. The secret scan is a bounded source
safeguard, not a general secret detector.

## Authoring

Card authoring lives under `drwn card` and `drwn worker`. Source roots are
explicit paths or uniquely resolved matches in user-configured
`catalogCheckouts`. `drwn worker new` creates a Blueprint source;
`drwn worker compose` edits its membership. `drwn card publish --from <path>`
publishes immutable content.

The Card collection is a directory of independent source repositories, not one
runtime Store. On this development machine it is
`~/dev/darwinian-cards/cards/`. Runtime selection consumes published refs, not
those mutable working directories.

## Capture

`drwn card new --from-project` captures the selected project closure plus
explicit project overlays. `drwn card new --from-defaults` flattens the active
machine closure into a new plain Card. Capture excludes inactive roots,
standalone inventory not in the closure, ambient target state, generated bytes,
credentials, and resolved secrets.

## Diagnostics

Status and doctor distinguish declared, locked, effective, ambient, and
projected state. Machine V2 reports:

- canonical active Worker and requested immutable ref;
- installed roots and active Card closure;
- lock/content integrity and compatibility floors;
- closure-derived skill/MCP/hook/instruction provenance;
- consent gaps; and
- global projection ownership/currentness/conflicts.

Diagnostics are bounded and report-only. They do not repair, fetch, trust,
delete, or claim readiness for external runtimes.

## Deploy And Organization Handoff

Deploy and frozen organization Worker materialization use allowlisted,
versioned artifacts rather than whole-Store archives. They preserve stable
identity, receipts, provenance, compatibility, and consent boundaries. These
project/remote flows do not consume machine intent or user-home state.

`drwn worker materialize --payload <payload.json> --project-root <dir>` is the
canonical consumer of the frozen V1 deploy payload: it validates the contract
(exact `contractVersion`, digest-checked store bytes), seeds the store, stages
the derived project config and lock with target-relative card paths, installs
frozen from the lock, and projects with the write pipeline. Container boot is
this one invocation. `--store-export <tar>` supplies external store bytes
(digest-checked against the payload's declared sha256), and
`--emit-project-tar` / `--emit-store-tar` emit the minimal project snapshot
(config + lock only) and a store re-archive for the caller's boot contract.

## Testing Boundaries

- unit: schema, graph/lock invariants, descriptor, consent, pure planning;
- integration: isolated filesystem transactions and target adapters;
- end-to-end: published fixture Blueprint through apply/trust/write/status;
- release: shipped descriptors, Card contracts, docs, help, and hard-cut scans;
- manual: disposable `HOME`, `AGENTS_DIR`, project, and Card collection only.

The repository pins Bun `1.2.21`. Completion requires focused RED-GREEN
evidence, typecheck, the full pinned suite, release readiness, and green CI at
the reviewed commit.

## Reset

There is no public whole-Store backup/restore command. For unsupported V1 or
prototype machine intent, preserve any required non-secret audit copies outside
the Store, deliberately remove the unsupported `machine.json` and associated
global write record, rerun `drwn init`, and select an immutable Blueprint. Do
not ask drwn to infer provenance or automatically delete user-home ownership
state.
