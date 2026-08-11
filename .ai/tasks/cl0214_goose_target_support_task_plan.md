# ABOUTME: Candidate GATE 2 implementation plan for I214 Goose target support.
# ABOUTME: Sequences source-bound TDD, recoverable project projection, qualification, and non-interference gates.

# I214 Goose Target Support Implementation Plan

> Execute via the plan-execution skill (executing-plans or subagent-driven-development).

**Status:** Candidate GATE 2 plan stacked behind candidate-v5 G1. This artifact is not approved for implementation, is not a G2 submission, and does not authorize production changes until G2 passes and the Owner acknowledges Received into Building.

**Goal:** Deliver first-class, project-only Goose support through a generic projection adapter and optional runtime observer, with complete proposed-state preflight, ordered recoverable commits, whole-image project projection recovery, truthful runtime qualification, and no Pi production scope.

**Architecture:** Keep existing file targets and drwn.write-record@1 intact. Add a strict packaged adapter registry, a pure TargetProjectionAdapterV1 seam, an optional TargetRuntimeObserverV1 seam, and a separate drwn.target-projection-ledger@1; publish every project projection image through one journal-backed executor after complete preflight and independently recoverable upstream commits. A full Goose write invokes the target-neutral canonical AGENTS.md planner, projects shared .agents/skills, and emits the two-file .agents/plugins/drwn MCP unit, while runtime activation and Goose-owned ambient effects remain separately observed.

**Tech Stack:** TypeScript 6, Bun 1.2.21, Clipanion, Zod, Node filesystem primitives, Bun test, isolated temporary project/home/config fixtures, and opt-in Goose 1.45.0 live qualification at source commit db7a704446975c88d3b67490c74d33bcd684404e.

---

## Gate position and execution authority

- AGENTS.md supplies the authoritative CL Issue-driven Workflow v0.4 state contract.
- Planning may be stacked while G1 is under review. A human G1 pass plus Owner acknowledgement into Planning authorizes G2 preparation, not production implementation. Production implementation begins only after a human G2 pass and a separate Owner acknowledgement from Received into Building.
- This plan becomes a G2 submission only after candidate-v5 architecture and source-contract artifacts are frozen, the Owner approves this exact plan hash, and independent T5 execution-readiness review passes.
- Every later Issue Tracker status mutation must update the tracker property, issue-page Issue Status table, and newest-first Issue Thread entry as one authorized transaction.
- T5 is an independent evidence reviewer, not the human Notion Reviewer and not a production author.

## Workflow-rule drift

The worktree does not contain the AGENTS.md-referenced .ai/rules/org-wide/06_issue_workflow.md or repo-wide rule files. The checked-in .ai/rules files describe a stale iMinds/pnpm environment and even claim that GitHub workflows are absent, while this repository is a Bun package with active .github/workflows files.

Execution therefore uses verified repository reality:

- packageManager: bun@1.2.21
- test: bun test ./test/
- test gate: bun test --timeout 30000 ./test/
- typecheck: tsc --noEmit, invoked through bun run typecheck
- release gate: bun run scripts/verify-release-readiness.ts

The executor must record this drift in the G2 packet. Until the missing org prefix table is
restored, use the checked-in safe fallback [other] for production or `.ai` commits, [test] for
tests-only commits, and [docs] only for non-`.ai` documentation-only commits. Do not import pnpm
commands from inherited prose.

## Frozen inputs required before implementation

- Repository base: ea13a582d7797619f2a934a59c34368241cca191 or an explicitly recorded descendant integration SHA.
- Candidate-v5 architecture exact hash.
- Candidate-v5 source-contract exact hash.
- Goose 1.45.0 source identity: clean, untagged HEAD db7a704446975c88d3b67490c74d33bcd684404e. Retain all 1.41.0 binaries, probes, and source observations as historical evidence only.
- Refreshed consent disclosure and effect-contract digest derived from the candidate-v5 source contract.
- Registered adapter ABI and observer vocabulary frozen at C1.
- Whole-image journal, ledger, consent, and lock contracts frozen at C2.
- Baseline test counts recorded after bun install --frozen-lockfile.
- For I238 and I265–I269, an owner-supplied landed SHA or explicit non-overlap disposition, plus
  an I214 overlap/source-delta audit on the combined `main` descendant.

If any frozen schema or audited runtime behavior changes, stop dependent work, amend G1 explicitly, rebase affected lanes, and rerun invalidated review.

## Concurrent-issue integration gate

I238 and I265–I269 are active in other coworkers' lanes. No I214 agent may edit, clean, rebase,
test inside, cherry-pick from, or otherwise mutate those worktrees. A missing local worktree is
not permission to assume that issue is inactive.

The current 19-task path inventory is a candidate against `ea13a582...`. Before G2 freeze, A0
collects the integration-ready landed SHA or explicit non-overlap disposition from each owner,
builds the intended `main` descendant without touching their lanes, and compares every landed
diff with all I214 create/modify/test paths and source assumptions. A path overlap triggers an
ordered integration assignment in the I214 lane; a semantic contract change triggers a G1
amendment. Production begins from the recorded combined descendant only after G2 passes and the
Owner acknowledges Received into Building.

## Target state and success criteria

1. Project config recognizes only registered adapter targets and preserves them through every non-destructive writer; machine policy and Cards remain file-target-only.
2. TargetProjectionAdapterV1 is pure and mutation-free. TargetRuntimeObserverV1 is optional, read-only, and cannot be required by existing file targets.
3. Goose remains default-disabled and project-only. Machine, hook delivery, recipe delivery, launcher ownership, and Pi production requests return explicit out-of-scope results without mutation.
4. Root AGENTS.md stays target-neutral V1 ownership. Goose never owns it in the target ledger.
5. Shared skills project once to .agents/skills with source-bound, multi-consumer ownership, same-root fail-closed collision checks, no-follow traversal, and Goose-specific .git/.hg/.svn exclusion.
6. Goose MCP projects exactly .agents/plugins/drwn/plugin.json and .agents/plugins/drwn/.mcp.json as one indivisible unit after current consent.
7. Every known blocker is computed against proposed state before acknowledgements, registry/store state, config/lock state, hygiene, V1, or target output is published.
8. Upstream commits are explicit independent commits. A later projection failure retains them, emits projection-retry-required, and never reports projection success.
9. Project state transactionally covers any selected subset of config.json, card.lock, config.local.json, and card.lock.local, including explicit absent images.
10. The permanent ignore rules /.agents/drwn/config.local.json and /.agents/drwn/card.lock.local commit before either local file can appear.
11. One whole-image projection journal covers every project output, .gitignore, .gitattributes, stale cleanup, V1 record, and target ledger. Recovery supports absent, file, symlink, and tree images without dynamic .bak paths.
12. Project journal-backed writes create no .bak*; machine-scope write and backup behavior remains byte-compatible.
13. Status, doctor, dry-run, and watcher refresh consume one immutable journal-stable inspection and never recover or mutate.
14. Positive runtime activation is limited to the exact audited strict native envelope. Projection-current never implies activation-current.
15. Deterministic CI requires no Goose, provider credentials, network, or real home directories. Live qualification is opt-in, isolated, and evidence-bearing.

## Selected strategy and rejected alternatives

### Selected: complete preflight plus ordered recoverable commits

Resolve external inputs without publishing drwn-owned state, derive all proposed state, compute the full projection and every known blocker, acquire consent before project locks, publish independent upstream commits in declared order, then apply one atomic/recoverable project projection. Observe runtime state only after durable projection.

This is a bounded replacement of the project projection publication engine. It is not an entire-command transaction, machine-sync redesign, generic runtime launcher, or general rollback framework.

### Rejected: unified entire-command transaction

Git, network, subprocess, package-store, registry, acknowledgement, and target-owned ambient effects are not one rollback domain. Attempting to include them would replace roughly 30–40 modules and still could not provide honest atomicity.

### Rejected: coordinated state/projection/Org meta-journal

