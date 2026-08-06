# ABOUTME: Successor handoff for the ACP line: mission state, live-verified wire facts,
# ABOUTME: remaining phases, core file pointers, environment traps, and workflow context.

# ACP Line — Successor Handoff

**Written**: 2026-08-06 · **Author**: Remy (with the session that closed [I220]/[I221])
**Corrected**: 2026-08-06 · successor custody transferred to the architecture coordinator;
cross-repo pointers and the Task/Run boundary re-verified after PR #98 merged.
**Mission**: give drwn a first-class ACP agent surface so ACP clients (Zed, Buzz) can
drive deployed Darwinian Workers — delivery decision **B-lean + delivery-verification
rider** (ratified; see `cl0105_review01_g1_g2_readiness.md`).

## 1. Where the line stands (three layers)

**Layer 1 — enabling substrate: DONE.** The [I204] staging campaign proved the deployed
lane broke four ways; the fixes are shipped and Knowledge-captured:

- **[I220]** (PR #94, merge `ea8e7f0`): `permissions`/`escalation` retired
  publish-strict/consume-tolerant; `Governance (deployed)` declared-vs-enforced in status.
- **[I221]** (PR #95, merge `c11cf40`): `drwn worker materialize --payload` owns the full
  V1-payload → V2-project translation (validate → seed → derive → install → write → emit).
  DS adoption is committed but NOT yet done (their record): image pin bump → one-line
  DeployRunner swap → inline bridge deletion.
- Completion evidence: `cl0220_governance_field_retirement_completion.md`,
  `cl0221_worker_materialize_entrypoint_completion.md` (PR #96, merge `203e1ab`).
  G3 review record: `cl0220_cl0221_review02_g3_implementation.md`.

**Layer 2 — the adapter: Phases 0–3 in draft on PR #97** (`remy/I105-acp-adapter-phase-0-3`,
now under architecture-coordinator custody; coordinate changes through the I105 issue thread
and PR owner). It carries session core with real settlement, multi-turn continuation,
durable restart/load with cross-process ownership, and device auth. Its stated boundaries:
pre-[I106] cancellation is an honest no-op; Phase 5 Buzz delivery unimplemented;
manual/live exits unclaimed.

**Layer 3 — remaining to "fully achieved"** (§3 below): Phase 4 cancellation, Phase 5 Buzz
delivery rider, live evidence, ship mechanics.

## 2. Hard-won wire facts (live-verified against staging; do not re-derive)

- `POST /api/minds/:slug/chat` → `200 {runId}`. Stream-poll entries are
  `{seq, sourceId, event: {v, seq, ts, type, ...}}` — **the entry wraps the event**;
  unwrap before dispatch.
- `runId` predates ACP and remains the Deploy API's current execution handle. ACP keeps its
  pre-run `sess_*` identity stable and persists `activeRunId`; when the Darwinian Services
  Tasks API exists, evolve the versioned binding to `{taskId, activeRunId}`. A Task is the
  stable 0..n-run product aggregate, not a replacement for the run used by status, stream,
  cancellation, artifacts, ownership, and billing routes.
- **Boot-failure runs emit ZERO StreamEntries.** Adapters must dual-track run status —
  never wait on the stream alone.
- Settle = `agent.completed` event + run status `yielded`. ~13k input tokens/turn
  (~$0.04) against the staging worker.
- `@agentclientprotocol/sdk@1.3.0` **exact pin**: stable `ndJsonStream(output, input)`
  (NOT `./experimental/node`, which is HTTP/WS helpers);
  `agent().onRequest(...).onNotification(...).connect(stream)`; `connection.closed`
  (there is no `.done`); auto `-32601`; malformed lines silently skipped; **EOF drops
  buffered pending requests** (serve tests must drive interactively: write frame → await
  response → end stdin); hidden `zod/v4` dep satisfied by the repo's zod ^4.x.
- Deploy-api env facts: the live deployment is `--env prod` (default env is an undeployed
  stub); engine is deployed to staging only; `drwn store seed` no longer exists ≥0.9.0
  (its error-string absence is a conclusive old-image marker).

## 3. Remaining work, in order

1. **Phase 4 — cancellation** against the ratified [I106] contract
   (`darwinian-worker/.ai/analyses/cl0106_run_cancellation_interface_request.md` for the
   cross-repo interface; `darwinian-services/.ai/analyses/cl0106_cancellation_target_architecture.md`
   and `.ai/tasks/cl0106_cancellation_task_plan.md` for the DS design and execution ladder):
   `agent.cancelled` stream variant, owner-only auth, staged
   C+A mechanism (cooperative flag + AbortSignal accelerator), v1 returns honest
   `cancelling`. DS builds the endpoint; our side is a RED suite first (the I105 plan's
   Phase 4 section in `cl0105_acp_agent_surface_task_plan.md` has the folded-in ratified
   contract). Coordinate with PR #97's owner — their session core is where cancellation
   lands.
2. **Phase 5 — Buzz delivery rider** (this is what makes it *Buzz* support, not just
   editor-generic): fake-Buzz conformance suite (Buzz initializes as protocol-v2-shaped;
   compatibility verified in the spike), `com.block.buzz` `_meta` upstream draft,
   `drwn worker secret set` (per-worker secrets — DS moved to the per-worker framework;
   secrets still key on mind_id as naming lag, see
   `cl0105_posting_identity_relay_membership_analysis.md` in this repo).
3. **Live evidence**: manual Zed smoke (Remy's item), `DRWN_E2E_DEPLOY=1` two-turn
   deployed-worker gate (test exists on PR #97, credential-gated), live device flow.
4. **Ship mechanics**: cut a `darwinian` release carrying `acp` + `materialize`; DS bumps
   the image pin, swaps DeployRunner to the one-line materialize invocation, deletes the
   bridge; R2-staged archives ride `--store-export` when their >1 MiB fix lands.

## 4. Core file pointers

**Adapter (on PR #97's branch; foundation also on `remy/I105-acp-adapter`):**
`cli/commands/acp/{acp,serve}.ts` · `cli/core/acp/{connection,project-events,worker-binding,session,auth}.ts`
· tests `test/core-acp-*.test.ts`, `test/commands-acp-serve.test.ts`, `test/e2e-acp-editor.test.ts`.
The SDK spike suite (`test/core-acp-sdk-spike.test.ts`) locks the §2 SDK behaviors — if an
SDK bump changes one, the spike fails before the adapter mysteriously does.

**Materialize (on main):** `cli/core/worker-materialize.ts` (validate/T1/T2/orchestrate/emit)
· `cli/commands/worker/materialize.ts` · `cli/core/worker-deploy.ts`
(`buildWorkerDeployPayload`, `createStoreExportForLock`, `WORKER_DEPLOY_CONTRACT_VERSION`)
· `cli/core/archive.ts` (`create`/`extract`/`list`, `noMtime`) · install cores:
`ensureCardPresentFromLock` (card-install), `syncRepository` (sync; `repoRoot` means the
**packaged drwn checkout**, never the project root).

**Test conventions:** run everything with `bunx bun@1.2.21`. Golden payloads are built,
never hand-written: `test/worker-materialize-fixture.ts` (`goldenPayload`/`freshRoots`) —
this held when [I220]'s payload change merged mid-flight with zero golden-suite edits.
`test/helpers.ts` has `scaffoldCliFixture`/`envFor`/`runAgentsCli(args, env, cwd)`.
`publishBlueprint` is a per-file local helper (not exported); `fakeJwt` likewise.

**Architecture/decision docs (this repo):** `cl0105_acp_buzz_worker_integration_target_architecture.md`,
`cl0105_acp_agent_surface_task_plan.md` (wire facts + ratified Phase 4 folded in),
`cl0106_run_cancellation_interface_request.md`, `cl0107_tool_governance_constraint_analysis.md`,
and the `cl0220_*`/`cl0221_*` G1s, plans, review01/review02, completions.
**Cross-repo (darwinian-services `.ai/analyses/`):** `cl0106_acp_deploy_api_remediation_handoff.md`,
`cl0106_addendum01_staging_runtime_bump_request.md` (§7 ledger, §8 verified-transform recipe),
`cl0204_acp_live_lane_completion_handoff.md` (SCQA, all open questions + options),
`cl0106_cancellation_target_architecture.md`, and `cl0107_tool_governance_target_architecture.md`;
the corresponding execution plans live under `darwinian-services/.ai/tasks/`.

## 5. Environment traps (each cost real time)

- **Pin the runner**: `bunx bun@1.2.21 test ...`. The bunx shim cache under
  `/private/tmp/bunx-*` gets reaped; a mid-run ENOENT on the bun binary means re-prime
  with `bunx bun@1.2.21 --version`.
- **`Bun.spawn` cwd trap**: a nonexistent `cwd` surfaces as ENOENT *on the executable
  path* — misleading; check the cwd exists first.
- **Never mutate node_modules during a suite run** (a concurrent `bun add` once produced
  151 false failures).
- **Pipe exit codes**: `cmd | tail; echo $?` reads tail's code — capture separately.
- **wrangler**: `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_API_TOKEN_NONPROD` (env token
  shadows OAuth). **ntn**: `NOTION_API_VERSION=2022-06-28` for the `after` param.
- **The main checkout** (`~/dev/darwinian-minds`) has a parked 4-file stash-pop conflict
  (includes [I34]'s `routine.ts` — not ours to resolve; Remy's item). Work from clean
  worktrees under `~/.config/superpowers/worktrees/darwinian-worker/`.

## 6. Workflow context (CL Issue-driven v0.4)

- Tracker: data source `393f1fbe-f8c2-8024-81c0-000bdf389999` ("CL Issue Tracker v0.4").
  Rows: [I220] `3b4f1fbe-f8c2-810e-8851-d795c6bc31d4`, [I221]
  `3b4f1fbe-f8c2-8136-b436-dd398ec3de1d` (both Knowledge-captured). [I105]/[I106]/[I107]
  rows exist — find via the tracker; [I106]/[I107] execution is DS-side.
- Every status change is one atomic transaction: property + Issue Status table + newest-first
  thread entry with **real user mentions** for cross-person events.
- **Owner-as-reviewer grants are session-scoped.** This session had one for the ACP wave
  and for [I220]/[I221]. A successor must obtain a fresh explicit grant from Remy before
  self-reviewing any gate — do not inherit it from this document.
- Knowledge Base: data source `e46d0c97-330e-465a-9502-a01f56f0c306`; entries exist for
  [I220]/[I221] (linked on their rows).
- Repo rules: commit messages carry **no AI attribution of any kind**; commit prefixes are
  area-based (`.ai/rules/repo-wide/` conventions where present, else house style);
  PR bodies include a `Testing & CI evidence` section; TDD with RED observed before every
  GREEN is a review gate, not a preference.

## 7. First moves for a successor

1. Read PR #97's current state (it may have merged); sync with its owner on Phase 4
   placement before writing the cancellation RED suite.
2. Check the DS side: has the image pin bumped / DeployRunner swapped ([I221] adoption)?
   Has the [I106] cancellation endpoint landed? Both change what Phase 4 can assert live.
3. Confirm with Remy: release-cut timing, and whether the Phase 5 rider's
   `com.block.buzz` `_meta` draft should go upstream first or ride the fake-Buzz suite.
