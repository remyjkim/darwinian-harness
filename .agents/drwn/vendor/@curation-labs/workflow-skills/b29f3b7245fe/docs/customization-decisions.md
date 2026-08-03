# Customization Decisions

What changed vs the upstream Superpowers skills and why.

## General approach

Every hardcoded convention was replaced with a **reference to `.ai/rules/`**. This keeps the card low-maintenance: when a repo's conventions change, you update the rule in-repo — no card re-publish needed.

| Upstream hardcodes | Card references |
|---|---|
| `docs/plans/YYYY-MM-DD-*.md` | `.ai/rules/org-wide/06_issue_workflow.md` → `clNNNN_<slug>_<kind>.md` grammar |
| `[type:component]` commit prefix | `.ai/rules/repo-wide/01_git_conventions.md` prefix table |
| `npm test` | `.ai/rules/repo-wide/02_test_stack.md` per-area commands |
| `CLAUDE.md` | `AGENTS.md` / `.ai/rules/` |
| `superpowers:` namespace | Generic skill names (no namespace) |
| `~/.config/superpowers/` paths | Generic `~/.config/` |

## Workflow v0.4 alignment

Version 1.1.0 adds a compact state contract to all three enforcement layers without copying the full workflow handbook:

- `instructions.md` defines independent Owner Status and Reviewer Status, current-gate ordering, and the atomic Notion update.
- The hook injects the same minimum contract at runtime and detects stale v0.3 repository rules.
- Phase-bound skills state only the v0.4 behavior needed at that phase.
- Issue identity is allocated by the tracker: agents read the generated `ID`, then normalize the title to `[I<N>] <title>` before creating downstream artifacts.

Repository `.ai/rules/` remain authoritative for paths, commands, and detailed conventions. The card pins the minimum workflow-state version so stale rules cannot silently reintroduce Turn, Received, or Handoff behavior.

## Per-skill changes

### brainstorming
- Save path: `docs/plans/` → `.ai/analyses/clNNNN_<slug>_target_architecture.md` (GATE 1 artifact)
- Terminal state: explicitly references GATE 1 transition
- Added org convention blockquote

### writing-plans
- Save path: `docs/plans/` → `.ai/tasks/clNNNN_<slug>_task_plan.md` (GATE 2 artifact)
- Removed `> For Claude: REQUIRED SUB-SKILL` header → generic execution instruction
- Added mandatory `Testing strategy (TDD contract)` section (GATE 2 requirement)
- Removed `superpowers:` prefixes from execution handoff

### executing-plans
- Removed `superpowers:` namespace from all references
- Added org convention note mapping to Building → GATE 3

### subagent-driven-development
- Removed all `superpowers:` prefixes (7 instances in SKILL.md + 1 in code-quality-reviewer-prompt.md)
- Replaced `superpowers:code-reviewer` → "general-purpose agent"
- Replaced `docs/plans/feature-plan.md` → `.ai/tasks/clNNNN_<slug>_task_plan.md`
- Replaced `~/.config/superpowers/hooks/` → `~/.config/hooks/`
- Added org convention note mapping to Building → GATE 3

### finishing-a-development-branch
- Added `pnpm test` to test command list
- PR template: added mandatory `Testing & CI evidence` section (GATE 3 requirement)
- Fixed worktree-cleanup inconsistency: Option 2 now keeps the worktree

### using-git-worktrees
- Replaced all `CLAUDE.md` → `AGENTS.md` (7 instances)
- Added `pnpm-workspace.yaml → pnpm install` to setup auto-detect (before npm entry)
- Added `.ai/rules/repo-wide/02_test_stack.md` reference for test commands

### dispatching-parallel-agents
- No forbidden patterns found; already generic
- No changes needed (cleanest skill in the set)

### test-driven-development
- Replaced 4 `npm test` instances with alternatives + `.ai/rules/` reference
- Added org principle blockquote cross-referencing `04_tdd_principles.md`

### systematic-debugging
- Removed 3 `superpowers:` prefixes
- Added org principle blockquote cross-referencing `02_investigation.md`
- `find-polluter.sh`: parameterized test command (`TEST_CMD` env var) with rules reference
- `root-cause-tracing.md`: added rules reference comment
- Left `CREATION-LOG.md` untouched (historical provenance)

### verification-before-completion
- Added org principle blockquote referencing GATE 3 evidence requirements
- Added test-commands note pointing to `02_test_stack.md`

### requesting-code-review
- Replaced 3 `superpowers:code-reviewer` → generic "code-review subagent"
- Replaced `docs/plans/deployment-plan.md` → `.ai/tasks/<plan-name>_task_plan.md`
- Added GATE 3 alignment note

### receiving-code-review
- Softened gratitude ban: "NEVER express gratitude" → "keep acknowledgements brief and technical"
- Replaced `CLAUDE.md violation` → "performative agreement, not technical verification"
- Kept core discipline: no blind implementation, always verify technically

### incremental-commits
- Replaced all `[type:component]` → `[area]` (every section, example, table entry)
- Added prominent org-convention note pointing to `.ai/rules/repo-wide/01_git_conventions.md`
- Kept multi-coworker coordination pattern (adapted to `[area]`)
- Kept AI-disclosure hiding rules (aligned with org git policy)
