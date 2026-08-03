<!-- ABOUTME: Defines the first supported local project and Worker contract for drwn 0.8.0. -->
<!-- ABOUTME: Covers roots, selection, schemas, projection, diagnostics, and operator-owned runtime state. -->

# Project Worker Contract V1

This is the first supported public contract for project-local `drwn` state. It is a clean-slate contract: only the self-identifying V1 documents below are valid inputs.

The workflow is:

```text
author Cards -> compose one Blueprint -> add roots -> select one Worker -> write
```

## Domain Model

- A **Card** owns one reusable capability and its source provenance.
- A **Blueprint** is a Card whose ordered `composedFrom` list names plain Cards.
- A **Worker root** is an installed plain Card or Blueprint. Multiple roots are alternatives.
- A project selects zero or one root. `activeWorker: null` means no root is selected.
- A selected plain Card expands to itself. A selected Blueprint expands to its root Card followed by its ordered members.
- Member Cards are never independent active Workers. Composition happens in the Blueprint.

Use only the canonical project commands:

```bash
drwn init
drwn add <root-ref>
drwn apply <root-ref>... --active <root-name>
drwn remove <root-name>
drwn pin <root-ref>
drwn update [root-name]
drwn use <root-name-or-ref>
drwn use --none
drwn write --dry-run
drwn write
```

`drwn use` writes the selection and projects by default. Pass `--no-write` to commit intent without projection. Root mutations accept `--dry-run`; `drwn apply` requires `--active` or `--none` when more than one alternative root is supplied.

## Project Config

`.agents/drwn/config.json` is committed project intent:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": ["@team/operator@^1.0.0"],
  "activeWorker": "@team/operator"
}
```

`workers` contains ordered root requirements, never member Card refs. `activeWorker` is required and contains an installed canonical root name or `null`. Optional project-owned overlays include `mcpServers`, `skills`, `hooks`, `extensions`, `targets`, `trustedSources`, `materialization`, and `committedSurfaces`.

## Project Lock

`.agents/drwn/card.lock` is the immutable resolved graph:

```text
drwn.project-lock V1
store.minDrwnVersion = 0.8.0
workerRoots:
  - @team/operator requested as @team/operator@^1.0.0
    kind = blueprint
    members = [@team/notion, @team/fal]
cards:
  - exact CardLockEntry for @team/operator
  - exact CardLockEntry for @team/notion
  - exact CardLockEntry for @team/fal
```

`workerRoots` preserves root and member order. `cards` contains each root and reachable member once, with exact version, integrity, manifest, origin, requested ref, and tree SHA/Git provenance where required. Config and lock are prepared and committed as one project-state transaction.

A Card may also carry independent, explicit consent records:

```json
{
  "hookConsent": {
    "consentedAt": "2026-07-23T00:00:00.000Z",
    "consentedRange": "^1.0.0"
  },
  "instructionConsent": {
    "consentedAt": "2026-07-23T00:00:00.000Z",
    "consentedRange": "^1.0.0",
    "contentDigest": "sha256-..."
  }
}
```

Instruction consent remains valid while the locked version stays within the
consented range. Exact content preserves the existing record. Changed explicit
instruction content within that range is re-granted with a fresh timestamp and
the current digest, with a warning. A version outside the range, or removal of
the consent-relevant contribution, drops consent and requires a new
`drwn card trust <name> --instructions`.

## Local Overlay

`.agents/drwn/config.local.json` is ignored machine-local intent:

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

Its companion `.agents/drwn/card.lock.local` uses `drwn.project-lock` V1. Local-only roots and replacements remain local and status attributes them to `local-overlay` rather than committed project state.

## Generated State

`drwn write` creates disposable, self-identifying projection records:

```text
.agents/drwn/generated/workers.json
  schema: drwn.generated-workers, schemaVersion: 1
.agents/drwn/generated/active-worker.json
  schema: drwn.generated-active-worker, schemaVersion: 1
