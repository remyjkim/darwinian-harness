# ABOUTME: Independent G3 merge-gate review of I153 sub-PR 2 (PR #81) — the OpenCode cross-scope skill-shadowing fix — against the frozen G2 plan and its R3-F01..F08 contract clauses.
# ABOUTME: Every clause re-verified at file:line; the race evidence independently re-measured (n=90 live probes + 5 acceptance executions); the four claimed deviations reviewed as first-class objects.

# I153 Review 04 — G3 Gate Review (independent)

**Status**: Complete
**Created**: 2026-08-04
**Scope**: Merge gate (G3) for PR #81, branch `remy/153-opencode-skill-shadowing`, 6 commits on `e27a56a` (`cab6998..e555463`), reviewed in worktree `i153-gate1-docs`
**Contract**: `.ai/tasks/cl0153_opencode_skill_shadowing_task_plan.md` (frozen G2 plan, R3-F01..F08 clauses applied) + `cl0153_review03_g2_gate_review.md` sub-PR-2 section incl. the dir-naming ruling and its probe condition
**Method**: full diff read (`git diff e27a56a..HEAD`, 27 files, +927/−19); every R3 clause opened at its cited location on this branch; focused suites, full suite, `tsc --noEmit`, and `docs:build` executed; the live acceptance suite executed 5 times; the race independently re-measured with a purpose-built instrument (90 probes against real CLI-written projects, real `opencode` 1.18.4, real machine-store collision) plus a 15-probe literal-cwd control; no code modified
**Verdict**: **CHANGES REQUESTED** — the code conforms to the plan and is well-built; the evidence record and the shipped claims about the fix's effectiveness do not survive re-measurement (details in §3)

---

## 1. Plan conformance — every task, every R3 clause

Commits map 1:1 to plan tasks 0–5 (`cab6998`=Task 0 incl. the recorded baseline 1822/6/20 and tsc-clean in the commit body, `36fc4d2`=Task 1, `819a899`=Task 2, `cf928ba`=Task 3, `6dbe32b`=Task 4, `e555463`=Task 5).

| Clause | Requirement | Evidence | Status |
|---|---|---|---|
| R3-F01 | `SkillSurfaceDir` + opencode descriptor + git-hygiene wiring | `cli/core/targets.ts:9` (`"claude" \| "codex" \| "opencode"`), `targets.ts:51` (`skillSurfaces: ["opencode"]`); `cli/core/git-hygiene.ts:24` (`".agents/drwn/opencode-skills/"` in `PROJECTION_SURFACE_ENTRIES`); pins updated `test/core-targets.test.ts:49`, new `test/core-committed-surfaces.test.ts:38-46` | MET |
| R3-F02 | Widen `skill`-surface target refinement; NO new `ProjectionSurface` value; machine refinements untouched | `cli/core/write-record.ts:88-89` (adds `"opencode"` only); surface enum unchanged (`write-record.ts:66`); machine-scope refinements `write-record.ts:118-140` byte-identical to base; `test/core-write-record-v1.test.ts:127-138` | MET |
| R3-F03 | `skills.paths` hash joins the EXISTING opencode.json managed entry under a dedicated field key; cleanup shape pinned | `cli/core/mcp.ts:690` (`OPENCODE_SKILLS_PATHS_FIELD = "skillsPaths"`); `cli/core/skills.ts:369-376` pushes `{path: "opencode.json", surface: "mcp", target: "opencode"}`; `cli/core/sync.ts:82-103` (`uniqueManagedPaths` unions fields into the single entry — no duplicate path ever recorded); two-field shape + cleanup pinned `test/commands-write-cursor-skills.test.ts:72-96,146-168` | MET |
| R3-F04 | Partial-write contract: `--skills-only` writes dir AND declaration; `--mcp-only` mcp-field only, retains `skills.paths` | Gating `cli/core/sync.ts:925-949`; field-level retention `cli/core/projection-ownership.ts:29-41` (`skillsPaths` refreshed by skills-side writes, retained under `--mcp-only`) + `:43-80`; RED cases `test/commands-write-cursor-skills.test.ts:101-115` (`--mcp-only`), `:119-127` (`--skills-only` incl. declaration), `test/core-projection-ownership.test.ts:55-119` | MET |
| R3-F05 | jsonc case pinned: dir projected, declaration withheld, shadowing detectable | `cli/core/skills.ts:358-362` (warning); `test/commands-write-cursor-skills.test.ts:170-181`; diagnostic arm `test/core-opencode-skill-shadowing.test.ts:100-113` | MET |
| R3-F06 | Net-new docs authoring in docs-docusaurus | `docs-docusaurus/docs/guides/using-opencode.md` (new, 66 lines), `sidebars.ts:64`, `diagnostics-model.md:63-77`, CHANGELOG | MET (accuracy issues — §5) |
| R3-F07 | Project-relative entry | `cli/core/paths.ts:88` (`OPENCODE_PROJECT_SKILLS_DIR = ".agents/drwn/opencode-skills"`, appended verbatim by `mergeOpencodeSkillsPathsText`, `mcp.ts:695-710`) | MET |
| R3-F08 | Extend `test/commands-write-cursor-skills.test.ts` | 7 new tests, `:71-192` | MET |
| G2 ruling condition | Acceptance probes the exact relative path as written by the real CLI — no stand-in | `test/e2e-opencode-skill-precedence.test.ts:47-57` (real `drwn write`, asserts `opencode.json` `skills.paths` contains the exact constant, then probes that project) | MET |

