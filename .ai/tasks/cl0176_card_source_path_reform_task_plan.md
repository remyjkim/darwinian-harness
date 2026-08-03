# ABOUTME: Approved implementation plan for eliminating ~/.agents/drwn/sources/ in favor of path-addressable card source repositories.
# ABOUTME: Incorporates the 2026-08-03 execution-readiness audit, TDD contract, CI baseline repair, migration safety, and cross-repository documentation work.

# [I176] Card Source Path Reform — Implementation Plan (GATE 2)

> Execute via the plan-execution skill (`executing-plans`) with `test-driven-development`, `incremental-commits`, and `verification-before-completion`.

**Goal:** Make every editable Card source an ordinary path-addressable directory and remove all runtime dependence on `~/.agents/drwn/sources/`.

**Architecture:** One source-input resolver normalizes explicit plain, `file:`, relative, absolute, and `~` paths, or resolves a bare card name through configured catalog collection checkouts. Core authoring APIs accept explicit source directories; the store contains immutable published versions and machine state only. Existing machine policy remains separate from a new strict user-preferences file, with lossless authoring-scope migration.

**Tech Stack:** TypeScript 6, Bun 1.2.21, Clipanion, Zod 4, Node filesystem/path primitives, Bun test, Git-backed immutable Card store.

---

**Status:** Approved for execution 2026-08-03 after readiness amendments.
**Issue:** I176 · **Owner:** Remy K · **Reviewer:** Minseung Lee
**Branch:** `remy/I176-card-source-path-reform`
**Architecture:** `../analyses/cl0176_card_source_path_reform_target_architecture.md`
**PR:** #71
**Downstream:** I177 remains blocked from merge until I176 lands because both touch `machine-config.ts` and `types.ts`.

## Decisions and supersessions

- D7 supersedes the old instruction to land cl0153 sub-PR1 first. Execute I176 now; rewrite cl0153's publish instructions afterward.
- Incremental commits govern. The obsolete “leave all changes uncommitted” instruction is removed.
- `cli/core/user-config.ts` remains the machine-policy/effective-config loader. New preferences live in a separate module.
- The source resolver is asynchronous and returns a validated source record, not a nullable path passed blindly to `existsSync`.
- `card source list` is deprecated with guidance; `doctor` without an argument no longer scans the retired store directory.
- No blanket deletion of the operator's real `~/.agents/drwn/sources/` occurs in this issue. Migration is inventory-driven and deletion requires separate confirmation.
- `darwinian-cards` is a collection checkout containing independent Card source repositories under `cards/`.
- Manual CLI probes always use a disposable `AGENTS_DIR`.

## Target contracts

### Source input

Create `cli/core/card-source-input.ts` with a single public resolver:

```ts
export interface ResolvedCardSource {
  sourceDir: string;
  manifest: CardManifest;
  resolution: "explicit" | "catalog";
}

export async function resolveCardSourceInput(options: {
  input?: string;
  from?: string;
  agentsDir: string;
  homeDir: string;
  cwd: string;
}): Promise<ResolvedCardSource>;
```

Rules:

1. `from` is an explicit path and wins only when `input` is absent or matches the resolved manifest name.
2. Plain paths, `file:` paths, relative paths, absolute paths, and `~` paths normalize to a real directory containing `card.json`.
3. A non-path card name searches every configured catalog checkout's immediate `cards/*/card.json` entries by manifest `name`.
4. Zero catalog matches fail with `--from`/`drwn config set catalogCheckouts` guidance.
5. Multiple matches fail as ambiguous and list the matching directories.
6. `card.json.name` is authoritative; optional positional names must match it.

### User preferences

Create `cli/core/user-preferences.ts` with strict schema identity:

```ts
{
  schema: "drwn.user-preferences",
  schemaVersion: 1,
  catalogCheckouts: string[],
  defaultAuthorScope?: string
}
```

The reader ignores the retired prototype `{ version: 1, ... }` shape, validates unknown keys strictly, and expands checkout paths only at use time. A first read/write migrates legacy `machine.json policy.authoring.scope` by writing preferences successfully before removing the legacy field. The migration is idempotent and covered by failure-order tests.

### CLI grammar