A third coordinator journal creates more recovery state machines and ambiguous ownership. Org Worker keeps its existing operation journal, performs consent/preflight before its lock, and treats project projection as one idempotent subordinate commit.

### Retained inside the selected strategy: one projection journal for V1 and the target ledger

The v4 command-level transaction claim is replaced, but the useful cross-record property remains. One whole-image project journal publishes all projection leaves, V1 bytes, and the separate target ledger consistently; it does not translate or merge their ownership schemas.

## Contract scaffolding

The C1 contract should expose equivalent closed interfaces:

    interface TargetProjectionAdapterV1 {
      readonly abiVersion: 1
      readonly target: RegisteredTargetId
      capabilities(context: ProjectionContextV1): TargetCapabilitiesV1
      declareReadSet(
        context: ProjectionContextV1,
        intent: ProjectionIntentV1,
      ): ProjectionReadSetV1
      plan(
        snapshot: ProjectionSnapshotV1,
        intent: ProjectionIntentV1,
      ): TargetProjectionPlanV1
    }

    interface TargetRuntimeObserverV1 {
      readonly abiVersion: 1
      readonly target: RegisteredTargetId
      declareObservationReadSet(
        context: RuntimeObservationContextV1,
        profile: RuntimeProfileV1,
      ): RuntimeObservationReadSetV1
      observe(
        snapshot: RuntimeObservationSnapshotV1,
        projection: ProjectionInspectionV1,
        profile: RuntimeProfileV1,
      ): TargetRuntimeObservationV1[]
    }

The journal image model must be representationally closed:

    type ProjectImageV1 =
      | { state: "absent" }
      | {
          state: "file"
          sha256: Sha256
          modeClass: "executable" | "non-executable"
          blob: DurableRelativePath
        }
      | { state: "symlink"; target: string }
      | {
          state: "tree"
          manifestSha256: Sha256
          manifest: TreeManifestEntryV1[]
          stagedTree: DurableRelativePath
        }

The command result must expose the ordered-commit boundary:

    type ProjectCommitSequenceResultV1 =
      | { outcome: "committed"; projectionTransactionId: string }
      | {
          outcome: "projection-retry-required"
          committedUpstream: UpstreamCommitKindV1[]
          blocker: StableDiagnosticV1
        }

Adapters and callers never receive lock handles, mutation callbacks, staged paths, journal bytes, or a caller-selected recovery direction.

## Goose 1.45.0 runtime contract inputs

The implementation consumes, but does not silently broaden, these audited db7a704 behaviors:

- GOOSE_PATH_ROOT is read with var_os and honored only when absolute. Unset, empty, or relative values fall back to platform-default paths.
- An absolute non-Unicode GOOSE_PATH_ROOT is accepted by Goose. Because Node cannot exactly round-trip it, drwn must fail closed for consent and plugin publication while allowing safe cleanup/revoke and read-only degraded diagnostics.
- GOOSE_STATE_MACHINE is enabled only for 1, true, TRUE, or yes; a bang-shell message also selects
  the state-machine reply path for that reply. The strict positive native envelope requires the
  variable to be unset or false and excludes bang-shell dispatch.
- With state machine enabled, Goose always installs SkillOperation and directly discovers skills from the session CWD independently of profile, recipe, or persisted MCP extension selection. MCP remains extension-selected. Chat mode skips load_skill and MCP calls.
- The legacy goose-server and /agent/start path are deleted. goose serve is ACP over HTTP/WS and shares ACP handlers; there is no legacy-HTTP qualification row.
- The TUI runtime is externalized to exactly two launcher modes: LocalScript resolves JavaScript
  from an executable ancestor, while Npx defaults to mutable @aaif/goose@latest and accepts an
  override from GOOSE_TUI_NPM_SPEC. I214 qualifies launcher selection only and makes no pinned TUI
  runtime support claim.
- Summon marks the child is_subagent and creates an empty HookManager, suppressing
  HookManager-triggered project-plugin discovery and ambient hook registration. Its new Agent
  still loads the inherited or filtered session-carried MCP extension vector. Ordinary
  orchestrator/restored Agents retain process-CWD hook behavior. I214 still authors no Goose hooks.
- An extension-map entry with no explicit name receives its map key as name.
- ACP pre-load exact runtime-name duplicates use deterministic later-wins replacement. Exact-distinct names that normalize to the same ExtensionManager key remain concurrent completion-order races and therefore make activation shadowed/unqualified.
- Instructions qualification separately covers the resolved agents-home AGENTS.md (normally
  ~/.agents/AGENTS.md or the accepted absolute GOOSE_PATH_ROOT equivalent) and the dynamic
  contained-hints chain. Shared-skill observation mirrors recursive Open Plugin paths and
  exclusive behavior without running Git, Goose, or network activity.

## Testing strategy (TDD contract)

### Behaviors and invariants

- Pure preparation cannot mutate project, machine, consent, acknowledgement, registry, store, or runtime state.
- Projection and runtime observation remain independent.
- V1 semantics and bytes are unchanged even though V1 publication joins the projection journal.
- Unknown schemas, ABIs, image variants, target IDs, ledger kinds, and unsafe paths fail closed.
- Foreign and drifted bytes are preserved; force never claims unknown state.
- Every active shared tree entry has an identical consumer set; last-consumer cleanup is per entry.
- Project state and projection are independently recoverable commits.
- No project .bak path is created.
- Runtime qualification reports what one concrete invocation can consume; it does not predict arbitrary future sessions.

### Unit seams

Unit tests own pure validation and deterministic rendering:

- adapter/observer ABI and sidecar parsing;
- registered target schema and target selection;
- portable path, source identity, consumer graph, ledger, image, journal, receipt, and tombstone validators;
- project-state proposal and operation ordering;
- Git hygiene rendering;
- Goose MCP codec and plugin bytes;
- GOOSE_PATH_ROOT, GOOSE_STATE_MACHINE, extension-name injection, exact/normalized collision, entry-point, hook, and support classifiers;
- stable diagnostics and redaction.

Unit tests use temporary byte fixtures and injected snapshots, never real Goose or network calls.

### Integration contract

Filesystem integration tests use isolated temporary project, HOME, AGENTS_DIR, XDG_CONFIG_HOME, state, data, and cache roots. They cover:

- full proposed-state preflight;
- base/local transaction recovery;
- whole-image projection failure injection at every operation;
- absent/file/symlink/tree transitions;
- lock order, concurrent writers, and stale-owner recovery;
- Org Worker outer-journal/subordinate-projection boundaries;
- watcher attachment, absent-root creation, and self-write suppression;
- project-only .bak removal and retained machine backup parity.

### E2E and live qualification

Deterministic E2E runs a fake plugin loader and deterministic local MCP server without provider credentials. Opt-in live qualification uses the exact Goose 1.45.0 binary/source identity and covers only:

- fresh direct CLI at canonical project root;
- GOOSE_STATE_MACHINE unset/false strict envelope;
- root AGENTS.md ingestion with CONTEXT_FILE_NAMES positive and negative controls;
- .agents/skills discovery with observed effective skills extension;
- two-file project plugin discovery and deterministic local MCP tool invocation;
- isolated ambient config before/after diff;
- cleanup and residual registration diagnostics.

State-machine-enabled skills are qualified as a separate axis, not folded into legacy profile
behavior. Only direct CLI can satisfy I214's positive acceptance envelope. ACP is tested through
current handlers as non-positive observation. Legacy HTTP is absent. TUI records launcher
selection only. Summon proves an empty HookManager and no ambient project-plugin rediscovery while
separately proving that an inherited or filtered session-carried MCP vector still loads.

### Manual verification

- Inspect human and JSON dry-run output for the same sorted paths, blockers, qualification, and retry state.
- Run git check-ignore -v against every generated leaf and both permanent local overlay rules.
- Inspect packed tarball membership for registry/target-adapters.json.
- Verify foreign siblings and descendants remain visible to Git.
- Verify no project .bak* paths and no real-home mutations.
- Verify unsupported machine/hook/recipe/Pi/TUI-runtime requests are explicit and non-mutating.

