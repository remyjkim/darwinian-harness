# Recommended approach

Build the adapter as a **standalone ACP agent process** that Buzz launches and controls over stdin/stdout.

Buzz should remain responsible for:

* Connecting to the Buzz relay.
* Receiving channel events and mentions.
* Deciding which messages should invoke the agent.
* Constructing prompt context.
* Managing parallel agent processes and per-channel sessions.

Your adapter should be responsible for:

* Implementing Buzz-compatible ACP JSON-RPC.
* Translating ACP sessions and turns into your underlying agent runtime.
* Connecting the runtime to the MCP servers supplied by Buzz.
* Streaming progress back through ACP.
* Handling cancellation, model configuration, and runtime failures.
* Ensuring that the agent publishes its actual channel response through Buzz tooling.

Do **not** start by having the adapter speak Nostr directly, and do not fork `buzz-acp`. The clean boundary is:

```text
Buzz relay
    │
    │ Nostr / WebSocket
    ▼
buzz-acp
    │
    │ ACP JSON-RPC over stdio
    ▼
your-acp-adapter
    │
    ├── your agent/runtime/API
    ├── MCP clients
    └── Buzz tool server or Buzz CLI
             │
             └── reply/action back to Buzz
```

This mirrors Buzz’s intended architecture: `buzz-acp` is the bridge between the relay and any ACP-speaking subprocess, while the agent uses Buzz tooling to act on the workspace. 

---

# 1. What ACP is

Here, ACP means **Agent Client Protocol**: the protocol maintained around `agentclientprotocol.com`. It should not be confused with other protocols sometimes called “Agent Communication Protocol” or “Agent Connect Protocol.”

ACP defines the boundary between two roles:

| Role                     | In the Buzz integration                                      |
| ------------------------ | ------------------------------------------------------------ |
| ACP client               | `buzz-acp`                                                   |
| ACP agent                | Your adapter process                                         |
| Underlying agent runtime | Your model, orchestration framework, or remote agent service |

The protocol does not prescribe how the underlying agent reasons, which model it uses, or where it runs. It standardizes how the client:

* Starts and initializes an agent.
* Creates sessions.
* Sends prompts.
* Receives streaming updates.
* Presents tools and permissions.
* Cancels turns.
* Configures models or modes.
* Restores sessions when supported.

ACP is built on **JSON-RPC 2.0**. The usual local transport is newline-delimited JSON over process stdin/stdout: one complete JSON-RPC object per line. The client launches the agent subprocess, writes requests to stdin, and reads responses and notifications from stdout. Diagnostic logs belong on stderr, because any non-protocol output on stdout can corrupt the transport. ([Agent Client Protocol][1])

## ACP and MCP solve different problems

This distinction is central to a good Buzz adapter:

* **ACP controls the agent.**

  * Session lifecycle
  * Prompts
  * Streaming output
  * Cancellation
  * Permissions
  * Model or mode configuration

* **MCP gives the agent capabilities.**

  * Shell execution
  * File access
  * Search
  * Buzz messaging
  * Repository operations
  * Other application tools

Buzz passes MCP server definitions during `session/new`. Your adapter should interpret those definitions and make the resulting tools available to the underlying runtime. ACP should not be treated as a replacement for MCP.

---

# 2. The normal ACP lifecycle

A standard ACP interaction resembles this:

```text
Client                                 Agent

 initialize ------------------------->
             <------------------------ initialize result

 session/new ------------------------>
             <------------------------ sessionId

 session/prompt --------------------->
             <------------------------ session/update
             <------------------------ session/update
             <------------------------ session/update
             <------------------------ prompt result + stopReason

 session/prompt --------------------->
             <------------------------ ...

 session/cancel --------------------->   notification, when needed
```

## 2.1 Initialization and version negotiation

The client starts with `initialize`. It supplies:

* A protocol version.
* Client identity.
* Client capabilities.
* Optional extension metadata.

The agent replies with:

* The selected protocol version.
* Agent identity.
* Agent capabilities.
* Optional authentication methods.
* Optional extension metadata.

ACP protocol versions are major integer versions. The client and agent are supposed to agree on a compatible wire version. The officially stable ACP protocol is currently version 1, while version 2 material is still identified as draft. ([GitHub][2])

### Important Buzz exception

Current Buzz source deliberately sends:

```json
"protocolVersion": 2
```

Its source describes this as a temporary pin ahead of upstream ACP v2 work. Therefore, a strictly conforming ACP-v1 implementation that rejects every version other than `1` will not plug into current Buzz without modification. ([GitHub][3])

The best solution is a **thin Buzz compatibility layer**:

```text
Buzz wire profile, protocolVersion = 2
                 │
                 ▼
Internal normalized ACP model
                 │
                 ▼
Your agent runtime
```

Internally, you can continue to model most operations using ACP-v1 concepts. On the wire, accept Buzz’s version 2 initialization and respond with version 2 when launched by Buzz.

Ideally, the same adapter should also accept version 1 so it remains usable with other ACP clients.

## 2.2 Capabilities

ACP uses capabilities to prevent one side from assuming the other supports a feature.

Examples include:

* Session loading.
* Prompt image support.
* Audio support.
* Embedded resources.
* Filesystem callbacks.
* Terminal callbacks.
* Authentication.
* Session configuration.

The adapter should advertise only capabilities it actually implements. Do not advertise image input merely because the underlying model can process images; the entire adapter pipeline must be able to receive, validate, and translate ACP image blocks first. ([Agent Client Protocol][4])

Likewise, agent-initiated client calls such as filesystem or terminal methods should only be made when the client advertises the corresponding capability.

Current Buzz does not broadly advertise the normal ACP filesystem and terminal-client interfaces. Its initialization is mainly oriented around terminal authentication metadata and Goose compatibility. Consequently, your adapter should obtain tools from the `mcpServers` supplied in `session/new`, rather than assuming it may call arbitrary ACP filesystem or terminal client methods. ([GitHub][3])

## 2.3 Sessions

`session/new` normally includes:

* `cwd`
* `mcpServers`
* Potentially extension fields

The result must include a `sessionId`.

ACP sessions are logical conversations. A process can host multiple sessions, and a session can receive multiple prompt turns. ([Agent Client Protocol][5])

For Buzz, that matters because `buzz-acp` maintains sessions associated with Buzz channels. A worker that already owns a session for a particular channel is preferentially reused for subsequent turns in that channel. Multiple subprocesses provide concurrency across channels. ([GitHub][6])

Your adapter should therefore maintain something like:

```text
SessionState {
    session_id
    cwd
    system_prompt
    runtime_conversation_id
    mcp_connections
    model_configuration
    cancellation_token
    active_turn
    last_used_at
}
```

Never assume:

```text
one process = one session
```

A more accurate assumption is:

```text
one adapter process = multiple possible sessions,
usually one active prompt at a time
```

## 2.4 Prompt turns

The client invokes `session/prompt` with one or more ACP content blocks. Text blocks are the minimum universally expected content type. Image, audio, and embedded-resource blocks are capability-gated. ([Agent Client Protocol][7])

During execution, the agent sends `session/update` notifications. Common update types include:

* `agent_message_chunk`
* `agent_thought_chunk`
* `plan`
* `tool_call`
* `tool_call_update`
* `available_commands_update`
* `session_info_update`

At the end of the turn, the `session/prompt` request receives a normal JSON-RPC result containing a `stopReason`. Typical values include:

* `end_turn`
* `cancelled`
* `max_tokens`
* `max_turn_requests`
* `refusal`

([Agent Client Protocol][8])

A significant design detail is that streaming updates and the final prompt result serve different purposes:

* Updates expose what is happening.
* The final result closes the request.
* A successful `end_turn` must still be returned even if many message chunks were streamed.

Do not leave the JSON-RPC request unresolved after streaming the last chunk.

## 2.5 Tool calls and permissions

ACP can represent a tool invocation through:

1. `tool_call`
2. Zero or more `tool_call_update` notifications
3. A terminal state such as completed or failed

The tool call may include:

* Human-readable title and status.
* Textual output.
* Diffs.
* Terminal information.
* Structured locations.
* Other content.

An agent can also call `session/request_permission`. Permission options can represent choices such as:

* Allow once
* Allow always
* Reject once
* Reject always

([Agent Client Protocol][9])

However, **current Buzz is not a true human permission UI for these requests**. Its ACP harness selects the `allow_once` option automatically when one is present, falling back to a rejection option otherwise. ([GitHub][3])

That means your security model must not depend on a Buzz user reviewing each ACP permission request.

Use ACP permissions as informational protocol state, but enforce the real security boundary inside:

* Your adapter.
* Your sandbox.
* Your MCP server.
* Your command policy.
* Buzz’s own agent identity and channel authorization.

## 2.6 Cancellation

Cancellation must be handled asynchronously.

Buzz can send `session/cancel` while a `session/prompt` request remains active. The adapter should:

1. Continue reading stdin while the agent turn runs.
2. Locate the matching active session or turn.
3. Trigger the runtime’s cancellation primitive.
4. Cancel outstanding tool operations where possible.
5. Stop producing new side effects.
6. Resolve the original prompt request with:

```json
{
  "stopReason": "cancelled"
}
```

The stdin reader therefore cannot be blocked inside the model invocation. Use an event loop with separate tasks for:

* Reading JSON-RPC.
* Running a prompt.
* Writing protocol messages.
* Watching cancellation.
* Supervising tools.

ACP also defines standard JSON-RPC cancellation patterns, but Buzz’s concrete integration uses its session-level cancellation behavior. ([Agent Client Protocol][10])

## 2.7 Extension metadata

ACP supports custom metadata through `_meta`. Implementations should not add arbitrary custom root-level fields to protocol objects when `_meta` can carry them. ([Agent Client Protocol][11])

A sensible namespace would be something like:

```json
{
  "_meta": {
    "com.yourcompany.agent": {
      "adapterVersion": 1
    }
  }
}
```

For Buzz-specific extensions:

```json
{
  "_meta": {
    "com.block.buzz": {
      "profileVersion": 1
    }
  }
}
```

---

# 3. Buzz’s ACP interface

The attached Buzz notes accurately capture the minimal baseline:

* Accept `initialize`.
* Accept `session/new`.
* Accept `session/prompt`.
* Stream `session/update`.
* Return a `stopReason`.



Current Buzz main has evolved beyond that minimal contract, so the adapter should target a clearly defined **Buzz ACP profile**, rather than relying only on generic ACP documentation.

## 3.1 Inbound path: Buzz to the adapter

Buzz receives relay events, applies its own filters and membership logic, and turns eligible event batches into prompts.

Conceptually:

```text
Nostr events
   │
   ├── membership checks
   ├── author gate
   ├── mention/subscription rules
   ├── batching
   ├── thread and channel context
   ▼
session/prompt
```

Buzz’s harness can restrict authors through modes including:

* `owner-only`
* `allowlist`
* `anyone`
* `nobody`

The default is designed around owner-only operation. 

The agent also needs to be a member of a Buzz channel before the harness will subscribe to it. Membership changes can be detected live without restarting the harness. 

From the adapter’s perspective, the important implication is:

> Do not recreate Buzz’s inbound authorization and mention logic inside the adapter.

The adapter receives prompts that `buzz-acp` has already decided are eligible. It may add its own application-level policies, but it should not attempt to duplicate the entire Nostr event-filtering layer.

## 3.2 Buzz initialization profile

Current Buzz initialization has several compatibility details:

* It requests protocol version 2.
* It includes client identity.
* It includes terminal-auth-related capability metadata.
* It includes Goose-oriented custom-notification metadata.

Your adapter should:

* Accept these unknown or vendor-specific `_meta` entries.
* Preserve forward compatibility.
* Avoid failing merely because Goose metadata is present.
* Respond with a clean capability declaration for your own implementation.

## 3.3 Buzz `session/new`

Buzz supplies at least:

```json
{
  "cwd": "/absolute/path",
  "mcpServers": []
}
```

Current source may also include:

```json
{
  "systemPrompt": "..."
}
```

for the version-2 compatibility path. ([GitHub][3])

`systemPrompt` should be treated as a Buzz-profile extension rather than assuming it is already a universally stable ACP-v2 field.

Recommended behavior:

```text
if systemPrompt is present:
    store it as immutable session-level instruction
else:
    expect Buzz may include system material in prompt text
```

Do not append the system prompt repeatedly to the runtime conversation on every turn. Store it once in `SessionState`.

## 3.4 Per-channel session behavior

Buzz’s worker pool tracks sessions per channel. This means a channel conversation can preserve context across multiple mentions.

Your adapter should map each Buzz ACP `sessionId` to exactly one runtime conversation or thread. It should not combine separate ACP sessions merely because they share a working directory.

When Buzz rotates a session after context exhaustion or a maximum-turn condition, your adapter should let the old state expire through an LRU or TTL policy.

Current source does not expose a dependable `session/end` lifecycle that every adapter can count on. Therefore, implement garbage collection instead of waiting indefinitely for an explicit end request.

## 3.5 Updates Buzz currently understands

Current Buzz handles or tolerates updates including:

| Update                      | Recommended use                                                 |
| --------------------------- | --------------------------------------------------------------- |
| `agent_message_chunk`       | Stream user-visible answer text for observability               |
| `agent_thought_chunk`       | Optional reasoning/status summary, not private hidden reasoning |
| `plan`                      | Structured execution plan                                       |
| `tool_call`                 | Announce a tool operation                                       |
| `tool_call_update`          | Progress, output, completion, or failure                        |
| `available_commands_update` | Advertise agent commands                                        |
| `session_info_update`       | Session metadata and runtime state                              |
| `keepalive`                 | Preserve liveness during silent operations                      |

