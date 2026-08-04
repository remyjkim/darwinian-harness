# ABOUTME: Independent G2 gate review of the three I153 sub-PR task plans (PR #80), executed against the cl0024-review01 execution-readiness bar.
# ABOUTME: Every cited path, symbol, command, and repo-state claim re-verified on the branch; includes the dir-naming ruling sub-PR 2 delegated to this gate; verdicts are per plan.

# I153 Review 03 — G2 Gate Review (independent)

**Status**: Complete
**Created**: 2026-08-04
**Scope**: G2 gate for the three I153 sub-PR plans, reviewed against: execution-readiness (cl0024-review01 bar), dependency order, contract soundness against the shipped code, acceptance validity, test-quality rules, release-worthiness (sub-PR 1), and cross-plan consistency with the frozen G1 v4.1
**Artifacts**: `.ai/tasks/cl0153_opencode_skill_shadowing_task_plan.md` (sub-PR 2), `.ai/tasks/cl0153_live_qualification_task_plan.md` (sub-PR 3), `.ai/tasks/cl0153_cursor_opencode_integration_task_plan.md` (sub-PR 1, v4) — PR #80, branch `remy/153-cursor-opencode-integration`, commit `dc65a55`
**Frozen inputs**: G1 v4.1 (`.ai/analyses/cl0153_cursor_opencode_integration_target_architecture.md`) and the G1 gate review (`cl0153_review02_g1_gate_review.md`) — not re-litigated; their verified claims (experiment-05 evidence chain, consent contract, 20-failure baseline, live binary versions) are accepted as established
**Gate outcome**: **All three plans PASS WITH CORRECTIONS** — 13 findings (5 Important, 5 Minor, 3 Low), zero blocking; binding conditions per plan below
**Method**: every file:line citation in the plans was opened on this branch; the card repo and its inner git state were inspected directly; the card test suite was executed; the drwn-lab experiment NOTES were read; no claim was accepted from the plans without independent verification

---

## Ruling: the sub-PR 2 dir-naming decision (delegated to this gate)

Sub-PR 2 names one open design point and assigns it here: the dedicated projected skills dir. **Ruling: adopt the recommended `.agents/drwn/opencode-skills/`, declared as a project-relative path.**

Rationale:
- `.agents/drwn/` is drwn's project home (`cli/core/project.ts:115` — `join(dir, ".agents", "drwn", "config.json")`), so the dir sits inside the tree drwn already owns and cleans.
- The alternative `.opencode/drwn-skills/` squats in the harness's own directory. Probe D established that built-in-scanned paths **cannot** win the dedup; if a future OpenCode release widens its project scan across `.opencode/**`, the fix would silently regress to the exact failure mode it exists to eliminate. `.agents/drwn/` is far less exposed to vendor scan-widening.
- Probe C won with a **relative** novel dir (`skills.paths: [".drwn-skills"]`, experiment-05 NOTES.md:73), so a project-relative entry is the evidence-matched form (and the only portable one for a committed `opencode.json`).

**Condition attached to the ruling:** sub-PR 2 Task 4's acceptance probe must run against the exact final relative path as written into `opencode.json` by the real CLI — not a stand-in dir.

---

## Sub-PR 2 — `cl0153_opencode_skill_shadowing_task_plan.md` (the fix)

### Citations verified (all real on this branch)

