# ABOUTME: Target architecture design for eliminating the ~/.agents/drwn/sources/ indirection — making card sources path-addressable git repos instead of store-internal copies, collapsing the three-location scatter to a single "a card is a directory" model.
# ABOUTME: Pre-launch hard cut. Accounts for the default (no AGENTS_DIR) bootstrap case. Grounded in the card-store/card-source call-site investigation + the darwinian-cards consolidation.

# [I176] Card Source Path Reform — Target Architecture (GATE 1)

**Status**: Design proposal (2026-07-31), submitted for G1 review 2026-08-03. Pre-launch; open to breaking changes.
**Issue**: [I176] · **Owner**: Remy K · **Reviewer**: Minseung Lee · **Branch**: `remy/I176-card-source-path-reform`
**Plan**: [`../tasks/cl0176_card_source_path_reform_task_plan.md`](../tasks/cl0176_card_source_path_reform_task_plan.md) (GATE 2)
**Scope**: the drwn CLI's card-authoring/publish lifecycle (`cli/`).
**Related**: `drwn-lab/.ai/analyses/02_projection_verifier_design.md` (projection internals), `drwn-lab/.ai/knowledges/05_card_version_bump_guide.md` (the 5-stage pipeline this simplifies), the darwinian-cards consolidation (17 registered cards).

## 1. The problem

A card source — the editable `card.json` + skills + hooks + instructions that `drwn card publish` snapshots into an immutable version — currently lives in **two unrelated places** that are not kept in sync:

1. **`~/.agents/drwn/sources/<scope>/<name>/`** — the store-internal authoring directory. Created by `drwn card new`. Read by `drwn card publish`. This is where publish reads from.
2. **A standalone git repo** (e.g. `~/dev/darwinian-cards/cards/<name>/` as a submodule, or any git remote) — the canonical source. Where the card is version-controlled, reviewed, and collaborated on.

These are **two copies of the same thing**. Publish reads from (1), but the authoritative source is (2). Every publish requires a manual sync step (we hit this exactly with workflow-skills 1.0.1→1.1.0 — the source dir was stale while the git repo had advanced).

This creates the single biggest mental-model burden in the card lifecycle: *"which copy is authoritative, and how do I keep them in sync?"*

### The three-location scatter (full picture)

| Location | Purpose | Managed by | Path layout |
|---|---|---|---|
| `~/.agents/drwn/sources/<scope>/<name>/` | Authoring + publish read | `drwn card new` | scoped (`@scope/name/`) |
| `<git-repo>/` | Canonical version-controlled source | git | flat (`<name>/` or root) |
| `<project>/.agents/drwn/config.local.json sourceOverrides` | Per-project dev redirect | `drwn card link` | arbitrary `file:` path |

Three locations, three path layouts, two sync relationships, zero automatic reconciliation.

## 2. The design goal

**Collapse to one mental model: a card source is a directory with a `card.json`.** You author it wherever you want (typically a git repo). You publish it with `drwn card publish --from <path>`. The store holds only immutable published versions — never editable sources.

This matches how every package manager works:
- **npm**: a package is a directory with `package.json`; you publish from wherever.
- **cargo**: a crate is a directory with `Cargo.toml`; you publish from the crate root.
- **go**: a module is a directory with `go.mod`; the proxy serves tagged versions.

No package manager forces you to copy your source into a store-internal directory before publishing. Neither should drwn.

## 3. The proposed architecture

### 3.1 Eliminate `sources/` from the store

**Before:**
```
~/.agents/drwn/
├── cards/          (immutable published)
├── sources/        (editable authoring — ELIMINATED)
├── machine.json
├── skills/         (standalone skill packages)
├── catalogs/
└── ...
```

**After:**
```
~/.agents/drwn/
├── cards/          (immutable published — stays)
├── machine.json    (stays)
├── skills/         (stays)
├── catalogs/       (stays)
└── ...
(no sources/ — the store never holds editable card sources)
```

### 3.2 `drwn card publish` accepts a source path

```sh
# NEW: publish from any directory
drwn card publish --from ./my-card/
drwn card publish --from ~/dev/darwinian-cards/cards/workflow-skills/
drwn card publish --from file:~/dev/darwinian-cards/cards/workflow-skills/

# BACKWARD COMPAT (optional, transitional): publish by registered source name
# (looks up a registered catalog checkout — see §3.5)
drwn card publish @curation-labs/workflow-skills
```

