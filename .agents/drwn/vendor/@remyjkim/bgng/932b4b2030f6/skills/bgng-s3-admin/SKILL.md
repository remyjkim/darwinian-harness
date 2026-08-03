---
name: bgng-s3-admin
description: Use when administering the BeginningDB S3 adapter with the bgng CLI — creating/listing/rotating/revoking S3 access keys, or triaging/aborting multipart upload sessions. Trigger on "bgng s3", "create an S3 key", "rotate the S3 secret", "revoke a key", "list multipart sessions", "abort a stuck upload", or provisioning/winding-down S3 clients against the adapter's /admin endpoints. NOT for actual S3 object traffic (use a SigV4 client).
---
<!-- ABOUTME: Operating playbook for the bgng s3 surface — S3 adapter admin (keys + multipart sessions) -->
<!-- ABOUTME: Points agents at the authoritative usage doc; captures the once-only-secret rule and gotchas -->

# bgng s3 — S3 Adapter Admin

`bgng s3` is the admin client for the S3 adapter (`apps/s3-adapter`, a Rust sidecar exposing BeginningDB over the S3 wire protocol). It speaks the adapter's `/admin/*` endpoints — **not** S3 itself. Use it for provisioning, rotation, and ops; use a SigV4 client (aws-cli / SDK / Mastra) for object traffic.

The identical admin cluster is also registered on the `bgdb` binary as `bgdb s3 keys …` / `bgdb s3 sessions …` (same flags and HTTP) — use whichever binary is already on hand.

**Authoritative reference (read before deep work):** `.ai/knowledges/02_cli/01_usage_patterns/05_workflow_s3_admin.md`. Per-flag detail: `.ai/knowledges/02_cli/01_usage_patterns/01_command_reference.md`. Adapter internals: `apps/s3-adapter/docs/runbook.md`.

## Configuration — URL + admin token
Both resolve in order **flag → env → config**:
- URL: `--adapter-url` → `$BGDB_S3_ADAPTER_URL` → `config.s3Adapter.adapterUrl`
- Token: `--admin-token` → `$BGDB_S3_ADAPTER_ADMIN_TOKEN` → `config.s3Adapter.adminToken`

Either empty → `ConfigError`. Works without `bgng init` as long as env vars are set (tolerates an uninitialized workspace). For a Fly-deployed adapter the admin port `9001` isn't published — tunnel it:
```bash
flyctl proxy 19001:9001 --app beginningdb-s3-staging &
export BGDB_S3_ADAPTER_URL=http://127.0.0.1:19001
export BGDB_S3_ADAPTER_ADMIN_TOKEN=$(...)   # from flyctl secrets
bgng s3 keys list
```

## Key lifecycle
Each S3 access key pairs with a BeginningDB bearer that the adapter forwards on every call for that key. Provisioning is two steps: get a BGDB bearer (out of band), then create the key.
```bash
bgng s3 keys create --label "mastra-prod" --bgdb-bearer "<bgdb-token>" \
  [--bucket-constraint "42-main"]   # encoding: <tenantId>-<filesystemId>
  [--ttl-days 30] [--json]
bgng s3 keys list [--json]                 # active + revoked, no secrets
bgng s3 keys rotate <accessKeyId> [--bgdb-bearer "<new>"]   # fresh secret (+ optionally rotate forwarded bearer)
bgng s3 keys revoke <accessKeyId>          # marks revoked_at; entry kept for audit
```

## Multipart session triage
```bash
bgng s3 sessions list [--json]             # only Initiated (in-flight) sessions
bgng s3 sessions abort <uploadId>          # mark Aborted + clean on-disk part files
```

## Gotchas
- **`secret_access_key` is returned ONCE** on `keys create` and `keys rotate` — capture it immediately. The adapter stores only a hash; it cannot be recovered. Pipe `--json` to a file and pull with `jq -r .secret_access_key`.
- `--bgdb-bearer` is **never prompted for / never read from stdin** — must be a flag.
- The admin token in `config.json` is plain text — prefer env vars on shared/synced workstations.
- No bulk ops (`revoke --all`, `abort --all`), no key search — compose with `jq` + shell loops.
- No `bgng s3 config set` and no `init` for the `s3Adapter` block — hand-edit `~/.bgng/config.json` or use env vars.
- The adapter's own admin-token rotation is out of band (Fly secret / your secret manager) — no `bgng` command for it.

## Exit codes
`0` success, `1` for every error; upstream adapter error bodies are surfaced verbatim in the message.