- `mergeOpencodeConfigText` at `cli/core/mcp.ts:637` — **exact** (the G1-review F8 stale citation is fixed in this plan). Semantics confirmed: manages the `mcp` key with per-server field hashes, drift-throw without `--force` (`mcp.ts:662-666`), owned-entry removal, all other keys user-owned passthrough (`mcp.ts:635-636`).
- `test/core-opencode-merge.test.ts` exists; current coverage is merge/preserve, drift-throw, force, untampered removal, field hashes — the right suite to extend.
- `cli/core/skills.ts` — `syncSkills` (`skills.ts:238`) builds `selectedSurfaces` from target descriptors (`skills.ts:249-256`) and branches per surface (`skills.ts:296-319`). Real extension point.
- `cli/core/write-record.ts` — `ProjectionSurface` (`write-record.ts:32`), ownership refinement (`:81-93`), duplicate-path rule (`:113-117`). Real, with contract consequences the plan understates (R3-F02/F03 below).
- `cli/core/paths.ts:92,94` — `claudeSkills`/`codexSkills` project path helpers; the pattern for the new helper.
- `cli/core/diagnostics.ts` / `cli/core/ambient-capabilities.ts` — severity model is `"error" | "warning" | "advisory"` (`diagnostics.ts:231,1122`); doctor exits nonzero only on fatal ambient collisions or error-severity issues (`cli/commands/doctor.ts:62-79`), so "doctor exit behavior unchanged for warnings" is consistent with the shipped contract. `inspectAmbientCapabilities` already computes cross-scope `sameIdDeclared`/`"same-id"` health for machine-home skills (`ambient-capabilities.ts:171-183`) but scans only claude/codex home dirs (`:141-146` — `cursor: null, opencode: null`, and `~/.agents/skills/` not scanned at all) — the plan's claim that no shadowing detection exists holds, and the named files are the right homes for the check. Both machine surfaces (`~/.agents/skills/`, `~/.claude/skills/`) are correctly named per experiment 05.
- `cli/commands/machine/skill.ts:413-440` — retired always-throw stubs, exactly as cited.
- `test/commands-write-cursor-skills.test.ts` exists ("skill surface readers" suite) — the naming-pattern claim is real.
- `--mcp-only` / `--skills-only` exist (`cli/commands/write.ts:76-81`).
- Binary-gated test precedent exists: `test/e2e-mind-journey.test.ts:14`, `test/mind-substrate-e2e.test.ts:18`, `test/core-secret-store-backends.test.ts:100` (`test.skipIf` on environment conditions) — the Task 4 skip-with-reason story is coherent with repo practice.
- `verify:release` (`package.json:56`) and `docs:build` (`package.json:59`) exist; `docs-docusaurus` is the **active** docs site (`docs-astro/DEPRECATED.md` says so explicitly) — the plan targets the right tree, avoiding the cl0024 wrong-docs-target failure class.
- Evidence base: `drwn-lab/experiments/05-opencode-skill-precedence/NOTES.md` exists with the 2026-08-04 D2c addendum; probe C = relative novel dir wins (NOTES:73), probe D = built-in-scanned path does not (NOTES:74). Matches the plan's frozen inputs.

### Where the plan falls short of the bar

The mechanism, evidence, and acceptance are solid. The gaps are contract-level specification points an executor would otherwise have to design mid-flight — the R1-F04/F05 class the cl0024 bar exists to catch:

1. **The file list misses the actual on/off switch.** Skill-surface materialization is gated by `cli/core/targets.ts`: `SkillSurfaceDir = "claude" | "codex"` (`targets.ts:9`) and `DESCRIPTORS.opencode.skillSurfaces: []` (`targets.ts:51`). The new dir means extending that type and descriptor — `targets.ts` is the self-described "single source of truth for downstream target names and their surface metadata" and is not in Task 1's modify list. Neither is `cli/core/git-hygiene.ts`, whose `PROJECTION_SURFACE_ENTRIES` (`git-hygiene.ts:21-28`) must gain the new dir or every adopting project gets a dirty worktree. (R3-F01)
2. **The write-record ownership contract is unstated.** The `skill` surface's refinement admits only `claude`/`codex` targets (`write-record.ts:88-89`); an opencode-target skill entry is schema-invalid today. The right change (widen the target set; no new `ProjectionSurface` value) should be stated so the executor doesn't invent a new surface value, which would ripple through the machine-scope refinements (`write-record.ts:118-137`). (R3-F02)
3. **"Recorded in the write-record like the `mcp` key" hits a schema wall.** `opencode.json` is already recorded as a single `managed-fields` entry with `surface: "mcp", target: "opencode"` (`cli/core/sync.ts:730-739`), and the record schema rejects duplicate managed paths (`write-record.ts:113-117`). A second entry for the same path is invalid; the `skills.paths` field hash must join the existing entry under a dedicated field key — which entangles a skills-semantics artifact under mcp-surface ownership. The plan must state the chosen shape and its cleanup implications. (R3-F03)
4. **Partial-write semantics for the `skills.paths` entry are undecided.** `--skills-only` skips the MCP branch that writes `opencode.json`; `--mcp-only` skips the dir. Task 1 only says partial writes "skip it" (the dir). Which flag writes/updates the config entry, and what is the state after a `--skills-only` write creates an undeclared dir? Needs a stated contract plus a RED case. (R3-F04)
5. Smaller: the `opencode.jsonc` skip path (`sync.ts:716-722`) leaves the projected dir undeclared — detection is covered by the Task 3 diagnostic's "entry absent" arm, but the case should be a pinned test (R3-F05); the "opencode target page" in docs-docusaurus is net-new authoring, not an update — `grep -rli opencode docs-docusaurus/` returns zero hits (R3-F06); the managed entry's relative-path form should be stated (R3-F07); and Task 1's "locate exact file in Task 0" defers what is locatable now (R3-F08).

