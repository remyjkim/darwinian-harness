# ABOUTME: Execution plan for the I177 pre-launch hard cut to machine-scope Worker Blueprint V2.
# ABOUTME: Orders documentation before implementation and every behavior change as a RED-GREEN-REFACTOR slice.

# [I177] Machine-Scope Worker Blueprint — Task Plan (GATE 2)

> **For the implementation owner:** Execute this plan incrementally on `remy/I177-machine-scope-blueprint`. For every production behavior, demonstrate RED before GREEN, keep commits atomic, and record exact commands and results in the completion document.

**Status**: Building; documentation, baseline, G1, and G2 gates complete (2026-08-03)

**Issue**: [I177] · **Owner**: Remy K · **Reviewer**: Minseung Lee

**Architecture**: [`../analyses/cl0177_machine_scope_blueprint_target_architecture.md`](../analyses/cl0177_machine_scope_blueprint_target_architecture.md)

**Prerequisite**: [I176] merged at `1fc03e6`; post-merge CI `30848589215` passed all six jobs.

**Compatibility**: Hard cut. Accept only `drwn.machine` V2; reject V1/prototypes without migration or dual read.

**Toolchain**: Bun `1.2.21`, TypeScript, Clipanion, Zod, filesystem-backed integration tests, GitHub Actions.

**Card collection**: `/Users/pureicis/dev/darwinian-cards/cards/` (one source repository per Card).

**Lab repository**: `/Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/`.

## Goal

Replace machine profile and flat skill/MCP activation with one selected, immutable Worker Blueprint closure. Machine selection, consent, effective-state derivation, projection, diagnostics, and release checks must use that closure exclusively. Existing V1 state fails closed with controlled-reset guidance.

## Non-negotiable decisions

1. Patch and verify all affected documentation before production code.
2. Do not migrate V1, infer Card provenance, dual read, or preserve legacy enable/disable behavior.
3. `activeWorker` stores a canonical root name. The embedded lock root stores the requested versioned source.
4. Runtime Card resolution uses immutable Store content, pinned Git refs, or explicit integrity-locked file refs, never mutable `catalogCheckouts`.
5. `config.json` owns authoring preferences independently; remove the `machine.policy.authoring` bridge.
6. Machine effective capabilities derive only from the active verified closure.
7. Project and machine projection remain exclusive.
8. Manual verification uses disposable roots only; never write to the operator's real home.

## Testing strategy

### Behaviors to prove

- strict V2 parse/serialize and actionable, non-mutating V1 rejection;
- independent user preferences with no authoring compatibility mutation;
- recommended Blueprint descriptor integrity and fresh-init selection/decline behavior;
- machine `apply`, `use`, `--none`, alternative-root retention, lock validation, and atomicity;
- range-authorized consent preservation/re-grant/drop behavior shared with project mutations;
- active-closure-only effective state with content re-hashing;
- skills, MCP, generated Worker, hooks, and instruction adapters at machine scope;
- first-write foreign-content refusal, drift refusal, force, cleanup, target/mode filters, and preflight atomicity;
- root-scope consent replay even when invoked inside a project;
- legacy activation commands fail nonzero while inventory commands remain supported;
- V2 capture-from-defaults, inventory references, diagnostics, status, and release readiness;
- unchanged project-scope behavior.

### Test tiers

| Tier | Purpose | Representative files |
|---|---|---|
| Unit | schema, lock invariants, descriptor parsing, pure selection/consent rules | `test/core-machine-config.test.ts`, `test/core-machine-worker-lock.test.ts`, `test/core-user-preferences.test.ts` |
| Integration | CLI transactions and filesystem projection under isolated roots | `test/commands-init.test.ts`, `test/scenarios-root-scope.test.ts`, `test/commands-write-*.test.ts` |
| End-to-end | one published fixture Blueprint through apply/trust/write/status | `test/e2e-machine-blueprint.test.ts` |
| Contract/release | prevent V1/docs/profile regressions in the shipped package | `test/scripts-verify-machine-contract.test.ts`, `test/scripts-verify-operator-contract.test.ts`, `test/release-readiness.test.ts` |
| Manual | operator-shaped acceptance with disposable `HOME` and `AGENTS_DIR` | `.ai/knowledges/09_cards-manual-test-guide.md` |

