# ABOUTME: G2 task plan for I153 sub-PR 2 — fix the OpenCode cross-scope skill shadowing (G1 v4 Gap 1) via a dedicated projected skills dir declared through the managed opencode.json skills.paths entry, plus a doctor shadowing diagnostic.
# ABOUTME: Mechanism chosen from evidence: drwn-lab experiment 05 probes A–D (D2a falsified; config-declared novel path wins; built-in-scanned paths cannot win). Sibling of sub-PR 1 (card housekeeping) and sub-PR 3 (live qualification).

# I153 · Sub-PR 2 — OpenCode skill shadowing fix + shadowing diagnostic · G2 Plan

**Status**: Planning (GATE 2 artifact for sub-PR 2) — v1, 2026-08-04
**Issue**: [I153](https://app.notion.com/p/curation-labs/I153-drwn-support-for-cursor-opencode-3aef1fbef8c28017b1dee2019cfc63f6)
**Repo**: darwinian-minds (the `drwn` CLI)
**Branch**: `<author>/153-opencode-skill-shadowing`, off `main`
**G1**: [`../analyses/cl0153_cursor_opencode_integration_target_architecture.md`](../analyses/cl0153_cursor_opencode_integration_target_architecture.md) §3 Gap 1 (v4)
**Evidence base**: drwn-lab [`experiments/05-opencode-skill-precedence/NOTES.md`](file:///Users/pureicis/dev/ai-narratives/ai-tool-building/drwn-lab/experiments/05-opencode-skill-precedence/NOTES.md) — probes A–D incl. the 2026-08-04 post-I177 re-run and the D2c addendum

---

## The bug (one sentence)

OpenCode 1.18.4 resolves same-named skills to drwn's **machine-store** copies (`~/.agents/skills/`, with `~/.claude/skills/` also colliding) over the **project's customized** copies, so project-scope skill customization silently does not reach OpenCode sessions.

## Frozen design inputs (all evidence-backed; do not re-derive)

1. **D2a is dead**: a project `.opencode/skills/` writer cannot fix this — built-in-scanned project paths lose the dedup (probe B; re-confirmed post-I177).
2. **Config wins, but only for novel paths**: `opencode.json` `skills.paths` (official schema key, fetched 2026-08-04) makes a **novel** directory the resolved winner (probe C: sentinel won); re-declaring an already-built-in-scanned dir like `.claude/skills` changes nothing (probe D).
3. **drwn already owns managed `opencode.json` merging** — the opencode merge `mergeOpencodeConfigText` (`cli/core/mcp.ts:637`) is the pattern to extend; `test/core-opencode-merge.test.ts` is the existing suite.
4. **Machine scope is I177 Blueprint V2**: the shadowing source (`~/.agents/skills/`) is closure-derived; the legacy per-skill `drwn machine skill enable|disable` commands are retired always-throw stubs (`cli/commands/machine/skill.ts:413-440`, cl0177 §3) — per-skill machine toggling is not a lever. This plan does NOT change machine projection (I177's contract is fresh); it makes the project side win deterministically instead.
5. **No drwn surface detects cross-scope shadowing today** (grep-verified over `cli/core/diagnostics.ts`, `cli/core/ambient-capabilities.ts`) — the fix ships with its regression detector.

## Design

**Mechanism**: drwn projects the project's OpenCode-visible skills into a **dedicated, novel directory** and declares it via a managed `skills.paths` entry in the project `opencode.json`.

- The dir must NOT be a built-in-scanned path (rules out `.claude/skills`, `.opencode/skills`). **Naming choice (the one open design point, decide at G2 review):** recommended `.agents/drwn/opencode-skills/` — inside the drwn-owned project tree, covered by existing ownership/cleanup conventions; alternative: `.opencode/drwn-skills/`.
- Content: the same composed project skill set already written to `.claude/skills/` (single composer; no second source of truth — the dir is a projection, not a copy anyone edits).
- `opencode.json` merge: add `skills.paths: ["<dir>"]` under the existing managed-merge semantics (user-owned keys preserved; managed entry recorded in the write-record like the `mcp` key).
- **Diagnostic**: doctor/ambient gains a cross-scope shadowing check — for each project-projected skill name, if a same-named skill exists in `~/.agents/skills/` or `~/.claude/skills/` AND the opencode `skills.paths` entry is absent/drifted, emit `OPENCODE_SKILL_SHADOWED` (warning; advisory when the managed entry is present and current).

## TDD tasks

### Task 0 — Baseline + fixture freeze
- Record branch/revision, suite counts (`bun test ./test/`), and the experiment-05 probe fixtures as repo test fixtures (sentinel SKILL.md pair).
- Note: 20 pre-existing release-gate failures on main (operator-contract layout drift — see the GATE 1 PR body); they are out of scope and must not be absorbed.

### Task 1 — Skills writer for the dedicated dir
- Modify: `cli/core/skills.ts` (projection), `cli/core/write-record.ts` (surface/ownership for the new dir), `cli/core/paths.ts` (path helper).
- Test: extend the existing skills-projection suite (locate exact file in Task 0; `test/commands-write-cursor-skills.test.ts` is the naming pattern).
- RED: full write in an opencode-enabled project projects the composed skills into the dedicated dir with ownership recorded; partial writes (`--mcp-only` etc.) skip it; cleanup removes only owned content.

### Task 2 — Managed `skills.paths` entry in opencode.json
- Modify: the opencode merge in `cli/core/mcp.ts` (or its extracted home if the G2 review prefers a rename — the merge already handles user-key preservation).
- Test: `test/core-opencode-merge.test.ts` — RED: merge adds/updates `skills.paths` containing the dedicated dir; preserves user-added paths (append, never replace); removal on projection cleanup; byte-idempotence.

### Task 3 — Doctor/ambient shadowing diagnostic
- Modify: `cli/core/diagnostics.ts`, `cli/core/ambient-capabilities.ts`, doctor/status renderers.
- Test: new `test/core-opencode-skill-shadowing.test.ts` — RED: shadowed name without managed entry → warning `OPENCODE_SKILL_SHADOWED`; with current managed entry → advisory/none; JSON + human output pinned; doctor exit behavior unchanged for warnings.

### Task 4 — Acceptance: the experiment-05 probes flip green
- Rebuild probes A/B in a scaffolded fixture project (real CLI write, then `opencode debug skill`): the **project sentinel must now be the resolved winner**.
- Marked as a live-binary smoke (requires the `opencode` binary; skip-with-reason in CI if absent).

### Task 5 — Docs + gates
- `docs-docusaurus` (opencode target page + diagnostics model), CHANGELOG.
- Full suite, `tsc --noEmit`, `docs:build`, `verify:release` (with the pre-existing operator-gate caveat recorded honestly).

## Risks

| Risk | Mitigation |
|---|---|
| OpenCode changes `skills.paths` precedence semantics in a future version | The probes are cheap and deterministic — pin them as the acceptance test; the diagnostic catches silent regression in the field |
| User-authored `skills.paths` entries conflict with the managed one | Append-preserve merge semantics (Task 2 RED case); never replace user entries |
| The dedicated dir drifts from `.claude/skills` content | Single composer writes both in the same pipeline step; byte-equality test in Task 1 |

## References
- G1 v4 §3 Gap 1, §9 sequence step 6 · experiment 05 (all probes) · `cli/core/mcp.ts` opencode merge · I177: `cl0177_machine_scope_blueprint_target_architecture.md`