.agents/drwn/generated/workers/<scope>/<name>/worker.json
  schema: drwn.generated-worker, schemaVersion: 1
```

There is one aggregate directory per installed root. A Blueprint root's aggregate contains its entire ordered Card closure, merged skills, MCP definitions, approved hooks, instructions, and provenance. Member Cards do not receive sibling Worker directories. The selected root also produces the active aggregate instructions used for projection.

Only `manifest.instructions.text` or `manifest.instructions.path` contributes to
the aggregate instructions. Skills, hooks, READMEs, Card identity, and generated
model output are never fallback instructions. Every contributing Card requires
explicit instruction consent regardless of origin.

## Instruction Projection

A full project `drwn write` composes consented explicit contributions in the
selected closure and writes those exact composed bytes inside one drwn-owned
block in repository-root `AGENTS.md`. Content outside that block is preserved
byte-for-byte. Duplicate, partial, nested, reversed, malformed, or unrecorded
reserved markers fail closed. `--force` may repair drift only when the prior
write record proves ownership.

The Card/content digest identifies canonical instruction content. The separate
ownership hash identifies the exact rendered block, including markers and
headers. These hashes are not interchangeable.

When instructions are desired, an absent `.claude/CLAUDE.md` is created as the
exact adapter `@../AGENTS.md`. A foreign file already containing that import is
accepted without ownership. A foreign file without it is preserved with an
advisory; `--apply-claude-adapter` adds only a managed import block. Cleanup
removes only unchanged, previously owned bytes.

`--mcp-only`, `--skills-only`, `--target`, and machine-scope writes retain but do
not rewrite instruction projection or its ownership.

## Status Contract

Project JSON status uses `schema: "drwn.project-status"` and `schemaVersion: 1`. It reports installed roots, one `activeWorker`, active closure Cards, local overrides, project overlays, declared capabilities, ambient observations, projection health, and an additive `instructionDelivery` section. Instruction delivery reports block state, content and ownership identities, Claude adapter state, and stable issue codes without exposing instruction content.

Declared project capabilities come only from the selected root closure and explicit project overlays. Machine capabilities and user-home target files may remain visible to an agent runtime, but they are **ambient**, diagnostic-only observations. They are not added to project intent or lock state.

## Pure Projection

`drwn write` is a pure projection of committed project state plus an explicit local overlay. Dry-run, target selection, skills-only, MCP-only, and full writes do not change config, lock, requirements, or selection. Project writes do not read the selected machine Worker as project capabilities.

Normal writes exclude unconsented or stale explicit instruction contributions
and warn with Card IDs. `drwn write --strict` fails before instruction
projection when any selected contributor lacks valid instruction consent.

## Organization Worker Bundle Boundary

`OrgWorkerBundleV1` is a frozen downstream handoff from organization
provisioning. The Worker consumer verifies the bundle's blueprint identity,
pinned Card identity, exact explicit instruction digest, and consent range
without network resolution or local-source substitution. Organization grants,
protocols, and provenance references remain opaque evidence. The bundle cannot
claim credentials, harness files, applied state, or current readiness.

The supported materialization profile is
`drwn-org-worker-materialization@1`. A complete handoff contains immutable
bundle JSON, `worker-artifact-snapshot@1`, and every referenced directory-backed
Card tree. The snapshot path's parent is the packet root. V1 accepts Worker-root
and Card artifacts for `project_workspace`, an empty project overlay, and
`worker-materialization-receipt@1`; unsupported environments, overlays,
artifact kinds, receipt versions, or a Worker version below
`minimumWorkerVersion` fail before project mutation.

Each snapshot entry uses
`contentFormat: "darwinian-card-tree-directory@1"` and a relative,
non-traversing `contentPath` below that concrete non-symlink packet root.
Verification closes the bundle pin against version/integrity, canonical raw
content-tree digest, Git tree SHA, Git commit, and strict Card manifest. Bundle
hook consent is retained as evidence but rejected with
`ORG_WORKER_HOOK_CONSENT_UNSUPPORTED` until this profile defines a proven hook
projection mapping.

Apply the handoff only with all three identities and frozen mode:

```bash
drwn install --frozen \
  --org-worker-bundle ./packet/org-worker-bundle.json \
  --worker-artifact-snapshot ./packet/snapshot.json \
  --operation-id operation:provision:0001
