---
sidebar_position: 12
---

# Status

`drwn status` summarizes the effective harness for the current directory. It reports store state, project config discovery, active targets, skills, MCP servers, extensions, and card lock state.

Use:

```bash
drwn status
drwn status --json
drwn status --machine --json
drwn status --explain
drwn doctor
```

`--machine` ignores an in-scope project config and returns the
`drwn.machine-status` V1 payload. Use it for explicit machine-state inspection
from any working directory.

Project JSON includes additive `instructionDelivery` and
`orgWorkerMaterialization` sections. The latter classifies only bounded local
evidence as `absent`, `compatible`, `current`, `drifted`, `blocked`, `removed`,
or `unknown`. It may report stable bundle/Worker/blueprint/receipt identities,
local-versus-organization instruction-consent provenance, and bounded issue
codes. It never returns instruction content, local evidence paths, secrets, or
organization readiness.

`current` and `removed` require matching config/lock digests, receipt
action/outcome/source, artifact and consent identities, no live journal, and a
consistent projection or tombstone. An incomplete valid journal is `blocked`;
valid state mismatch is `drifted`; orphaned, malformed, or missing evidence is
`unknown`. `compatible` is reserved for a future local pre-materialization
evidence profile and is not emitted by V1.

Materialization issues use bounded codes:

| Code | Meaning |
|---|---|
| `ORG_WORKER_OPERATION_INCOMPLETE` | A valid operation journal remains. |
| `ORG_WORKER_EVIDENCE_MALFORMED` | Evidence cannot be safely parsed or followed. |
| `ORG_WORKER_EVIDENCE_ORPHANED` | Receipt evidence exists without its record. |
| `ORG_WORKER_EVIDENCE_MISSING` | Required local evidence is absent. |
| `ORG_WORKER_PROJECT_STATE_DRIFT` | Current config/lock identity differs. |
| `ORG_WORKER_RECEIPT_MISMATCH` | The last receipt or removal chain is inconsistent. |
| `ORG_WORKER_ARTIFACT_DRIFT` | Verified vendor, sidecar, integrity, or Git tree differs. |
| `ORG_WORKER_PROJECTION_DRIFT` | Instruction delivery no longer matches. |
| `ORG_WORKER_REMOVAL_DRIFT` | Removed-state tombstone postconditions differ. |

`--explain` adds a human-readable explanation of every active item and its provenance — which layer (Card, project overlay, machine profile or explicit selection, packaged registry) is making each skill, server, extension, or Card active. That is useful before a write:

```bash
drwn status --explain
drwn write --dry-run
```

`--why <name>` answers a targeted provenance question for a single item:

```bash
drwn status --why skill:reviewer
drwn status --why server:context7
drwn status --why card:@your-handle/backend
```

For project card state, use:

```bash
drwn card status --explain
drwn card outdated
```
