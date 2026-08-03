# @remyjkim/bgng

> The operating kit for the bgng and bgdb CLIs — drive BeginningDB's knowledge base, IDE control plane, direct HTTP + ReBAC, and S3 adapter from any agent.

## What it does

- **Personal knowledge base** — capture YouTube transcripts, index with qmd, and run lexical (BM25) or hybrid (BM25 + vector + LLM rerank) search over a local library (`bgng init`/`url`/`queue`/`search`/`query`/`get`/`import`).
- **IDE control plane** — install the `beginningdb-cloudfs` VSCode extension, manage direct and gateway profiles, store and refresh the four auth strategies, and launch VSCode (`bgng ide …`).
- **Direct BeginningDB + ReBAC** — the `bgdb` binary: low-level file ops over `/v1/fs` (stat/head/cat/put/mkdir/rm/mv/list/place/unplace/placements), search, changes, raw `api call`, and the product authorization surface (`authz`/`identity`/`share`/`link`).
- **S3 adapter admin** — S3 access-key lifecycle and multipart-session triage against the adapter's `/admin` endpoints (`bgng s3 …`).

Each skill is a tight operating playbook that points at the authoritative
`.ai/knowledges/02_cli/` reference for exhaustive per-flag detail.

## Recommended for users who...

- Operate or automate a BeginningDB deployment and its `bgng` / `bgdb` CLIs from Claude Code, Codex, or Cursor.
- Build transcript / knowledge-base workflows on top of `bgng` (e.g. the YouTube → Notion flow — compose `@remyjkim/notion-agent` for the Notion side).
- Administer the BeginningDB IDE control plane or the S3 adapter and want the gotchas (once-only secrets, last-placement deletes, auth-strategy resolution) encoded in the agent.

## Installation

> Requires the [drwn CLI](https://darwiniantools.com).

This card lives in the local card store. Apply it to the current project, then
materialize:

```sh
drwn apply @remyjkim/bgng@0.1.0
drwn write --dry-run --json   # preview
drwn write
```

If this is a new project, run `drwn init` first. For the cross-service
transcript → Notion workflow, also apply `@remyjkim/notion-agent`.

## What's included

| Asset | Purpose |
|---|---|
| `bgng-knowledge-base` | Capture/index/search the local qmd knowledge base |
| `bgng-ide` | IDE control plane: profiles, auth strategies, VSCode launch |
| `bgdb-direct-db` | Direct BeginningDB ops + product ReBAC via the `bgdb` binary |
| `bgng-s3-admin` | S3 adapter admin: key lifecycle + multipart triage |

## Versions

| Version | Notes |
|---|---|
| v1.0.0 | Direct surface moves to the `bgdb` binary (`bgdb-direct-db`, replacing `bgng-direct-db`) and gains the product ReBAC commands; knowledge-base and S3 notes updated for the two-binary CLI |
| v0.1.0 | Initial four `bgng` surface skills, no bundled MCP servers |

---

See the [Darwinian Tools documentation](https://docs.darwiniantools.com) for more information on drwn harness cards, installation, version pinning, and project configuration.
