# ABOUTME: Decision analysis for how a remotely-executed Darwinian Worker obtains Buzz tools and delivers replies.
# ABOUTME: States the local-versus-remote conflict, evaluates three resolutions, and recommends one.

# Buzz Tooling And Delivery: Architectural Decision

**Audience:** `drwn` CLI primarily; `darwinian-services` for option B.
**Issue:** part of **[I105]** (`[I105, DW] ACP agent surface for deployed Darwinian Workers`).
**Status:** open decision. Blocks Phase 5 of
[`cl0105`](./cl0105_acp_buzz_worker_integration_target_architecture.md).
**Decision owner:** Remy.
**Re-verified:** 2026-08-04 against `block/buzz` `main` @ `0afeac8a7`; anchors and the `buzz-dev-mcp` tool inventory reflect that HEAD.

## 1. The Conflict

Buzz assumes the ACP agent is a **local process on the operator's machine**. The chosen
architecture in `cl0105` puts execution **in a Cloudflare container**. Two of Buzz's core
mechanisms do not survive that move.

**Tool injection is local-process-scoped.** Buzz declares a local stdio MCP binary named by
`BUZZ_ACP_MCP_COMMAND` in `session/new.mcpServers` — the agent is expected to spawn it. It
derives the server name from the file stem and injects credentials directly into that
server's `env` (`crates/buzz-acp/src/lib.rs:4280-4330`):

```text
BUZZ_RELAY_URL, BUZZ_PRIVATE_KEY (bech32 nsec), optionally BUZZ_AUTH_TAG, BUZZ_ACP_DISPLAY_NAME
```

A Cloudflare container cannot spawn a binary that lives on a laptop. Forwarding the
`mcpServers` list to the deployed runtime verbatim would name a command that does not exist
there.

**Delivery is CLI-mediated, not stream-mediated.** ACP message chunks are harness
communication; buzz-acp only logs them and never posts them to a channel (`acp.rs:1732-1736`).
The deployed MCP server — `buzz-dev-mcp` in every k8s deployment
(`buzz-backend-kubernetes/src/env.rs:267`) — exposes seven generic dev tools (`shell`,
`read_file`, `view_image`, `str_replace`, `todo`, `_Stop`, `_PostCompact`) and **no messaging
tool**. The base prompt instructs the agent to publish by running
`buzz messages send --channel <UUID> --content …` through `shell` (`base_prompt.md:73`).
`--channel` is a mandatory per-send UUID with no env or context default
(`buzz-cli/src/lib.rs:351-378`), available only from the prompt's `[Context]` prose.

Compounding both: **Buzz advertises no `fs` and no `terminal` client capability**
(`crates/buzz-acp/src/acp.rs:390-411`). The `auth.terminal: true` a grep surfaces is a login
capability — a false positive. So an agent under Buzz has *no* capabilities beyond what
`BUZZ_ACP_MCP_COMMAND` supplies. The declared MCP server is not a convenience; it is the
agent's entire ability to act.

## 2. Constraints Any Resolution Must Respect

1. **The Nostr private key is a workspace identity.** It signs every message as the agent.
   Compromise means impersonation in the customer's workspace.
2. **Channel routing must be deterministic.** Buzz does not send structured `_meta` today;
   channel context arrives as formatted prose. Parsing channel ids out of prose couples us to
   Buzz's prompt templates and breaks silently when they change.
3. **Delivery must not depend on the model remembering.** A turn that produces a good answer
   and forgets to call the send tool is a silent failure — the user sees nothing.
4. **Idempotency.** Buzz retries after network, process, and timeout failures. A send whose
   acknowledgement is lost must not produce a duplicate channel message.
5. **`cl0105` §1 says the adapter hosts no MCP client.** With `buzz-dev-mcp` exposing no
   messaging tool, delivery goes through the `buzz` CLI, so no option needs an MCP client
   any more — this constraint now holds under every resolution.
6. **Delivery must not wait for end-of-run.** Buzz's idle timeout (900 s default) cancels
   cleanly, but its hard 7200 s cap kills the subprocess with no `session/cancel`
   (`pool.rs:2263-2288`). Publishing must happen as soon as the answer exists.

