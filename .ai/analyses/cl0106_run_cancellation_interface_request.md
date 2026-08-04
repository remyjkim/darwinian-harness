# ABOUTME: Interface request to darwinian-services for HTTP-reachable cancellation of an in-flight run.
# ABOUTME: Documents the gap, why it blocks ACP and Buzz integration, and a proposed endpoint contract.

# Run Cancellation: Interface Request To `darwinian-services`

**Audience:** `darwinian-services` (studio-deployment), with context for `drwn` CLI.
**Issue:** **[I106]** (`[I106, DS] HTTP-reachable cancellation for in-flight runs`, CL Issue Tracker v0.4). Raised by **[I105]**.
**Status:** blocking dependency for [`cl0105`](./cl0105_acp_buzz_worker_integration_target_architecture.md).
**Ask:** one new public endpoint plus an abort path into the container.

## 1. Summary

There is no way for an API caller to stop an in-flight run. Closing the SSE connection stops
the *bridge*; the run continues executing in the Cloudflare Workflow until it finishes on its
own. This is invisible to the caller, and it costs money.

This blocks the ACP adapter described in `cl0105`, because the Agent Client Protocol requires
cancellation to be honored, and because Buzz — the first target client — sends cancellation
on its idle timeout and kills the agent process outright at its hard turn cap. In both cases
the server-side run keeps executing. Without a server-side cancel, the adapter has only two
options, and both are unacceptable:

1. Resolve the prompt as `cancelled` while the run keeps burning tokens. The protocol says
   the turn stopped; the bill says otherwise.
2. Refuse to resolve until the run finishes naturally. The client hangs, and Buzz's own
   timeout fires anyway.

## 2. Evidence

### 2.1 No cancellation route exists

A sweep of `studio-deployment/workers/` for route registrations matching
cancel/abort/stop/terminate returns nothing in source. The only matches are
`/api/desktop/stop` inside `.wrangler/dry-*/worker.js` build artifacts — a bundled third-party
dependency, not a route in this codebase.

Re-swept 2026-08-04 against `main` @ `ec7f9ff2`, including api-entry and coordination: still
zero matches, and no cancellation work has landed since. The only post-cutoff commit matching
"interrupt" (`8767a6c1`) is I50 invocation-dispatch reconciliation, unrelated to run
cancellation. This request is greenfield.

The Coordinator DO's public surface is `coordinate`, `continueCoordinate`, `getRunStatus`,
`getTranscript`, `streamSince`, `getRunWorkflow`. There is no cancel method to expose.

### 2.2 Closing the stream does not stop the run

`req.signal` is threaded into the SSE bridge at `workers/engine/src/worker.ts:305`:

```ts
{ since, signal: req.signal },
```

That aborts the *bridge loop* that polls the DO seq log (`stream-hub/src/sse.ts:51-54`). The Workflow activation that drives
the run is independent of any HTTP connection — which is the correct design for a durable
run, and exactly why a separate cancel channel is needed.

### 2.3 The only real abort lives in the container, unreachable from HTTP

`AbortSignal` handling exists inside the container base
(`containerized-cli-harness/packages/runtime/src/streaming-container-base.ts`), and `abort`
appears in `coordination/src/loop.ts` and `unit-execution.ts` — but those are internal
orchestrator step-failure paths. Nothing reachable over HTTP triggers them.

### 2.4 Runs are long-lived and interactive by construction

A run is a durable conversation, not a single completion. `continueCoordinate`
(`coordination/src/coordinator-do.ts:1687-1729`) keeps a run alive across turns:

```ts
} else if (run.status === "yielded" || run.status === "running") {
  runs.setRunning(run.runId);
} else {
  throw new Error(`continueCoordinate: run ${run.runId} is ${run.status} (terminal); start a new conversation`);
}
```

So the blast radius of a missing cancel is not "one wasted completion." A run can hold a
container, tools, and MCP connections open across many turns.

## 3. Why This Is Worse For ACP Than For The Console

The Studio console can plausibly get away with no cancel: a human closes the tab and moves
on. Three things change with ACP.

**Cancellation is protocol-mandatory.** ACP defines `session/cancel` as a client→agent
notification, and the in-flight `session/prompt` MUST then resolve with
`stopReason: "cancelled"`. An agent that ignores it is non-conforming, and clients will
report it as a hang.

