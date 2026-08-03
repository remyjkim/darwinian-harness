# ABOUTME: Handoff-ready implementation plan for eliminating ~/.agents/drwn/sources/ — making card sources path-addressable directories (drwn card publish --from <path>), collapsing the three-location scatter to one.
# ABOUTME: Pre-launch hard cut. All call sites, tests, docs, and the bootstrap path accounted for. Grounded in the three-way investigation (call-surface + bootstrap/config + tests/docs).

# [I176] Card Source Path Reform — Task Plan (GATE 2)

**Status**: Ready for execution.
**Created**: 2026-07-31 · **Issue**: [I176] (tracker row created 2026-08-03)
**Owner**: Remy K · **Reviewer**: Minseung Lee
**Architecture**: [`../analyses/cl0176_card_source_path_reform_target_architecture.md`](../analyses/cl0176_card_source_path_reform_target_architecture.md)
**Branch**: `remy/I176-card-source-path-reform`
**Scope**: Breaking change to the drwn CLI card-authoring/publish lifecycle. Pre-launch; no external consumers to break.
**Downstream**: [I177] machine-scope blueprint hard-depends on this landing (shared `machine-config.ts` + `types.ts`).

---

## Objective

Eliminate the `~/.agents/drwn/sources/` directory. A card source becomes a path-addressable directory (typically a git repo) that the user controls. `drwn card publish --from <path>` snapshots it. The store holds only immutable published versions — never editable sources.

## Mental model change

**Before** (4 concepts): card sources live in `sources/`; publish reads from there; keep your git repo in sync manually; projects consume via `card.lock`.

**After** (2 concepts): a card is a directory with `card.json`; publish it with `drwn card publish --from <path>`; projects consume published immutable versions via `card.lock`.

---

## Implementation surface (from investigation)

- **6 core modules** with direct resolver calls (`card-store.ts`, `card-source.ts`, `card-source-sync.ts`, `diagnostics.ts`, `store-paths.ts`, `release-pipeline.ts`)
- **2 indirect core callers** (`card-capture.ts`, `card-from-defaults.ts`)
- **3 direct-resolver commands** (`fork.ts`, `link.ts`, `worker/mind/checkpoint.ts`)
- **15 `card source/*` command files** (thin wrappers — inherit fix from core)
- **4 publish/new/compose command files** (`card/publish.ts`, `card/new.ts`, `worker/new.ts`, `worker/compose.ts`, `worker/publish.ts`)
- **~45 test files** (centralized in `test/helpers.ts` — fixing 2 helpers heals ~30 tests)
- **5 knowledge/reference docs** + **2 SKILL.md files** + **1 sibling-repo runbook**
- **1 new user-config file** (`~/.agents/drwn/config.json` with `catalogCheckouts` + `defaultAuthorScope`)
- **1 new command** (`drwn config` — get/set user config)
- **1 init prompt addition** (catalog-checkout path in guided init)

---

## Phased plan

### Phase 0 — Prerequisites

- [x] **Baseline recorded 2026-08-03** on post-stack `main` (`ab060ff`): `bun run typecheck` 0 errors; `bun run test` **1773 pass / 6 skip / 0 fail** (300 files). This is the regression floor — Phase 7 must match or exceed it.
- [x] Prerequisite stack landed: I24 (`65d94c7`), I104 (`77c7364`), I175 consent (`4522bef`). The plan's file:line citations were verified line-exact against this tree.
- [ ] **Execute on the issue branch `remy/I176-card-source-path-reform` with incremental commits** (one logical commit per phase, `[[prefix]]` per `.ai/rules/01_git.md`). Superseded the original "no branch, no commits" note: that instruction predates the v0.4 issue-branch model this work now follows.
- [ ] **Coordination — land cl0153 sub-PR1 first.** It publishes `@curation-labs/workflow-skills` via the sync-then-publish flow this task deletes (`cl0153_cursor_opencode_integration_task_plan.md` Phase 4). It is cheap card housekeeping; landing it first avoids rewriting its steps.
- [ ] Verify with the submodule-initialized recipe — a bare worktree without `darwinian-worker-skills` produces ~31 phantom ENOENT failures in the operator/release cluster:
  ```bash
  git submodule update --init darwinian-worker-skills && bun install && bun run typecheck && bun run test
  ```