Unknown notifications are generally safest to ignore rather than treating them as fatal. ([GitHub][3])

## 3.6 ACP output is not the Buzz channel reply path

This is one of the most important integration details.

Buzz’s documented model is:

```text
ACP message chunks = harness/runtime communication
Buzz CLI or Buzz tools = actual actions in Buzz
```

The base prompt tells agents that the `buzz` CLI is their primary interface, and that its output is structured JSON. 

The CLI itself is explicitly designed as an agent-first, JSON-in/JSON-out interface. 

Therefore, the adapter must not assume that this ACP notification:

```json
{
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": {
        "type": "text",
        "text": "Here is my answer..."
      }
    }
  }
}
```

will itself post `"Here is my answer..."` to the Buzz channel.

The underlying agent should invoke something equivalent to:

```bash
buzz messages send \
  --channel <channel-id> \
  --content "Here is my answer..."
```

Preferably, this should be exposed as a typed MCP tool rather than unrestricted shell execution.

---

# 4. Recommended adapter architecture

I would divide the adapter into seven components.

## 4.1 Transport and JSON-RPC layer

Responsibilities:

* Read one JSON object per stdin line.
* Validate JSON-RPC envelopes.
* Route requests and notifications.
* Correlate responses by request ID.
* Serialize all stdout writes through one writer queue.
* Send diagnostics only to stderr.
* Apply maximum message-size limits.
* Return standard JSON-RPC errors for malformed or unsupported calls.

Recommended error classes:

```text
-32700  Parse error
-32600  Invalid request
-32601  Method not found
-32602  Invalid params
-32603  Internal error
```

Do not let multiple tasks write directly to stdout; interleaved bytes can destroy NDJSON framing.

## 4.2 Buzz compatibility layer

This should be a deliberately small module.

Responsibilities:

* Accept Buzz’s `protocolVersion: 2`.
* Normalize the handshake to your internal ACP representation.
* Accept the optional `systemPrompt`.
* Preserve or ignore Buzz and Goose `_meta`.
* Support current Buzz stop-reason spellings.
* Support Buzz cancellation semantics.
* Optionally expose model or mode configuration.

This avoids contaminating the core runtime bridge with protocol-version exceptions.

A useful code boundary is:

```text
StdioJsonRpc
     │
     ▼
BuzzAcpWireProfile
     │ normalized requests
     ▼
AcpSessionController
```

## 4.3 Session manager

Maintain:

```text
Map<SessionId, SessionState>
```

Each state should include:

* Working directory.
* System instructions.
* Runtime conversation identifier.
* MCP server clients.
* Selected model.
* Selected mode.
* Active prompt request ID.
* Cancellation token.
* Turn counter.
* Tool-call registry.
* Last-used timestamp.
* Delivery state.

Enforce one active prompt per session unless your runtime explicitly supports concurrent turns in the same conversation.

The adapter process may contain multiple sessions, but serializing active prompts at the process level is also reasonable for an initial implementation because Buzz already scales concurrency by launching multiple adapter subprocesses.

## 4.4 Runtime bridge

Define an internal interface independent of ACP:

```text
AgentRuntime {
    create_conversation(config) -> Conversation
    run_turn(conversation, prompt, tools, event_sink, cancellation) -> TurnResult
    cancel(conversation)
    set_model(conversation, model)
    close(conversation)
}
```

The runtime bridge translates provider-specific events into normalized internal events:

```text
TextDelta
ThoughtSummary
PlanChanged
ToolStarted
ToolProgress
ToolCompleted
ToolFailed
UsageChanged
TurnCompleted
TurnFailed
```

Then a separate projector translates those events into ACP `session/update` notifications.

This separation prevents OpenAI-, Claude-, Goose-, or custom-runtime event formats from leaking into your protocol code.

## 4.5 MCP and tool broker

On `session/new`, consume the supplied `mcpServers`.

The broker should:

* Start or connect to each configured server.
* Discover its tools.
* Normalize tool schemas for the agent runtime.
* Execute calls with cancellation and timeout support.
* Translate progress into ACP tool updates.
* Enforce allowlists and argument validation.
* Close connections when sessions expire.

For Buzz operations, a dedicated typed tool surface is better than a generic shell tool.

For example:

```text
buzz_messages_send
buzz_messages_get
buzz_messages_thread
buzz_channels_list
buzz_users_get
buzz_reactions_add
buzz_canvas_get
buzz_canvas_set
```