### Observability and runtime evidence

Every live result records:

- candidate SHA and architecture/plan hashes;
- Goose binary path, version, digest where practical, and db7a704 source identity;
- provider class and invocation entry point;
- process, session, request, and canonical project roots;
- GOOSE_PATH_ROOT classification without exposing unsafe raw bytes;
- GOOSE_STATE_MACHINE classification;
- CONTEXT_FILE_NAMES and effective skills-extension presence;
- recipe/override/resume/chat/subagent/TUI-launcher flags;
- raw map-key name injection, exact runtime-name replacement, and normalized ExtensionManager-key collision classification;
- isolated state directories and fixture digest;
- command, exit status, filesystem before/after digest, transcript path, and redaction status.

Status and doctor must derive human output, JSON output, severity, and exit code from one immutable inspection. Evidence labels each claim verified, degraded, unverified, unsupported, or externally blocked.

### TDD sequence: ordered RED to GREEN increments

For every task:

1. Add one failing behavior test.
2. Run the exact focused command and record a meaningful failure, not a fixture/setup error.
3. Implement the smallest production change that passes that behavior.
4. Rerun the focused test and adjacent regressions.
5. Refactor only while green.
6. Commit the test and implementation as one atomic behavior change unless the task is docs-only.

Do not batch several unobserved RED tests before implementation.

### Case catalog

The required catalog includes:

- enabled/disabled by full, MCP-only, and skills-only with absent/current/drifted AGENTS.md;
- complete current sync operation inventory and every image transition;
- all project-config writers preserving registered target intent;
- foreign, drifted, symlinked, unreadable, nonportable, case-alias, nested-collision, and unknown-schema states;
- consent missing/current/stale/revoked/corrupt and plugin publication versus cleanup/revoke;
- upstream commit followed by projection failure;
- local safety-hygiene failure and local publication failure;
- state-machine disabled/enabled, per-reply bang-shell selection, and chat/non-chat skills/MCP combinations;
- GOOSE_PATH_ROOT unset, empty, relative, absolute Unicode, and absolute non-Unicode;
- extension map missing-name injection;
- ACP pre-load exact runtime-name duplicate later-wins and exact-distinct/normalized-equal ExtensionManager race;
- direct CLI positive acceptance plus no-profile, recipe, resume, fork, term, review, ACP, serve,
  Desktop, scheduler, gateway, summon, orchestrator, restore, chat, and TUI-launcher non-positive
  classifications;
- global ~/.agents/AGENTS.md plus dynamic contained-hints behavior;
- recursive Open Plugin skill paths and exclusive behavior;
- subagent empty HookManager/no ambient project-plugin rediscovery versus ordinary process-CWD
  hooks, with inherited/filtered session-carried MCP loading asserted separately;
- Pi opaque-consumer compatibility with zero Pi production.

### Harness, fixtures, and test data

- New deterministic fixtures live under test/fixtures/goose/.
- Filesystem tests use mkdtemp-derived roots and explicit environment maps.
- No test reads or writes the operator's real home, Goose configuration, credentials, or package cache.
- Failure injection uses executor checkpoints, never timing sleeps.
- Directory manifests are path-sorted and contain literal symlink targets and mode classes.
- Extension collision fixtures run reversed completion orders.
- Runtime evidence fixtures redact values while retaining stable paths, counts, codes, and hashes.

### Commands and environment

Setup:

    bun install --frozen-lockfile

Focused tests use:

    bun test test/<exact-file>.test.ts

Full deterministic gate:

    bun run test:gate

Typecheck runs after, never concurrently with, the full suite:

    bun run typecheck

Release and documentation:

    bun test test/package-readiness.test.ts test/scripts-release-artifact-contract.test.ts test/docs-readiness.test.ts
    bun run docs:build
    bun run verify:release --json

### Required CI jobs and definition of green

Green requires:

- every focused RED/GREEN command recorded with exit status and counts;
- bun run test:gate exit 0;
- bun run typecheck exit 0;
- package, artifact-contract, and docs-readiness tests exit 0;
- bun run docs:build exit 0 when documentation changes;
- bun run verify:release --json reports every required check passed;
- no unexpected worktree changes, project .bak paths, real-home writes, or network use in deterministic tests;
- opt-in live failures remain visible and are never relabeled deterministic success.

### Non-goals, manual checks, and residual risk

Non-goals: Pi production, Goose machine projection, Goose hook authoring/enforcement, recipes, a drwn-owned launcher, pinned TUI runtime support, legacy HTTP support, existing-target observer migration, universal ownership migration, machine recovery rewrite, or arbitrary-command rollback.

Residual risks: target-owned future runtime changes, provider/auth availability, ambient Goose writes, mutable TUI package selection, and malicious same-UID filesystem replacement outside portable Node descriptor guarantees.

## Dependency graph and integration order

    Task 0
      |
      v
    Task 1 -> Task 2 -> Task 3
      |         |
      v         |
    Task 4 -> Task 5 -> Task 6 -> Task 7 -> Task 8
                          |          |
                          v          v
                        Task 9 -> Task 10
                          |          |
                          v          v
                        Task 11 -> Task 12 -> Task 13 -> Task 14
                                                |
                                                v
                                              Task 15 -> Task 16 -> Task 17 -> Task 18

T1 owns shared contracts and planning hotspots. T4 owns executor, ownership, consent, and diagnostics after each declared handoff. T2 owns Goose leaf modules after C1/C2 freeze. T3 is a read-only Pi compatibility witness. T5 reviews frozen SHAs and authors no production changes.

## Task 0: Re-freeze candidate-v5 evidence

**Owner:** A0 with read-only T1/T2/T4 inputs; T5 reviews after freeze.

**Dependencies:** Updated db7a704 audit packet and human Owner candidate-v5 design decision.

**Files:**
- Modify: .ai/analyses/cl0214_goose_target_support_target_architecture.md
- Modify: .ai/analyses/cl0214_goose_target_team_strategy.md
- Modify: .ai/analyses/cl0214_goose_source_contract_coverage.md
- Modify: .ai/analyses/cl0214_goose_g1_decision_evidence_register.md
- Modify: .ai/analyses/cl0214_goose_skill_precedence_probe.md
- Preserve historical provenance: .ai/analyses/134_goose-configuration-guide.md

**Step 1: Add the candidate-v5 source-identity and delta checklist**

Mark 39c27c-derived assertions as historical; add db7a704/1.45.0, state-machine, path-root, current ACP/serve, TUI-launcher, subagent-hook, name-injection, and collision contracts.

**Step 2: Verify the old hash is never presented as current**

    rg -n '39c27c387d726ce4605108d2f974d4feec158ed5|db7a704446975c88d3b67490c74d33bcd684404e' .ai/analyses/cl0214_*

Expected: old hash appears only in explicitly historical evidence; db7a704 is the current audited source identity.

**Step 3: Reconcile all acceptance, test, file-ownership, and immediate-action sections**

Remove legacy HTTP rows and update every strict-envelope statement to require state machine unset/false.

**Step 4: Validate documentation**

    git diff --check
    bun run typecheck

Expected: exit 0.

**Step 5: Obtain exact-byte Owner approval and freeze the integrity register**

Compute SHA-256 for the architecture, strategy, coverage, probe, plan, baseline, and preserved
evidence. Present that pre-freeze set to the Owner. Only after approval, replace the pending
integrity placeholders deterministically and compute the register digest out of band. Any edit
invalidates that review set.

**Step 6: Commit after explicit documentation authority**

    git add .ai/analyses/134_goose-configuration-guide.md .ai/analyses/cl0214_*.md .ai/tasks/cl0214_goose_target_support_task_plan.md
    git commit -m "[other] freeze I214 candidate-v5 contracts and plan"

**Step 7: Dispatch exact-commit T5 review**

T5 verifies the committed SHA and every recorded digest from a clean read-only checkout. Any
finding returns to amendment, renewed Owner approval, a new commit, and a new exact review.

Stop before implementation until G1 passes, the concurrent integration gate closes, G2 passes,
and the Owner acknowledges Received into Building.

