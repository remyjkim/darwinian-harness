# ABOUTME: Implementation plan for `drwn acp` — the ACP agent surface fronting a deployed Darwinian Worker over the Deploy API.
# ABOUTME: GATE 2 artifact for [I105]; consumes the verified target architecture in analyses/cl0105 and gates Phase 4 on [I106], Phase 5 on the delivery decision.

# [I105] ACP Agent Surface — Implementation Plan (GATE 2)

**Issue:** [I105] `[I105, DW] ACP agent surface for deployed Darwinian Workers`.
**Architecture:** [`analyses/cl0105_acp_buzz_worker_integration_target_architecture.md`](../analyses/cl0105_acp_buzz_worker_integration_target_architecture.md) — amended 2026-08-06 against `darwinian-services` @ `04cb2db5`, Darwinian Worker `main` @ `203e1ab8`, and the local Buzz evidence checkout @ `0afeac8a7` (remote `main` observed at `f53bbd11`).
**Owner:** Remy K · **Reviewer:** Remy K (owner-as-reviewer authorized 2026-08-06).
**Gates in force:** [I106] and [I107] are merged and knowledge-captured in `darwinian-services`. Phase 5 consumes the delivery decision in [`analyses/cl0105_buzz_tooling_delivery_decision_analysis.md`](../analyses/cl0105_buzz_tooling_delivery_decision_analysis.md) — **decided 2026-08-04: B-lean with the delivery-verification rider** (§7.7). Package release, environment secret installation, live inventory, staging/production deployment, and literal Zed/Buzz live proof remain separate operational gates.

## Decisions and supersessions

- **Protocol version: answer `1`.** Spec-correct, and verified compatible with Buzz — a
  generic agent answering 1 gets the `[Base]` prefix on the first user message
  (`pool.rs:1179-1190`) and everything else works identically. Answering 2 would only move
  Buzz's system prompt from message prose into a `session/new` field we have no server-side
  seam to honor anyway (chat start accepts only `message`). `negotiateProtocolVersion`
  stays a single function so this can flip later without a compatibility layer.
- **SDK: `@agentclientprotocol/sdk` pinned exact at `1.3.0`.** Zero runtime deps; fluent
  `agent().onRequest(…).onNotification(…).connect(stream)` API. Spike verdict (Phase 0,
  `test/core-acp-sdk-spike.test.ts`, permanent): NDJSON framing is the **stable**
  `ndJsonStream(output, input)` export — no experimental dependency at all
  (`./experimental/node` turned out to be HTTP/WS *server* helpers, irrelevant here);
  unknown methods are answered `-32601` automatically (the Buzz hang-prevention
  requirement); malformed lines are silently skipped with the connection surviving, and the
  SDK's parse logging goes to `console.warn`/`console.error` — stderr, so stdout purity
  holds; the in-process `client() ↔ agent()` connection is the harness for the fake-Buzz
  compatibility suite, driven via generic `ctx.request(method, params)`. The hand-rolled
  framing fallback is retired — not needed.
- **Lives in the main CLI**, not a sibling package like `drwn-command-bridge`: the adapter's
  substance is Deploy API plumbing (`worker-http`, `worker-run`, mind bindings) that already
  lives in `cli/core/`. A sibling package would have to import or duplicate it.
- **Read path: `stream-poll`, never `poll`.** `GET /api/chat/:runId/poll` returns the
  turn-level transcript with no tool `args`/`result` and no reasoning
  (`TranscriptEventSchema`, `deploy-contracts.ts:245-265`);
  `GET /api/minds/:slug/chat/:runId/stream-poll` returns raw `StreamEntry`
  (`deploy-contracts.ts:146-162`). Only the latter can feed ACP `session/update`.
- **Slug contract:** `drwn acp serve <slug>` positional; `DRWN_ACP_SLUG` env fallback (for
  editor launch configs and `BUZZ_ACP_AGENT_ARGS`-less setups); if neither is present and
  `~/.agents/drwn/mind-bindings.json` holds exactly one binding, use it; otherwise exit 1
  with guidance on stderr. No new "selected worker" state is introduced.