- `drwn card publish [name] --from <path>`
- `drwn worker publish [name] --from <path>`
- `drwn card release [name] --from <path>`
- `drwn card source <command> <path-or-name>`
- `drwn card new <name> [--into <directory>]` creates `<directory>/<basename>`; default directory is command `cwd`.
- `drwn worker new` follows the same destination contract.
- `drwn config get catalogCheckouts|defaultAuthorScope`
- `drwn config set catalogCheckouts <json-array>`
- `drwn config set defaultAuthorScope <@scope>`

## Testing strategy (TDD contract)

### Behaviors & invariants

- Every new public behavior begins with a failing test observed under Bun 1.2.21.
- Explicit paths never depend on the machine store's `sources/` directory.
- Bare-name resolution is deterministic, validates manifests, and fails on ambiguity.
- Publishing derives identity from `card.json` and retains immutable store/tag semantics.
- Existing machine policy remains effective; preference migration never loses authoring scope.
- Store initialization never creates `sources/`.
- No automated test or manual probe touches the real machine store.
- Existing tracked-suite count never decreases without an explicit documented deletion rationale.

### Layer ownership (unit / integration / smoke / E2E)

- **Unit:** preference schema/migration, path classification/normalization, catalog matching, ambiguity and error messages.
- **Integration:** core source mutation, publish, release, diagnostics, store initialization, capture/default flows.
- **CLI:** command grammar, config get/set, new/publish/release, all source subcommands, Worker equivalents.
- **Scenario/E2E:** author → mutate → publish → consume; catalog-name publish; mind checkpoint source resolution; no `sources/` recreation.
- **Manual smoke:** disposable-store commands listed in Phase 7.

### TDD sequence (ordered red → green increments)

1. Legacy-wrapper CI regression.
2. Preference schema/read/write and authoring-scope migration.
3. Explicit path normalization and manifest validation.
4. Catalog name resolution, not-found, and ambiguity.
5. Core read/mutate/create/publish APIs.
6. Store initialization and diagnostics contract.
7. Publish/release/new CLI grammar and Worker equivalents.
8. Source subcommands, fork/link, capture/defaults, and checkpoint resolution.
9. Shared fixture migration followed by semantic audit of remaining tests.
10. Documentation contract and manual smoke probes.

For every increment: write one failing test, run it and record the expected failure, implement the minimum behavior, rerun the focused test, refactor only while green, then run the affected subsystem tests before committing.

### Case catalog

- Explicit relative, absolute, `file:`, and `~` source paths.
- Missing path, non-directory path, missing/invalid `card.json`, and manifest-name mismatch.
- Bare-name success, no configured checkout, missing card, duplicate manifests, malformed checkout entry.
- Optional name only, `--from` only, matching name plus `--from`, mismatching name plus `--from`, and neither.
- Existing preference file, missing file, retired prototype file, invalid strict file, legacy authoring scope migration, interrupted migration retry.
- Card and Worker new destinations; capture/from-defaults destinations.
- Source show/doctor/set/sync/add/remove operations on explicit and catalog-resolved sources.
- Release dry-run and publish path.
- Checkpoint project override, catalog fallback, and changed content with no source.
- Store initialization/seed/doctor with legacy `sources/` present and absent.

### Harness, fixtures & test data

- Update `test/helpers.ts` so helpers create sources under each fixture's temp root, never under `<agentsDir>/drwn/sources`.
- Preserve fixture `AGENTS_DIR`, `AGENTS_HOME_DIR`, and `AGENTS_REPO_ROOT` isolation.
- Use independent temporary catalog collection directories whose `cards/*` entries contain test manifests.
- Keep the parked untracked scenario file out of commits and tracked-suite counts.

### Commands & environment

```bash
git submodule update --init darwinian-worker-skills
bun install --frozen-lockfile
bunx bun@1.2.21 run typecheck
bunx bun@1.2.21 test --timeout 30000 <focused-test-files>
bunx bun@1.2.21 run verify:release
bunx bun@1.2.21 test --timeout 30000 ./test/
```

Manual commands use a fresh `mktemp -d` path assigned to `AGENTS_DIR`; never use `/tmp/drwn-i176-scratch` without first ensuring it is a newly created directory.

### Required CI jobs / definition of green

- Ubuntu Validate passes the full suite with zero failures under Bun 1.2.21.
- Windows Validate passes.
- Command bridge passes on Ubuntu, macOS, and Windows.
- Linux secret-tool backend passes.
- Typecheck and `verify:release` exit zero.
- Tracked test-suite count is at least the repaired baseline and any count change is explained in the PR.