### Phase 1 — Core: path-parameterize the source functions (highest leverage)

**Goal**: make every function that currently resolves a source dir from `agentsDir + name` accept an explicit `sourceDir` instead. This is the load-bearing change — everything downstream inherits it.

**Edit order** (by leverage, per the investigation's recommendation):

- [ ] **1a. `card-source.ts: readCardSourceState` (line 426)** + **`readSourceManifestForMutation` (line 239)** — change from `(agentsDir, name)` to `(sourceDir)`. This silently fixes all 12 mutation wrappers (`addCardSource{Persona,Belief,Hook,Skill,Mcp}`, `removeCardSource*`, `patchCardSourceManifest`, `composeCardSourceBlueprint`) because they all funnel through these two functions.
  - The manifest-name check at line 451 (`manifest.name !== name`) becomes a no-op (or warns instead of throws — the manifest IS the source of truth for the name now).
  - Return `state.sourceDir` as-is (already correct).

- [ ] **1b. `card-store.ts: createCardSource` (line 321)** — accept `{ sourceDir, name, scope?, noGit?, kind? }` instead of `{ agentsDir, name, ... }`. Create the dir at the passed `sourceDir` (not `resolveCardSourceDir`). Steps 1, 7–13 of the current trace stay (assertStoreWritable, existence guard, mkdir, manifest write, git init). Steps 4 (`ensureStoreInitialized`) and 6 (`resolveCardSourceDir`) drop. Step 5 (machine.json scope write) moves to Phase 4 (user config).

- [ ] **1c. `card-store.ts: readCardSourceManifest` (line 364)** — change from `(agentsDir, name)` to `(sourceDir)`. Read `join(sourceDir, "card.json")`.

- [ ] **1d. `card-store.ts: publishCard` (line 774)** — change from `(agentsDir, name, options)` to `(agentsDir, { sourceDir, ...options })`. Keep `agentsDir` (needed for `resolveCardBareRepoPath` + `ensureExtracted`). Lines 778 + 806 become `sourceDir` directly.

- [ ] **1e. `card-source-sync.ts: syncCardSource` (line 126)** + **`checkCardSourceUpstream` (line 181)** — accept `sourceDir` alongside `agentsDir` (agentsDir still needed for `ensureUpstreamBareRepo` at line 145).

- [ ] **1f. `release-pipeline.ts` (line 22, 32)** — update `syncCardSource` + `doctorCardSource` calls to pass `sourceDir`.

- [ ] **1g. `card-store.ts: ensureStoreInitialized` (line 188-197)** — remove `resolveSourcesRoot(agentsDir)` from the mkdir loop (line 190). `sources/` is no longer created.

- [ ] **1h. `diagnostics.ts: sourceCount` (line 1339)** — remove the `countMarkedDirectories(resolveSourcesRoot(...))` field. Either drop `sourceCount` from the diagnostic output or set it to `null`.

- [ ] **1i. `store-paths.ts`** — delete `resolveSourcesRoot` (line 136) and `resolveCardSourceDir` (line 140). `splitCardName` (line 70) stays.

**Acceptance**: `bun run tsc --noEmit` passes (types compile). No runtime test yet — commands haven't been updated.

### Phase 2 — Commands: update all command call sites

**Goal**: every command that calls the changed core functions passes `sourceDir` instead of `agentsDir + name`.

- [ ] **2a. `card/publish.ts`** — add `--from <path>` Option.String. Resolve `sourceDir` from `--from` or from catalog-checkout name resolution (Phase 4). Pass `{ sourceDir }` to `publishCard`.
- [ ] **2b. `card/new.ts`** — derive `sourceDir` as `join(process.cwd(), basename(name))` (or a `--into <dir>` flag). Pass to `createCardSource`.
- [ ] **2c. `worker/new.ts`** — same as 2b for blueprints.
- [ ] **2d. `worker/publish.ts`** — add `--from <path>`. Same as 2a.
- [ ] **2e. `worker/compose.ts`** — pass `{ sourceDir }` to `composeCardSourceBlueprint`.
- [ ] **2f. All 15 `card source/*.ts` commands** — change the first positional from a card name to a path (or accept `--from <path>`). Resolve `sourceDir`, pass to the core wrapper. The wrapper signatures already accept `sourceDir` from Phase 1a. Commands: `show`, `doctor`, `set`, `list`*, `sync`, `add-skill`, `remove-skill`, `add-hook`, `remove-hook`, `add-mcp`, `remove-mcp`, `add-persona`, `remove-persona`, `add-belief`, `remove-belief`.
  - **`list.ts` special case**: with no `sources/` to scan, `list` either scans catalog checkouts (Phase 4) or is deprecated in favor of `drwn card list --type source`. **Decision for execution**: deprecate `source list` (print "use `drwn card list` or `ls <catalog-checkout>/cards/`"); do not implement a new scan.
- [ ] **2g. `card/fork.ts`** — accept source as a path; destination defaults to CWD (or `--into <dir>`). Drop both resolver imports.
- [ ] **2h. `card/link.ts`** — delete the resolver comparison at line 57 (dead validation). The `--all-from` logic (lines 35-47) is already path-based and stays.
- [ ] **2i. `worker/mind/checkpoint.ts`** — the source-dir lookup from a mind card ref is the trickiest. Resolve via the project's `card.lock` (which records the card's extracted path) or accept an explicit `--source-dir <path>` flag. Investigate the exact resolution path during execution.
- [ ] **2j. `card-capture.ts` (line 56)** — pass `sourceDir` (derived from project path) to `createCardSource`.
- [ ] **2k. `card-from-defaults.ts` (line 30)** — pass `sourceDir` to `createCardSource`.

