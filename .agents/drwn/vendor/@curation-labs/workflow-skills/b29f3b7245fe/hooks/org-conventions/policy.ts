// ABOUTME: Org-conventions hook policy — injects .ai/rules/ convention overrides on every Skill tool call.
// ABOUTME: Fires as an observer on PreToolUse for "Skill", injecting additionalContext that reminds the agent
// ABOUTME: to use .ai/rules/ paths/commands instead of the hardcoded defaults in upstream skills.
// ABOUTME: This is Layer 1 of the three-layer cross-agent enforcement strategy:
// ABOUTME:   Layer 1 (this hook): runtime injection for Claude Code + Codex (survives context compaction).
// ABOUTME:   Layer 2 (instructions.md): disk fallback for Cursor + OpenCode (materialized by drwn write).
// ABOUTME:   Layer 3 (customized skill content): each SKILL.md references .ai/rules/ directly.

import { defineToolPolicy } from "darwinian/hook-policy";

export default defineToolPolicy({
  policyKind: "observer", // observer: a throw/timeout never blocks Skill calls
  matcher: "Skill", // fires on every Skill tool invocation (exact tool name is "Skill")

  async beforeToolCall(event) {
    // event.input.skill is the skill name/id being invoked (string).
    // We inject the same convention override message regardless of which skill is loaded.
    return {
      action: "allow",
      additionalContext: `ORG CONVENTION OVERRIDE: This project uses .ai/rules/ for all conventions. When a skill's hardcoded path or convention conflicts with .ai/rules/, the rules win.

Workflow v0.4 state contract:
- After creating an issue row, read its generated ID and rewrite the title as [I<N>] <title> before creating downstream artifacts
- Owner Status and Reviewer Status move independently; Owner work may advance while an earlier gate awaits review
- Reviewer Status exposes only the earliest ready, unapproved gate; approval order remains G1 -> G2 -> G3
- Every Passed or Changes requested result sets Owner Status = Received without changing Owner; Received is an Owner alert/inbox, not a work phase
- A pass surfaces the next ready gate; changes requested remove the review item until resubmission; Owner acknowledgment restores Planning / Building / In Review after passes or Architecting / Planning / Building after G1 / G2 / G3 changes
- Every state change atomically updates the tracker property, issue Status table, and newest-first Issue Thread entry; stack entries immediately below the 📖 Issue Thread conventions toggle
- Every cross-person Issue Thread header uses actual Notion user mentions for both endpoints, resolved from the row's Owner and Reviewer properties; plain role labels, display names, and unlinked @name text are invalid
- A 📝 Decision thread records the decision only; do not tag a reviewer or imply a handoff
- Slack is an alert channel, not workflow state; do not prescribe legacy Turn or Handoff behavior, and never use Received as the v0.3 handoff status

Key repository conventions to use instead of skill defaults:
- Doc/plan paths: follow the clNNNN_<slug>_<kind>.md grammar from .ai/rules/org-wide/06_issue_workflow.md (NOT docs/plans/)
- Commit prefixes: use the prefix table in .ai/rules/repo-wide/01_git_conventions.md (NOT [type:component])
- Test commands: use pnpm <area>:test from .ai/rules/repo-wide/02_test_stack.md (NOT npm test)
- PR descriptions: include the mandatory Testing & CI evidence section per GATE 3 requirements in .ai/rules/org-wide/06_issue_workflow.md
- Worktree setup: detect pnpm-workspace.yaml and run pnpm install (see .ai/rules/repo-wide/02_test_stack.md for the full command map)

When in doubt, read the relevant .ai/rules/ file for the authoritative repository convention. If 06_issue_workflow.md still prescribes the legacy state model, report drift instead of silently mixing workflow versions.`,
    };
  },
});
