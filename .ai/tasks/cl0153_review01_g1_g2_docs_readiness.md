<!-- ABOUTME: Self-review of the I153 G1 architecture (v3) and G2 sub-PR-1 plan (v3) for pre-submission readiness. -->
<!-- ABOUTME: Verifies every factual claim against code, card bytes, and fresh test runs; records five findings and their same-day fixes. -->

# I153 Review 01 — G1/G2 Docs Readiness (self-review)

**Status**: Complete
**Issue**: I153 (drwn support for Cursor & OpenCode)
**Created**: 2026-08-01
**Scope**: Pre-submission review of `.ai/analyses/cl0153_cursor_opencode_integration_target_architecture.md` (G1 v3) and `.ai/tasks/cl0153_cursor_opencode_integration_task_plan.md` (G2 v3, sub-PR 1)
**Method**: every load-bearing factual claim traced to a command output, file:line, or fresh test run — no claim accepted from memory or narrative; then an adversarial cross-doc consistency pass over the post-patch texts
**Verdict**: **Historical 2026-08-01 readiness result; superseded for execution by the post-I175/I176 re-audit below.** The five findings below were fixed same-day, but later command and consent contracts changed.

## Post-I175/I176 re-audit (2026-08-03)

The original evidence remains useful as historical G1/G2 review, but its rollout
commands are no longer operational authority. The active task plan now publishes
from the canonical Card repository, refreshes projects with `drwn update` or
`drwn up`, and relies on I175's in-range consent auto-regrant. Manual trust is
reserved for missing or out-of-range consent. Re-verify those current commands
at execution time; do not use the historical `install --reconcile` procedure.

---

## Verified-claims matrix

| Claim (doc) | Evidence | Result |
|---|---|---|
| AGENTS.md in this repo carries the v0.4 contract (G1 §2) | `grep` on `AGENTS.md` — 5 marker/term hits | ✅ |
| Consent is always explicit; no auto-grant path (G1 §2 as revised) | all `instructionConsent` writers traced: `card-project.ts:151-180` (carry of prior explicit grant), `:340-360` (flag-gated trust), org-bundle ratifier evidence; `trustedSources` never touches instructions | ✅ |
| D2a falsified / D2b promoted (G1 Gap 1) | drwn-lab experiment 05: sentinel probes on OpenCode 1.18.4; winner `~/.agents/skills/` in both probes; project sentinels absent | ✅ |
| Project `.claude/skills` discovered on 1.18.4 (contradicting doc 126's table) | experiment 05 dedup warnings show both project paths scanned | ✅ |
| Cursor post-tool channel latent but complete (G1 Gap 3 note) | `sync-hooks.ts:121-122` registers `postToolUse`; `encode-decision.ts:166-168` emits `additional_context`; generated composer discards post-tool decisions | ✅ (live Cursor uptake unverified — login-gated, stated) |
| `cursor-agent` headless but login-gated (G1 Gap 2) | `--print` in help; `cursor-agent status` → "Not logged in" | ✅ |
| `instructions.md` = 82 lines / 4910 bytes (G2 Fix 1) | `wc` → 82 / 4910 exact | ✅ |
| Hook carries a hand-maintained drifted contract string (G2 Fix 2) | `policy.ts:20-40` — ~21-line template literal (G2 says "19-line"; count imprecise, substance correct); header block at `:1-7` confirmed | ✅ (minor count imprecision, not load-bearing) |
| `card.json` 1.1.0, hooks `org-conventions`, `instructions.path` (G2) | read from `card.json` | ✅ |
| Card suites 96/96 and 83/83 (G2 Phase 0 / Fix 4) | fresh runs 2026-08-01: `npm test` 96 pass / 0 fail; `npm run test:contract` 83 pass / 0 fail | ✅ |
| Blueprint member ref `^1.0.0` covers 1.2.0 (G2 Fix 5) | `cards/ai-narratives-worker/card.json:8` → `@curation-labs/workflow-skills@^1.0.0` | ✅ |
| Card skill count | 13 in `card.json` and `skills/` (matches experiment 04's "13 workflow-skills") | ✅ — exposes G1's "18 skills" as wrong (F5) |

## Findings

| # | Doc | Severity | Finding | Fix |
|---|---|---|---|---|
| F1 | G2 | High | **Card repo path wrong throughout**: `darwinian-cards/cl-workflow-skills/` does not exist; the card lives at `darwinian-cards/cards/workflow-skills/`. Affects the Repo header, References, Phase-0 baseline command, and the re-run commands — an executor would stall at step one. | Fixed 2026-08-01: all occurrences corrected. |
| F2 | G2 | High | **Stale gap numbering + dangling reference**: §Scope claims this sub-PR "closes Gap 1 (convention/contract content does not reach Cursor or OpenCode agents) per G1 Decision D1". The G1 v2/v3 has no "Decision D1"; its Gap 1 is the OpenCode skill-shadowing (sub-PR 2), and delivery-unification is Gap 3 — explicitly moot. The paragraph also restates the falsified premise its own §Objective corrects. | Fixed 2026-08-01: scope re-mapped to the v3 numbering (sub-PR 1 = Gap 3 residual housekeeping); premise wording corrected; header reference fixed. |
| F3 | G2 | Low | Phase 0 still instructs "Create the Notion issue row; read the generated ID; retitle this file" — already done (I153 exists; files carry `cl0153_`). | Fixed: item marked done. |
| F4 | G2 | Low | Branch-base note cites a dated HEAD observation (`6d6e5d1` on `release/architect-provisioning-v1`) now superseded; the evergreen instruction ("branch from `main`") is correct. | Fixed: dated observation dropped. |
| F5 | G1 | Low | §3 Gap 2 acceptance says "confirm the 18 skills appear"; the card ships **13** skills (card.json, `skills/`, experiment 04). Origin of "18" unknown — likely conflated with a project closure that adds extras. | Fixed: "the card's 13 skills (plus any project-closure extras)". |

## What survived adversarial reading unchanged

- The G1 v3's Gap 1 rewrite, consent correction, cursor-agent precision, and post-tool-channel note (this session's patches) — each already carries file:line or experiment citations.
- The G2's five-fix structure, Option-K default (per G1 v3), phased TDD plan, and risk table — internally consistent after F1–F4.
- The two docs' division of labor: G1 owns scope and decisions; G2 owns sub-PR 1 execution only.

## Residual items (not doc defects)

- G2 test-count claims are now *verified* (96/96, 83/83) but will shift by design (+1 each) when the AGENTS.md assertion lands — the plan states this.
- Cursor live verification remains operator-gated (`cursor-agent login`) — correctly recorded as a prerequisite, not hidden.
- Sub-PR 2's G2 must answer the one open empirical question: whether OpenCode offers config-level skill-path precedence (D2c).
