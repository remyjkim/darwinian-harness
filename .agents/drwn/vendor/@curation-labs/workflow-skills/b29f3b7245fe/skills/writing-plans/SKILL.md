---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

> **Org convention:** In the CL Issue-driven Workflow (`.ai/rules/org-wide/06_issue_workflow.md`), this skill produces the **GATE 2 task plan artifact**. Save it to `.ai/tasks/clNNNN_<slug>_task_plan.md` following the `clNNNN_` grammar. The plan MUST include the `Testing strategy (TDD contract)` section required by GATE 2.

> **v0.4 state rule:** Owner planning may proceed while G1 is under review. G2 becomes the current Reviewer Status only after G1 passes and the G2 artifact is ready. Record each status change in the tracker property, Issue Status table, and Issue Thread together.

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `.ai/tasks/clNNNN_<slug>_task_plan.md` (the GATE 2 artifact per `.ai/rules/org-wide/06_issue_workflow.md`). The `clNNNN` prefix is the issue's `#N` zero-padded to 4 digits.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> Execute via the plan-execution skill (executing-plans or subagent-driven-development).

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Testing Strategy (TDD Contract) — Required by GATE 2

Every task plan MUST include a `## Testing strategy (TDD contract)` section. See `.ai/rules/org-wide/06_issue_workflow.md` for the full required structure. At minimum:

```markdown
## Testing strategy (TDD contract)
### Behaviors & invariants
### Layer ownership (unit / integration / smoke / E2E)
### TDD sequence (ordered red → green increments)
### Case catalog
### Harness, fixtures & test data
### Commands & environment
### Required CI jobs / definition of green
### Non-goals, manual checks & residual risk
```

Use the test tiers and exact commands from `.ai/rules/repo-wide/02_test_stack.md`.

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## Remember
- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- Reference relevant skills with @ syntax
- DRY, YAGNI, TDD, frequent commits

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `.ai/tasks/clNNNN_<slug>_task_plan.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- Use subagent-driven-development skill
- Stay in this session
- Fresh subagent per task + code review

**If Parallel Session chosen:**
- Guide them to open new session in worktree
- New session uses executing-plans skill