### TDD order

For each numbered implementation slice:

1. add or change one externally observable expectation;
2. run the narrowest pinned command and capture the expected failure (RED);
3. implement the minimum behavior;
4. rerun the narrow test to GREEN;
5. run the named regression group;
6. refactor only while that group remains green; and
7. commit the cohesive slice.

Tests must assert bytes, exit codes, state invariants, and preservation behavior—not private helper structure. A test that passes before the intended production change is not valid RED evidence and must be strengthened.

### Case catalog

| Contract | Positive cases | Negative/edge cases |
|---|---|---|
| V2 schema | empty; active canonical root; alternatives retained | V1; prototype; unknown fields; active without lock; root mismatch; unsupported lock version |
| selection | Blueprint Git/Store/file ref; use existing root; apply replacement | mutable checkout not searched; missing root; any plain Card machine root; multiple roots without `--active` |
| integrity | exact locked bytes for every origin | missing Store/Git extraction; changed extraction; changed explicit file source; digest/topology mismatch |
| consent | trust active-closure hooks/instructions; same-content preservation; in-range changed-content re-grant | out-of-range drop; inactive Card trust refusal; root-forced replay; dry-run/non-interactive refusal |
| projection | all surfaces; deterministic order | inactive alternatives; foreign bytes; drift; partial preflight failure; stale cleanup |
| filters | target allowlist; `--skills-only`; `--mcp-only` | excluded instruction/hook surfaces remain untouched |
| hard cut | new guidance and empty init | all V1 readers and four activation commands reject; no state mutation |
| capture/status | active closure flattened/reported | inactive roots, secrets, ambient inventory, and generated bytes excluded |

### Fixtures and isolation

- Build Card fixtures in a per-test temporary directory with exact content digests.
- Set isolated `HOME`, `AGENTS_DIR`, project root, and target directories before importing CLI modules that read environment state.
- Use local file/Git fixtures; unit and integration tests make no network calls.
- Create foreign and drifted files deliberately and assert original unrelated bytes survive.
- Use a fixture Blueprint root plus plain Card members; nested Blueprints remain out of scope.
- Reset environment variables and process CWD in `finally` blocks.
- Do not reuse the operator's actual machine Store, preferences, credentials, or harness files.

### Canonical commands

Install and baseline with the pinned package-manager version:

```sh
git submodule update --init darwinian-worker-skills
bunx bun@1.2.21 install --frozen-lockfile
bunx bun@1.2.21 test --timeout 30000 ./test/
```

Focused examples appear in each task. Final local gates are:

```sh
bunx bun@1.2.21 run typecheck
bunx bun@1.2.21 test --timeout 30000 ./test/
QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release
```

The full suite must report zero failures. Platform-specific skips are recorded, not silently ignored. After push, every required GitHub Actions job must pass at the tested commit.

## Execution sequence

### Task 0 — Documentation and contract gate (must finish before production code)

**Files**

