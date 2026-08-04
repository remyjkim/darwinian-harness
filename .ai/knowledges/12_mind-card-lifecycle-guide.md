# ABOUTME: Operator guide to the optional Worker Mind lifecycle and semantic memory contract.
# ABOUTME: Covers Card seeds, BeginningDB state, diagnostics, reset, and verified test tiers.

# Worker Mind Lifecycle Guide

**Status**: Active
**Last Updated**: 2026-07-13
**References**: [Analysis 117](../analyses/117_worker-mind-semantic-memory-target-architecture.md), [Task 84](../tasks/84_worker-mind-semantic-memory-implementation-plan.md), `<card-collection>/mind-tools/CONVENTIONS.md`

## Mental Model

A project declares Card roots and selects at most one Worker. The selected
Worker's locked Blueprint closure is the only project-declared capability
graph. A Mind is optional runtime state for that Worker, not a second Worker
selection model.

The closure is Mind-capable only when at least one locked Card declares the
strict semantic memory object. Cards may carry reviewed persona and belief
seeds. BeginningDB carries the live persona, beliefs, observations, and
insights. The CLI connects the two through provision, status, sync, diff,
checkpoint, doctor, and retirement.

## Card Contract

```json
{
  "persona": {
    "include": ["voice"],
    "visibility": "internal"
  },
  "beliefs": {
    "include": ["quality"],
    "visibility": "internal"
  },
  "memory": {
    "observations": { "format": "jsonl" },
    "insights": { "format": "md" }
  },
  "harness": { "minVersion": "0.9.0" },
  "lastValidatedWith": "0.9.0"
}
```

The memory object is closed and declaration-only. Both keys are required with
their exact formats. Card-owned memory files, partial declarations, unknown
kinds, and `raw_data` are unsupported. Memory has no visibility field because
it is DB-native runtime state. Persona and beliefs retain explicit Card
visibility and remote push gates.

Every Mind-bearing lock raises `store.minDrwnVersion` to `0.9.0`. A non-Mind
project Worker graph retains the first public project floor of `0.8.0`.

## Authoring

```bash
drwn card new @team/research-mind --no-git
drwn card source add-persona @team/research-mind voice --visibility internal
drwn card source add-belief @team/research-mind quality --visibility internal
# Add the strict memory declaration to the tracked source manifest.
drwn card source doctor @team/research-mind --json
drwn card validate file:/path/to/research-mind --json
drwn card publish @team/research-mind
```

Use `author-mind-content` for persona and belief seeds only. Use
`@darwinian/mind-tools` for live observations and insights. Project Worker
selection belongs to the Operator Card's `manage-project-worker` skill.

## Runtime Lifecycle

```bash
drwn use @team/research-worker@1.0.0 --dry-run
drwn use @team/research-worker@1.0.0
drwn worker mind provision
drwn worker mind status --json
drwn worker mind sync --dry-run
drwn worker mind diff --json
drwn worker mind checkpoint --json
drwn worker mind doctor --json
drwn worker mind pool retire /pool/observations/2026-07-13/1200-<ulid>.jsonl --yes
```

`provision` is idempotent and seeds from the selected Worker's valid locked
closure. If that closure does not declare the Mind capability, every Mind
command fails with `MIND_CAPABILITY_NOT_DECLARED`, even when an unrelated
installed Card declares memory.

The binding comes from a deployed Worker or direct environment variables:
`BGDB_BASE_URL`, `BGDB_TOKEN`, `BGDB_TENANT_ID`, and a Mind ID supplied by
`--mind-id` or `BGDB_PATH_PREFIX=minds/<mindId>`. Tokens are never persisted
in the binding cache.

## Semantic Storage

Canonical pool entries are immutable identities:

```text
/pool/observations/<yyyy-mm-dd>/<HHmm>-<ulid>.jsonl
/pool/insights/<yyyy-mm-dd>/<HHmm>-<ulid>.md
```

Default Mind views are placements of those same inodes:

```text
/minds/<mindId>/memory/observations/by-date/<yyyy-mm-dd>/<file>.jsonl
/minds/<mindId>/memory/insights/by-date/<yyyy-mm-dd>/<file>.md
```

Additional views, such as `memory/insights/by-topic/quality/current.md`, are
also placements, never copies. An observation is one JSON object per line.
An insight is Markdown with `ts`, `derivedFrom`, and optional `topics` front
matter.

The strict index at `/minds/<mindId>/mind.json` uses schema
`drwn.mind-index`, version `1`. It records seed provenance and expected
semantic view roots. Unknown fields, unsupported versions, partial objects,
and malformed values fail closed without echoing persisted content.

## Diagnostics And Reset

`drwn worker mind doctor` reports binding health, invalid index state,
unplaced canonical pool entries, Mind views missing a canonical pool
placement, and unsupported legacy or reserved residue. Additional by-topic
placements do not count as duplicate content because health is based on inode
identity.

There is no migration reader. For prelaunch state using an unsupported schema
or path grammar, delete and reprovision the affected Mind subtree in a
controlled environment. Do not rewrite persisted state in place.

Retirement accepts only a canonical observations or insights pool path. It
validates the path before any DB mutation, requires human confirmation, and
deletes every placement. Agent-facing forget operations unplace only the
selected Mind's view.

## Verification

```bash
bun test test/core-mind-*.test.ts test/commands-worker-mind.test.ts
bun test test/mind-substrate-e2e.test.ts test/mind-substrate-pollution.test.ts
DRWN_E2E_BGDB=1 \
DRWN_E2E_BGDB_BIN=/path/to/beginningdb \
bun test test/e2e-mind-journey.test.ts
```

The real-server journey verifies CAS behavior, semantic pool/view placement,
shared inode identity, strict index readback, DB-first edits, sync, and
checkpoint behavior.
