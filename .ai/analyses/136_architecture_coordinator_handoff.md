# ABOUTME: Full handoff to the successor architecture-coordinator for darwinian-worker — portfolio state across all five pending-issue clusters, the operating protocol, owner-pending decisions, perishables, and every piece of session knowledge not already durably recorded elsewhere.
# ABOUTME: Written 2026-08-05 by claude-i153 at owner request. Companion to 135_cursor_goose_direction_handoff.md (the I153-family deep handoff, merged) — this doc is the coordinator-level superset; where both speak, this one is newer.

# Architecture-Coordinator Handoff — darwinian-worker portfolio

**From**: `claude-i153` (Spr-33 AI-worker board row, marked handed-off)
**Date**: 2026-08-05
**Role handed off**: architecture coordination for the darwinian-worker (drwn) CLI — driving issues through the v0.4 gates, executing owner-delegated reviews via independent subagents, keeping the three Notion surfaces + repo `.ai/` + GitHub synchronized.
**Read order**: this doc → `135_cursor_goose_direction_handoff.md` (I153-family detail + environment ledger §5) → the per-issue Notion threads (newest-first) → gate reviews `cl0024_review01`, `cl0153_review02/03/04` (the quality bar).
**Truth hierarchy**: merged repo artifacts > Notion tracker rows/threads > board views > any doc's narrative (including this one). Known Notion staleness is listed in §6.

---

## 1. The operating protocol (how this seat works)

1. **Workflow v0.4** (page `3a6f1fbef8c2810184d1fef4491ece1d` — still marked "Proposal", operated as ratified; hook-enforced). Non-negotiables learned the hard way:
   - Every state change is a THREE-surface transaction: tracker property + **Issue Status table** + Issue Thread entry. The table is the surface this session repeatedly forgot until an audit (I153 thread entry 17); all five DW issue pages now carry it — keep them current.
   - Thread headers: event emoji + label, real user mentions both endpoints on cross-person entries, `@now`-style timestamps (this session used literal text — do better; API equivalent: a date mention).
   - Review results set Owner Status `Received` first, then the Owner acknowledges into the phase (this session jumped straight to Planning/Building — recorded deviation). G3 pass → `In Review` → `Merged`, not straight to Merged.
   - Completion requires `.ai/tasks/clNNNN_<slug>_completion.md` + Knowledge-captured. "Merged" is a milestone, not done.