- **Cancellation consumes I106 exactly.** A `202` response is only durable acknowledgement
  that the run is `cancelling`; it is never an ACP terminal result. The prompt resolves
  `cancelled` only after `agent.cancelled` or authoritative status `cancelled`. `200`
  `already_cancelled` is terminal; typed `409 not_active` settles according to its returned
  status; `409 not_eligible` is nonterminal and explicit. Cancellation is concurrent with
  the prompt owner lock and latches before `activeRunId` exists so a cancel-before-start
  race cannot orphan the server run.
- **Delivery: B-lean + rider (decided 2026-08-04, decision analysis §7.7).** The container
  publishes via the `buzz` CLI — binary in the mind-runtime image (darwinian-services PR),
  `BUZZ_RELAY_URL`/`BUZZ_PRIVATE_KEY`/`BUZZ_AUTH_TAG` as per-Worker `kind:"env"` secrets
  (existing `PUT /api/minds/:slug/secrets/:server` route — the deploy-api control plane
  still speaks the pre-rename mind vocabulary; worker↔mind is 1:1), and a Card-carried
  narrow stdio MCP wrapper exposing only `buzz_messages_send`/`buzz_messages_thread`. It
  invokes the `buzz` CLI without a shell and sends content over stdin. The adapter
  correlates a send `tool.call` with its matching non-error `tool.result`; a call alone is
  not delivery evidence. It issues at most one corrective continuation via `/message` when
  a Buzz-bound turn settles without a successful send. I107 governs these as ordinary Card
  MCP tools using exact selectors `mcp:buzz-tools/buzz_messages_send` and
  `mcp:buzz-tools/buzz_messages_thread`; no carve-out or inferred policy is permitted.

## Target contracts

### CLI grammar

```bash
drwn acp                      # parent stub, prints group help (pattern: cli/commands/worker/worker.ts)
drwn acp serve <slug>         # ACP agent on stdio; slug optional per the slug contract
DRWN_ACP_SLUG=harari drwn acp serve
BUZZ_ACP_AGENT_COMMAND=drwn BUZZ_ACP_AGENT_ARGS="acp serve harari" buzz-acp …
```

`serve` owns stdout exclusively for NDJSON protocol frames; every diagnostic goes to stderr.
Env knobs: `DRWN_ACP_POLL_MS` (default 1000, floor 250) and `DRWN_ACP_POLL_IDLE_MS`
(default 5000) for the active/idle poll cadence. The chat command's fixed 1.5 s cadence and
3-failure give-up are deliberately not inherited; transient poll failures back off
exponentially toward the idle cadence and never abandon a live session.

### Module layout (from architecture §9, unchanged)

```text
cli/commands/acp/acp.ts          parent stub
cli/commands/acp/serve.ts        L0  Clipanion command, stdio wiring, stderr-only logging
cli/core/acp/connection.ts       L1  @agentclientprotocol/sdk agent(), NDJSON framing
cli/core/acp/session.ts          L2  ACP sessionId ↔ runId, lifecycle, load/resume, safe LRU
cli/core/acp/project-events.ts   L3  StreamEntry → session/update (pure function)
cli/core/acp/worker-binding.ts   L4  slug resolution → mind binding + base URLs
cli/core/acp/buzz-profile.ts     L5  Buzz detection, version answer, delivery (Phase 5)
```

Nothing below L2 knows what ACP is; nothing above L2 knows what the Deploy API is.

### Deploy API mapping (verified @ `04cb2db5`)

