# ABOUTME: Implementation plan for `drwn acp` — the ACP agent surface fronting a deployed Darwinian Worker over the Deploy API.
# ABOUTME: GATE 2 artifact for [I105]; consumes the verified target architecture in analyses/cl0105 and gates Phase 4 on [I106], Phase 5 on the delivery decision.

# [I105] ACP Agent Surface — Implementation Plan (GATE 2)

**Issue:** [I105] `[I105, DW] ACP agent surface for deployed Darwinian Workers`.
**Architecture:** [`analyses/cl0105_acp_buzz_worker_integration_target_architecture.md`](../analyses/cl0105_acp_buzz_worker_integration_target_architecture.md) — verified against `darwinian-services` @ `ec7f9ff2` and `block/buzz` @ `0afeac8a7` on 2026-08-04.
**Owner:** Remy K · **Reviewer:** Minseung Lee.
**Gates in force:** Phase 4 requires [I106] (`POST /api/chat/:runId/cancel`) live. Phase 5 consumes the delivery decision in [`analyses/cl0105_buzz_tooling_delivery_decision_analysis.md`](../analyses/cl0105_buzz_tooling_delivery_decision_analysis.md) — **decided 2026-08-04: B-lean with the delivery-verification rider** (§7.7). Phases 0–3 have no external gate.

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
- **Pre-I106 cancellation stance:** `session/cancel` is honored protocol-side (stop polling,
  resolve the in-flight prompt `cancelled`) with a loud stderr warning that the server-side
  run continues. That is acceptable for an editor at a keyboard and documented as such; the
  Buzz profile stays disabled until I106 lands, per the architecture's Phase-4 gate.