2. **Owner-consolidated gates**: Remy is Owner AND Reviewer on the DW issues. Gate reviews are executed by **independent adversarial subagents** — never self-attest (the I104 "self-attested freeze" lesson, finding B1 of `cl0024_addendum01_review01`). The review prompts that produced the current bar: re-verify every claim with fresh commands; treat prior reviews as claims; give the production-effectiveness question its own section. `cl0153_review04` is the exemplar (it re-measured an empirical claim at n=90 and falsified the implementer's rate — that catch is the standard).
3. **Evidence before architecture**: probes decide, docs get annotated. Track record to cite when someone wants to skip the probe: D2a falsified (saved a wrong fix), D2c chosen by probes C/D, Q7's injection finding, Goose's AGENTS.md-native answer, Q8's `.jsonc`-wins. Probe assets: drwn-lab experiments 05/06/07 (see §7).
4. **Honest-claims doctrine**: probabilistic behavior is stated as probabilistic on every shipped surface (PR #81's docs/advisory language is the template). Unverified is named unverified. Cancellations are recorded, never deleted.
5. **Issue hygiene**: direction changes spawn issues (shrink, don't pivot — the I153 v5 precedent); decisions are 📝 entries; nothing enters `.ai/` without an issue number (see §6 naming-drift caveat).

## 2. Portfolio state — five clusters (evidence-based, 2026-08-05)

### Cluster 1 · I153-family closure — nearest to done
- **I153**: all substantive work merged (PRs #80/#81/#82/#88/#89/#90/#91; G1 v5; reviews 02/03/04). Remaining, in order: (a) sub-PR 1 (card housekeeping; plan `cl0153_cursor_opencode_integration_task_plan.md`, review03-corrected) — **blocked on I215**; (b) owner decisions Q7 + §7 exclusions (§3 below); (c) completion doc + Knowledge-captured. Status-table current; thread through entry 17.
- **I215** (`3b3f1fbe-f8c2-8141-b652-ecdee5676668`, Owner/Reviewer Remy, `Architecting · G1 Review`): the formalized card-repo repair — canonical `~/dev/darwinian-cards/cards/workflow-skills/` has HEAD=1.1.0 (green 96/96) vs an uncommitted-but-PUBLISHED 1.2.0 (version-pin test red at `test/card-contract.test.mjs:16`). I did NOT create or review this issue — read its G1 before acting; it unblocks I153 sub-PR 1.
- Next coordinator action: shepherd I215's G1, then execute sub-PR 1 (next-free version; I175 `drwn up` rollout — commands verified in review03 §sub-PR-1).

### Cluster 2 · OpenCode correctness debt
- **I199** (collision elimination; `Created · Before G1`): the only FULL closure of the shadowing residual (machine copy still wins 17–30%/run — review04 §3, n=90). Its G1 must build on the I177 machine Blueprint V2 (per-skill machine toggles are retired always-throw stubs: `cli/commands/machine/skill.ts:413-440`). Inherits two review04-re-review notes: the diagnostic's jsonc/json declared-check is optimistically OR'd (wrong-shaped given Q8: `.jsonc` wins — a `.json`-only declaration is inert when `.jsonc` exists), and the acceptance bar trades partial-regression sensitivity for stability.
- **Q7 finding** (exp-06; no issue row yet — awaiting owner disposition, §3): OpenCode deep-merges same-ID MCP entries per-field; user-scope `environment` injects into drwn-managed servers. Guard candidate: drwn writes an explicit `environment` field to occupy the merge slot (PROBE FIRST) + a same-ID-user-scope diagnostic.
- **Upstream reports ×2, drafted, unfiled** (owner go needed): the dedup race (draft in exp-05 NOTES §"Upstream report draft") and the Q7 deep-merge.

### Cluster 3 · Target transition (cursor → goose)
- **I213** (`Building`): phase 1 (signal) MERGED — PR #89 (`CURSOR_TARGET_DEPRECATED` advisory, registry default off, 8 docs pages marked). Phase 2 (removal) not started; needs its own G1 with blast-radius audit (~28 cli / 44 test / 14 docs files; skill compat dirs, hook runtime selection, encoder degradation are SHARED — removal must not touch what other targets use). Deliberately last-priority.
- **I214** (`Created`): evidence pass COMPLETE (exp-07: AGENTS.md native — no adapter; skills Claude-compat unchanged; MCP via project plugin dir `<project>/.agents/plugins/<name>/{plugin.json,.mcp.json}` with the global-config auto-enable side effect; hooks 11-event system, `SessionStart` live-fired, `PreToolUse` UNPROVEN; recipes = sub-worker analog; weekly minors → pin gates to binary versions). **G1 is the next big move** — three design questions: plugin-dir consent/ownership model, the global-config auto-enable, pre-tool verification. Template: doc 122 (opencode).
- **⚠️ PERISHABLE**: the Goose configuration guide is **UNTRACKED** at `~/dev/darwinian-minds/.ai/analyses/134_goose-configuration-guide.md` (main checkout). Commit it in I214's G1 docs PR before anything else touches that checkout. Do not renumber (135/136 taken).

### Cluster 4 · Parked/stalled drwn platform work
- **I34** Routines: `Received · G3 Passed`, PR #67 open since 07-31 — **G3 passed means merge allowed; this is a five-minute win** (acknowledge → merge → record). I did not review this work; do the merge-time sanity pass yourself.
- **I49** CLI fixes: `Blocked`, PR #57 (docs plan) stale-open since 07-22, no visible unblock condition — needs the v0.4 Blocked contract applied (name blocker + unblock condition) or Cancel-with-record.
- **I171** card-based MCP control plane: `Architecting` (plan `cl0171_..._task_plan.md` exists from the stack campaign). **I196** portable hooks: `Architecting`. **I159** secret attachment: `Received · G2 Review` (inbox debt). No motion observed on any during this arc — triage pass needed.
- **Sub-worker phase 2** (doc 126 Layer 2: `.opencode/agents/`, `.codex/agents/` TOML; `.cursor/agents/` dropped): NO issue row — unowned scope. Give it a row even if parked. Register V-B (codex TOML spawn honor) is its verify item.

### Cluster 5 · Verification & process debt (no rows — create them)
- **Operator-contract mystery**: ~20 tests red on EVERY local checkout (`scripts/verify-operator-contract.ts:21` expects `darwinian-worker-skills/cards/operator/` — a layout in NO commit of `curation-labs/darwinian-operator` through origin/main b62965f/v2.0.2) while **CI is green for an unexplained reason**. The investigation of WHY CI passes is the real payload — a wrongly-green gate is a false safety signal. High-leverage small issue.
- **v0.4 ratification**: the workflow page is still "Proposal for team review"; two naming conflicts to settle in its comments: reviews in `.ai/tasks/` (repo precedent + `00_docs_usage.md`) vs v0.4's `.ai/analyses/clNNNN_reviewNN`; and `NNN_`-numbered handoffs (133/135/136) vs "nothing without clNNNN".
- **Agent-uptake smoke** (does AGENTS.md content shape behavior, beyond delivery): excluded from I153 pending endorsement; needs a non-`zai-coding-plan` provider; unowned.

## 3. Owner-pending decisions (do NOT decide these yourself)
1. **Q7 disposition**: document-as-limitation vs the merge-slot guard + diagnostic (outgoing recommendation: the guard, as a small probe-first issue).
2. **I153 §7 exclusions endorsement**: agent-uptake smoke + non-cursor sub-worker surfaces stay out of I153 (one line closes it).
3. **Upstream OpenCode reports go/no-go** (both drafted; post under the owner's identity).
4. Cluster-5 row creation is safe to do without asking; their prioritization is the owner's.

## 4. Session lineage (for archaeology only — all merged/recorded)
The pre-I153 arcs this session also drove, in case threads resurface: I24 worker-instructions projection (PR #59) and I104 org-worker materialization (PR #60) — both merged 08-03 with cross-owner ratification 07-28; the shared register page (`[072226 Remy] Architect to drwn worker blueprint`, `3a5f1fbef8c28003a9c4cf4bf28a0ad5`) holds the glossary/conflict/decision record incl. C6's supersession by darwinian-org analysis 08; the org side lives in `~/dev/darwinian-org` (plans 01–09) and consumes `OrganizationProvisioningBlueprintV1`. Terminology governance: never "agent" for drwn concepts; "worker instructions"; drwn "approves", org "ratifies".

## 5. Fresh tooling knowledge not in 135 §5
- **Table-with-rows creation WORKS** via single append (that's how the v0.4 scaffolds were retrofitted onto I199/I213/I214) — while toggle-with-children appends hang. Dashboard-table row PATCHes are flaky (hung twice, then worked); register-table row PATCHes reliable; always verify writes landed.
- Tracker queries: `POST /v1/databases/393f1fbe-f8c2-8002-aa4a-f4f60c42df5d/query` with Owner Status filters; `ID` is a `unique_id` property (`{"unique_id":{"equals":N}}`). The Repo select has no darwinian-worker option — DW issues are identified by title `[DW]`/context, not the Repo field.
- Repo auto-merge is NOT enabled (`gh pr merge --auto` fails on some paths); the working pattern: background `until mergeStateStatus != UNSTABLE; then merge` loop.
- Docs deploys: any NEW page needs the lychee self-ref exclusion to cover the CURRENT domain (`docs.darwinian.dev` — fixed in PR #82); check `lychee.toml` first when a deploy 404-loops.
- Board conventions: Spr-33 dashboard (`3b1f1fbef8c28001a7e9d4bdd80b0c11`, agent table block `cb0e32f1431745e9b61404537d95196a`): register yourself as a new row (5 cells: agent·principal·authority / mission / claims / resume / heartbeat); the `claude-i153` row is marked handed-off — claim your own row, don't reuse it.

## 6. Known Notion staleness (correct as you touch)
- **I153 Owner Status = `Merged` is premature** (sub-PR 1 + close-out outstanding) — should be `Building` until the tail lands.
- Row `[I#] Issue Name` placeholder rows exist in the tracker (I210/I178/I173/I161/I152/I148) — not mine; ignore or flag.
- The Spr-33 board's non-agent sections were not audited this session; trust the tracker query over board cards.

## 7. Evidence index (what proves what)
| Artifact | Proves |
|---|---|
| drwn-lab exp 05 (+ race amendment + G3 correction + upstream draft) | D2a false; D2c novel-path-wins; shadowing rates (17–30%); `/var` claim unreproduced |
| drwn-lab exp 06 (Q1–Q9 board + rerunnable `q*-probe.sh`) | Q6 live hook enforcement PASS (no CF gateway needed); Q7 deep-merge FAIL/finding; Q8 `.jsonc` wins; Q9 MCP smoke PASS; XDG sandboxing pattern |
| drwn-lab exp 07 (24 evidence files) | every Goose surface verdict in Cluster 3 |
| `cl0153_review02/03/04` (merged) | the gate bar; the review04 §3 n=90 re-measurement; the ruling record (`.agents/drwn/opencode-skills/`) |
| I153 thread entries 1–17 | every state change with reasons; entry 17 = the v0.4 compliance audit |
| PR #81 docs (`using-opencode.md`, diagnostics-model) | the honest-claims template |

## 8. First-actions checklist (suggested order)
1. Register on the Spr-33 board; read 135 §5 (environment) before touching anything.
2. Merge I34 (PR #67) after a sanity pass — the free win — with the full v0.4 three-surface record.
3. Commit the untracked goose guide 134 into the I214 G1 branch (the perishable).
4. Shepherd I215 G1 → sub-PR 1 → I153 completion doc → Knowledge-captured.
5. Put the three owner asks (§3) in front of Remy in one message.
6. Create the Cluster-5 rows; triage Cluster 4 (I49 especially).
7. Start I214's G1.