## Task 1: Add the generic adapter, observer, and packaged registry

**Owner:** T1.

**Dependencies:** Task 0, C1 source contract, human G2 pass/Owner acknowledgement into Building,
and the I238/I265–I269 combined-base integration gate.

**Files:**
- Create: cli/core/target-adapter.ts
- Create: cli/core/target-adapter-registry.ts
- Create: cli/core/target-runtime-observer.ts
- Create: registry/target-adapters.json
- Create: test/core-target-adapter.test.ts
- Create: test/core-target-adapter-registry.test.ts
- Create: test/core-target-runtime-observer.test.ts
- Modify: cli/context.ts
- Modify: scripts/verify-release-readiness.ts
- Modify: scripts/release/artifact-contract.ts
- Modify: test/package-readiness.test.ts
- Modify: test/scripts-release-artifact-contract.test.ts

**Step 1: Write one failing strict-registry/ABI test**

Start with missing packaged sidecar, malformed sidecar, unknown key, unsupported ABI, and target-independent help/version behavior one case at a time.

**Step 2: Run RED**

    bun test test/core-target-adapter.test.ts test/core-target-adapter-registry.test.ts test/core-target-runtime-observer.test.ts test/package-readiness.test.ts test/scripts-release-artifact-contract.test.ts

Expected: fail because the registry/ABI does not exist.

**Step 3: Implement the minimal pure interfaces and production parser**

Do not add Goose rendering or mutation. Existing file targets remain unchanged.

**Step 4: Run GREEN and typecheck**

    bun test test/core-target-adapter.test.ts test/core-target-adapter-registry.test.ts test/core-target-runtime-observer.test.ts test/package-readiness.test.ts test/scripts-release-artifact-contract.test.ts
    bun run typecheck

Expected: exit 0.

**Step 5: Commit**

    git add cli/core/target-adapter.ts cli/core/target-adapter-registry.ts cli/core/target-runtime-observer.ts registry/target-adapters.json scripts/verify-release-readiness.ts scripts/release/artifact-contract.ts test/core-target-adapter.test.ts test/core-target-adapter-registry.test.ts test/core-target-runtime-observer.test.ts test/package-readiness.test.ts test/scripts-release-artifact-contract.test.ts cli/context.ts
    git commit -m "[other] add strict target adapter contracts"

## Task 2: Enforce registered project targets and canonical project identity

**Owner:** T1.

**Dependencies:** Task 1.

**Files:**
- Create: test/core-registered-project-targets.test.ts
- Modify: cli/core/types.ts
- Modify: cli/core/targets.ts
- Modify: cli/core/project.ts
- Modify: cli/core/project-writes.ts
- Modify: cli/core/machine-config.ts
- Modify: cli/core/user-config.ts
- Modify: cli/core/effective-state.ts
- Modify: cli/core/card-manifest.ts
- Modify: cli/core/card-project.ts
- Modify: cli/core/card-capture.ts
- Modify: cli/core/card-diff.ts
- Modify: sync-mcp.ts
- Modify: cli/commands/mcp/list.ts
- Modify: cli/commands/mcp/write.ts

**Step 1: Write failing project-target and canonical-root tests**

Cover unknown keys, invalid values, project-only Goose, machine/Card exclusion, target preservation, and lexical/canonical disagreement.

**Step 2: Run RED**

    bun test test/core-registered-project-targets.test.ts test/core-targets.test.ts test/core-project-schema.test.ts test/core-project.test.ts test/core-project-writes.test.ts test/core-project-machine-isolation.test.ts test/core-card-capture.test.ts test/core-card-diff.test.ts test/core-card-manifest.test.ts test/sync-mcp.test.ts test/sync-mcp-compat.test.ts

**Step 3: Implement one injected registered-target validator**

Keep TargetName and machine/file renderer views closed. Make sync-mcp.ts delegate to the parser instead of carrying another grammar. Treat init --force as an explicit destructive reset.

**Step 4: Run GREEN**

Run the RED command again, then bun run typecheck.

**Step 5: Commit**

    git add cli/core/types.ts cli/core/targets.ts cli/core/project.ts cli/core/project-writes.ts cli/core/machine-config.ts cli/core/user-config.ts cli/core/effective-state.ts cli/core/card-manifest.ts cli/core/card-project.ts cli/core/card-capture.ts cli/core/card-diff.ts sync-mcp.ts cli/commands/mcp/list.ts cli/commands/mcp/write.ts test/core-registered-project-targets.test.ts
    git commit -m "[other] validate registered project targets"

## Task 3: Close project-config writer races

**Owner:** T1.

**Dependencies:** Task 2.

**Files:**
- Modify: cli/core/extensions/project-config.ts
- Modify: cli/core/extensions/parallel.ts
- Modify: cli/core/extensions/beads.ts
- Modify: cli/core/extensions/markitdown.ts
- Modify: cli/core/worker-project.ts
- Modify: cli/core/card-project.ts
- Modify: cli/commands/init.ts
- Modify: cli/commands/extensions/setup.ts
- Modify: cli/commands/extensions/add.ts
- Test: test/core-project-writes.test.ts
- Test: test/core-extension-commands.test.ts
- Test: test/commands-extensions.test.ts
- Test: test/commands-init.test.ts

**Step 1: Write failing await and preservation tests**

Prove all five setup/init mutations are awaited, the unused unlocked Beads writer is absent, and Card/extension concurrency preserves Goose overrides.

**Step 2: Run RED**

    bun test test/core-project-writes.test.ts test/core-extensions.test.ts test/core-extension-commands.test.ts test/core-beads-extension.test.ts test/core-markitdown-extension.test.ts test/commands-init.test.ts test/commands-extensions.test.ts test/commands-add-extension.test.ts test/commands-project-workers.test.ts

**Step 3: Add Promise-returning locked wrappers and await callers**

Keep prompts, probes, subprocesses, downloads, and other external work outside the project-state lock.

**Step 4: Run GREEN**

Run the RED command again.

**Step 5: Commit**

    git add cli/core/extensions cli/core/worker-project.ts cli/core/card-project.ts cli/commands/init.ts cli/commands/extensions test/core-project-writes.test.ts test/core-extension-commands.test.ts test/commands-extensions.test.ts test/commands-init.test.ts
    git commit -m "[other] serialize project config writers"

## Task 4: Add portable paths, the separate ledger, and shared-skill ownership

**Owner:** T1 for path/source contracts, then T4 for ledger ownership after handoff.

**Dependencies:** Task 1 and Task 2.

**Files:**
- Create: cli/core/target-projection/types.ts
- Create: cli/core/target-projection/portable-path.ts
- Create: cli/core/target-projection/ledger.ts
- Create: cli/core/target-projection/shared-skills.ts
- Create: test/core-target-projection-path.test.ts
- Create: test/core-target-projection-ledger.test.ts
- Create: test/core-target-shared-skills.test.ts
- Modify: cli/core/skills.ts
- Modify: cli/core/card-skill-resolver.ts
- Modify: cli/core/projection-ownership.ts

**Step 1: Write failing path, ledger, and consumer tests**

Cover ASCII bounds, Windows names, case aliases, V1 overlap, unknown producer/consumer behavior, identical tree consumer sets, same-root contenders, symlinks, unreadable subtrees, and .git/.hg/.svn segments.

**Step 2: Run RED**

    bun test test/core-target-projection-path.test.ts test/core-target-projection-ledger.test.ts test/core-target-shared-skills.test.ts test/core-skills.test.ts test/core-card-skill-resolver.test.ts test/core-projection-ownership.test.ts test/core-skills-materialize.test.ts test/core-opencode-skill-shadowing.test.ts

**Step 3: Implement strict portable and ownership primitives**

Keep drwn.write-record@1 unchanged. Project one source once with executor-derived target consumers.

**Step 4: Run GREEN**

Run the RED command again and bun run typecheck.

