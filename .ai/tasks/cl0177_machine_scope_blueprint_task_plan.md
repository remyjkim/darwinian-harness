# ABOUTME: Handoff-ready implementation plan for machine-scope Worker Blueprint — replacing the profile + explicit-skills model with a single governed blueprint selected at machine scope, enabling card-closure governance (versioned, integrity-verified, hook+instruction capable) for ambient defaults.
# ABOUTME: Assumes [I176] (card source path reform) has landed. Pre-launch hard cut. All call sites, schema changes, sync gates, consent paths, and command changes mapped with exact file:line citations from the code-level investigation.

# [I177] Machine-Scope Worker Blueprint — Task Plan (GATE 2)

**Status**: Ready for execution **after [I176] lands**.
**Created**: 2026-08-02 · **Issue**: [I177] (tracker row created 2026-08-03)
**Owner**: Remy K · **Reviewer**: Minseung Lee
**Architecture**: [`../analyses/cl0177_machine_scope_blueprint_target_architecture.md`](../analyses/cl0177_machine_scope_blueprint_target_architecture.md)
**Branch**: `remy/I177-machine-scope-blueprint`
**Prerequisite**: **[I176] card source path reform has landed.** Docs/G1/G2 for this issue may run ahead of that (v0.4 parallel preparation); **Building may not**.
**Scope**: Breaking change to `machine.json` schema + effective-state + sync engine + consent model + use/apply commands. Pre-launch; no external consumers to break.
**Builds on**: [I24] instructions projection (`65d94c7`) — `sync-machine-instructions.ts` is designed as a sibling of that issue's `sync-project-instructions.ts`.

---

## Objective

Replace the machine-default dual model (hardcoded profile + ungoverned explicit skills) with a single Worker Blueprint selected at machine scope. `drwn write --root` projects the blueprint's full closure (skills + hooks + instructions + MCP) into user-home tool configs, with the same governance as project scope: versioned, integrity-verified, consent-gated.

## Design decisions (resolved in the architecture doc)

1. **Replace** — the blueprint is the sole source of machine-scope capabilities. Profile + explicit skills/mcpServers are removed.
2. **`machine.json`** — `activeWorker` + `workerLock` live in `capabilities`, replacing `profile`/`skills`/`mcpServers`. `schemaVersion` bumps to 2.
3. **Bundle + per-harness adapters** — instructions project to `~/.agents/drwn/generated/instructions.md` (canonical) + `~/.claude/CLAUDE.md` + `~/.codex/AGENTS.md`. NOT `~/AGENTS.md`.

---

## Implementation surface (from code-level investigation)

- **3 core modules** with structural changes (`effective-state.ts`, `machine-config.ts`, `sync.ts`)
- **2 new modules** (`worker-machine.ts`, `sync-machine-instructions.ts`)
- **4 command files** modified (`use.ts`, `apply.ts`/`project/apply.ts`, `card/trust.ts`, `write.ts`)
- **2 type/schema files** (`types.ts`, `machine-config.ts`)
- **2 consent-ack files** (`hook-consent-ack.ts`, `instruction-consent-ack.ts`)
- **1 project-command helper** (`project-command.ts`)
- **~30 test files** (the machine-config + effective-state + sync tests)

---

## Phased plan

### Phase 0 — Prerequisites

- [ ] Confirm **[I176]** has landed (`~/.agents/drwn/sources/` eliminated, `~/.agents/drwn/config.json` exists, `drwn card publish --from <path>` works).
- [ ] Re-baseline on the post-I176 `main` and record here: `____ pass / ____ skip / 0 fail`. (Pre-I176 floor, for reference: **1773 pass / 6 skip / 0 fail** on `ab060ff`, 2026-08-03. I176 changes ~45 test files, so its landing moves this number — re-measure, do not assume.)
- [ ] **Execute on the issue branch `remy/I177-machine-scope-blueprint` with incremental commits** (one logical commit per phase). Supersedes the original "no branch, no commits" note, which predates the v0.4 issue-branch model.
- [ ] Verify with the submodule-initialized recipe — a bare worktree without `darwinian-worker-skills` yields ~31 phantom ENOENT failures in exactly the operator/machine-profile/release-gate cluster this task rewrites, which would be badly misleading here:
  ```bash
  git submodule update --init darwinian-worker-skills && bun install && bun run typecheck && bun run test
  ```