Internally these tools may call `buzz-cli`, but the model should receive a structured JSON schema rather than having to construct shell commands.

Benefits include:

* Fewer quoting errors.
* Better channel-ID validation.
* Easier auditing.
* Easier side-effect classification.
* More reliable cancellation.
* Lower prompt-injection exposure.
* Clearer tool-call updates.

## 4.6 Delivery controller

Buzz expects the agent to use Buzz tooling to send its answer. This introduces the risk that a model produces a final answer but forgets to invoke the send tool.

A delivery controller should track whether the current turn performed a successful outbound Buzz message action.

Possible policy:

```text
1. Agent receives a strong system instruction:
   "For a Buzz user request, publish the answer with buzz_messages_send."

2. Adapter records successful send calls.

3. Before returning end_turn:
   - If a send occurred, finish normally.
   - If no send occurred, run one corrective continuation:
     "You have not delivered the answer to Buzz. Use the messaging tool now."

4. If it still does not send:
   - Return an error or end_turn according to policy.
   - Log the undelivered text for diagnosis.
```

Do not make prompt-text parsing of channel IDs your primary delivery mechanism. It is brittle and couples the adapter to Buzz’s human-readable prompt formatting.

## 4.7 Policy and sandbox layer

Enforce:

* Allowed MCP servers.
* Allowed executable paths.
* Allowed filesystem roots.
* Network egress rules.
* Maximum tool duration.
* Maximum output size.
* Maximum tool-call count.
* Destructive-operation restrictions.
* Secret redaction.
* Side-effect deduplication.

This is especially important because Buzz’s current ACP permission callback is not a human approval boundary.

---

# 5. Minimum Buzz-compatible method contract

A practical first release should support the following.

## Required

| Method           | Direction      | Required behavior                                      |
| ---------------- | -------------- | ------------------------------------------------------ |
| `initialize`     | Buzz → adapter | Accept Buzz version 2 profile and return capabilities  |
| `session/new`    | Buzz → adapter | Create isolated state and return exact `sessionId`     |
| `session/prompt` | Buzz → adapter | Execute a turn, stream updates, return `stopReason`    |
| `session/cancel` | Buzz → adapter | Cancel promptly and resolve active prompt as cancelled |
| `session/update` | Adapter → Buzz | Stream text and tool state                             |

## Operationally important

| Feature                            | Reason                                      |
| ---------------------------------- | ------------------------------------------- |
| MCP server consumption             | This is the clean tool path                 |
| `tool_call` updates                | Makes long operations observable            |
| `keepalive` or progress            | Avoids idle timeout during long silent work |
| stderr logging                     | Protects stdout framing                     |
| Multiple session IDs               | Buzz sessions are channel-associated        |
| Graceful EOF and signal handling   | Buzz owns the subprocess lifecycle          |
| Tool-call timeout and cancellation | Prevents orphan operations                  |

## Optional second-stage features

| Feature                      | Value                                           |
| ---------------------------- | ----------------------------------------------- |
| `configOptions`              | Model and mode selection                        |
| `session/set_config_option`  | Stable configuration changes                    |
| Unstable `session/set_model` | Compatibility with current Buzz model switching |
| Session loading              | Durable conversations after process restart     |
| `available_commands_update`  | Slash-command integration                       |
| Usage metadata               | Cost/token observability                        |
| Goose steering extensions    | Only when Goose compatibility is required       |

## Avoid relying on

* Agent-initiated filesystem calls when Buzz did not advertise filesystem capability.
* Agent-initiated terminal calls when Buzz did not advertise terminal capability.
* ACP permissions as a human approval gate.
* ACP text chunks as the mechanism that posts to the Buzz channel.
* A future `session/end` call for cleanup.
* Strict rejection of Buzz’s protocol version 2.

---

# 6. Example wire interaction

## 6.1 Initialization

Buzz may send a request conceptually like:

```json
{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":2,"clientCapabilities":{"auth":{"terminal":true},"_meta":{"goose":{"customNotifications":true},"terminal-auth":true}},"clientInfo":{"name":"buzz-acp","version":"0.1.0"}}}
```

A minimal response could be:

```json
{"jsonrpc":"2.0","id":0,"result":{"protocolVersion":2,"agentCapabilities":{"loadSession":false,"promptCapabilities":{"image":false,"audio":false,"embeddedContext":false}},"agentInfo":{"name":"acme-agent-acp","title":"Acme Agent","version":"0.1.0"},"authMethods":[]}}
```

Only advertise fields that are genuinely supported.

## 6.2 New session

Request:

```json
{"jsonrpc":"2.0","id":1,"method":"session/new","params":{"cwd":"/workspace/project","mcpServers":[{"name":"buzz-tools","command":"buzz-dev-mcp","args":[]}],"systemPrompt":"You are operating inside Buzz."}}
```

Response:

```json
{"jsonrpc":"2.0","id":1,"result":{"sessionId":"sess_7f881a"}}
```

The field must be exactly `sessionId`, not `session_id`.

## 6.3 Prompt and updates

Prompt:

```json
{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"sess_7f881a","prompt":[{"type":"text","text":"A user mentioned you in the engineering channel..."}]}}
```

Text update:

```json
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_7f881a","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"I’ll inspect the current implementation."}}}}
```

Tool announcement:

```json
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_7f881a","update":{"sessionUpdate":"tool_call","toolCallId":"tool_42","title":"Read repository files","kind":"read","status":"in_progress","locations":[],"rawInput":{"path":"src/"}}}}
```

Tool completion:

```json
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_7f881a","update":{"sessionUpdate":"tool_call_update","toolCallId":"tool_42","status":"completed","content":[{"type":"content","content":{"type":"text","text":"Read 14 files."}}]}}}
```

Final prompt response:

```json
{"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn"}}
```

Before returning `end_turn`, the agent should have used the Buzz messaging tool to publish its actual response.

## 6.4 Cancellation

Buzz sends a notification, not a request requiring a separate response:

```json
{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":"sess_7f881a"}}
```

The active prompt request should then resolve:

```json
{"jsonrpc":"2.0","id":2,"result":{"stopReason":"cancelled"}}
```

Cancellation should be idempotent. A second cancellation for the same session should not crash the adapter.

---

# 7. Improving Buzz’s interface for first-class adapters

Buzz’s current interface is usable, but much of the Buzz event context is represented as formatted text. That makes generic adapters work, while limiting deterministic integrations.

The best long-term improvement would be an optional, namespaced Buzz metadata profile.

For example:

```json
{
  "sessionId": "sess_7f881a",
  "prompt": [
    {
      "type": "text",
      "text": "Please investigate the deployment failure."
    }
  ],
  "_meta": {
    "com.block.buzz": {
      "profileVersion": 1,
      "communityId": "engineering",
      "channelId": "channel-uuid",
      "triggeringEventIds": [
        "nostr-event-id"
      ],
      "threadRootEventId": "root-event-id",
      "replyMode": "thread"
    }
  }
}
```

Do not put the private key, API token, or other secrets into this metadata.

A corresponding handshake capability could be:

```json
{
  "_meta": {
    "com.block.buzz": {
      "profileVersions": [1],
      "structuredContext": true
    }
  }
}
```

The adapter could reply:

```json
{
  "_meta": {
    "com.block.buzz": {
      "selectedProfileVersion": 1,
      "structuredContext": true
    }
  }
}
```

This would provide several benefits:

* No channel-ID extraction from prose.
* Deterministic reply routing.
* Better idempotency.
* Reliable thread replies.
* Better audit correlation.
* Cleaner support for non-LLM agents.
* Less dependence on Buzz prompt-template changes.

Because ACP reserves `_meta` for namespaced extension data, this can be added without breaking generic agents. ([Agent Client Protocol][11])

---

# 8. Authentication and Buzz identity

Every deployed Buzz agent should have its own Nostr keypair. The attached Buzz material explicitly recommends a separate identity per agent. 

The adapter subprocess will normally inherit variables such as:

```text
BUZZ_PRIVATE_KEY
BUZZ_RELAY_URL
BUZZ_AUTH_TAG
BUZZ_API_TOKEN
```

Security recommendations:

1. Never print inherited environment variables.
2. Redact Nostr private keys and tokens from error messages.
3. Avoid passing credentials through prompt text.
4. Restrict child-process environment inheritance.
5. Give each agent only the scopes it needs.
6. Use Buzz’s owner-only or allowlist inbound gate.
7. Add the agent only to necessary channels.
8. Run the adapter under an operating-system account with limited access.
9. Treat every MCP server as privileged code.
10. Rotate an agent identity independently if compromised.

The adapter should distinguish:

* **Buzz identity:** the Nostr keypair used for workspace actions.
* **Provider identity:** credentials used to call an external model provider.
* **Runtime identity:** local user, container, or sandbox permissions.

Do not conflate the three.

---

# 9. Reliability considerations

## 9.1 Clean stdout

The most common ACP adapter failure is accidental stdout logging.

Bad:

```text
Starting agent...
{"jsonrpc":"2.0", ...}
```

Good:

```text
stdout: {"jsonrpc":"2.0", ...}
stderr: Starting agent...
```

