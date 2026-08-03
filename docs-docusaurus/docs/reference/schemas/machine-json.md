---
sidebar_position: 1
---

# Machine JSON

On disk: `~/.agents/drwn/machine.json`.

Purpose: strict machine policy plus one selected, immutable Worker Blueprint
closure. Machine intent is independent from project Worker declarations and
from authoring preferences in `~/.agents/drwn/config.json`.

## Schema

```json
{
  "schema": "drwn.machine",
  "schemaVersion": 2,
  "policy": {
    "targets": {
      "claude": { "enabled": true },
      "codex": { "enabled": true },
      "cursor": { "enabled": false }
    }
  },
  "capabilities": {
    "activeWorker": null,
    "workerLock": null
  }
}
```

Every object rejects unknown fields. The only supported machine schema version
is `2`. V1 and prototype files fail with controlled-reset guidance and remain
unchanged; they are never migrated, dual-read, rewritten, or interpreted.

## Fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `schema` | `"drwn.machine"` | yes | Namespaced contract identity. |
| `schemaVersion` | `2` | yes | Hard-cut machine Worker contract. |
| `policy.targets` | partial target map | no | Approved target policy overrides. |
| `policy.catalogs` | catalog policy | no | npm skill and MCP catalog policy. |
| `policy.analyzer` | analyzer policy | no | Session analyzer endpoints and limits. |
| `policy.trustedSources` | trust policy | no | Allowed Git/file runtime source policy. |
| `capabilities.activeWorker` | canonical Card name or `null` | yes | The one selected machine Worker root. |
| `capabilities.workerLock` | validated `drwn.project-lock` V1 value or `null` | yes | Installed roots and immutable Card closure. |

`activeWorker` never contains a version or transport. Its matching lock root
stores the requested versioned Store/pinned Git ref or explicit integrity-locked
file ref in `requested`. File-origin bytes are re-hashed before projection.
A non-null selection requires a matching root. Empty intent uses two nulls;
`use --root --none` may retain a valid lock while clearing selection.

Machine V2 has no `policy.authoring`, profile, flat skill list, or flat MCP
list. `config.json.defaultAuthorScope` and `catalogCheckouts` are independent
authoring preferences. Mutable checkout paths are never runtime Card sources.

## Recommended Worker

Guided setup offers the recommended
`@curation-labs/machine-defaults` Blueprint as an opt-out default. The shipped
descriptor pins an immutable source ref. Operator is a normal Card member of
that closure, not a special activation profile.

Non-interactive, minimal, or declined setup writes explicit empty V2 intent.
Existing valid V2 intent is not reset or re-prompted.

## Activation And Mutation

Effective machine capabilities come only from the selected, integrity-verified
Card closure. Inactive roots, standalone inventory, authoring checkouts,
ambient directories, and target output do not activate capabilities.

```bash
drwn apply --root <blueprint-ref>
drwn use --root <installed-name-or-ref> --no-write
drwn use --root --none --no-write
drwn card trust <card> --hooks --scope machine
drwn card trust <card> --instructions --scope machine
drwn write --root --dry-run
drwn write --root
```

The retired `drwn machine skill|mcp enable|disable` commands exit nonzero with
Blueprint guidance. Inventory lifecycle commands remain supported.

## Integrity And Consent

Before projection, drwn validates the embedded lock, locates the canonical root,
loads immutable Card content, and verifies content hashes. Missing or modified
bytes fail closed. Hook and instruction consent is stored per locked Card,
semver range, and digest. Same content in range is preserved; changed
consent-relevant content in range is re-granted with a new digest/timestamp and
warning; out-of-range or removed contributions require renewed consent.

## Projection

Machine projection can write closure-derived skills, MCP definitions, one
generated aggregate Worker, Claude hooks, and instruction adapters at
`~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`. It never writes `~/AGENTS.md`.
The global write record owns only managed paths/fields; foreign first-write
content and unforced drift block before mutation.

## Project Boundary

Project evaluation does not read the machine Worker. A project uses one selected
project closure plus explicit overlays. User-home output may remain ambient in
the downstream client, but status reports it separately and never imports it
into project intent.

## Related

- [Project Config JSON](./project-config-json)
- [Write Record JSON](./write-record-json)
- [Machine Inventory](../cli/machine)
- [Local Store](../../concepts/local-store)