### Phase 1 — `machine.json` v2 schema + migration

**Goal**: define the new schema, write the v1→v2 migration, and ensure all readers handle both.

- [ ] **1a. `cli/core/types.ts` (lines 108–123)**: widen `MachineConfig` to a discriminated union of v1 (`schemaVersion: 1`, `capabilities: { profile, skills, mcpServers }`) and v2 (`schemaVersion: 2`, `capabilities: { activeWorker, workerLock }`). Add `MachineCapabilitiesV2` interface: `{ activeWorker: string | null; workerLock: ProjectLockV1 | null }`.

- [ ] **1b. `cli/core/machine-config.ts` (lines 74–89)**: add `machineConfigV2Schema` parallel to the existing v1 schema. `schemaVersion: z.literal(2)`, `capabilities: z.object({ activeWorker: z.string().nullable(), workerLock: projectLockV1Schema.nullable() }).strict()`. The `parseMachineConfig` function (129–138) dispatches on `schemaVersion` to select the right schema.

- [ ] **1c. `cli/core/machine-config.ts` — v1→v2 migration**: add `isV1MachineConfig(raw)` + `migrateV1ToV2(raw)` mirroring the existing legacy pattern (101–118). The migration synthesizes a default blueprint name (`@machine/default-worker`), composes a `workerLock` from the profile + explicit skills' resolved card entries, and writes `{ schemaVersion: 2, capabilities: { activeWorker, workerLock } }`. Call from `readMachineConfigFile` (170–188) between the legacy check and the parse.

- [ ] **1d. `cli/core/machine-config.ts` — `createEmptyMachineConfig` (120–127)**: v2 form: `{ schema: "drwn.machine", schemaVersion: 2, policy: {}, capabilities: { activeWorker: null, workerLock: null } }`.

- [ ] **1e. `cli/core/card-store.ts` — `readMachineConfig` (208–210)**: ensure it returns the v2 empty form.

**Acceptance**: `tsc --noEmit` passes. Parsing a v1 `machine.json` auto-migrates to v2. A v2 file validates.

### Phase 2 — `selectMachineWorker` + effective-state machine branch

**Goal**: when `machine.json` has an `activeWorker`, `buildEffectiveState` populates the card closure at machine scope.

- [ ] **2a. `cli/core/effective-state.ts` — new `selectMachineWorker` function**: extract the closure-resolution tail of `selectProjectWorker` (lines 231–254: `selectedRoot` lookup, `closureNames`, `activeCards` derivation) into a shared helper. Build `selectMachineWorker({ activeWorker, workerLock })` that:
  - Reads `workerLock.workerRoots` + `workerLock.cards`.
  - Finds the selected root by `activeWorker`.
  - Computes `activeCards` via `closureNames(selectedRoot)`.
  - Returns `EffectiveWorkerSelection` with `selectionSource: "machine"`, `localOverrides` zeroed.
  - Add `"machine"` to the `selectionSource` union (line 87 or `types.ts`).

- [ ] **2b. `cli/core/effective-state.ts` — new machine-worker branch in `buildEffectiveState`**: between line 403 (end of project branch) and line 405 (scope computation), add:
  ```
  else if (machineConfig?.capabilities.activeWorker && machineConfig?.capabilities.workerLock) {
    // resolve the machine worker closure
    workerSelection = selectMachineWorker({ activeWorker, workerLock });
    activeCards = workerSelection.activeCards;
    lockedCards = workerLock.cards;
    skillApplyOrderCards = activeCards;
    // populate contentRootsByCard from extracted card paths (the lock entries have .path)
    // populate cardModes (all "overlay" or a new "machine" mode), cardLanes ("committed"), vendorEligible (empty)
    // populate cardServerDefinitions from activeCards manifests
    // skip overlayWarnings, organizationInstructionConsent (machine scope has no overlays)
  }
  ```
  This mirrors the variable population from the project branch (304–403) but reads from `machineConfig` instead of `projectConfig`/`card.lock`.

