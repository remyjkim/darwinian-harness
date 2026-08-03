---
name: incremental-commits
description: Use when committing multiple changed files - group related changes logically, write human-authored commit messages without AI assistance traces, coordinate with other coworkers
---

# Incremental Commits

## Overview

**Org convention:** This project uses area-based commit prefixes (not `[type:component]`). Use the prefix table from `.ai/rules/repo-wide/01_git_conventions.md`. The coordination pattern below applies using `[area]` instead of `[type:component]`.

Commit related changes in logical groups with clear, human-authored messages that explain the change without revealing AI assistance. Coordinate with other coworkers to avoid interleaved commits.

## When to Use

Use when:
- Multiple files have been modified
- Changes span different features or fixes
- Need clean git history for review
- Working with AI assistance but need professional commits
- Multiple coworkers are working on the same repository

**Don't use when:**
- Single atomic change across all files
- Emergency hotfix needing one commit

## Multi-Coworker Coordination

### Before Starting Commits

```bash
# 1. Check recent commit history
git log --oneline -20

# 2. Look for patterns:
#    - Are there commits from other coworkers?
#    - What features/areas are they working on?
#    - Are commits using branch flags?

# 3. Choose your branch flag to avoid conflicts
# If you see: [area] messages, use a different area flag
```

### Branch-Flag Pattern

Use area-based flags to identify your work stream:

```bash
# Format: [area] description
git commit -m "[relay] handle missing DATABASE_URL_POOLED gracefully"
git commit -m "[relay] add fallback scenario coverage"
git commit -m "[relay] document broadcast vs stream patterns"
```

**Common flags:** See `.ai/rules/repo-wide/01_git_conventions.md` for this repo's valid area prefixes.

### Avoiding Interleaved Commits

```bash
# Before committing, check if another coworker just committed
git log --oneline -5

# If you see alternating pattern like:
# abc1234 [auth] validate tokens
# def5678 [ui] add loading state    # Different coworker
# 789abcd [auth] handle refresh      # Back to first coworker

# STOP and either:
# 1. Complete your full set of commits before they continue
# 2. Wait for them to finish their commit series
# 3. Coordinate via chat/comments
```

## Core Pattern

```bash
# 1. Check recent history and choose branch flag
git log --oneline -10
# Decide on your area prefix based on what others are doing

# 2. Check status and group mentally
git status --short

# 3. Stage related files together
git add <related-files>

# 4. Commit with area prefix and human-authored message
git commit -m "[area] what changed and why

- First specific change
- Second specific change
- Impact or benefit"

# 5. Repeat for next logical group with same area prefix
```

## Commit Message Guidelines

### Format
```
[area] concise summary

- Bullet point for specific change
- Another specific change
- Impact or outcome
```

Use the area prefix from `.ai/rules/repo-wide/01_git_conventions.md` (e.g. `[studio-be]`, `[auth-hub]`, `[deploy]`). Area prefixes are project-specific — always check the rules file for this repo's valid set.

### Language Rules

**Never include:**
- "Generated with", "Created by", "Assisted by"
- AI tool names (Claude, GPT, Copilot)
- Emojis unless explicitly requested
- Time references ("recently", "just", "now")
- Meta-commentary about the commit process

**Always include:**
- What changed (not how you made it)
- Why it matters (impact/benefit)
- Technical details when relevant

## Grouping Strategy

### By Area (single coworker focus)
```bash
# Check who's working on what
git log --oneline -10
# You see: [ui] commits, so you choose a different area like api

# Group 1: Backend fixes
git add src/api/*.ts src/db/*.ts
git commit -m "[api] handle database connection failures

- Add retry logic for transient errors
- Return proper error codes to client
- Log connection issues for monitoring"

# Group 2: API tests
git add test/api/**/*.test.ts
git commit -m "[api] add connection failure scenarios

- Test retry mechanism
- Verify error responses
- Check logging output"

# Group 3: API documentation
git add docs/api/*.md
git commit -m "[api] document error handling patterns

- List all error codes
- Explain retry behavior
- Add troubleshooting guide"
```

### By Feature (coordinated work)
```bash
# Check current work streams
git log --oneline -10
# You see: no auth commits recently, safe to use the auth area

# Group 1: Core feature implementation
git add src/auth/*.ts src/types/auth.ts
git commit -m "[auth] implement JWT refresh tokens

- Add refresh token generation
- Store tokens securely
- Handle token rotation"

# Group 2: Feature tests
git add test/auth/*.test.ts
git commit -m "[auth] add JWT refresh token tests

- Test token generation
- Verify rotation logic
- Check expiry handling"

# Group 3: Documentation
git add docs/auth.md README.md
git commit -m "[auth] document JWT refresh flow

- Explain token lifecycle
- Add API examples
- Include security notes"
```

### By Fix Scope (hotfix scenario)
```bash
# Quick check for active work
git log --oneline -5
# Clear to proceed with relay fixes

# Group 1: Root cause fix
git add src/relay/handler.ts src/relay/validator.ts
git commit -m "[relay] handle missing DATABASE_URL_POOLED

- Add existence check before database operations
- Return empty worker list when unavailable
- Prevent production failures"

# Group 2: Test updates for fix
git add test/relay/*.test.ts
git commit -m "[relay] add database fallback tests

- Test missing DATABASE_URL_POOLED scenario
- Verify graceful degradation
- Check error logging"
```

