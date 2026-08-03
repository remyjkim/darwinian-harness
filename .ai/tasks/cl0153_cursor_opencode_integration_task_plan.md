# ABOUTME: G2 task plan for I153 sub-PR 1 — unify delivery of the v0.4 workflow contract across all four harnesses by making the card's instructions surface (→ AGENTS.md) the primary channel, and reconciling the org-conventions hook to its correct role as optional compaction-survival reinforcement.
# ABOUTME: This is the first of three sub-PRs under the I153 umbrella G1 (cl0153_cursor_opencode_integration_target_architecture.md). Sibling sub-PRs: #2 (OpenCode skill surface, Gap 2) and #3 (Cursor smoke docs, Gap 3) draft after G1 pass.

# I153 · Sub-PR 1 — Unify v0.4 contract delivery: instructions as primary, hook as reinforcement · G2 Plan

**Status**: Planning (GATE 2 artifact for sub-PR 1) — v3, 2026-07-31. Positioned under the G1 architecture; supersedes the earlier standalone v1/v2 framings.
**Created**: 2026-07-31
**Issue**: [I153](https://app.notion.com/p/curation-labs/I153-drwn-support-for-cursor-opencode-3aef1fbef8c28017b1dee2019cfc63f6) (ID 153, read from Notion)
**Repo**: primarily `darwinian-cards/cards/workflow-skills` (the card); minor doc/test work in `darwinian-minds` (the CLI)
**Branch base**: off `main` (see §Workflow)
**G1 architecture**: [`../analyses/cl0153_cursor_opencode_integration_target_architecture.md`](../analyses/cl0153_cursor_opencode_integration_target_architecture.md) (this sub-PR is the §3 Gap 3 residual — card housekeeping under the G1 v3)
**References**:
- The card under change: `/Users/pureicis/dev/darwinian-cards/cards/workflow-skills/` (`card.json`, `instructions.md`, `hooks/org-conventions/policy.ts`)
- drwn-lab evidence: [`…/drwn-lab/experiments/04-cursor-opencode-harness-verification/NOTES.md`](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/04-cursor-opencode-harness-verification/NOTES.md) (the failing status quo — Gap 1)
- Projection mechanism (already correct, no CLI change): [`cli/core/sync-project-instructions.ts`](file:///Users/pureicis/dev/darwinian-minds/cli/core/sync-project-instructions.ts), [`cli/core/sync-instructions.ts`](file:///Users/pureicis/dev/darwinian-minds/cli/core/sync-instructions.ts)
- Hook policy (the surface we demote, not extend): [`cli/core/hook-policy/types.ts`](file:///Users/pureicis/dev/darwinian-minds/cli/core/hook-policy/types.ts), [`cli/core/hook-generator/encode-decision.ts`](file:///Users/pureicis/dev/darwinian-minds/cli/core/hook-generator/encode-decision.ts)

> **Issue identity (v0.4 contract):** Issue ID **153** was read from the Notion row. All artifacts use `cl0153_` / `[I153]`. Branch name: `<author>/<153>-unify-v04-contract-delivery` (sub-PR 1 of I153). Sibling sub-PRs 2 and 3 are separate branches under the same issue.

---

## Scope of this sub-PR (within the I153 umbrella)

This sub-PR is the **Gap 3 residual** in the G1 v3 numbering: card housekeeping that reconciles the `org-conventions` hook with doc 126's demotion of the hook channel. The v0.4 contract **already reaches all four runtimes via AGENTS.md** (doc 126 Layer 1, live) — this sub-PR documents and tests that as the primary channel and removes the drifted duplicate contract copy; it does not fix a delivery failure. It does **not** touch Gap 1 (OpenCode machine-default skill shadowing — sub-PR 2, D2b per experiment 05) or Gap 2 (Cursor skill-load verification — sub-PR 3). See the G1 §5 for the full split.

**The design rationale (why instructions/AGENTS.md, not hook hacks or session-start)** is in the G1 architecture §2 (what doc 126 settled) and §3 Gap 3 — read those before executing. The short version: the v0.4 contract is project-wide session-scoped static convention text (the same kind of content as persona/beliefs); drwn already delivers such content via the instructions surface to all four runtimes; the card already carries the contract in `instructions.md`; the hook was a redundant second channel that only worked for claude/codex. Making instructions the primary channel unifies delivery with correct timing and zero new CLI concepts. Post-tool hooks (rejected) and session-start hooks (rejected) are both inferior — see G1.



## Objective / target state

After I153:
1. **`instructions.md` is the single source of truth** for the v0.4 contract in the card. The `org-conventions` hook no longer carries a duplicate copy — it references the same content (or, if a hook-level string is still needed for claude/codex reinforcement, it is generated/derived from one canonical source so the two cannot drift as they have — 19 vs 18 lines today).
2. **All four harnesses receive the v0.4 contract via AGENTS.md** at session start, with correct timing. This already works today (no CLI change); I153 makes it the *documented primary* channel and tests it.
3. **The hook is reconciled, not extended.** Its header comment is rewritten to reflect the new layering (instructions = primary; hook = compaction-survival reinforcement for claude/codex). The v1 plan's post-tool Cursor patch is **dropped** — Cursor gets the contract via AGENTS.md (Layer 2), which is correct timing; the post-tool hack would deliver stale, mistimed content and is the wrong design.
4. **OpenCode AGENTS.md adoption is formalized** (reversing analysis 122 §D8's deferral): documented as OpenCode's delivery channel, with an LLM-free delivery test.
5. **The four CL projects** (`ai-narratives`, `darwinian-services`, `darwinian-minds`, `darwinian-landing`) adopt the new card version and re-verify.

**Origin of the gap:** proven empirically in drwn-lab experiment 04 (the hook is inert for cursor/opencode), which prompted the design rethink.

## Success criteria

- [ ] **Single source of truth:** the v0.4 contract text appears in exactly one canonical location in the card (instructions.md), and the hook either derives from it or is removed if redundant. No two hand-maintained copies that can drift.
- [ ] **AGENTS.md delivery (all four runtimes):** after `drwn card trust --instructions` + `drwn write` in a fixture project, `AGENTS.md` contains the v0.4 terms (`clNNNN`, `Owner Status`, `Reviewer Status`, `G1 → G2 → G3`, `Received`). LLM-free assertion test.
- [ ] **No CLI behavior regression:** claude still emits hook `additionalContext` at pre-tool (if the hook is retained) or, if the hook is removed, claude/codex rely on AGENTS.md alone — explicit decision and test (see §Design decision: keep or remove the hook).
- [ ] **No post-tool hack:** the v1 plan's `bundle-composer.ts:130-133` change is **not** made. The composer keeps discarding post-tool decisions (the dead-code stays dead; we are not building on it).
- [ ] **Cursor:** receives the v0.4 contract via AGENTS.md (same as opencode). Runtime hook firing is not expected for cursor (and not hacked around).
- [ ] **OpenCode:** receives the v0.4 contract via AGENTS.md. The plugin continues to warn-and-omit context (unchanged) — we accept AGENTS.md as OpenCode's channel.
- [ ] Card version bump `1.1.0` → `1.2.0`; re-published; blueprint member ref reconciled; four projects re-applied and healthy.
- [ ] `bun test` (CLI) + `npm test` / `npm run test:contract` (card) green.

---

## Design decision: keep or remove the hook?

This is the one genuine fork in I153, and it should be made explicitly (not left to the executor). The two options:

**Option K (keep the hook, reconciled):** retain `org-conventions` as a compaction-survival reinforcement for claude/codex. Rationale: modern harnesses can compact context and drop AGENTS.md mid-session; the pre-tool hook re-injects the convention on every `Skill` call, surviving compaction. This is a *real* benefit for claude/codex where the hook natively works. Cost: the hook must derive its context from the same source as instructions (no drift), and its header/scope must be reworded to "reinforcement, claude/codex only."

**Option R (remove the hook):** delete `org-conventions` entirely; rely on AGENTS.md for all four runtimes. Rationale: simpler card, single channel, no drift risk, no harness-protocol complexity. Cost: loses compaction-survival for claude/codex (mitigated if those harnesses preserve AGENTS.md reliably, which is increasingly true).

**Decision: Option K is the default per the G1 v3 (2026-08-01)** — the G1 classifies the hook reconciliation as housekeeping, not a design fork, so there is no blocking sign-off gate. The compaction-survival benefit is real for claude/codex (the runtimes that drive most CL work) and the cost (keep one policy file, derive its string from the canonical source) is low. Record the choice in the PR description for visibility; Option R remains available if K's cost surprises during execution. The plan below is written for **Option K**; the Option-R delta is noted inline.

## How we fix it

### Fix 1 — canonicalize the v0.4 contract in `instructions.md` (card repo)

`instructions.md` is already the richer surface (82 lines, 4910 bytes — includes the full v0.4 contract + convention overrides + skill-phase mapping). Confirm it is complete and correct; treat it as the canonical source. No content change expected unless drift review finds gaps vs the hook's 19-line block.

### Fix 2 — reconcile the hook to derive from the canonical source (card repo)

Today `hooks/org-conventions/policy.ts` carries a hand-maintained 19-line contract string that has **drifted** from `instructions.md`'s 18-line version. Under Option K:
- Extract the contract text to a single shared source within the card (e.g. a `CONVENTIONS.md` or a TS constant imported by both the policy and referenced by instructions). **Note:** drwn's `instructions` field takes a `path` (a file), and the hook policy is a bundled `.ts` — they don't currently share a source. The simplest non-drifting approach: make `instructions.md` the canonical source and have the hook's `additionalContext` be a **short pointer** ("Per this project's AGENTS.md / `.ai/rules/`, the CL v0.4 contract applies — re-read it if uncertain") rather than a duplicate of the full contract. This eliminates drift entirely and is honest about the hook's reinforcement role.
- Rewrite the policy header comment (currently `policy.ts:1-7`) to reflect: Layer 1 (instructions/AGENTS.md) = primary, all runtimes; Layer 2 (this hook) = compaction-survival reinforcement, claude/codex only.

Under **Option R**: delete `hooks/org-conventions/policy.ts` and remove `"hooks": {"include": ["org-conventions"]}` from `card.json`. Skip Fix 2.

### Fix 3 — no CLI code change (the key v2 simplification)

The v1 plan's three CLI edits (`types.ts:29` widen `afterToolCall`, `compose-tool-hooks.ts:103-121` collect post-tool decisions, `bundle-composer.ts:130-133` stop discarding) are **all dropped**. The CLI's hook machinery stays as-is. The encoder's dead post-tool branch (`encode-decision.ts:166-168`) stays dead — we are not building on it.

The only CLI-repo work is **documentation + tests**:
- Update `.ai/analyses/122_..._target_architecture.md` §D8: reverse the deferral; document AGENTS.md as OpenCode's (and now the unified) instruction-delivery channel; cite experiment 04 + this design decision.
- Optionally add an LLM-free projection assertion test in the CLI test suite confirming AGENTS.md carries the v0.4 managed block after trust+write (mirrors what the card's own test will assert).

### Fix 4 — card version bump + tests (card repo)

- Bump `card.json` `1.1.0` → `1.2.0`.
- Update/add tests:
  - `test/functional/hook-execution.test.mjs` — the existing cursor/opencode tests assert "doesn't deny / empty output." Keep them (the hook still runs clean for claude/codex under Option K). **Remove or reword any test claiming the hook *delivers* context to cursor/opencode** (it never did; experiment 04 proved this).
  - Add an **AGENTS.md content assertion** (LLM-free): after `installCard` (which already runs `trust --instructions` + `write`), the fixture project's `AGENTS.md` contains `clNNNN`, `Owner Status`, `G1 → G2 → G3`. This is the new headline test proving unified delivery.
- Re-run `npm test && npm run test:contract` (expect 96/96 + 83/83 green; the new AGENTS.md test adds one).

### Fix 5 — publish + re-apply the four projects

- From the workflow-skills source repository, run
  `drwn card source sync .` → `drwn card source doctor .` →
  `drwn card publish --from .` to publish
  `@curation-labs/workflow-skills@1.2.0`.
- The blueprint `@curation-labs/ai-narratives-worker` member ref is `^1.0.0`, which covers 1.2.0 — **no blueprint republish needed**. In each project, run `drwn update --dry-run`, then `drwn update --write`; for an all-Card refresh use `drwn up --dry-run`, then `drwn up` instead.
- Verify AGENTS.md still carries the v0.4 block and the lock records 1.2.0. Do not add a second `drwn write` after `update --write` or `up`; those commands already materialize.
- I175 automatically refreshes an existing instructions consent when the new version remains inside its consented range. Run `drwn card trust @curation-labs/workflow-skills --instructions` only when consent is missing or the new version is outside that range.

---

## Phased plan (TDD)

### Phase 0 — Prereqs + issue identity (read-only)
- [x] Notion issue row exists (I153, ID read); artifacts carry `cl0153_` — done 2026-07-31.
- [ ] Baseline: `cd ~/dev/darwinian-cards/cards/workflow-skills && npm test` (expect 96/96) and `cd ~/dev/darwinian-minds && bun test` — capture green counts.
- [ ] **Confirm Option K stands** (the G1 v3 default — no sign-off gate; note it in the PR, switch to R only if K's cost surprises).

### Phase 1 — Canonicalize + reconcile the card (Option K path)
- [ ] Review `instructions.md` vs `hooks/org-conventions/policy.ts` contract blocks; confirm instructions.md is complete/correct.
- [ ] Rewrite the hook's `additionalContext` to a short pointer (per Fix 2), eliminating the duplicate contract.
- [ ] Rewrite the hook header comment to reflect the new layering.
- [ ] Bump `card.json` → `1.2.0`.
- [ ] **Acceptance:** one canonical contract source (instructions.md); hook no longer carries a duplicate; header accurate.

### Phase 2 — Tests (TDD)
- [ ] Add the AGENTS.md content assertion test (LLM-free, the headline).
- [ ] Reword/remove any test claiming cursor/opencode hook-delivery.
- [ ] `npm test && npm run test:contract` → green (96+1 / 83+1).
- [ ] **Acceptance:** unified-delivery test green; card suite green.

### Phase 3 — CLI documentation (no code)
- [ ] Update analysis 122 §D8 (reverse deferral, cite decision).
- [ ] (Optional) add the AGENTS.md projection assertion to the CLI test suite.
- [ ] **Acceptance:** docs reflect the unified-channel architecture.

### Phase 4 — Publish + re-apply
- [ ] Publish `@curation-labs/workflow-skills@1.2.0`.
- [ ] For each of the four projects: `drwn update --dry-run` → `drwn update --write` (or `drwn up --dry-run` → `drwn up`). Confirm `drwn status` healthy + AGENTS.md carries v0.4; manually trust instructions only when consent is missing or out of range.
- [ ] **Acceptance:** all four projects on 1.2.0, healthy, v0.4 in AGENTS.md.

### Phase 5 — Verify + record
- [ ] Re-run the experiment-04 probes with the new reality: cursor/opencode now receive the contract via AGENTS.md (LLM-free delivery proof; agent-uptake smoke deferred). Update the experiment 04 verdict + the card annotation cross-target table (cursor/opencode move from ❌ to "✅ via AGENTS.md").
- [ ] **Acceptance:** drwn-lab records reflect the unified delivery.

---

## Testing strategy

**Runner:** `npm test` / `npm run test:contract` (card, `node:test`); `bun test` (CLI, `bun:test`).

**New/changed:**
1. Card: AGENTS.md content assertion (headline, LLM-free).
2. Card: reworded cursor/opencode hook tests (no longer claim delivery).
3. CLI (optional): projection assertion that AGENTS.md carries the managed block.

**Re-run commands (for the PR's Testing & CI evidence):**
```bash
cd ~/dev/darwinian-cards/cards/workflow-skills && npm run test:all
cd ~/dev/darwinian-minds && bun test
# manual AGENTS.md delivery check (LLM-free)
cd <project> && grep -c "clNNNN\|Owner Status\|G1 → G2 → G3" AGENTS.md
```

---

## Workflow / git

- **Branch** off `main`, named per the issue: `<author>/<NNN>-unify-v04-contract-delivery`.
- **Primarily a card-repo PR** (`darwinian-cards/cards/workflow-skills`); the CLI-repo change is docs-only (analysis 122) and can be a separate small PR or folded in. Card PR is the load-bearing one.
- **Commit style:** conventional-with-issue per repo convention (e.g. `refactor(card): make instructions.md the canonical v0.4 contract source (I153)`).
- **PR description** includes Testing & CI evidence (GATE 3) and records the **Option-K default (G1 v3)** with R as the noted alternative.

## Risks

| Risk | Mitigation |
|---|---|
| Removing/demoting the hook loses compaction-survival for claude/codex | Option K retains it; if R is chosen, verify claude/codex preserve AGENTS.md reliably (increasingly true; was the original rationale for the hook). |
| An operator withdraws `--instructions` consent, breaking AGENTS.md delivery | Same risk exists for the hook's `--hooks` consent — neither channel is consent-free. Document that both consents are required for full delivery. Not an architectural gap. |
| AGENTS.md agent-uptake is LLM-dependent and hard to CI | Delivery is LLM-free-provable (content assertion); uptake marked as a follow-on smoke (needs a non-`zai-coding-plan` provider). Same trust model claude/codex already rely on. |
| The hook's "short pointer" additionalContext is too terse to reinforce | Word it to explicitly re-state the load-bearing rule (paths/commands come from `.ai/rules/`; v0.4 state contract in AGENTS.md) — enough to survive compaction without duplicating the full contract. |

## Out of scope (follow-ons)

- **OpenCode skill-shadowing** (dedup picks uncustomized `~/.agents/skills/`): the analysis-03 machine-defaults problem. Separate issue.
- **OpenCode agent-uptake smoke** (LLM run confirming AGENTS.md shapes behavior): needs a non-`zai` provider. Follow-on.
- **Session-start hooks as a first-class drwn concept**: considered and rejected for I153 (5-layer addition, doesn't unify OpenCode). Could be revisited if a *per-tool* enforcement need emerges that AGENTS.md can't serve.
- **The CLI's dead post-tool encoder branch** (`encode-decision.ts:166-168`): left as-is. If a future policy genuinely needs post-tool context, build it then; don't leave I153's non-decision as a half-built feature.

## Notes for the coworker executing this

- **Read experiment 04 + this §"Why v2" first** — they explain why the obvious "patch the hook" approach was wrong. Do not fall back to the v1 post-tool patch.
- **This is mostly a card-repo change, not a CLI change.** The CLI's projection machinery already does the right thing; I153 is about the card's surface structure and documentation.
- **Option K is the G1 v3 default** — no sign-off gate; record it in the PR and implement Fix 2. R is a strict subset (delete the hook, skip Fix 2) if K's cost surprises.
- **AGENTS.md already works** — don't re-test the projection mechanism from scratch; the LLM-free content assertion is sufficient proof of delivery.
- **Issue identity is mandatory** (v0.4 contract): create the Notion row, read the ID, rename before PR.
