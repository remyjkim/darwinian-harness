---
sidebar_position: 6
---

# Worker Launch Context V1 Schemas

Darwinian Worker 1.4.0 exposes four strict JSON schemas. Unknown fields,
unsupported versions, unsafe paths, duplicate set identities, noncanonical
ordering, and documents larger than 64 KiB fail closed.

## `drwn.worker-launch-plan`

Returned by:

```bash
drwn worker launch-context prepare <root> --target codex --dry-run --json
```

The plan contains the canonical project root, base/assigned/delta closures,
target-normalized skill/MCP/hook/instruction hashes, optional MCP request,
consent summary, target minimum, warnings, planned context ID, and planned
artifact directory. It performs no target execution and no writes.

## `drwn.worker-launch-context`

Persisted as `manifest.json` and returned inside the prepare-result envelope.
It contains:

- `contextId`, `target`, and canonical Herdr-compatible `kind`;
- base and assigned root identities;
- immutable artifact directory;
- the request tuple (`enabledOptionalMcp`, `strict`) used for currentness;
- opaque `launch.args` and `launch.env`;
- capability ID summary;
- effective source-state digests;
- probed target minimum and observed version;
- source lock provenance and local-only truth; and
- bounded diagnostics.

The request tuple is necessary: `list` and `doctor` recompute the same plan
instead of inferring intent from rendered target files.

## `drwn.worker-launch-receipt`

Persisted as `receipt.json`. The receipt binds the context ID, creation time,
renderer version, and sorted hashes for `manifest.json`, the bounded
`publication.json` recovery marker, and the concrete target directory. It
authorizes only that exact context directory. Receipt kinds are
`file` and `directory`; symlink ownership is unsupported.

## `drwn.worker-launch-prepare-result`

Normal JSON prepare output is:

```json
{
  "schema": "drwn.worker-launch-prepare-result",
  "schemaVersion": 1,
  "reused": false,
  "context": {
    "schema": "drwn.worker-launch-context",
    "schemaVersion": 1
  }
}
```

`reused: true` means an existing context passed strict manifest, receipt, and
owned-byte verification and its deterministic descriptor still matches the
current plan. It never means drift was repaired.

## Stable errors

Important error codes include:

- `PROJECT_NOT_INITIALIZED`
- `LAUNCH_ROOT_NOT_INSTALLED`
- `LAUNCH_BASE_PROJECTION_STALE`
- `LAUNCH_SKILL_CONFLICT`
- `LAUNCH_MCP_CONFLICT`
- `LAUNCH_OPTIONAL_MCP_INVALID`
- `LAUNCH_CONSENT_REQUIRED`
- `LAUNCH_TARGET_UNSUPPORTED`
- `LAUNCH_TARGET_VERSION_UNSUPPORTED`
- `LAUNCH_TARGET_PROJECT_UNSUPPORTED`
- `LAUNCH_PROJECT_STATE_CHANGED`
- `LAUNCH_CONTEXT_FOREIGN`
- `LAUNCH_CONTEXT_DRIFT`
- `LAUNCH_CONTEXT_CORRUPT`
- `LAUNCH_CONTEXT_STORE_INVALID`
- `LAUNCH_CONTEXT_STORE_BUSY`
- `LAUNCH_CAPABILITY_SOURCE_INVALID`
- `LAUNCH_MATERIALIZATION_FAILED`
- `LAUNCH_PREPARE_FAILED`
- `LAUNCH_LIST_FAILED`
- `LAUNCH_PRUNE_FAILED`

Errors may name project paths, root/Card/capability IDs, and versions. They do
not retain target output, resolved secrets, instruction bodies, full
environment maps, credentials, or arbitrary hook payloads.