**Step 5: Commit**

    git add cli/core/target-projection cli/core/skills.ts cli/core/card-skill-resolver.ts cli/core/projection-ownership.ts test/core-target-projection-path.test.ts test/core-target-projection-ledger.test.ts test/core-target-shared-skills.test.ts
    git commit -m "[other] add target projection ownership"

## Task 5: Add whole-image snapshot and journal schemas

**Owner:** T4.

**Dependencies:** Task 4 and C2 contract freeze.

**Files:**
- Create: cli/core/target-projection/image.ts
- Create: cli/core/target-projection/snapshot.ts
- Create: cli/core/target-projection/journal.ts
- Create: cli/core/target-projection/path-safety.ts
- Create: test/core-target-projection-image.test.ts
- Create: test/core-target-projection-journal.test.ts
- Create: test/core-target-projection-path-safety.test.ts

**Step 1: Write failing strict image and journal tests**

Cover absent, file, symlink, and tree variants; exact before/after images; durable references; unknown fields; duplicate/overlapping paths; missing blobs; literal links; and every current ManagedPathData kind.

**Step 2: Run RED**

    bun test test/core-target-projection-image.test.ts test/core-target-projection-journal.test.ts test/core-target-projection-path-safety.test.ts test/core-write-record-managed-content.test.ts test/core-write-record-v1.test.ts

**Step 3: Implement pure parsers and snapshotters**

Use no-follow path-sorted tree manifests. Do not publish or recover yet.

**Step 4: Run GREEN**

Run the RED command again.

**Step 5: Commit**

    git add cli/core/target-projection/image.ts cli/core/target-projection/snapshot.ts cli/core/target-projection/journal.ts cli/core/target-projection/path-safety.ts test/core-target-projection-image.test.ts test/core-target-projection-journal.test.ts test/core-target-projection-path-safety.test.ts
    git commit -m "[other] define whole image projection journal"

## Task 6: Implement executor, immutable inspection, and fixed lock order

**Owner:** T4.

**Dependencies:** Task 5.

**Files:**
- Create: cli/core/target-projection/executor.ts
- Create: cli/core/target-projection/inspection.ts
- Create: cli/core/target-projection/transaction.ts
- Create: test/core-target-projection-executor.test.ts
- Create: test/core-target-projection-inspection.test.ts
- Modify: cli/core/inventory-lock.ts
- Modify: test/core-inventory-lock.test.ts

**Step 1: Write failing executor and lock-order tests**

Cover prepare/apply/recover/inspect, caller-selected recovery refusal, inventory → machine → consent → Org → project-state → projection ordering, same-path reentrancy, reverse-order failure, preimage revalidation, and journal-before/state/journal-after inspection.

**Step 2: Run RED**

    bun test test/core-target-projection-executor.test.ts test/core-target-projection-inspection.test.ts test/core-inventory-lock.test.ts

**Step 3: Implement minimal journal-backed publication and recovery**

Stage and fsync every referenced image before the prepared journal. Do not interpret mixed state. Do not expose mutation authority to adapters.

**Step 4: Run GREEN**

Run the RED command again and bun run typecheck.

**Step 5: Commit**

    git add cli/core/target-projection/executor.ts cli/core/target-projection/inspection.ts cli/core/target-projection/transaction.ts cli/core/inventory-lock.ts test/core-target-projection-executor.test.ts test/core-target-projection-inspection.test.ts test/core-inventory-lock.test.ts
    git commit -m "[other] add recoverable projection executor"

## Task 7: Convert project synchronization into one complete pure plan

**Owner:** T1; T4 reviews operation closure.

**Dependencies:** Task 3 and Task 6.

**Files:**
- Create: cli/core/project-projection-plan.ts
- Create: test/core-project-projection-plan.test.ts
- Modify: cli/core/sync.ts
- Modify: cli/core/git-hygiene.ts
- Modify: cli/core/vendor-reconcile.ts
- Modify: cli/core/worker-generator/sync-worker.ts
- Modify: cli/core/sync-project-instructions.ts
- Modify: cli/core/sync-instructions.ts
- Modify: cli/core/mcp.ts
- Modify: cli/core/skills.ts
- Modify: cli/core/hook-generator/runtime-selection.ts
- Modify: cli/core/hook-generator/sync-hooks.ts
- Modify: cli/core/materialize.ts

**Step 1: Write a failing complete-operation inventory test**

Require .gitignore, .gitattributes, vendor trees/sidecars, Worker outputs, target-neutral instructions, MCP, skills, hooks, stale cleanup, V1, target leaves, target ledger, and sentinels.

**Step 2: Run RED**

    bun test test/core-project-projection-plan.test.ts test/core-git-hygiene.test.ts test/core-sync-instructions.test.ts test/core-sync-worker.test.ts test/core-mcp-sync.test.ts test/core-skills.test.ts test/core-worker-hook-stack.test.ts test/core-write-vendor-provenance.test.ts test/core-write-record.test.ts

**Step 3: Introduce pure plan functions one surface at a time**

Preserve existing target bytes, warnings, filtering, force, partial-write, dry-run, and cleanup behavior. Split target-neutral AGENTS.md planning from the Claude adapter.

**Step 4: Run GREEN and existing-target parity**

Run the RED command plus:

    bun test test/commands-write-claude-conflict.test.ts test/commands-write-codex-conflict.test.ts test/commands-write-cursor-conflict.test.ts test/commands-write-opencode-conflict.test.ts test/commands-write-partial-ownership.test.ts

**Step 5: Commit**

    git add cli/core/project-projection-plan.ts cli/core/sync.ts cli/core/git-hygiene.ts cli/core/vendor-reconcile.ts cli/core/worker-generator/sync-worker.ts cli/core/sync-project-instructions.ts cli/core/sync-instructions.ts cli/core/mcp.ts cli/core/skills.ts cli/core/hook-generator/runtime-selection.ts cli/core/hook-generator/sync-hooks.ts cli/core/materialize.ts test/core-project-projection-plan.test.ts
    git commit -m "[other] plan complete project projection"

## Task 8: Publish V1 and the separate ledger through one journal

**Owner:** T4, after T1 releases sync integration ownership.

**Dependencies:** Task 7.

**Files:**
- Create: test/scenarios-project-projection-recovery.test.ts
- Create: test/core-project-projection-backup-cut.test.ts
- Modify: cli/core/sync.ts
- Modify: cli/core/managed-file.ts
- Modify: cli/core/target-projection/executor.ts
- Modify: cli/core/target-projection/journal.ts

**Step 1: Write failing checkpoint and backup-cut tests**

Inject failure at every ordered operation and image transition. Assert V1 and ledger never diverge, project .bak* is absent, and machine backup fixtures are byte-compatible.

**Step 2: Run RED**

    bun test test/scenarios-project-projection-recovery.test.ts test/core-project-projection-backup-cut.test.ts test/core-write-record-v1.test.ts test/core-write-idempotent.test.ts test/core-write-offline.test.ts

**Step 3: Route project publication exclusively through the executor**

Keep machine-scope imperative managed-file behavior. Publish ownership records only after all corresponding physical images are valid.

**Step 4: Run GREEN**

Run the RED command plus bun test test/commands-write.test.ts.

**Step 5: Commit**

    git add cli/core/sync.ts cli/core/managed-file.ts cli/core/target-projection/executor.ts cli/core/target-projection/journal.ts test/scenarios-project-projection-recovery.test.ts test/core-project-projection-backup-cut.test.ts
    git commit -m "[other] journal complete project projection"

## Task 9: Extend the project-state transaction to base and local state

**Owner:** T1 for callers; T4 reviews recovery.

**Dependencies:** Task 6.

**Files:**
- Modify: cli/core/project-state-transaction.ts
- Modify: cli/core/config-local.ts
- Modify: cli/core/project-writes.ts
- Modify: cli/core/worker-project.ts
- Modify: test/core-project-state-transaction.test.ts

**Step 1: Write failing subset and absent-image recovery tests**

Cover every selected subset of config.json, card.lock, config.local.json, and card.lock.local, with failure between each publication checkpoint.

**Step 2: Run RED**

    bun test test/core-project-state-transaction.test.ts test/core-project-writes.test.ts