**Acceptance**: `bun run tsc --noEmit` passes. Commands are invocable with `--from <path>`.

### Phase 3 — New user config + catalog-checkout resolution

**Goal**: introduce `~/.agents/drwn/config.json` with `catalogCheckouts` + `defaultAuthorScope`, enabling bare-name resolution and replacing `machine.json policy.authoring.scope`.

- [ ] **3a. New module `cli/core/user-config.ts`** (rewrite the existing misnamed file): Zod schema for `{ catalogCheckouts: string[], defaultAuthorScope: string?, schemaVersion: 1 }`. Reader (`readUserConfig(agentsDir)`) + writer (`writeUserConfig(agentsDir, config)`) following the `mutateMachineConfig` pattern. Path: `resolveUserConfigPath` (already defined at `paths.ts:25`, currently dead code — wire it up).

- [ ] **3b. Catalog-checkout name resolver**: a function `resolveSourceDirByName(agentsDir, name)` that:
  1. Reads `catalogCheckouts` from user config.
  2. For each checkout path, walks `cards/` for a `card.json` whose `name` field matches.
  3. Returns the `sourceDir` if found; `null` if not.
  4. Factored from `link.ts:35-47` (the `@scope/card` walk logic), generalized to match by manifest name (not just dir name).

- [ ] **3c. Move `authoring.scope`** from `machine.json policy.authoring` to user config `defaultAuthorScope`:
  - `card-store.ts:334-337` (writer): write to user config instead of machine.json.
  - `card/new.ts:67,71` (reader): read from user config.
  - `card-from-defaults.ts:33` (reader): read from user config.
  - `machine-config.ts:78` (schema): remove `authoring` from the machine schema.
  - `types.ts:111-112` (type): remove `authoring` from `MachinePolicy`.

