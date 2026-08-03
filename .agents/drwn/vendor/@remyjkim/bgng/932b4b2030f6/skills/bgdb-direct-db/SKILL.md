---
name: bgdb-direct-db
description: Use when running direct operations against a BeginningDB instance with the bgdb CLI — fs stat/head/cat/put/mkdir/rm/mv/list/place/unplace/placements, search, changes, api call, or the product ReBAC surface (authz check/explain/who-can, identity, share, link). Trigger on "bgdb", "read/write a file in BeginningDB", "stat this path", "upload to BeginningDB", "list changes", "BeginningDB search", "check a permission", "grant access", "share a file", "create a share link", or low-level namespace/authorization work against a bgdb target.
---
<!-- ABOUTME: Operating playbook for the bgdb binary — direct BeginningDB HTTP and product ReBAC operations -->
<!-- ABOUTME: Points agents at the authoritative usage doc; captures targets, fs verbs, the ReBAC surface, gotchas -->

# bgdb — Direct BeginningDB & ReBAC

`bgdb` is the direct HTTP client for a BeginningDB instance. File ops map to WebDAV-style `/v1/fs` routes (plus `/v1/stat`, `/v1/list`, `/v1/files/{inode}/placements`), search/changes to `/v1/search` and `/v1/changes`, and the **product ReBAC surface** to `/v1/authz`, `/v1/identities`, `/v1/shares`, `/v1/links`. The lowest-level tool in the kit: closer to `curl` with sugar than a managed client. State lives under `~/.bgdb/` (override with `$BGDB_HOME`).

**Authoritative reference (read before deep work):** `.ai/knowledges/02_cli/01_usage_patterns/04_workflow_direct_db.md`. Per-flag detail: `.ai/knowledges/02_cli/01_usage_patterns/01_command_reference.md`. Upstream protocol: `BeginningDB/.ai/knowledges/03_clients/01_http_api_overview.md`.

## Targets — point bgdb at an instance
A target carries `baseUrl`, optional `tenantId`, optional bearer `token`, and a `pathPrefix`. Save them once; reuse by name.
```bash
bgdb target create local --base-url http://127.0.0.1:8080 --tenant-id 1 --token "Bearer abc" --use
bgdb target list
bgdb target use local           # set active
bgdb target show [name]         # never prints the token
bgdb target remove local --yes
```
Targets persist in `~/.bgdb/targets.json`; tokens live separately in `~/.bgdb/secrets.json` (`mode 0o600`).

**Resolution order:** `--target` → `$BGDB_TARGET` → `--base-url`/`$BGDB_BASE_URL` (ad-hoc) → active target → error. Explicit `--base-url`/`--tenant-id`/`--token`/`--path-prefix` override individual fields of a named/active target. Most commands need a tenant id; `bgdb health`/`ready`/`doctor` do not.

## File operations — `bgdb fs`
```bash
bgdb fs stat /path --target local        # GET /v1/stat<path>
bgdb fs head /path --target local        # HEAD — headers only (ETag, length)
bgdb fs cat  /path --range 0-1023        # GET /v1/fs<path>, optional Range
bgdb fs list /dir --json                  # GET /v1/list<path> (directory listing)
bgdb fs put  /p --body "..."             # PUT; body via --body or stdin; --if-match / --if-none-match
echo x | bgdb fs put /p
bgdb fs mkdir /dir                        # MKCOL; idempotent (201/409)
bgdb fs rm /p --yes [--everywhere]        # DELETE; plain rm unplaces, --everywhere deletes all placements
bgdb fs unplace /p --yes                  # remove one placement; 409 last_placement preserves content
bgdb fs place /src /dst                   # add a placement for an existing inode (hardlink-like)
bgdb fs mv /src /dst --yes                # MOVE (atomic rename)
bgdb fs placements /p                     # every path pointing at the same inode
```
Destructive verbs (`rm`, `mv`, `unplace`) refuse to run without `--yes`.

## Search, changes, route discovery
```bash
bgdb search "q" [--mode keyword|vector|hybrid] [--limit N] [--offset N]
bgdb changes [--cursor N]
bgdb api ls                               # list known routes
bgdb api call GET /v1/stat/readme.md      # escape hatch for any route; --json-body / --body / --yes
```
`search`/`changes` scope `path_prefix` to the target prefix unless `--raw-paths`. Vector/hybrid modes need the upstream vector subsystem (else 503).

## Product authorization — `authz` / `identity` / `share` / `link`
Selectors are validated client-side: **subjects** `user|service|automation|identity|anonymous:<id>`, **resources** `path|file|folder|library|org|organization|link:<id>`, **permissions** `view|edit|share|admin`.
```bash
# Check / explain / enumerate
bgdb authz check  user:alice view path:/readme.md
bgdb authz explain user:alice edit path:/docs
bgdb authz who-can edit path:/docs
bgdb authz list --resource path:/docs --subject user:alice

# Identities + grants
bgdb identity create user alice           # types: user|service|automation
bgdb identity list
bgdb identity show user:alice
bgdb identity grant  user:alice edit path:/docs
bgdb identity revoke user:alice edit path:/docs --yes
bgdb identity lineage user:alice

# Sharing + links
bgdb share grant  path:/docs --to user:bob --permission view
bgdb share revoke path:/docs --from user:bob --permission view --yes
bgdb share list --resource path:/docs
bgdb link create  path:/docs --permission view [--expires-at 2026-12-31T00:00:00Z]
bgdb link list ; bgdb link inspect <id> ; bgdb link revoke <id> --yes
```
Every access-removing verb (`identity revoke`, `share revoke`, `link revoke`) requires `--yes`.

## Path resolution
With a non-root `pathPrefix`, user paths are rewritten before sending: `/readme.md` + prefix `/.bgdb-vfs/filesystems/main` → `/.bgdb-vfs/filesystems/main/readme.md`. Already-prefixed paths pass through. `--raw-paths` disables rewriting (cross-namespace escape hatch).

## Gotchas / known gaps
- `rm` without `--everywhere` deletes content if it's the **last placement** — use `unplace` to refuse that.
- `fs place` adds a path to an existing inode; there is **no content-copy** verb.
- No streaming — reads and writes buffer the whole body in memory. For large objects use the S3 adapter (see `bgng-s3-admin`).
- No gateway mode — `bgdb` talks to an instance directly. For gateway-fronted access, the VSCode extension is the canonical client.
- ReBAC selectors are validated before the request leaves: a bad prefix raises `Unsupported … selector prefix`, an unknown permission raises `Unsupported permission`.
- Upstream error envelope: `{ "code": "...", "message": "..." }`; ReBAC failures surface as `BeginningDB ReBAC request failed (<status>)`.

## Exit codes
`0` success, `1` for every error. `--json` emits the resolved path + status, or the upstream body for read-shaped and ReBAC commands.