**Step 3: Generalize one ordered journal over optional targets**

Remove local-writer .gitignore publication. Recovery must commit the selected base/local images as a unit.

**Step 4: Run GREEN**

Run the RED command.

**Step 5: Commit**

    git add cli/core/project-state-transaction.ts cli/core/config-local.ts cli/core/project-writes.ts cli/core/worker-project.ts test/core-project-state-transaction.test.ts
    git commit -m "[other] extend project state transaction"

## Task 10: Commit permanent local-overlay safety before local files

**Owner:** T1 for pure hygiene planning; T4 for executor publication.

**Dependencies:** Task 8 and Task 9.

**Files:**
- Create: cli/core/target-projection/local-overlay-safety.ts
- Create: test/core-local-overlay-safety.test.ts
- Modify: cli/core/config-local.ts
- Modify: cli/core/git-hygiene.ts
- Modify: cli/commands/dev.ts
- Modify: cli/commands/card/link.ts
- Modify: cli/commands/card/unlink.ts
- Modify: test/commands-dev.test.ts
- Modify: test/commands-card-link.test.ts

**Step 1: Write failing hygiene-before-local tests**

Cover single/bulk link, unlink with/without --write, missing/drifted .gitignore, hygiene failure, local publication failure, and foreign-line preservation.

**Step 2: Run RED**

    bun test test/core-local-overlay-safety.test.ts test/core-git-hygiene.test.ts test/commands-dev.test.ts test/commands-card-link.test.ts

**Step 3: Add monotonic local-overlay-safety intent**

Commit the two anchored rules through the executor, release all locks, then publish local state through the extended state transaction.

**Step 4: Run GREEN**

Run the RED command and git check-ignore assertions in the fixture.

**Step 5: Commit**

    git add cli/core/target-projection/local-overlay-safety.ts cli/core/config-local.ts cli/core/git-hygiene.ts cli/commands/dev.ts cli/commands/card/link.ts cli/commands/card/unlink.ts test/core-local-overlay-safety.test.ts test/commands-dev.test.ts test/commands-card-link.test.ts
    git commit -m "[other] protect local project overlays"

## Task 11: Implement target-neutral consent and revocation primitives

**Owner:** T4.

**Dependencies:** Task 0 and Task 6.

**Files:**
- Create: cli/core/target-projection/consent.ts
- Create: test/core-target-consent.test.ts
- Modify: cli/core/paths.ts
- Modify: cli/core/inventory-lock.ts

**Step 1: Write failing strict receipt-state tests**

Using an injected registered-target binding fixture, cover missing/current/stale/revoked/corrupt
state, moved project, strict fields, effect-plan digest mismatch, invalid-receipt tombstones, and
revoke-never-restores direction. Do not compute a Goose plugin plan or expose a CLI command yet.

**Step 2: Run RED**

    bun test test/core-target-consent.test.ts test/core-inventory-lock.test.ts

**Step 3: Implement strict machine-local receipt primitives**

Parse, classify, atomically store, and revoke a receipt using a caller-supplied frozen target/effect
binding. The primitive owns canonical root/key validation and tombstone safety but cannot derive
runtime qualification, plugin bytes, disclosure, or target-specific binding inputs.

**Step 4: Run GREEN**

Run the RED command.

**Step 5: Commit**

    git add cli/core/target-projection/consent.ts cli/core/paths.ts cli/core/inventory-lock.ts test/core-target-consent.test.ts
    git commit -m "[other] add target consent primitives"

## Task 12: Add complete proposed-state preflight and ordered commits

**Owner:** T1 for proposed-state APIs; T4 for mutation boundary review.

**Dependencies:** Task 8 through Task 11.

**Files:**
- Create: cli/core/project-preflight.ts
- Create: cli/core/project-commit-sequence.ts
- Create: test/core-project-preflight.test.ts
- Create: test/core-project-commit-sequence.test.ts
- Modify: cli/core/hook-consent-ack.ts
- Modify: cli/core/instruction-consent-ack.ts
- Modify: cli/core/project-registry.ts
- Modify: cli/core/card-store.ts
- Modify: cli/core/store-seed.ts
- Modify: cli/core/worker-materialize.ts

**Step 1: Write a failing no-early-mutation test**

Inject a late projection blocker after proposed acknowledgement, registry, store, and state changes. Assert every persistent byte remains unchanged.

**Step 2: Run RED**

    bun test test/core-project-preflight.test.ts test/core-project-commit-sequence.test.ts test/core-instruction-consent-ack.test.ts test/scenarios-project-registry-races.test.ts test/core-worker-materialize-derive.test.ts

**Step 3: Separate derive, validate, and commit APIs**

Return immutable proposed bytes/tokens. Commit independent upstream state only after preflight; revalidate before projection.

**Step 4: Add and pass retry-required behavior**

Inject failure after an upstream commit. Assert retained upstream state, stable projection-retry-required output, and idempotent convergence.

**Step 5: Commit**

    git add cli/core/project-preflight.ts cli/core/project-commit-sequence.ts cli/core/hook-consent-ack.ts cli/core/instruction-consent-ack.ts cli/core/project-registry.ts cli/core/card-store.ts cli/core/store-seed.ts cli/core/worker-materialize.ts test/core-project-preflight.test.ts test/core-project-commit-sequence.test.ts
    git commit -m "[other] preflight complete project operations"

## Task 13: Route all target-aware commands through the commit sequence

**Owner:** T1.

**Dependencies:** Task 12.

**Files:**
- Create: test/scenarios-target-preflight-order.test.ts
- Modify: cli/commands/write.ts
- Modify: cli/commands/init.ts
- Modify: cli/commands/project/add.ts
- Modify: cli/commands/project/apply.ts
- Modify: cli/commands/project/remove.ts
- Modify: cli/commands/project/pin.ts
- Modify: cli/commands/project/update.ts
- Modify: cli/commands/use.ts
- Modify: cli/commands/up.ts
- Modify: cli/commands/install.ts
- Modify: cli/commands/worker/materialize.ts

**Step 1: Add one failing command-order case at a time**

Cover write acknowledgements, project mutations, registry updates, fetched updates, store hydration, Worker materialization, dry-run, and init --force destructive-reset diagnostics.

**Step 2: Run RED**

    bun test test/scenarios-target-preflight-order.test.ts test/commands-write.test.ts test/commands-init.test.ts test/commands-project-workers.test.ts test/commands-use-worker.test.ts test/commands-up.test.ts test/commands-install.test.ts test/commands-worker-materialize.test.ts

**Step 3: Route each command through prepare then ordered commit**

External fetch/process work remains explicit and outside rollback claims. Never print success before projection outcome is known.

**Step 4: Run GREEN**

Run the RED command plus test/core-write-offline.test.ts.

**Step 5: Commit**

    git add cli/commands/write.ts cli/commands/init.ts cli/commands/project cli/commands/use.ts cli/commands/up.ts cli/commands/install.ts cli/commands/worker/materialize.ts test/scenarios-target-preflight-order.test.ts
    git commit -m "[other] order target aware command commits"

## Task 14: Repair Org Worker lock and journal composition

**Owner:** T1/T4 sequential handoff.

**Dependencies:** Task 12 and Task 13.

**Files:**
- Modify: cli/core/org-worker-materializer.ts
- Modify: cli/core/org-worker-materialization-plan.ts
- Modify: cli/core/org-worker-materialization-journal.ts
- Modify: test/core-org-worker-materializer.test.ts
- Modify: test/core-org-worker-materialization-journal.test.ts
- Modify: test/scenarios-org-worker-materialization.test.ts

**Step 1: Write failing target-consent-before-Org and crash-boundary tests**

Use an injected consent-requiring registered-target fixture. Cover materialize/remove/reconcile,
target enabled/disabled, consent absent/current/stale/revoked, and every outer/subordinate boundary;
do not depend on the Goose adapter, observer, or plugin bytes.

