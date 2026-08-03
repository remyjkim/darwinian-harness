# ABOUTME: Target architecture for exposing a deployed Darwinian Worker over the Agent Client Protocol.
# ABOUTME: Covers the ACP-to-Deploy-API mapping, module boundaries, server gaps, and the Buzz integration decision.

# ACP And Buzz Integration For Darwinian Workers

Status: proposal. Supersedes nothing. Depends on `darwinian-services` for three server changes named in §6.

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

The two source guides (`128_acp_guide.md`, `128_2_buzz_acp_integration_guide.md`, currently
in `stash@{0}`) carry unresolvable citation tokens and a June 2026 cutoff. Their load-bearing
claims were re-verified against primary sources on 2026-07-24. Three were wrong.

| Guide claim | Verified state |
| --- | --- |
| Required agent methods are `initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/update` | Agent baseline is `initialize`, **`authenticate`**, `session/new`, `session/prompt`. `session/update` and `session/request_permission` are **client** methods the agent calls. `session/cancel` is a client→agent notification. |
| A strict v1 agent "will not plug into current Buzz without modification" | False. Buzz reads back the version we answer (`lib.rs` L3864, `unwrap_or(1)`) and branches: answer `2` and it sends `systemPrompt` in `session/new`; answer `1` and it prepends a `[Base]` section to the first user message (`pool.rs` L1090-1104). Both work. |
| Build against the ACP TypeScript SDK | The package the guide implies, `@zed-industries/agent-client-protocol`, is deprecated at 0.4.5. Current is **`@agentclientprotocol/sdk@1.3.0`**. |

Confirmed as stated: ACP stable is v1 (v2 went to Draft 2026-07-20 with upstream saying
"don't ship it by default in production"); stdio NDJSON is the only stable transport;
Buzz pins `protocolVersion: 2` deliberately (`acp.rs` L126, comment at L540-541);
Buzz auto-selects `allow_once` by `kind` with no policy gate (`acp.rs` L1671-1731).

Newly established, and material:

- **Buzz advertises no `fs` and no `terminal` client capability** (`acp.rs` L347-368). The
  `auth.terminal: true` a grep would surface is a login capability — a false positive.
  An agent under Buzz cannot read files or run commands through ACP at all.
- **Buzz's `protocolVersion: 2` is not ACP v2.** `systemPrompt` on `session/new` appears in
  no ACP schema, v1 or v2. Buzz uses the integer as a private feature flag. Claiming v2
  semantics because `2` appeared on the wire would be wrong.
- **Buzz registers agents by env var only** — `BUZZ_ACP_AGENT_COMMAND` + `BUZZ_ACP_AGENT_ARGS`.
  No manifest, no registry. Unrecognized binaries pass args verbatim (`config.rs` L617-623).
- **ACP now has an official agent registry** — 38 agents with exact launch distributions at
  `cdn.agentclientprotocol.com/registry/v1/latest/registry.json`.
- **An official proxy pattern exists** (proxy-chains RFD, status implemented;
  `agent-client-protocol-conductor` 2.0.0), whose motivating example is injecting an MCP
  server at `initialize`. It is Rust-only; the TypeScript SDK has no proxy support.

## 3. Constraints That Shape The Design

1. **No local execution.** The CLI has no model client, no MCP client, and no session
   store. `drwn worker chat` is a single HTTP POST (`cli/commands/worker/chat.ts:46`).
2. **Worker and Mind are orthogonal** (v0.9.0 team update). A Worker is the selected
   capability closure; a Mind is persona, beliefs, and BeginningDB memory. An ACP session
   binds a Worker; the Mind is loaded server-side per container boot.
3. **The permission seam does not exist server-side.** Tools execute inside a Cloudflare
   container the ACP client cannot reach. ACP `session/request_permission`, `fs/*`, and
   `terminal/*` have no counterpart. See §7 for what this costs.
4. **Auth is user-scoped.** DAH device flow, bearer JWT, `sub` becomes run owner
   (`deploy-api/src/worker.ts:261-272`). There is no agent principal.
5. **v0.9.0 was a hard cut.** New surface arrives as a V1 contract, not as an option bolted
   onto the four existing `TargetName` writers. ACP is a protocol, not a config format;
   it does not belong in `cli/core/targets.ts`.

## 4. The Mapping

The Deploy API turns out to fit ACP closely, because both are built around a durable run
with an append-only event log addressed by a monotonic cursor.