| ACP | Deploy API | Behavior notes |
| --- | --- | --- |
| `session/new` | *(deferred)* | Local state only; no `runId` until the first prompt. |
| first `session/prompt` | `POST /api/minds/:slug/chat` | Returns `{runId}`; duplicate starts dedupe to the same `{runId}` or `409 invocation_pending` — on 409, back off and retry once before erroring the turn. |
| later `session/prompt` | `POST /api/chat/:runId/message` | Reject locally if a prompt is already active on the session. |
| `session/update` | `GET /api/minds/:slug/chat/:runId/stream-poll?since=` | Cursor = `lastSeq`; L2 owns it; replay-safe on reconnect. **Live-verified wire shape (2026-08-05, `run-42118fae…`):** the response is `{lastSeq, events: [{seq, sourceId, event: StreamEvent}]}` — each entry **wraps** the event; the session layer unwraps `entry.event` before projection, may use outer `seq`/`sourceId` (`"orchestrator"`; panels are multi-source). `text.delta`/`step`/`agent.completed` shapes confirmed exact; `v: 1`; seq monotonic from 1; settle observed as `agent.completed` + run status `yielded`. |
| prompt settlement | `GET /api/chat/:runId/status` | Lightweight second track for zero-event failures; exact response is `{status, runMetrics:{startedAt,finishedAt,totalTokens}}` (verified against Darwinian Services `d6575105`). |
| `session/load` | `GET /api/chat/:runId/snapshot` | Roles + text + tool chips; fidelity limit documented in architecture §4. A v2 snapshot's `streamCursor` is captured atomically and raw replay resumes from it; legacy snapshots retain the cursor-zero fallback. Cached-active sessions and remotely `running` or `cancelling` sessions reject with `-32001`; `cancelled` is terminal and non-continuable. |
| prompt result | run settles | `yielded` → `end_turn`; `cancelled` → `cancelled` + non-continuable; `done` → `end_turn` + non-continuable; `failed` → JSON-RPC error; `running`/`cancelling` remain live. |
| `session/cancel` | `POST /api/chat/:runId/cancel` | `202` is nonterminal; `200 already_cancelled` is terminal; typed `409` outcomes remain truthful. A pre-start intent is latched until `activeRunId` is durably known. |

**Superseding implementation decision (2026-08-05):** architecture §4 originally equated
ACP `sessionId` with Deploy API `runId`. The adapter instead keeps the pre-run local
`sess_*` identity stable and resolves it through the durable `activeRunId` binding. A run
does not exist at `session/new`, and changing the ACP identity after the first prompt would
break restart/load. The versioned store is also the explicit seam for a future Tasks-era
`{taskId, activeRunId}` migration; no nonexistent Tasks API is implemented here.

### Event projection (L3, table-driven)

| `StreamEntry` (`stream-events.ts`, envelope `{v:1, seq, ts}`) | `session/update` |
| --- | --- |
| `text.delta {text}` | `agent_message_chunk` |
| `reasoning.delta {text}` | `agent_thought_chunk` |
| `tool.call {toolCallId, toolName, args}` | `tool_call` (status `in_progress`, `rawInput: args`) |
| `tool.result {toolCallId, result}` | `tool_call_update` (`failed` when `result.isError === true`, otherwise `completed`; `rawOutput: result`) |
| `agent.cancelled {reason:"owner_cancel"}` | lifecycle signal only; settles the owning prompt as `cancelled` exactly once |
| `step {finishReason?, usage?}` | dropped in v1 (Buzz reads usage via a goose-private method, not ACP) |
| `agent.completed` / `agent.failed` | no update — never settles the prompt; panels may terminate and orchestrator failures may retry while the run continues |
| unknown type or `v ≠ 1` | silently dropped; the pure projector does not write stderr |

Live-verification ledger (fold-forward as e2e lands): ✅ start contract (`200 {runId}`) ·
✅ raw-stream fidelity for `text.delta`/`step`/`agent.completed` + cursor + `yielded` settle ·
✅ boot-failure runs emit **zero** entries (no terminal event — settlement detection must
dual-track run status, never stream-only) · ✅ run status is the sole settlement authority
even when panel/orchestrator agent events arrive · ⏳ `tool.call` `args` and `reasoning.delta` text
remain code-verified only — first live observation lands with `e2e-acp-editor` against a
tool-bearing Worker. Cost note: a one-word turn consumed ~13k input tokens (≈$0.04) — e2e
prompts stay minimal and turn counts small.

