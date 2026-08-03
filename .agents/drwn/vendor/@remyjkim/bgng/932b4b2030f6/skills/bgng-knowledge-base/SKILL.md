---
name: bgng-knowledge-base
description: Use when capturing, indexing, or searching a personal knowledge base with the bgng CLI — fetching YouTube transcripts, building a local search corpus, or querying it. Trigger on "capture this video", "add to my knowledge base", "search my transcripts", "bgng url", "bgng query", "bgng search", "bgng import", or any task that ingests a YouTube URL into bgng or runs lexical/hybrid search over the local library.
---
<!-- ABOUTME: Operating playbook for the bgng personal knowledge-base surface (init/url/queue/search/query/get/import) -->
<!-- ABOUTME: Points agents at the authoritative usage doc; captures the load-bearing commands and gotchas -->

# bgng — Personal Knowledge Base

Capture YouTube transcripts into a local library, index with qmd, search lexically (BM25) or hybrid (BM25 + vector + LLM rerank). Everything lives under `~/.bgng/` (override with `$BGNG_HOME`). All local — no telemetry, no remote sync.

**Authoritative reference (read before deep work):** `.ai/knowledges/02_cli/01_usage_patterns/02_workflow_personal_kb.md`. Per-flag detail: `.ai/knowledges/02_cli/01_usage_patterns/01_command_reference.md`.

## Prerequisites
- Node ≥22.
- A SupaData API key. Set `BGNG_SUPADATA_API_KEY` (preferred) or store it via `bgng init`.

## Core sequence

```bash
bgng init                                  # one-time; idempotent. --api-key=<key> for non-interactive/CI
bgng url "https://youtu.be/<id>"           # capture one transcript → ~/.bgng/transcripts/<date>/<slug>/
bgng search "rust ownership"               # fast BM25 lexical
bgng query "how do borrow checkers work"   # hybrid: BM25 + vector + LLM rerank (slower, higher quality)
bgng get "2026-04-13/my-video"             # retrieve by path fragment or #<6-char-docid>
bgng status                                # library health: counts, queue, disk, embedding freshness
```

## Bulk capture via the queue
```bash
bgng queue add "https://youtu.be/A"        # append to ~/.bgng/queue.md ## Pending (dedupes)
cat urls.txt | bgng queue add -            # read URLs from stdin
bgng url batch-process                     # process all pending, crash-safe, 2s between requests
bgng queue list [--pending|--processed]
```

## Extending beyond YouTube
```bash
bgng import ~/Docs --collection notes [--pattern "**/*.{md,txt}"] [--context "..."]
bgng collection add code ~/Projects --pattern "**/*.ts" [--no-default]
bgng context set transcripts /ThePrimeagen "Rust, vim, productivity"   # context travels with results
bgng reindex [--force] [-c <collection>]   # catch the index/embeddings up
```

## Gotchas
- **Capturing into another project:** use `--into ../parent` (keeps `<date>/<slug>` nesting) — preferred over `--output-dir` (writes flat). The two are mutually exclusive. House preference is the `bgng url --into ../parent '<url>'` form. (`url` lives on the `bgng` binary; the separate `bgdb` binary is the direct-DB/ReBAC client and has no `url` command.)
- Already-captured videos are **skipped** unless `--force` (which `rm -rf`s the existing folder first).
- `search` is keyword-only and fast; `query` is semantic and slow — pick deliberately. `query --no-rerank` skips the LLM step for speed.
- `--json` is supported on `search`, `query`, `get`, `status`, `queue list`, `collection list`, `context list` — **not** on `url`, `init`, `import`, or `reindex`.
- Indexed-document count can lag on-disk count; `bgng status` shows `embeddings outdated` → run `bgng reindex`.
- Hand-edits to `queue.md` outside the `## Pending` / `## Processed` sections are dropped on the next write.

## Exit codes
`0` success, `1` for every typed error. To branch on failure kind, pass `--json` and inspect the body or parse stderr.