- Modify: `.ai/analyses/cl0177_machine_scope_blueprint_target_architecture.md`
- Modify: `.ai/tasks/cl0177_machine_scope_blueprint_task_plan.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Modify: `.ai/knowledges/09_cards-manual-test-guide.md`
- Modify: `.ai/knowledges/10_drwn-cli-architecture.md`
- Modify: `.ai/knowledges/11_card-usage-guide.html`
- Modify: `README.md`
- Modify: `INSTALL.md`
- Modify: `docs/cli-quickref.md`
- Modify: `docs/contracts/project-worker-v1.md`
- Modify: `docs-astro/src/content/docs/02-how-apply-works.md`
- Modify: `docs-astro/src/content/docs/03-cli-reference.md`
- Modify: `docs-astro/src/content/docs/04-mcp-registry.md`
- Modify: `docs-astro/src/content/docs/05-skill-library.md`
- Modify: `docs-astro/src/content/docs/10-mind-cards.md`
- Modify: affected `docs-docusaurus/docs/` machine, Card, selection, projection, diagnostics, and troubleshooting pages found by the stale-contract scan
- Modify: `darwinian-worker-skills/README.md`
- Modify: `darwinian-worker-skills/skills/manage-machine-capabilities/SKILL.md`

**Steps**

1. Rewrite G1 and G2 around the approved hard cut and the post-I176 codebase.
2. Replace profile/explicit-activation guidance in every affected operator document.
3. Keep standalone inventory, authoring checkout, project Worker, secret, and transfer boundaries explicit.
4. Update the machine manual test to use a disposable Blueprint closure and user-home adapters.
5. Search for stale active guidance:

```sh
rg -n 'schemaVersion.?1|capabilities\.(profile|skills|mcpServers)|machine (skill|mcp) (enable|disable)|Recommended Darwinian Operator profile|policy\.authoring' README.md docs .ai/knowledges darwinian-worker-skills
```

6. Classify any remaining matches as history, explicit rejection, project schema, or defects. Fix defects.
7. Inspect Markdown/HTML links and run documentation/release static checks available before implementation.
8. Version the changed public Operator payload independently as `2.0.2`, set
   `harness.minVersion` to the planned `drwn` `1.1.0` floor, and omit
   `lastValidatedWith` until the implementation is actually verified.
9. Commit the parent documentation and the worker-skills documentation as separate atomic commits. Publish the versioned submodule change on an issue branch, but defer the parent gitlink/integrity pin, immutable tag, and `lastValidatedWith` claim until the I177 CLI contract can validate that new Operator release.

**Acceptance**: all named docs describe V2 consistently; no production `.ts` file changed; Docusaurus/HTML/Markdown and submodule identity checks pass. Forward-looking docs are expected to make the current V1 static docs/release assertions RED; record those exact expected failures rather than weakening them before implementation.

**Commit subjects**

- `[docs] define I177 machine Blueprint hard cut`
- submodule: `[docs] update machine capability workflow for blueprints`
- `[docs] document machine Blueprint V2 contract`

### Task 1 — Establish the verified baseline and pass G1/G2

**Files**

- Update after evidence: `.ai/tasks/cl0177_machine_scope_blueprint_task_plan.md`

**Steps**

1. Create/use a clean isolated checkout at merged prerequisite commit `1fc03e6` and run the pinned full suite there. This is the code baseline, unaffected by forward-looking I177 docs.
2. Record pass/fail/assertion/skip totals, Bun version, commit, and platform.
3. On the I177 docs commit, run the focused docs/release contract tests and record the expected RED assertions that still enforce V1. Any unrelated failure is a blocker; do not update verifier code before its Task 8 RED slice.
4. Audit G1 against the hard-cut architecture and resolve every significant finding.
5. Push the corrected docs branch, update the PR, and repair the Issue Tracker's stale migration-era Details/status/thread before requesting review.
6. Record the atomic G1 review transaction and Owner acknowledgement in the Issue Tracker.
7. Audit this plan for exact paths, executable commands, complete TDD cases, risk coverage, and doc-first sequencing.
8. Record the atomic G2 review transaction and Owner acknowledgement into Building.

**Acceptance**: clean pinned baseline at `1fc03e6`; only catalogued V1 static-contract REDs on the forward docs commit; G1 Passed; G2 Passed; Owner Building; documentation still precedes production code.

**Commit**: `[docs] record I177 design gate evidence` only if repository evidence changes.

#### Executed baseline evidence — 2026-08-03

- Clean detached worktree at
  `1fc03e6910a8e2a391a9dd4d53a2ec9513d27c1d`, including submodule
  `cdffddd3972592784287d28db42a36cb58623b79`.
- macOS `15.6.1` (`24G90`), Apple Silicon (`arm64`), Bun `1.2.21`.
- `bunx bun@1.2.21 install --frozen-lockfile`: passed.
- `bunx bun@1.2.21 test ./test/`: `1,808` passed, `0` failed,
  `6` intentionally skipped, `8,340` assertions across `306` files.
- `bunx bun@1.2.21 run typecheck`: passed.
- `QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release`: all
  fourteen release checks passed.

On forward documentation commit `47d1c6c`, the focused static suite reported
`23` passed, `5` failed, and `134` assertions. Every failure is an expected V1
guard that Task 8 replaces: two documentation assertions require the retired
enable/disable and pinned-profile text, one machine-contract assertion requires
the same retired text, and two release-JSON assertions cascade from that single
machine-contract failure. Direct release readiness likewise passes thirteen
checks and fails only `machine capability contract` for the retired
`Recommended Darwinian Operator` / `drwn machine mcp enable` expectations. No
runtime or unrelated regression appeared.

### Task 2 — Publish the recommended machine-defaults Card source

**Files**

- Create repository: `/Users/pureicis/dev/darwinian-cards/cards/machine-defaults/card.json`
- Create as required: `/Users/pureicis/dev/darwinian-cards/cards/machine-defaults/instructions.md`
- Create/modify: `registry/machine-workers.json`
- Create: `cli/core/machine-worker-contract.ts`
- Create: `test/core-machine-worker-contract.test.ts`
- Modify: `test/release-readiness.test.ts`

**RED**

Add contract tests that require a versioned recommended descriptor, canonical Blueprint name, exact immutable source ref, compatible CLI floor, and a real released source whose closure resolves. Confirm failure because the descriptor/contract does not exist.

```sh
bunx bun@1.2.21 test --timeout 30000 test/core-machine-worker-contract.test.ts test/release-readiness.test.ts
```

**GREEN**

1. Verify the current immutable release refs for intended member Cards.
2. Create the bootstrap `v1.0.0` source with `drwn worker new` and compose only
   valid plain Card releases. This breaks the descriptor/resolver circular
   dependency but is not the G3 release candidate.
3. Initialize/verify its independent Git repository, commit the source, configure its dedicated remote, push the issue/default branch, create and push immutable tag `v1.0.0`, then validate the tag/ref from a clean clone. `drwn worker publish` may populate the local Store but does not substitute for the remote/tag steps.
4. Add the shipped descriptor and minimal validator.
5. Make the contract test resolve the released Blueprint without catalog checkout fallback.

**Regression**

```sh
bunx bun@1.2.21 test --timeout 30000 test/commands-card-release.test.ts test/core-release-pipeline.test.ts test/core-machine-worker-contract.test.ts test/release-readiness.test.ts
```

**Commit**: `[other] register recommended machine defaults worker`

### Task 3 — Enforce strict machine V2 and preference independence

**Files**

- Modify: `cli/core/types.ts`
- Modify: `cli/core/machine-config.ts`
- Modify: `cli/core/user-preferences.ts`
- Modify: `test/core-machine-config.test.ts`
- Modify: `test/core-user-preferences.test.ts`
- Modify: `test/core-project-machine-isolation.test.ts`

**RED 3.1 — schema**

Add cases for empty V2, active/lock invariants, unknown V1 fields, V1 rejection text, prototype rejection, and unsupported embedded lock versions. Confirm the V2 fixture is rejected and V1 still parses.

```sh
bunx bun@1.2.21 test --timeout 30000 test/core-machine-config.test.ts
```

**GREEN 3.1**

Replace V1 types/schema with strict V2, validate the embedded lock via the existing lock validator, and emit controlled-reset guidance without mutating invalid files. Delete migration helpers.

**RED 3.2 — preferences**

Assert `config.json.defaultAuthorScope` loads and persists independently and an old `machine.policy.authoring` file is rejected unchanged. Confirm the old bridge mutates or accepts the fixture.

**GREEN 3.2**

Remove the authoring compatibility bridge from `user-preferences.ts` and all V1 machine authoring types.

**Regression**

```sh
bunx bun@1.2.21 test --timeout 30000 test/core-machine-config.test.ts test/core-user-preferences.test.ts test/core-project-machine-isolation.test.ts test/commands-init.test.ts
bunx bun@1.2.21 run typecheck
```

**Commit**: `[other] hard cut machine configuration to v2`

### Task 4 — Add scope-aware machine Worker mutation and guided init

**Files**

- Modify: `cli/core/worker-project.ts`
- Create or modify: `cli/core/worker-machine.ts`
- Modify: `cli/commands/card/project-command.ts`
- Modify: `cli/commands/project/apply.ts`
- Modify: `cli/commands/use.ts`
- Modify: `cli/commands/init.ts`
- Remove or repurpose: `cli/core/machine-profiles.ts`
- Modify: `test/commands-use-worker.test.ts`
- Modify: `test/scenarios-root-scope.test.ts`
- Modify: `test/commands-init.test.ts`
- Replace: `test/core-machine-profiles.test.ts`
- Create: `test/core-machine-worker-lock.test.ts`

**RED 4.1 — mutations**

Test `apply --root`, `use --root`, canonical selection, requested ref retention, alternative-root retention, `--active`, both `--none` forms, plain-Card root rejection, mutation atomicity, apply's unchanged opt-in `--write`, use's unchanged default projection/`--no-write`, projection failure after committed intent, dry-run zero mutation, and unsupported `store.minDrwnVersion` refusal before commit. Confirm current root-scoped apply is rejected or writes V1.

```sh
bunx bun@1.2.21 test --timeout 30000 test/core-machine-worker-lock.test.ts test/commands-use-worker.test.ts test/scenarios-root-scope.test.ts
```

**GREEN 4.1**

Extract safe shared Card graph/lock logic, implement `worker-machine.ts` through `mutateMachineConfig`, plumb root scope through commands, and validate the final lock before write.

**RED 4.2 — consent carry-forward**

Add same-content preservation, changed-content within-range re-grant, out-of-range drop, removed contribution, and Card disappearance cases. Confirm timestamps/digests/warnings match the shared project behavior.

**GREEN 4.2**

Reuse `carryCardConsent` so machine and project range-authorized behavior cannot diverge.

**RED 4.3 — init**

Test guided accept/decline, non-interactive empty state, unavailable descriptor, invalid pre-existing V1, and no mutation on failure.

**GREEN 4.3**

Replace profile initialization with descriptor-driven Blueprint initialization. Never read mutable catalog checkouts during resolution.

**Regression**

```sh
bunx bun@1.2.21 test --timeout 30000 test/commands-init.test.ts test/commands-init-default-catalog.test.ts test/commands-project-workers.test.ts test/commands-use-worker.test.ts test/scenarios-root-scope.test.ts test/core-machine-worker-lock.test.ts
```

**Commit**: `[other] add root-scoped worker selection`

### Task 5 — Derive machine effective state from the verified active closure

**Files**

- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/defaults.ts`
- Create or modify: `test/core-effective-state-machine-worker.test.ts`
- Modify: `test/core-effective-state.test.ts`
- Modify: `test/core-effective-state-worker.test.ts`
- Modify: `test/core-defaults.test.ts`

