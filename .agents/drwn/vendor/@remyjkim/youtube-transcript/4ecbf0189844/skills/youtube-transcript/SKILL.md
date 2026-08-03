---
name: youtube-transcript
description: Use when capturing a YouTube (or other bgng-supported) URL as a transcript, saving it to a local directory, and uploading it to BeginningDB with both a chronological and by-channel placement. Trigger on "capture this video to BeginningDB", "transcript to bgdb", "save YouTube transcript", "add to BeginningDB", "bgng url to bgdb", or any task that converts a URL into a local transcript file AND uploads it to a BeginningDB instance with mirrored placements.
---
<!-- ABOUTME: Workflow for capturing a URL transcript locally and uploading it to BeginningDB with mirrored placements -->
<!-- ABOUTME: Covers bgng url capture, local file placement choice, and bgdb put + place for chronological + by-channel paths -->

# youtube-transcript — URL → Transcript → BeginningDB

Captures a URL (YouTube or any bgng-supported source) as a transcript, saves it to a local directory of the user's choosing, and uploads it to a BeginningDB instance at two mirrored paths: one chronological (`/transcripts/<date>/<slug>/transcript.md`) and one by-channel (`/by-channel/<channel>/<slug>.md`). Both paths share the same inode — one content blob, two logical addresses.

**Authoritative script:** `scripts/transcript_to_bgdb_mirror.sh <url>` handles all BeginningDB upload stages end-to-end.
**Task reference:** `.ai/tasks/22_youtube_transcript_to_beginningdb_mirrored_placement.md`.

## Prerequisites

- `bgng` CLI with a SupaData API key (`BGNG_SUPADATA_API_KEY` env var, or stored via `bgng init`).
- `BGDB_JWT_TOKEN` in `.env` or environment. `BGDB_BASE_URL`, `BGDB_TENANT_ID`, `BGDB_FILESYSTEM_ID` default to the staging instance; override if targeting a different instance.

## Stage 1 — Capture transcript

```bash
TMP="$(mktemp -d)"
bgng url --into "$TMP" --no-index "<url>"
# produces: $TMP/<YYYY-MM-DD>/<slug>/transcript.md  (+ transcript.txt, meta.json)
```

`--no-index` keeps the capture out of the local qmd search index; the transcript files are all that's needed here.

After capture, read `meta.json` to extract `slug` and `channel`:

```bash
python3 - "$TMP"/<date>/<slug>/meta.json <<'PY'
import json, sys, re
m = json.load(open(sys.argv[1]))
slug = m.get("slug") or "untitled"
ch = re.sub(r'[^a-z0-9]+', '-', (m.get("channel") or "unknown").lower()).strip('-') or "unknown"
print("slug:", slug, "  channel:", ch)
PY
```

## Stage 2 — Choose local save location

If the target directory is clear from context, use it. Otherwise ask the user. Common options:

| Option | Path | When to use |
|---|---|---|
| Project subdir | `<repo>/transcripts/<date>/<slug>/` | Working on a project that'll reference the transcript |
| bgng library | `~/.bgng/transcripts/<date>/<slug>/` | Personal KB; use plain `bgng url` (without `--into`/`--no-index`) to also index |
| Ephemeral | *(tmp only, discard after upload)* | Only the BeginningDB placements matter; no local copy needed |

Copy `transcript.md` (and optionally `transcript.txt`, `meta.json`) to the chosen path, then register it with the local bgng index:

```bash
bgng import "$DEST" --collection transcripts --pattern "transcript.md"
```

## Stage 3 — Upload to BeginningDB

Run the end-to-end script from the repo root:

```bash
scripts/transcript_to_bgdb_mirror.sh "<url>"
```

The script performs:
1. **Capture** — `bgng url --into <tmp> --no-index <url>` (re-runs the capture into a fresh tmp dir).
2. **Ensure parent dirs** — idempotent `bgdb mkdir` chain for both placement paths (accepts 201 and 409).
3. **PUT primary** → `/transcripts/<YYYY-MM-DD>/<slug>/transcript.md`
4. **place mirror** → `/by-channel/<channel-slug>/<slug>.md` (same inode, second dentry — no content duplication)
5. **Verify** — `bgdb stat <primary>` + `bgdb placements <primary>`

The `bgdb` wrapper inside the script uses explicit connection flags (`--base-url`, `--tenant-id`, `--token`, `--filesystem-id`) loaded from `.env`; no stored profile is needed.

## Path schemes

| Placement | Pattern |
|---|---|
| Primary (chronological) | `/transcripts/<YYYY-MM-DD>/<slug>/transcript.md` |
| Mirror (by-channel) | `/by-channel/<channel-slug>/<slug>.md` |

`<channel-slug>` = channel name lowercased, non-alphanumeric runs collapsed to `-`.

## Manual verification

```bash
# Confirm primary exists
bgdb stat "/transcripts/<date>/<slug>/transcript.md"

# Confirm both placements are registered on the same inode
bgdb placements "/transcripts/<date>/<slug>/transcript.md"

# Confirm mirror serves the same content
bgdb cat "/by-channel/<channel>/<slug>.md"
```

## Gotchas

1. **Parent dirs must exist** before PUT or place — the script creates them idempotently (`mkdir` accepts 409 from an existing collection).
2. **`place` also needs its destination parent** — the script runs `mkdir` for the mirror's parent dir too.
3. **Re-run safety** — PUT overwrites cleanly; if the mirror placement already exists the script detects the 409 and skips silently.
4. **Filesystem prefix** — user paths are under filesystem `ide`; `bgdb` rewrites them to `/.bgdb-vfs/filesystems/ide/<path>` automatically.
5. **`--no-index` in Stage 1** — the tmp capture is ephemeral (deleted on exit), so it must not be indexed. Indexing is handled in Stage 2 via `bgng import` on the persistent local copy.
6. **Deletion semantics** — plain `bgdb rm <path>` unplaces; if it's the last placement it also deletes the inode. Use `bgdb unplace <mirror>` to remove only the mirror while preserving content.
