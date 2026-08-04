# ABOUTME: Independent G1 gate review of the I153 target architecture (v4) and its three sub-PR G2 plans (PR #80).
# ABOUTME: Every load-bearing claim re-verified against code, experiment evidence, upstream docs, and fresh command runs; verdict is PASS WITH CORRECTIONS with five binding conditions.

# I153 Review 02 — G1 Gate Review (independent)

**Status**: Complete
**Created**: 2026-08-04
**Scope**: G1 gate for I153 — `.ai/analyses/cl0153_cursor_opencode_integration_target_architecture.md` (v4), with consistency checks against the three sub-PR G2 plans, `cl0153_review01` (treated as claims, not truth), drwn-lab experiments 04/05, and upstream docs 120/121/122/125/126/cl0024/cl0177
**Artifact**: PR #80, branch `remy/153-cursor-opencode-integration`, commit `cb7e5de`
**Gate outcome**: **G1 PASS WITH CORRECTIONS** — five conditions (C1–C5 below) must land before the sub-PR G2 reviews treat the G1 as frozen input
**Method**: Owner and Reviewer roles were consolidated by the author, so this review re-ran every spot-check independently: file:line citations opened, greps re-executed, the full test suite run, live binaries version-checked, and the experiment NOTES read against the G1 text. No claim was accepted from `cl0153_review01` without re-verification.

---

## Criterion 1 — Scope completeness for "full integration"

**Assessment: two holes; otherwise complete.**

The surface matrix as covered: instructions delivery (doc 126 Layer 1, shipped — verified: `AGENTS.md` in this worktree carries the managed block and 9 v0.4 term hits); cursor instructions ingestion (Q1/Q2); skills for opencode (Gap 1 + experiment-05 probes); skills for cursor (Q3); hook context (Gap 3, closed by doc 125 §A3 decision, with the honest Q5/Q6 carve-out for enforcement); hook enforcement live-fire (Q5/Q6); cursor MCP (Q4); diagnostics (sub-PR 2 shadowing check); sub-workers and agent-uptake smoke (§7 pending-endorsement exclusions, named); rollout (§9 step 9, I175 flow).

**Missing #1 — OpenCode MCP live-acceptance debt (Finding F3).** Gap 2 claims to consolidate "the full credentialed verify debt" but lists only one opencode item (Q6, hooks). The opencode target task plan (`.ai/tasks/88_feature_opencode_target_support_task_plan.md`, §"Verification items to close before release") lists three manual items: V2-opencode-half (same-ID wholesale project-wins on a real install), V5 (`opencode.json` vs `.jsonc` precedence), and the real-install smoke (`opencode mcp list` shows the managed server and it starts). No drwn-lab record shows any of these executed (grep across experiments 01–05 finds nothing; experiment 04 NOTES.md:68 explicitly says opencode MCP was "not separately re-tested"). Sub-PR 3's acceptance ("zero checks left in the ambiguous plausible-unproven state") is contradicted while these stay unlisted.

**Missing #2 — Cursor customized-version-wins is unprobed and unnamed (Finding F4).** Doc 120 §3.1 (lines 392–397): cursor discovers project `.claude/skills/` **and** `~/.claude/skills/`. Experiment 05 proved `~/.claude/skills/` carries machine-default same-name copies that participate in dedup collisions. Experiment 04 marked cursor T7a "n/a (single source assumed)" — that assumption is false; two sources exist. Q3's PASS bar ("skills enumerate and one invocation succeeds") would pass even if cursor silently loads the uncustomized home copy — the exact T7a failure mode Gap 1 fixes for opencode. Either Q3 gains a sentinel/customized-content assertion (the experiment-05 pattern makes this cheap), or cursor cross-scope shadowing is named explicitly in §7's pending-endorsement exclusions. §7's current "beyond OpenCode's shadowing" hard-exclusion buries a verification question inside a policy exclusion.

## Criterion 2 — Evidence discipline

**Assessment: strong, with one false load-bearing claim and one stale citation.**

Spot-verifications performed (commands run, not trusted from text):

