# ABOUTME: Handoff record for the 2026-08-03 stack-landing campaign — what landed, what is queued, what is deferred, and exactly how to pick up execution of [I176] card source path reform next.
# ABOUTME: Written for a coworker with zero context on this session. Every claim carries evidence (commit SHA, PR number, test counts, Notion page id). Companion to the campaign plan `132_stack_landing_and_reform_queue_task_plan.md`.

# Handoff — Stack Landing Campaign → [I176] Execution

**Status**: Active handoff. Campaign phases 0–7 complete; [I176] implementation not started.
**Created**: 2026-08-03
**Owner**: Remy K · **Reviewer**: Minseung Lee (owner-as-reviewer in force — see §5)
**Predecessor**: [`132_stack_landing_and_reform_queue_task_plan.md`](./132_stack_landing_and_reform_queue_task_plan.md) — the campaign plan this executed.
**Next artifact**: [`cl0176_card_source_path_reform_task_plan.md`](./cl0176_card_source_path_reform_task_plan.md) — the plan you will execute (currently on branch `remy/I176-card-source-path-reform`, not on `main`).
**References**: [tasks/132_stack_landing_and_reform_queue_task_plan.md, tasks/cl0176_card_source_path_reform_task_plan.md, tasks/cl0177_machine_scope_blueprint_task_plan.md, tasks/cl0153_cursor_opencode_integration_task_plan.md, tasks/cl0171_card_based_mcp_control_plane_task_plan.md, analyses/cl0176_card_source_path_reform_target_architecture.md, analyses/cl0177_machine_scope_blueprint_target_architecture.md, rules/01_git.md, AGENTS.md, https://github.com/remyjkim/darwinian-worker/pull/71]

---

## 1. Read this first — the 60-second version

A three-layer branch stack that had been sitting unpushed for ~8 days was landed to `main`, its two follow-on reform tasks were given tracker rows and docs PRs, and the repo was tidied. **`main` is now `ab060ff`, green at 1773 pass / 6 skip / 0 fail.**

Your job: **execute [I176] card source path reform** — eliminate `~/.agents/drwn/sources/`, make card sources path-addressable (`drwn card publish --from <path>`). The plan is written, verified against the current tree, and gate-approved (§5). Start at §7.

**The single most important operational fact:** always run tests with the submodule initialized, or you will chase ~31 phantom failures. See §6.

## 2. What landed this session

| PR | Issue | What | Merge commit |
|---|---|---|---|
| [#59](https://github.com/remyjkim/darwinian-worker/pull/59) | I24 | Worker instructions projection — consented org instructions into the AGENTS.md managed block | `65d94c7` |
| [#60](https://github.com/remyjkim/darwinian-worker/pull/60) | I104 | Worker-local materialization of accepted Org Worker bundles | `77c7364` |
| [#69](https://github.com/remyjkim/darwinian-worker/pull/69) | I175 | Consent-impact report on publish; auto-re-grant on up/update | `4522bef` |
| [#70](https://github.com/remyjkim/darwinian-worker/pull/70) | — | Post-stack hygiene: track drwn card state, absorb planning inbox | `ab060ff` |

Per-layer verification before each push (submodule-initialized worktree, `bun run typecheck` + `bun run test`):

- #59: typecheck 0 errors · **1685 pass / 6 skip / 0 fail** (289 files)
- #60: typecheck 0 errors · **1766 / 6 / 0** (300 files)
- #69: typecheck 0 errors · **1773 / 6 / 0** (300 files) ← **current regression floor**

Why the stack existed: I104 was built on I24's branch and split into its own issue for review size; the consent feature was then built on top of I104. Ancestry proved it was one linear chain, so it landed bottom-up as stacked PRs rather than being untangled.

## 3. Current repository state

- **`main` = `ab060ff`** (in sync with `origin/main`).
- **Working tree**: clean except one deliberately parked file — `test/scenarios-mind-card-command-contract.test.ts` (untracked, unowned by any issue; decision D3 = park, revisit post-campaign). Do not sweep it into an unrelated commit.
- **Open PRs from this campaign**: [#71](https://github.com/remyjkim/darwinian-worker/pull/71) (I176 docs), [#72](https://github.com/remyjkim/darwinian-worker/pull/72) (I177 docs). Unrelated open PRs: #67 (I34 routines), #68 (I80 auth default).
- **Branches**: `remy/I176-card-source-path-reform` and `remy/I177-machine-scope-blueprint` carry the docs. `feat/gate3-materialization-review-fixes` is intentionally retained as the only copy of the pre-cherry-pick commit SHAs; its content is fully in `main` (verified by `git cherry`), so it is safe to delete once you are confident.
- **Now gitignored** (commit `56cd411`): `.claude/CLAUDE.md`, `.claude/settings.json`, `.claude/settings.local.json`, `.codex/hooks.json` — drwn-projected per-machine adapters that were showing as untracked noise.
- **Now tracked** (commit `73108b6`): `.agents/drwn/{card.lock,config.json,.gitattributes,vendor/,vendor-manifests/}` — 74 files, the project's card state lane.

## 4. Issue tracker state (CL Issue Tracker v0.4)

Data source: `393f1fbe-f8c2-8024-81c0-000bdf389999`

| Issue | Page id | Owner Status | Reviewer Status |
|---|---|---|---|
| I24 | `39df1fbe-f8c2-813e-bc5c-eabd396e9040` | Merged | G3 Passed |
| I104 | `3a8f1fbe-f8c2-8114-a0bc-ce19e1ca9b91` | Merged | G3 Passed |
| I175 | `3b1f1fbe-f8c2-8186-aff5-ef53d4073edb` | Merged | G3 Passed |
| **I176** (this work) | `3b1f1fbe-f8c2-8110-92c8-cf1078642040` | Planning | G1 Review |
| I177 | `3b1f1fbe-f8c2-815a-94be-ca4589abff12` | Planning | G1 Review |

I175/I176/I177 were **created this session** (they did not exist before). Identity rule was followed: create row → read generated `ID` → retitle `[I<N>] …`. Note the local doc numbers `130`/`131` map to tracker issues **I176**/**I177** — the docs were renamed accordingly (`cl0176_…`, `cl0177_…`).

Useful constants:
- Notion user ids for real mentions: **Remy K** `d0486a86-ca9e-4763-9564-2fdef08c8abf` · **Minseung Lee** `1e5d872b-594c-819e-882d-0002642b0f99`
- `Owner Status` is a **status** property; `Reviewer Status` is a **select** property (they need different JSON shapes).
- Option strings: Owner `Received | Created | Architecting | Planning | Building | In Review | Blocked | Merged | Knowledge-captured | Cancelled`; Reviewer `Before G1 | G1 Review | G1 Passed / Before G2 | G2 Review | G2 Passed / Before G3 | G3 Review | G3 Passed | G3 Approved`.
- The tracker's `Repo` select has **no `darwinian-worker` option** — leave it blank and note the repo in the page body (I104 precedent).

## 5. Decisions in force (do not re-litigate)

| # | Decision | Made by |
|---|---|---|
| D1 | I24's shipped scope stands alone; broader spine-delivery questions stay deferred. Conditioned on (a) no conflict with I176/I177 — verified — and (b) tests green — verified. | Remy, 2026-08-03 |
| D2 | I175 entered at G3 with G1/G2 retro-folded on the row (implementation predated the row). | Remy |
| D3 | `test/scenarios-mind-card-command-contract.test.ts` parked untracked. | Remy |
| D4 | **Slack: draft only.** Compose alert text and hand it to Remy; never send. | Remy |
| D5 | **Owner-as-reviewer.** Remy exercises review authority directly; G3 passes are recorded as owner-as-reviewer in the thread, not as cross-person handoffs (no reviewer mention on those entries). | Remy |
| D6 | Landing shape = **stacked PRs** (Option 1 of four evaluated). | Remy |
| D7 | **Proceed with I176 execution now** — record the G1+G2 pass owner-as-reviewer and begin, rather than landing cl0153 sub-PR1 first. | Remy, 2026-08-03 |

## 6. Operational knowledge you will otherwise learn the hard way

**Where to work — use a worktree, but know what it does and does not isolate.**

The previous session worked in the **primary tree** (`/Users/pureicis/dev/darwinian-minds`), using throwaway worktrees only for per-layer verification (all removed). For I176 — 7 phases, ~45 test files — prefer a dedicated worktree so `main` stays free:

```bash
git worktree add ~/.config/superpowers/worktrees/darwinian-worker/i176-card-source-path-reform remy/I176-card-source-path-reform
cd ~/.config/superpowers/worktrees/darwinian-worker/i176-card-source-path-reform
git submodule update --init darwinian-worker-skills   # REQUIRED — see below
bun install
```

Three things a worktree does **not** give you here:

1. **The submodule does not come along.** Without the init above you get ~31 phantom failures (below). This is the most common hour-loser.
2. **The gitignored harness configs are absent.** `.claude/settings.json` and `.codex/hooks.json` hold *absolute* paths into `/Users/pureicis/dev/darwinian-minds/.agents/drwn/generated/hooks/`; being gitignored, they do not exist in a new worktree, so drwn's projected hooks will not fire there. Harmless for test work — surprising if you expect hook behavior.
3. **⚠️ It gives NO isolation from the machine-global drwn store.** This is the real risk in I176: Phase 3 writes `~/.agents/drwn/config.json` and **Phase 6a deletes `~/.agents/drwn/sources/`** — both mutate the operator's actual machine regardless of which worktree you sit in. For every manual CLI verification (Phase 7's `drwn card new` / `card publish --from` / `config set`), redirect the store first:

   ```bash
   export AGENTS_DIR=/tmp/drwn-i176-scratch
   ```

   Verified: `cli/context.ts:28` reads `process.env.AGENTS_DIR ?? resolveAgentsDir(homeDir)`, so this redirects the entire store — it is the supported knob and I176 leaves it unchanged.

   Only run against the real `~/.agents` deliberately, and **confirm with Remy before Phase 6a's deletion** — it removes `~/.agents/drwn/sources/` from the operator's actual machine. The automated suite is already safe: `test/helpers.ts:175-181` (`envFor`) sets `AGENTS_DIR` to a per-fixture temp store on every CLI invocation.

**Testing — the submodule is mandatory.** `darwinian-worker-skills` is a git submodule holding the operator profile's cards/skills. A fresh worktree without it produces **~31 phantom `ENOENT` failures**, all in the operator / machine-profile / release-gate cluster (`e2e-operator-profile-contract`, `core-machine-config`, `core-defaults`, `release-readiness`, `scripts-verify-*`). They fail identically on clean `main`, so they are not regressions. Always:

```bash
git submodule update --init darwinian-worker-skills && bun install && bun run typecheck && bun run test
```

This matters doubly for I177, whose target files are exactly that cluster.

**Repo is bun-only.** `bun run typecheck` (tsc --noEmit), `bun run test` (bun test ./test/). Full suite ≈ 280s. Ignore any instruction mentioning `pnpm <area>:test` — see the drift note in §9.

**Commit prefixes** come from `.ai/rules/01_git.md`: `[chore]`, `[docs]`, `[test]`, `[refactor]`, `[feat]`-style area tags. **No AI/LLM attribution in commit messages or PR bodies** — repo rule, strictly enforced.

**Notion via `ntn` CLI** (the Notion MCP server needs OAuth unavailable in non-interactive sessions):
- `ntn api /v1/pages/<id> -X PATCH -d '<json>'` for properties — fast and reliable.
- `ntn pages update <id> --content "<markdown>"` **replaces the whole page** and **times out on large pages** (I24 failed at both 2min and 10min). Always re-fetch and verify state before retrying a timed-out write — in every observed case nothing partial was written, but confirm rather than assume.
- Block-level append (`PATCH /v1/blocks/<id>/children`) **rejects the `after` parameter** on this API version, so appends land at page end — which is the wrong place for newest-first thread entries. This is why §8's deferred item is still open.
- Endpoint paths need explicit `-X GET` on `ntn api` or you get `invalid_request_url`.
- Thread entries in live practice stack **newest-first above** the `📖 Issue Thread conventions` toggle (I174 precedent), even though the AGENTS.md card says "immediately below the toggle". Follow the live practice; the discrepancy is logged as drift.

**GitHub quirks seen:** merging a stacked PR does **not** auto-retarget its child if the base branch still exists — retarget explicitly with `gh pr edit <n> --base main`. And `gh pr merge` can bounce once on stale mergeability right after a base change; re-check `gh pr view <n> --json mergeable` and retry (verify with `git merge-base --is-ancestor main <branch>` that a conflict is actually impossible before retrying).

## 7. Your next task — execute [I176]

**Gate status: G1+G2 approved owner-as-reviewer per D7.** If the tracker row still reads `G1 Review` when you pick this up, record the pass first (property update + Issue Status table + thread entry), then set Owner Status → `Building`.

**Plan**: `.ai/tasks/cl0176_card_source_path_reform_task_plan.md` — on branch `remy/I176-card-source-path-reform` (PR #71), not yet on `main`. Work on that branch with **incremental commits, one per phase**.

**Verified before handoff** — you are not starting from an unvalidated plan:
- Every file:line citation checked line-exact against the current tree: `readCardSourceState` @ `cli/core/card-source.ts:426`, `publishCard` @ `cli/core/card-store.ts:774`, `createCardSource` @ `cli/core/card-store.ts:321`.
- Nothing is implemented yet — confirmed by signature probe: `resolveCardSourceDir` and `resolveSourcesRoot` still exist, `readCardSourceState(agentsDir, name)` unchanged, no `--from` flag, no `cli/commands/config.ts`.
- Regression floor: **1773 pass / 6 skip / 0 fail** on `ab060ff`.

### Two amendments to the plan, resolved after it was written

**(a) Phase 2i (`worker/mind/checkpoint.ts`) is NOT the hard problem the plan calls it.** The plan says "the trickiest… investigate the exact resolution during execution" and floats a `--source-dir` flag fallback. It isn't needed. The file is 65 lines; the resolver appears once, inside a loop already guarded by `existsSync` (`cli/commands/worker/mind/checkpoint.ts:42-48`):

```ts
const sourceDirs: Record<string, string> = {};
for (const card of index?.cards ?? []) {
  const dir = resolveCardSourceDir(this.context.agentsDir, card.card);
  if (existsSync(dir)) { sourceDirs[card.card] = dir; }
}
```

Post-reform this becomes a one-line swap to the catalog resolver — `resolveSourceDirByName(agentsDir, card.card)` — and the existing `existsSync` guard already handles the not-found case gracefully. No new flag.

**(b) Consequence — a phase-ordering wrinkle to fix.** Phase 2i now consumes `resolveSourceDirByName`, which **Phase 3b builds**. As written, Phase 2 runs before Phase 3. Either move 2i to after 3b, or hoist 3b (the catalog-checkout resolver) into Phase 2. Decide before starting Phase 2; note it in the plan when you do.

### Highest-leverage sequencing (from the plan, still accurate)

1. **Phase 1a** — `readCardSourceState` + `readSourceManifestForMutation` to `(sourceDir)`. This silently fixes all 12 mutation wrappers.
2. **Phase 4a** — `test/helpers.ts`: the two hardcoded `join(fixture.agentsDir, "drwn", "sources", …)` lines at **198** (inside `publishCardWithSkills`, declared at 183) and **227** (inside `publishExactOperatorProfile`, declared at 224). They are the only two `"sources"` literals in the file. Fixing them heals ~30 of the ~45 affected test files.
3. Everything else is mechanical.

## 8. Deferred / open items — inherited, none blocking

| Item | State | Action |
|---|---|---|
| **I24/I104/I175 ✅ thread entries** | DB properties correct (Merged / G3 Passed); the narrative toggles never landed — `pages update` times out on those pages, block-append can't position at thread top (§6) | Payloads staged in the session scratchpad. Needs a different placement approach or a manual paste. Cosmetic audit trail, not workflow state. |
| **cl0153 sub-PR1** | Not landed. Card-repo work; its own plan states "no CLI code change" | Per D7 we execute I176 first. Afterward, rewrite its ~2 publish steps to the `--from` form. Not a technical blocker either way. |
| **[I171] realignment note** | Drafted in PR #72's body, **not posted to the I171 row** | Cross-owner message to JGB. cl0171's machine-activation design assumes the v1 profile model that I177 deletes; it is still pre-G1, so realigning now is cheap. Needs Remy to send or approve. |
| **cl0153 sub-PR2 G2** | Unwritten | Must be drafted against I177's v2 closure model, not the v1 profile model. Ownership boundary for `~/.agents/skills/` is spelled out in `cl0177_…_task_plan.md` §Out of scope. |
| **Stray test file** | Parked untracked (D3) | Revisit post-campaign; it tests the BeginningDB command contract against both Mind Cards. |

## 9. Repo-rule drift (reported, unresolved — do not silently paper over)

`AGENTS.md` cites `.ai/rules/org-wide/06_issue_workflow.md`, `repo-wide/01_git_conventions.md`, `repo-wide/02_test_stack.md`. **None of these exist.** What exists: `.ai/rules/{00_docs_usage,01_git,02_tdd_practices,03_investigation_principles,04_identity_execution,06_task_planning,07_sdk_export_governance}.md`. Also, `00_docs_usage.md` is backend_v1-era boilerplate and `01_git.md` is headed "iMinds monorepo" (its prefix table nonetheless matches this repo's real history), and the card's `pnpm <area>:test` command map is wrong here (bun-only).

Resolution used this campaign, carry it forward: **AGENTS.md v0.4 contract** governs workflow state; **`01_git.md` + observed history** govern commits; **bun** governs tests. Writing a real `.ai/rules/` issue-workflow file is a worthwhile follow-up issue — out of scope here.

## 10. If you need to reconstruct context

- Campaign plan with full phase-by-phase execution record: `132_stack_landing_and_reform_queue_task_plan.md` (every phase carries its actual outcome, commit SHAs, and an ops note on the Notion incident).
- I176 architecture (the why): `analyses/cl0176_card_source_path_reform_target_architecture.md` — includes the three options considered and why path-addressable won.
- I177 architecture + plan: `cl0177_…` — read only if you are picking that up; **its Building phase is blocked until I176 lands** (they share `machine-config.ts` + `types.ts`).