```

`--dry-run` and `--no-write` perform compatibility, artifact, and consent
verification and derive the requested-state plan, but create no config, lock,
journal, record, projection, or success receipt. For reconcile/remove, planning
does not verify prior record ownership or claim the mutation is feasible. A
successful write commits config and lock transactionally,
vendors verified Card bytes into the project, projects instructions, reads all
postconditions back, then appends a `worker-materialization-receipt@1` and a
bounded materialization record. A retained operation journal resumes the same
operation ID after interruption; reusing an ID for different bundle, snapshot,
or action bytes fails.

Organization consent remains external evidence in the materialization record;
it is never copied into a Card's local `instructionConsent`. The instruction
composer labels local and organization evidence separately, and diagnostics
report `local`, `organization`, or `mixed` provenance without instruction
content.

Repair and removal require the exact prior materialization record and handoff:

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

Reconcile repairs only record-owned config/lock, vendor, projection, adapter,
and ownership drift. Removal deletes only no-longer-desired, proven
bundle-owned roots, Cards, vendor trees, projection, and adapter bytes.
Artifacts/adapters required by a retained unrelated projection remain; local
consent remains only on retained Cards. Unrelated overlays and user bytes
remain. Removal leaves a non-authoritative tombstone and a chained `removed`
receipt. Missing or drifted ownership evidence fails closed.

`drwn status` and `drwn doctor` expose additive
`orgWorkerMaterialization` local evidence with
`absent|compatible|current|drifted|blocked|removed|unknown`. They do not query
organization systems or report readiness. Foundry may envelope or reference
the immutable Worker receipt in `organization-receipt@1` with
`receiptKind: "worker_materialization"`. It verifies the domain-separated
digest over the complete Worker receipt (including `receiptId`) and references
or envelopes it without copying instruction content or mutable local paths.
That mapping does not change Worker-local state or make either receipt an
authorization/readiness grant.

Rollback requires the operator/deployment layer to fence new operations
externally; there is no `drwn` fence command. Preserve journals and append-only
receipts, then use verified reconcile/remove flows. Never roll back by deleting
evidence, lowering the version floor, converting organization consent to local
consent, or overwriting foreign files.

## Runtime And Authentication State

Cards may declare MCP definitions, but runtime installation and credentials remain operator state:

- Notion's hosted MCP requires the operator to complete OAuth in each relevant client.
- An `ntn`/Notion API token belongs in operator environment or secret storage, never in a Card, Blueprint, config, lock, or generated output.
- External stdio tools such as Momentic must be installed and authenticated separately on the machine.
- Missing OAuth, API keys, executables, or initialize handshakes are readiness diagnostics, not Worker graph failures.

## Machine Worker Boundary

Machine scope uses a separate strict `drwn.machine` V2 contract. Guided setup
may select the opt-out recommended `@curation-labs/machine-defaults` Blueprint;
non-interactive setup writes `activeWorker: null` and `workerLock: null`. Its
embedded immutable closure may project skills, MCP definitions, a generated
Worker, consented hooks, and consented instructions to user-home targets.

This does not alter the project V1 contract. Project evaluation never inherits
the machine Worker, and machine evaluation never reads the current project.
V1/prototype machine state is rejected without migration.

## Machine State Safety

No public command creates a whole-Store archive. Deploy uses a separate
allowlisted export containing only the pinned closure needed by the unchanged
remote deploy contract. Portable machine inventory transfer remains a separate
Task 82 contract.