- [ ] **2c. `cli/core/effective-state.ts` — `scopeRoot`/`generatedDir` (405–410)**: extend the ternary to handle the machine-worker case. When `writeScope === "machine"` AND `workerSelection` is populated (the new branch ran), `generatedDir` should still be `resolveStoreGeneratedDir(agentsDir)` (it already is for machine scope — no change needed). `scopeRoot` should be `homeDir` (already is — no change needed). **Verify no change needed; confirm during implementation.**

- [ ] **2d. `cli/core/effective-state.ts` — `resolveMachineCapabilities` (defaults.ts:121–177)**: when `machine.json` is v2, this function should return skills/MCP derived from the blueprint closure (via `activeCards`) instead of the old profile + explicit skills. Either: (a) call it only for v1 configs (and have the v2 branch populate skills directly from `activeCards`), or (b) extend it to read v2. **Decision for execution**: option (a) — the v2 branch in `buildEffectiveState` populates `skillApplyOrderCards` from `activeCards`, making `resolveMachineCapabilities` unnecessary for v2. The v2 branch skips the `resolveMachineCapabilities` call at line 273.

**Acceptance**: `tsc --noEmit` passes. A machine with v2 `activeWorker` set produces a non-empty `workerSelection` + `activeCards` in `buildEffectiveState` with `forceMachineScope: true`.

### Phase 3 — Lift sync gates + machine instructions

**Goal**: `syncRepository` projects workers + instructions at machine scope.

- [ ] **3a. `cli/core/sync.ts` (line 690)**: change the `if (state.projectRoot)` gate to also enter when `state.workerSelection` is populated at machine scope. Either: `if (state.projectRoot || (state.scopedOptions.writeScope === "machine" && state.workerSelection?.selectedRoot))`. This lets `syncWorkers` (703) and `syncProjectInstructions` (707) run.

- [ ] **3b. `cli/core/sync.ts` (line 691)**: `reconcileVendorTrees` is project-only. Guard it inside `if (state.projectRoot)` (a nested condition) so it doesn't run at machine scope. Vendor reconciliation is a project-materialization concept.

- [ ] **3c. New `cli/core/sync-machine-instructions.ts`**: a sibling of `sync-project-instructions.ts` that:
  - Takes the same `{ state, previousManagedPaths, composition }` input.
  - Composes instructions via `instructionCompositionForState(state)` — already works (iterates `activeCards`).
  - Projects to `~/.claude/CLAUDE.md` (adapterRelativePath `.claude/CLAUDE.md` rooted at `homeDir`).
  - Projects to `~/.codex/AGENTS.md` (rooted at `homeDir`).
  - Does NOT write `~/AGENTS.md`.
  - Uses the same managed-block mechanism (`writeManagedBytes`, `OWNERSHIP_FIELD = "drwn:instructions"`).
  - Managed-path records store home-relative paths (e.g. `.claude/CLAUDE.md`, `.codex/AGENTS.md`).

- [ ] **3d. `cli/core/sync.ts` (line 707)**: when `writeScope === "machine"`, call `syncMachineInstructions` instead of `syncProjectInstructions`. When project scope, call `syncProjectInstructions` as today.

- [ ] **3e. `cli/core/sync-project-instructions.ts` (lines 37–45)**: the `writeScope === "machine"` early-return can stay (the machine path now goes through `syncMachineInstructions` instead). No change needed here — the machine variant bypasses it entirely.

- [ ] **3f. `cli/core/sync.ts` — hook projection at machine scope**: `syncHooks` (744) already runs unconditionally. With `activeCards` populated (Phase 2), it will now produce hook policies. The hook composer writes to `state.scopedOptions.generatedDir` (machine scope → `~/.agents/drwn/generated/hooks/`). **Verify**: does the hook also need to write to `~/.claude/settings.json` (the user-scope hooks config)? Check `sync-hooks.ts` for the target path logic. If it writes to `<scopeRoot>/.claude/settings.json`, then at machine scope it writes to `~/.claude/settings.json` — which is correct.