**RED 5.1 — closure**

Test active root reconstruction, deterministic Card order, closure-derived skills/MCP/hooks/instructions, inactive alternative exclusion, null selection, and project exclusivity. Confirm machine state still comes from V1 arrays.

**RED 5.2 — integrity**

Test missing Store/Git bytes, modified extracted content, a changed explicit file-origin source path, root mismatch, unsupported lock/version floor, plain-Card machine root, and nested Blueprint rejection. Confirm at least one corrupted closure reaches planning.

```sh
bunx bun@1.2.21 test --timeout 30000 test/core-effective-state-machine-worker.test.ts test/core-effective-state.test.ts test/core-effective-state-worker.test.ts test/core-defaults.test.ts
```

**GREEN**

Add the machine-selection branch, validate and re-hash lock content, populate the existing active-Card pipeline, and remove V1 inventory-ID capability derivation.

**Regression**

```sh
bunx bun@1.2.21 test --timeout 30000 test/core-effective-state-machine-worker.test.ts test/core-effective-state.test.ts test/core-effective-state-worker.test.ts test/core-effective-state-overlay.test.ts test/core-project-machine-isolation.test.ts test/core-defaults.test.ts
```

**Commit**: `[other] derive machine state from active worker closure`

### Task 6 — Project every machine closure surface safely