### Dependency order, acceptance, test quality

- **Dependency order: sound.** Tasks 0→5 have no forward dependencies: Task 3's diagnostic consumes Task 2's managed-entry semantics and is ordered after it; Task 4 needs 1+2 and follows both. Each task is independently green as specified (modulo the contracts in R3-F02..F04 being settled in the text first).
- **Acceptance genuinely proves the fix.** Task 4 rebuilds probes A/B with a real CLI write and `opencode debug skill` against the live binary — the same LLM-free instrument that falsified D2a, now required to flip. Skip-with-reason has repo precedent (above). This is the strongest acceptance design of the three plans.
- **Test quality: clean.** No mocked-behavior tests; the merge tests exercise real logic; JSON + human diagnostic output pinned (pristine-output rule); RED-first sequencing named per task. The Task 0 fixture freeze and the honest 20-failure baseline caveat (frozen by the G1 review's criterion 6) are correct.

**Verdict: PASS WITH CORRECTIONS** — R3-F01, R3-F02, R3-F03, R3-F04 must land in the plan text (plus the naming ruling and its probe condition) before execution begins; R3-F05..F08 in the same pass.

---

## Sub-PR 3 — `cl0153_live_qualification_task_plan.md` (Q1–Q9 probes)

### Verified

- **Q-numbering and content are 1:1 with the frozen G1 v4.1 §3 Gap 2 table** — all nine rows match in order, method, and origin; the Q3 customized-content sentinel bar (G1-review condition C4) is present in both; the Q4 `"type"`-field and same-ID observations, Q5/Q6 enforcement split, and Q7–Q9 opencode MCP items (condition C3) all carry correctly.
- The register is now locatable (condition C5 applied): Task 3 carries the Notion URL for the V-C/V-F rows.
- The evidence targets are real: drwn-lab has experiments 01–05; `experiments/06-live-qualification/` is net-new as Task 1 states. The card's "13 skills" claim in Q3 is exact (`ls skills/ | wc -l` = 13 in the card repo).
- PASS bars are objective and artifact-producing: each probe names a method, an artifact (transcript/NOTES entry), and a falsifiable condition (exact sentinel, Instruction-ID, deny reason, listed server). Q3's bar explicitly defeats the enumeration-passes-on-wrong-bytes trap. The acceptance's "operator-gated-with-named-prerequisite" outcome is honest and matches G1 §6.
- Credential gating is consistent with G1 §9 steps 0b/7/8 (Q6–Q9 credential-free, runnable now; Q1–Q5 in one credentialed sitting; order-independence from sub-PR 2 correctly claimed — G1 §9 confirms "Q1–Q5 do not depend on step 6").
- Test quality: the plan explicitly supersedes experiment 04's mock-payload composer exercises with live-behavior observation, and separates delivery from ingestion with LLM-free pre-checks — exactly the cl0024 lineage it cites.

### Findings

- **The header contradicts Task 1 on where the work lands.** Header line 8: "Repo: darwinian-minds (probe scripts + docs)"; Task 1: scripts live in drwn-lab `experiments/06-live-qualification/`, "not product code". State which repo the `<author>/153-live-qualification` branch belongs to and what (if anything) the darwinian-minds PR contains once scripts live in the lab. One sentence fixes it. (R3-F12)
- **Q8's PASS bar is circular.** "PASS iff the documented precedence holds" — no precedence is documented: doc 121 line 15 lists both files without ordering, and doc 88 V5 exists precisely because the answer is unknown. The bar should be: a deterministic observed winner, recorded, = PASS. (R3-F13)

**Verdict: PASS WITH CORRECTIONS** — R3-F12 before execution; R3-F13 in the same pass.

---

## Sub-PR 1 — `cl0153_cursor_opencode_integration_task_plan.md` (card housekeeping, v4)

### Verified

- **The reality-check note is empirically exact.** Card inner repo HEAD `card.json` = 1.1.0 (`git show HEAD:card.json`); worktree `card.json` = 1.2.0, uncommitted (`M card.json`). Fresh `npm test` run: **95 pass, 1 fail** — the version-pin test asserting `'1.1.0'` against actual `'1.2.0'`. 96 total tests matches the plan's count.
- The drift premise holds: `hooks/org-conventions/policy.ts` carries the full v0.4 contract in `additionalContext` (policy.ts:20+, "Workflow v0.4 state contract"), and its ABOUTME header (lines 1–7) still declares the hook "Layer 1" with instructions.md as "Layer 2 … disk fallback" — the inverted layering the plan rewrites. `instructions.md` is 82 lines / 4910 bytes, byte-exact to the plan's claim.
- The v1-plan surfaces being deliberately NOT touched are all real and correctly cited: cursor `postToolUse` registration (`cli/core/hook-generator/sync-hooks.ts:134-135`), the post-tool `additional_context` encoder branch (`encode-decision.ts:166-168`), the composer discard (`bundle-composer.ts:132` — `(await composed.afterToolCall(event), undefined)`), `cli/core/hook-policy/types.ts`. `cli/core/sync-project-instructions.ts` and `sync-instructions.ts` exist.
- **The rollout is accurately specified against real commands**: `drwn update` is `cli/commands/project/update.ts` (paths `[["update"]]`, `--write` at :25, `--dry-run` at :26, chained write at :38 — so "do not add a second `drwn write`" is correct); `drwn up` is `cli/commands/up.ts` (`--dry-run` at :28, runs `syncRepository`). `drwn card source sync`/`doctor` exist (`cli/commands/card/source/`), `card publish --from` at `cli/commands/card/publish.ts:29`, `card trust --instructions` at `cli/commands/card/trust.ts:46`. The I175 in-range consent auto-regrant claim was frozen-verified by the G1 review (`card-project.ts:151-180`).
- Fix 4's test hooks are real: `installCard` at `test/functional/helpers.mjs:71`; `test/functional/hook-execution.test.mjs` exists; `npm test`/`test:contract`/`test:all` scripts all present.
- **Release-worthiness**: justified, narrowly. The change removes a hand-maintained duplicate of the org's governance contract from a published card — the 19-vs-18-line drift is live today and will keep drifting. Cost is bounded: next-free version, `^1.0.0` member ref absorbs it without a blueprint republish, and the I175 flow makes the four-project rollout mechanical. The plan's own low-priority/last-in-sequence framing (G1 §5, §9 step 9) is the correct posture.

### Findings

- **Residual version contradiction in an acceptance step.** Fix 5 still says the member ref "covers 1.2.0" and — worse — "Verify AGENTS.md still carries the v0.4 block and **the lock records 1.2.0**" (lines 113–114), while the reality-check, Fix 4, Phase 1, and Phase 4 all mandate the next free version (1.3.0 unless the bump is folded). An executor following Fix 5's verification would check for the wrong version. This is the G1-review F6 correction applied incompletely to this plan. (R3-F09)
- **Stale G1-state references contradict the frozen G1.** Line 23: "card housekeeping under the G1 v3"; line 36: "the G1 v3 numbering", "sub-PR 2, **D2b** per experiment 05" (the decided mechanism is **D2c** — G1 v4.1 §3/§9), and "Gap 2 (Cursor skill-load verification)" (Gap 2 is the Q1–Q9 set since v4). None of these change what sub-PR 1 itself does, but they misdescribe the sibling plans the executor is told to coordinate with. (R3-F10)
- **Phase 0's baseline expectation is red today.** "Baseline: `npm test` (expect 96/96)" — the current worktree yields 95/96 (version-pin red), exactly as the plan's own reality-check predicts. Phase 0 either depends on the §9 step 4 reconciliation landing first (say so) or should expect the known red. Soft R1-F04-class ordering wrinkle. (R3-F11)

**Verdict: PASS WITH CORRECTIONS** — R3-F09 before execution; R3-F10, R3-F11 in the same pass.

---

## Cross-plan consistency (criterion 7)

Verified consistent: gap numbering (Gap 1 → sub-PR 2, Gap 2 → sub-PR 3, Gap 3 residual → sub-PR 1) matches G1 v4.1 §5; Q1–Q9 identical between G1 and sub-PR 3; the mechanism (dedicated novel dir + managed `skills.paths` + `OPENCODE_SKILL_SHADOWED`) identical across G1 §4/§5/§9 and sub-PR 2; §9 sequence owners and parallelism claims align with both sub-PR 2 and sub-PR 3; the dir-naming decision was assigned by sub-PR 2 to this gate (G1 silent — no conflict), and the ruling above discharges it. The only breaks are sub-PR 1's stale v3/D2b/Gap-2 text (R3-F10) and the sub-PR 3 header/Task-1 repo contradiction (R3-F12), both filed.

## Findings table

| # | Severity | Location | Finding | Required correction |
|---|---|---|---|---|
| R3-F01 | **Important** | sub-PR 2 Task 1 | Modify-list omits `cli/core/targets.ts` (`SkillSurfaceDir`, targets.ts:9; `DESCRIPTORS.opencode.skillSurfaces: []`, targets.ts:51 — the actual surface switch consumed by `syncSkills`, skills.ts:249-256) and `cli/core/git-hygiene.ts` (`PROJECTION_SURFACE_ENTRIES`, git-hygiene.ts:21-28). | Add both files with the specific edits (extend the surface type + opencode descriptor; add the new dir to the gitignore projection entries). |
| R3-F02 | **Important** | sub-PR 2 Task 1 | Write-record contract unstated: the `skill` surface admits only `claude`/`codex` targets (write-record.ts:88-89); an opencode-target entry is schema-invalid today. | State the contract: widen the skill-surface target set to include `"opencode"`; no new `ProjectionSurface` value; machine-scope refinements (:118-137) untouched. |
| R3-F03 | **Important** | sub-PR 2 Task 2 | "Recorded in the write-record like the `mcp` key" collides with the one-entry-per-path rule (write-record.ts:113-117): `opencode.json` already has a `managed-fields` entry with `surface: "mcp", target: "opencode"` (sync.ts:730-739). | Specify the shape: the `skills.paths` hash joins the existing entry under a dedicated field key; state which surface owns it for partial-write cleanup purposes, with a test. |
| R3-F04 | **Important** | sub-PR 2 Tasks 1–2 | Partial-write ownership of the `skills.paths` entry undecided: `--skills-only` skips the merge branch that writes `opencode.json`; `--mcp-only` skips the dir (write.ts:76-81; sync.ts:715-740). | State which flag(s) write/update the entry; add a RED case for the `--skills-only`-created undeclared dir. |
| R3-F05 | Minor | sub-PR 2 Tasks 2–3 | `opencode.jsonc` present → drwn skips `opencode.json` entirely (sync.ts:716-722): dir projected but never declared; shadowing persists with only the Task-3 warning. | Pin the jsonc case as an explicit test in Task 2 or 3. |
| R3-F06 | Minor | sub-PR 2 Task 5 | docs-docusaurus contains zero opencode content (verified grep); the opencode docs live only in deprecated docs-astro. | Reword Task 5: the opencode target page is net-new (or a migration from docs-astro); scope accordingly. |
| R3-F07 | Low | sub-PR 2 Tasks 1–2 | Entry form unstated; probe C won with a relative dir (exp-05 NOTES:73). | State the managed `skills.paths` entry is project-relative. |
| R3-F08 | Low | sub-PR 2 Task 1 | "Locate exact file in Task 0" defers what is locatable now. | Name `test/commands-write-cursor-skills.test.ts` (exists; skill-surface reader suite) as the extension target. |
| R3-F09 | **Important** | sub-PR 1 Fix 5 (lines 113–114) | Residual version contradiction: "covers 1.2.0" and acceptance "the lock records 1.2.0" vs the plan's own next-free-version rule. The verification step checks the wrong version. | Normalize both lines to "the next free version (post-reconciliation)". |
| R3-F10 | Minor | sub-PR 1 lines 23, 36 | Stale frozen-G1 contradictions: "G1 v3", "sub-PR 2, D2b" (decided mechanism is D2c), "Gap 2 (Cursor skill-load verification)" (Gap 2 is Q1–Q9). | Update the three references to the v4.1 state. |
| R3-F11 | Minor | sub-PR 1 Phase 0 | Baseline "expect 96/96" is red today: fresh run = 95 pass / 1 fail (version-pin asserts 1.1.0, worktree at 1.2.0) — as the plan's own reality-check predicts. | Sequence the §9 step-4 reconciliation before Phase 0, or set the Phase 0 expectation to the known red. |
| R3-F12 | Minor | sub-PR 3 header line 8 vs Task 1 | "Repo: darwinian-minds (probe scripts + docs)" contradicts Task 1 ("scripts live in drwn-lab `experiments/06-live-qualification/`"). | Fix the header; state which repo hosts the branch and what the darwinian-minds PR contains. |
| R3-F13 | Low | sub-PR 3 Q8 | "PASS iff the documented precedence holds" is circular — no precedence is documented (doc 121:15; doc 88 V5 is the open question). | Rebar: deterministic observed winner, recorded, = PASS. |

## What survived adversarial checking unchanged

- Every load-bearing symbol citation in sub-PR 2 is exact on this branch: `mergeOpencodeConfigText` (mcp.ts:637), the retired machine-skill stubs (machine/skill.ts:413-440), the merge suite, the cursor-skills test naming pattern, the doctor severity/exit contract, both machine shadowing surfaces.
- Sub-PR 2's acceptance instrument (probes flip green on the real binary, skip-with-reason) has direct repo precedent and is the same instrument that produced the falsifying evidence — a genuinely closed loop.
- Sub-PR 3's nine probes mirror the frozen G1 1:1 with objective, artifact-producing bars; all G1-review conditions (C3, C4, C5) verifiably applied.
- Sub-PR 1's reality-check reproduces empirically to the test count (95/96, version-pin red), and every rollout command it names exists with the named flags.
- No plan tests mocked behavior; TDD sequencing and pristine-output requirements are respected throughout.

## Final Verdict (per plan)

- **Sub-PR 2 (`cl0153_opencode_skill_shadowing_task_plan.md`): PASS WITH CORRECTIONS.** Conditions before execution: R3-F01, R3-F02, R3-F03, R3-F04 land in the plan text; the dir-naming ruling (`.agents/drwn/opencode-skills/`, project-relative) is recorded with its probe condition. R3-F05..F08 in the same pass.
- **Sub-PR 3 (`cl0153_live_qualification_task_plan.md`): PASS WITH CORRECTIONS.** Condition before execution: R3-F12. R3-F13 in the same pass.
- **Sub-PR 1 (`cl0153_cursor_opencode_integration_task_plan.md`): PASS WITH CORRECTIONS.** Condition before execution: R3-F09. R3-F10, R3-F11 in the same pass.

No plan requires redesign; no finding invalidates a mechanism, an acceptance instrument, or the §9 sequence. The corrections are text-level contract completions, not re-derivations.
