# ABOUTME: Decision analysis for how a remotely-executed Darwinian Worker obtains Buzz tools and delivers replies.
# ABOUTME: States the local-versus-remote conflict, evaluates the resolutions, and records the decided one.

# Buzz Tooling And Delivery: Architectural Decision

**Audience:** `drwn` CLI primarily; `darwinian-services` for option B.
**Issue:** part of **[I105]** (`[I105, DW] ACP agent surface for deployed Darwinian Workers`).
**Status:** **decided 2026-08-04 — Option B-lean with the §7.4 delivery-verification rider**
(Remy, after the §7 evidence pass). Phase 5 of
[`cl0105`](./cl0105_acp_buzz_worker_integration_target_architecture.md) is unblocked.
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

- ~~If a Cloudflare container cannot hold a relay WebSocket, B is dead.~~ Closed 2026-08-04:
  B needs no WebSocket at all — kind-9 publish is a stateless NIP-98-signed HTTPS POST per
  message (`client.rs:863-874`). See §7.
- If Buzz adds structured `_meta` before we build, A's main weakness disappears and the case
  strengthens further.
- If the Worker needs broad Buzz agency (workflows, canvas, reviews) rather than replying, B
  becomes materially more attractive and the key-custody problem must be solved directly —
  most plausibly with a scoped, rotatable per-agent Buzz credential rather than the raw nsec.

**This section records the pre-evidence recommendation. The 2026-08-04 evidence pass in §7
reprices both options; §7.7 carries the refined recommendation. The decision remains open
and is Remy's.**

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

1. ~~Can a Cloudflare container maintain an outbound WebSocket to a Nostr relay?~~ **Closed
   2026-08-04: B needs no WebSocket.** Kind-9 publish is a stateless NIP-98-signed HTTPS
   POST per message (`client.rs:863-874`); outbound HTTPS from the container is supported
   and exercised (`engine/wrangler.jsonc:36-38`, `mcp-connect.js:26-33`).
2. Is there appetite to propose the `_meta` profile upstream to `block/buzz`, or should we
   assume Buzz is fixed and design around it?
3. Should the adapter support any Buzz action beyond replying in v1? If yes, A's split-agency
   objection grows and the balance shifts toward B.
4. **Partially answered.** No scoped credential exists or is planned — "the keypair IS the
   identity — no tokens, no other auth" (`buzz-cli/src/lib.rs:1936-1942`). The remaining
   open form: does a *second keypair*, minted purely as a posting identity and added to the
   target channel, satisfy relay-side membership requirements? Verification pending; if yes,
   B's blast radius shrinks to that identity's channel memberships, rotatable independently
   of the agent.

## 7. Deep Comparison A vs B (2026-08-04 evidence pass)

Requested by Remy before deciding. Every fact below was verified in source that day —
`block/buzz` @ `0afeac8a7`, `darwinian-services` @ `ec7f9ff2` — and reprices both options
substantially relative to §3.

### 7.1 What the evidence pass established

1. **Buzz already runs agents server-side holding their nsec.** In the k8s backend, buzz-acp
   and the ACP agent run as PID 1 in a per-agent Pod, with `BUZZ_PRIVATE_KEY` injected from
   an immutable k8s Secret (`buzz-backend-kubernetes/src/env.rs:229`, `pod.rs:114-120`).
   Desktop is documented as "one launcher among many" (`docs/remote-agents.md:31-36`); a
   process exporting the three env vars is a conforming launcher. Key-in-the-cloud is a
   custody model Buzz itself ships today, not a novel risk we would be introducing.
2. **`buzz messages send` is stateless and env-only.** With only `BUZZ_RELAY_URL` +
   `BUZZ_PRIVATE_KEY` (+ optional `BUZZ_AUTH_TAG`) and the binary on PATH, a kind-9 message
   is one NIP-98-signed HTTPS POST (`client.rs:863-874`). No config file, keyring, daemon,
   login, or persistent connection (`lib.rs:1936-1942`, `client.rs:521-559`).
3. **No network-reachable Buzz MCP exists or is coming.** `buzz-dev-mcp` binds stdio only
   (`buzz-dev-mcp/src/lib.rs:183`); buzz-agent advertises `mcpCapabilities {http:false,
   sse:false}` (`buzz-agent/src/lib.rs:307`); no URL field exists in any server spec. §3's
   Option B as originally written ("network-reachable Buzz MCP server") is not buildable
   against upstream — but it is also unnecessary (see 7.2).
4. **The Deploy API is B-ready today.** `PUT /api/minds/:slug/secrets/:server` with
   `kind:"env"` accepts arbitrary named secrets — `BUZZ_PRIVATE_KEY` passes validation by
   design (`secret-crypto/src/secret.ts:35-65`) — AES-GCM encrypted, decrypted per run into
   run-scoped container env (`mcp-tokens/src/index.ts:36-37`, `mind-restore.ts:32-45`),
   with a `redactSecrets` guard scrubbing values from agent-visible output (`secret.ts:88`).
   Zero server changes.
5. **The image change is two lines.** `images/mind-runtime/Dockerfile.cloud` already
   COPY+chmods runtime files and installs a pinned npm CLI; adding a musl-static `buzz`
   binary mirrors the existing pattern. First native binary in the image, but the mechanism
   is established.
6. **The container is a fresh sandbox per turn.** Every coordination unit acquires a fresh
   sandbox that idles out on a short `sleepAfter` (`engine/wrangler.jsonc:31`). An
   in-container publish must complete within one turn's activation — which send-on-answer
   does — and nothing may depend on a connection surviving across turns.