Also per plan: machine scope untouched (`skills.ts:291-293` — `opencodeSurfaceSelected` excludes `writeScope === "machine"`; pinned `commands-write-cursor-skills.test.ts:182-192`); the dedicated dir carries the composed Claude-surface set (`skills.ts:327-340`, byte-equality pinned `commands-write-cursor-skills.test.ts:78-81`); the `jsonc` skip mirrors the existing MCP-side skip (`sync.ts:777-784`).

Blast radius: all 27 changed files are inside the plan's named surfaces or their direct test/docs counterparts. `cli/core/projection-ownership.ts` is not in the plan's modify list but is the R3-F04 contract's natural home; justified.

## 2. Correctness & safety

- **User content preserved outside managed fields**: `mergeOpencodeSkillsPathsText` (`mcp.ts:695-710`) only touches `skills.paths`, appending the constant when absent — structural preservation identical to the pre-existing `mergeOpencodeConfigText` pattern (both re-serialize via `JSON.stringify(parsed, null, 2)`; no change in the byte-formatting guarantee). Append-preserve + idempotence + mcp-composition pinned (`test/core-opencode-merge.test.ts:87-125`).
- **Cleanup removes only owned content**: `sync.ts:413-456` strips only the exact constant from `skills.paths` (user entries survive — pinned with a user-added path, `commands-write-cursor-skills.test.ts:146-168`); the projected dir's per-skill entries are `managed-directory` records removed under the standard hash-verified path; a user-authored dir inside the projection dir survives exclusion (`:129-143`).
- **mcp drift behavior unchanged**: `mergeOpencodeConfigText` is untouched; its drift check iterates `ownedMcpServerNames` which filters on the `mcpServers:` prefix (`mcp.ts:259-263`), so the `skillsPaths` key in the now-shared `fieldHashes` is inert there. Machine-scope preflight cannot see `skillsPaths` (never recorded for machine scope).
- **Write-record widening is minimal**: only the `skill` refinement gains `"opencode"`; machine-scope record rules (`write-record.ts:118-140`) unchanged.
- **Doctor exit unchanged**: `unhealthy` (`cli/commands/doctor.ts:62-75`) computes from fatal collisions + error-severity issues only; the shadowing list is render-only (`doctor.ts:89-98`, `status.ts:197-201`). Exit 0 asserted in every shadowing test.
- **No behavior change for claude/codex/cursor**: their descriptors are untouched (`targets.ts:20-44`); the opencode branch is additive and gated (`skills.ts:327`); full suite green (below). Registry default has `opencode.enabled: false` (`registry/config.json`), so no adoption-surprise opencode.json creation for default projects.
- **Field-granular record diffing is sound**: `diffWriteRecord` (`write-record.ts:257-302`) subsets removed fields, so a still-desired `skillsPaths` can never reach the cleanup branch; the skills-to-zero transition removes exactly the declaration (pinned).

## 3. The deviations — and the production-effectiveness question

### 3.1 Independent re-measurement (the gate's own evidence)