## 3. Options

### Option A — Adapter as delivery controller (recommended)

The adapter reads the Buzz credential env (`BUZZ_RELAY_URL`, `BUZZ_PRIVATE_KEY`,
`BUZZ_AUTH_TAG`) from the `session/new.mcpServers` declaration. The remote Worker produces
answer text; the adapter publishes it by executing `buzz messages send --channel … --content …`
with that env — the `buzz` multicall binary ships with the Buzz install on the same machine.

```text
Buzz ──session/new(mcpServers)──▶ drwn acp ──HTTPS──▶ deployed Worker
                                     │                      │
                                     │◀── text.delta ───────┘
                                     │
                                     └── exec `buzz messages send` ──▶ Buzz relay
                                         (nsec never leaves the machine)
```

**For**
- The private key stays on the operator's machine. Nothing secret crosses to the cloud.
- Delivery becomes deterministic — the adapter always sends when a turn completes
  successfully, removing constraint 3 entirely rather than mitigating it with prompt
  instructions. The source guide's §4.6 "corrective continuation" hack becomes unnecessary.
- Idempotency is straightforward: the adapter already owns `runId`, turn index, and the ACP
  request id, which compose into a stable key.
- Works with Buzz exactly as it ships. No upstream change required.

**Against**
- The adapter gains a subprocess dependency: the `buzz` CLI must be present on PATH and its
  flag surface (`messages send --channel --content --reply-to`) must stay stable. No MCP
  client is needed after all — `buzz-dev-mcp` has no messaging tool to call — so `cl0105`
  §1's "no MCP client" survives intact, at the cost of coupling to a CLI contract instead.
- **Channel routing is unsolved.** The adapter must know which channel to post to. Buzz sends
  no structured context (re-verified @ `0afeac8a7`: `session/prompt` params are only
  `{sessionId, prompt}`, `acp.rs:1970-1979`). Either we parse prose (brittle, constraint 2)
  or we propose an upstream `_meta` profile.
- Splits agency: the remote Worker "decides" the answer, the local adapter performs the
  action. Anything the Worker wants to do in Buzz beyond replying — reactions, canvas,
  threads — either goes unused or needs explicit adapter support.

**Mitigation for the routing gap:** propose a namespaced `_meta` profile upstream, which the
source guide already sketches:

```json
{ "_meta": { "com.block.buzz": {
    "profileVersion": 1, "channelId": "…", "threadRootEventId": "…",
    "triggeringEventIds": ["…"], "replyMode": "thread" } } }
```

ACP reserves `_meta` for exactly this, so it is additive and cannot break generic agents.
Until it exists, a first release can scope to single-channel operation, where the channel is
configured on the adapter rather than inferred.

### Option B — Card-carried network Buzz tools

Give the Mind Buzz credentials as deployment secrets and a network-reachable Buzz MCP server,
so the container talks to the relay directly.

**For**
- Clean separation: the adapter stays a pure protocol projector, `cl0105` §1 holds.
- Full agency — the Worker can use the whole Buzz surface (messages, reactions, canvas,
  threads), not just replies.
- Channel routing is the Worker's problem, solved with the same context any tool-using agent
  has.

**Against**
- **Ships a Nostr private key to the cloud.** This is the decisive objection. It would live as
  a per-Mind secret (`deploy-api/src/bgdb-binding.ts` shows the pattern) and be injected into
  run-scoped container env. That machinery exists and is reasonable for API tokens; a
  workspace signing identity is a different risk class, and compromise is impersonation rather
  than data access.
- Requires a network-reachable Buzz MCP server. `buzz-dev-mcp` is stdio and ships shell plus
  file-edit tools — wrong shape and wrong surface. Something new is needed.
- Unverified: whether a Cloudflare container can hold an outbound WebSocket to a Nostr relay
  for a run's duration. **This must be tested before B is chosen.**
- Delivery reverts to depending on the model calling a tool (constraint 3).

### Option C — Local mode for Buzz, remote for editors