The current `/status` response intentionally contains status and metrics, not a terminal
error payload. A prior orchestrator `agent.failed` may describe an attempt that the engine
then retried, so the adapter does not reuse that potentially stale text when a later status
becomes `failed`; it reports a generic run failure until the status contract carries
authoritative failure detail.

Stop reasons emitted are exactly the five Buzz recognizes — `end_turn`, `cancelled`,
`max_tokens`, `max_turn_requests`, `refusal` — since an unknown string is a hard Protocol
error in Buzz (`acp.rs:1960-1965`).

### Auth

`resolveToken` / `fetchJsonWithWorkerAuth` are reused verbatim (401 → one refresh+retry for
stored credentials). Phase 1–2: a missing credential fails the first authenticated Worker
request with guidance to run `drwn login`. Phase 3 adds `authMethods: [{id: "dah-device"}]` and an `authenticate`
implementation over the existing device flow, with the terminal interaction on stderr.

## Testing strategy (TDD contract)

### Behaviors & invariants

- stdout carries only complete, single-line JSON-RPC frames — enforced by a stdout-purity
  guard test, since nothing else in the CLI enforces it.
- Every valid request is answered: unknown methods get `-32601` (Buzz hangs on silence),
  malformed JSON is silently ignored without killing the SDK connection (the pinned SDK
  behavior), and an in-flight prompt settles, errors, or aborts promptly with its request
  signal on EOF — never leaks local polling. This does not claim server-side cancellation.
- The projection is a pure function: same `StreamEntry` list in, same `session/update` list
  out in arrival order. Per-entry mapping is independent of numeric `seq` and tolerates
  gaps/unknown types; the Deploy API wire contract supplies monotonic order.
- One active prompt per session; sessions are independent; cursor survives reconnect.
- No test touches real machine state (`envFor` fixtures) and no mock stands in for a real
  API in e2e suites (credential-gated skips instead, per repo rules).

### Layer ownership

| Suite | Layer | Harness |
| --- | --- | --- |
| `test/core-acp-project-events.test.ts` | L3 pure projection | direct unit, table-driven |
| `test/core-acp-session.test.ts` | L2 lifecycle/cursor | unit with fake poller |
| `test/core-acp-connection.test.ts` | L1 framing, errors, purity | in-process stream pair |
| `test/commands-acp-serve.test.ts` | L0 end-to-end command | in-process `Cli.run` + `CaptureStream` + `globalThis.fetch` stub (pattern: `test/commands-worker-chat.test.ts:49-102`); subprocess stdin cases via `runAgentsCli` (`test/helpers.ts:430-459`) |
| `test/core-acp-buzz-profile.test.ts` | L5 permanent Buzz suite | fake Buzz client replaying the recorded `0afeac8a7` handshake: `protocolVersion: 2`, `clientCapabilities {auth:{terminal:true}, _meta:{goose:…, terminal-auth:…}}`, no `fs`/`terminal`, auto-`allow_once`, `session/cancel`, five stop reasons |
| `test/e2e-acp-editor.test.ts` | real deployed Worker, no Buzz | skipIf without `DRWN_E2E_DEPLOY=1` + credentials |
| `test/e2e-acp-buzz.test.ts` | real relay + `buzz-acp` + Worker | skipIf without `DRWN_E2E_BUZZ=1` + Buzz env; Phase 5 only |

### Ordered RED→GREEN increments

1. Framing: one frame per line, numeric and string ids echoed, `-32601`, malformed-line survival
   (the pinned SDK stays silent and keeps serving), stdout purity.