- [ ] **3d. New `drwn config` command** (`cli/commands/config.ts`): `drwn config get <key>`, `drwn config set <key> <value>`. Modeled on `mutateMachineConfig`. Supports `catalogCheckouts` and `defaultAuthorScope`.

- [ ] **3e. Init prompt**: add a catalog-checkout question to `executeGuided` (init.ts, after the Beads block):
  ```
  Path to your darwinian-cards checkout? [~/dev/darwinian-cards]:
  ```
  Write to user config. Non-interactive/minimal init skips it (user can set later via `drwn config set`).

**Acceptance**: `drwn config set catalogCheckouts '["~/dev/darwinian-cards"]'` works; `drwn card publish @scope/name` (no `--from`) resolves via catalog checkout.

### Phase 4 — Tests (fix the ~45 test files)

**Strategy**: fix the 2 centralized helpers first (heals ~30 tests), then fix the remaining ~15 individually.

- [ ] **4a. `test/helpers.ts:198,227`** — `publishCardWithSkills` and `publishExactOperatorProfile` hardcode `join(agentsDir, "drwn", "sources", ...)`. Change to create the source in a temp dir within the fixture, pass `sourceDir` to `publishCard`. This is the single highest-leverage test fix.

- [ ] **4b. `test/core-card-source.test.ts`** — the canonical spec for the source model. Rewrite to use path-based `createCardSource({ sourceDir })`, `readCardSourceState(sourceDir)`, etc. This defines the new contract.

- [ ] **4c. `test/core-card-store-git.test.ts`** — fix `createCardSource` + `publishCard` calls.

- [ ] **4d. `test/core-card-capture.test.ts`** — fix the direct `resolveCardSourceDir` import/calls.

- [ ] **4e. Remaining ~40 test files** — mechanical: replace `join(agentsDir, "drwn", "sources", ...)` with the new temp-dir-based source creation. Most use `helpers.ts` (fixed in 4a). The rest are individual `card source *` command tests that need their source-dir setup updated. Group by subsystem:
  - Authoring command tests (3 files)
  - Source mutation tests (6 files)
  - Publish pipeline tests (7 files)
  - Trust/doctor/diagnostics tests (3 files)
  - Card-meta/capture/vendor tests (~8 files)
  - E2E/scenario tests (5 files)
  - Other command tests (~8 files)

**Acceptance**: `bun test` passes with 0 failures, at **≥ 1773 pass / 6 skip / 0 fail** (the Phase 0 baseline on `ab060ff`). Test *count* may rise as cases are added; it must never fall without a stated reason.

### Phase 5 — Documentation

- [ ] **5a. `docs/cli-quickref.md`** — update the `card source` section (lines 237-258): remove `~/.agents/drwn/sources/` references; document `--from <path>` for publish; update `card source *` command signatures to path-based.
- [ ] **5b. `INSTALL.md`** — remove `sources/` from the State Locations tree (line 51); update `card source` examples (lines 148-163).
- [ ] **5c. `.ai/knowledges/01_agents-cli-usage-guide.md`** — update the card-source command reference (lines 283-347, 1204).
- [ ] **5d. `.ai/knowledges/10_drwn-cli-architecture.md`** — remove `sources/` from the store layout tree (line 40).
- [ ] **5e. `.ai/knowledges/09_cards-manual-test-guide.md`** — update manual test recipe (lines 55-74, 231).
- [ ] **5f. `docs/prelaunch-project-reset.md`** — remove the "do not remove sources/" line (line 17).
- [ ] **5g. `~/.agents/skills/author-mind-card/SKILL.md`** — substantive rewrite: update all `~/.agents/drwn/sources/` references to path-based authoring; update the "Wraps" command list (lines 183-195) and procedure steps (29-45, 83-134).
- [ ] **5h. `darwinian-worker-skills/skills/author-card/SKILL.md`** — same: update `card source *` workflow references.
- [ ] **5i. `darwinian-cards/cards/workflow-skills/docs/maintenance-runbook.md`** — update hardcoded source paths (lines 13,46,49,53,55,59,84) to path-based publish.
- [ ] **5j. `.ai/knowledges/11_card-usage-guide.html`** — update the HTML doc (if it references sources/).

