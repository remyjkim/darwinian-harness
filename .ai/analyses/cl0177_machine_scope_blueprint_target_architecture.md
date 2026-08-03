# ABOUTME: Target architecture design for machine-scope Worker Blueprint activation — replacing the profile + explicit-skills dual model with a single governed blueprint selected at machine scope, enabling card-closure governance (versioned, integrity-verified, hook+instruction capable) for ambient defaults.
# ABOUTME: Assumes [I176] (card source path reform) has landed. Pre-launch hard cut. Grounded in the machine-defaults investigation + the blueprint-instructions investigation + the machine-scope feasibility investigation.

# [I177] Machine-Scope Worker Blueprint — Target Architecture (GATE 1)

**Status**: Design proposal (2026-08-02), submitted for G1 review 2026-08-03. Pre-launch; open to breaking changes.
**Issue**: [I177] · **Owner**: Remy K · **Reviewer**: Minseung Lee · **Branch**: `remy/I177-machine-scope-blueprint`
**Plan**: [`../tasks/cl0177_machine_scope_blueprint_task_plan.md`](../tasks/cl0177_machine_scope_blueprint_task_plan.md) (GATE 2)
**Prerequisite**: **[I176]** has landed — `~/.agents/drwn/sources/` eliminated, `~/.agents/drwn/config.json` (user preferences) exists, `drwn card publish --from <path>` works. Docs/G1/G2 here may run ahead of that; Building may not.
**Scope**: the drwn CLI's machine-default model + effective-state + sync engine (`cli/`).
**Related**: [`cl0176_card_source_path_reform_target_architecture.md`](./cl0176_card_source_path_reform_target_architecture.md) (prerequisite), [I24] instructions projection (merged `65d94c7`) whose `sync-project-instructions.ts` this design mirrors.

## 1. The problem

The machine-default model has a **governance gap**: it supports two levels, both broken for different reasons.

**The profile** (`capabilities.profile`) — one hardcoded, immutably-pinned operator card. Provides integrity verification and atomic curation. But locked to exactly `@darwinian/operator@2.0.0` via `z.literal()` — cannot be changed without a CLI release, cannot accept a second card, cannot be extended.

**Explicit skills** (`capabilities.skills[]`) — a flat list of bare skill IDs, enabled one-by-one via `drwn machine skill enable <id>`. No version tracking, no integrity verification, no provenance. Resolves to whatever bytes `findAvailableSkill` finds on disk. The 12 remaining explicit skills on this machine are exactly the `@remyjkim/personal-harness` skill list, but `machine.json` records no connection to that card.

There is **no middle ground**: no way to say "these skills come from this card, at this version, as my machine defaults." The operator profile proves the concept (card-pinned machine capabilities with integrity) but the mechanism is deliberately non-extensible.

The consequence: machine defaults are either over-governed (the locked profile) or under-governed (bare skill IDs). And neither level supports hooks or instructions at machine scope — the two surfaces that make the workflow-skills card valuable.

## 2. The proposed architecture

**Replace the dual model with one: a Worker Blueprint selected at machine scope.**

```
# machine.json (after)
{
  "schema": "drwn.machine",
  "schemaVersion": 2,
  "policy": { ... },
  "capabilities": {
    "activeWorker": "@curation-labs/machine-defaults@1.0.0",
    "workerLock": { ... }    // closure lock (like a project card.lock)
  }
}
```

- `activeWorker` — the selected blueprint ref (or `null` for no machine worker).
- `workerLock` — the resolved closure (roots + cards with integrity hashes), analogous to a project's `card.lock`.
- `profile`, `skills`, `mcpServers` — **removed** (subsumed by the blueprint closure).

The machine blueprint is a normal Worker Blueprint card (`kind: "blueprint"`) that composes whatever cards the user wants as ambient defaults:

```jsonc
// @curation-labs/machine-defaults card.json
{
  "name": "@curation-labs/machine-defaults",
  "version": "1.0.0",
  "kind": "blueprint",
  "composedFrom": [
    "@darwinian/operator@^2.0.0",         // the 8 operator skills
    "@curation-labs/workflow-skills@^1.0.0", // 13 workflow skills + hook + instructions
    "@remyjkim/knowledge-docs@^1.0.0",     // 3 knowledge-docs skills
    "@remyjkim/parallel-research@^1.0.0"   // (future: the split personal-harness skills)
  ],
  "instructions": {
    "path": "instructions.md"
  },
  "description": "Machine-wide default Worker: operator capabilities, workflow skills, and research tools."
}
```

### Decision 1 — Replace (rationale)

**Replace, not coexist.** The dual model IS the governance gap — keeping it alongside the blueprint reintroduces the exact problem. Replace means:

- The profile's 8 operator skills are delivered by including `@darwinian/operator` as a `composedFrom` member of the machine blueprint. No separate mechanism needed.
- Explicit skills (`capabilities.skills[]`) are removed. Skills that were explicitly enabled are instead delivered by card members in the blueprint closure.
- The hardcoded profile contract (`operator-profile-contract.ts`) becomes unnecessary — the machine blueprint's lock provides equivalent (or better) integrity verification via the normal card-closure resolution + content-hashing path. The contract can be deprecated.
- `schemaVersion` bumps to `2` (breaking change; pre-launch, acceptable).

**What this eliminates:** the profile-vs-explicit tension, the `z.literal()` lock that requires a CLI release to change the operator, the ungoverned bare-skill-ID list, and the inability to have hooks/instructions at machine scope.

**What this preserves:** the *concept* of "ambient defaults available on every machine" — just delivered through a governed card closure instead of ungoverned skill IDs.

### Decision 2 — Location: `machine.json` (rationale)

A blueprint selection determines what gets projected — that's capability/integrity state, not a user preference. It belongs in `machine.json` alongside (replacing) the current `capabilities`. Post-task-130, `policy.authoring.scope` has already moved to `config.json`, so `machine.json` is purely about "what this machine projects" — the right place for the active worker.

The `workerLock` field embeds the closure lock directly in `machine.json` (rather than a separate file like `<project>/.agents/drwn/card.lock`). This keeps machine state in one file and avoids a second lock path resolver. The lock entry schema (including `hookConsent`/`instructionConsent`) is reused from the project `card.lock` — it's location-independent.

### Decision 3 — Instructions projection: bundle + per-harness adapters (rationale)

The investigation confirmed the blueprint can carry its own `instructions` field, and `composeConsentedInstructions` already composes it alongside member cards' instructions. The composition works unchanged. The question is the projection *target* at machine scope.

**The generated worker bundle's `instructions.md`** is written automatically by `syncWorkers` — this already works at machine scope (the generated dir resolves to `~/.agents/drwn/generated/`). This is the canonical copy.

**Per-harness adapter files** at user scope deliver the composed instructions to each harness's user-scope memory:
- `~/.claude/CLAUDE.md` — Claude Code's user-scope memory (already used by drwn as an adapter target at project scope).
- `~/.codex/AGENTS.md` — Codex's user-scope instructions.
- Cursor and OpenCode: read `AGENTS.md` files; the adapter can target `~/.cursor/AGENTS.md` and `~/.config/opencode/AGENTS.md` if those paths are conventionally read (verify during implementation).

**`~/AGENTS.md` is NOT written** — it would impose project-style instructions on every shell session and conflict with user-maintained home files. The per-harness adapter files are sufficient and non-polluting.

The drwn managed-block mechanism (the `<!-- drwn:instructions:start -->` / `<!-- drwn:instructions:end -->` block with `Instruction-ID` and `Content-Digest` headers) is reused unchanged — it's already how project-scope `AGENTS.md` works.

## 3. The simplified mental model

**Before** (3 concepts at machine scope):
1. The profile — one hardcoded operator card, immutably pinned, can't be changed.
2. Explicit skills — bare IDs, ungoverned, enabled one-by-one.
3. Explicit MCP servers — bare IDs, same governance gap.

