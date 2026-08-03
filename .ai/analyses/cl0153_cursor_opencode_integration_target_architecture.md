# ABOUTME: G1 target architecture for I153 — close the remaining cursor/opencode integration gaps that doc 126 (the approved Canonical Instructions Projection architecture) leaves open. Builds ON doc 126, does not re-derive it.
# ABOUTME: Umbrella architecture. Doc 126's Layer 1 (main worker instructions → AGENTS.md) is approved (22 Jul 2026) and shipped; this doc scopes I153 to the gaps doc 126 anticipated but didn't fully close for cursor/opencode.

# I153 — drwn support for Cursor & OpenCode · Target Architecture (G1)

**Status**: Draft for G1 review — v3, 2026-08-01. v2 rewrote the doc after discovering doc 126 already approved+shipped the instructions/AGENTS.md architecture; v3 folds in the evidence pass: drwn-lab experiment 05 **falsified Gap 1's D2a premise** (project `.opencode/skills/` does not win dedup on OpenCode 1.18.4 — D2b promoted), corrected the consent-activation statement to the amended contract (no first-party auto-grant, 072326), reconciled the sub-PR 1 status with the G2 v3, and recorded the latent Cursor post-tool context channel.
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

- **Layer 1 (main worker instructions) = consent-gated AGENTS.md managed block.** Card `instructions` compose into a marker-delimited, hash-sentineled `<!-- drwn:instructions:start -->` block at repo-root `AGENTS.md`; codex/opencode/cursor consume it natively, claude via a one-line `.claude/CLAUDE.md` import adapter. **Implemented and live** (`cli/core/sync-project-instructions.ts`; verified carrying the v0.4 contract in `~/dev/darwinian-minds/AGENTS.md`).
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
- **D2b — resolve the machine-default duplicate-source problem** (remove/relocate/customize-aware the uncustomized home copies; analysis 03): **the primary direction.** The fix belongs in drwn's machine-default materialization hygiene, not in a new project writer.
- **D2c (new, untested):** drwn already manages the project `opencode.json` (MCP merging) — if OpenCode offers a config-level skill-path precedence override, a managed entry could complement D2b. Whether such config exists is an open question for the sub-PR 2 G2.

The sub-PR 2 G2 designs D2b (with D2c as a possible complement) and re-verifies with the experiment-05 probes, which are cheap and deterministic.

### Gap 2 — Cursor skill-load is unverified  ← verification gap (not code)