`drwn acp` launches a registry ACP agent locally with Worker config injected, for Buzz only.

**For**
- Buzz's assumptions all hold; tool injection and delivery work as designed.
- The proxy-chains RFD (status: implemented) specifies this exact pattern, including
  handshake rewriting.

**Against**
- Two runtime models to build, test, and support.
- Abandons the deployed Worker for Buzz — no Mind memory, no server-side sandbox, no durable
  run. Since durable identity and memory are the differentiated reason to put a Darwinian
  Worker in a channel, this gives up the point of the exercise.
- The proxy tooling is Rust-only; `@agentclientprotocol/sdk@1.3.0` has no proxy support, so a
  TypeScript implementation hand-rolls passthrough including JSON-RPC batch framing.
- Configuring the inner agent is uneven: `@agentclientprotocol/claude-agent-acp` accepts
  `_meta.systemPrompt` and `session/new.mcpServers`, but `goose acp` — Buzz's default — takes
  only `--with-builtin`, with `--system`/`--instructions`/`--recipe` available on `goose run`
  and not on `goose acp`. There is no supported path to give goose a Worker identity via ACP
  launch.

## 4. Recommendation

**Option A**, on two grounds that outweigh its cost.

First, key custody. B's only real advantage is architectural cleanliness, and it pays for it
by moving a workspace signing identity into the cloud. A keeps it on the operator's machine,
where Buzz already puts it.

Second, delivery reliability. A converts "hope the model calls the send tool" into a
deterministic adapter action. That eliminates a whole class of silent failure that B and C
both retain and can only mitigate with prompt engineering.

The cost — a subprocess exec of the `buzz` CLI with credentials lifted from the
`session/new` declaration — is smaller than the MCP client this analysis originally priced
in. No new dependency, no client lifecycle; the adapter shells out exactly the way Buzz's
own base prompt tells agents to.

### Recommended scope for a first release

1. Read credentials from `session/new.mcpServers`; deliver via `buzz messages send` exec.
   Never spawn the declared MCP server — nothing in it is needed for delivery.
2. Single-channel operation, channel configured on the adapter. No prose parsing.
3. Deterministic send on successful turn completion, keyed for idempotency on
   `runId` + turn index.
4. In parallel, propose the `com.block.buzz` `_meta` profile upstream. When it lands, drop
   the single-channel restriction.

### What would change the recommendation

- If a Cloudflare container **cannot** hold a relay WebSocket, B is dead and A wins by
  default. Test this early — it is cheap and it removes an option.
- If Buzz adds structured `_meta` before we build, A's main weakness disappears and the case
  strengthens further.
- If the Worker needs broad Buzz agency (workflows, canvas, reviews) rather than replying, B
  becomes materially more attractive and the key-custody problem must be solved directly —
  most plausibly with a scoped, rotatable per-agent Buzz credential rather than the raw nsec.

## 5. Cross-Cutting Note: Identity

Independent of the choice, an ACP adapter authenticates to the Deploy API **as the human
user** via DAH device flow. There is no agent principal
(`deploy-api/src/worker.ts:261-272`; `sub` becomes run owner). So:

- Runs triggered by a Buzz channel member are billed to, and attributable to, the operator.
- The only inbound throttle is Buzz's own author gate — `owner-only`, `allowlist`, `anyone`,
  `nobody` — which lives entirely outside our code. `owner-only` is the safe default and
  should be what we document.

A delegated agent principal on the Deploy API would improve this materially and is worth
filing separately; it is not a blocker.

## 6. Open Questions

1. Can a Cloudflare container maintain an outbound WebSocket to a Nostr relay for a full run?
   (Decides whether B is viable at all.)
2. Is there appetite to propose the `_meta` profile upstream to `block/buzz`, or should we
   assume Buzz is fixed and design around it?
3. Should the adapter support any Buzz action beyond replying in v1? If yes, A's split-agency
   objection grows and the balance shifts toward B.
4. Does a scoped, rotatable Buzz credential exist or could one be introduced? That is the
   single change that would make B safe.