| ACP | Deploy API | Notes |
| --- | --- | --- |
| `session/new` | *(deferred)* | Allocate local state only. No `runId` exists until a prompt arrives, because the start call requires a `message`. |
| first `session/prompt` | `POST /api/minds/:slug/chat` → `{runId}` | `chat-proxy.ts:216`; response is `ChatStartResSchema` (`deploy-contracts.ts:216-218`). |
| later `session/prompt` | `POST /api/chat/:runId/message` | `chat-proxy.ts:357`. |
| `sessionId` | `runId` | Stable across turns, survives reload. |
| `session/load` | `GET /api/chat/:runId/snapshot` | `chat-proxy.ts:321`. Enables `loadSession: true`. |
| `session/update` | `GET /api/chat/:runId/stream-poll?since=` | Raw `StreamEntry` with real deltas. See §5. |
| `stopReason: end_turn` | run status `yielded` | Not `done`. `done`/`failed` are terminal and cannot be continued (`coordinator-do.ts:1687-1728`). |
| `stopReason: cancelled` | — | **No server support.** §6.1. |

The event vocabulary maps almost one-to-one
(`containerized-cli-harness/packages/stream-protocol/src/stream-events.ts`):

| StreamEvent | ACP `sessionUpdate` | Buzz parses |
| --- | --- | --- |
| `text.delta` | `agent_message_chunk` | yes |
| `reasoning.delta` | `agent_thought_chunk` | yes |
| `tool.call` (`toolCallId`, `toolName`, `args`) | `tool_call` | yes, resets idle clock |
| `tool.result` (`toolCallId`, `result`) | `tool_call_update` | yes |
| `step` (`finishReason`, `usage`) | `usage_update` | tolerated |
| `agent.completed` | prompt result `end_turn` | — |
| `agent.failed` | prompt result error | — |

`toolCallId` correlates `tool.call`→`tool.result` exactly as ACP correlates
`tool_call`→`tool_call_update`. `WIRE.md` anticipates this: *"an adapter to/from that shape
is a thin mapping at the edge."*

## 5. Use `stream-poll`, Not SSE

The obvious choice — SSE at `/api/minds/:slug/chat/:runId/stream` — is wrong for ACP.

Its frames are **cumulative snapshots**, not deltas: every `thread.snapshot` re-projects the
entire item list from `since=0` (`chat-projector.ts:143-176`). The projector also drops
tool `args` and `result` (`deploy-contracts.ts:299-304`) and flattens `reasoning.delta` to a
boolean `thinking` flag (`chat-projector.ts:161-162`). ACP needs incremental chunks, tool
inputs, and thought text — all three are destroyed by the projection.

`GET /api/minds/:slug/chat/:runId/stream-poll?since=` (`chat-proxy.ts:287`) returns
unprojected `StreamEntry` including `args` (`deploy-contracts.ts:146-162`, `.passthrough()`).
Start there. §6.2 proposes a raw SSE route to remove the polling cost later; the engine
already has `/coordinate-stream/sse` internally (`engine/src/worker.ts:280-313`), so this is
exposure work, not new plumbing.

## 6. Server Changes Required In `darwinian-services`

These are the real cost of this project. None can be worked around adapter-side.

### 6.1 Cancellation — blocking

No cancel, abort, stop, or terminate route exists at any layer reachable over HTTP.
Closing the SSE connection stops the bridge; **the run keeps executing in the Workflow**.
Only an `AbortSignal` inside the container base can stop a turn, and nothing HTTP-reachable
triggers it.

This blocks Buzz, which sends `session/cancel` on idle and hard turn timeouts. Without it
the adapter must either lie — resolve the prompt `cancelled` while the run continues to burn
tokens — or hang. Both are unacceptable. **Required: `POST /api/chat/:runId/cancel`**,
threading an abort into the container.

Full gap analysis and proposed contract:
[`130`](./130_feature_acp_run_cancellation_interface_request.md).

### 6.2 Raw event stream over SSE — strongly desired

Expose the unprojected event stream as SSE so the adapter is not polling. Deliverable is a
public route over the existing internal `/coordinate-stream/sse`.

### 6.3 A general declarative tool policy — desired

`POST /api/minds/:slug/chat` accepts `toolPolicy` and threads it into the run
(`engine/src/worker.ts:373,431` → `chat-input.ts:71` → `coordinator.ts:430,455`), but it is
**not a general tool allowlist**. Only the Pipedream shape
`{version:1, allowedApps[], policyHash, routes[]}` is recognized; anything else is serialized
into `runtimeConfig` and never enforced (`coordinator.ts:63-89`, consumed only at `:467`).

