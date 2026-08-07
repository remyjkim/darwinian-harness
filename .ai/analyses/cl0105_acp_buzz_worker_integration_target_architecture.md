# ABOUTME: Target architecture for exposing a deployed Darwinian Worker over the Agent Client Protocol.
# ABOUTME: Covers the ACP-to-Deploy-API mapping, module boundaries, server gaps, and the Buzz integration decision.

# ACP And Buzz Integration For Darwinian Workers

Status: proposal — GATE 1 artifact for **[I105]** (`[I105, DW] ACP agent surface for deployed Darwinian Workers`, CL Issue Tracker v0.4). Supersedes nothing. Depends on `darwinian-services` for three server changes named in §6; the blocking one is tracked as **[I106]**, the governance constraint as **[I107]**.

## 1. Decision

Ship one local process, `drwn acp`, that speaks the Agent Client Protocol over stdio and
fronts a **deployed** Worker through the Deploy API. It is an ACP *agent* to its client and
an HTTP client to `darwinian-services`. It never calls a model, never executes a tool, and
never hosts an MCP client.

```text
Buzz / Zed / JetBrains
        │ ACP JSON-RPC, NDJSON over stdio
        ▼
   drwn acp                         ← this proposal
        │ HTTPS + SSE, DAH bearer
        ▼
   Deploy API  ──▶  Engine  ──▶  Coordinator DO  ──▶  container runtime
                                                      (model loop, MCP, tools)
```

Execution stays server-side, which is where
[`100_workers-cli-target-architecture-and-decisions.md`](./100_workers-cli-target-architecture-and-decisions.md)
put it. The "boundary is negotiable" allowance is therefore not spent: `drwn acp` is a
protocol projection, the same category of work as `drwn write`, differing only in that it
projects onto a live socket instead of a file.

This is the third instance of a pattern the CLI already runs twice — one canonical model,
many peer adapters. `cli/core/mcp.ts` projects one MCP registry onto four target formats.
`cli/core/hook-policy/` projects one `ToolPolicyEvent` across five runtimes. ACP projects
one `StreamEvent` vocabulary onto one protocol. Nothing here is architecturally novel.

## 2. What Was Verified

The two source guides (`128_acp_guide.md`, `128_2_buzz_acp_integration_guide.md`, committed
beside this document) carry unresolvable citation tokens and a June 2026 cutoff. Their load-bearing
claims were re-verified against primary sources on 2026-07-24. Three were wrong. Server-side
claims were re-verified again on 2026-08-06 against `darwinian-services` `main` @ `04cb2db5`:
every behavior held; line anchors stale since the I50 chat-proxy rewrite are corrected inline.
Buzz-side claims were re-verified the same day against `block/buzz` `main` @ `0afeac8a7`; two
refinements surfaced — the system-prompt branch is now three-way by agent identity, and only
the idle timeout cancels (§6.1) — with anchors corrected inline.