- **Delivery: B-lean + rider (decided 2026-08-04, decision analysis §7.7).** The container
  publishes via the `buzz` CLI — binary in the mind-runtime image (darwinian-services PR),
  `BUZZ_RELAY_URL`/`BUZZ_PRIVATE_KEY`/`BUZZ_AUTH_TAG` as per-Worker `kind:"env"` secrets
  (existing `PUT /api/minds/:slug/secrets/:server` route — the deploy-api control plane
  still speaks the pre-rename mind vocabulary; worker↔mind is 1:1), and a Card-carried
  stdio MCP wrapper exposing
  `buzz_messages_send`/`buzz_messages_thread`. The adapter verifies delivery through
  stream-visible `tool.call` events and issues one corrective continuation via `/message`
  when a Buzz-bound turn settles without a send.

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
cli/core/acp/session.ts          L2  ACP sessionId ↔ runId, lifecycle, load/resume, GC
cli/core/acp/project-events.ts   L3  StreamEntry → session/update (pure function)
cli/core/acp/worker-binding.ts   L4  slug resolution → mind binding + base URLs
cli/core/acp/buzz-profile.ts     L5  Buzz detection, version answer, delivery (Phase 5)
```

Nothing below L2 knows what ACP is; nothing above L2 knows what the Deploy API is.

### Deploy API mapping (verified @ `ec7f9ff2`)

| ACP | Deploy API | Behavior notes |
| --- | --- | --- |
| `session/new` | *(deferred)* | Local state only; no `runId` until the first prompt. |
| first `session/prompt` | `POST /api/minds/:slug/chat` | Returns `{runId}`; duplicate starts dedupe to the same `{runId}` or `409 invocation_pending` — on 409, back off and retry once before erroring the turn. |
| later `session/prompt` | `POST /api/chat/:runId/message` | Reject locally if a prompt is already active on the session. |
| `session/update` | `GET /api/minds/:slug/chat/:runId/stream-poll?since=` | Cursor = `lastSeq`; L2 owns it; replay-safe on reconnect. |
| `session/load` | `GET /api/chat/:runId/snapshot` | Roles + text + tool chips; fidelity limit documented in architecture §4. |
| prompt result | run settles | `yielded` → `end_turn`; `done` → `end_turn` + session marked non-continuable; `failed` → JSON-RPC error; `not_found` → error. |
| `session/cancel` | Phase 4: `POST /api/chat/:runId/cancel` | Pre-I106: protocol-side resolution + stderr warning. |

### Event projection (L3, table-driven)

| `StreamEntry` (`stream-events.ts`, envelope `{v:1, seq, ts}`) | `session/update` |
| --- | --- |
| `text.delta {text}` | `agent_message_chunk` |
| `reasoning.delta {text}` | `agent_thought_chunk` |
| `tool.call {toolCallId, toolName, args}` | `tool_call` (status `in_progress`, `rawInput: args`) |
| `tool.result {toolCallId, result}` | `tool_call_update` (status `completed`, `rawOutput: result`) |
| `step {finishReason?, usage?}` | dropped in v1 (Buzz reads usage via a goose-private method, not ACP) |
| `agent.completed` / `agent.failed` | no update — resolves the prompt (`end_turn` / error) |
| unknown type or `v ≠ 1` | dropped, debug-logged to stderr |

Stop reasons emitted are exactly the five Buzz recognizes — `end_turn`, `cancelled`,
`max_tokens`, `max_turn_requests`, `refusal` — since an unknown string is a hard Protocol
error in Buzz (`acp.rs:1960-1965`).

### Auth

`resolveToken` / `fetchJsonWithWorkerAuth` are reused verbatim (401 → one refresh+retry for
stored credentials). Phase 1–2: a missing credential fails `initialize` with guidance to run
`drwn login`. Phase 3 adds `authMethods: [{id: "dah-device"}]` and an `authenticate`
implementation over the existing device flow, with the terminal interaction on stderr.

## Testing strategy (TDD contract)

### Behaviors & invariants

- stdout carries only complete, single-line JSON-RPC frames — enforced by a stdout-purity
  guard test, since nothing else in the CLI enforces it.
- Every request is answered: unknown methods get `-32601` (Buzz hangs on silence), malformed
  JSON gets `-32700`, and an in-flight prompt always resolves — on settle, cancel, error, or
  EOF — never leaks.
- The projection is a pure function: same `StreamEntry` list in, same `session/update` list
  out, order-preserving on `seq`, tolerant of gaps and unknown types.
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

1. Framing: one frame per line, ids echoed, `-32601`, `-32700`, stdout purity.
2. `initialize` (version 1 answer; Buzz's version-2 request answered 1), `session/new`,
   canned `session/prompt` → `end_turn`.
3. Projection table — every `stream-events.ts` variant, then gaps/out-of-order/unknown.
4. Prompt → start-run → poll → stream → settle (fetch stub); `409 invocation_pending` retry;
   `failed` → error; cursor advance.
5. Multi-turn `/message`; busy-session rejection; `session/load` from snapshot fixture.
6. Cancel pre-I106 semantics (resolve + warn + stop polling); cancel idempotent.
7. `authenticate` over device flow (stub hub).
8. Buzz profile suite (fake client, permanent).
9. Phase-4/5 increments per their gates.

### Commands & environment

`bunx bun@1.2.21 run typecheck` and `… run test --timeout 30000 ./test/` in a worktree with
the `darwinian-worker-skills` submodule initialized (per the I176 handoff, unset submodule =
~31 phantom ENOENT failures). CI green = the PR's checks passing.

### Definition of green

Typecheck 0 errors; full suite 0 fail with skips ≤ the Phase 0 baseline; every new suite
green; stdout-purity guard green; no mocked-behavior tests.

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

### Phase 3 — Lifecycle (architecture Phase 3)
- Multi-turn `/message`, `session/load` from snapshot, cursor reconnect, session GC (LRU —
  Buzz never sends a session-end), `authenticate` via device flow. Increments 5–7.
- Exit: a two-turn editor conversation survives adapter restart via `session/load`.

### Phase 4 — Cancellation ⛔ gated on [I106]
- Pre-gate: increment 6 semantics ship in Phase 3; this phase swaps in
  `POST /api/chat/:runId/cancel`, maps ack → `stopReason: cancelled`, handles
  `already_terminal`, and unskips the cancellation e2e.
- Exit: cancel stops the run server-side (verified by run status) and the Buzz gate lifts.

### Phase 5 — Buzz profile and delivery (B-lean + rider)
- `buzz-profile.ts`: Buzz detection (clientInfo), `[Base]` handling, idle-clock awareness
  (any frame resets Buzz's 900 s idle timer; the 7200 s hard cap never resets — publish
  early, never hold answers to end-of-run), and the delivery-verification rider: watch
  `stream-poll` for a send-tool `tool.call`; if the turn settles without one, issue one
  corrective continuation via `/message`; if still none, log the undelivered text to stderr
  and error the turn rather than silently succeeding.
- Cross-repo deliverables, sequenced before the e2e: `buzz` binary in
  `images/mind-runtime/Dockerfile.cloud` (darwinian-services PR), the buzz-tools Card MCP
  wrapper (stdio exec of the CLI, idempotency key `runId + turn index`), and a secrets
  runbook for `PUT /api/minds/:slug/secrets/:server` with `kind:"env"`.
- New command `drwn worker secret set <slug> <name>` (`--kind env|mcp`) against
  `PUT /api/minds/:slug/secrets/:server`: the deploy payload carries `kind:"mcp"` secrets
  only and no CLI surface exists for the PUT route today, so the Buzz secrets runbook has
  no supported client without it. Small command, `worker-http` reuse, RED→GREEN like the
  rest.
- `com.block.buzz` `_meta` proposal drafted upstream. The secrets runbook documents both
  key-custody profiles (decision analysis §7.6): same-key default (no attribution split,
  Buzz's own k8s custody model) and split-key hardened (dedicated rotatable posting
  identity; one `add-member` grant for private channels + a kind:0 profile; visible
  attribution split stated plainly).
- Increment 8–9, `e2e-acp-buzz`. Exit: architecture acceptance criterion 1 — a Buzz mention
  produces the Worker's streamed answer in the right channel.

### Phase 6 — Evidence and workflow close-out
- Completion doc `tasks/cl0105_completion_acp_agent_surface.md`; PR with the mandatory
  `Testing & CI evidence` section; v0.4 transactions (G3 request on the I105 row).

## Success criteria

- [ ] All four architecture acceptance criteria (cl0105 §11.1) demonstrated with evidence.
- [ ] Full suite ≥ baseline, 0 fail; stdout-purity guard permanent.
- [ ] Buzz-profile suite permanent and green against the recorded `0afeac8a7` handshake.
- [ ] No governance claim anywhere in adapter output or docs (I107 boundary respected).
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