Configure every dependency, runtime SDK, and child process accordingly.

## 9.2 Nonblocking reader

The main reader must continue processing messages during a long turn. Otherwise Buzz cancellation cannot be observed until after the turn finishes.

A suitable concurrency model is:

```text
reader task
   ├── initialize handler
   ├── session/new handler
   ├── prompt task
   └── cancellation handler

single writer task
   └── ordered NDJSON stdout
```

## 9.3 Timeouts and progress

Buzz has both idle and hard turn timeouts. The attached configuration describes an idle timeout and an absolute maximum-turn duration. 

For a long tool operation:

* Emit a `tool_call` immediately.
* Emit meaningful progress updates.
* Use a keepalive only where meaningful progress is unavailable.
* Apply a tool-level timeout shorter than the overall turn timeout.
* Cancel the child process on turn cancellation.

Do not emit high-frequency empty keepalives merely to keep an irrecoverably stuck operation alive.

## 9.4 Process failure

If the underlying runtime exits:

* Mark the active tool call failed.
* Return an ACP internal error or a safe stop reason.
* Write the detailed failure to stderr.
* Close or invalidate affected runtime conversations.
* Avoid leaving the `session/prompt` request unresolved.

## 9.5 Idempotency

Buzz may retry work after network, process, or timeout failures. Tool actions should carry stable idempotency identifiers where possible.

For message sends, a useful key can be derived from:

```text
agent identity
+ Buzz triggering event ID
+ intended action type
+ logical turn
```

A structured Buzz `_meta` extension would make this substantially more reliable.

---

# 10. Testing strategy

## Layer 1: Protocol tests

Test exact serialized messages for:

* One JSON object per line.
* Numeric and string request IDs.
* Unknown methods.
* Invalid parameters.
* Version 1 initialization.
* Buzz version 2 initialization.
* Correct camelCase fields.
* Multiple sessions.
* Unknown `_meta`.
* Large content.
* Malformed JSON.
* stdout contamination.

## Layer 2: Turn lifecycle tests

Test:

* Normal `end_turn`.
* Cancellation before the model starts.
* Cancellation during model streaming.
* Cancellation during a tool call.
* Maximum tokens.
* Refusal.
* Runtime crash.
* Tool crash.
* MCP disconnect.
* Prompt arriving while the same session is busy.
* Different sessions in one process.
* Session state expiration.

## Layer 3: Buzz-profile tests

Create a small fake Buzz client that reproduces:

1. Buzz’s version-2 initialization.
2. `session/new` with `systemPrompt`.
3. `mcpServers`.
4. A realistic multi-block Buzz prompt.
5. `session/cancel`.
6. Model-config calls.
7. Goose metadata that your adapter ignores.

This should be a permanent compatibility suite, not a one-off manual test.

## Layer 4: End-to-end Buzz integration

Run:

```text
local Buzz relay
+ buzz-acp
+ your adapter
+ test Buzz channel
```

Verify:

* Agent identity authenticates.
* Agent discovers the channel.
* Mention invokes the adapter.
* Session is reused on a second message.
* The adapter uses the Buzz tool.
* The reply appears in the correct channel or thread.
* Owner-only filtering works.
* Removing channel membership stops delivery.
* Cancellation stops tools and prevents late posting.
* Two adapter subprocesses handle concurrent channels.

## Layer 5: Adversarial tests

Include:

* Prompt injection asking the adapter to reveal environment variables.
* Tool output containing fake JSON-RPC.
* A child process writing logs to stdout.
* Massive tool output.
* An MCP server returning malformed data.
* Repeated cancellation.
* Duplicate prompt delivery.
* Provider rate limits.
* Buzz relay disconnection during message send.
* A send succeeding but its acknowledgement being lost.

---

# 11. Implementation sequencing

## Phase 1: Compatibility spike

Implement only:

* NDJSON transport.
* `initialize`.
* `session/new`.
* `session/prompt`.
* Text chunks.
* `end_turn`.
* `session/cancel`.

Use an echo or deterministic test runtime.

Success criterion: Buzz can start the process and complete a turn without protocol errors.

## Phase 2: Real runtime bridge

Add:

* Provider or local-agent integration.
* Runtime conversation persistence.
* Streaming translation.
* Cancellation.
* Error normalization.
* Token and duration limits.

Success criterion: multiple turns in one Buzz channel retain context.

## Phase 3: Buzz tools

Add:

* MCP server consumption.
* Typed Buzz messaging tools.
* Delivery tracking.
* Tool updates.
* Safe command and filesystem policies.

Success criterion: the reply reliably appears in the correct Buzz channel.