2. `initialize` (version 1 answer; Buzz's version-2 request answered 1), `session/new`,
   canned `session/prompt` → `end_turn`.
3. Projection table — every `stream-events.ts` variant, then gaps/out-of-order/unknown.
4. Prompt → start-run → poll → stream → settle (fetch stub); `409 invocation_pending` retry;
   `failed` → error; cursor advance.
5. Multi-turn `/message`; local and cross-process busy-session rejection; `session/load` from
   snapshot fixture and durable-index refresh on an in-memory miss.
6. Reserved for Phase 4/I106 server cancellation; the current notification handler is a no-op.
7. `authenticate` over device flow (stub hub).
8. Buzz profile suite (fake client, permanent).
9. Phase-4/5 increments per their gates.

### Commands & environment

`bunx bun@1.2.21 run typecheck` and `… run test --timeout 30000 ./test/` in a worktree with
the `darwinian-worker-skills` submodule initialized (per the I176 handoff, unset submodule =
~31 phantom ENOENT failures). CI green = the PR's checks passing.

### Definition of green

Typecheck 0 errors; full suite 0 fail with no unaccounted skips. The six Phase-0 skips plus
the named credential gate in `test/e2e-acp-editor.test.ts` are expected when
`DRWN_E2E_DEPLOY` is absent (seven total); every new non-live suite green; stdout-purity
guard green; no mock substitutes for the credential-gated real-API test.

### Non-goals & residual risk

No local model, no MCP client/hosting, no tool execution, no governance claims (I107). The
`./experimental/node` SDK export may shift under a minor bump — pinned exact, and the Phase 0
spike test converts any silent breakage into a loud one. Raw-SSE migration (architecture
§6.2) is explicitly out of scope until services expose it.

## Execution phases

### Phase 0 — Baseline and SDK spike ✅ complete 2026-08-04
- Baseline recorded (branch `remy/I105-acp-adapter`, submodule-initialized worktree, Bun
  1.2.21, SDK installed, spike suite included): typecheck 0 errors; **1846 pass / 6 skip /
  0 fail**, 9,248 assertions across 313 files in 525.59 s.
- `@agentclientprotocol/sdk@1.3.0` added exact. Spike suite green — four wire tests locking
  the behaviors in §Decisions (stable `ndJsonStream`, version-1 answer to a Buzz-shaped
  version-2 initialize, automatic `-32601`, malformed-line survival) plus the in-process
  `client()` handshake. Framing fallback retired.
- Exit met.

### Phase 1 — Handshake (architecture Phase 1)
- `cli/commands/acp/{acp,serve}.ts`, `cli/core/acp/connection.ts`; register in `cli/index.ts`
  beside the worker block; ABOUTME headers; stderr-only logging.
- Increments 1–2. Exit: Zed (manual) and the fake Buzz client (automated) complete a canned
  turn with zero protocol errors.

### Phase 2 — Real runs (architecture Phase 2)
- `worker-binding.ts` (slug contract), `session.ts` (start/poll/settle, backoff),
  `project-events.ts` (increment 3), streaming loop wiring (increment 4).
- Exit: `drwn acp serve <slug>` streams a real deployed Worker's answer into Zed; suite green.
- **Automated implementation status (2026-08-05): complete.** Start/poll/project/settle,
  exact `invocation_pending` retry, unbounded transient backoff, wrapped raw-event cursors,
  and lightweight `/status` settlement are covered. The manual deployed-Worker/Zed exit
  remains unclaimed.

### Phase 3 — Lifecycle (architecture Phase 3)
- Multi-turn `/message`, `session/load` from snapshot, cursor reconnect, peer-safe durable LRU,
  and `authenticate` via device flow. Increments 5 and 7;
  increment 6 remains gated with I106 instead of presenting a local stop as cancellation.
- Exit: a two-turn editor conversation survives adapter restart via `session/load`.
- **Automated implementation status (2026-08-05): complete.** A versioned local index
  preserves ACP `sessionId` → opaque `activeRunId`, cursor, cwd, continuability, and last-used
  metadata; index updates use a cross-process owner lock plus read-under-lock merge and atomic
  write. Prompt and load hold one shared per-session owner lock (SHA-256 filename) for the full
  operation, make the locked durable record authoritative over stale process state, and map a
  live peer to ACP `-32001`. Load rejects cached-active or remotely `running` sessions before
  replay notifications and raw-cursor priming.
  Schema v2 names the current run binding `activeRunId`, reads and upgrades the branch's
  earlier v1 `runId` records, and intentionally has no `taskId`. When a real Tasks API ships, add
  `{taskId, activeRunId}` through an explicit index-version migration rather than treating a
  Task ID as a run ID or inventing an API contract here.
  Durable GC runs after the current operation releases its session lock. It takes exactly one
  oldest candidate's session lock before the index lock and deletes only after re-reading the
  index under that proof of inactivity. Busy or fail-closed candidates are skipped, allowing
  temporary soft overflow rather than unsafe peer eviction. The only nested order is session →
  index, and no path holds two session locks.
  Tests prove two-turn continuation, second-manager restart/load by the original ACP ID,
  concurrent-manager merge, prompt/load lock contention in both directions, load-time store
  refresh, stale-manager reconciliation, running-snapshot rejection, snapshot replay, cursor
  priming, in-memory LRU eviction, peer-safe durable LRU/soft overflow, and DAH device
  authentication/credential persistence. Manual
  editor restart and live DAH device-flow validation remain unclaimed. The 2026-08-06
  continuation audit adds required corrections before Phase 3 is accepted: consume v2
  `streamCursor` without a snapshot/replay loss window; parse all six run statuses centrally;
  reject `cancelling` loads and make `cancelled` non-continuable; project failed tool results
  as failed; and drive a real `drwn acp serve` prompt/update/settlement wire test. The real-API two-turn
  restart gate now exists at
  `test/e2e-acp-editor.test.ts`; this implementation run verified its named skip with
  `DRWN_E2E_DEPLOY` absent, not a live deployment. Phases 4–5 remain unimplemented.

### Phase 4 — Cancellation (I106 available)
- Consume the exact owner-gated I106 route and result union. `202 accepted` and
  `202 already_cancelling` are nonterminal; keep the prompt and stream/status loops alive.
  `200 already_cancelled` is terminal. Handle `409 not_active` using its returned
  `yielded|done|failed` status, and expose `409 not_eligible` as cancellation unavailable
  without lying that a still-running run stopped. Preserve ordinary authentication and
  ownership errors.
- Cancellation must not take the long-lived prompt owner lock. Maintain a per-session
  cancel intent/generation that can race the active prompt safely. If the intent arrives
  before the first start response, post it immediately after `activeRunId` is persisted.
  Repeated notifications are idempotent.
- Continue polling through `cancelling`; settle exactly once on terminal
  `agent.cancelled {reason:"owner_cancel"}` or authoritative `cancelled` status, mark the
  session non-continuable, and return ACP `stopReason: "cancelled"`. EOF/request abort only
  stops local waits and never claims the remote run was cancelled.
- RED→GREEN coverage: cancel-before-start, mid-stream, tool-call wait, repeated cancel,
  202 nonterminal acknowledgement, 200 already-cancelled, both typed 409s, 401/404,
  missing terminal stream event repaired by status, and no prompt-lock deadlock.
- Exit: adapter tests prove the exact contract against the real session manager and command
  surface. Live server cancellation remains a credential/deployment-gated acceptance exit.

### Phase 5 — Buzz profile and delivery (B-lean + rider)
- `buzz-profile.ts`: Buzz detection by the verified
  `clientInfo {name:"buzz-acp", version:<semver>}` handshake, `[Base]` handling, idle-clock awareness
  (any frame resets Buzz's 900 s idle timer; the 7200 s hard cap never resets — publish
  early, never hold answers to end-of-run), and the delivery-verification rider. Track a
  bare stream `toolName` only after it is correlated by `toolCallId` to a non-error
  `tool.result`. A denied I107 call emits a call plus failed result and must count as no
  delivery. If the turn settles without successful delivery, issue exactly one corrective
  continuation via `/message`; if the second turn still lacks a successful result, emit a
  redacted stderr diagnostic and fail visibly.
- Cross-repo deliverables, sequenced before the live e2e: install the official Buzz
  `desktop-v0.5.5` amd64 Debian asset into the mind-runtime image with fail-closed SHA-256
  verification (`4bd115a5…`; exact value lives in the Dockerfile/test), add a dedicated
  `buzz-tools` stdio MCP wrapper that exposes only send/thread and spawns `buzz` with an argv
  array plus stdin content (never a shell), and author a Card declaration with the exact
  I107 selectors. Do not use broad `buzz-dev-mcp`.
- New command `drwn worker secret set <slug> <name>` (`--kind env|mcp`) against
  `PUT /api/minds/:slug/secrets/:server`: the deploy payload carries `kind:"mcp"` secrets
  only and no CLI surface exists for the PUT route today, so the Buzz secrets runbook has
  no supported client without it. Secret bytes come from stdin, never argv or diagnostics;
  `--env-var` is mandatory for `kind:"env"`. Small command, `worker-http` reuse,
  RED→GREEN like the rest.
- The I105/Worker owner authors rollout evidence
  `{schemaVersion, workerSourceRevision, cardMcpServerKey, authoredSelectors,
  candidateDeploymentId}`. Code may prove the schema and selectors, but it must not invent
  a candidate deployment or claim a live inventory.
- `com.block.buzz` `_meta` proposal drafted upstream. The secrets runbook documents both
  key-custody profiles (decision analysis §7.6): same-key default (no attribution split,
  Buzz's own k8s custody model) and split-key hardened (dedicated rotatable posting
  identity; one `add-member` grant for private channels + a kind:0 profile; visible
  attribution split stated plainly).
- Increment 8–9, `e2e-acp-buzz`. Exit: architecture acceptance criterion 1 — a Buzz mention
  produces the Worker's streamed answer in the right channel.

### Phase 6 — Evidence and workflow close-out
- Completion doc `tasks/cl0105_acp_agent_surface_completion.md`; PR with the mandatory
  `Testing & CI evidence` section; v0.4 transactions (G3 request on the I105 row).

## Success criteria

- [ ] All code-level architecture acceptance criteria demonstrated with evidence; literal
      Zed, deployed-worker, relay-delivery, secret-installation, and deployment exits are
      itemized honestly if the required environment is unavailable.
- [ ] Full suite ≥ baseline, 0 fail; stdout-purity guard permanent.
- [ ] Buzz-profile suite permanent and green against the recorded `0afeac8a7` handshake.
- [ ] Buzz tools are governed as ordinary Card MCP with exact I107 selectors; no bypass,
      inferred declaration, or false live-inventory claim.
- [ ] I106 consumed, not worked around — no fake-cancel shipped to Buzz.

## Risks

| Risk | L | Mitigation |
| --- | --- | --- |
| `./experimental/node` adapter unstable | M | exact pin + Phase 0 spike; hand-rolled framing fallback is small |
| I106 stalls in darwinian-services | M | Phases 0–3 ship editor value without it; Buzz stays gated |
| Buzz interface drifts (pre-stable) | M | permanent fake-client suite pinned to `0afeac8a7`; re-record on upstream bumps |
| stream-poll payload changes under I50 follow-ups | L | projection tolerates unknown types; `v` gate honored |
| Model misroutes a send (wrong channel UUID from prose) | L | relay rejects non-member channels; the rider observes every send; `_meta` proposal upstream removes the prose dependency |

## Out of scope

- Implementing [I106] (darwinian-services) and [I107] (both repos).
- Raw SSE exposure (architecture §6.2) and any projector-fidelity migration.
- Buzz actions beyond replying (reactions, canvas, threads).
- ACP v2 semantics beyond the version-negotiation seam.