| Guide claim | Verified state |
| --- | --- |
| Required agent methods are `initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/update` | Agent baseline is `initialize`, **`authenticate`**, `session/new`, `session/prompt`. `session/update` and `session/request_permission` are **client** methods the agent calls. `session/cancel` is a client→agent notification. |
| A strict v1 agent "will not plug into current Buzz without modification" | False. Buzz reads back the version the agent answers (`lib.rs:3914`, `unwrap_or(1)`) and routes system-prompt delivery by agent identity plus version (`pool.rs:182-209`, upstream #4395): goose gets a private extension method, `claude-agent-acp` always gets `_meta.systemPrompt`, and every other agent — including `drwn acp` — gets a bare `systemPrompt` field at version ≥ 2 or a `[Base]` prefix on the first user message below it (`pool.rs:1179-1190`). Both answers work. |
| Build against the ACP TypeScript SDK | The package the guide implies, `@zed-industries/agent-client-protocol`, is deprecated at 0.4.5. Current is **`@agentclientprotocol/sdk@1.3.0`**. |

Confirmed as stated: ACP stable is v1 (v2 went to Draft 2026-07-20 with upstream saying
"don't ship it by default in production"); stdio NDJSON is the only stable transport;
Buzz pins `protocolVersion: 2` deliberately (`acp.rs:126`, comment at `acp.rs:599-600`);
Buzz auto-selects `allow_once` by `kind` with no policy gate (`acp.rs:1882-1937`).

Newly established, and material:

- **Buzz advertises no `fs` and no `terminal` client capability** (`acp.rs:390-411`). The
  `auth.terminal: true` a grep would surface is a login capability — a false positive.
  An agent under Buzz cannot read files or run commands through ACP at all.
- **Buzz's `protocolVersion: 2` is not ACP v2.** `systemPrompt` on `session/new` appears in
  no ACP schema, v1 or v2. Buzz uses the integer as a private feature flag. Claiming v2
  semantics because `2` appeared on the wire would be wrong.
- **Buzz registers agents by flag or env var** — `--agent-command`/`BUZZ_ACP_AGENT_COMMAND` +
  `--agent-args`/`BUZZ_ACP_AGENT_ARGS` (`config.rs:191-201`). No manifest, no registry.
  Unrecognized binaries pass args verbatim (`config.rs:700-707`, `:788-790`).
- **ACP now has an official agent registry** — 38 agents with exact launch distributions at
  `cdn.agentclientprotocol.com/registry/v1/latest/registry.json`.
- **An official proxy pattern exists** (proxy-chains RFD, status implemented;
  `agent-client-protocol-conductor` 2.0.0), whose motivating example is injecting an MCP
  server at `initialize`. It is Rust-only; the TypeScript SDK has no proxy support.

## 3. Constraints That Shape The Design

1. **No local execution.** The CLI has no model client, no MCP client, and no session
   store. `drwn worker chat` is a single HTTP POST (`cli/commands/worker/chat.ts:46`).
2. **Worker and Mind are orthogonal** (Darwinian Workers v2 CLI contract, updated
   2026-08-04 for `darwinian@1.1.0`). A Worker is the selected capability closure; a Mind is
   persona, beliefs, and BeginningDB memory. An ACP session binds a Worker; the Mind is
   loaded server-side per container boot. The Deploy API does not yet mirror this split: it
   flattens each deploy into a 1:1 `minds` + `deployed_workers` pair, and its control plane
   is the last mind-named layer of the staged Mind→Worker rename (`/api/minds/:slug/…`,
   `secrets.mind_id`) — every `minds` route in §4 addresses the deployed Worker.
3. **The permission seam does not exist server-side.** Tools execute inside a Cloudflare
   container the ACP client cannot reach. ACP `session/request_permission`, `fs/*`, and
   `terminal/*` have no counterpart. See §7 for what this costs.
4. **Auth is user-scoped.** DAH device flow, bearer JWT, `sub` becomes run owner
   (`deploy-api/src/worker.ts:326-383`). There is no agent principal.
5. **v0.9.0 was a hard cut, and the V2 line (`1.1.0`, I175–I177) kept the clean-slate
   policy.** New surface arrives as a V1 contract, not as an option bolted
   onto the four existing `TargetName` writers. ACP is a protocol, not a config format;
   it does not belong in `cli/core/targets.ts`.

## 4. The Mapping

The Deploy API turns out to fit ACP closely, because both are built around a durable run
with an append-only event log addressed by a monotonic cursor.

| ACP | Deploy API | Notes |
| --- | --- | --- |
| `session/new` | *(deferred)* | Allocate local state only. No `runId` exists until a prompt arrives, because the start call requires a `message`. |
| first `session/prompt` | `POST /api/minds/:slug/chat` → `{runId}` | `chat-proxy.ts:353`, via the I50 invocation service — duplicate starts dedupe to the same `{runId}` or `409 invocation_pending`; response is `ChatStartResSchema` (`deploy-contracts.ts:216-218`). |
| later `session/prompt` | `POST /api/chat/:runId/message` | `chat-proxy.ts:481`. |
| `sessionId` | local durable ID → `activeRunId` | **Superseding implementation decision (2026-08-05):** ACP identity remains the `sess_*` ID allocated before a run exists; a versioned local binding resolves the opaque Deploy API run. This avoids changing ACP identity after the first prompt and leaves a migration path for future `{taskId, activeRunId}` without pretending a Task ID is a run ID. |
| `session/load` | `GET /api/chat/:runId/snapshot` | Roles, text, and tool chips only. A v2 snapshot supplies the atomic `streamCursor`; legacy snapshots use cursor-zero fallback. `running`/`cancelling` reject before replay, while `cancelled` is terminal and non-continuable. |
| `session/update` | `GET /api/chat/:runId/stream-poll?since=` | Raw `StreamEntry` with real deltas. See §5. |
| `stopReason: end_turn` | run status `yielded` | Not `done`. `done`/`failed` are terminal and cannot be continued (`coordinator-do.ts:1687-1729`). |
| `stopReason: cancelled` | terminal `agent.cancelled` or authoritative `cancelled` status | A `202 cancelling` acknowledgement is explicitly nonterminal. §6.1. |

The event vocabulary maps almost one-to-one
(`containerized-cli-harness/packages/stream-protocol/src/stream-events.ts`):

| StreamEvent | ACP `sessionUpdate` | Buzz parses |
| --- | --- | --- |
| `text.delta` | `agent_message_chunk` | yes |
| `reasoning.delta` | `agent_thought_chunk` | yes |
| `tool.call` (`toolCallId`, `toolName`, `args`) | `tool_call` | yes, resets idle clock |
| `tool.result` (`toolCallId`, `result`) | `tool_call_update` (`failed` when `result.isError === true`) | yes |
| `step` (`finishReason`, `usage`) | `usage_update` | tolerated |
| `agent.completed` | no update; run status remains authoritative | — |
| `agent.failed` | no update; run status remains authoritative | — |
| `agent.cancelled` | lifecycle only; terminal cancelled settlement | — |

`toolCallId` correlates `tool.call`→`tool.result` exactly as ACP correlates
`tool_call`→`tool_call_update`. `WIRE.md` anticipates this: *"an adapter to/from that shape
is a thin mapping at the edge."*

The two agent events above are not run terminals: panel workers can complete or fail while
the run continues, and the orchestrator can emit `agent.failed` before retrying the turn.
Only the owner-gated run-status response settles or fails an ACP prompt.

## 5. Use `stream-poll`, Not SSE

The obvious choice — SSE at `/api/minds/:slug/chat/:runId/stream` — is wrong for ACP.

Its frames are **cumulative snapshots**, not deltas: every `thread.snapshot` re-projects the
entire item list from `since=0` (`chat-projector.ts:139-179`). The projector also drops
tool `args` and `result` (`deploy-contracts.ts:299-304`) and flattens `reasoning.delta` to a
boolean `thinking` flag (`chat-projector.ts:163-167`). ACP needs incremental chunks, tool
inputs, and thought text — all three are destroyed by the projection.

`GET /api/minds/:slug/chat/:runId/stream-poll?since=` (`chat-proxy.ts:411`) returns
unprojected `StreamEntry` including `args` (`deploy-contracts.ts:146-162`, `.passthrough()`).
Start there. §6.2 proposes a raw SSE route to remove the polling cost later; the engine
already has `/coordinate-stream/sse` internally (`engine/src/worker.ts:287-314`), so this is
exposure work, not new plumbing.

Do not confuse `stream-poll` with the CLI's existing `GET /api/chat/:runId/poll`
(`cli/core/worker-run.ts:69-79`, behind `drwn worker chat`). That route returns the
turn-level transcript (`TranscriptEventSchema`, `deploy-contracts.ts:245-265`) — thought and
output text only, with no tool `args`/`result` and no `reasoning.delta`. Its auth, cursor,
and status helpers are reusable; its payload is not sufficient for ACP.

## 6. Server Changes Required In `darwinian-services`

These are the real cost of this project. None can be worked around adapter-side.

### 6.1 Cancellation — implemented by I106; exact consumer contract

I106 now provides owner-gated cancellation at `POST /api/chat/:runId/cancel`, durable
`cancelling → cancelled` settlement, and one terminal
`agent.cancelled {reason:"owner_cancel"}` event. Its `202` response is acknowledgement only,
not terminal completion; the adapter keeps polling until the event or authoritative
`cancelled` status. Typed `409 not_active` and `409 not_eligible` outcomes preserve the
actual lifecycle instead of coercing it to cancellation.

Buzz's idle timeout (default 900 s, `BUZZ_ACP_IDLE_TIMEOUT`) sends
`session/cancel` and drains until the prompt resolves `cancelled`; its hard turn cap
(default 7200 s) does not cancel at all — it declares the subprocess unrecoverable and
respawns it (`pool.rs:2182-2184`, `:2263-2288`). The adapter therefore needs concurrent
cancel intent: it cannot wait behind its own prompt owner lock, and a notification received
before start returns a run ID must be posted as soon as that durable ID exists. Local EOF
remains only local abort and cannot claim server settlement.

Full gap analysis and proposed contract:
[`cl0106`](./cl0106_run_cancellation_interface_request.md) — filed as **[I106]**.

### 6.2 Raw event stream over SSE — strongly desired

Expose the unprojected event stream as SSE so the adapter is not polling. Deliverable is a
public route over the existing internal `/coordinate-stream/sse`.

### 6.3 A general declarative tool policy — desired

`POST /api/minds/:slug/chat` accepts `toolPolicy` and threads it into the run
(`engine/src/worker.ts:188-191` → `chat-input.ts:71` → `coordinator.ts:64-90`), but it is
**not a general tool allowlist**. The routine shape
`{version:1, allowedApps[], policyHash, routes[]}` gates at MCP-*server* granularity and
Pipedream routing; any other shape reaches the container as `ROUTINE_TOOL_POLICY` and
**fails closed** — all card servers suppressed, chat 409 (`routine-tool-policy.js`,
corrected 2026-08-04 by the DS review of the remediation handoff). Interactive runs carry
no policy at all, and no shape gates individual tool names.

Required for governance parity: generalize the contract to an allow/deny surface the runtime
honors for all tools, not only Pipedream routing. Detail in
[`cl0107`](./cl0107_tool_governance_constraint_analysis.md) — filed as **[I107]**.

## 7. What The Governance Story Actually Is

An earlier reading of this problem held that ACP is where drwn's declared-but-unenforced
Card governance (`tools.allow`/`deny`, `permissions`, `escalation` — `cli/core/card-manifest.ts:32-59`)
finally gets teeth, because ACP has a first-class permission request that the four
file-config targets lack. **For the remote-fronting architecture, that is wrong**, and the
correction matters.

Tools run inside a Cloudflare container. The ACP client cannot serve, gate, or approve them.
`session/request_permission` has no server counterpart, and inventing one would mean routing
every remote tool call back through a local stdio process — a latency and availability
disaster.

Nor is there a declarative substitute today for interactive runs. `toolPolicy` enforces
only for routines, at server granularity (§6.3). Projecting Card `tools.allow`/`deny` into
it now would trip the container's fail-closed `invalid` mode and 409 the run — loud rather
than silent, but equally unusable as a governance path until §6.3's generalization lands.

The honest position: **Card tool governance has no enforcement path in the deployed runtime
today.** The only real boundary is the set of MCP servers the Card ships, since the container
can call nothing it did not connect at boot, plus the container sandbox itself. That is
coarse but genuine, and it should be described that way rather than dressed up.

Making it finer requires §6.3 server-side. Until then the adapter must not claim to enforce
tool policy, and `drwn status` must not report Card `tools.allow`/`deny` as active for
deployed Workers.

Consequence for Buzz: Buzz auto-approves permissions and we cannot compensate from the client
side. `drwn-command-bridge` is **not** on this path; its consent gate is interactive and
fail-closed (`src/consent/gate.ts:19-23`), which is wrong for a headless chat agent anyway.

## 8. Buzz Tooling And Delivery (decided)

**Resolved 2026-08-04 — Option B-lean with a delivery-verification rider** (Remy): the
container publishes via the `buzz` CLI — binary in the mind-runtime image, `BUZZ_*`
per-Worker env secrets, a Card-carried stdio MCP wrapper exposing only send/thread — and the
adapter correlates a send or threaded-reply `tool.call` with its non-error `tool.result`, issuing one corrective
continuation when a Buzz-bound turn settles without successful delivery. A denied I107 call
emits a call plus failed result, so a call alone is never delivery evidence. The evidence pass and full pricing live in
[`cl0105_buzz_tooling_delivery_decision_analysis`](./cl0105_buzz_tooling_delivery_decision_analysis.md)
§7, which governs; the summary below is the original framing, kept as the record.

Buzz's model assumes the agent is a **local** process: it declares a local stdio MCP server
named by `BUZZ_ACP_MCP_COMMAND` in `session/new.mcpServers`, with `BUZZ_RELAY_URL`,
`BUZZ_PRIVATE_KEY`, `BUZZ_AUTH_TAG`, and `BUZZ_ACP_DISPLAY_NAME` placed in its `env`
(`lib.rs:4280-4330`) — the *agent* is expected to spawn it. Every deployment sets that
command to `buzz-dev-mcp`, which exposes seven generic dev tools (`shell`, `read_file`,
`view_image`, `str_replace`, `todo`, `_Stop`, `_PostCompact`) and **no messaging tool**.
Publishing happens by the agent running `buzz messages send --channel <UUID> --content …`
through the `shell` tool (`base_prompt.md:73`); the channel UUID is a mandatory per-send flag
with no env or context default (`buzz-cli/src/lib.rs:351-378`), available only from the
prompt's `[Context]` prose.

A remotely-executed agent cannot use any of that. The container cannot spawn a binary that
lives on the operator's laptop.

Three resolutions, with the trade-off that decides them:

**A. Adapter as delivery controller.** The adapter reads the Buzz credential env from the
`mcpServers` declaration in `session/new`, lets the remote agent produce answer text, and
deterministically publishes it by exec'ing `buzz messages send` with that env — no MCP
client needed, since `buzz-dev-mcp` has no messaging tool to call and the `buzz` binary
ships on the same machine. Keeps the Nostr key on the operator's machine and removes the
guide's §4.6 failure mode where the model forgets to call the send tool. Cost: the channel
id must come from somewhere — Buzz sends no structured `_meta` (re-verified @ `0afeac8a7`),
and parsing it from prose is brittle.

**B. Card-carried network Buzz tools.** Give the Mind Buzz credentials as deployment secrets
and a network-reachable Buzz MCP server, so the container talks to the relay directly.
Clean separation, no local MCP client. Cost: ships a Nostr private key to the cloud, and
requires verifying the relay is reachable from a Cloudflare container over WebSocket.

**C. Local mode for Buzz, remote mode for editors.** `drwn acp` launches a registry ACP
agent locally with Worker config injected, for Buzz only. Cost: two runtime models to
maintain, and it abandons the deployed Worker for the Buzz case.

Pre-evidence recommendation was **A**, on the grounds that it keeps the private key local
and makes delivery deterministic rather than model-dependent — superseded by the decision
above once the 2026-08-04 evidence pass repriced B (decision analysis §7). The upstream
Buzz `_meta` profile proposal (guide §7) proceeds regardless, so channel routing stops
depending on prose for every ACP agent.

Note that C has a cheap consolation prize regardless of the choice:
`@agentclientprotocol/claude-agent-acp` reads `<cwd>/.claude/settings.json` and takes
`mcpServers` from `session/new`. drwn already writes exactly those files, so launching it
with `cwd` set to a drwn project root inherits the Worker's skills, MCP servers, and hooks
with no new code. Only the launch declaration is missing.

## 9. Module Boundaries

Five layers, each independently testable. Nothing below L2 knows what ACP is; nothing above
L2 knows what the Deploy API is.

```text
cli/commands/acp/serve.ts        L0  Clipanion command, stdio wiring, stderr-only logging
cli/core/acp/connection.ts       L1  @agentclientprotocol/sdk agent(), NDJSON framing
cli/core/acp/session.ts          L2  ACP sessionId ↔ runId, lifecycle, load/resume
cli/core/acp/project-events.ts   L3  StreamEntry → session/update
cli/core/acp/worker-binding.ts   L4  selected Worker → slug + toolPolicy
cli/core/acp/buzz-profile.ts     L5  version answer, Buzz _meta, delivery
```

L3 is a pure function and carries the correctness risk, so it should be table-driven:

```ts
// cli/core/acp/project-events.ts
export function projectStreamEntry(entry: StreamEntry): SessionUpdate[] {
  switch (entry.type) {
    case "text.delta":
      return [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: entry.text } }];
    case "reasoning.delta":
      return [{ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: entry.text } }];
    case "tool.call":
      return [{ sessionUpdate: "tool_call", toolCallId: entry.toolCallId,
                title: entry.toolName, status: "in_progress", rawInput: entry.args }];
    case "tool.result":
      return [{ sessionUpdate: "tool_call_update", toolCallId: entry.toolCallId,
                status: entry.result?.isError === true ? "failed" : "completed",
                rawOutput: entry.result }];
    default:
      return [];
  }
}
```

L2 owns the cursor. Every `session/update` batch advances `since`, and reconnection replays
from the last delivered `seq` — which is what makes duplicate delivery and lost
acknowledgements non-issues.

Concurrency is per local ACP identity. Prompt and load both hold the same owner-record lock
whose filename is the SHA-256 of `sessionId`; a live peer process maps lock contention to ACP
`-32001`. Once inside that lock, the durable record is re-read and made authoritative over any
stale in-process cache. A cached active session or a snapshot still marked `running` is rejected
before notifications and raw cursor priming.

`maxSessions` bounds both the process-local LRU and, when inactivity can be proven, the durable
index. Durable GC runs only after the current operation releases its session lock. It selects an
oldest candidate, takes exactly that candidate's session lock, then re-reads and prunes under the
index lock. A live or fail-closed candidate is skipped, allowing temporary soft overflow rather
than deleting a peer-active mapping. The only nested order is session lock → session-index lock;
no path holds two session locks, so there is no reverse-order cycle.

```ts
// cli/core/acp/session.ts
export interface AcpSession {
  sessionId: string;
  runId: string | null;        // null until the first prompt starts a run
  slug: string;
  cursor: number;              // last delivered StreamEntry seq
  activeTurn: AbortController | null;
}
```

Version negotiation is one function, not a compatibility layer:

```ts
// cli/core/acp/buzz-profile.ts
// Buzz uses the version integer as a feature flag for its private systemPrompt
// extension. Answering 1 is spec-correct and Buzz falls back to a [Base] prefix.
export function negotiateProtocolVersion(requested: number): number {
  return requested >= 2 && allowBuzzProfile ? 2 : 1;
}
```

## 10. Sequencing

Each phase ends at something observable. No phase depends on a later one.

**Phase 1 — handshake.** `initialize`, `authenticate`, `session/new`, `session/prompt`
returning a canned `end_turn`. Success: Zed launches `drwn acp` and completes a turn; Buzz
launches it via `BUZZ_ACP_AGENT_COMMAND=drwn` and completes a turn without protocol errors.

**Phase 2 — real runs.** Bind the selected Worker to a slug, start runs, poll `stream-poll`,
project events, resolve `end_turn` on `yielded`. Success: a Buzz mention produces a streamed
answer from the deployed Worker.

**Phase 3 — lifecycle.** `session/load` from snapshot, multi-turn continuation via
`/message`, cursor-based reconnect, `authenticate` over DAH device flow. Success: a channel
conversation retains context across mentions and survives an adapter restart.

The 2026-08-06 continuation audit tightens that phase: consume the v2 snapshot
`streamCursor` atomically before replay; keep cursor-zero fallback only for legacy snapshots;
recognize all six run statuses; reject `cancelling` load, keep `cancelled` non-continuable,
and add a command-level prompt/update/settlement test rather than relying only on direct
manager tests.

**Phase 4 — cancellation.** Consumes §6.1. `202 cancelling` keeps the prompt live; only the
terminal event/status resolves it as `cancelled`. Success includes cancel-before-start,
mid-stream, repeated-cancel, and no-deadlock proofs.

**Phase 5 — delivery.** Consumes the §8 decision (B-lean + rider), plus I107 exact-selector
Card MCP governance. The dedicated wrapper exposes only send/thread, invokes the pinned
official `buzz` CLI without a shell, and never uses broad `buzz-dev-mcp`.

## 11. Testing

Layers 1-3 of the guide's strategy apply and should be adopted; layer 4 needs adjusting
because the runtime is remote.

- **Protocol**: exact serialized bytes. One JSON object per line, no embedded newlines,
  numeric and string ids, unknown methods answered `-32601` (Buzz hangs on silence),
  unknown `_meta` tolerated, stdout uncontaminated.
- **Projection**: table-driven per-entry `StreamEntry` → `session/update`, independent of
  the numeric `seq` value and tolerant of gaps/unknown event types. It preserves arrival
  order; the Deploy API wire contract, not the projector, supplies monotonic ordering.
- **Lifecycle**: cancel before start, mid-stream, and during a tool call; terminal-run
  continuation rejected; snapshot reload.
- **Buzz profile**: a fake Buzz client reproducing the real handshake — `protocolVersion: 2`,
  goose `_meta`, no `fs`/`terminal` capability, auto-`allow_once`, `session/cancel`. Permanent
  suite, not a one-off, because this interface is ahead of stable ACP.
- **End-to-end**: real relay, real `buzz-acp`, real deployed Worker. Per the repo's testing
  rules this uses real APIs and skips on absent credentials rather than mocking.

### 11.1 Test intent by acceptance criterion (GATE 1)

| Acceptance criterion (I105 row) | Evidence that proves it |
| --- | --- |
| Zed launches `drwn acp` and completes a multi-turn session that survives an adapter restart | Automated lifecycle evidence is split by boundary: `test/core-acp-session.test.ts` deterministically drives two prompts, durable persistence, and `session/load` through a fresh manager while preserving the same local `sessionId` → opaque `activeRunId` binding; credential-gated `test/e2e-acp-editor.test.ts` repeats first prompt → fresh manager/load → second prompt against the real Deploy API. `test/commands-acp-serve.test.ts` covers stdio handshake, framing, and stdout purity only. Neither automated suite launches Zed itself, so the literal Zed-launch acceptance remains a manual verification item. |
| A Buzz mention produces a streamed answer from the deployed Worker in the correct channel | Credential-gated E2E (`test/e2e-acp-buzz.test.ts`, `skipIf` pattern per `test/e2e-mind-journey.test.ts:13-14`): real relay, real `buzz-acp`, real deployed Worker; asserts the reply lands in the configured channel. Never mocked. |
| A permanent Buzz-profile compatibility suite passes against a fake client reproducing Buzz's real handshake | `test/core-acp-buzz-profile.test.ts`: fake Buzz client replaying the recorded handshake — `protocolVersion: 2`, goose `_meta`, no `fs`/`terminal` capability, auto-`allow_once`, `session/cancel`. Permanent suite because this interface is ahead of stable ACP. |
| Buzz integration does not ship before [I106] lands | Phase gate plus a skipped suite: Phase 4's cancellation tests exist from day one but `skipIf` until `POST /api/chat/:runId/cancel` is live; the Buzz profile stays disabled until that suite runs unskipped. |

### 11.2 Layer ownership and definition of green

- **Protocol bytes** (`test/core-acp-connection.test.ts`): NDJSON framing, one object per
  line, numeric and string ids, `-32601` for unknown methods, unknown `_meta` tolerated. A
  stdout-purity guard asserts no non-frame bytes ever reach stdout — nothing else enforces
  the CLI's currently-clean stdout, so this test is the enforcement.
- **Projection** (`test/core-acp-project-events.test.ts`): table-driven `StreamEntry` →
  `session/update` over every `stream-events.ts` variant plus out-of-order `seq`, gaps, and
  unknown event types.
- **Command layer** (`test/commands-acp-serve.test.ts`): in-process harness with per-fixture
  `AGENTS_DIR` via `envFor` (`test/helpers.ts:174-180`) so no test touches machine state;
  subprocess runs via `runAgentsCli` with piped stdin for true stdio framing cases.
- **E2E** (`test/e2e-acp-*.test.ts`): real APIs, credential-gated skips, zero mocks, per the
  repo's testing rules.

Green means: `bun run typecheck` 0 errors; `bun run test` 0 fail with skips at or below the
baseline the task plan's Phase 0 records; Buzz-profile suite green; stdout-purity guard green.

## 12. Risks And Open Questions

1. **Cancellation is a hard dependency on another repo.** §6.1 is not optional and not
   adapter-side. If it does not land, Buzz integration should not ship.
2. **Cost exposure.** Buzz members trigger runs billed to the operator's DAH identity;
   there is no agent principal. Buzz's `owner-only`/`allowlist` author gate is the only
   throttle, and it lives outside our code.
3. **Identity conflation.** An ACP adapter authenticates as the human user. Actions taken
   by a Buzz channel agent are indistinguishable from the owner's. Worth a Deploy-API
   feature request for a delegated agent principal.
4. **ACP v2 churn.** v2 went Draft four days before this document. Build v1, gate v2 behind
   negotiation plus a flag, per upstream guidance.
5. **Snapshot-vs-delta divergence.** If the projector gains fidelity later, the adapter
   should migrate to it rather than maintain a parallel raw path.
6. **`drwn worker chat` polls the transcript route, not the stream.** Since I65/I100 the
   command waits for the reply via `GET /api/chat/:runId/poll` (`cli/core/worker-run.ts:69-79`).
   Its auth, cursor, and status helpers are the adapter's reuse surface (§9), but its endpoint
   is the lossy transcript projection, not the raw stream (§5), and its fixed 1.5s cadence
   and three-failure give-up are tuned for a one-shot chat — neither transfers to a
   long-lived session unchanged.
