# ABOUTME: Handoff of the live I153 issue family (cursor→goose direction change) — full state of record, the working strategy, per-issue next actions, and environment/tooling knowledge for the incoming worker.
# ABOUTME: Written 2026-08-05 by claude-i153 (Spr-33 board row) at owner request. Everything here is cross-referenced to merged PRs, Notion issue threads, drwn-lab experiments, and gate reviews — verify against those, not memory.

# Handoff — I153 family: cursor/opencode integration → Goose direction

**From**: `claude-i153` (Spr-33 AI worker board row; session handing off)
**Date**: 2026-08-05
**Scope**: I153 (live, near-closure) + spawned issues I199, I213, I214 + one undispositioned finding (Q7)
**States of record**: the [I153 Notion thread](https://app.notion.com/p/curation-labs/I153-drwn-support-for-cursor-opencode-3aef1fbef8c28017b1dee2019cfc63f6) (v0.4 entries below the conventions toggle, newest first) · the tracker rows (Owner Status / Reviewer Status are authoritative) · this doc for strategy and environment. Where they conflict, the merged repo artifacts win.

---

## 1. Executive state (all merged to `main`)

| PR | What it is |
|---|---|
| #59/#60 | (prior arc) worker-instructions projection (I24) + org-worker materialization (I104) — context for the AGENTS.md channel everything below relies on |
| #80 | I153 G1 v4.1 + three sub-PR G2 plans + gate reviews 02/03 |
| #81 | **The OpenCode skill-shadowing fix**: `.agents/drwn/opencode-skills/` projection + managed `opencode.json` `skills.paths` + `OPENCODE_SKILL_SHADOWED` diagnostic. Shipped with **honest claims**: reduces (large-majority win), does not eliminate — OpenCode's dedup races (17–30% residual per-run measured at gate, n=90). G3 went changes-requested → corrections → MERGE (review04) |
| #82 | Docs-deploy pipeline fix (lychee self-ref domain — any NEW docs page was blocking its own deploy) |
| #88 | G1 v5: direction change — cursor cancelled-by-direction, Gap 2 → Q6–Q9 |
| #89 | I213 phase-1 cursor deprecation signal: `CURSOR_TARGET_DEPRECATED` advisory (exit-neutral), registry default off, docs markers |
| #90 | I153 close-out sweep: §6 checklist dispositions, doc-122 V2/V5 answered, doc-120 historical banner |

Live verification state: instructions→AGENTS.md verified on claude/codex/opencode (2026-07-23) and **goose** (exp-07, 2026-08-05); OpenCode hook enforcement live-verified (exp-06 Q6 — no Cloudflare gateway needed); OpenCode MCP smoke live-verified (Q9). Cursor: never live-verified, now deprecated.

## 2. The working strategy (why things are the way they are)

1. **Evidence before architecture.** Every design decision traces to a probe or file:line, not docs claims. Track record: D2a falsified by probes (saved a wrong fix), D2c chosen by probes C/D, the Q7 deep-merge finding, Goose's AGENTS.md-native answer. The sentinel/`Instruction-ID` probe method is scripted and reusable (experiments 05/06/07). When a vendor doc and a probe disagree, the probe wins and the doc gets annotated.
2. **Workflow v0.4 with owner-consolidated roles.** Remy is Owner AND Reviewer; gate reviews are executed by **independent adversarial subagents** (their review docs: `cl0153_review02/03/04` — study review04 §3 for the bar). Never self-attest a gate (the I104 B1 lesson). Every gate result → tracker properties + a thread entry with real user mentions, stacked below the 📖 conventions toggle.
3. **Honest-claims doctrine.** If behavior is probabilistic, every shipped surface says so (see PR #81's docs/advisory language). If something is unverified, it is named unverified. Cancellations are "cancelled by direction", not silently deleted — historical rows stay.
4. **Issue hygiene: shrink, don't pivot.** Direction changes spawn issues (I213/I214) rather than mutating gate-passed scope. Decisions land as 📝 entries (no handoff tags).

## 3. Per-issue state and next actions

### I153 — cursor/opencode integration (Owner Status: Building · near closure)
- **Done**: everything in §1; G1 §6 checklist rows checked with evidence pointers (see the merged G1).
- **Remaining, in order**:
  1. **Sub-PR 1** (card housekeeping; plan `cl0153_cursor_opencode_integration_task_plan.md`, v4-corrected): **blocked on the card owner** committing the in-flight published-but-uncommitted 1.2.0 in the canonical card repo (`~/dev/darwinian-cards/cards/workflow-skills/` — its own git repo; HEAD=1.1.0 green 96/96, worktree=1.2.0 with the version-pin test red at `test/card-contract.test.mjs:16`). After reconciliation: execute the plan (Option K default; next-free version; I175 `drwn up` rollout — commands verified in review03).
  2. **Q7 disposition** (pending owner — see §4).
  3. **§7 exclusions endorsement** (pending owner): agent-uptake smoke + non-cursor sub-worker surfaces stay out of I153.
  4. **Close-out**: Owner Status → Merged → Knowledge-captured; drwn-lab card annotation update; knowledge-capture entry per v0.4.
- **Sequence/details**: G1 §9 (merged, v5-amended).

### I213 — cursor deprecation (Owner Status: Building)
- Phase 1 (signal) **shipped** (PR #89). Phase 2 = full removal: needs its own G1 with a blast-radius audit (~28 cli / 44 test files / 14 docs pages reference cursor; the skill compat dirs, hook runtime selection and encoder degradation are SHARED infrastructure — removal must not touch what other targets use) and a migration story for cursor-enabled projects. No urgency; the signal covers users meanwhile.

### I214 — Goose target support (Owner Status: Created · G1-ready, HIGH)
- **Evidence complete** (drwn-lab experiment 07; verdicts recorded on the I214 page). Decisive: AGENTS.md **native** (no adapter); skills via Claude-compat **unchanged**; MCP via project plugin dir `<project>/.agents/plugins/<name>/{plugin.json,.mcp.json}` (works, but first load auto-appends an enable entry to the USER'S global `config.yaml` — the consent/ownership design question); hooks: 11-event system exists, `SessionStart` live-fired, **`PreToolUse` unproven** (provider 401; requires config sandbox); sub-workers: recipes; cadence: weekly minors — **pin every gate to a binary version**.
- **IMPORTANT — untracked artifact**: the configuration guide draft sits UNTRACKED at `~/dev/darwinian-minds/.ai/analyses/134_goose-configuration-guide.md` (main checkout). It must ride I214's G1 docs PR. Don't lose it; don't renumber it (135 is this doc).
- **Next**: G1 target architecture (descriptor-table pattern; opencode's doc 122 is the template; the three design questions above are the core content), then G2/G3.

### I199 — machine-store collision elimination (Owner Status: Created)
- The full-closure path for PR #81's residual race. Its G1 must build on the I177 machine-scope Blueprint V2 contract (per-skill machine toggles are retired always-throw stubs — `cli/commands/machine/skill.ts:413-440`). Carries two notes from review04's re-review: the jsonc/json dual-presence declaration check is optimistically OR'd (exp-06 Q8: `.jsonc` wins — a declaration only in `.json` is inert when `.jsonc` exists), and the acceptance bar trades partial-regression sensitivity for stability — revisit if this stalls.

## 4. Open items owned by the human owner

1. **Q7 disposition** (exp-06; recorded on I153 thread): OpenCode deep-merges same-ID MCP entries per-field → user-scope `environment` injects into drwn-managed servers. Options: document-as-limitation vs a guard (candidate: drwn writes an explicit `environment` field in managed entries to occupy the merge slot — probe first — plus a same-ID-user-scope diagnostic). Outgoing recommendation: the guard, as a small new issue.
2. **§7 exclusions endorsement** (I153 close prerequisite).
3. **Upstream OpenCode reports go/no-go**: the dedup-race report is DRAFTED in exp-05 NOTES ("Upstream report draft"); the Q7 deep-merge finding deserves a second report. Both post under the owner's identity — need his word.

## 5. Environment and tooling knowledge (hard-won; read before working)

- **Worktree**: `~/.config/superpowers/worktrees/darwinian-minds/i153-gate1-docs` (global-worktrees convention). Branch per issue (`remy/<NNN>-slug`). The nested `darwinian-worker-skills/` clone (pinned 6827113) is REQUIRED for release-gate tests in fresh worktrees and must never be committed.
- **Known-red baseline**: ~20 pre-existing failures on main, all one root cause — `scripts/verify-operator-contract.ts:21` expects `darwinian-worker-skills/cards/operator/` which exists in NO commit of the operator repo; CI is green anyway (unexplained — flagged, unowned). Judge work by delta-vs-baseline; never absorb these.
- **Test/gates**: `bun test ./test/` (~5–8 min; never run concurrently with tsc — flakes), `bunx tsc --noEmit`, `bun run docs:build`, `bun run verify:release`. Repo is bun-only. Commit prefixes `[other]/[test]/[docs]/[ci]`; no AI attribution in commit messages; PR bodies carry the Testing & CI evidence section.
- **`.ai/rules/` drift warning**: `01_git.md` is iMinds-flavored (wrong repo — reported, unfixed); AGENTS.md's worktree line says pnpm in a bun-only repo. When rules conflict with repo reality, report drift; use observed conventions.
- **ntn/Notion quirks** (all load-bearing): use `NOTION_API_VERSION=2022-06-28` for raw API; single-block appends only (multi-block and toggle-children appends hang); table_row PATCHes work on the register page but HANG on the Spr-33 dashboard table (append-new-row works there); `ntn pages edit` full-replace chokes on callouts and table colgroups — use surgical block PATCHes; always verify writes landed (timeouts often mean not-landed, but check before retrying — duplicates).
- **Probe assets**: experiments 05 (shadowing/race + upstream draft), 06 (Q1–Q9 with rerunnable `q*-probe.sh` scripts), 07 (goose, 24 evidence files) under `~/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/`. Sandboxing patterns: `AGENTS_REPO_ROOT/AGENTS_HOME_DIR/AGENTS_DIR` env for drwn; `XDG_CONFIG_HOME` for opencode user scope; `CONTEXT_FILE_NAMES` for goose. Treat real `~/.agents`, `~/.claude`, `~/.config/{opencode,goose}` as read-only.
- **Docs deploys**: new pages needed PR #82's lychee fix; if a deploy fails on 404s of a new page, check the self-ref exclusion list in `lychee.toml` first.

## 6. Resume points

1. This doc → the G1 §9 sequence (merged) → the I153 thread (newest-first).
2. The Spr-33 board row (`claude-i153` — marked handed-off) for claims/heartbeat conventions.
3. Gate-review lineage for the quality bar: `cl0024_review01` → `cl0153_review02/03/04`.