Instrument: scaffold a real CLI-written project (same path as the acceptance test), then run `opencode debug skill` (1.18.4) repeatedly from the realpath'd project cwd against the live machine-store collision (`~/.agents/skills/writing-plans`, a symlink into `~/dev/darwinian-minds/skills/shared/` — winner locations realpath'd before classification).

| Run (n=30 each, realpath cwd) | machine wins | project `.claude/skills` | project declared dir |
|---|---|---|---|
| 1 (unloaded) | **7** | 17 | 6 |
| 2 (unloaded) | **9** | 16 | 5 |
| 3 (under load) | **5** | 16 | 9 |
| **Total (n=90)** | **21 (23.3%)** | 49 | 20 |

Plus 5 executions of the shipped acceptance suite: **1 of 5 failed** — run 1's first test lost all 3 retry attempts to the machine copy (`e2e-opencode-skill-precedence.test.ts:111`); runs 2–5 passed 2/2.

Control (15 probes from the **literal** `/var` cwd): 15/15 project wins, 7 of them from the declared dir — see 3.2 deviation 3.

### 3.2 The four claimed deviations

1. **Steady-state acceptance (≤3 attempts)** — *evidence-forced: YES; magnitude disclosure: FALSIFIED.* The race is real and upstream; the plan's determinism assumption was correctly abandoned. But the disclosed rate ("~1-in-10 machine wins", "stress-stable 8/8", exp-05 amendment "measured 9/10 project wins raw" at n=10) does not survive n=90: **23.3% machine wins** (per-run 17–30%), P(≥21 of 90 | p=0.1) ≈ 2×10⁻⁴. At the true rate the ≤3-attempt bar fails ~1.2–2.7% of executions — and it failed at this gate. The deviation is honest in direction, wrong in degree, and the degree is what the Owner is being asked to accept.
2. **Scope-level assertion** — *evidence-forced: YES; confirmed.* My data reproduces it: among 69 project wins the winner split 49/20 between `.claude/skills` and the declared dir. Pinning sentinel content + project scope is the only stable claim available.
3. **macOS `/var` realpath** — *harmless change; evidentiary claim NOT reproduced.* Probing from the literal `/var` cwd, the declaration was demonstrably active (7/15 wins from the declared dir, 0/15 machine). The realpath'd probe cwd is fine to keep, but the amendment's "the declaration silently fails" claim did not reproduce at this gate and should be re-tested or softened before it misleads future probe design.
4. **Minor set** (`core-targets` pin per R3-F01; optional `skillContent` helper param, `test/helpers.ts:207,245-248`; declaration only when ≥1 skill lands, `skills.ts:356`) — *minimal and sanctioned.* The ≥1-skill condition is coherent: the zero-skill transition is handled by cleanup (pinned).

### 3.3 Production effectiveness — is Gap 1 closed?

**No — it is reduced, not closed, and the shipped artifacts say otherwise.** Taking `opencode debug skill` as the session-resolution proxy (the same instrument the whole G1→G2 evidence chain rests on), on the reference machine roughly **1 in 4 OpenCode invocations still resolves the machine-store copy** of a collided skill after the fix. Pre-fix the machine copy won every observation, so the fix moves the failure from *always* to *intermittent* — a real and large improvement, but an intermittent silent failure is arguably harder to notice than a constant one, and the diagnostic's advisory state ("declaration present → the project's composed copy resolves first") actively asserts safety that holds only ~3 times in 4. The win-rate is also condition-dependent (0% machine wins in one 15-probe control, 30% in one measured run), so no fixed number can honestly be claimed — only "materially nonzero and upstream-nondeterministic."