### Non-goals, manual checks & residual risk

- No deletion of the real operator source store.
- No I177 machine-scope implementation.
- No redesign of `sourceOverrides`; it remains the project-local first checkpoint lookup.
- Cross-repository documentation commits may require their own PRs and cannot be hidden inside the parent repository commit.
- Residual risk centers on legacy source inventory and external consumers; pre-launch status permits the CLI break, but migration guidance remains mandatory.

## Execution phases

### Phase 0 — Establish a trustworthy baseline

- [x] Create the prescribed global worktree and initialize `darwinian-worker-skills`.
- [x] Run typecheck and the full tracked suite under Bun 1.2.21.
- [x] Reproduce the inherited Ubuntu-equivalent legacy-wrapper failure.
- [x] Add a RED regression proving explicit `repoRoot` must also drive project discovery.
- [x] Fix `sync-mcp.ts`, rerun compatibility + journey tests, and commit separately.
- [ ] Rerun the full tracked suite after the fix and record the new floor.

### Phase 1 — Preferences and unified source resolution

1. RED: add `test/core-user-preferences.test.ts` for strict read/write/defaults and migration ordering.
2. GREEN: create `cli/core/user-preferences.ts`; preserve all exports in `cli/core/user-config.ts`.
3. RED: extend release-readiness tests to define the approved preference path rather than rejecting `resolveUserConfigPath` categorically.
4. GREEN: update `scripts/verify-release-readiness.ts` narrowly for the strict preference schema.
5. RED: add `test/core-card-source-input.test.ts` for every source-input and catalog case.
6. GREEN: create `cli/core/card-source-input.ts` using `expandHomePath` and manifest validation.
7. RED/GREEN: add `drwn config` command tests, implement `cli/commands/config.ts`, and register it in `cli/index.ts`.
8. Commit preferences/config and source resolution as separate logical increments.

### Phase 2 — Explicit-path core APIs and store contract

1. RED/GREEN: change `readCardSourceState` and `readSourceManifestForMutation` to accept `sourceDir`; convert every public mutation wrapper option from `{ agentsDir, cardName }` to `{ sourceDir }`.
2. RED/GREEN: convert `createCardSource`, `readCardSourceManifest`, and `publishCard` to explicit directories with manifest-authoritative identity.
3. RED/GREEN: convert `syncCardSource`, `checkCardSourceUpstream`, `doctorCardSource`, and `runRelease`.
4. RED/GREEN: remove source creation from `ensureStoreInitialized`; replace diagnostics `sourceCount` with `legacySourceCount` or a migration note, including its type and tests.
5. Decide with tests whether `store-seed.ts` retains `sources` only as legacy non-empty detection. It must never create or require the directory.
6. Convert or remove `removeCardSourceForTests`.
7. Delete `resolveSourcesRoot` and `resolveCardSourceDir` only after `rg` proves no production consumers remain.
8. Commit by vertical core behavior, keeping tests with implementation.

### Phase 3 — Command conversion

1. RED/GREEN: `card publish`, `worker publish`, and `card release` optional-name/`--from` grammar.
2. RED/GREEN: `card new`, `worker new`, `card-capture`, and `card-from-defaults` explicit destinations and updated next-step output.
3. RED/GREEN: `worker compose` explicit source directory.
4. RED/GREEN: all 15 `card source/*` commands; deprecate `source list`, require an input for `doctor`, and retain JSON/human output contracts.
5. RED/GREEN: convert `card fork` and remove the dead source-root comparison from `card link`.
6. RED/GREEN: checkpoint resolution order = project `sourceOverrides`, then catalog checkouts; preserve `MIND_CHECKPOINT_NO_SOURCE` for changed unmapped content.
7. Update help-shape and runtime-command-guidance tests with every grammar change.
8. Commit command families separately to keep reviewable diffs.

### Phase 4 — Regression convergence

1. Change `publishCardWithSkills` and `publishExactOperatorProfile` in `test/helpers.ts` to fixture-local source directories and path-based publish.
2. Rewrite the canonical source model in `test/core-card-source.test.ts`.
3. Convert direct resolver users such as `test/core-card-capture.test.ts` and `test/core-card-store-git.test.ts`.
4. Semantically audit all candidate tests found by:

   ```bash
   rg -l 'resolveCardSourceDir|resolveSourcesRoot|"sources"|/sources/' test --glob '*.ts'
   ```

   Preserve intentional legacy/migration assertions; replace only assumptions that editable sources live in the store.