7. **The `[Context]` prose is stable but structurally fragile.** Zero format changes in the
   last month; unchanged since 2026-06-10 (`queue.rs:1238-1319`). But the channel UUID is
   unlabeled and has two shapes — `Channel: {name} (#{uuid})` normally, a bare `{uuid}` when
   channel-metadata resolution fails (`queue.rs:1248`) — and the reply target is a hex id
   inside an English sentence.
8. **The adapter can observe delivery.** `tool.call` events surface in `stream-poll` with
   `toolName` and `args`, so the adapter can verify a send tool was actually invoked during
   the turn — the hook for the rider in 7.4.

### 7.2 The lean Option B ("B-lean")

The buildable form of B is smaller than §3's version:

- `buzz` binary in the mind-runtime image (fact 5).
- `BUZZ_RELAY_URL` / `BUZZ_PRIVATE_KEY` / `BUZZ_AUTH_TAG` as per-Mind `kind:"env"` secrets
  (fact 4).
- A small Card-carried **stdio** MCP server inside the container exposing
  `buzz_messages_send` / `buzz_messages_thread` (thin exec wrappers over the CLI) — stdio
  in-container is exactly what the runtime already spawns at boot (`mcp-connect.js`), so no
  network MCP is needed (fact 3).
- The Worker reads the channel UUID and reply target from the `[Context]` prose it already
  receives and passes them as tool arguments — the extraction Buzz's own base prompt
  instructs every agent to do, proven daily by goose.

No WebSocket, no harness in the cloud, no server changes, publish-per-turn fits the sandbox
lifecycle (fact 6).

### 7.3 Dimensions

| Dimension | A — adapter delivers | B-lean — container publishes |
| --- | --- | --- |
| Key custody | Stays wherever buzz-acp runs — the operator's laptop, or Buzz's own Pod in the k8s backend | Second copy in a per-Mind secret: AES-GCM, run-scoped injection, redaction guard; same custody model Buzz's k8s backend ships (fact 1). Dedicated posting identity pending (§6.4) |
| Delivery determinism | Structural — adapter always sends on turn completion | Model-dependent, narrowed by the 7.4 rider to "model fails twice in one turn" |
| Channel routing | **Our deterministic code parses prose** — two shapes, unlabeled UUID (fact 7); misparse = loud failure but no delivery | **The model extracts from the same prose** — Buzz's intended contract; drift-tolerant; failure mode is a wrong UUID, which the relay rejects unless the key is a member there |
| Multi-channel operation | Requires the prose parse per session — a config-fixed channel misroutes, since one agent serves many channels (`pool.rs:88-90`) | Native — routing is per-turn tool arguments |
| Threading / replies | Adapter must also parse `Thread root:` and the reply-instruction sentence | Model passes `--reply-to` naturally |
| Agency beyond replying | None without bespoke adapter features | Full `buzz` CLI surface, including future commands, for free |
| Cross-repo cost | None — drwn CLI only | Dockerfile +2 lines (services PR), small card MCP wrapper, secret provisioning docs |
| Network / runtime fit | n/a | Stateless HTTPS POST within the turn's activation (facts 2, 6) |
| Auditability | Adapter-side logs only | Sends are `tool.call`s in the run transcript, server-side |
| Works with Buzz as shipped | Yes | Yes — the relay does not care which process signed the POST |

### 7.4 The delivery-verification rider (recommended under either option)

The adapter watches the event stream for a send-tool `tool.call` during each Buzz-bound
turn. If the run settles without one, it issues a single corrective continuation via
`POST /api/chat/:runId/message` ("the answer was not delivered; use the messaging tool
now"), then — still nothing — logs the undelivered text to stderr and errors the turn
rather than silently succeeding. Under B-lean this converts the source guide's §4.6 hope
into an observable contract; under A it is unnecessary (the adapter is the sender) but the
observation half still makes a useful send-audit.

### 7.5 What remains genuinely different

A's surviving advantage is exactly one property: delivery is deterministic code. Its price
is that channel and thread routing become deterministic-code problems too — parsing an
unlabeled two-shape prose field that Buzz never promised anyone — and that the Buzz feature
surface is capped at whatever the adapter reimplements. B-lean inverts this: routing and
agency are native and the machinery already exists end to end, at the price of a second key
copy in the cloud and a delivery step that is model-initiated (rider-mitigated).

### 7.6 Open evidence item

Whether a dedicated posting identity (second keypair) satisfies relay-side membership
requirements (§6.4). It does not gate the decision — B-lean is viable with the agent's own
nsec, the custody Buzz's k8s backend already practices — but a yes would shrink B's blast
radius materially and should be folded into the deployment guide either way.

### 7.7 Refined recommendation

**B-lean, with the 7.4 rider, plus the upstream `com.block.buzz` `_meta` proposal** (which
helps every ACP agent regardless of our choice). The 2026-08-04 evidence removed B's three
original objections — no WebSocket uncertainty (closed), no network MCP server to build
(unneeded), no server changes for secrets (ready) — while A's main weakness hardened: its
single-channel v1 scope is now known to be wrong for Buzz's one-agent-many-channels pool
model, leaving prose parsing in deterministic code as A's only routing path. Key custody is
the one real cost B retains, and it matches the custody model Buzz itself ships for remote
agents, with a rotatable posting identity as the likely hardening (§7.6).

What would flip this back to A: an operator policy that forbids any cloud custody of a Buzz
signing key, or relay-side enforcement that makes a container-held identity unusable.

The decision owner remains Remy; §4's original recommendation (A) is preserved above as the
pre-evidence record.

**Decision (Remy, 2026-08-04): B-lean with the rider, as recommended here.** Folded into the
task plan's Phase 5. The dedicated-posting-identity verification (§7.6) continues as
deployment-guide hardening, non-gating.
