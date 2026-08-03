# ABOUTME: Target architecture for I65 — the drwn CLI bug/DX fixes surfaced by the I49 CLI investigation.
# ABOUTME: GATE 1 artifact. Defines scope, per-fix design, and test intent (executable TDD contract lands in the task plan at GATE 2).

# I65 — drwn CLI bug fixes from I49 · Target Architecture

**Date**: 2026-07-22 (v2 — Fix 5 descoped → I80)
**Author**: Claude + JGB
**Status**: Draft (Architecting → GATE 1)
**Issue**: #65 (`[I65, DW] drwn CLI bug fixes from I49`) · Owner: JGB · Gate: Proposed
**References**: [analyses/104_cli-testing-strategy.md, cli/commands/auth/logout.ts, cli/core/machine-config.ts, cli/core/worker-config.ts, cli/commands/worker/chat.ts, cli/core/git.ts, docs-docusaurus/docs/reference/env-vars.md, https://app.notion.com/p/3a4f1fbef8c2816b82f9c80c5f2624a8]

---

## Executive summary

The I49 CLI investigation exercised `drwn` auth + cloud-deploy end-to-end against staging and surfaced a cluster of CLI defects and DX gaps. This document scopes the fixes we will make **in the `darwinian` (drwn) CLI**, groups them into coherent changes, and states the test intent for each. Two P1 correctness bugs (logout credential stranding; legacy `machine.json` hard-blocking every deploy) and three P2 DX/feature items (error mislabeling; async-chat run-fetch gap; git-ref error cosmetics).

Backend items surfaced by I49 — the staging deploy-pipeline regression (I64) and the disabled BGDB mind-state bindings — are **explicitly out of scope** here; they live in `darwinian-services`. The defaults/env-docs/per-hub-credential DX cluster (originally Fix 5) is **descoped to I80**, which owns it end-to-end.

## Context

Source investigation: I49 (auth 7/8 pass; deploy read/lifecycle pass; new-deploy + mind-state blocked). Full evidence, callouts, and the results table are on the I49 Notion page. Every item below has a reproduced failure and a cited code location.

## Scope

**In scope (this issue, `darwinian` repo):**
1. `drwn logout` strands credentials when the DAH revoke fails — **P1**
2. Legacy `machine.json` hard-blocks all machine.json-reading commands; wrong remediation hint — **P1**
3. Worker error messages mislabel auth/token failures as "Cannot reach Deploy API" — **P2**
4. `drwn worker chat` returns a `runId` with no way to read the result — **P2 (feature)**
6. `git rev-parse` ref-not-found message leaks raw git noise — **P2 (trivial)**

(Fix numbering is preserved from v1 / the I49 roundup; Fix 5 is descoped, see below.)

**Out of scope (tracked elsewhere):**
- **Fix 5 — defaults/env-docs/per-hub credentials** (unprovisioned-prod defaults, undocumented `DRWN_STUDIO_API_URL`/`DRWN_STUDIO_GATEWAY_URL`/`DRWN_DAH_HUB_URL`, ephemeral overrides, single credential file) → **I80**. Note: I80's "unreachable default URL" hint should reuse the Fix 3 worker-error helper (see cross-cutting notes).
- Staging deploy-pipeline regression (`mkdir` at materialize) → **I64** (`darwinian-services`).
- BGDB mind-state bindings disabled + `storage.` NXDOMAIN → backend (`darwinian-services`); the CLI `worker mind` commands are correct.
- Prod provisioning decision (`studio.`/`minds.`/`storage.` NXDOMAIN) → product/infra decision, not code.

---

## Per-fix design + test intent

### Fix 1 — logout is resilient to a failed revoke (P1)

- **Problem**: `cli/commands/auth/logout.ts:49-57` `await`s `revokeToken()` **before** `deleteCredentials()` in the same `try`; a revoke error (observed: `DAH refresh-token revoke failed (400)`) throws into the `catch`, which returns 1 and **never deletes** local creds → `credentials.json` + keychain key stranded. Contradicts the file's own intent (`logout.ts:2`).
- **Approach**: make server revoke **best-effort**. Attempt revoke in its own `try/catch` → on failure, write a warning to stderr; then **always** call `deleteCredentials()`. Exit 0 when local creds are cleared (a failed remote revoke should not fail local logout). Preserve the existing legacy-creds branch and the not-logged-in early return.
- **Test intent**:
  - *Invariant*: after `logout`, local `credentials.json` and the keychain key are gone regardless of revoke outcome.
  - *Behaviors/failure modes*: revoke 400/5xx/network-error → warn + still delete + exit 0; revoke success → silent + delete + exit 0; not logged in → `Not logged in.` exit 0.
  - *Seams*: `LogoutCommand.testDeps` already injects `fetch` + `env`; inject a `revokeToken` that throws/succeeds and a temp creds dir (`DRWN_TEST_KEYCHAIN_DIR`).
  - *Layers*: unit/command-level (primary). No integration needed.

### Fix 2 — legacy `machine.json` migration + correct hint (P1)

- **Problem**: `cli/core/machine-config.ts` strict `drwn.machine` v1 schema rejects pre-operator-v2 config (`{ version, optional, authoring }`) with `MACHINE_CONFIG_INVALID`, no migration; every reader throws (deploy included). The remediation hint (`machine-config.ts:92`) says *"rerun `drwn setup`"* — **no such command exists** (real: `drwn init`).
- **Approach**: two independent, small changes.
  - (a) **Correct the hint** immediately: point users at `drwn init` (or a real repair path), not `drwn setup`.
  - (b) **Add a legacy→v1 migration reader**: when `readMachineConfigFile` encounters a recognized legacy shape, map it to a valid v1 `createEmptyMachineConfig()` (carrying `authoring.scope` into `policy.authoring` where present) and re-persist via `writeMachineConfigFile`. Decision to settle at GATE 2: migrate-in-place on read vs. an explicit `drwn init --migrate` / repair command (the workflow's "consider ≥2 solutions").
- **Test intent**:
  - *Invariant*: a recognized legacy `machine.json` no longer aborts machine.json-reading commands.
  - *Behaviors*: legacy shape → migrated to valid v1 (fields preserved); already-v1 → untouched; genuinely corrupt/unknown → clear error whose hint names a **real** command.
  - *Seams*: `resolveMachineConfigPath` + temp `agentsDir`; fixture legacy + v1 files (existing `test/core-machine-config.test.ts` patterns).
  - *Layers*: unit (schema/migration) + one command-level smoke (deploy payload build no longer throws on legacy).

### Fix 3 — distinguish auth/token errors from connectivity (P2)

- **Problem**: 8 worker commands (`chat.ts:60`, `deploy.ts:138`, `rollback.ts:47`, `list.ts:48`, `deployments.ts:50`, `status.ts:51,71`, `delete.ts:47`) wrap **every** error as `Cannot reach Deploy API at <url>: <msg>`. Confirmed (TC-A8/D9) this mislabels `Not authenticated…`, `Token is expired.`, and real DNS/connect failures under one connectivity banner → users debug the network when they're logged out.
- **Approach**: introduce a **shared error-presentation helper** (e.g. `cli/core/worker-error.ts`) that classifies a caught error into `auth` (not-authenticated / expired / audience) vs `network` (DNS/connect/timeout) vs `other`, and formats an appropriate message — reserve "Cannot reach Deploy API" for genuine network failures. Replace the 8 duplicated call sites with the helper. Auth/token errors already carry identifiable types/codes (`resolve-token` / `jwt` / `worker-http`); classification keys off those.
- **Test intent**:
  - *Behaviors*: unauthenticated → auth message (no "Cannot reach"); expired token → token message; DNS/connect error → "Cannot reach"; unknown → generic.
  - *Invariant*: exit codes unchanged; no behavior change beyond message text + classification.
  - *Seams*: helper is pure (error in → string + category out) → trivially unit-testable; the 8 sites become thin.
  - *Layers*: unit (helper) + 1-2 command-level assertions to lock message routing.

### Fix 4 — read a chat run's result (P2, feature)

- **Problem**: `worker chat` POSTs `/api/minds/:slug/chat` (`chat.ts:46`) and prints the raw response, which is `{ "runId": … }` — an **async run handle, not the reply**. There is no CLI way to fetch the run's output.
- **Approach** — **DECIDED (Owner, 2026-07-22): A + B + web link.**
  - (A) **`worker chat` waits/streams**: after receiving `runId`, poll/stream the run until complete and print the assistant message; keep raw-JSON behind `--json`.
  - **Web-app link**: alongside the reply (and immediately on receiving the `runId`, so it's usable even if the wait times out), print the studio web-app URL for the run/conversation so the user can open it in the browser. Exact URL path to confirm with Remy (GATE 2).
  - (B) **Add `drwn worker run status <runId>`** to fetch a run's status/result on demand.
  - Implementation still depends on which run-read/stream endpoints the Deploy API exposes (confirm during planning).
- **Test intent**:
  - *Behaviors*: chat waits and prints a readable reply + the web-app URL (A); run-status fetches a completed/failed/in-progress run (B); `--json` still yields machine output; timeout/failed-run handled (URL still printed on timeout).
  - *Seams*: inject `fetch`; fake run lifecycle (queued→running→done); control time/poll interval (`DRWN_POLL_MS`).
  - *Layers*: unit/command-level with a faked API; no live-gateway dependency in CI.
  - *Note*: this is the async subcommand gap discussed in the I49 Slack thread; larger than the others — candidate to sequence last.

### Fix 6 — clean git-ref-not-found message (P2, trivial)

- **Problem**: `cli/core/git.ts` `classifyGitFailure` (`git.ts:547-566`) builds every `GitRefNotFoundError` message as `${message}: ${stderr}` — appending git's **full raw stderr**, including the irrelevant `Use '--' to separate paths from revisions…` advice, to what should read as "tag not found." (I49 TC-D8 also reported a missing space — `failed forv9.9.9` — but the message templates at `git.ts:128/:269` have carried the space in every version since `eb2a26c`; treated as a transcription/released-build artifact. The red test locks the exact expected format either way.)
- **Approach**: for the ref-not-found classification, stop concatenating raw stderr; produce a clean "ref/tag `<ref>` not found in `<repo>`" message. Keep full stderr available in the error `context` (already carried) for debug/verbose paths.
- **Test intent**: unit on `classifyGitFailure` / the error formatter — given a rev-parse failure for a missing ref, the message is well-formed and omits the irrelevant git plumbing advice; stderr still present in `context`.

---

## Cross-cutting design notes

- **Fix 3 is the natural home for a shared worker-error helper**; I80's "unreachable default URL" hint (ex-Fix 5a) should reuse it → I80 depends on Fix 3 landing first.
- **Fixes 1, 2, 6** are independent and small — good early red→green increments.
- **Fix 4** is the largest and API-shape-dependent — sequence last; may spin its own follow-up if it grows.
- No shared state between fixes; the worker-error helper (Fix 3) is exported as a seam for I80.

## Testability seams (repo-wide)

- Commands already support dependency injection (`*.testDeps` with `fetch`/`env`), and `DRWN_TEST_KEYCHAIN_DIR` gives a file-backed keychain — so auth/credential and worker-API behaviors are unit/command-testable without live services or OS keychain prompts. This keeps every fix's contract executable in CI without the (currently broken) staging backend.

## Out-of-scope dependencies

| Item | Where |
|---|---|
| Defaults / env docs / per-hub credentials (ex-Fix 5) | **I80** · darwinian (CLI) — reuses Fix 3's error helper |
| Staging deploy regression (`mkdir`) | I64 · darwinian-services |
| BGDB mind-state bindings + `storage.` DNS | darwinian-services (backend) |
| Prod provisioning vs. default-flip decision | product/infra decision |

## Open questions (resolve at GATE 2)

1. Fix 2: migrate-on-read vs. explicit `drwn init --migrate`/repair command?
2. Fix 4 (UX decided: A wait/stream + web-app link + B `worker run status`): what run-read/stream endpoint does the Deploy API expose, and what is the studio web-app URL path for a run/conversation? (Remy)

## Owner decisions of record

- **2026-07-22 · Fix 4 UX**: chat waits/streams the reply **and** prints the studio web-app URL; additionally add `drwn worker run status <runId>`. (JGB)
- **2026-07-22 · Fix 3**: approach approved as designed — shared classifier helper; "Cannot reach Deploy API" reserved for genuine network failures. (JGB)
- **2026-07-22 · Scope**: Fix 5 descoped → I80; Fix 6 kept in I65. (JGB)

## Gate state (I65)

| Gate | Artifact | Review surface | State (2026-07-22) | Next |
|---|---|---|---|---|
| 🚦 **GATE 1** — Architecture | `.ai/analyses/cl0065_drwn-cli-i49-fixes_target_architecture.md` | docs-PR [#56](https://github.com/remyjkim/darwinian-worker/pull/56) + Notion toggle-stack | **Awaiting review** — Turn = Remy, 🚦 pinged 07/22 | On approval: Gate = Arch-Approved, pickup → Planned |
| 🚦 **GATE 2** — Task plan (TDD contract) | `.ai/tasks/cl0065_drwn-cli-i49-fixes_task_plan.md` | docs-PR (not yet opened) | **Drafting** on `junggyubae/I65-plan` (branched from the G1 branch) | Open docs-PR; needs Remy inputs: Fix 4 endpoint shape + web URL path, Fix 2 migration mode |
| 🚦 **GATE 3** — Code + `Testing & CI evidence` | code-PR (branch `junggyubae/I65`) | code-PR | **Not started** | After Plan-Approved; Fixes 1, 2, 6 first, then 3, then 4 |
