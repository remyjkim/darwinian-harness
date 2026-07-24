# Changelog

All notable changes to `darwinian-minds` (the `drwn` CLI) are documented here. This
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Explicit Worker-instructions V1 projection. Cards can author inline or
  Card-relative instructions, consumers grant exact-content/version-range
  consent, and full project writes compose consented bytes into a
  byte-preserving managed block in root `AGENTS.md`.
- Claude instruction adapter management for `.claude/CLAUDE.md`, including
  foreign valid-import preservation, opt-in managed-block insertion, ownership
  drift protection, and owned-only cleanup.
- Stable `instructionDelivery` status/doctor evidence, machine-local
  cross-machine consent acknowledgement, and strict frozen
  `OrgWorkerBundleV1` consumer conformance.
- Fresh-project organization Worker materialization from an immutable
  bundle/artifact snapshot handoff, with frozen compatibility and version-floor
  checks, exact artifact and external-consent verification, transactional
  config/lock, project-owned vendor trees, resumable journals, append-only
  `worker-materialization-receipt@1` evidence, and idempotent operation IDs.
- Ownership-bounded `drwn install --reconcile` and `--remove` flows. Reconcile
  repairs only prior materialization-owned drift; removal preserves unrelated
  roots, local consent, overlays, adapters, and user bytes while retaining a
  chained removed-state tombstone.
- Additive local-only `orgWorkerMaterialization` status/doctor diagnostics,
  including consent provenance and evidence-closed
  absent/current/drifted/blocked/removed/unknown classification.
- OpenCode target (disabled by default). `drwn write` merges managed MCP servers
  into `opencode.json` (project) and `~/.config/opencode/opencode.json`
  (machine) under the `mcp` key with per-server ownership, foreign-key
  passthrough, drift detection, and an `opencode.jsonc` guard. Enable per scope:
  machine policy (`policy.targets.opencode.enabled`) for machine writes, project
  config (`targets.opencode.enabled`) for project writes.
- Cursor hook runtime. Trusted card hook policies now generate a cursor
  composer and `.cursor/hooks.json` (preToolUse/postToolUse) with native ask
  support; a pre-existing hooks.json that drwn does not own is preserved with
  a warning.
- OpenCode hook runtime. Trusted card hook policies generate an in-process
  OpenCode plugin (`.opencode/plugins/drwn-hooks.js` re-exporting the bundled
  composer) implementing `tool.execute.before`/`tool.execute.after`: deny
  throws, allow rewrites `output.args`, `ask` fails closed with an
  explanatory message, and built-in tool ids are normalized to the canonical
  policy matcher names.
- Skill surfaces are materialized for every enabled reader target. Cursor
  reads `.claude/skills/` and `.codex/skills/`, so `drwn write --target=cursor`
  and cursor-only projects now receive skills; targets with no enabled reader
  no longer receive skill writes.

### Changed

- Prepared the local `1.0.0` Darwinian Worker candidate required by the frozen
  organization Worker-materialization compatibility profile. Existing project
  and semantic Mind lock floors remain unchanged.

### Fixed

- `drwn doctor` no longer reports false cursor MCP drift when user-authored
  servers coexist with in-sync managed servers; drift is now compared per
  managed server for cursor and opencode.

## [0.9.0] - 2026-07-13

First supported semantic Worker Mind contract. This is a clean prelaunch
replacement for the prototype numbered-memory model, with no migration reader
or persisted-state migration.

### Added

- Strict Card memory declarations for `observations` (`jsonl`) and `insights`
  (`md`). A valid declaration in the selected Worker's locked Blueprint closure
  opts that Worker into the optional Mind capability.
- Strict `drwn.mind-index` schema version 1, canonical semantic pool paths,
  by-date Mind views, and inode-aware diagnostics for pool/view health.
- Real BeginningDB coverage for semantic observation and insight placement,
  shared inode identity, strict index readback, DB-first edits, sync, and
  checkpoint.

### Changed

- Mind-bearing project locks require `drwn` `0.9.0`; non-Mind Worker graphs
  retain the first supported project floor of `0.8.0`.
- Mind commands seed only from the selected Worker's valid locked closure and
  fail before network access when that closure does not declare the capability.