## Phase 4: Production hardening

Add:

* Multiple sessions.
* TTL cleanup.
* Metrics and tracing.
* Idempotent side effects.
* Rate limiting.
* Secret redaction.
* Provider retries.
* Graceful shutdown.
* Chaos testing.

## Phase 5: Rich integration

Add as needed:

* Model configuration.
* Mode configuration.
* Usage updates.
* Session restore.
* Slash commands.
* Structured Buzz `_meta`.
* Optional steering support.

---

# 12. Language and SDK choice

Use the language closest to the underlying runtime.

* **TypeScript** is usually the fastest route for Node-based agent SDKs and MCP integrations.
* **Rust** is attractive when you want a small, robust, distributable binary with strict transport control.
* **Python** is suitable for rapid prototyping or Python-native orchestration frameworks.

Using an official ACP SDK is desirable for protocol types and content schemas, but test its version-negotiation behavior carefully. An SDK that strictly accepts only stable ACP version 1 may reject Buzz’s current version-2 handshake.

A strong architecture is:

```text
Official ACP models where practical
          +
small handwritten Buzz wire compatibility shim
          +
runtime-independent internal interfaces
```

Avoid maintaining a broad fork of the ACP SDK merely to change the version number.

---

# Bottom line

The best adapter is not a Buzz-specific agent implementation. It is a **general ACP agent with a narrow Buzz compatibility profile**.

The most important design decisions are:

1. Treat Buzz as the ACP client and your binary as the ACP agent.
2. Speak clean JSON-RPC NDJSON over stdio.
3. Accept Buzz’s temporary `protocolVersion: 2` behavior while retaining version-1 compatibility.
4. Maintain multiple ACP sessions and map each to an isolated runtime conversation.
5. Consume MCP server definitions from `session/new`.
6. Use typed Buzz tools or the Buzz CLI for actual channel actions.
7. Do not assume ACP text chunks automatically become Buzz messages.
8. Keep stdin processing live during turns so cancellation works.
9. Do not rely on Buzz’s ACP permission callback as a human security boundary.
10. Add a namespaced, structured Buzz `_meta` profile for channel and event context if you can modify Buzz.
11. Build a permanent compatibility suite against Buzz main because this interface is currently ahead of stable ACP in several places.

The resulting boundary should look like this:

```text
┌──────────────────────────────────────────────────────────────┐
│ Buzz                                                         │
│                                                              │
│ Relay/Nostr → filtering → batching → per-channel session     │
└───────────────────────────┬──────────────────────────────────┘
                            │ ACP, NDJSON/stdin/stdout
┌───────────────────────────▼──────────────────────────────────┐
│ Your adapter                                                 │
│                                                              │
│ Buzz compatibility shim                                      │
│        ↓                                                     │
│ ACP session controller                                       │
│        ↓                                                     │
│ Agent runtime bridge ─── MCP/tool broker ─── Buzz tools      │
│        ↓                                                     │
│ Updates, cancellation, policies, delivery verification       │
└──────────────────────────────────────────────────────────────┘
```

This gives you immediate compatibility with Buzz’s current harness without coupling the underlying agent to Nostr, while preserving a path toward ordinary ACP clients and future protocol versions.

[1]: https://agentclientprotocol.com/protocol/v1/transports "Transports - Agent Client Protocol"
[2]: https://github.com/agentclientprotocol/agent-client-protocol?utm_source=chatgpt.com "GitHub - agentclientprotocol/agent-client-protocol: A protocol for connecting any editor to any agent · GitHub"
[3]: https://raw.githubusercontent.com/block/buzz/main/crates/buzz-acp/src/acp.rs "raw.githubusercontent.com"
[4]: https://agentclientprotocol.com/protocol/initialization "Initialization - Agent Client Protocol"
[5]: https://agentclientprotocol.com/protocol/session-setup "Session Setup - Agent Client Protocol"
[6]: https://raw.githubusercontent.com/block/buzz/main/crates/buzz-acp/src/pool.rs "raw.githubusercontent.com"
[7]: https://agentclientprotocol.com/protocol/v1/content "Content - Agent Client Protocol"
[8]: https://agentclientprotocol.com/protocol/prompt-turn "Prompt Turn - Agent Client Protocol"
[9]: https://agentclientprotocol.com/protocol/v1/tool-calls "Tool Calls - Agent Client Protocol"
[10]: https://agentclientprotocol.com/protocol/v1/cancellation "Cancellation - Agent Client Protocol"
[11]: https://agentclientprotocol.com/protocol/extensibility "Extensibility - Agent Client Protocol"