**Files**

- Modify: `cli/core/sync.ts`
- Modify: `cli/core/sync-project-instructions.ts`
- Modify: `cli/core/sync-instructions.ts`
- Modify: `cli/core/hook-generator/sync-hooks.ts`
- Reuse: `cli/core/worker-generator/sync-worker.ts`
- Modify: `test/core-sync-worker.test.ts`
- Modify: `test/core-sync-instructions.test.ts`
- Modify: `test/commands-write-instructions.test.ts`
- Modify: `test/core-mcp-sync.test.ts`
- Modify: `test/core-mcp-merge-hooks.test.ts`
- Modify: `test/commands-write-committed-surfaces.test.ts`
- Create: `test/core-machine-instructions.test.ts`
- Create: `test/e2e-machine-blueprint.test.ts`

**RED 6.1 — preflight**

Assert the planned machine path set includes closure skills, MCP targets, generated Worker/hooks, Claude/Codex instruction adapters, and hook/settings targets before any write. Test first-write foreign files and one late conflict causing zero writes.

**GREEN 6.1**

Expand `planMachineManagedPaths` and keep all ownership checks ahead of mutation.

**RED 6.2 — Worker, skill, MCP**

Assert the active closure generates one aggregate Worker, deterministic skill/MCP output, no inactive alternatives, and correct `--skills-only`/`--mcp-only` behavior.