- **(a) D2a falsification / D2c novel-path-wins** — matches experiment 05 NOTES exactly: probes A/B winner `/Users/pureicis/.agents/skills/writing-plans/SKILL.md`, both sentinels (`LILAC-2201`, `TEAL-8834`) absent; probe C novel `skills.paths` dir wins (sentinel `AMBER-4477` present); probe D re-declared built-in path does not; 2026-08-04 post-I177 re-run identical. ✅
- **(b) `~/.agents/skills/` = drwn's machine-store projection under I177** — `cli/core/paths.ts:18` (`~/.agents` default), `cli/core/skills.ts:156` (`join(agentsDir, "skills")`), closure-only sourcing per `cli/commands/machine/skill.ts:425` and cl0177 §3. ✅ — **except** the enable/disable clause (Finding F1 below).
- **(c) Consent contract** — `cli/core/card-project.ts:151-181` (carry/re-grant of a prior explicit grant, in-range only), `:335-360` (consent written only under the `--instructions` flag); no auto-grant writer found. Citation accurate. ✅
- **(d) Cursor post-tool channel** — `encode-decision.ts:167` emits `additional_context` at post-tool ✅; the generated composer discards post-tool decisions (`bundle-composer.ts:132`, `(await composed.afterToolCall(event), undefined)`) ✅; but the cursor `postToolUse` registration is at `sync-hooks.ts:134-135`, not the cited `:121-122` (Finding F5).
- **Live versions** — `opencode --version` → 1.18.4; `cursor-agent --version` → 2026.07.09-a3815c0. Both match the doc. ✅
- **No existing shadowing diagnostic** — grep over `cli/core/diagnostics.ts` / `cli/core/ambient-capabilities.ts`: collision machinery is MCP (`AmbientCollision`) and projection-ownership only; no skill-name cross-scope check. ✅
- **Q1 origin** — `cl0024_worker-instructions-projection_task_plan.md:562` records the 2026-07-23 live ingestion probes: claude PASS, opencode PASS (incl. AGENTS.md-over-CLAUDE.md preference), codex PASS, cursor NOT RUN (login-gated). ✅
- **Doc 125 §A3 quotes** — faithful ("reaches claude and codex only"; "a complement for claude/codex … not the primary"). ✅

**Finding F1 (the false claim):** G1 line 53 states "per-skill `drwn machine skill enable|disable` commands exist" and offers D2b option (ii) "`drwn machine skill disable` for project-duplicated names, manual or automated." Those commands are retired stubs that **always throw**: `cli/commands/machine/skill.ts:413-417` (`setEnabled(): never` → UsageError "Direct machine skill activation was removed"), `:425`/`:436` ("Always exits nonzero"). The G1's own cited upstream says the same — cl0177 architecture §3 (lines 113–120): "The legacy commands below exit nonzero and explain the replacement workflow." Option (ii) does not exist as a lever. The error also appears in the experiment-05 re-run note (NOTES.md lines 60–62), which is likely its origin. The chosen mechanism (§9 step 6) is unaffected, but a design-space option presented to the sub-PR 2 G2 reviewer is dead on arrival.

## Criterion 3 — Decision hygiene

**Assessment: exclusions handled correctly; one decision state is stale in the body text.**

- §7 separates hard out-of-scope from **pending owner endorsement**, §9 step 0a assigns the endorsement to the issue owner, and §6 carries "Owner endorsement recorded" as an explicit done-criterion — the G1 does **not** quietly assume the outcome. ✅
- The Option-K gate dissolution (§5) is explicit, reasoned, and leaves R available. Acceptable.
- §9 has owners on every step; D2c is marked DONE with its result. ✅
- **Finding F2 (stale decision state):** §3 Gap 1 (line 54) labels D2c "(untested) … an open question for the sub-PR 2 G2"; §4 (line 87) says the "D2c config-precedence lever [is] checked in the G2"; §5 (line 96) says "evaluate D2c as a complement." Meanwhile §9 step 1 records the D2c check **DONE 2026-08-04** with the decisive probe C/D result, §9 step 6 names the D2c-derived mechanism (dedicated projected dir + managed `skills.paths`) as the execution plan, and the sub-PR 2 G2 freezes exactly that mechanism ("do not re-derive"). Three sections of the G1 present a decision as open that the same document (and its governed G2) has already made. An executor reading §3–§5 alone would re-derive, or pick the F1-dead option (ii).

## Criterion 4 — Buildability

**Assessment: buildable from the G2s; the G1 body alone would misdirect (F2).**

