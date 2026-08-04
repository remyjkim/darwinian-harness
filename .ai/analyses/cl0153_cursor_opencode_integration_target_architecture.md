# ABOUTME: G1 target architecture for I153 — close the remaining cursor/opencode integration gaps that doc 126 (the approved Canonical Instructions Projection architecture) leaves open. Builds ON doc 126, does not re-derive it.
# ABOUTME: Umbrella architecture. Doc 126's Layer 1 (main worker instructions → AGENTS.md) is approved (22 Jul 2026) and shipped; this doc scopes I153 to the gaps doc 126 anticipated but didn't fully close for cursor/opencode.

# I153 — drwn support for Cursor & OpenCode · Target Architecture (G1)

**Status**: **G1 PASSED WITH CORRECTIONS — 2026-08-04** (independent gate review `cl0153_review02_g1_gate_review.md`; conditions C1–C5 and findings F5–F10 applied same-day in v4.1). Version history: v4, 2026-08-04. v2 rewrote the doc after discovering doc 126 already approved+shipped the instructions/AGENTS.md architecture; v3 folded in the evidence pass (experiment 05 falsified Gap 1's D2a premise — D2b promoted; consent statement corrected to the amended contract; sub-PR 1 status reconciled; latent Cursor post-tool channel recorded). **v4** is the full-integration audit after the I175/I176/I177 stack landed: Gap 1's D2b is **redesigned against the I177 machine-scope Worker Blueprint V2** (the pre-I177 "machine-config fix" framing is dead; the experiment-05 re-run of 2026-08-04 confirms the shadowing survives I177) with a doctor shadowing diagnostic added to acceptance; Gap 2 is **widened into a consolidated live-qualification checklist** (AGENTS.md ingestion + non-double-read, skill load, MCP V-C, hook-fire V-F) so one credentialed session clears the verify debt; §7 now separates hard out-of-scope from **exclusions pending owner endorsement** (sub-worker surfaces, agent-uptake smoke); sub-PR 1's rollout phase is superseded by the I175 `drwn up` auto-regrant flow (G2 updated).
**Issue**: [I153](https://app.notion.com/p/curation-labs/I153-drwn-support-for-cursor-opencode-3aef1fbef8c28017b1dee2019cfc63f6) (ID 153, read from Notion)
**Repo**: darwinian-minds (the `drwn` CLI) + darwinian-cards/cards/workflow-skills (the proof card)
**Builds on**: [doc 126](./126_feature_canonical_instructions_architecture_proposal.html) (approved 22 Jul 2026), [doc 125](./125_feature_canonical_instructions_projection_decision_analysis.md), [doc 122](./122_feature_opencode_target_support_target_architecture.md), PR #54
**Sibling G2 (sub-PR 1)**: [`../tasks/cl0153_cursor_opencode_integration_task_plan.md`](../tasks/cl0153_cursor_opencode_integration_task_plan.md) (also needs revision per §3 below)

> **Issue identity (v0.4):** ID 153 read from Notion; all artifacts use `cl0153_` / `[I153]`.

---

## 1. Purpose

drwn added Cursor and OpenCode as downstream targets in PR #54 (doc 122), and shipped the **Canonical Instructions Projection** architecture (doc 126, approved 22 Jul) whose Layer 1 delivers card instructions to a managed `AGENTS.md` block consumed by all four coding agents. **That delivery channel is built and live** — the v0.4 contract reaches cursor/opencode via AGENTS.md *today*.

I153's purpose is **not** to build that channel (done) nor to re-decide its design (approved). It is to **close the narrower integration gaps that remain for cursor/opencode** despite doc 126's Layer 1 being in place — gaps surfaced by drwn-lab experiments 02–04 and partially anticipated by doc 126's own verify-items table. This doc is the G1 for that residual work.

## 2. What doc 126 already settled (do not re-litigate)

The team approved the three-layer worker-instructions architecture on 22 July 2026. For I153, the load-bearing settled decisions are:

- **Layer 1 (main worker instructions) = consent-gated AGENTS.md managed block.** Card `instructions` compose into a marker-delimited, hash-sentineled `<!-- drwn:instructions:start -->` block at repo-root `AGENTS.md`; codex/opencode consume it natively (verified live 2026-07-23), cursor natively per its docs (ingestion = Q1 below), claude via a one-line `.claude/CLAUDE.md` import adapter. **Implemented and live** (`cli/core/sync-project-instructions.ts`; verified carrying the v0.4 contract in `~/dev/darwinian-minds/AGENTS.md`).
- **Block content = full composed text** (doc 125 B-Q3), not a pointer — so the v0.4 contract is *fully present* in the projected AGENTS.md, not a stub.
- **Activation = consent-gated per card** (`drwn card trust <card> --instructions`, doc 125 B-Q1) — **always explicit; there is no first-party auto-grant**. The original B-Q1 auto-satisfaction element was removed on 072326 (cl0024_review01 R1-F03; org `ContributionConsentSpec`) and the shipped code has no auto-grant path: consent is written only by explicit `card trust --instructions`, carried/refreshed across in-range updates of a previously explicit grant (`cli/core/card-project.ts:151-180,340-360`), or materialized from ratifier-attributed org-bundle consent evidence. Do not cite doc 125's un-annotated B-Q1 recommendation text for this.
- **The hook (`additionalContext`) is explicitly demoted** by doc 125 §A3: the team reversed from hook-injection (D) to AGENTS.md (C) on 22 July precisely because `additionalContext` "reaches claude and codex only — cursor degrades it, opencode plugins have no channel." The hook is "a complement for claude/codex if injected-strength per-session delivery is later wanted — not the primary."

**Implication for I153:** the experiment-04 "FAIL" verdicts for cursor/opencode were measuring the **hook** — which doc 126 had already relegated to secondary. Measured against the **primary** channel (AGENTS.md, doc 126 Layer 1), cursor and opencode *already receive* the v0.4 contract. The earlier framing that they "don't work" was wrong: the *content delivery* works; what remains are narrower correctness and verification gaps.

## 3. The actual remaining gaps (the real I153 scope)

Two genuine gaps survive doc 126 Layer 1, plus one verification gap. Each is narrower than the experiment-04 framing suggested.

### Gap 1 — OpenCode loads the wrong (uncustomized) skill bytes  ← real bug

OpenCode discovers the card's skills via `.claude/skills/` Claude-compat (doc 121 §3.1) — so Layer 3 of doc 126 reaches it. But its dedup resolves to the **uncustomized machine-home copies** over the project's customized ones (experiment 04 T7a):

```
existing=/Users/.../.agents/skills/writing-plans/SKILL.md   ← WINNER (uncustomized)
duplicate=/dev/<project>/.claude/skills/writing-plans/SKILL.md  ← DROPPED (CL-customized v1.1.0)
```

**This contradicts doc 126's table**, which says OpenCode project `.claude/skills` is "not discovered (verified live)" — the doc-126 live verification must have been on an OpenCode version/configuration that didn't do project discovery, but the installed one (1.18.4) *does*, and dedups wrongly. So this is a newly-confirmed bug, not an anticipated gap.

**Root cause (refined by experiment 05, 2026-08-01):** the machine-default skills problem from drwn-lab analysis 03 — and specifically, the winning path is `~/.agents/skills/`, **drwn's own machine-store skill projection**, with `~/.claude/skills/` also participating in collisions. The shadowing is drwn's machine-default materialization beating drwn's project materialization inside OpenCode's dedup — not a missing project surface.

**D2a is falsified, D2b promoted** (drwn-lab experiment 05, LLM-free `opencode debug skill` probes with sentinel-tagged copies on the installed 1.18.4):

- **D2a — project-scoped opencode skill surface** (`.opencode/skills/<name>/` writer, premised on doc 121 listing that path first in precedence): **does not fix the bug.** With a sentinel-tagged copy in project `.opencode/skills/`, the resolved winner is still `~/.agents/skills/` — the project sentinel is absent from the final skill set. The doc-121 precedence claim does not hold in practice on 1.18.4.
- **D2b — resolve the machine-default duplicate-source problem**: reframed 2026-08-04 against the I177 machine-scope Worker Blueprint V2 (cl0177 architecture + completion docs). The v3 framing ("remove/relocate the uncustomized home copies; a machine-config fix") described the pre-I177 world and is dead: `~/.agents/skills/` is now a **closure-derived projection with Card provenance**, and the machine closure itself includes workflow-skills — so the shadowing is drwn's machine Worker and drwn's project Worker projecting overlapping closures. Note (per cl0177 §3, confirmed at `cli/commands/machine/skill.ts:413-440`): the legacy per-skill `drwn machine skill enable|disable` commands are **retired always-throw stubs** — per-skill machine toggling is NOT an available lever; machine-side remedies would mean closure-aware projection changes against I177's fresh contract. The experiment-05 **re-run of 2026-08-04 confirms the shadowing survives I177 unchanged** (winner still `~/.agents/skills/`; both project sentinels absent).
- **D2c — DECIDED 2026-08-04, the selected mechanism** (experiment 05 addendum, probes C/D): the official `opencode.json` schema defines `skills.paths`; a config-declared **novel** directory wins the dedup outright (probe C sentinel won), while re-declaring a built-in-scanned path does not (probe D). Since drwn already owns managed `opencode.json` merging, the fix is: **a dedicated drwn-projected skills dir + a managed `skills.paths` entry** — no machine-projection change, no I177-contract churn. Frozen in the sub-PR 2 G2 (`cl0153_opencode_skill_shadowing_task_plan.md`); §9 steps 1/6 are the decision record. Whatever ships must be probed against both machine-side surfaces (`~/.agents/skills/` and `~/.claude/skills/` — experiment 05 shows both participate).

**Acceptance additions (v4):** a **doctor/ambient shadowing diagnostic** — today no drwn surface detects cross-scope same-name skill shadowing (verified by grep over `diagnostics.ts`/`ambient-capabilities.ts`), so even a perfect fix has zero regression detection; sub-PR 2 ships the check alongside the fix. Re-verification uses the experiment-05 probes, which are cheap, LLM-free, and deterministic.

### Gap 2 — Live qualification debt (cursor primarily; one opencode item)  ← verification gap (not code)

**Widened in v4** from "Cursor skill-load" to the full live-verification debt (G1 review C3 added the opencode MCP items). Q1–Q5 need the credentialed cursor session; Q6–Q9 are credential-free opencode checks. Shipped-but-never-live-observed, consolidated:

| # | Check | Origin | Harness |
|---|---|---|---|
| Q1 | Root `AGENTS.md` ingestion — the projected block's Instruction-ID is reported in-session | cl0024 architecture §8 / V-probe set (opencode+claude+codex passed 2026-07-23; cursor never run) | cursor |
| Q2 | Non-double-read — `.claude/CLAUDE.md` is NOT loaded alongside root `AGENTS.md` (distinct sentinels) | cl0024 V1 | cursor |
| Q3 | Skill load **and customized-version-wins** — the card's 13 skills (plus project-closure extras) appear, one is invocable, AND the loaded body carries the **project's customized content** (sentinel assertion, experiment-05 pattern) — cursor also scans `~/.claude/skills/`, which holds machine-default same-name copies, so enumeration alone would pass on the wrong bytes | doc 120 §3.1, doc 126 Layer 3 table; experiment 04 T7a "n/a" assumption corrected | cursor |
| Q4 | MCP config accepted — the drwn-written server entry (incl. the `"type"` field) is tolerated; same-ID project/user semantics observed | register V-C (the shared Notion register ([072226 Remy] Architect to drwn worker blueprint, §4 'Evidence-gated verify items', https://app.notion.com/p/curation-labs/072226-Remy-Architect-to-drwn-worker-blueprint-3a5f1fbef8c28003a9c4cf4bf28a0ad5); dw-122 V1/V2) | cursor |
| Q5 | Hook enforcement fires live — a deny/rewrite policy actually gates a tool call in-session (experiment 04 exercised the composer with mock payloads only) | register V-F | cursor |
| Q6 | Hook enforcement fires live in OpenCode (block/rewrite via the plugin) | register V-F | opencode |
| Q7 | OpenCode MCP same-ID semantics — the drwn-managed project server wins wholesale over a same-ID user-scope entry on a real install | doc 88 release item (V2 opencode half) | opencode |
| Q8 | `opencode.json` vs `opencode.jsonc` precedence when both exist | doc 88 release item (V5) | opencode |
| Q9 | Real-install MCP smoke — `opencode mcp list` shows the drwn-managed server and it starts | doc 88 release item | opencode |

**Operator prerequisites:** `cursor-agent login` (Q1–Q5; headless `--print` mode exists — 2026.07.09 binary — GUI is the fallback if skills aren't probeable headlessly) and the Cloudflare gateway env for the hook-fire checks where session-signal delivery is involved (Q5/Q6, per register V-F — the shared Notion register ([072226 Remy] Architect to drwn worker blueprint, §4 'Evidence-gated verify items', https://app.notion.com/p/curation-labs/072226-Remy-Architect-to-drwn-worker-blueprint-3a5f1fbef8c28003a9c4cf4bf28a0ad5)). Q6–Q9 need no operator credentials and may run immediately. Target state: the checks scripted/documented as sub-PR 3, executed as credentials allow, results recorded in drwn-lab as the acceptance evidence.

### Gap 3 — Hook-context delivery to cursor/opencode  ← NOT a gap (closed by doc 126)

The experiment-04 "FAIL" for hook `additionalContext` reaching cursor/opencode is **already resolved by decision**, not by code: doc 126 Layer 1 (AGENTS.md) is the primary channel; the hook is deliberately demoted to a claude/codex complement (doc 125 §A3). **No I153 work here** — the earlier sub-PR 1 ("unify v0.4 contract delivery") is **moot**: the v0.4 contract already reaches all four runtimes via AGENTS.md. The only residual hook-related work is *optional*: keep `org-conventions` as a compaction-survival reinforcement for claude/codex (card-repo housekeeping; Option K is the default — see §5).

This closure covers hook *context* only. Hook **enforcement** (deny/rewrite) is shipped for both harnesses but has never fired in a live session — that verification is deliberately NOT closed here; it lives in Gap 2's qualification checklist (Q5/Q6), so Gap 3's "closed by decision" cannot be misread as "hooks fully verified."

One latent capability worth recording so it isn't rediscovered the hard way: **Cursor has a complete but deliberately dormant post-tool context path** in the shipped CLI. drwn's cursor `hooks.json` registers `postToolUse` (`cli/core/hook-generator/sync-hooks.ts:134-135`), and the encoder emits `additional_context` at post-tool (`cli/core/hook-generator/encode-decision.ts:166-168`); the path is dead only because the generated composer discards post-tool decisions (`bundle-composer.ts`, the `afterToolCall` branch). If cursor-specific compaction-survival reinforcement is ever wanted, that is the contained one-line-plus-tests extension — with the caveats that post-tool timing is wrong for gating and that live Cursor uptake of `additional_context` is unverified (login-gated). Not I153 scope; YAGNI applies.

## 4. Target architecture (residual)

I153 adds nothing new architecturally — it **completes doc 126** by closing the gaps its approved design anticipated:

| Gap | Target state | New concept? |
|---|---|---|
| Gap 1 (OpenCode skills) | **D2c (decided 2026-08-04):** dedicated drwn-projected skills dir + managed `opencode.json` `skills.paths` entry (probe-C-verified winner; both machine surfaces probed) + the `OPENCODE_SKILL_SHADOWED` doctor diagnostic | No — extends drwn's existing managed opencode.json merge; the diagnostic follows doc 126's advisory pattern |
| Gap 2 (live qualification Q1–Q9) | Scripted checklist; Q1–Q5 in one credentialed cursor session, Q6–Q9 credential-free opencode checks; results recorded in drwn-lab | No |
| Gap 3 (hook context) | None — closed by doc 126 Layer 1 decision (enforcement live-fire tracked as Gap 2 Q5/Q6) | — |

## 5. Implementation split (revised sub-PRs)

| Sub-PR | Gap | Scope | Primary repo | Status |
|---|---|---|---|---|
| **1 — Card housekeeping (was "unified delivery")** | Gap 3 residual | Reconcile the `org-conventions` hook with doc 126's demotion: make `instructions.md` the canonical contract source; shorten/dedupe the hook's `additionalContext` (it's now a claude/codex compaction reinforcement, not the primary). Card bumped to the next free version after the in-flight 1.2.0 is reconciled. | card | G2 v3 exists (2026-07-31), positioned under this G1. **Option K (keep the hook, reconciled) is the default per this G1** — housekeeping, not a design fork; the G2's Option-K/R sign-off gate is dissolved (R stays available if K's cost surprises). |
| **2 — OpenCode machine-default skill shadowing** | Gap 1 | Implement the decided D2c mechanism: dedicated projected skills dir + managed `skills.paths` entry + `OPENCODE_SKILL_SHADOWED` diagnostic; acceptance = experiment-05 probes flip green against both machine surfaces. D2a is off the table (experiment 05; re-confirmed post-I177 2026-08-04); per-skill machine toggles do not exist (cl0177 §3). | CLI (skills writer + opencode.json merge + diagnostics) | G2 drafted (`cl0153_opencode_skill_shadowing_task_plan.md`) |
| **3 — Live qualification (Q1–Q9)** | Gap 2 | Script + document the nine checks; Q1–Q5 in one credentialed cursor session (`cursor-agent login`; CF gateway env for Q5), Q6–Q9 are credential-free opencode checks; record evidence in drwn-lab | docs + probe scripts | G2 drafted (`cl0153_live_qualification_task_plan.md`); cursor execution operator-gated |

Sub-PR 1 is now **low-priority card housekeeping**, not the headline. Sub-PR 2 (the real OpenCode bug) is the substantive work. Sub-PR 3 is documentation.

## 6. What "done" looks like for I153 (revised)

- [ ] **G1 passed**: this architecture reviewed (note: much of the design is doc 126's, already approved — G1 review is largely scope confirmation).
- [ ] **Sub-PR 2 merged**: OpenCode loads the *project's customized* skills, not uncustomized home copies (experiment 04 T7a → green, re-verified with the experiment-05 sentinel probes).
- [ ] **Sub-PR 2 also ships the shadowing diagnostic**: doctor/ambient reports cross-scope same-name skill shadowing, so the fix has regression detection.
- [ ] **Sub-PR 3 done**: the Q1–Q9 live-qualification checklist documented and executed (Q1–Q5 credentialed cursor session; Q6–Q9 credential-free opencode checks), evidence recorded in drwn-lab (or any blocked item honestly recorded as operator-gated with its named prerequisite).
- [ ] **Sub-PR 1 (optional) merged**: `org-conventions` hook reconciled with its demoted role; card bumped to the next free version (1.2.0 is already taken by the in-flight I176-era bump — reconcile with that uncommitted state first; see the G2's reality-check note).
- [ ] **Owner endorsement recorded** for the §7 exclusions (sub-worker surfaces; agent-uptake smoke) — deliberate scope, not inherited default.
- [ ] drwn-lab card annotation updated: cursor/opencode show the doc-126 Layer-1 reality (AGENTS.md ✅; hook is secondary).

## 7. Out of scope and exclusions

**Hard out of scope (settled elsewhere):**

- **Re-deciding the instructions architecture** — doc 126 is approved; I153 builds on it.
- **Machine-default skill dedup beyond OpenCode's shadowing** — sub-PR 2 fixes the OpenCode-facing collision under the I177 machine model; a comprehensive cross-harness machine-defaults policy, if ever needed, is a separate issue.

**Exclusions pending owner endorsement (v4)** — these bound what "full integration" means for I153; each is a deliberate scope decision the G1 reviewer and owner should endorse explicitly rather than inherit:

- **doc 126 Phase 2 (sub-worker surfaces: `.cursor/agents/`, `.opencode/agents/`, `.codex/agents/` TOML)** — not built for any target; gated on its own verify items (register V-A/V-B — the shared Notion register ([072226 Remy] Architect to drwn worker blueprint, §4 'Evidence-gated verify items', https://app.notion.com/p/curation-labs/072226-Remy-Architect-to-drwn-worker-blueprint-3a5f1fbef8c28003a9c4cf4bf28a0ad5)). Excluding it means I153 delivers *main-context* integration only. Endorsement pending.
- **Agent-uptake LLM smoke** (does the AGENTS.md content actually shape behavior in cursor/opencode, beyond delivery?) — needs a non-`zai-coding-plan` provider; currently unowned. Excluding it means I153's acceptance bar is deterministic delivery + Q1–Q9 live verification, not behavioral uptake. Endorsement pending.

## 8. References

- **The approved architecture**: [doc 126](./126_feature_canonical_instructions_architecture_proposal.html), [doc 125](./125_feature_canonical_instructions_projection_decision_analysis.md), [doc 124/cl0024](./cl0024_worker-instructions-projection_target_architecture.md)
- The projection code (shipped): `cli/core/sync-project-instructions.ts`, `cli/core/sync-instructions.ts`
- drwn-lab evidence: experiments [05](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/05-opencode-skill-precedence/NOTES.md) (D2a falsified; dedup winner = `~/.agents/skills/`; LLM-free reproduction), [04](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/04-cursor-opencode-harness-verification/NOTES.md) (the gaps), [03](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/03-ai-narratives-worker-adoption/NOTES.md) (AGENTS.md already working), analysis [03](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/.ai/analyses/03_machine_default_customization_strategy.md) (the skill-shadowing root cause)
- Harness docs: [120](./120_cursor-configuration-guide.md), [121](./121_opencode-configuration-guide.md); target design [122](./122_feature_opencode_target_support_target_architecture.md)
- The landed stack this v4 re-audits against: I175 (consent auto-regrant on `drwn up`/`update` — PR #69), I176 (canonical Card repositories — PR #71, [`cl0176 completion`](../tasks/cl0176_completion_card_source_path_reform.md)), I177 (machine-scope Worker Blueprint V2 — PRs #72/#75/#76, [`cl0177 architecture`](./cl0177_machine_scope_blueprint_target_architecture.md), [`cl0177 completion`](../tasks/cl0177_completion_machine_scope_blueprint.md)); upstream merges [PR #59](https://github.com/remyjkim/darwinian-worker/pull/59) (I24) and [PR #60](https://github.com/remyjkim/darwinian-worker/pull/60) (I104), both 2026-08-03

## 9. Execution sequence to completion (v4, 2026-08-04)

Ordered by dependency; owner-tagged. The two decision points and one credential
hand-off are the only human-blocking items.

| # | Step | Owner | Unblocks |
|---|---|---|---|
| 0a | Endorse/reject the §7 exclusions (sub-worker surfaces; agent-uptake smoke) | Issue owner | Final scope — G1 review cannot stall on "what does full integration mean" |
| 0b | Credentials: `cursor-agent login` + Cloudflare gateway env | Issue owner | Sub-PR 3 cursor probes (Q1–Q5) only — Q6–Q9 are credential-free |
| 1 | D2c empirical check | drwn worker | **DONE 2026-08-04** — experiment 05 addendum: config `skills.paths` with a **novel** dir wins the dedup; re-declaring a built-in-scanned dir does not. Sub-PR 2's leading mechanism follows |
| 2 | GATE 1 packaging: docs branch off `main`, docs PR, row → G1 ready | drwn worker | Everything downstream |
| 3 | G1 review pass | Reviewer | Sub-PR G2 reviews |
| 4 | Card-repo reconciliation: commit the in-flight 1.2.0 + version-pin test; publish-from-committed only | Card owner (parallel) | Sub-PR 1's publish step |
| 5 | Sub-PR 2 G2 review (`cl0153_opencode_skill_shadowing_task_plan.md`) | Reviewer | The substantive fix |
| 6 | Sub-PR 2 execution: dedicated projected dir + managed `opencode.json` `skills.paths` entry + doctor shadowing diagnostic; acceptance = experiment-05 probes flip green | drwn worker | OpenCode skills actually correct |
| 7 | Sub-PR 3 G2 + probe scripts (`cl0153_live_qualification_task_plan.md`) — parallel with 5–6; Q6–Q9 executable immediately (credential-free) | drwn worker | The credentialed session becomes execute-and-record |
| 8 | The credentialed cursor session: run Q1–Q5, record in drwn-lab (Q6–Q9 run earlier, credential-free) | drwn worker + owner credentials | Cursor moves from expected to verified |
| 9 | Sub-PR 1 (optional, last): hook reconciliation, AGENTS.md assertion test, next-free-version publish, `drwn up` rollout | drwn worker | Drift-prone duplicate contract copy closed |
| 10 | Close-out: §6 done-criteria walk, drwn-lab card annotation, register mirror, row → Merged → knowledge capture | drwn worker | Issue complete |

Completion = §6 checklist fully satisfied. Steps 5–7 may interleave; step 8 can
jump the queue if credentials arrive early (Q1–Q5 do not depend on step 6).
