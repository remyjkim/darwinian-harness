<!-- ABOUTME: Records what I307 actually shipped, how it was verified, and what it deliberately did not cover. -->
<!-- ABOUTME: Scaffold only until G3 — every section below is unfilled and must not be read as evidence. -->

# I307 — Runtime-Admission Migration Enablement Completion

> **STATUS: SCAFFOLD — NOT COMPLETE.** No section below has been filled. Nothing here is evidence. This document is created with the G1/G2 set so the completion contract is visible from the start, and it is filled only as tasks land. Do not cite it, and do not set Owner Status to `Knowledge-captured`, until every placeholder is replaced and the residual-risk section is written honestly.

**Date:** _to be set at completion_
**Author:** I307 Owner
**Issue:** [I307](https://app.notion.com/p/3bff1fbef8c28152926ffe367b94ffe6)
**Repository:** `remyjkim/darwinian-worker`
**Branch:** `feat/i307-runtime-admission-migration-enablement`
**Frozen base:** `da33f22dc7b997d97178ae3dc1fe7263dd0d0b5f`
**Merged head:** _to be recorded_
**Architecture:** [`cl0307_..._target_architecture.md`](../analyses/cl0307_runtime_admission_migration_enablement_target_architecture.md)
**Plan:** [`cl0307_..._task_plan.md`](cl0307_runtime_admission_migration_enablement_task_plan.md)

---

## 1. What shipped

_One paragraph per objective, describing behavior as it now is — not as it changed. Name the files and the seams._

- **Objective 1 — deployment closure inventory:** _pending_
- **Objective 2 — content-aware version floor:** _pending_
- **Objective 3 — declaration tooling and gates:** _pending_

## 2. Baseline and post-change evidence

_Every figure is a pair: the exact command, and the head it was measured at. A number without its command is not a baseline._

| Measurement | Command | Baseline (`da33f22`) | Post-change (head) |
|---|---|---|---|
| Full gate suite | `bun run test:gate` | _pending_ | _pending_ |
| Typecheck | `bun run typecheck` | _pending_ | _pending_ |
| Floor and lock cases | _pending_ | _pending_ | _pending_ |
| Admission gate cases | _pending_ | _pending_ | _pending_ |
| Derivation cases | _pending_ | _pending_ | _pending_ |
| Registry sweep | _pending_ | n/a | _pending_ |

**New skips introduced:** _pending — state `none` explicitly if none._

## 3. Plan → test map

_One row per case in the plan's catalog, with the test that covers it and its path. Any case without a test is listed here as a deliberate omission with a reason, never silently dropped._

| Case | Test | Path | Result |
|---|---|---|---|
| _pending_ | | | |

## 4. Invariant evidence

The claims that carry the most weight are the ones about things that must **not** have changed.

- **Envelope identity invariance:** _record the before and after `closureHash`, `activationHash`, and `manifestHash` for the fixture set, and state plainly whether they are byte-identical._
- **Existing fixtures unmodified:** _list the fixture files and confirm none was regenerated; if any was, say which and why._
- **Half-migration still rejected:** _record the error code observed._
- **Strict floor cases still floor at 1.3.0:** _record the positive-control results._
- **Attested implementation rollup:** _state whether it moved, and if so, that the regeneration was reviewed and by whom._

## 5. Deployment closure inventory result

- **Environments queried:** _pending_
- **Exact commands run:** _pending_
- **Deployments enumerated:** _pending_
- **Closures resolved from the members table:** _pending_
- **Closures resolved from the retained snapshot:** _pending_
- **Closures unresolved, with the reason for each:** _pending — do not write "none" without having counted._
- **Derived set of Cards actually requiring migration:** _pending_
- **How this compares to the whole Card estate:** _pending_

## 6. TDD learnings and plan deviations

_Where the plan was wrong on contact with the code, and what was done instead. This section is more useful than section 1; write it properly._

- _pending_

## 7. Knowledge deltas

_What is now known that was not known before, especially anything that contradicts the architecture document. If the architecture is now wrong in a load-bearing way, amend it rather than leaving the divergence here._

- _pending_

## 8. What this issue did NOT do

State plainly, so no downstream reader infers coverage that does not exist:

- No Card was republished or retagged.
- No runtime image pin was moved.
- No worker was deployed, re-materialized, or rolled back.
- No production state was mutated.
- The three Cards carrying hosted MCP servers remain unresolved.
- The admission schema was not widened; transport and auth expansion remains I171's.
- **Green here does not prove that a real container starts, admits, and serves a run.** No end-to-end layer was executed.

## 9. Residual risk

_Be specific. "Low risk" is not an entry._

- _pending_

## 10. Follow-on issues

_Created, with their numbers, or explicitly named as not-yet-created._

| Follow-on | Issue | Sequenced on |
|---|---|---|
| Card declaration migration across the deployed set | _pending_ | This issue's inventory |
| Runtime image pin move and redeployment | _pending_ | The migration above |
| Hosted-server transport and OAuth broker | I171 (existing) | — |
| Validation gate installed into Card repositories | _pending_ | The deployability check |

## 11. Verification statement

_Written last, by the person who ran the commands. State what was verified by execution, what was verified by reading, and what was not verified at all. If something was skipped, say so here rather than omitting it._

- _pending_
