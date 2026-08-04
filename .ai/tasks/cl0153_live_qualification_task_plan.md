# ABOUTME: G2 task plan for I153 sub-PR 3 — the Q1–Q6 live-qualification checklist (G1 v4 Gap 2): script, execute in one credentialed session, and record the cursor/opencode verify debt as drwn-lab evidence.
# ABOUTME: Order-independent of sub-PR 2; execution is operator-gated on cursor-agent login and the Cloudflare gateway env. Sibling of sub-PR 1 (card housekeeping) and sub-PR 2 (shadowing fix).

# I153 · Sub-PR 3 — Live qualification Q1–Q6 · G2 Plan

**Status**: Planning (GATE 2 artifact for sub-PR 3) — v1, 2026-08-04
**Issue**: [I153](https://app.notion.com/p/curation-labs/I153-drwn-support-for-cursor-opencode-3aef1fbef8c28017b1dee2019cfc63f6)
**Repo**: darwinian-minds (probe scripts + docs); evidence lands in drwn-lab
**Branch**: `<author>/153-live-qualification`, off `main`
**G1**: [`../analyses/cl0153_cursor_opencode_integration_target_architecture.md`](../analyses/cl0153_cursor_opencode_integration_target_architecture.md) §3 Gap 2 (v4) — the Q1–Q6 table is the contract
**Operator prerequisites**: `cursor-agent login` (Q1–Q5) · Cloudflare gateway env (Q5/Q6 hook-fire)

---

## Principle

Every check is **shipped-but-never-live-observed** behavior. The scripts make each check a one-command probe with a recorded PASS/FAIL and an artifact, so the credentialed session is execute-and-record, not design work. Config inspection is not evidence of ingestion (cl0024 review lineage); each probe must observe the harness *behaving*.

## The six probes (from G1 v4 Gap 2)

| # | Probe | Method (all scripted) | Evidence artifact |
|---|---|---|---|
| Q1 | Cursor ingests root `AGENTS.md` | Fixture project with renderer-generated block (sentinel + Instruction-ID — reuse the cl0024 probe generator pattern); `cursor-agent --print "report visible instruction sentinels + Instruction-ID"` | transcript + PASS iff exact sentinel and ID reported |
| Q2 | Cursor does NOT double-read `.claude/CLAUDE.md` | Same fixture + distinct sentinel in `.claude/CLAUDE.md` (non-adapter content) | PASS iff the AGENTS.md sentinel is reported and the decoy is not |
| Q3 | Cursor loads projected skills | Fixture with the card's 13 skills projected; ask the session to list available skills, then invoke one | PASS iff skills enumerate and one invocation succeeds; if headless can't enumerate, GUI screenshot fallback, honestly labeled |
| Q4 | Cursor accepts drwn's MCP config | Fixture `.cursor/mcp.json` written by `drwn write` incl. the `"type"` field; session lists/uses the server | PASS iff the server is visible/usable; record same-ID project/user semantics observed (register V-C) |
| Q5 | Cursor hook enforcement fires live | Fixture hooks.json from a deny policy on a marker command; attempt the command in-session | PASS iff the call is denied with the policy reason (register V-F cursor half) |
| Q6 | OpenCode hook enforcement fires live | Same deny-policy fixture, `opencode run` attempting the marker command | PASS iff blocked via the plugin (`tool.execute.before` throw) (register V-F opencode half) |

## Tasks

### Task 1 — Probe scripts
- Create: `.ai/tasks/assets/` is NOT the home — scripts live in drwn-lab (`experiments/06-live-qualification/`), since they are lab probes, not product code. Each probe = one shell script + fixture builder using the real drwn CLI (`bun run` from the repo) to generate fixtures — no hand-crafted files where the CLI can produce real bytes.
- LLM-free pre-checks included where possible (file presence/bytes) so a probe failure is attributable: delivery vs ingestion.

### Task 2 — Dry-run everything not credential-gated
- Q6 needs no cursor login: if the CF gateway env is unavailable, run the deny-policy probe locally anyway (plugin block path may not need the gateway — record which half is gated). Execute what runs; record precisely what remains gated and by which credential.

### Task 3 — The credentialed session
- Execute remaining probes in one sitting; append results to `experiments/06-live-qualification/NOTES.md` (hypothesis → method → result per lab convention); update the G1 §6 checklist and the register V-C/V-F rows with outcomes.

### Task 4 — Disposition
- Any FAIL becomes a scoped finding on the I153 page (and a new sub-issue if it needs code); any PASS moves the corresponding claim from "expected" to "verified" in docs 120/122 and the drwn-lab card annotation.

## Acceptance
- All six probes have recorded outcomes (PASS / FAIL / operator-gated-with-named-prerequisite); zero checks left in the ambiguous "plausible, unproven" state that Gap 2 exists to eliminate.

## References
- G1 v4 §3 Gap 2 + §9 steps 7–8 · cl0024 architecture §8 (probe design lineage; opencode/claude/codex ingestion PASS 2026-07-23) · register V-C/V-F rows (consolidated here) · experiment 04 (mock-payload composer tests these probes supersede)