## Example Workflow

```bash
# First, check recent activity
git log --oneline -10
# abc1234 [ui] add dashboard widgets
# def5678 [ui] test dashboard components
# 789abcd [auth] validate JWT expiry
# ... older commits

# You see UI and auth work, so choose relay area
# Check what you need to commit
git status --short
# M src/relay/handler.ts
# M src/relay/client.ts
# M test/relay.test.ts
# M test/client.test.ts
# M docs/architecture.md
# ?? docs/troubleshooting.md

# Group 1: Core relay fixes
git add src/relay/handler.ts test/relay.test.ts
git commit -m "[relay] handle missing DATABASE_URL_POOLED gracefully

- Add existence check before database operations
- Return empty worker list when unavailable
- Add comprehensive test coverage
- Prevents production failures when DB not configured"

# Group 2: Client improvements (same area flag)
git add src/relay/client.ts test/client.test.ts
git commit -m "[relay] remove unnecessary protocol messages

- Remove auth message on connection
- Remove subscribe for broadcast endpoints
- Simplify to connect-and-listen pattern
- All 51 tests passing"

# Group 3: Documentation (still relay-related)
git add docs/architecture.md docs/troubleshooting.md
git commit -m "[relay] add architecture and troubleshooting guides

- Document broadcast vs stream patterns
- Explain graceful degradation strategy
- Add production configuration examples"

# Check your commits don't interleave
git log --oneline -5
# 234cdef [relay] add architecture and troubleshooting guides
# 345defg [relay] remove unnecessary protocol messages
# 456efgh [relay] handle missing DATABASE_URL_POOLED gracefully
# abc1234 [ui] add dashboard widgets  # Different coworker
# def5678 [ui] test dashboard components  # Different coworker
# ✓ Good: Your relay commits are grouped together
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Committing all files at once | Group by component/feature/scope |
| "Updated files" messages | Describe what changed and why |
| Mentioning AI assistance | Focus on the change itself |
| Huge commit bodies | Keep bullets concise, save details for PR |
| Mixing unrelated changes | Split into separate commits |
| Test files separate from code | Commit tests with their implementation |
| No area in commit message | Use `[area]` prefix from `.ai/rules/repo-wide/01_git_conventions.md` |
| Interleaving with other coworkers | Check git log first, group your commits |
| Using same area as coworker | Choose different area or coordinate |
| Not checking recent commits | Always run git log before starting |

## Review Before Push

```bash
# Review your commits with context
git log --oneline -15

# Should show logical progression WITH consistent area:
# 423abc1 [relay] add troubleshooting guide
# 892def2 [relay] add fallback scenario tests
# 134fab3 [relay] handle missing environment variables
# 567ghi4 [ui] dashboard updates      # Different coworker - OK
# 789jkl5 [auth] token validation     # Another coworker - OK

# BAD example - interleaved commits:
# 423abc1 [relay] update handler
# 892def2 [ui] add widget         # Different area
# 134fab3 [relay] add tests        # Back to relay - AVOID THIS!

# If you see interleaving, consider:
# 1. Interactive rebase (if not pushed): git rebase -i HEAD~5
# 2. Squashing related commits: git rebase -i HEAD~3
# 3. Coordinating with coworkers before pushing
```

## Multi-Coworker Scenarios

### Scenario 1: Starting Fresh Work
```bash
git log --oneline -10
# See [auth] and [ui] being worked on
# Choose unused area like [scheduler] or [db]
# (check .ai/rules/repo-wide/01_git_conventions.md for valid areas)
```

### Scenario 2: Continuing Your Work
```bash
git log --oneline -10
# See your earlier [relay] commits
# Continue with same area prefix for consistency
```

### Scenario 3: Collision Detection
```bash
git log --oneline -5
# Oh no! Someone just started [relay] work
# Options:
# 1. Wait for them to finish
# 2. Use sub-area: [relay-client] vs [relay-server]
# 3. Coordinate: "I'll take relay-client, you take relay-server"
```

### Scenario 4: Emergency Hotfix
```bash
# For urgent fixes, use priority flag (if defined in this repo's conventions)
git commit -m "[hotfix] critical: prevent data loss

- Emergency fix for production issue
- Bypasses normal coordination
- Must be merged immediately"

# Others will see [hotfix] and know to pause
```

## Red Flags

**Stop and reconsider if thinking:**
- "I'll just commit everything together"
- "The message doesn't matter"
- "I should mention this was AI-assisted"
- "Updated various files" is good enough
- "I'll clean up history later"
- "I don't need to check what others are doing"
- "Area prefixes are optional"
- "A few interleaved commits won't hurt"

**These indicate:** Step back, check git log, coordinate with team, group properly, write clear messages with area prefixes from `.ai/rules/repo-wide/01_git_conventions.md`

## Summary

The branch-flag pattern (`[area]`) serves as a lightweight coordination mechanism when multiple coworkers are committing to the same repository. By checking recent commits and choosing non-conflicting areas (per `.ai/rules/repo-wide/01_git_conventions.md`), you maintain a clean, readable git history without the overhead of constant branching and merging.