Required for governance parity: generalize the contract to an allow/deny surface the runtime
honors for all tools, not only Pipedream routing. Detail in
[`131`](./131_feature_acp_tool_governance_constraint_analysis.md).

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

Nor is there a declarative substitute today. `toolPolicy` looks like one but enforces only
Pipedream routing (§6.3). Projecting Card `tools.allow`/`deny` into it now would produce a
control that appears configured and does nothing — worse than no control, because it would
be reported as governance in status output.

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

## 8. Open Decision: Buzz Tooling And Delivery

This is the one genuine architectural conflict, and it needs a call before implementation.
Full evaluation:
[`132`](./132_feature_acp_buzz_tooling_delivery_decision_analysis.md).

Buzz's model assumes the agent is a **local** process: it injects tools via
`BUZZ_ACP_MCP_COMMAND` as local stdio MCP servers, with `BUZZ_RELAY_URL`, `BUZZ_PRIVATE_KEY`,
and `BUZZ_AUTH_TAG` placed in their `env` (`lib.rs` L4145-4183). It also expects the agent to
publish its answer by *calling a Buzz tool*, not by streaming ACP text
(`buzz-cli`: "JSON in, JSON out").

A remotely-executed agent cannot use any of that. The container cannot spawn a binary that
lives on the operator's laptop.

Three resolutions, with the trade-off that decides them:

**A. Adapter as delivery controller.** The adapter consumes Buzz's `mcpServers` locally,
lets the remote agent produce answer text, and deterministically posts it to the channel.
Keeps the Nostr key on the operator's machine. Also removes the guide's §4.6 failure mode
where the model forgets to call the send tool. Cost: the adapter becomes a small MCP client,
contradicting §1's "no MCP client," and the channel id must come from somewhere — Buzz does
not send structured `_meta` today, and parsing it from prose is brittle.

**B. Card-carried network Buzz tools.** Give the Mind Buzz credentials as deployment secrets
and a network-reachable Buzz MCP server, so the container talks to the relay directly.
Clean separation, no local MCP client. Cost: ships a Nostr private key to the cloud, and
requires verifying the relay is reachable from a Cloudflare container over WebSocket.

**C. Local mode for Buzz, remote mode for editors.** `drwn acp` launches a registry ACP
agent locally with Worker config injected, for Buzz only. Cost: two runtime models to
maintain, and it abandons the deployed Worker for the Buzz case.

Recommendation: **A**, on the grounds that it keeps the private key local and makes delivery
deterministic rather than model-dependent. It should be paired with proposing an upstream
Buzz `_meta` profile (guide §7) so channel routing stops depending on prose.

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
                status: "completed", rawOutput: entry.result }];
    default:
      return [];
  }
}
```

L2 owns the cursor. Every `session/update` batch advances `since`, and reconnection replays
from the last delivered `seq` — which is what makes duplicate delivery and lost
acknowledgements non-issues.

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

**Phase 4 — cancellation.** Consumes §6.1. Success: `session/cancel` stops the run
server-side and resolves the prompt `cancelled`. **Do not ship Buzz integration before this
lands** — without it, Buzz's idle timeout silently orphans paid runs.

**Phase 5 — delivery.** Whichever of §8 is chosen, plus tool policy projection.

## 11. Testing

Layers 1-3 of the guide's strategy apply and should be adopted; layer 4 needs adjusting
because the runtime is remote.

- **Protocol**: exact serialized bytes. One JSON object per line, no embedded newlines,
  numeric and string ids, unknown methods answered `-32601` (Buzz hangs on silence),
  unknown `_meta` tolerated, stdout uncontaminated.
- **Projection**: table-driven `StreamEntry` → `session/update`, including out-of-order
  arrival, gaps in `seq`, and unknown event types.
- **Lifecycle**: cancel before start, mid-stream, and during a tool call; terminal-run
  continuation rejected; snapshot reload.
- **Buzz profile**: a fake Buzz client reproducing the real handshake — `protocolVersion: 2`,
  goose `_meta`, no `fs`/`terminal` capability, auto-`allow_once`, `session/cancel`. Permanent
  suite, not a one-off, because this interface is ahead of stable ACP.
- **End-to-end**: real relay, real `buzz-acp`, real deployed Worker. Per the repo's testing
  rules this uses real APIs and skips on absent credentials rather than mocking.

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
6. **`drwn worker chat` is currently broken against the modern stack** — it POSTs
   `/api/minds/:slug/chat` and prints the body, which is `{runId}`, not a reply
   (`cli/commands/worker/chat.ts:46`). Unrelated to this work; flagged for separate repair.