- **Sub-PR 2 frozen inputs vs the G1:** (1) D2a dead — in G1 ✅; (2) config-wins-only-novel-paths — present only in §9 step 1, not §3/§4 (part of F2); (3) drwn owns managed `opencode.json` merging — in G1 D2c ✅ (the G2's own citation `cli/core/mcp.ts:528` is stale — `mergeOpencodeConfigText` is at `mcp.ts:637`; line 528 is the Claude-settings merge — Finding F8); (4) I177 machine scope — in G1 ✅ but carrying F1; (5) no shadowing diagnostic — in G1 ✅ and re-verified.
- **Sub-PR 3:** the Q1–Q6 table is fully specified in the G1 and mirrored 1:1 in the G2 ✅. But Task 3 instructs updating "the register V-C/V-F rows" — **Finding F7:** the "register" (rows V-A/V-B/V-C/V-F, cited six times across the G1 and sub-PR 3) resolves to nothing greppable in this repo or drwn-lab. Doc 122 §7's items are labeled V1–V5 (so "dw-122 V1/V2" resolves), but no artifact containing rows "V-C"/"V-F" was found. An executor cannot complete Task 3 without a pointer.
- **Sub-PR 1:** Option-K default and the reality-check are consistent with G1 §6 — but the G2 contradicts itself on the version: Fix 4 ("Bump `card.json` `1.1.0` → `1.2.0`", line 100) and Phase 1 (line 130) vs its own reality-check (lines 8–18) and Fix 5 (lines 110–112: "1.2.0 is already taken … next free version"). The G1 §5 row also still says "Card v1.2.0" while §6 (line 107) says next-free-version — **Finding F6.**

## Criterion 5 — Internal consistency

**Assessment: structure is coherent; two inconsistencies.**

Gap numbering, sub-PR naming, §6 done-criteria, and §9 step references all align (steps 5/7 name the correct G2 files; Q1–Q6 identical across G1 and sub-PR 3; acceptance items match). The two breaks are F2 (§3/§4/§5 vs §9 on the Gap 1 mechanism/decision state) and F6 (v1.2.0 vs next-free-version). Cross-doc: sub-PR 1's header line 23 and Option-K rationale (lines 74/124/201) still cite "G1 v3" while its Status line says positioned under v4 — **Finding F9** (low; the v4 §5 text supersedes the v3 rationale it cites, with the same conclusion).

## Criterion 6 — No overclaim

**Assessment: accurate; baseline claims reproduce.**

- **The 20 pre-existing main failures**: reproduced. Full `bun test` in this worktree: distinct failing-test set = exactly **20**, all in the operator-contract/release-gate family; root confirmed at `scripts/verify-operator-contract.ts:21` (`OPERATOR_ROOT = "darwinian-worker-skills/cards/operator"`) vs the actual submodule layout (no `cards/` directory — verified by `ls`). The 7 release-gate JSON failures are downstream of the same root (verify:release exits nonzero on the operator gate). My run also produced 7 module-resolution *errors* from `drwn-command-bridge/` (its `node_modules` is not installed in this fresh worktree) — environmental, not a contradiction of the PR-body baseline. Aggregate pass counts differ slightly (1856 here vs 1822 claimed) for the same environmental reason; the load-bearing claim (20 pre-existing failures, one root cause, out of I153 scope) holds.
- Gap 2's "shipped-but-never-live-observed" framing is accurate for Q1–Q6 (cl0024 evidence log confirms cursor NOT RUN, others PASS 2026-07-23).
- Gap 3's closure is correctly bounded: hook *context* closed by decision; enforcement live-fire explicitly kept open as Q5/Q6. ✅
- **Finding F10 (low):** §2 line 26 flatly states "codex/opencode/cursor consume it natively" while cursor ingestion is precisely what Q1 exists to verify. The doc elsewhere maintains the delivery-vs-ingestion distinction; a "(cursor ingestion = Q1)" qualifier removes the tension.

---

## Findings

| # | Severity | Location | Finding | Required correction |
|---|---|---|---|---|
| F1 | **Important** | G1 line 53 (§3 Gap 1), echoed lines 87 (§4), 96 (§5) | "per-skill `drwn machine skill enable|disable` commands exist" is false — they are retired always-throw stubs (`cli/commands/machine/skill.ts:413-440`; cl0177 §3). D2b option (ii) is not a real lever. | Strike option (ii) and the "commands exist" clause; align the D2b design space with cl0177 §3. |
| F2 | **Important** | G1 lines 54, 87, 96 vs 140, 145 | §3/§4/§5 present D2c as "(untested)"/"checked in the G2"/"a complement" while §9 records the check DONE and the D2c-derived mechanism as the plan the sub-PR 2 G2 froze. | Update §3 Gap 1, §4, §5 to record the D2c addendum outcome and the selected mechanism (or explicitly defer to §9 step 1/6 + the G2 as the decision record). |
| F3 | **Important** | G1 §3 Gap 2 (lines 58–71) | OpenCode MCP live-acceptance debt omitted from the "full credentialed verify debt": doc 88's release verification items (V2-opencode-half, V5, `opencode mcp list` smoke) have no recorded execution anywhere. | Add the opencode MCP checks to the qualification list (they need no cursor credentials) or name them in §7's pending-endorsement exclusions. |
| F4 | **Important** | G1 Q3 (line 66); §7 line 116 | Cursor customized-version-wins unprobed: cursor scans `~/.claude/skills/` (doc 120 §3.1), which carries machine-default same-name copies (experiment 05); Q3 passes even if the uncustomized copy loads. | Add a sentinel/customized-content assertion to Q3, or name cursor cross-scope shadowing explicitly as a pending-endorsement exclusion. |
| F5 | Minor | G1 line 79 | Stale citation: cursor `postToolUse` registration is `sync-hooks.ts:134-135`, not `:121-122` (those lines are `mergeClaudeHookConfigs`). | Fix the line reference. |
| F6 | Minor | G1 line 96 ("Card v1.2.0") vs line 107; sub-PR 1 G2 lines 100, 130 vs 8–18, 110–112 | Version contradiction: §5 row and G2 Fix 4/Phase 1 say bump to 1.2.0; §6 and G2 reality-check/Fix 5 say 1.2.0 is taken, use next free version. | Normalize to "next free version after reconciling the in-flight 1.2.0" everywhere. |
| F7 | Minor | G1 lines 67–71, 120, 149; sub-PR 3 Task 3 | "register V-A/V-B/V-C/V-F" is a dangling reference — the register is not locatable in this repo or drwn-lab. | Add a link or path to the register (Notion section or file). |
| F8 | Low | sub-PR 2 G2, frozen input 3 | `cli/core/mcp.ts:528` is the Claude-settings merge; the opencode merge (`mergeOpencodeConfigText`) is at `mcp.ts:637`. | Fix the citation. |
| F9 | Low | sub-PR 1 G2 lines 23, 74, 124, 201 | Stale "G1 v3" references alongside a "positioned under v4" status line. | Update to v4 (same conclusions carry). |
| F10 | Low | G1 line 26 | "cursor consume[s] it natively" stated as settled while cursor ingestion is Q1's open item. | Add a "(cursor ingestion = Q1)" qualifier. |

## What survived adversarial checking unchanged

- The gap structure itself (Gap 1 real bug / Gap 2 verify debt / Gap 3 closed-by-decision) and the doc-126 grounding — every settled-decision citation checked out.
- The entire experiment-05 evidence chain, including the post-I177 re-run and D2c addendum, matches the G1's use of it.
- The consent-contract statement (the doc's most safety-sensitive claim) is exactly right against the shipped code.
- The chosen sub-PR 2 mechanism (dedicated novel projected dir + managed `skills.paths` + `OPENCODE_SKILL_SHADOWED` diagnostic) is the only option the evidence supports, and both §9 and the G2 carry it correctly.
- The 20-failure baseline claim and its root-cause attribution reproduce exactly.

## Final Verdict

**G1 PASS WITH CORRECTIONS.** The architecture is evidence-grounded, correctly bounded by doc 126, and buildable; none of the findings invalidate the gap set, the chosen mechanism, or the execution sequence. Conditions (must land in the G1/G2 texts before the sub-PR G2 reviews treat them as frozen):

- **C1 (F1):** remove the dead `machine skill enable|disable` option from the D2b design space and correct the "commands exist" claim.
- **C2 (F2):** reconcile §3/§4/§5 with §9 on the D2c outcome and the selected mechanism, so the decision state is stated once and consistently.
- **C3 (F3):** add the opencode MCP live-acceptance items to the qualification checklist or the §7 pending-endorsement exclusions.
- **C4 (F4):** strengthen Q3 with a customized-content sentinel or name cursor cross-scope shadowing as an explicit exclusion.
- **C5 (F7):** make the V-A/V-B/V-C/V-F register locatable.

F5/F6/F8/F9/F10 should be fixed in the same pass but are not gate-blocking. The §7 exclusions themselves remain the owner's call (§9 step 0a) — this review endorses how they are *presented*, not their outcome.