5. Run subsystem groups after each conversion and the full suite before leaving the phase.

### Phase 5 — Documentation and canonical skill sources

Update in this repository:

- `docs/cli-quickref.md`
- `INSTALL.md`
- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/09_cards-manual-test-guide.md`
- `.ai/knowledges/10_drwn-cli-architecture.md`
- `.ai/knowledges/11_card-usage-guide.html` when applicable
- `docs/prelaunch-project-reset.md`
- active plans/runbooks that prescribe sync-then-publish, including cl0153

Update canonical external sources without overwriting unrelated dirty work:

- `darwinian-worker-skills/skills/author-card/SKILL.md` in its own repository, then update the submodule pointer deliberately.
- `/Users/pureicis/dev/darwinian-cards/cards/workflow-skills/docs/maintenance-runbook.md` in the workflow-skills source repository. The `darwinian-cards` collection already has unrelated staged changes; preserve them and commit inside the card repository, not the collection root.
- `/Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/.ai/knowledges/05_card_version_bump_guide.md`.
- `/Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/.ai/knowledges/02_drwn_lab_operations.md`.
- Locate the authoritative source for installed `author-mind-card`; do not edit `~/.agents/skills/author-mind-card` as if it were canonical. Record a follow-up if its source repository is unavailable.

### Phase 6 — Legacy migration and cleanup behavior

1. Add a read-only legacy-source inventory function/report with tests.
2. Confirm no normal command recreates `sources/`.
3. Run the inventory against a disposable store containing representative registered, unregistered, and deferred sources.
4. Produce guidance classifying canonical collection sources versus unresolved legacy sources.
5. Do not delete the real machine store in this issue. If deletion is later requested, re-inventory and ask for explicit confirmation with the exact target path.

### Phase 7 — Final verification

```bash
git submodule update --init darwinian-worker-skills
bun install --frozen-lockfile
bunx bun@1.2.21 run typecheck
bunx bun@1.2.21 run verify:release
bunx bun@1.2.21 test --timeout 30000 ./test/
```

With a newly created disposable store:

```bash
scratch_dir=$(mktemp -d)
AGENTS_DIR="$scratch_dir/.agents" bunx bun@1.2.21 run drwn -- card new @test/temp-card
AGENTS_DIR="$scratch_dir/.agents" bunx bun@1.2.21 run drwn -- card publish --from ./temp-card
AGENTS_DIR="$scratch_dir/.agents" bunx bun@1.2.21 run drwn -- card source doctor ./temp-card
AGENTS_DIR="$scratch_dir/.agents" bunx bun@1.2.21 run drwn -- config set catalogCheckouts '["/path/to/catalog"]'
AGENTS_DIR="$scratch_dir/.agents" bunx bun@1.2.21 run drwn -- card publish @curation-labs/workflow-skills
```

Verify no `sources/` directory was created. Remove only the disposable scratch directory after validating its resolved path.

### Phase 8 — Review, PR, and workflow state

1. Request code review against the amended architecture and this plan; fix every Critical/Important finding.
2. Update PR #71 from docs-only to implementation scope, including breaking-change and migration disclosure.
3. Add mandatory `Testing & CI evidence`: plan→test map, RED/GREEN tests, exact rerun commands, CI interpretation, and residual risk.
4. Push the branch and wait for all required checks.
5. Record G3 Review in the tracker through the complete property + Issue Status table + Issue Thread transaction.
6. Draft the Slack alert for Remy; do not send it.
7. Do not merge until ordered G1→G2→G3 workflow evidence is complete.

## Success criteria

- No production import or call of `resolveSourcesRoot` or `resolveCardSourceDir` remains.
- Store initialization and every supported command work without creating `sources/`.
- Card source mutation, publish, release, Worker authoring, capture, and checkpoint use explicit or catalog-resolved source directories.
- Preference migration preserves existing authoring scope and passes release readiness.
- All supported path forms and ambiguity/error cases are tested.
- Repository and canonical external documentation teach the path-addressable model.
- Typecheck, release readiness, full local suite, and all required CI jobs pass under the pinned toolchain.
- The real machine-global store remains unchanged unless a separately confirmed migration is performed.