**Step 2: Run RED**

    bun test test/core-org-worker-materializer.test.ts test/core-org-worker-materialization-plan.test.ts test/core-org-worker-materialization-journal.test.ts test/scenarios-org-worker-materialization.test.ts test/commands-install-org-worker-materialization.test.ts

**Step 3: Prepare before the Org lock and use subordinate projection**

Keep the existing Org journal as operation coordinator. Acquire its explicit lock level before project state/projection and resume projection idempotently.

**Step 4: Run GREEN**

Run the RED command.

**Step 5: Commit**

    git add cli/core/org-worker-materializer.ts cli/core/org-worker-materialization-plan.ts cli/core/org-worker-materialization-journal.ts test/core-org-worker-materializer.test.ts test/core-org-worker-materialization-journal.test.ts test/scenarios-org-worker-materialization.test.ts
    git commit -m "[other] compose Org and projection recovery"

## Task 15: Implement the Goose leaf projection

**Owner:** T2.

**Dependencies:** C1/C2 freezes and Task 14.

**Files:**
- Modify: cli/core/target-adapter-registry.ts
- Modify: cli/context.ts
- Modify: registry/target-adapters.json
- Create: cli/core/goose/adapter.ts
- Create: cli/core/goose/plugin.ts
- Create: cli/core/goose/mcp-codec.ts
- Create: cli/core/goose/qualification.ts
- Create: test/core-goose-adapter.test.ts
- Create: test/core-goose-plugin.test.ts
- Create: test/core-goose-mcp-codec.test.ts
- Create: test/core-goose-registry.test.ts
- Create: test/fixtures/goose/

**Step 1: Write failing deterministic adapter and codec tests**

Cover exact plugin files, atomic unit identity, stdio-only server validation, raw unknown keys, safe
literals, same-name inherited environment references, aliases/interpolation/reserved keys,
machine/hook/recipe/committed-surface exclusions, explicit registry dispatch, and default-disabled
selection.

**Step 2: Run RED**

    bun test test/core-goose-adapter.test.ts test/core-goose-plugin.test.ts test/core-goose-mcp-codec.test.ts test/core-goose-registry.test.ts

**Step 3: Implement pure Goose renderers**

The adapter declares instruction capability without owning AGENTS.md and consumes shared-skill plans
without implementing their projector. Register it through the target-adapter registry and context
composition path, and add its default-disabled descriptor to the packed registry. It authors no
global Goose config.

**Step 4: Run GREEN and conformance**

    bun test test/core-goose-adapter.test.ts test/core-goose-plugin.test.ts test/core-goose-mcp-codec.test.ts test/core-goose-registry.test.ts test/core-target-shared-skills.test.ts test/core-target-projection-executor.test.ts

**Step 5: Commit**

    git add cli/core/target-adapter-registry.ts cli/context.ts registry/target-adapters.json cli/core/goose/adapter.ts cli/core/goose/plugin.ts cli/core/goose/mcp-codec.ts cli/core/goose/qualification.ts test/core-goose-adapter.test.ts test/core-goose-plugin.test.ts test/core-goose-mcp-codec.test.ts test/core-goose-registry.test.ts test/fixtures/goose
    git commit -m "[other] add Goose project projection"

## Task 16: Implement the audited observer, strict envelope, and Goose consent command

**Owner:** T2 for Goose interpretation; T4 reviews qualification safety.

**Dependencies:** Task 11, Task 15, and frozen db7a704 audit fixtures.

**Files:**
- Create: cli/core/goose/runtime-observer.ts
- Create: cli/core/goose/skill-observer.ts
- Create: cli/core/goose/installed-plugin-mirror.ts
- Create: cli/core/goose/path-resolution.ts
- Create: cli/core/goose/extension-selection.ts
- Create: cli/core/goose/state-machine.ts
- Create: cli/core/goose/hook-observer.ts
- Create: cli/core/goose/instruction-observer.ts
- Create: cli/commands/target/consent.ts
- Create: test/core-goose-runtime-observer.test.ts
- Create: test/core-goose-skill-observer.test.ts
- Create: test/core-goose-installed-plugin-mirror.test.ts
- Create: test/core-goose-path-resolution.test.ts
- Create: test/core-goose-extension-selection.test.ts
- Create: test/core-goose-state-machine.test.ts
- Create: test/core-goose-hook-observer.test.ts
- Create: test/core-goose-instruction-observer.test.ts
- Create: test/commands-target-consent.test.ts
- Create: test/scenarios-goose-preflight-order.test.ts
- Modify: cli/core/target-projection/consent.ts
- Modify: cli/index.ts
- Modify: test/scenarios-org-worker-materialization.test.ts

**Step 1: Write failing GOOSE_PATH_ROOT tests**

Assert unset/empty/relative fallback, absolute Unicode selection, and absolute non-Unicode fail-closed consent/publication with cleanup/revoke still available.

**Step 2: Write failing legacy/state-machine axis tests**

Assert only 1, true, TRUE, and yes enable state machine globally and that bang-shell dispatch
selects it for one reply; enabled state always installs SkillOperation and discovers session-CWD
skills independently of profile/recipe/persisted MCP vector; MCP stays extension-selected; chat
skips load_skill/MCP.

**Step 3: Write failing entry-point, name, collision, and hook tests**

Remove legacy HTTP. Treat serve as ACP. Assert direct-CLI-only positive acceptance and distinct
no-profile, recipe, resume, fork, term, review, ACP/serve, Desktop, scheduler, gateway, summon,
orchestrator, restore, and chat skill/MCP verdicts; LocalScript and Npx TUI launcher selection only,
including the @aaif/goose@latest Npx default and GOOSE_TUI_NPM_SPEC override; missing-name map-key
injection; ACP pre-load exact-runtime-name deterministic
later-wins; exact-distinct/normalized-equal ExtensionManager shadowing race; default and accepted-
root agents-home AGENTS.md plus dynamic contained hints; recursive Open Plugin and exclusive skill
behavior; Summon empty hooks/no ambient project-plugin rediscovery while its inherited/filtered
session-carried MCP vector still loads; and ordinary orchestrator/restore process-CWD hooks.

**Step 4: Bind the strict Goose consent command**

Derive the caller-supplied consent binding only after registered-adapter selection and read-only
runtime observation. Bind the canonical project root, exact source/binary/build identity, supported
version range, effect/disclosure digest, and exact plugin plan and shape; provider identity is not
part of the receipt. Cover accept/decline, stale digest, moved project, corrupt receipt, invalid
revoke, non-TTY refusal, historical 1.41 refusal, absolute-non-Unicode refusal, Goose-specific
preflight ordering, and Org Worker integration. The command never weakens the target-neutral
receipt primitive.

**Step 5: Implement the read-only observer and run GREEN**

    bun test test/core-goose-runtime-observer.test.ts test/core-goose-skill-observer.test.ts test/core-goose-installed-plugin-mirror.test.ts test/core-goose-path-resolution.test.ts test/core-goose-extension-selection.test.ts test/core-goose-state-machine.test.ts test/core-goose-hook-observer.test.ts test/core-goose-instruction-observer.test.ts
    bun test test/commands-target-consent.test.ts test/scenarios-goose-preflight-order.test.ts test/scenarios-org-worker-materialization.test.ts
    bun run typecheck

The observer never invokes Goose, Git, package launchers, or network access.

**Step 6: Commit**

    git add cli/core/goose/runtime-observer.ts cli/core/goose/skill-observer.ts cli/core/goose/installed-plugin-mirror.ts cli/core/goose/path-resolution.ts cli/core/goose/extension-selection.ts cli/core/goose/state-machine.ts cli/core/goose/hook-observer.ts cli/core/goose/instruction-observer.ts cli/core/target-projection/consent.ts cli/commands/target/consent.ts cli/index.ts test/core-goose-runtime-observer.test.ts test/core-goose-skill-observer.test.ts test/core-goose-installed-plugin-mirror.test.ts test/core-goose-path-resolution.test.ts test/core-goose-extension-selection.test.ts test/core-goose-state-machine.test.ts test/core-goose-hook-observer.test.ts test/core-goose-instruction-observer.test.ts test/commands-target-consent.test.ts test/scenarios-goose-preflight-order.test.ts test/scenarios-org-worker-materialization.test.ts
    git commit -m "[other] qualify and consent Goose runtime modes"

