---
sidebar_position: 11
---

# Worker Instructions

Worker instructions are an explicit, consented Card contribution projected into
the repository-root `AGENTS.md`. They are separate from skills and hooks:

- a skill is an on-demand capability package;
- a hook intercepts lifecycle/tool events;
- instructions are always-on operating guidance for the selected Worker.

Only `card.json` `instructions.text` or `instructions.path` contributes.
`drwn` never substitutes a bundled skill, README, Card identity, hook, or model
output.

## Author

Declare exactly one source:

```bash
drwn card source set @your-handle/operator \
  --instructions-text "Follow the reviewed operating procedure."

drwn card source set @your-handle/operator \
  --instructions-path INSTRUCTIONS.md

drwn card source set @your-handle/operator --clear-instructions
```

A path is Card-relative and must resolve to a regular UTF-8 file inside the Card
source. Line endings are canonicalized to LF with one final newline, and the
canonical bytes are limited to 65,536 bytes.

## Consent

Every Card origin requires explicit consent:

```bash
drwn card trust @your-handle/operator --instructions
drwn card trust @your-handle/operator --instructions --range "^1.0.0"
drwn card untrust @your-handle/operator --instructions
```

The lock records the consent time, semver range, and exact canonical content
digest. The range must include the current locked version. A later update
preserves identical content inside the range; changed instruction content
inside the range is explicitly re-granted with a fresh timestamp/current digest
and warning. A version outside the range or removed contribution drops consent.

When a consented lock arrives from another machine, the first local write emits
one notice and records a machine-local acknowledgement keyed by project, Card,
range, and content digest.

## Projection and ownership

A full project write composes consented contributions in active-closure order:

```bash
drwn write --dry-run
drwn write
```

Unconsented contributions are excluded with Card-ID-only warnings.
`drwn write --strict` fails before instruction projection when any selected
contribution lacks valid consent.

The exact composed bytes appear in the generated Worker instructions and inside
one marked block in root `AGENTS.md`. Bytes outside the block are preserved
exactly. Partial MCP/skill/target writes do not touch instruction files or
ownership.

Two hashes serve different purposes:

- the content digest identifies canonical instruction content;
- the ownership hash identifies the exact rendered block, including markers and
  headers.

Malformed, duplicate, nested, reversed, partial, or unrecorded reserved markers
fail closed. `--force` repairs only a recognized block whose prior ownership is
recorded; it never claims unrelated user bytes.

## Claude adapter

Claude reads root instructions through `.claude/CLAUDE.md`:

- absent file: write exact `@../AGENTS.md`;
- foreign file with that import: preserve it without claiming ownership;
- foreign file without it: preserve and advise;
- `--apply-claude-adapter`: add only a managed import block;
- removal: delete only unchanged owned content or the unchanged owned block.

Malformed adapter markers and ownership drift are preserved and reported.

## Diagnostics and organization handoff

`drwn status --json` exposes `instructionDelivery` with state, content and
ownership identities, adapter state, and stable issue codes. It never includes
instruction text. `drwn doctor` treats instruction block errors as unhealthy;
adapter warnings and advisories remain non-fatal.

`OrgWorkerBundleV1` may hand a frozen set of pinned Cards and explicit
instruction consents to the Worker layer. The consumer verifies pins, ranges,
and content digests without network resolution. Organization grants, protocols,
and provenance references stay opaque and are not applied by instruction
projection.

The handoff's organization consent remains external evidence in the bounded
materialization record. It is never converted to a Card's local
`instructionConsent`. Composition records the evidence kind and stable consent
ID; diagnostics summarize the source as `local`, `organization`, or `mixed`
without exposing the contribution bytes.

Fresh materialization requires the bundle, its
`worker-artifact-snapshot@1`, every referenced immutable Card tree, an explicit
operation ID, and `--frozen`. `--dry-run`/`--no-write` validate without a
success receipt. A write emits `worker-materialization-receipt@1` only after
config, lock, vendor bytes, instruction block, ownership, and adapter
postconditions pass read-back.

V1 rejects bundle hook consent with
`ORG_WORKER_HOOK_CONSENT_UNSUPPORTED`. Hook evidence cannot materialize until a
versioned profile defines the exact hook projection and ownership mapping.

Reconcile and remove use the prior materialization record as their ownership
boundary. They cannot adopt foreign markers or overwrite user bytes. Removal
leaves a tombstone, clears organization consent from effective composition, and
chains its receipt to the prior verified receipt.