**Acceptance**: `drwn write --root` (with v2 activeWorker set) produces: worker bundle in `~/.agents/drwn/generated/`, instructions in `~/.claude/CLAUDE.md` + `~/.codex/AGENTS.md`, hook composers in `~/.agents/drwn/generated/hooks/`, skills in `~/.claude/skills/` + `~/.codex/skills/`.

### Phase 4 — Machine-scope consent

**Goal**: `drwn card trust --scope machine` writes consent into `machine.json workerLock`.

- [ ] **4a. `cli/commands/card/project-command.ts` (lines 12–17)**: add `resolveMutationScope(command)` that returns `{ kind: "project", root }` or `{ kind: "machine", root: homeDir }` based on a `--root`/`--scope machine` flag. Export both `requireProjectRoot` (unchanged) and `requireMutationRoot` (scope-aware).

- [ ] **4b. `cli/commands/card/trust.ts` (lines 53, 63)**: use `requireMutationRoot(this)` instead of `requireProjectRoot(this)`. When machine scope: write consent into `machine.json workerLock.cards[<cardName>].hookConsent` / `.instructionConsent` via `mutateMachineConfig`.

- [ ] **4c. `cli/core/card-project.ts` — `setCardConsent`**: add a machine-scope arm. When the root is the machine store, mutate `machine.json capabilities.workerLock.cards[]` instead of `<project>/.agents/drwn/card.lock`. The consent fields (`hookConsent`, `instructionConsent`) have the same shape on both lock types.

- [ ] **4d. `cli/core/hook-consent-ack.ts` + `instruction-consent-ack.ts`**: add machine-scope ack-key variants. `buildHookConsentAckKey({ projectRoot: "__machine__", card, hookPolicyDigest })` — use a constant sentinel `"__machine__"` instead of a real project path. The ack-file path stays the same (`~/.agents/drwn/state/hook-consent-acks.json`); the key just disambiguates machine from project acks.

- [ ] **4e. `cli/commands/write.ts` (lines 164–225)**: the consent replay block. Add a machine-scope branch:
  - When `this.scope === "machine"` (or `this.root`), read consent from `machine.json workerLock.cards[]` instead of project `card.lock`.
  - Check ack keys with the `"__machine__"` sentinel.
  - Record acks on miss (same "consented on another machine" message).

**Acceptance**: `drwn card trust @curation-labs/workflow-skills --hooks --scope machine` writes consent to `machine.json`. `drwn write --root` projects the hooks (no "missing consent" warning).

### Phase 5 — `drwn use --root` / `drwn apply --root`

**Goal**: select a machine-scope worker via the CLI.

- [ ] **5a. New `cli/core/worker-machine.ts`**: mirrors `worker-project.ts` but for machine scope. Functions:
  - `useMachineWorker(agentsDir, ref|null, { dryRun })` — writes `activeWorker` + resolves + writes `workerLock` to `machine.json` via `mutateMachineConfig`. Uses `resolveWorkerGraph` (project-agnostic) for closure resolution.
  - `applyMachineWorkerRoots(agentsDir, specs, { active, none, dryRun })` — install + select atomically.
  - These reuse `resolveCard`, `resolveWorkerGraph`, `toCardLockEntry` — all project-agnostic.

- [ ] **5b. `cli/commands/use.ts` (line 37)**: add `--root` flag (or detect `--scope machine`). When set: call `useMachineWorker` instead of `useProjectWorker`. Skip `registerProject`. Pass `forceMachineScope: true` to `runChainedWrite`.

- [ ] **5c. `cli/commands/project/apply.ts` (line 40)**: same — add `--root` flag. When set: call `applyMachineWorkerRoots` instead of `applyProjectWorkerRoots`. Pass `forceMachineScope: true` to the chained write.

- [ ] **5d. `cli/commands/card/project-command.ts` — `runChainedWrite` (44–58)**: accept a `forceMachineScope` parameter. When true, pass it to `buildEffectiveState` so the machine branch runs.