Internally:
- `publishCard(agentsDir, name)` → `publishCard(agentsDir, { sourceDir, name? })`
- `sourceDir` is the directory containing `card.json` — explicit, not resolved from the store.
- `name` is derived from the manifest if not provided (the manifest's `name` field is authoritative).

### 3.3 `drwn card new` creates in the CWD, not the store

```sh
# NEW: creates ./<name>/ in the current directory
drwn card new @my-org/my-card
# → creates ./my-card/ with card.json, skills/, hooks/, .git/

# the user is told: "Card source created at ./my-card/. Publish with: drwn card publish --from ./my-card/"
```

The source is a normal directory the user controls. It's initialized as a git repo by default (the current `--no-git` flag still works). No store-internal copy.

### 3.4 `drwn card source *` commands accept a path

```sh
# NEW: source commands operate on a path, not a store lookup
drwn card source doctor ./my-card/
drwn card source show ./my-card/
drwn card source set ./my-card/ --version 1.1.0
drwn card source add-skill ./my-card/ my-skill --from ./skills/my-skill/
```

The first positional argument becomes a path (or `file:` ref) instead of a card name. For backward compatibility, a bare name that matches a registered catalog checkout (§3.5) resolves to its path.

### 3.5 The catalog checkout as the default source location

For users who work with the `darwinian-cards` catalog (the recommended workflow), the catalog's submodule checkouts ARE the card sources:

```sh
# clone the catalog (once)
git clone --recurse-submodules https://github.com/curation-labs/darwinian-cards.git ~/dev/darwinian-cards

# publish any card directly from its catalog checkout
drwn card publish --from ~/dev/darwinian-cards/cards/workflow-skills/

# or: if the catalog is registered, publish by name (resolves to the checkout)
drwn card publish @curation-labs/workflow-skills
```

The "resolve by name" path (§3.5) uses a **catalog checkout registry** — a machine-local record of where the user's `darwinian-cards` (or any card-catalog) checkout lives. Set during `drwn init` or via config:

```jsonc
// ~/.agents/drwn/config.json (the machine-local user config — NOT machine.json)
{
  "catalogCheckouts": [
    "~/dev/darwinian-cards"
  ]
}
```

When `drwn card publish @scope/name` is called (no `--from`), drwn searches the registered catalog checkouts for `cards/<name>/card.json` whose manifest name matches. If found, publish from there. If not found, error with guidance: "Card source not found. Use `--from <path>` or register a catalog checkout."

This replaces `sources/` as the name-resolution mechanism, but it's **optional** — `--from` always works without it.

### 3.6 The default case: no AGENTS_DIR, no catalog checkout

On a fresh install (`npm install -g darwinian && drwn init`), the user has:
- A store at `~/.agents/drwn/` (machine config, published cards cache, skill inventory).
- A project config at `<project>/.agents/drwn/config.json`.
- **No `sources/` directory** (it's not created by init).

To author a new card:
```sh
mkdir ~/my-cards && cd ~/my-cards
drwn card new @my-org/my-first-card
# → ./my-first-card/ created with card.json + git
# edit, commit...
drwn card publish --from ./my-first-card/
```

To consume existing cards:
```sh
# in a project:
drwn apply @darwinian/operator@^1.0.0
drwn write
```

No `sources/` needed at any point. The store holds published immutable versions; the card source is wherever the user put it.

## 4. The simplified mental model (what users need to know)

**Before (current — 4 concepts):**
1. Card sources live in `~/.agents/drwn/sources/` (created by `drwn card new`).
2. Published cards live in `~/.agents/drwn/cards/` (immutable).
3. Your canonical source might be a separate git repo — keep it in sync with `sources/` manually.
4. Projects consume cards via `card.lock`.

**After (proposed — 2 concepts):**
1. A card is a directory with a `card.json` (typically a git repo). Publish it with `drwn card publish --from <path>`.
2. Published cards are immutable versions in the store. Projects consume them via `card.lock`.

That's it. No `sources/` dir, no sync, no "which copy is authoritative."

## 5. The implementation surface

### 5.1 Core changes (card-store.ts, card-source.ts, card-source-sync.ts)

| Function | Current | Proposed |
|---|---|---|
| `resolveCardSourceDir(agentsDir, name)` | `join(sourcesRoot, ...splitCardName(name))` | **DELETED** — callers pass an explicit `sourceDir` |
| `resolveSourcesRoot(agentsDir)` | `join(storeRoot, "sources")` | **DELETED** |
| `createCardSource({ agentsDir, name, ... })` | Creates dir under `sources/` | Creates dir at `./<basename>/` in CWD |
| `publishCard(agentsDir, name)` | Reads from `resolveCardSourceDir` | `publishCard(agentsDir, { sourceDir })` — reads from the explicit path |
| `readCardSourceManifest(agentsDir, name)` | Reads from `resolveCardSourceDir` | `readCardSourceManifest(sourceDir)` — reads from the explicit path |
| `listCardSources(agentsDir)` | Scans `sources/` | Scans registered catalog checkouts + CWD; or becomes `drwn card list --type source` |
| `doctorCardSource(agentsDir, name)` | Reads from `resolveCardSourceDir` | `doctorCardSource(sourceDir)` |
| `patchCardSourceManifest(agentsDir, name, ...)` | Reads/writes `resolveCardSourceDir` | `patchCardSourceManifest(sourceDir, ...)` |
| `addCardSourceSkill(agentsDir, name, ...)` | Reads/writes `resolveCardSourceDir` | `addCardSourceSkill(sourceDir, ...)` |
| `removeCardSource*` (all) | Same pattern | Same: accept `sourceDir` |
| `checkCardSourceUpstream(agentsDir, name)` | Reads from `resolveCardSourceDir` | `checkCardSourceUpstream(sourceDir)` |
| `forkCard(agentsDir, name, ...)` | Creates new source under `sources/` | Creates new source at `./<basename>/` |

**Call sites to update** (from the investigation, ~15 unique files):
- `cli/core/card-store.ts` (5 call sites: createCardSource, publishCard, readCardSourceManifest, deleteSource, package.json read)
- `cli/core/card-source.ts` (3: list, doctor, patch, add/remove skill/hook/mcp/persona/belief)
- `cli/core/card-source-sync.ts` (1: upstream sync)
- `cli/core/diagnostics.ts` (1: sourceCount diagnostic — remove or redefine)
- `cli/commands/card/new.ts` (createCardSource call → CWD creation)
- `cli/commands/card/publish.ts` (add `--from` flag)
- `cli/commands/card/fork.ts` (resolveCardSourceDir → explicit path)
- `cli/commands/card/link.ts` (the project-scoped link — stays, but the default path changes)
- `cli/commands/card/source/*.ts` (all 15 subcommands → accept path)
- `cli/commands/worker/new.ts`, `compose.ts`, `publish.ts` (same pattern — blueprints are cards)
- `cli/commands/worker/mind/checkpoint.ts` (resolveCardSourceDir → explicit path)

### 5.2 The catalog-checkout registry (optional name resolution)

New concept: a machine-local list of catalog checkout paths, stored in `~/.agents/drwn/config.json` (the user-level config, not `machine.json`):

```jsonc
{
  "catalogCheckouts": ["~/dev/darwinian-cards"]
}
```

When a `drwn card source *` or `publish` command receives a bare name (no `--from`), it resolves the name against the catalog checkouts: for each checkout, look for `cards/<basename>/card.json`, read the manifest, match the `name` field. First match wins.

This is **optional machinery** — `--from <path>` always works without it. The registry just makes `drwn card publish @scope/name` convenient when you have a catalog checkout.

### 5.3 Init changes

`drwn init` gains an optional prompt (guided mode) or flag:

```sh
# guided:
"Path to your darwinian-cards checkout? [~/dev/darwinian-cards]: "
# → records in ~/.agents/drwn/config.json catalogCheckouts

# or flag:
drwn init --catalog-checkout ~/dev/darwinian-cards
```

If the user has no catalog checkout yet, they skip it. They can always add one later via `drwn config set catalogCheckouts '[ "~/dev/darwinian-cards" ]'`.

### 5.4 The default-case bootstrap (no AGENTS_DIR, fresh install)

A fresh user experience:

```sh
# 1. Install
npm install -g darwinian

# 2. Initialize a project (creates ~/.agents/drwn/ store + project config)
cd ~/my-project
drwn init
# → machine.json created, project config created, operator profile offered

# 3. Consume cards (no sources/ needed)
drwn apply @darwinian/operator@^1.0.0
drwn write

# 4. (Later) Author a new card
cd ~/my-cards
drwn card new @my-org/my-card
# → ./my-card/ created (NOT in ~/.agents/)
# edit card.json, add skills, commit...
drwn card publish --from ./my-card/
# → immutable version in ~/.agents/drwn/cards/

# 5. (Later) Clone the catalog for multi-card work
git clone --recurse-submodules https://github.com/curation-labs/darwinian-cards.git ~/dev/darwinian-cards
drwn init --catalog-checkout ~/dev/darwinian-cards   # (or set in config)
# now: drwn card publish @scope/name resolves to the catalog checkout
```

At no point does the user need to know about `sources/`. The store is for published immutable versions and machine state, not for editable sources.

## 6. What this eliminates

1. **The two-copy sync problem** — the single biggest friction point. No more `rsync` from git repo to `sources/` before publish.
2. **The path-layout mismatch** (`@scope/name/` vs `<name>/`) — sources are wherever the user puts them; the `@scope/name/` internal layout is gone.
3. **The "which copy is authoritative?" question** — there's one copy: the directory you're publishing from.
4. **`drwn card link` as a workaround** — the project-scoped `sourceOverrides` mechanism was a band-aid for the sources/in-the-store problem. With path-addressable sources, you don't need it (though it can stay for project-dev convenience).
5. **The `sources/` directory itself** — not created, not explained, not maintained.

## 7. What this preserves

- **The immutable published store** (`cards/`) — unchanged. Publish still creates content-addressed bare git repos.
- **The card-authoring commands** (`card source *`) — same capabilities, different invocation (path instead of name lookup).
- **The catalog registry** (`darwinian-cards/registry.json`) — unchanged. Still the organizational source of truth.
- **The machine/project config split** — unchanged. The store still holds `machine.json`, `projects.json`, etc.
- **The `drwn card link` project-dev mechanism** — can stay as an optional convenience for project-scoped dev iteration, but it's no longer load-bearing.

## 8. Migration path (pre-launch hard cut)

Since this is pre-launch, there are no external consumers to break. The migration is:

1. **Implement the core changes** (§5.1) — make `publishCard`, `createCardSource`, and all `card source *` commands path-based.
2. **Add `--from` to publish** and the catalog-checkout name resolution (§5.2).
3. **Update `drwn card new`** to create in CWD.
4. **Remove `resolveCardSourceDir` / `resolveSourcesRoot`** from `store-paths.ts`.
5. **Update docs** (README, cli-quickref, the knowledge docs) to the new model.
6. **Delete `sources/`** from existing machines — the consolidation already moved all card sources to `darwinian-cards/cards/`; the `sources/` copies are redundant. A `drwn sources migrate` command (or manual deletion) cleans them up.
7. **Update the lab's knowledge docs** (05_card_version_bump_guide.md, 02_drwn_lab_operations.md) to reflect the new Stage 1 (no `rsync` needed — publish directly from the catalog checkout).

### What about the 25 existing sources on this machine?

The consolidation already created git repos + `darwinian-cards` submodules for the 17 active cards. Their `sources/` copies are redundant. After the implementation:
- For the 17 registered cards: delete the `sources/` copy; publish from `darwinian-cards/cards/<name>/` via `--from` or name resolution.
- For the 5 unregistered stubs (chief, l6-mind-probe, etc.): they stay as-is until cleaned up (they're not published anyway).
- For the 3 deferred monorepo cards (l6-mind-card, believer-interview, notion-token): handle when their monorepo structure is resolved.

## 9. The user-config file (new: `~/.agents/drwn/config.json`)

Currently the store has no user-level config (only `machine.json`). This design introduces one:

```jsonc
// ~/.agents/drwn/config.json
{
  "catalogCheckouts": ["~/dev/darwinian-cards"],
  "defaultAuthorScope": "@my-org"
}
```

- `catalogCheckouts`: paths to catalog checkouts for name resolution (§5.2).
- `defaultAuthorScope`: the scope to use when `drwn card new` is called with an unscoped name (replaces the `machine.json policy.authoring.scope` field — cleaner separation of authoring prefs from machine capability state).

This file is distinct from `machine.json` (which is about *capabilities*, not *preferences*). It's machine-local and gitignored.

## 10. Open questions

1. **Should `drwn card source list` survive?** With no central `sources/` dir to scan, "list sources" becomes "list registered catalog cards" or "list card dirs under the CWD." The command may not carry its weight — `drwn card list` (published cards) + `ls ~/dev/darwinian-cards/cards/` may suffice. **Recommendation:** deprecate `source list`; fold into `card list --type source` (scans catalog checkouts).

2. **Should the catalog-checkout registry support multiple checkouts?** A user might have both `darwinian-cards` (the org catalog) and a personal catalog. Multiple paths in `catalogCheckouts` handles this naturally — first match wins.

3. **How does `drwn worker new`/`publish` change?** Blueprints are `kind: "blueprint"` cards, so they follow the same pattern: `drwn worker new` creates in CWD; `drwn worker publish --from <path>` publishes. The `composedFrom` refs are unchanged (they point at published versions, not sources).

4. **Should `AGENTS_DIR` redirect the user config too?** Currently `AGENTS_DIR` redirects the whole store. The user config (`config.json`) should follow — it's part of the store. So `AGENTS_DIR=/custom/path` puts everything (store + user config + published cards) under `/custom/path/drwn/`.

5. **The `--from` flag name.** `--from` is clear and precedented (`drwn card source add-skill --from <path>` already uses it). Alternative: `--source-dir` or just a positional `<path>` argument. **Recommendation:** `--from` for consistency with the existing `add-skill` flag.

## 11. The mental model comparison (one-line summary for docs)

**Current**: "Card sources live in `~/.agents/drwn/sources/`; publish reads from there; keep your git repo in sync manually."

**Proposed**: "A card is a directory with a `card.json`. Publish it with `drwn card publish --from <path>`. The store holds immutable published versions, not editable sources."