Two caveats in fairness: (a) real session-start resolution was not directly measured here (that requires credentialed live sessions — sub-PR 3 Q3's territory, which should now be designed with this race in mind); (b) no better drwn-side mechanism exists within the plan's frozen constraint that machine projection stays untouched — the only full closure available is eliminating the machine-store collision itself, which is out of this plan's scope and would need an Owner decision.

## 4. Test quality

- **No mocked-behavior tests**: every new test drives the real CLI binary path (`runAgentsCli`) or real pure functions; the acceptance drives the real `opencode` binary against the real user home.
- **RED plausibility verified structurally**: each new assertion fails against `e27a56a` by construction (schema rejection at `write-record.ts:88-89` pre-widen; no dir/declaration written pre-Task-1; `core-targets` pin flipped inside the Task-1 commit as the plan's own R3-F01 contract change — not a test weakened to pass).
- **Pinned outputs pristine**: doctor JSON pinned with exact-object `toContainEqual` incl. `machinePaths`; human line pinned; exit codes asserted with stderr surfaced on failure.
- **The +1 auth flake claim**: verified — `test/cli-auth-e2e.test.ts` passes 4/4 focused and shares no code with this diff.
- **The exception**: the acceptance suite itself is not pristine at the true race rate — it failed 1 of 5 gate executions (§3.1). At disclosed p=0.1 the 3-attempt bar was defensible; at measured p≈0.23 it is a ~1-in-40..80 flake on any collision-bearing dev machine (CI skips via `machineCollision`, so this lands exactly on the machines that matter).

## 5. Docs

`docs:build` SUCCESS (verified). Structure, partial-write semantics, jsonc limitation, machine-scope section, and cross-references are accurate against the shipped code. **But the race appears nowhere in the shipped product surface**:

- `using-opencode.md`: "a configured path that is not already in OpenCode's built-in scan **resolves ahead of** the machine store"; advisory = "the project's composed copy **resolves first**" — both stated as deterministic; both false ~1 in 4 probes on the reference machine. The causal story is also empirically off: the declared dir itself won only 20/90 probes; the declaration's observed effect is shifting the dedup toward project copies as a group.
- `diagnostics-model.md:63-77` and `CHANGELOG.md` ("so the project's customized skills **win** OpenCode's cross-scope skill dedup"): same unqualified claim.
- `doctor` human output: declared → "managed skills.paths declaration current" with no residual-risk signal.

The only honest race disclosure in the tree is in test comments and the PR body. A user diagnosing "sometimes my customized skill doesn't load" — the exact residual failure — will find docs telling them it cannot happen.

## 6. Commands run

- Focused: `bun test` over the 7 named suites — **56/56 pass** (cursor-skills 10, opencode-merge 9, shadowing 5, projection-ownership 10, write-record 12, targets 7, committed-surfaces 5 — as-batched counts).
- Acceptance: `bun test ./test/e2e-opencode-skill-precedence.test.ts` ×5 — **4 pass, 1 fail** (run 1, retry exhaustion).
- `bunx tsc --noEmit` — clean (exit 0).
- `bun run docs:build` — SUCCESS.
- Full suite: `bun test ./test/` — **1844 pass / 6 skip / 20 fail** of 1870 (baseline at `e27a56a`: 1822/6/20 of 1848; the +22 tests are exactly this PR's additions; failure count unchanged at the disclosed pre-existing 20; the PR's +1 auth flake did not recur in this run).
- Race instrument + literal-cwd control (scratchpad, non-repo): results in §3.1.

## Findings table

| # | Severity | Location | Finding | Required action |
|---|---|---|---|---|
| R4-F01 | **Critical** | PR #81 body; exp-05 amendment; `e2e-opencode-skill-precedence.test.ts:85-99` | Race magnitude falsified at the gate: 21/90 (23.3%) machine wins vs disclosed ~1-in-10 (n=10); acceptance failed 1 of 5 gate executions; "Gap 1 is closed (project bytes win)" holds only ~3-in-4 per invocation on the reference machine | Correct the evidence record with gate data; Owner explicitly adjudicates the residual rate (accept-as-recorded-limitation in G1 v4.1 Gap 1 + plan amendment, or extend scope to collision elimination); re-bar acceptance (≥5 attempts or a measured-rate assertion) |
| R4-F02 | **Important** | `using-opencode.md`, `diagnostics-model.md:63-77`, `CHANGELOG.md`, `doctor.ts:93-95` | Every shipped surface presents the win as deterministic ("resolves first", "win ... dedup", "declaration current"); zero race disclosure outside test comments; the advisory state asserts safety that is false ~1 in 4 | Add the steady-state/probabilistic framing to guide + diagnostics page + CHANGELOG + advisory remediation text before merge |
| R4-F03 | Minor | exp-05 amendment item 3; `e2e...test.ts:62-64` | The `/var` literal-cwd "declaration silently fails" claim did not reproduce (15/15 project wins, 7 via declared dir, from the literal cwd) | Re-test or soften the amendment claim; keep the realpath'd cwd (harmless) |
| R4-F04 | Minor | `cli/core/diagnostics.ts:1249` | Inspector receives all declared skill ids, not the opencode-projected (shared/claude-only) subset the plan specifies — codex-only-scoped skills produce false-positive `OPENCODE_SKILL_SHADOWED` issues | Filter to the opencode-projected scope subset (same pass) |
| R4-F05 | Minor | `ambient-capabilities.ts:200-211` vs `using-opencode.md` jsonc section | Guide tells jsonc users to declare the dir manually in `opencode.jsonc`; the diagnostic reads only `opencode.json`, so the warning + "run drwn write" remediation persists after the user complies | Recognize a jsonc declaration or adjust the guide/remediation text (same pass) |
| R4-F06 | Low | `using-opencode.md` "Why a Dedicated Skills Directory" | Mechanism story overreaches the data: declared dir won 20/90; the observed effect is group-level, not path-level | Fold into the R4-F02 rewrite |

## What survived adversarial checking unchanged

- All eight R3 contract clauses and the G2 dir-naming ruling + probe condition: implemented exactly, at the cited locations.
- The record/ownership machinery (shared-entry union, field-level partial-write retention, field-granular diff, constant-only cleanup) is correct under every selection combination I could construct, including the jsonc-arrives-later and skills-to-zero transitions.
- Doctor exit-code neutrality, machine-scope non-interference, and claude/codex/cursor invariance.
- Deviations 2 and 4 as disclosed; deviation 1's direction (the race exists; determinism was falsified upstream).
- tsc, docs build, focused suites, and the auth-flake claim.

## Final Verdict

**CHANGES REQUESTED.** No code-mechanics changes are demanded — the projection, ownership, cleanup, and diagnostic machinery all verify against the frozen plan, and the mechanism is the best available under the plan's constraints. What fails the gate is the claim layer: the fix's effectiveness number was disclosed at ~1-in-10 and measures ~1-in-4 at this gate; the flagship acceptance test failed here once in five runs; and every shipped doc/diagnostic surface asserts a determinism the evidence contradicts. Conditions to clear: R4-F01 (corrected evidence + explicit Owner adjudication of the residual rate + re-barred acceptance) and R4-F02 (truthful race disclosure across the product surfaces) before merge; R4-F04/F05 in the same pass; R4-F03/F06 recorded. Re-review can be evidence-only — no re-verification of the mechanics is needed.

---

# Re-review — correction commits `95711a6..9b849af` (evidence-only, same gate)

**Scope**: `git diff e555463..9b849af` (12 files, +380/−65) — five correction commits + the adjudication record. Verified: each finding's disposition at file:line; the ≥3-of-10 statistical rationale recomputed; the rewritten claim surfaces re-read for new overclaims; blast radius; and re-execution (focused suites, acceptance ×5, full suite, `tsc`, `docs:build`). This review file was committed in `9b849af` byte-identical to the authored version (sha `e5b88815…` matches working tree).

## Finding dispositions

| # | Disposition | Evidence |
|---|---|---|
| R4-F01 (evidence + acceptance) | **RESOLVED** | Acceptance re-barred to a measured-rate assertion: `PROBE_COUNT = 10`, `MIN_PROJECT_WINS = 3`, per-probe tally surfaced in the failure message (`e2e-opencode-skill-precedence.test.ts:88-103,110-127`); the test comment carries this gate's n=90 numbers verbatim. **Statistics verified**: P(fail \| p=0.70 worst observed project-win rate) = P(X≤2 \| n=10) ≈ 0.16% — the "below 0.2%" claim is correct; the implementer's counter to a majority bar is also correct (≥6-of-10 at p=0.70 flakes ≈15.0% per test, which fails the 5-consecutive-run stability requirement). Pre-fix state (machine wins every observation) fails the bar with certainty; near-total regression (project ≤5%) passes ≈1.2%. **Recorded tradeoff**: the bar detects total regression, not partial degradation (a regression to project-win 20% would still pass ≈32% of runs) — acceptable given the field diagnostic and I199, and honestly framed in the test comment. Re-run here: **5/5 consecutive acceptance executions green** (10/10 tests). |
| R4-F01 (adjudication) | **RESOLVED — faithful** | Owner adjudication recorded in the G1 Gap 1 (`.ai/analyses/cl0153_cursor_opencode_integration_target_architecture.md:56`, commit `9b849af`): cites 21/90 and 17–30% per-run condition-dependence exactly; adjudicates merge-with-honest-claims; splits full closure (machine-store collision elimination) to **I199**; redefines the I153 Gap 1 done-bar as reduced+honest+detectable, not zero residual. This is precisely the adjudication R4-F01 demanded. The upstream OpenCode bug-report draft (drwn-lab NOTES) also carries the corrected n=90 numbers. |
| R4-F02 / R4-F06 | **RESOLVED** | All claim surfaces rewritten to steady-state/probabilistic with the gate numbers: `using-opencode.md` gains "The residual dedup race" (21/90, 17–30%, condition-dependent, "reduction, **not** an elimination", machine-copy removal named as the only full closure) and the group-level mechanism story replacing "resolves ahead"; `diagnostics-model.md:63-84` ("advisory means reduced risk, not resolved", "Improve the odds by…"); `CHANGELOG.md:11-25`; doctor advisory string (`doctor.ts:93-95` — "shadowing reduced, not eliminated — OpenCode dedup races"); `status.ts:200` ("residual dedup race" — outside the named location but the same claim class; sanctioned). **No new overclaims found**: "in the large majority of resolutions" (measured 77% pooled) is defensible and immediately qualified in both places it appears. |
| R4-F03 | **RESOLVED (repo); residual in drwn-lab** | The unreproduced `/var` claim removed from the test comment, replaced by an honest both-sides-failed-to-reproduce note (`e2e...test.ts:60-62`); realpath'd cwd kept as harmless normalization. Residual: drwn-lab `experiments/05/NOTES.md` amendment items 1 and 3 still state the falsified "roughly 1 probe in 10 / ≤3 attempts, stress-stable 8/8" and "the declaration silently fails" uncorrected — outside PR #81's tree, non-blocking; a G3-correction addendum to those two items is the follow-up. |
| R4-F04 | **RESOLVED** | Shared predicate `isOpencodeProjectedScope` exported from `cli/core/skills.ts:23-25` and consumed by both `syncSkills` (`skills.ts:335` — no behavior change, same condition extracted) and the new `opencodeProjectedSkillIds` filter (`cli/core/diagnostics.ts:1152-1181,1281`), which resolves each skill's actual source scope through the same `resolveSkillSource` path the writer uses. RED-quality test: codex-only skill with a live machine collision produces zero issues (`core-opencode-skill-shadowing.test.ts:141-160`). |
| R4-F05 | **RESOLVED** | `opencodeSkillsDirDeclared` now also recognizes a manual declaration in `opencode.jsonc` via a string-aware read-only JSONC normalizer (comments + trailing commas; `ambient-capabilities.ts:200-283`), fail-closed to "undeclared" on any parse failure; pinned with a comment-and-trailing-comma fixture (`core-opencode-skill-shadowing.test.ts:113-139`); guide and both remediation strings updated. Residual nit (non-blocking, tied to sub-PR 3's open Q8): with both `opencode.json` and `opencode.jsonc` present the check is an optimistic OR — a stale declaration in `opencode.json` reports `declared` while OpenCode's json/jsonc precedence is still unmeasured; advisory-only impact, and the advisory no longer asserts safety. |

## Re-verification runs

- Focused (shadowing 7 / cursor-skills 10 / opencode-merge 9): **26/26 pass**.
- Acceptance `e2e-opencode-skill-precedence.test.ts`: **5/5 consecutive runs green**.
- `bunx tsc --noEmit`: clean. `bun run docs:build`: SUCCESS.
- Full suite: **1846 pass / 6 skip / 20 fail** of 1872 (prior gate run: 1844/6/20 of 1870; the +2 are the two new shadowing tests, both passing; the 20 failures are exactly the disclosed pre-existing set — zero new failures).
- Blast radius: all 12 changed files sit inside the findings' scope (incl. this review file, committed unmodified).

## Re-review verdict

**MERGE.** Both blocking conditions (R4-F01, R4-F02) are discharged with evidence that survives re-execution and recomputation; R4-F04/F05 landed RED-first in the same pass; the adjudication note is faithful and the residual risk is now owned (I199) rather than denied. Non-blocking follow-ups recorded: (1) correct drwn-lab NOTES amendment items 1/3 with a G3 addendum; (2) revisit the jsonc/json dual-presence declared-check once sub-PR 3 Q8 measures OpenCode's config precedence; (3) the acceptance bar's partial-regression insensitivity is a known tradeoff to revisit if I199 does not land.