**Acceptance**: `drwn use --root @curation-labs/machine-defaults@1.0.0` writes `activeWorker` + `workerLock` to `machine.json` v2. `drwn write --root` projects the full closure.

### Phase 6 — Deprecate the old model

**Goal**: remove the profile contract + explicit skills machinery (now subsumed).

- [ ] **6a. `cli/core/operator-profile-contract.ts`**: mark deprecated. The `DARWINIAN_OPERATOR_PROFILE` constants stay (for migration reference) but the `z.literal()` schema is no longer enforced. The operator card is consumed as a normal blueprint member.

- [ ] **6b. `cli/core/machine-profiles.ts`**: `initializeMachineCapabilities` (151–180) now offers a machine blueprint instead of the operator profile. The guided init prompt changes from "Use Recommended Darwinian Operator machine capabilities?" to "Use Recommended Machine Defaults blueprint?".

- [ ] **6c. `cli/commands/machine/skill.ts`**: `enable`/`disable` (426–476) — deprecate with a message: "Machine skills are now managed via the machine Worker Blueprint. Use `drwn use --root <blueprint>` to select machine defaults." The commands can stay as no-ops or be removed.

- [ ] **6d. `cli/core/defaults.ts`**: `resolveMachineCapabilities` (121–177) — only called for v1 configs (the migration path). For v2, it's unused (Phase 2d).

**Acceptance**: no code path requires the profile contract or explicit-skills list for v2 configs. The v1→v2 migration preserves the user's current capabilities.

### Phase 7 — Tests

- [ ] **7a. New test: machine-scope blueprint end-to-end** — compose a test blueprint, `drwn use --root`, `drwn write --root`, verify skills + hooks + instructions projected to `~/.claude/` + `~/.codex/`.
- [ ] **7b. New test: v1→v2 migration** — feed a v1 machine.json, verify migration produces a valid v2 with the correct closure.
- [ ] **7c. New test: machine-scope consent** — `drwn card trust --scope machine`, verify consent in machine.json, verify hooks project after trust.
- [ ] **7d. Update existing machine-config tests** — `test/core-machine-config.test.ts` (or equivalent) for v2 schema + migration.
- [ ] **7e. Update existing effective-state tests** — for the machine-worker branch.
- [ ] **7f. Update existing sync tests** — for machine-scope worker + instruction projection.

**Acceptance**: `bun test` passes with 0 failures.

### Phase 8 — Documentation

- [ ] **8a. `README.md`** — update the machine-defaults description.
- [ ] **8b. `docs/cli-quickref.md`** — document `drwn use --root`, `drwn apply --root`, `drwn card trust --scope machine`, the v2 machine.json schema.
- [ ] **8c. `.ai/knowledges/`** — update the architecture doc (10_drwn-cli-architecture.md) for the machine blueprint model.
- [ ] **8d. `darwinian-worker-skills/README.md`** — update the machine-defaults workflow (now blueprint-based, not skill-enable-based).
- [ ] **8e. `~/.agents/skills/manage-defaults/SKILL.md`** — update for the blueprint model.

### Phase 9 — Final verification

- [ ] `bun run tsc --noEmit` — clean.
- [ ] `bun test` — all pass.
- [ ] Compose `@curation-labs/machine-defaults` blueprint (operator + workflow-skills + knowledge-docs).
- [ ] `drwn use --root @curation-labs/machine-defaults@1.0.0` → machine.json v2 with activeWorker + workerLock.
- [ ] `drwn card trust @curation-labs/workflow-skills --hooks --scope machine` + `--instructions --scope machine`.
- [ ] `drwn write --root` → projects skills + hooks + instructions + MCP to `~/.claude/`, `~/.codex/`.
- [ ] Verify: `~/.claude/CLAUDE.md` has the composed instructions managed block.
- [ ] Verify: `~/.claude/skills/` has the operator + workflow + knowledge-docs skills.
- [ ] Verify: `~/.agents/drwn/generated/hooks/` has the hook composers.
- [ ] Verify: a project's `drwn write` still works independently (project worker shadows machine).
- [ ] Leave all changes uncommitted for operator review.