### Phase 6 — Migration + cleanup

- [ ] **6a. Remove `sources/` from existing machines** — the consolidation already moved all card sources to `darwinian-cards/cards/`. Delete `~/.agents/drwn/sources/` (or provide a `drwn sources migrate` one-shot that copies each source to a user-chosen location and records the catalog checkout). For this machine: just delete it (the submodules are the sources now).
- [ ] **6b. Update `ensureStoreInitialized`** — already done in Phase 1g; confirm `sources/` is not recreated on any code path.
- [ ] **6c. Update the drwn-lab knowledge docs** — `05_card_version_bump_guide.md` Stage 1 (remove the `rsync` step — publish directly from the catalog checkout); `02_drwn_lab_operations.md` (update any source-dir references).

### Phase 7 — Final verification

- [ ] `bun run tsc --noEmit` — clean.
- [ ] `bun test` — all pass.
- [ ] `bun run drwn -- card new @test/temp-card` → creates `./temp-card/` in CWD (not in `sources/`).
- [ ] `bun run drwn -- card publish --from ./temp-card/` → publishes successfully.
- [ ] `bun run drwn -- card source doctor ./temp-card/` → works on the path.
- [ ] `bun run drwn -- config set catalogCheckouts '["~/dev/darwinian-cards"]'` → persists.
- [ ] `bun run drwn -- card publish @curation-labs/workflow-skills` → resolves via catalog checkout.
- [ ] No `sources/` dir created by any `drwn` command.
- [ ] Leave all changes uncommitted for operator review.

---

## Alternatives considered

(See architecture doc §2 for the three options. Summary:)

- **Architecture A (publish accepts a path)** — what this plan implements. Eliminates `sources/`. Simplest mental model.
- **Architecture B (sources/ IS the git repos via managed checkouts)** — rejected: reimplements git submodules; still has a `sources/` dir to explain.
- **Architecture C (symlinks)** — rejected: machine-local, fragile, not a CLI-level solution.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missed call site breaks at runtime | Medium | Phase 1 edit order fixes the funnel functions first; tsc catches type breaks; Phase 4 tests catch runtime breaks. |
| `checkpoint.ts` mind-source-dir resolution is complex | Medium | Phase 2i: investigate the exact resolution during execution; may need a `--source-dir` flag fallback. |
| `card source list` removal surprises users | Low | Pre-launch; deprecation message points to alternatives. |
| ~45 test files is a large surface | Medium | Phase 4a (fix 2 helpers) heals ~30 tests; remaining ~15 are mechanical. |
| User-config schema needs forward compatibility | Low | Zod schema with `schemaVersion: 1`; extendable. |

## Notes for the operator

- **Execute on `remy/I176-card-source-path-reform` with incremental commits**, one logical commit per phase. (The original plan said "no branch, no commits" — that predates the v0.4 issue-branch model and is superseded.)
- **Test command**: `bun run test` (full suite) — after `git submodule update --init darwinian-worker-skills`, or the operator/release-gate tests ENOENT spuriously.
- **Land cl0153 sub-PR1 before starting** (see Phase 0).
- **The highest-leverage single edit**: Phase 1a (`readCardSourceState` + `readSourceManifestForMutation`) — fixes 12 wrappers at once.
- **The highest-leverage test fix**: Phase 4a (`test/helpers.ts`) — heals ~30 tests.
- **The trickiest conversion**: Phase 2i (`checkpoint.ts`) — mind-source-dir resolution from a live mind index.

## Out of scope

- The `darwinian-cards` catalog registry mechanics (already consolidated — 17 cards registered).
- The machine-default skill-shadowing problem (analysis 03 — separate concern).
- Cursor/OpenCode hook delivery (experiment 04 — separate upstream concern).
- The `AGENTS_DIR` env var (unchanged — it redirects the whole store, which is correct).