Doc 126's table marks Cursor as "native + `.claude/skills` compat" for Layer 3, but this has never been runtime-verified. drwn projects skills to `.claude/skills/` + `.codex/skills/` (cursor's `skillSurfaces: ["claude","codex"]`), which doc 120 §3.1 says Cursor discovers — plausible, unproven. **No CLI change can substitute for a live Cursor session.** Precision on the verification vehicle: `cursor-agent` exists locally (2026.07.09) with a headless `--print` mode; it is blocked on **operator login**, not on GUI-only tooling. Target state: a documented manual smoke — via a logged-in `cursor-agent` session if it can exercise skills, else the GUI — in a fixture project (confirm the card's 13 skills appear, plus any project-closure extras; confirm one is invocable), recorded as the Cursor acceptance step with `cursor-agent login` named as the operator prerequisite.

### Gap 3 — Hook-context delivery to cursor/opencode  ← NOT a gap (closed by doc 126)

The experiment-04 "FAIL" for hook `additionalContext` reaching cursor/opencode is **already resolved by decision**, not by code: doc 126 Layer 1 (AGENTS.md) is the primary channel; the hook is deliberately demoted to a claude/codex complement (doc 125 §A3). **No I153 work here** — the earlier sub-PR 1 ("unify v0.4 contract delivery") is **moot**: the v0.4 contract already reaches all four runtimes via AGENTS.md. The only residual hook-related work is *optional*: keep `org-conventions` as a compaction-survival reinforcement for claude/codex (card-repo housekeeping; Option K is the default — see §5).

One latent capability worth recording so it isn't rediscovered the hard way: **Cursor has a complete but deliberately dormant post-tool context path** in the shipped CLI. drwn's cursor `hooks.json` registers `postToolUse` (`cli/core/hook-generator/sync-hooks.ts:121-122`), and the encoder emits `additional_context` at post-tool (`cli/core/hook-generator/encode-decision.ts:166-168`); the path is dead only because the generated composer discards post-tool decisions (`bundle-composer.ts`, the `afterToolCall` branch). If cursor-specific compaction-survival reinforcement is ever wanted, that is the contained one-line-plus-tests extension — with the caveats that post-tool timing is wrong for gating and that live Cursor uptake of `additional_context` is unverified (login-gated). Not I153 scope; YAGNI applies.

## 4. Target architecture (residual)

I153 adds nothing new architecturally — it **completes doc 126** by closing the gaps its approved design anticipated:

| Gap | Target state | New concept? |
|---|---|---|
| Gap 1 (OpenCode skills) | D2b: machine-defaults fix (D2a falsified by experiment 05; D2c config-precedence lever to be checked in the G2) | No — machine-default hygiene per drwn-lab analysis 03 |
| Gap 2 (Cursor verify) | Documented manual smoke; CI covers T4/T5 projection | No |
| Gap 3 (hook context) | None — closed by doc 126 Layer 1 decision | — |

## 5. Implementation split (revised sub-PRs)

| Sub-PR | Gap | Scope | Primary repo | Status |
|---|---|---|---|---|
| **1 — Card housekeeping (was "unified delivery")** | Gap 3 residual | Reconcile the `org-conventions` hook with doc 126's demotion: make `instructions.md` the canonical contract source; shorten/dedupe the hook's `additionalContext` (it's now a claude/codex compaction reinforcement, not the primary). Card v1.2.0. | card | G2 v3 exists (2026-07-31), positioned under this G1. **Option K (keep the hook, reconciled) is the default per this G1** — housekeeping, not a design fork; the G2's Option-K/R sign-off gate is dissolved (R stays available if K's cost surprises). |
| **2 — OpenCode machine-default skill shadowing** | Gap 1 | Implement D2b (machine-defaults fix; analysis 03), evaluating D2c (managed `opencode.json` precedence entry) as a complement. D2a is off the table (experiment 05). | machine-config (+ possibly CLI `opencode.json` writer) | G2 to draft |
| **3 — Cursor smoke docs** | Gap 2 | Document + execute the manual verification | docs | G2 to draft |

Sub-PR 1 is now **low-priority card housekeeping**, not the headline. Sub-PR 2 (the real OpenCode bug) is the substantive work. Sub-PR 3 is documentation.

## 6. What "done" looks like for I153 (revised)

- [ ] **G1 passed**: this architecture reviewed (note: much of the design is doc 126's, already approved — G1 review is largely scope confirmation).
- [ ] **Sub-PR 2 merged**: OpenCode loads the *project's customized* skills, not uncustomized home copies (experiment 04 T7a → green, re-verified with the experiment-05 sentinel probes).
- [ ] **Sub-PR 3 done**: Cursor manual smoke documented + executed (experiment 04 T6 cursor → green or honestly documented as GUI-dependent).
- [ ] **Sub-PR 1 (optional) merged**: `org-conventions` hook reconciled with its demoted role; card v1.2.0.
- [ ] drwn-lab card annotation updated: cursor/opencode show the doc-126 Layer-1 reality (AGENTS.md ✅; hook is secondary).

## 7. Out of scope

- **Re-deciding the instructions architecture** — doc 126 is approved; I153 builds on it.
- **doc 126 Phase 2 (sub-worker instructions)** — separate, gated on its own verify items.
- **OpenCode agent-uptake LLM smoke** — needs a non-`zai-coding-plan` provider; follow-on.
- **Machine-default skill dedup broadly** — D2b touches opencode; a comprehensive fix is a separate machine-defaults issue.

## 8. References

- **The approved architecture**: [doc 126](./126_feature_canonical_instructions_architecture_proposal.html), [doc 125](./125_feature_canonical_instructions_projection_decision_analysis.md), [doc 124/cl0024](./cl0024_worker-instructions-projection_target_architecture.md)
- The projection code (shipped): `cli/core/sync-project-instructions.ts`, `cli/core/sync-instructions.ts`
- drwn-lab evidence: experiments [05](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/05-opencode-skill-precedence/NOTES.md) (D2a falsified; dedup winner = `~/.agents/skills/`; LLM-free reproduction), [04](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/04-cursor-opencode-harness-verification/NOTES.md) (the gaps), [03](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/03-ai-narratives-worker-adoption/NOTES.md) (AGENTS.md already working), analysis [03](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/.ai/analyses/03_machine_default_customization_strategy.md) (the skill-shadowing root cause)
- Harness docs: [120](./120_cursor-configuration-guide.md), [121](./121_opencode-configuration-guide.md); target design [122](./122_feature_opencode_target_support_target_architecture.md)
