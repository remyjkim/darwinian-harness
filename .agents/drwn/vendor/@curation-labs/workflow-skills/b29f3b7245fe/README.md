# @curation-labs/workflow-skills

A Darwinian Minds card bundling 13 customized workflow skills aligned with CL Issue-driven Workflow v0.4, plus a hook policy that enforces its minimum state contract and repository conventions at runtime.

## What this is

This card adapts the upstream "Superpowers" workflow skills (from the `darwinian-minds` repo) to the Curation Labs engineering workflow. Each skill has been customized to **reference `.ai/rules/` for conventions** (paths, prefixes, commands) instead of hardcoding them. This means:

- **Conventions evolve fast** (every PR might tweak a path) → they live in each repo's `.ai/rules/`
- **Procedures evolve slowly** (the TDD cycle doesn't change) → they live in this card, versioned via `drwn`
- **No duplication** between the two layers

## Workflow v0.4 state contract

- Create the tracker row, read its generated ID, and title it `[I<N>] <title>` before creating downstream artifacts.
- Owner Status and Reviewer Status advance independently.
- Reviewer Status exposes only the earliest ready, unapproved gate.
- Owner work may continue on stacked branches while an earlier gate is reviewed.
- Approval and merge order remains G1 → G2 → G3.
- Every Passed or Changes requested result sets `Owner Status = Received`; Received is the Owner alert/inbox, not a work phase or handoff.
- The Owner acknowledges Received into the gate-appropriate execution phase.
- Every state change updates the tracker property, Issue Status table, and Issue Thread together; thread entries are stacked newest-first immediately below `📖 Issue Thread conventions`.
- Every cross-person Issue Thread header uses actual Notion user mentions for both endpoints, resolved from the tracker row's Owner and Reviewer properties; plain roles or names are not valid handoff records.
- `📝 Decision` threads record the decision without tagging a reviewer or implying a handoff.
- Slack is an alert channel, not workflow state.

The full reader edition and review surface live in the [CL Issue-driven Workflow v0.4 Notion page](https://app.notion.com/p/curation-labs/CL-Issue-driven-Workflow-v0-4-3a6f1fbef8c2810184d1fef4491ece1d). This card carries only the executable minimum needed by agents.

## Three-layer cross-agent enforcement

| Layer | Mechanism | Claude Code | Codex | Cursor | OpenCode |
|---|---|---|---|---|---|
| **1. Hook policy** (`additionalContext` on Skill PreToolUse) | Mechanical, per-turn, survives compaction | ✅ | ✅ | ❌ pre-tool | ❌ |
| **2. `instructions.md`** (card manifest, materialized to disk) | File all agents can read | ✅ | ✅ | ✅ | ✅ |
| **3. Customized skill content** | Each SKILL.md references `.ai/rules/` | ✅ | ✅ | ✅ | ✅ |

## Skills included

| Skill | Maps to workflow phase |
|---|---|
| brainstorming | Architecting → GATE 1 |
| writing-plans | Planned → GATE 2 |
| executing-plans | Building → GATE 3 |
| subagent-driven-development | Building → GATE 3 |
| finishing-a-development-branch | Merged → Knowledge-captured |
| using-git-worktrees | All phases (isolation) |
| dispatching-parallel-agents | All phases (fan-out) |
| test-driven-development | TDD contract execution |
| systematic-debugging | Investigation |
| verification-before-completion | Evidence gates (GATE 2+3) |
| requesting-code-review | GATE 3 review |
| receiving-code-review | GATE 3 review |
| incremental-commits | All implementation phases |

## Installation

### Prerequisites
- The `drwn` CLI installed and on PATH (from the `darwinian-minds` repo)
- A repo with `.ai/rules/` set up (org-wide + repo-wide tiers)

### Install in a project

```bash
# From the project root:
drwn use @curation-labs/cl-workflow-blueprint

# Trust the hook policy (required for Layer 1 enforcement):
drwn card trust @curation-labs/workflow-skills --hooks

# Materialize skills + hooks + instructions:
drwn write
```

### Link for local development

Since this card lives in a flat directory (`cl-workflow-skills/`, not `@curation-labs/workflow-skills/`), use individual linking instead of `--all-from`:

```bash
drwn card link @curation-labs/workflow-skills file:/Users/pureicis/dev/darwinian-cards/cl-workflow-skills
```

## Testing

```bash
cd ~/dev/darwinian-cards/cl-workflow-skills
node --test test/*.test.mjs
```

The test suite enforces:
- **card-contract.test.mjs** — card.json shape, skill list, upstream refs, hooks, instructions
- **skill-content.test.mjs** — no forbidden hardcoded conventions (docs/plans/, [type:component], superpowers:, CLAUDE.md, npm test)
- **hook-policy.test.mjs** — policy structure and additionalContext content
- **workflow-v0-4-contract.test.mjs** — independent statuses, current-gate ordering, Received handback, atomic Notion updates, required user mentions, and legacy Turn/Handoff rejection

Functional tests require a local `drwn` checkout, a linked card source, and a repository containing the CL `.ai/rules/`. Override the historical default paths with `DRWN_CLI` and `REPO_WITH_RULES` when needed.

## Maintenance

See [docs/maintenance-runbook.md](docs/maintenance-runbook.md) for the upstream sync workflow and [docs/customization-decisions.md](docs/customization-decisions.md) for what changed vs upstream and why.

Version 1.1.0 changes the hook text, so existing consumers must re-run `drwn card trust @curation-labs/workflow-skills --hooks` before materializing it.
