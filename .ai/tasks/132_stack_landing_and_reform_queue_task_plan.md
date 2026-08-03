# ABOUTME: Operational task plan for landing the materialization stack (I24 PR #59 → I104 PR #60 → consent extraction) as stacked PRs under CL Issue-driven Workflow v0.4, then queueing the card-source-path-reform and machine-scope-blueprint tasks.
# ABOUTME: Handoff-ready: every branch operation, verification recipe, Notion transaction, and blocking checkpoint enumerated with evidence. Cross-issue campaign doc (spans I24, I104, three new rows), hence local `132_` numbering, not `clNNNN_`.

# Task 132 — Stack Landing (Option 1: Stacked PRs) + Reform Queue

> Execute directly (operator + Claude working the checklist top-to-bottom). Phases 2–4 have human blocking checkpoints (reviewer gates); do not skip them.

**Goal:** Land the three-layer branch stack (I24 instructions projection, I104 materialization, consent-impact feature) onto `main` as three cleanly-scoped stacked PRs with complete v0.4 workflow records, then queue tasks 130/131 (rows created, docs renamed to `clNNNN`, G1+G2 review requested).

**Architecture:** The four bodies of work already form one linear git stack (`#59 → #60 → consent → gate3-fixes`, proven by ancestry). Strategy: update each existing PR branch in place bottom-up, redistribute the two top commits to their owning layers (`55a775a`→#59, `a8dfbb6`→#60), open consent as a third stacked PR, and let GitHub retarget on each merge. No history rewriting on shared branches; merges and cherry-picks only.

**Tech stack:** git + `gh` CLI, `ntn` (Notion CLI) against CL Issue Tracker v0.4, bun 1.2.21 (`bun run typecheck`, `bun run test`), git worktree + submodule for isolated verification.

**Status**: Awaiting operator decisions D1–D4, then execute.
**Created**: 2026-08-02
**Owner**: Remy K · **Reviewer**: Minseung Lee
**References**: [tasks/130_card_source_path_reform_implementation_plan.md, tasks/131_machine_scope_blueprint_implementation_plan.md, analyses/130_card_source_path_reform_target_architecture.md, analyses/131_machine_scope_blueprint_target_architecture.md, tasks/cl0153_cursor_opencode_integration_task_plan.md, tasks/cl0171_card_based_mcp_control_plane_task_plan.md, rules/01_git.md, AGENTS.md, https://github.com/remyjkim/darwinian-worker/pull/59, https://github.com/remyjkim/darwinian-worker/pull/60]

---

## Verified facts base (do not re-derive; re-verify only where marked ⟲)

**Git topology** (as of 2026-08-02):

```
origin/main @ 8f3c11f  (#80 CLI retirement line)          local main @ 919cd9d = 5 BEHIND origin
│
├─ origin/remy/24-worker-instructions-projection @ fbcd408   ← PR #59 (I24, DRAFT, base main), 4 commits, pre-#80
│    └─ origin/release/architect-provisioning-v1 @ 6d6e5d1   ← PR #60 (I104, OPEN, base #59), pre-#80
│
└─ LOCAL ONLY, linear chain on top of #60's content:
     release/architect-provisioning-v1 @ 5bdc560   = origin#60 + 10 commits, INCLUDING:
        17ed4f3  merge origin/main (#80 pulled in; conflicts were auth/worker/release files only)
        5bdc560  [other] restore exact-1.0.0 pin in verifyWorkerContract after #80 merge  (6 lines, scripts/verify-release-readiness.ts)
        2e05cdf  [docs] record cross-owner ratification of CL0024 addendum (Review 01 B1–B4 closed)  ← clears I104's merge blocker B1
        ed8e99f  [chore] ignore drwn local-state…, 80c966d [docs] AGENTS.md tracking
     feat/consent-impact-auto-regrant @ ce3e917    = above + d7fc607 (consent feature) + ce3e917 (its docs)
     feat/gate3-materialization-review-fixes @ 55a775a = above + a8dfbb6 (I104 GATE-3 fixes) + 55a775a (write-watch test stabilize)
```

- Commit ownership: `d7fc607`+`ce3e917` = consent feature (files: `cli/commands/card/publish.ts`, `projects.ts`, `up.ts`, `cli/core/card-project.ts`, `card-store.ts`, `project-registry.ts`, `worker-project.ts`, `cli/index.ts` + 4 test files). `a8dfbb6` = I104 (org-worker materializer files). `55a775a` = stabilizes `test/commands-write-watch.test.ts`, a file **introduced by #59** → belongs to I24's layer.
- Consent files are disjoint from I104's files; consent depends on the stack (its `card-project.ts`/`worker-project.ts` edits build on #59/#60 changes, +142/+38 lines vs main).
- **#59 × current origin/main merges clean**: `git merge-tree` = 0 conflicts; merged tree passes `tsc --noEmit`. The 31 bun-test failures observed in a bare worktree are ENOENT artifacts of the **uninitialized `darwinian-worker-skills` submodule** (identical on clean main) — NOT regressions. Verification recipe below fixes this.
- The 6-line pin fix touches only `scripts/verify-release-readiness.ts`, which is **not** in #59's change set → #59 needs no pin work; #60 already carries it locally.

**Notion / workflow** (CL Issue Tracker v0.4, data source `393f1fbe-f8c2-8024-81c0-000bdf389999`):

- I24 row `39df1fbe-f8c2-813e-bc5c-eabd396e9040` — Owner Status `Received`, Reviewer Status empty, page is a v0.2-era snapshot (no Issue Status table / Issue Thread). GATE 2 plan was no-go'd (Blocked); implementation nevertheless completed on-branch; `cl0024_review02_worker-instructions-projection-execution-readiness.md` exists in #59 — ⟲ read its verdict during Phase 2 to reconstruct gate state.
- I104 row `3a8f1fbe-f8c2-8114-a0bc-ce19e1ca9b91` — Owner Status `In Review`, Reviewer Status empty, page pre-dates v0.4 structures. Review 01 verdict: conditional go, sole merge blocker B1 (cross-owner ratification) — closed by `2e05cdf` (unpushed).
- Status options (exact strings): Owner `Received | Created | Architecting | Planning | Building | In Review | Blocked | Merged | Knowledge-captured | Cancelled`; Reviewer `Before G1 | G1 Review | G1 Passed / Before G2 | G2 Review | G2 Passed / Before G3 | G3 Review | G3 Passed | G3 Approved`; Type `Feature | Bug | Refactor | Research | Infra | Docs | Architecture`; Priority `P0–P3`. Repo select has **no darwinian-worker option** — leave blank with a page note (I104 precedent).
- Notion user IDs for real mentions: Remy K `d0486a86-ca9e-4763-9564-2fdef08c8abf`, Minseung Lee `1e5d872b-594c-819e-882d-0002642b0f99`.
- Atomic transaction contract: 1 · DB property → 2 · Issue Status table → 3 · newest-first Issue Thread entry (timestamp, event label, one-line title, evidence, next action; cross-person headers use real user mentions from the row's Owner/Reviewer) → 4 · Slack only as alert (per D4). Mirror table/thread structure from a current well-formed issue page (e.g. I174) since I24/I104 predate v0.4.

**Working tree** (dirty; dispositions in Phase 0): drwn-projected per-machine files `.claude/CLAUDE.md`, `.claude/settings.json` (has `_drwn` managed block + absolute paths), `.claude/settings.local.json`, `.codex/hooks.json` (absolute path to composer) → gitignore. Tracked-lane drwn project state `.agents/drwn/{.gitattributes,card.lock,config.json,vendor-manifests/,vendor/}` (the `.gitignore` carves out only `.local` variants and `generated/`) → commit post-stack. Planning docs (`130_*`, `131_*`, this file, `128–133` analyses, `cl0149/cl0153/cl0171` docs, `.ai/communications/`), modified `125_*analysis.md`, stray `test/scenarios-mind-card-command-contract.test.ts` → see Phase 0 + D3.

**Workflow-rule drift (reported per AGENTS.md card requirement — do not silently mix):** the card cites `.ai/rules/org-wide/06_issue_workflow.md`, `repo-wide/01_git_conventions.md`, `repo-wide/02_test_stack.md`; none exist in this repo. Actual rules: `00_docs_usage.md` (backend_v1-era boilerplate), `01_git.md` (headed "iMinds monorepo" but its prefix table matches this repo's real history), `06_task_planning.md`. The card's `pnpm <area>:test` claim is wrong here (repo is bun-only). **Resolution for this campaign**: AGENTS.md v0.4 contract governs workflow state; `01_git.md` prefix table + observed history govern commits; bun commands govern tests. Follow-up (out of scope): write a real `.ai/rules/` issue-workflow file.

## Success criteria

- [ ] PR #59, PR #60, consent PR merged to `main` in order, each with G3 pass recorded and the mandatory `Testing & CI evidence` PR-body section.
- [ ] I24 and I104 pages carry v0.4 structures; every state change was an atomic 3-part transaction; both reach `Merged` (→ `Knowledge-captured` per D-phase note).
- [ ] Three new tracker rows exist (consent, 130, 131) with `[I<N>]` titles read back from generated IDs; numbers recorded in this doc's Decision Log.
- [ ] 130/131 docs renamed to `cl<NNNN>_…` with the four content revisions applied; committed on their issue branches; combined G1+G2 readiness review requested (cl0153_review01 precedent).
- [ ] Working tree clean; redundant local branches deleted only after containment verified.
- [ ] Coordination notes delivered: cl0171 realignment (I171 thread), cl0153 sub-PR1-before-130, PR #67 `cli/index.ts` collision noted on the consent PR.

## Decision log

**Resolved:**
- Option 1 (stacked PRs) — Remy, this session. Consent = own issue. 130/131 get tracker rows; `[I<N>]` drives names; no preallocation.
- Commit redistribution: `55a775a`→#59, `a8dfbb6`→#60, consent keeps `d7fc607`+`ce3e917`.
- No AI/LLM traces in commit messages (`01_git.md` §Commit Policy 4).

**Resolved 2026-08-02 (operator answers):**
- **D1 — conditional sign-off**: proceed with the shipped code IF (a) no conflicting parts between #59/#60 and tasks 130/131, and (b) all tests pass.
  - **(a) discharged with evidence**: 130's plan citations line-match the current stack tree exactly (`readCardSourceState` @ `card-source.ts:426`, `publishCard` @ `card-store.ts:774`, `createCardSource` @ `card-store.ts:321`) — the 130/131 plans were investigated against the post-stack tree, so the stack is their assumed baseline, not a conflict. Relationships are prerequisite/sequencing: #59's projection machinery is what 131 extends (its `sync-machine-instructions.ts` is designed as a sibling of #59's `sync-project-instructions.ts`); #60's materializer is orthogonal to both reforms; 130 deliberately rewrites the publish path including consent's additions.
  - **(b)**: Phase 0.6 baseline + per-layer 2.4-recipe verifications are the gate; un-draft of #59 waits for green.
- **D2**: retro G1/G2 note on the consent row page, straight to G3.
- **D3**: park the stray test untracked; revisit post-campaign.
- **D4**: Slack drafts only — Claude writes the alert text, Remy sends.

---

## Phase 0 — Working-tree triage + drift report (local only, no pushes)

- [x] 0.1 Drift reported (this doc, §facts). Operator ack = plan approval (2026-08-02, with D1 conditions).
- [x] 0.2 Done via `git fetch origin main:main` (no checkout needed; dirty tree untouched). Local main = `8f3c11f`; origin unmoved; PR branches unmoved. ⟲ Re-probe stands if origin moves later.
- [x] 0.3 Done in a clean worktree: commit `56cd411 [chore] ignore drwn-projected harness adapter configs` on `release/architect-provisioning-v1`.
- [ ] 0.4 Leave `.agents/drwn/` tracked-lane state untracked for now → committed in Phase 5 (avoid bloating #60 with ~80 vendor files).
- [ ] 0.5 Leave planning docs untracked until their homes exist (Phase 5/6/7). Nothing is deleted. D3 decides the stray test file.
- [x] 0.6 Baseline recorded 2026-08-02: typecheck 0 errors; **1775 pass / 6 skip / 0 fail**, 7876 expect() calls, 301 files, 278.65s (current branch `55a775a`, submodule present). D1 condition (b) first half: green.

## Phase 1 — Notion bootstrap (first outward writes; after D1–D4)

- [x] 1.1 Backfilled 2026-08-03: v0.4 headers (Issue Status table + reconciliation 📝 entry + conventions toggle) inserted at top of both pages via read-modify-write (`ntn pages update` replaces content — originals backed up in scratchpad; post-verify confirmed all original signatures preserved: I104 51→106 lines, I24 198→253). Note: replace-updates on non-empty pages need a long timeout (first attempt timed out at 2min with NO partial write — verified before retry).
- [x] 1.2 **Created 2026-08-03: consent = I175** (`3b1f1fbe-f8c2-8186-aff5-ef53d4073edb`), retitled `[I175] Card consent-impact report on publish and auto-re-grant on up/update`. Owner Remy K, Reviewer Minseung Lee, Feature/P3, Owner Status `In Review`, Reviewer Status `G2 Passed / Before G3` (retro-folded G1/G2 per D2, declared in the row's 📝 entry; flips to `G3 Review` at Phase 4.2), Started 2026-08-01. Body: I174-shaped (status table + thread + conventions toggle + details). Note: `Reviewer Status` is a **select**, `Owner Status` a **status** property.
- [x] 1.3 **Created: 130 = I176** (`3b1f1fbe-f8c2-8110-92c8-cf1078642040`), retitled `[I176] …`. Owner Status `Architecting`, Reviewer Status `Before G1` (flips to `G1 Review` when the docs PR posts, Phase 6). Body written.
- [x] 1.4 **Created: 131 = I177** (`3b1f1fbe-f8c2-815a-94be-ca4589abff12`), retitled `[I177] …`. Owner Status `Architecting`, Reviewer Status `Before G1`. Body written (incl. I176 hard-prerequisite + I171/cl0153 conflict flags).
- [ ] 1.5 Thread-entry mechanics (all transactions): append blocks via `ntn api post /v1/blocks/{page_or_toggle_id}/children`; cross-person headers use real mention objects:
```json
{"type":"mention","mention":{"user":{"id":"d0486a86-ca9e-4763-9564-2fdef08c8abf"}}}   // Remy K
{"type":"mention","mention":{"user":{"id":"1e5d872b-594c-819e-882d-0002642b0f99"}}}   // Minseung Lee
```
   Entry shape: `[MMDDYY HH:MM] <event label> · <one-line title>` + evidence line (PR/commit/test counts) + `Next:` line. Stack immediately below the conventions toggle, newest first.

## Phase 2 — Land PR #59 (I24) — blocked by D1

- [x] 2.1 Done (branch created tracking origin, in isolated worktree — dirty main tree untouched).
- [x] 2.2 Merged clean: `3016e4f` (0 conflicts, as probed).
- [x] 2.3 Cherry-picked clean as `350fd06`.
- [ ] 2.4 **Verify (isolated-worktree recipe — the submodule step is mandatory):**
```bash
git worktree add /tmp/verify-59 remy/24-worker-instructions-projection
cd /tmp/verify-59 && git submodule update --init darwinian-worker-skills
bun install && bun run typecheck && bun run test
# expect: typecheck 0 errors; test counts ≥ Phase 0.6 baseline, 0 fail
cd - && git worktree remove /tmp/verify-59
```
- [x] 2.4-recipe verification GREEN 2026-08-03: typecheck 0 errors; **1685 pass / 6 skip / 0 fail** (289 files) — layer population; full-stack tree = 1775/6/0, delta is upper layers' tests.
- [x] 2.5 Pushed `fbcd408..350fd06`; PR #59 un-drafted; retitled `[I24] Worker instructions projection — consented org instructions into the AGENTS.md managed block`.
- [x] 2.6 Body rewritten (Testing & CI evidence, stack position, gate history; AI-attribution footer removed).
- [x] 2.7 review02 verdict read: **"Go for plan handoff; product execution remains gated"** (2026-07-23) — G2 story: review01 no-go → revised → review02 go.
- [x] 2.8 Transaction complete: Owner Status `In Review`, Reviewer Status `G3 Review`; table cells updated (G2 verdict, G3 requested); 🚦 entry with Remy→Minseung mentions at thread top. (Layout note: thread entries stack newest-first ABOVE the conventions toggle, matching live tracker practice (I174) rather than the card's below-the-toggle wording — recorded as drift observation.)
- [x] 2.9 Checkpoint collapsed 2026-08-03: operator exercised **owner-as-reviewer** authority ("Since we are the reviewer"). **PR #59 MERGED as `65d94c7`.** I24 DB truth set: Owner `Merged`, Reviewer `G3 Passed`. ✅ thread entry + G3 cell deferred to the Notion-retry task (see ops note below).

## Phase 3 — Land PR #60 (I104)

- [x] 3.1 Cherry-picked clean as `5c1cf57` (on top of `56cd411` gitignore + `5bdc560` pin). Verification running.
- [x] 3.2 Pushed `6d6e5d1..5c1cf57` then `..393926e`; PR #60 retitled `[I104] …`, body rewritten (B1 closure, B4 version-bump disclosure, evidence: **1766 pass / 6 skip / 0 fail**, 300 files).
- [x] 3.3 GitHub did NOT auto-retarget (base branch still existed) — retargeted explicitly via `gh pr edit 60 --base main`. Merged origin/main into the branch (clean; delta exactly `350fd06`'s test edit); typecheck 0 + targeted write-watch 9/9.
- [x] 3.4 Done (see 3.2).
- [x] 3.5 Superseded by owner-as-reviewer flow: statuses went straight to terminal (Owner `Merged`, Reviewer `G3 Passed`).
- [x] 3.6 Checkpoint collapsed. First `gh pr merge` bounced on stale mergeability (branch strictly ahead — conflict impossible, verified via `merge-base --is-ancestor`); recomputed to MERGEABLE in ~5s; **PR #60 MERGED as `77c7364`.** ✅ thread entry + cell deferred (ops note).

**Ops note (Notion API incident, 2026-08-03):** whole-page `ntn pages update` replaces timed out twice on the large I24 page (verified zero partial writes each time before retry); switched to block surgery (append + cell patch), whose writes then also hung — root-cause candidates: a **4h-stale `ntn` GET from another session** (darwinian-services, malformed `?page_size` URL, PID 37255) + API slowness. DB properties (the workflow truth) all landed fast. Deferred artifacts: I24/I104 ✅ toggles + G3 cells — guarded finisher scripts + payloads in scratchpad (`i24_finisher.sh`, `i104_finisher.sh`), duplicate-safe, run when API recovers. Lesson: prefer block-append over page-replace for large pages; always verify state before retrying a timed-out Notion write.

## Phase 4 — Land consent PR (I175)

- [ ] 4.1 After I175 exists: `git branch remy/I175-consent-impact-auto-regrant ce3e917 && git push origin remy/I175-consent-impact-auto-regrant`.
- [ ] 4.2 Open PR: base `release/architect-provisioning-v1` while #60 is open (stacked; three-dot diff = `d7fc607`+`ce3e917` only), title `[I175] Consent-impact report on publish; auto-re-grant on up/update`. Note in body: `cli/index.ts` command-registration collision with PR #67 (I34) — whoever lands second rebases (trivial).
- [ ] 4.3 After #60 merges: retarget/auto-retarget to main → `git merge --no-edit origin/main` → verify (2.4 recipe, `verify-consent`) → push.
- [ ] 4.4 Row transaction per D2 default: Reviewer Status `G3 Review`, thread entry. **⛔ CHECKPOINT: Minseung G3** → merge → `Merged` ack transaction.
- [ ] 4.5 Branch hygiene (only after all three merges, each verified contained in main via `git branch --merged main`): delete local+remote `feat/gate3-materialization-review-fixes`, `feat/consent-impact-auto-regrant`, `release/architect-provisioning-v1`, `remy/24-worker-instructions-projection`.

## Phase 5 — Post-stack repo hygiene (small chore PR or direct commits per `01_git.md` policy — operator's call at execution)

- [ ] 5.1 `[chore] track drwn project card state` — add `.agents/drwn/{.gitattributes,card.lock,config.json,vendor-manifests/,vendor/}`.
- [ ] 5.2 `[docs] absorb planning inbox` — this doc, modified `125_*`, analyses `128–133`, `cl0149/cl0153/cl0171` docs, `.ai/communications/`. (130/131 docs excluded — they land renamed on their issue branches, Phase 6/7.)
- [ ] 5.3 D3 disposition for the stray test file.

## Phase 6 — Queue task 130 (I176)

- [ ] 6.1 `git checkout -b remy/I176-card-source-path-reform origin/main` (post-stack main).
- [ ] 6.2 `git mv`-equivalent renames: `tasks/130_…_implementation_plan.md → tasks/cl0176_card_source_path_reform_task_plan.md`; `analyses/130_…_target_architecture.md → analyses/cl0176_card_source_path_reform_target_architecture.md` (zero-pad to 4). Fix the cross-links between them.
- [ ] 6.3 Apply the four content revisions: (a) Phase-0 "no worktree/branch/commits" → "execute on the issue branch with incremental commits"; (b) same in Notes-for-operator; (c) add coordination note: cl0153 sub-PR1 lands first (it publishes via the flow 130 deletes); (d) refresh test-count expectations against the Phase 0.6 baseline.
- [ ] 6.4 Commit `[docs] I176 card source path reform — G1 architecture + G2 task plan`, push, open a **docs PR** (G1+G2 package).
- [ ] 6.5 Row transaction: Owner Status `Architecting→Planning` as artifacts post; Reviewer Status `G1 Review`; thread entry proposing the **combined G1+G2 readiness review** (cl0153_review01 precedent) to Minseung.
- [ ] 6.6 **⛔ CHECKPOINT: G1(+G2) pass** → Owner ack → `Building` may begin (execution of the 130 plan itself = separate effort, out of this doc's scope).

## Phase 7 — Queue task 131 (I177)

- [ ] 7.1 Same shape as Phase 6 on `remy/I177-machine-scope-blueprint` (docs may branch off I176's branch or main — docs are conflict-free either way). Renames to `cl0177_machine_scope_blueprint_{task_plan,target_architecture}.md`.
- [ ] 7.2 Content revisions: (a) fix the false shared-file claim — 130∩131 = `machine-config.ts` + `types.ts`, **not** `effective-state.ts`; (b) branch-mode Phase 0 rewrite; (c) resolve the `~/.agents/skills/` "out of scope yet repopulated" seam against cl0153 sub-PR2 (D2b) — one paragraph stating who owns that surface; (d) note Building starts only after I176 lands (v0.4 allows the docs/G1/G2 to run ahead).
- [ ] 7.3 Docs PR + row transaction + combined G1+G2 request, as 6.4–6.5.
- [ ] 7.4 Coordination (may run any time after I177 exists): draft I171 thread note — cl0171's machine-activation design assumes the v1 model I177 deletes; realign while cl0171 is pre-G1. Operator approves posting (cross-owner: JGB).

## PR body template (all three PRs)

```markdown
## Summary
<what this layer delivers, 2–4 bullets, issue-scoped>

## Stack position
Base: <main | #59 | #60> · Layer <1|2|3> of the I24→I104→I175 stack. Merge order enforced bottom-up.

## Testing & CI evidence   <!-- mandatory section, GATE 3 -->
- `bun run typecheck`: 0 errors  (isolated worktree + darwinian-worker-skills submodule)
- `bun run test`: <N> pass / <N> skip / 0 fail vs baseline <Phase 0.6 counts>
- <layer-specific evidence: live-ingestion probe (#59) · B1 ratification + receipt determinism (#60) · consent-impact test files (consent)>

## Breaking changes
<explicit list or "none">
```

## Testing strategy (TDD contract)

This campaign ships **no new production code** — it lands already-written, already-tested layers and edits docs. The contract is therefore verification-of-evidence, not red→green:

- **Behaviors & invariants**: every landed layer keeps the full suite green (0 fail) at ≥ the Phase 0.6 baseline; no layer may merge on a red or degraded suite; the submodule-initialized worktree recipe (2.4) is the only accepted local evidence format.
- **Layer ownership**: unit/integration = existing `test/*.test.ts` suites (bun); release gates = `scripts/verify-*` suites (require submodule); E2E = existing `e2e-*` tests. No mocks introduced anywhere.
- **Ordered increments**: verify #59-merged tree → verify #60 tree (pre- and post-#59-merge) → verify consent tree. Each verification precedes its push.
- **Case catalog (campaign-specific)**: (1) merge #59×main conflict-free; (2) cherry-picks `55a775a`/`a8dfbb6` apply clean; (3) consent diff vs #60 = exactly 2 commits; (4) post-merge main passes full suite; (5) no `sources/`-era paths altered (guard for 130's later baseline).
- **Commands & environment**: `bun install; bun run typecheck; bun run test` (bun 1.2.21; submodule initialized). CI: whatever `.github/workflows` runs on PR — treat CI green as required alongside local evidence.
- **Definition of green**: typecheck 0 errors; test 0 fail, skips ≤ baseline; CI checks pass on the PR.
- **Non-goals & residual risk**: no new tests written for the landing itself; risk of latent semantic conflict between #80 and I24 code paths is bounded by the full-suite runs (currently: typecheck-verified clean, suite pending per-layer runs).

## Risks

| Risk | L | Mitigation |
|---|---|---|
| Minseung G3 latency stalls the chain | M | Stacked PRs allow parallel review; #60/#4.2 can be opened before #59 merges |
| origin/main advances mid-campaign | M | ⟲ re-probe merge-tree at 0.2/2.2/3.3; recipes are idempotent |
| Cherry-picks conflict (unexpected coupling) | L | Verified disjoint file sets; if conflict → STOP, re-derive ownership, don't force |
| Notion API shape mismatch (`ntn` beta) | M | ⟲ `--help`/`ntn api … --spec` probes before first write; block-append fallback documented (1.5) |
| I24 gate reconstruction contested | M | 2.7 reads review02 verdict first; thread entry states reconstruction explicitly; D1 sign-off gates the phase |
| Consent PR collides with PR #67 on `cli/index.ts` | L | Noted in PR body; second-lander rebases (trivial registration block) |

## Out of scope

- Executing the 130/131 implementation plans (this doc only queues them).
- cl0149, t86, ACP/Buzz family (independent tracks).
- Writing the real `.ai/rules/` issue-workflow file (drift follow-up — recommend a docs issue).
- Slack channel/workflow automation beyond optional alerts (D4).
