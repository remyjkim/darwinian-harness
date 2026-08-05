# ABOUTME: G2 task plan for I153 sub-PR 3 — the Q1–Q9 live-qualification checklist (G1 v4 Gap 2): script and execute (Q1–Q5 credentialed cursor session; Q6–Q9 credential-free opencode checks), recording the cursor/opencode verify debt as drwn-lab evidence.
# ABOUTME: Order-independent of sub-PR 2; execution is operator-gated on cursor-agent login and the Cloudflare gateway env. Sibling of sub-PR 1 (card housekeeping) and sub-PR 2 (shadowing fix).

# I153 · Sub-PR 3 — Live qualification Q1–Q9 · G2 Plan

**Status**: v2, 2026-08-05 — **Q1–Q5 CANCELLED BY DIRECTION** (cursor support dropped, I213; I153 📝 entry 080526). Live scope: **Q6–Q9** (credential-free; Q8 executed — `.jsonc` wins). Cursor probe rows retained as historical record. Prior: Planning (GATE 2 artifact for sub-PR 3) — v1, 2026-08-04
**Issue**: [I153](https://app.notion.com/p/curation-labs/I153-drwn-support-for-cursor-opencode-3aef1fbef8c28017b1dee2019cfc63f6)
**Repo**: the branch `<author>/153-live-qualification` lives in **darwinian-minds** and carries the docs deltas (docs 120/122 verified-state updates, any pinned fixtures); the probe scripts and NOTES live in **drwn-lab** `experiments/06-live-qualification/` (not a git repo — no PR there) (R3-F12)
**Branch**: `<author>/153-live-qualification`, off `main`
**G1**: [`../analyses/cl0153_cursor_opencode_integration_target_architecture.md`](../analyses/cl0153_cursor_opencode_integration_target_architecture.md) §3 Gap 2 (v4.1) — the Q1–Q9 table is the contract
**Operator prerequisites (v2)**: none for the live scope, except possibly the Cloudflare gateway env for Q6's session-signal half. Q6–Q9 executable immediately with the local opencode install

---

## Principle

Every check is **shipped-but-never-live-observed** behavior. The scripts make each check a one-command probe with a recorded PASS/FAIL and an artifact, so the credentialed session is execute-and-record, not design work. Config inspection is not evidence of ingestion (cl0024 review lineage); each probe must observe the harness *behaving*.

## The nine probes (from G1 v4 Gap 2; Q7–Q9 added by G1-review condition C3)

| # | Probe | Method (all scripted) | Evidence artifact |
|---|---|---|---|
| Q1 | Cursor ingests root `AGENTS.md` | Fixture project with renderer-generated block (sentinel + Instruction-ID — reuse the cl0024 probe generator pattern); `cursor-agent --print "report visible instruction sentinels + Instruction-ID"` | transcript + PASS iff exact sentinel and ID reported |
| Q2 | Cursor does NOT double-read `.claude/CLAUDE.md` | Same fixture + distinct sentinel in `.claude/CLAUDE.md` (non-adapter content) | PASS iff the AGENTS.md sentinel is reported and the decoy is not |
| Q3 | Cursor loads projected skills **and the customized version wins** | Fixture with the card's 13 skills projected, the probed skill carrying a project sentinel (experiment-05 pattern); list skills, invoke one, and have it echo its body sentinel | PASS iff skills enumerate, one invocation succeeds, AND the reported body carries the project sentinel (cursor also scans ~/.claude/skills/ machine-default copies — enumeration alone can pass on the wrong bytes); GUI fallback honestly labeled |
| Q4 | Cursor accepts drwn's MCP config | Fixture `.cursor/mcp.json` written by `drwn write` incl. the `"type"` field; session lists/uses the server | PASS iff the server is visible/usable; record same-ID project/user semantics observed (register V-C) |
| Q5 | Cursor hook enforcement fires live | Fixture hooks.json from a deny policy on a marker command; attempt the command in-session | PASS iff the call is denied with the policy reason (register V-F cursor half) |
| Q6 | OpenCode hook enforcement fires live | Same deny-policy fixture, `opencode run` attempting the marker command | PASS iff blocked via the plugin (`tool.execute.before` throw) (register V-F opencode half) |
| Q7 | OpenCode MCP same-ID project-wins | Fixture with the drwn-managed project server + a same-ID user-scope entry; `opencode mcp list` + start | PASS iff the project entry wins wholesale (doc 88 V2 opencode half) |
| Q8 | `opencode.json` vs `.jsonc` precedence | Fixture with both files, distinct sentinels | PASS iff a **deterministic winner is observed and recorded** — no precedence is documented anywhere (doc 88 V5 is the open question); the recorded answer becomes the documentation (R3-F13) |
| Q9 | Real-install MCP smoke | `drwn write` in fixture; `opencode mcp list`; server starts | PASS iff the managed server is listed and starts (doc 88 release smoke) |

## Tasks

### Task 1 — Probe scripts
- Create: `.ai/tasks/assets/` is NOT the home — scripts live in drwn-lab (`experiments/06-live-qualification/`), since they are lab probes, not product code. Each probe = one shell script + fixture builder using the real drwn CLI (`bun run` from the repo) to generate fixtures — no hand-crafted files where the CLI can produce real bytes.
- LLM-free pre-checks included where possible (file presence/bytes) so a probe failure is attributable: delivery vs ingestion.

### Task 2 — Dry-run everything not credential-gated
- Q6 needs no cursor login: if the CF gateway env is unavailable, run the deny-policy probe locally anyway (plugin block path may not need the gateway — record which half is gated). Execute what runs; record precisely what remains gated and by which credential.

### Task 3 — The credentialed session
- Execute remaining probes in one sitting; append results to `experiments/06-live-qualification/NOTES.md` (hypothesis → method → result per lab convention); update the G1 §6 checklist and the register V-C/V-F rows with outcomes (the register = the shared Notion page '[072226 Remy] Architect to drwn worker blueprint' §4 Evidence-gated verify items, https://app.notion.com/p/curation-labs/072226-Remy-Architect-to-drwn-worker-blueprint-3a5f1fbef8c28003a9c4cf4bf28a0ad5).

### Task 4 — Disposition
- Any FAIL becomes a scoped finding on the I153 page (and a new sub-issue if it needs code); any PASS moves the corresponding claim from "expected" to "verified" in docs 120/122 and the drwn-lab card annotation.

## Acceptance
- All nine probes have recorded outcomes (PASS / FAIL / operator-gated-with-named-prerequisite); zero checks left in the ambiguous "plausible, unproven" state that Gap 2 exists to eliminate.

## References
- G1 v4 §3 Gap 2 + §9 steps 7–8 · cl0024 architecture §8 (probe design lineage; opencode/claude/codex ingestion PASS 2026-07-23) · register V-C/V-F rows (consolidated here) · experiment 04 (mock-payload composer tests these probes supersede)
