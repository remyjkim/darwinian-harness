---
sidebar_position: 19
---

# Install

In ordinary mode, `drwn install` bootstraps a project by fetching all cards
declared in `card.lock` into the local store, then writing effective project
state. It is the standard first command after cloning a project. The immutable
organization handoff mode below can instead derive a fresh config and lock.

## Basic usage

```bash
drwn install
```

Ordinary mode reads `.agents/drwn/card.lock`, ensures every locked card is
present in the local Git-backed store, then runs the same write pipeline as
`drwn write` to materialize skills, MCP servers, and target config.

If no `card.lock` is found, ordinary mode exits with an error and suggests
`drwn apply` instead.

## Flags

| Flag | Description |
|---|---|
| `--frozen` | Ordinary install: fail instead of cloning, fetching, or updating an existing lock. Organization handoff: required offline mode; exact fresh config/lock may be created from verified packet bytes. |
| `--no-write` | Fetch and verify Cards without writing downstream files. Reports Card count and lock status; does not run `drwn write`. |
| `--dry-run` | With an organization Worker handoff, verify and plan without writing any state or success receipt. |
| `--org-worker-bundle <path>` | Read immutable `OrgWorkerBundleV1` JSON. Requires the snapshot, operation ID, and `--frozen`. |
| `--worker-artifact-snapshot <path>` | Read `worker-artifact-snapshot@1`; its parent directory is the packet root. |
| `--operation-id <id>` | Bind retries to one exact bundle, snapshot, and action request. |
| `--reconcile` | Repair only state attributed to the prior matching materialization record. |
| `--remove` | Remove only state attributed to the prior matching materialization record. |
| `--json` | Emit machine-readable JSON output. |

## Examples

```bash
# Typical first run after cloning
drwn install

# CI: fail if lock is stale or any card needs fetching
drwn install --frozen

# Resolve cards without writing downstream config
drwn install --no-write

# Machine-readable output
drwn install --json
```

## Immutable organization Worker handoff

A complete handoff can bootstrap an empty project without network resolution:

```bash
drwn install --frozen \
  --org-worker-bundle ./packet/org-worker-bundle.json \
  --worker-artifact-snapshot ./packet/snapshot.json \
  --operation-id operation:provision:0001
```

The three handoff arguments must be supplied together and require `--frozen`.
The supported `drwn-org-worker-materialization@1` profile accepts
directory-backed Worker-root and Card artifacts, `project_workspace`, an empty
project overlay, and `worker-materialization-receipt@1`. Unsupported artifact or
overlay kinds, a mismatched digest, or a Worker version below the bundle floor
fails before project mutation.

Each snapshot entry must declare
`contentFormat: "darwinian-card-tree-directory@1"`, a safe relative
non-symlink `contentPath`, content-tree digest, Git tree SHA/commit, integrity,
and exact Card identity. Bundle hook consent is rejected with
`ORG_WORKER_HOOK_CONSENT_UNSUPPORTED` until a later profile defines a proven
hook projection mapping.

Stable runtime error families include:

| Boundary | Codes |
|---|---|
| Bundle/snapshot | `ORG_WORKER_BUNDLE_DIGEST_MISMATCH`, `ORG_WORKER_ROOT_ORDER_INVALID`, `ORG_WORKER_ACTIVE_ROOT_INVALID`, `ORG_WORKER_CONSENT_INVALID` |
| Compatibility | `ORG_WORKER_VERSION_UNSUPPORTED`, `ORG_WORKER_ENVIRONMENT_UNSUPPORTED`, `ORG_WORKER_PROJECT_OVERLAY_UNSUPPORTED`, `ORG_WORKER_ARTIFACT_KIND_UNSUPPORTED`, `ORG_WORKER_RECEIPT_VERSION_UNSUPPORTED`, `ORG_WORKER_HOOK_CONSENT_UNSUPPORTED` |
| Artifact closure | `ORG_WORKER_ARTIFACT_BYTES_MISSING`, `ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH`, and specific path/tree/integrity errors |
| Owned state | `ORG_WORKER_MATERIALIZATION_DRIFT`, `ORG_WORKER_REMOVAL_OWNERSHIP_DRIFT` |

Outer packet descriptor/manifest identity is verified at the release boundary;
the CLI receives bundle, snapshot, and content paths and does not fabricate an
outer-packet runtime result.

The command verifies the exact bundle, snapshot, Card bytes, Git tree,
integrity, and every instruction consent. It then commits config and lock as
one transaction, vendors verified bytes, projects instructions and the Claude
adapter, verifies the resulting ownership state, and only then appends a
success receipt and local materialization record.

Organization consent stays external evidence. It is not copied into
`card.lock` as local `instructionConsent`.

### Preview and interruption recovery

`--dry-run` and `--no-write` perform handoff verification and derive the
requested-state plan, but write no project state, journal, receipt, or record.
For reconcile/remove they do not load the prior ownership record or prove that
the requested mutation is feasible. Neither result is a successful
materialization claim.

Mutating operations retain a bounded journal until config, lock, projection,
receipt, and record are durable. Retry the same action with the same operation
ID to resume. Reusing the ID with different request bytes fails.

### Repair and removal

Use the exact original handoff:

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

Reconcile repairs only record-owned state and verifies it again. Remove deletes
only no-longer-desired proven bundle-owned roots, Cards, vendor trees,
instruction projection, and adapter bytes. Adapters required by a retained
projection remain; local consent remains on retained Cards. Unrelated overlays
and user bytes remain. A successful removal leaves a tombstone and a `removed`
receipt chained to the prior verified receipt. Missing or drifted ownership
proof fails closed.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All Cards fetched; downstream state written (or skipped with `--no-write`). |
| `1` | One or more cards failed to fetch; errors reported per card. Also exits 1 when `--frozen` would require a clone, fetch, or lockfile update. |

## JSON output schema

```json
{
  "ok": true,
  "cards": 1,
  "applied": true,
  "replayed": false,
  "action": "materialize",
  "outcome": "verified",
  "receiptId": "worker-materialization-..."
}
```

The handoff form includes `action`, and includes `outcome`/`receiptId` only
when a receipt exists. With `--dry-run` or `--no-write`, `applied` is `false`
and no receipt identity is returned. The ordinary lock-install form retains
its existing `lockfileChanged`/per-Card error output.

Handoff failures currently print their stable bounded error code to stderr,
including when `--json` was requested; do not parse a success payload on a
non-zero exit.

## Difference from `drwn write`

`drwn install` = fetch missing cards from lock **+** write downstream state.

`drwn write` = write downstream state only (cards must already be present in the store).

Use `drwn install` when you've just cloned a repo or when any card may not be present locally. Use `drwn write` for applying config changes when all cards are already in the store.

## See also

- [Run drwn doctor in CI](../../guides/doctor-in-ci) — CI workflow using `drwn install --frozen`
- [Card Spec](../specs/card-spec) — card.lock format
- [`drwn write`](./write) — write-only pipeline