- `@darwinian/mind-tools`, `@darwinian/mind-starter`, and the dedicated
  `@darwinian/base-mind` sources use observations and insights exclusively.

### Removed

- Numbered memory kinds, paths, formats, source readers, and migration-specific
  diagnostics.
- The deprecated multi-Mind selection workflow and its
  `manage-active-mind-stack` skill.
- Card-owned runtime memory entries. Live memory is BeginningDB-native and has
  no Card visibility field.

## [0.7.0] — 2026-07-07

Mind cards: persona and beliefs return to card manifests as versioned seeds, and
workers gain DB-backed minds in BeginningDB with a shared, placement-based memory
pool.

### Added

- Card manifests accept `persona`, `beliefs`, and `memory` sections again.
  Persona/beliefs carry `include` entries with required `visibility`; memory
  declares layers (`l4` reflections, `l5` observations; `l6` reserved) and
  formats only — memory content is DB-native and never ships in cards.
- `drwn card source add-persona/remove-persona/add-belief/remove-belief`
  authoring commands, source-doctor checks, and publish validation for
  persona/beliefs content.
- The mind-content visibility push gate: `drwn card push` blocks
  visibility-bearing content toward less restrictive remotes
  (`--remote-visibility`, `--unsafe-push-public`).
- `drwn worker mind` verb group: `provision` (seed a mind from the active card
  stack), `status` (drift table), `sync` (rebase seeds; DB edits win unless
  `--force`), `diff`, `checkpoint` (write DB edits back into card sources),
  `doctor` (binding, ledger, and pool health), and `pool retire` (human-only
  delete-everywhere with confirmation).
- Mind connections resolve from `BGDB_*` environment variables; `worker deploy`
  captures the deployment's `mindId` and caches non-secret binding coordinates
  in `~/.agents/drwn/mind-bindings.json` (tokens are never persisted).
- Locks carrying mind content raise the version floor to 0.7.0
  (`MINDS_MIN_DRWN_VERSION`).

## [0.5.0] — 2026-06-29

Gives the `minDrwnVersion` lock floor teeth. Reading a project whose `card.lock`
requires a newer `drwn` than you are running now surfaces the mismatch instead of
silently materializing it.

### Added

- Version-floor enforcement (`evaluateVersionFloor`): `drwn write` prints a clear
  stderr warning when the project's `card.lock` floor exceeds the running version,
  and `drwn write --strict` turns that into a non-zero failure (machine-scope writes
  `--root`/`--user` skip the project check).
- `drwn doctor` reports a `versionFloor` section (`required`, `running`, `satisfied`)
  so the mismatch is inspectable.

### Changed

- Bumped the reported version to `0.5.0`.

## [0.4.0] — 2026-06-29

First tagged release. The reported version is reconciled with the feature set that
already shipped under the `0.2.x` line, so `drwn` no longer runs below the
`minDrwnVersion` floor it stamps into `card.lock`.

### Why the jump from 0.2.2 to 0.4.0

`drwn` reported `0.2.2` while already emitting a `0.4.0` lock floor for the minds
feature set (persona/beliefs/memory composition) and a `0.3.0` floor for hooks. Both
eras shipped under `0.2.x`; this release realigns the reported version with reality
rather than adding features. There is intentionally no separate `0.3.x` tag.

### Added

- `CHANGELOG.md` and an annotated `v0.4.0` git tag — the first release hygiene for the repo.
- A version-floor parity guard: tests assert the running version stays in lockstep with
  `package.json` and never lags the highest floor `drwn` can emit
  (`MINDS_MIN_DRWN_VERSION` ≥ `HOOKS_MIN_DRWN_VERSION`), so the version cannot silently
  drift below its own lock floor again.
- `gte` helper in the shared semver utilities.

### Changed

- Bumped the reported version to `0.4.0` across the single sources of truth
  (`package.json`, `cli/core/version.ts`).
- Exported the lock-floor constants (`HOOKS_MIN_DRWN_VERSION`, `MINDS_MIN_DRWN_VERSION`)
  so the parity guard can reference them.

### Notes

- Runtime enforcement of the floor (a stderr warning by default and a `--strict`
  hard-fail when reading a lock above the running version) is planned as a fast-follow;
  this release reconciles the reported version and guards against future drift.