**After** (1 concept):
1. A Worker Blueprint — selected at machine scope, composing any cards you want. Same governance as project scope: versioned, integrity-verified, hook+instruction capable. `drwn write --root` projects its full closure (skills + hooks + instructions + MCP) into user-home tool configs.

The machine/project distinction becomes "which scope am I writing to," not "which completely different model applies." One primitive (blueprint), one governance model (card closure), two scopes (machine + project).

## 4. The user experience

### Fresh install

```sh
npm install -g darwinian
drwn init
# guided init offers: "Use Recommended Machine Defaults blueprint? [Y/n]"
# → if yes: resolves @curation-labs/machine-defaults, writes activeWorker + workerLock to machine.json
drwn write --root
# → projects 20+ skills + hooks + instructions + MCP to ~/.claude/, ~/.codex/, etc.
```

### Changing machine defaults

```sh
# swap to a different blueprint
drwn use --root @my-org/custom-defaults@1.0.0
drwn write --root

# or compose a new one
drwn card new @my-org/my-defaults --kind blueprint
drwn worker compose @my-org/my-defaults --add @darwinian/operator@^2.0.0
drwn worker compose @my-org/my-defaults --add @curation-labs/workflow-skills@^1.0.0
drwn card publish --from ./my-defaults/
drwn use --root @my-org/my-defaults@1.0.0
drwn write --root
```

### Consuming at project scope (unchanged)

```sh
cd ~/my-project
drwn apply @my-org/project-worker@1.0.0
drwn write
# → project worker fully shadows machine worker for this project's writes
# → drwn write --root still projects the machine worker independently
```

## 5. What already works (free from the investigation)

| Subsystem | Why it needs no changes |
|---|---|
| Worker bundle destination | `generatedDir` already resolves to `~/.agents/drwn/generated/` at machine scope |
| Card resolution | `resolveCard` and `resolveWorkerGraph` are project-agnostic (take `agentsDir` + refs) |
| MCP sync | Already runs at machine scope unconditionally |
| Skills sync | Already runs at machine scope (driven by `skillApplyOrderCards` + `machineCapabilities`) |
| Global write-record | Already tracks machine-scope managed paths |
| `--root` plumbing | `assertMachineWriteScopeAllowed` + `forceMachineScope` already exist |
| Blueprint instructions | `composeConsentedInstructions` already iterates `activeCards` including the blueprint root; `closureNames` includes `[root.name, ...root.members]` |
| Lock entry schema | `hookConsent`/`instructionConsent` fields are location-independent |

## 6. What needs building (6 work items)

### 6.1 New effective-state branch (~100 lines)

In `buildEffectiveState` (`effective-state.ts`), when `projectConfigPath` is null AND `machine.json` has an `activeWorker`:

1. Read `workerLock` from `machine.json`.
2. Reconstruct `workerSelection` from the lock (the lock records roots + cards + selection).
3. Populate `activeCards`, `skillApplyOrderCards`, `cardServerDefinitions`, `contentRootsByCard`, `cardModes` — mirroring lines 304-403 of the project branch.
4. Verify integrity (re-hash the extracted card dirs against the lock's hashes).

This is the core wiring change. The logic is a parallel of the project branch, reading from `machine.json workerLock` instead of `<project>/.agents/drwn/card.lock`.

### 6.2 Lift the project-only gates

In `syncRepository` (`sync.ts:690-715`):

- Move `syncWorkers` out of `if (state.projectRoot)` — it should also run when `state.workerSelection` is populated at machine scope.
- Move `syncProjectInstructions` out of `if (state.projectRoot)` — but redirect the output target from `<scopeRoot>/AGENTS.md` to per-harness adapter files (§6.4).
- Remove the `writeScope === "machine"` early-return in `sync-project-instructions.ts:38-45`.

### 6.3 Machine-scope consent

- `drwn card trust <card> --hooks --scope machine` and `--instructions --scope machine` — write consent into `machine.json workerLock.cards[].hookConsent` / `.instructionConsent`.
- `card trust` gains a `--scope machine` (or `--root`) flag. When set, it reads/writes `machine.json workerLock` instead of requiring a project root.
- Consent-ack keys use a `"machine"` sentinel instead of `projectRoot`.
- `drwn write --root` replays consent from the machine lock (the project-scope replay logic in `write.ts:164-227` gains a machine-scope branch).

### 6.4 Instructions projection at machine scope

- The composed instructions byte stream (from `composeConsentedInstructions`) is projected to:
  - `~/.agents/drwn/generated/instructions.md` (the worker bundle — already written by `syncWorkers`).
  - `~/.claude/CLAUDE.md` (Claude adapter — drwn managed block).
  - `~/.codex/AGENTS.md` (Codex adapter — drwn managed block).
- **Not** `~/AGENTS.md` (avoids home-dir pollution).
- The managed-block mechanism (`<!-- drwn:instructions:start -->` with `Instruction-ID`/`Content-Digest`) is reused unchanged.
- A new function `syncMachineInstructions` (or a scope-aware branch in `syncProjectInstructions`) handles the target routing.

### 6.5 `machine.json` schema bump

- `schemaVersion` → `2`.
- `capabilities` becomes `{ activeWorker: string | null, workerLock: ProjectLockValue | null }`.
- `profile`, `skills`, `mcpServers` removed (subsumed by the blueprint closure).
- Migration: `drwn init` (or a migration command) converts v1 → v2 by composing a default machine blueprint from the existing profile + explicit skills, preserving the user's current capability set.

### 6.6 `drwn use --root` and `drwn apply --root`

- `drwn use --root <blueprint-ref>` — selects the machine-scope active worker. Resolves the closure, writes `activeWorker` + `workerLock` to `machine.json`.
- `drwn apply --root <blueprint-ref>` — install + select in one step (same as project `apply` but targeting `machine.json`).
- These are the machine-scope equivalents of the project `use`/`apply` commands.

## 7. Interaction with project scope

**Project worker fully shadows machine worker when a project is active.** This matches today's exclusive model (entering a project replaces the machine view), extended to the blueprint:

- `drwn write` (from a project) → projects the project's selected worker. Machine worker is not consulted.
- `drwn write --root` → projects the machine worker. Project worker is not consulted.
- The two write invocations produce independent projections to independent target dirs (project `.claude/` vs machine `~/.claude/`). The harness deduplicates by directory name, with project dirs taking precedence (closer to CWD).

No new three-way merge logic is needed — the existing exclusive model extends naturally.

## 8. Interaction with [I176]

[I176] eliminates `sources/` and introduces `~/.agents/drwn/config.json` (user preferences: `catalogCheckouts`, `defaultAuthorScope`). This design:

- **Shares two files with [I176]** — `machine-config.ts` and `types.ts`. **Correction (2026-08-03):** an earlier draft of this section claimed the two "touch different subsystems." That is wrong: [I176] removes `policy.authoring` from the machine schema (`machine-config.ts:78`, `types.ts:111-112`) while this design rewrites that same schema to v2 (`schemaVersion` 1 → 2). The overlap is real and is the hard reason for the ordering. (The companion plan's claim that they share `effective-state.ts` is *also* wrong — [I176] never touches that file. Verified by grep against the post-stack tree.)
- Benefits from [I176]'s `config.json` — the `catalogCheckouts` field enables bare-name blueprint resolution (`drwn use --root @curation-labs/machine-defaults` resolves via the catalog checkout).
- Must land **after** [I176] — not merely for testing convenience, but because both edit the same schema and type declarations. Docs/G1/G2 may run ahead (v0.4 parallel preparation); Building may not.

## 9. Migration path

### For this machine (pre-launch)

1. Compose `@curation-labs/machine-defaults` blueprint (operator + workflow-skills + knowledge-docs + the personal-harness split cards once Issue 2 is resolved).
2. `drwn use --root @curation-labs/machine-defaults@1.0.0` → writes `activeWorker` + `workerLock` to `machine.json` v2.
3. `drwn card trust @curation-labs/workflow-skills --hooks --scope machine` + `--instructions --scope machine`.
4. `drwn write --root` → projects the full closure: skills (from all member cards), hooks (workflow-skills org-conventions), instructions (blueprint + workflow-skills composed), MCP (from member cards).
5. Verify: `~/.claude/skills/` has the operator + workflow + knowledge-docs skills; `~/.claude/CLAUDE.md` has the composed instructions managed block; the hook composer is in `~/.agents/drwn/generated/hooks/`.

### For new machines

`drwn init` (guided) offers the Recommended Machine Defaults blueprint. If accepted, the full closure is set up in one step — no individual skill enables, no profile dance.

## 10. What this eliminates

1. **The profile contract** (`operator-profile-contract.ts`) — the hardcoded `z.literal()` lock becomes unnecessary. The operator card is composed as a blueprint member with normal integrity verification.
2. **Explicit skills[]** — the ungoverned bare-ID list is replaced by governed card-closure skills.
3. **The governance gap** — one model (blueprint closure), one governance level (versioned + integrity-verified + consent-gated).
4. **The "no hooks at machine scope" limitation** — hooks are part of the card closure; they project at machine scope like any other surface.
5. **The "no instructions at machine scope" limitation** — instructions compose from the blueprint + member cards and project to per-harness adapter files.
6. **The `drwn machine skill enable` one-by-one workflow** — replaced by `drwn use --root <blueprint>`. Enabling/disabling individual skills becomes a matter of editing the blueprint's `composedFrom` and re-publishing.

## 11. What this preserves

- **The project-scope model** — unchanged. Projects still select their own workers via `drwn apply`/`drwn use`.
- **The card-closure resolution engine** — `resolveWorkerGraph`, `resolveCard`, `selectProjectWorker` all reused.
- **The sync engine** — `syncRepository`'s surface orchestration, with `syncWorkers`/`syncProjectInstructions` lifted from the project-only gate.
- **The consent model** — `card trust` extended with `--scope machine`, same digest-based consent.
- **The managed-block mechanism** — `AGENTS.md`/`CLAUDE.md` managed blocks, same format.
- **The write-record** — global write-record tracks machine-scope managed paths, same as today.

## 12. Open questions

1. **Should the machine blueprint's hooks project to `~/.claude/settings.json` at user scope?** Today `settings.json` hooks are project-scoped (`.claude/settings.json`). At machine scope, the equivalent is `~/.claude/settings.json` (Claude's user-scope settings). This is the natural target, but it's a shared file — drwn would manage the hooks key via `managed-fields` (per-field hashing), same as it manages MCP. Verify during implementation that `~/.claude/settings.json` isn't clobbered.

2. **Should `drwn init` (guided) compose a machine blueprint automatically from the operator profile?** The migration path suggests this. The guided init could compose `@curation-labs/machine-defaults` (or a user-chosen name) with `@darwinian/operator` as the sole member, then offer to add more cards interactively. This replaces the current "accept recommended operator profile?" prompt with "accept recommended machine blueprint?".

3. **Schema migration from v1 to v2.** A `drwn machine migrate` command (or automatic migration in `ensureStoreInitialized`) converts the v1 `capabilities: { profile, skills, mcpServers }` to v2 `capabilities: { activeWorker, workerLock }` by composing a default blueprint from the existing profile + explicit skills. This preserves the user's current capability set during the transition.

4. **The `darwinian-worker-skills` bundle.** Today the README instructs `drwn machine skill install <bundle>` + `drwn machine skill enable <id>` one-by-one. With the machine blueprint, this becomes `drwn use --root <blueprint-containing-the-bundle>`. The README + the `manage-defaults` skill need updating.

## 13. The mental model comparison

**Current** (machine scope): "Enable individual skills one-by-one. The profile gives you 8 hardcoded operator skills. Everything else is bare IDs with no version tracking. No hooks, no instructions at machine scope."

**Proposed** (machine scope): "Select a Worker Blueprint at machine scope, same as you do at project scope. It composes any cards you want, with full governance (versioned, integrity-verified, consent-gated). `drwn write --root` projects its full closure — skills, hooks, instructions, MCP — into your user-home tool configs. One primitive, one governance model, two scopes."