---

## Highest-leverage edit order

1. **Phase 1** (schema + migration) — defines the data model everything else reads.
2. **Phase 2** (`selectMachineWorker` + effective-state branch) — the core wiring; makes `activeCards` available at machine scope.
3. **Phase 3** (lift gates + machine instructions) — makes the sync engine project the closure.
4. **Phase 4** (consent) — enables hooks + instructions (gated on consent).
5. **Phase 5** (use/apply --root) — the user-facing selection commands.
6. **Phase 6** (deprecate old model) — cleanup.

## Reuse wins (from the investigation)

| Subsystem | Why no change needed |
|---|---|
| `syncWorkers` (`sync-worker.ts:240`) | Already scope-agnostic — reads `workerSelection` + `generatedDir`, both correct at machine scope |
| `resolveCard` + `resolveWorkerGraph` | Project-agnostic (take `agentsDir` + refs) |
| `managed-block.ts` | Path-agnostic byte manipulation |
| `closureNames` / `sameTopology` | Reusable helpers in `effective-state.ts` |
| `mutateMachineConfig` | Already provides locked-write for machine.json |
| MCP sync | Already runs at machine scope |
| Global write-record | Already tracks machine-scope paths |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Machine branch in effective-state is complex (~100 lines) | Medium | Mirror the project branch precisely; reuse `selectMachineWorker` extracted from `selectProjectWorker` tail |
| Hook projection to `~/.claude/settings.json` may conflict | Medium | Use `managed-fields` (per-field hashing); verify `sync-hooks.ts` target logic during implementation |
| v1→v2 migration loses user capabilities | Medium | Migration synthesizes the closure from existing profile + skills; test thoroughly (Phase 7b) |
| Consent ack key collision (machine vs project) | Low | Use `"__machine__"` sentinel in ack keys |
| Instructions to `~/.codex/AGENTS.md` format mismatch | Low | Codex reads AGENTS.md natively; verify during Phase 3 testing |

## Notes for the operator

- **Execute on `remy/I177-machine-scope-blueprint` with incremental commits**, one logical commit per phase. (Supersedes the original "no branch, no commits" note — it predates the v0.4 issue-branch model.)
- **Test command**: `bun run test` (full suite) — after `git submodule update --init darwinian-worker-skills`; without it the operator/machine-profile/release-gate tests ENOENT spuriously, which is exactly the cluster this task rewrites.
- **Execute after [I176]** — the source-path reform must land first. **Correction (2026-08-03):** the shared surface is **`machine-config.ts` + `types.ts`**, *not* `effective-state.ts`. I176 never touches `effective-state.ts`; it removes `policy.authoring` from the machine schema (`machine-config.ts:78`, `types.ts:111-112`) while this task rewrites that same schema to v2. Verified by grep against the post-stack tree. The I176 → I177 order holds; only the stated rationale was wrong.
- **The highest-leverage single edit**: Phase 2a (`selectMachineWorker`) — once the machine worker selection works, the sync engine (Phase 3) and consent (Phase 4) follow mechanically.

## Out of scope

- The personal-harness split (Issue 2) — separate effort; the machine blueprint can compose whatever cards exist.
- **The `~/.agents/skills/` curated-dir cleanup — with an ownership boundary, not a blanket exclusion (clarified 2026-08-03).** The seam: this task's machine-scope projection *writes into* that directory, while cl0153 sub-PR2 (D2b, machine-default skill shadowing) treats it as a bug target. Boundary: **this task owns what the blueprint projects there** (the closure's skills, their content and lifecycle); **cl0153 sub-PR2 owns the shadowing/precedence rules** for whatever ends up there. Since sub-PR2's G2 is still unwritten, it must be drafted against this task's v2 closure model rather than the v1 profile model. Un-owned leftovers from the v1 era (hand-curated skills nobody projects) stay out of scope for both.
- Cursor/OpenCode hook delivery (experiment 04) — the hook limitation is in drwn's encoder, not the machine-scope model.
- Per-scope catalogs for `@curation-labs`/`@remyjkim` — registry-only is sufficient.