**GREEN 6.2**

Lift the project-only Worker gate and feed closure-derived Card order to existing synchronizers.

**RED 6.3 — instructions**

Assert managed blocks at `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`, never `~/AGENTS.md`; test foreign-byte preservation, drift, force, cleanup, target filters, and mode filters.

**GREEN 6.3**

Make instruction sync scope-aware and reuse managed-block primitives.

**RED 6.4 — hooks**

Assert consented hooks update managed fields in `~/.claude/settings.json` while unrelated keys survive; cover update, drift, force, cleanup, and unsupported targets.

**GREEN 6.4**

Enable machine closure hook inputs through current user-scope routing; do not add new target encoders.

**Focused command**

```sh
bunx bun@1.2.21 test --timeout 30000 test/core-sync-worker.test.ts test/core-sync-instructions.test.ts test/core-machine-instructions.test.ts test/commands-write-instructions.test.ts test/core-mcp-sync.test.ts test/core-mcp-merge-hooks.test.ts test/commands-write-committed-surfaces.test.ts test/e2e-machine-blueprint.test.ts
```

**Regression**

```sh
bunx bun@1.2.21 test --timeout 30000 test/commands-write.test.ts test/commands-write-drift.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-codex-conflict.test.ts test/commands-write-cursor-conflict.test.ts test/core-write-record-managed-content.test.ts test/core-write-idempotent.test.ts
```

**Commit**: `[other] project machine worker closure safely`

### Task 7 — Extend Card consent to machine scope

**Files**

- Modify: `cli/commands/card/trust.ts`
- Modify: `cli/commands/card/untrust.ts`
- Modify: `cli/commands/write.ts`
- Modify: `cli/core/worker-machine.ts`
- Modify: `test/commands-card-trust.test.ts`
- Modify: `test/core-hook-consent.test.ts`
- Modify: `test/core-instruction-consent.test.ts`
- Modify: `test/core-instruction-consent-ack.test.ts`
- Modify: `test/commands-write-version-floor.test.ts`
- Modify: `test/scenarios-root-scope.test.ts`