## Task 17: Add ambient diagnostics and journal-aware watch behavior

**Owner:** T4.

**Dependencies:** Task 16.

**Files:**
- Create: cli/core/goose/ambient-classifier.ts
- Create: test/core-goose-ambient.test.ts
- Create: test/core-target-projection-watch.test.ts
- Modify: cli/core/ambient-capabilities.ts
- Modify: cli/core/ambient-policy.ts
- Modify: cli/core/diagnostics.ts
- Modify: cli/commands/status.ts
- Modify: cli/commands/doctor.ts
- Modify: cli/core/write-watch.ts
- Modify: cli/core/write-watch-recursive.ts
- Modify: test/commands-status.test.ts
- Modify: test/commands-doctor.test.ts
- Modify: test/commands-write-watch.test.ts

**Step 1: Write failing single-snapshot diagnostic tests**

Assert one inspection feeds human, JSON, severity, and exit behavior across projection, transaction, consent, GOOSE_PATH_ROOT, state-machine, extension selection, skills, MCP, hooks, TUI launcher, and ambient registration.

**Step 2: Write failing dynamic watcher tests**

Cover absent roots, creation/deletion/recreation, native/fallback attachment parity, null filenames, watcher errors, unsafe roots, journal transitions, exact hash/mode suppression, retained paths, and no self-trigger masking.

**Step 3: Run RED**

    bun test test/core-goose-ambient.test.ts test/core-target-projection-watch.test.ts test/core-diagnostics-sections.test.ts test/commands-status.test.ts test/commands-doctor.test.ts test/commands-write-watch.test.ts

**Step 4: Implement read-only diagnostics and watcher refresh**

Never scan arbitrary map keys as filesystem paths, execute Goose, mutate ambient config, recover a journal, or expose secret values.

**Step 5: Run GREEN and commit**

    bun test test/core-goose-ambient.test.ts test/core-target-projection-watch.test.ts test/core-diagnostics-sections.test.ts test/commands-status.test.ts test/commands-doctor.test.ts test/commands-write-watch.test.ts
    git add cli/core/goose/ambient-classifier.ts cli/core/ambient-capabilities.ts cli/core/ambient-policy.ts cli/core/diagnostics.ts cli/commands/status.ts cli/commands/doctor.ts cli/core/write-watch.ts cli/core/write-watch-recursive.ts test/core-goose-ambient.test.ts test/core-target-projection-watch.test.ts test/commands-status.test.ts test/commands-doctor.test.ts test/commands-write-watch.test.ts
    git commit -m "[other] report Goose projection and activation"

## Task 18: Finish release, documentation, and qualification evidence

**Owner:** T1 packaging, T2 live evidence, T4 safety evidence, A0 integration; T5 reviews the frozen candidate.

**Dependencies:** Tasks 0–17.

**Files:**
- Modify: docs/cli-quickref.md
- Modify: docs/contracts/project-worker-v1.md
- Modify: test/docs-readiness.test.ts
- Modify: test/package-readiness.test.ts
- Modify: test/scripts-release-artifact-contract.test.ts
- Create: .ai/analyses/cl0214_goose_live_qualification.md
- Later after merge: .ai/tasks/cl0214_goose_target_completion.md

**Step 1: Write failing documentation and packaged-artifact assertions**

Require target-adapters.json in the tarball, exact project/machine/activation boundaries, the
db7a704 source contract (workspace 1.45.0), state-machine split, no legacy HTTP, TUI launcher-
only language, and Pi exclusions.

**Step 2: Run focused release/documentation checks**

    bun test test/package-readiness.test.ts test/scripts-release-artifact-contract.test.ts test/docs-readiness.test.ts

Expected RED until docs and package contract are updated.

**Step 3: Update docs and produce isolated live evidence**

Live evidence is opt-in and does not replace deterministic tests. Do not create the completion document before merge.

**Step 4: Run the final gates sequentially**

    bun run test:gate
    bun run typecheck
    bun test test/package-readiness.test.ts test/scripts-release-artifact-contract.test.ts test/docs-readiness.test.ts
    bun run docs:build
    bun run verify:release --json
    git status --short --branch

Expected: every command exits 0; worktree contains only declared changes and evidence.

**Step 5: Commit and freeze the G3 candidate**

    git add docs/cli-quickref.md docs/contracts/project-worker-v1.md test/docs-readiness.test.ts test/package-readiness.test.ts test/scripts-release-artifact-contract.test.ts .ai/analyses/cl0214_goose_live_qualification.md
    git commit -m "[other] document qualified Goose support"

A0 records the exact candidate SHA, plan/architecture hashes, command results/counts, evidence digests, residual risks, and PR Testing & CI evidence. T5 reviews that immutable SHA from a clean checkout.

## Integration and finding protocol

1. Integrate Task 1 contract before all dependent tasks.
2. Freeze Task 4 ownership primitives and Tasks 5–6 executor before Goose leaf work.
3. Transfer shared hotspot ownership explicitly before another seat edits the same file.
4. Run focused contract tests after each integrated shared-spine commit.
5. A0 rejects undeclared paths rather than repairing another owner's change.
6. Freeze one candidate SHA only after all deterministic gates pass.
7. T5 returns evidence-backed findings without modifying the candidate.
8. Route each finding to its original owner, integrate the fix, freeze a new SHA, and rerun invalidated evidence.
9. Only the final T5-reviewed SHA may enter human G3 review.

## GATE 2 readiness checklist

- Candidate-v5 G1 is passed and acknowledged into Planning before G2 submission; the exact plan
  then passes G2 and is acknowledged into Building before production execution.
- Every task has exact files, owner, dependency, RED command, GREEN command, and commit boundary.
- Shared-file ownership transfers are explicit and non-overlapping.
- Source-dependent fixtures use db7a704/1.45.0, not mechanically relabeled historical evidence.
- The state-machine axis, absolute-only GOOSE_PATH_ROOT, removed legacy HTTP, TUI launcher-only limitation, subagent hook absence, map-key name injection, and ACP collision split are represented in deterministic tests and support language.
- The full project mutation inventory is closed.
- Project state, local safety hygiene, upstream commits, and project projection have explicit commit and recovery boundaries.
- Deterministic CI and opt-in live qualification are separate.
- Machine behavior, existing target parity, V1 compatibility, and Pi exclusion have regression coverage.
- Workflow-rule drift and verified Bun commands are present.
- The plan hash and exact candidate source hashes are recorded before T5 G2 review.
- I238/I265–I269 integration dispositions, combined base SHA, path-overlap result, and any required
  G1 amendment are recorded without mutating coworker worktrees.

## PR Testing and CI evidence template

### Testing & CI evidence

- Candidate SHA:
- Architecture SHA-256:
- Task-plan SHA-256:
- Goose source/version:
- Baseline command results and counts:
- Focused RED/GREEN command results and counts:
- bun run test:gate:
- bun run typecheck:
- package/artifact/docs tests:
- bun run docs:build:
- bun run verify:release --json:
- Live qualification status and evidence digest:
- Filesystem before/after digest:
- Project .bak scan:
- Real-home mutation check:
- Known baseline failures:
- Change-induced failures:
- Unsupported/degraded claims:
- T5-reviewed SHA:

## Completion and knowledge-capture sequence

After human G3 pass, Owner acknowledgement into In Review, reviewed-SHA verification, and authorized merge:

1. Record Owner Status Merged through the v0.4 three-surface transaction.
2. Create .ai/tasks/cl0214_goose_target_completion.md with exact implementation and evidence.
3. Update durable project knowledge for adapter, projection, recovery, and Goose qualification contracts.
4. Record Knowledge-captured as a later separate authorized transition.
5. Open any Pi, launcher, TUI pinning, machine projection, hook delivery, recipe, or stronger filesystem-race work under separately generated issue IDs.