**The client is a machine on a timer, not a human.** Buzz's idle timeout (default 900 s)
sends `session/cancel` and waits for `stopReason: "cancelled"`; its hard 7200 s cap goes
further and kills the subprocess with no cancel at all (`pool.rs:2182-2184`, `:2263-2288`,
verified @ `0afeac8a7`). In a busy channel the idle cancel fires routinely, not
exceptionally — and neither path stops the server-side run.

**Nobody is watching.** A Buzz agent answers mentions unattended. An orphaned run has no
human to notice it, and the operator is billed under their own DAH identity — there is no
agent principal (`deploy-api/src/worker.ts:326-383`). Orphaned runs accumulate silently
against a real person's account.

## 4. Proposed Contract

Minimal, and consistent with the existing runId-addressed family in
`deploy-api/src/chat-proxy.ts`.

```http
POST /api/chat/:runId/cancel
POST /api/minds/:slug/chat/:runId/cancel
Authorization: Bearer <DAH JWT>
```

Response:

```json
{ "runId": "…", "status": "cancelling" | "cancelled" | "already_terminal" }
```

Semantics we need, in priority order:

1. **Idempotent.** Repeat cancels are not errors. ACP clients may cancel more than once, and
   Buzz explicitly may.
2. **Owner-gated** like every other per-run route — resolved through the RunCatalog owner
   gate (`engine/src/worker.ts:497-509`), never by trusting a header.
3. **Acknowledges fast, settles asynchronously.** Returning `cancelling` immediately is fine;
   the adapter resolves the ACP turn on the acknowledgement and does not wait for the
   container to wind down.
4. **Terminal on the event stream.** The run's event log should end with a terminal event so
   any attached reader stops cleanly. Reusing `agent.failed`, or adding an
   `agent.cancelled` variant to `stream-protocol`, both work; a distinct variant is
   preferable because it is not an error and should not be reported as one.
5. **Run becomes non-continuable.** After cancel, `continueCoordinate` should reject as it
   does for other terminal states, so a client cannot resume a cancelled conversation by
   accident.

### 4.1 What "cancel" must actually reach

An acknowledgement that does not stop token spend is worse than no endpoint, because it
converts a visible problem into a hidden one. The endpoint needs to propagate to whatever
holds the model stream — the container `AbortSignal` in
`runtime/src/streaming-container-base.ts` is the existing mechanism. If full propagation is
staged, please make the first release honest: return a status that says the run was marked
but not yet stopped, rather than reporting `cancelled`.

## 5. Adapter Behavior, With And Without This

| | With cancel | Without cancel |
| --- | --- | --- |
| `session/cancel` received | POST cancel, resolve turn `cancelled` | no honest option |
| Billing | stops at cancel | continues to completion |
| Buzz idle timeout | clean stop | orphaned run per timeout |
| Conformance | conforming | non-conforming |

Until this lands, `cl0105` sequences Buzz integration behind it (Phase 4). The ACP adapter can be
built and demoed against editors without cancellation, but it should not be pointed at Buzz.

## 6. Related, Not Blocking

Two adjacent requests from `cl0105`, filed here so the surface is reviewed together. Neither
blocks Phase 1-3.

**Raw event stream over SSE.** The public SSE route emits cumulative `thread.snapshot` frames
that drop tool `args`/`result` and flatten `reasoning.delta` to a boolean
(`deploy-contracts.ts:299-304`, `chat-projector.ts:139-179`). ACP needs incremental chunks
with tool inputs and thought text. The adapter will poll
`GET /api/minds/:slug/chat/:runId/stream-poll` (`chat-proxy.ts:411`) for raw `StreamEntry`
instead. Exposing the existing internal `/coordinate-stream/sse`
(`engine/src/worker.ts:287-314`) unprojected would remove the polling cost — exposure work,
not new plumbing.

**General tool policy.** See
[`cl0107`](./cl0107_tool_governance_constraint_analysis.md) — filed as **[I107]**.

## 7. Open Questions For Services

1. Is there an existing intended cancellation design we should conform to rather than
   propose against?
2. Should cancel be owner-only, or should a delegated principal be able to cancel a run it
   started? This interacts with the missing agent-principal concept (§3).
3. Is `agent.cancelled` acceptable as a new `stream-protocol` variant, given `v` is a
   compatibility gate and consumers are expected to ignore unknown types?