**RED 7.1 — trust/untrust**

Test machine hook/instruction trust, canonical Card lookup, digest recording, untrust, inactive Card refusal (while preserving consent recorded when previously active), dry-run/non-interactive behavior, and lock version floors.

**RED 7.2 — replay**

Run `write --root` from inside a project and assert machine consent replay occurs. Confirm the current `if (!(this.root || this.user))` branch skips it.

```sh
bunx bun@1.2.21 test --timeout 30000 test/commands-card-trust.test.ts test/core-hook-consent.test.ts test/core-instruction-consent.test.ts test/core-instruction-consent-ack.test.ts test/commands-write-version-floor.test.ts test/scenarios-root-scope.test.ts
```

**GREEN**

Add a typed machine consent scope, persist through the machine lock transaction, replay for every machine write entry path, and keep prompts outside dry-run/non-interactive mutation.

**Regression**

```sh
bunx bun@1.2.21 test --timeout 30000 test/core-hook-consent-notice.test.ts test/core-instruction-consent-evidence.test.ts test/commands-write.test.ts test/scenarios-root-scope.test.ts
```

**Commit**: `[other] add machine worker consent`

### Task 8 — Remove remaining V1 consumers and update observable contracts

**Files**

- Modify: `cli/commands/machine/skill.ts`
- Modify: `cli/commands/machine/mcp.ts`
- Modify: `cli/core/card-from-defaults.ts`
- Modify: `cli/core/inventory-references.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify or rename: `cli/core/operator-profile-contract.ts`
- Modify: `scripts/verify-release-readiness.ts`
- Modify: `package.json`
- Modify: `test/commands-machine-skill.test.ts`
- Modify: `test/commands-machine-mcp.test.ts`
- Modify: `test/commands-card-new-from-defaults.test.ts`
- Modify: `test/core-inventory-references.test.ts`
- Modify: `test/core-diagnostics-sections.test.ts`
- Modify: `test/commands-status.test.ts`
- Modify: `test/commands-status-why.test.ts`
- Modify: `test/scripts-verify-machine-contract.test.ts`
- Modify: `test/scripts-verify-operator-contract.test.ts`
- Modify: `test/release-readiness.test.ts`

**RED 8.1 — removed commands**

Assert all four enable/disable commands exit nonzero, do not mutate V2, and name `drwn apply --root`/`drwn use --root`; inventory list/install/update/uninstall/add/remove still operate.

**RED 8.2 — downstream consumers**

Assert `card new --from-defaults` flattens only active closure skills/MCP into a plain Card; references/status/why report V2 roots, closure, integrity, consent, and projection; inactive alternatives, secrets, and ambient inventory are excluded.

**RED 8.3 — release**

Assert the release verifier rejects V1 schema/profile/explicit command docs,
requires CLI version `1.1.0`, and validates the recommended Blueprint plus
canonical Operator Card `2.0.2` contract.

```sh
bunx bun@1.2.21 test --timeout 30000 test/commands-machine-skill.test.ts test/commands-machine-mcp.test.ts test/commands-card-new-from-defaults.test.ts test/core-inventory-references.test.ts test/core-diagnostics-sections.test.ts test/commands-status.test.ts test/commands-status-why.test.ts test/scripts-verify-machine-contract.test.ts test/scripts-verify-operator-contract.test.ts test/release-readiness.test.ts
```

**GREEN**

Remove direct V1 readers, implement V2 capture/diagnostics, preserve inventory-only operations, separate Operator Card release verification from the removed profile activation mechanism, and bump the hard-cut CLI release line to `1.1.0`.

**Regression**

```sh
QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release
bunx bun@1.2.21 run typecheck
```

**Commit**: `[other] remove legacy machine activation model`

### Task 9 — Documentation reconciliation and completion evidence

**Files**

- Revisit every Task 0 document if implementation names or exact outputs changed.
- Create: `.ai/tasks/cl0177_machine_scope_blueprint_completion.md`
- Modify release notes/version metadata required by the release contract.
- Modify the worker-skills Operator manifest/test to set
  `lastValidatedWith: "1.1.0"` only after its complete validation matrix passes.

**Steps**

1. Search code, tests, shipped docs, knowledge docs, and bundled skills for stale V1 activation guidance.
2. Ensure help output and docs match exact implemented flags and error text.
3. Run focused tests for every changed slice.
4. Run typecheck, full pinned suite, and release readiness from a clean worktree.
5. Execute the manual guide using disposable `HOME`, `AGENTS_DIR`, project, and Card collection fixtures.
6. Complete the Operator `2.0.2` release commit only after its payload passes
   against `drwn` `1.1.0`; then create and push the immutable Operator tag, pin
   that accepted submodule commit/integrity in the parent. Publish a new
   immutable `machine-defaults` release whose composition names Operator
   `2.0.2`, workflow-skills, and knowledge-docs; omit personal-harness `v0.1.0`
   because isolated projection proves 12 incompatible duplicate workflow skill
   IDs, whose cleanup remains the separate personal-harness split non-goal.
   Move `registry/machine-workers.json` from the bootstrap to that release and
   rerun release readiness from committed state. G3 must reject a descriptor
   that still names bootstrap `v1.0.0` or the incompatible four-member closure.
7. Push the tested parent commit and require all CI jobs to pass.
8. Request G3 review with a PR body containing `Testing & CI evidence`.
9. Write the completion document with commits, test totals, manual artifacts, remaining non-goals, and rollback/reset guidance.
10. Record the atomic G3 Issue Tracker transaction and Owner acknowledgement only after review evidence exists.

**Final commands**

```sh
git status --short --branch
bunx bun@1.2.21 run typecheck
bunx bun@1.2.21 test --timeout 30000 ./test/
QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release
git diff --check
```

**Acceptance**: zero local failures, required CI green at the exact reviewed commit, disposable-HOME acceptance green, docs match implementation, completion evidence reviewed.

**Commit**: `[docs] complete I177 machine Blueprint rollout`

## Risk controls

| Risk | Control |
|---|---|
| V1 silently accepted by a forgotten consumer | strict parser plus repository-wide release scan and focused consumer tests |
| fabricated/mutable provenance | pinned Store/Git refs, digest-locked explicit file refs re-hashed at evaluation, and no catalog-checkout runtime lookup |
| machine projection overwrites user files | complete preflight, global write record, managed blocks/fields, drift tests, disposable HOME |
| consent exceeds its authorized range | shared same/in-range/out-of-range carry-forward tests, warnings, and write-time replay |
| project regression from shared code | project mutation/effective-state/write regression suites after each shared refactor |
| docs advertise behavior before code lands | docs live on the I177 branch; G3 requires final reconciliation and implementation evidence |
| external Card source is unavailable | contract test resolves the real release; implementation stops before setting it as recommended |

## Explicit non-goals

- backward compatibility, automatic migration, or V1 state repair;
- nested Blueprint closure expansion;
- resolving runtime Cards from mutable catalog checkouts;
- copying credentials or installed tool runtimes into Cards;
- whole-machine backup/restore;
- Cursor/OpenCode user instruction or new hook encoders without proven target contracts;
- personal-harness repository decomposition;
- unrelated skill-directory precedence cleanup.

## Progress ledger

- [x] I176 G3 passed and merged.
- [x] I176 post-merge CI passed all required jobs.
- [x] I177 worktree updated onto merged main with submodule and dependencies present.
- [x] Architecture/code/test/documentation audit completed.
- [x] Hard-cut decision approved by the product owner.
- [x] Task 0 documentation gate verified and committed.
- [x] Fresh pinned I177 baseline recorded.
- [x] G1 passed and acknowledged.
- [x] G2 passed and acknowledged.
- [x] Tasks 2–8 executed through recorded RED-GREEN-REFACTOR slices.
- [ ] Task 9 final verification, G3, and completion evidence finished.
