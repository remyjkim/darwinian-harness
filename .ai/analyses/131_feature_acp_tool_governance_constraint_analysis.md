# ABOUTME: Analysis of why Card tool governance has no enforcement path in the deployed Worker runtime.
# ABOUTME: Corrects an earlier assumption about ACP permissions and defines what would make governance real.

# Card Tool Governance Has No Enforcement Path In Deployed Workers

**Audience:** both `drwn` CLI and `darwinian-services`.
**Status:** correction plus interface request. Amends
[`129`](./129_feature_acp_buzz_worker_integration_target_architecture.md) §7.
**Severity:** correctness of a security claim, not an outage.

## 1. Summary

Card manifests declare tool governance — `tools.allow`, `tools.deny`, `permissions`,
`escalation` (`cli/core/card-manifest.ts:32-59`). None of it is enforced anywhere for a
deployed Worker. It is forwarded to the deploy payload as `governance`
(`cli/core/worker-deploy.ts:120-136`) and, on the runtime side, never consulted.

Two candidate enforcement seams were investigated for the ACP work. Both fail:

- **Interactive, via ACP `session/request_permission`** — impossible for remote execution.
  Tools run inside a Cloudflare container the ACP client cannot reach.
- **Declarative, via the `toolPolicy` field on the chat start call** — the field exists and
  is threaded through, but it enforces only Pipedream app/account routing. Any other shape
  is serialized and ignored.

The correct conclusion is uncomfortable and should be stated plainly: **the only real tool
boundary for a deployed Worker today is the set of MCP servers the Card ships, plus the
container sandbox.** That is coarse but genuine. Everything finer-grained that we currently
declare is documentation, not enforcement.

## 2. The Retraction

An earlier reading of the ACP work — recorded here so it is not re-derived — held that ACP
would be where Card governance finally gets teeth. The reasoning was superficially strong:

`cli/core/hook-policy/types.ts:18-22` defines a decision type that maps almost perfectly onto
ACP's permission model:

```ts
export type ToolPolicyDecision =
  | { action: "allow"; additionalContext?: string; updatedInput?: unknown }
  | { action: "deny"; reason: string; syntheticOutput?: unknown }
  | { action: "ask"; reason: string }
  | { action: "log-only" };
```

`allow` → select an allow option; `deny` → select reject; `ask` → forward upstream to a human;
`log-only` → pass through. And `ToolPolicyEvent` already carries `runtime`, `toolName`,
`input`, `cwd`, `sessionId`. ACP is the first protocol in drwn's world with a first-class
permission request, where the four file-config targets in `cli/core/targets.ts` have no
runtime seam at all.

**This is wrong for the remote-fronting architecture**, for a reason that has nothing to do
with the elegance of the mapping: the tools are not on the same machine as the policy engine.
An ACP client can only answer a permission request that an ACP *agent* raises. In `129` the
agent is a thin local adapter; the actual tool execution happens server-side, inside a
container, driven by a Coordinator DO. Nothing in that path calls back out over ACP, and
building such a callback would mean routing every remote tool invocation through a local
stdio process — unacceptable for latency, and it would make the run's liveness depend on the
laptop staying awake.

The mapping remains valid for a *locally executed* agent. It does not survive the move to
remote execution, which is the architecture chosen in `129`.

## 3. Why The Declarative Fallback Also Fails Today

`toolPolicy` looks like the answer. It is accepted on the chat start body and reaches the run:

```text
engine/src/worker.ts:373   readChatStart() → { …, toolPolicy }
engine/src/worker.ts:431   buildChatInput(deployment, toolPolicy ?? undefined)
engine/src/chat-input.ts:71  runtimeConfig.routineToolPolicy = …
engine/src/coordinator.ts:430  readRoutineToolPolicy(runtimeConfig)
engine/src/coordinator.ts:455  → serialized into run config
engine/src/coordinator.ts:467  → pipedreamEnv(…, routineToolPolicy?.pipedream, …)
```

But `readRoutineToolPolicy` (`coordinator.ts:63-89`) recognizes exactly one schema:

```ts
if (policy.version !== 1 || !Array.isArray(policy.allowedApps) ||
    !policy.allowedApps.every((app) => typeof app === "string" && app.length > 0) ||
    typeof policy.policyHash !== "string") return { serialized: JSON.stringify(policy) };
```

Anything that does not match falls through to `{ serialized: … }` — recorded in run config,
never enforced. And the one recognized shape is consumed at a single site, `:467`, feeding
Pipedream app/account routing. It is a Pipedream credential-scoping mechanism that happens to
be named generically.

**The failure mode this creates is the dangerous kind.** If the adapter projected Card
`tools.allow`/`tools.deny` into `toolPolicy` today, the call would succeed, the policy would
be stored, and nothing would be enforced. `drwn status` would report governance as configured.
An operator would reasonably believe a deny list was active. A silent no-op that is reported
as a control is worse than an absent control.

## 4. What Actually Constrains A Deployed Worker

Stated accurately, so it can be relied on:

1. **The Card's MCP server set.** The container connects the Card's own MCP servers at boot
   and wraps each discovered tool for the model (`images/mind-runtime/runtime/mcp-connect.js`;
   specs read from `~/.agents/drwn/extracted/*/mcp-servers/*.json` in
   `runtime/server.js:48-62`). The agent cannot call a tool that was never connected. This is
   a real allowlist, at server granularity rather than tool granularity.
2. **Per-Mind secret scoping.** MCP tokens are decrypted per run and injected only into
   run-scoped process env (`engine/src/mind-restore.ts:32-41`, `engine/src/coordinator.ts:459`).
   A tool without credentials generally cannot do damage.
3. **The container sandbox.** Whatever the Cloudflare container boundary enforces.
4. **Pipedream routing**, where `toolPolicy` genuinely applies.

Not on that list, and not enforced: `tools.allow`, `tools.deny`, `permissions`, `escalation`.

## 5. Consequences

### 5.1 For the ACP adapter (`drwn` CLI)

- The adapter **must not** advertise or imply tool gating. It has none.
- It should not send Card `tools.*` in `toolPolicy` until §6 lands, because doing so
  manufactures a false positive.
- Buzz's auto-approval of ACP permission requests (`acp.rs:1671-1731`, unconditional
  `allow_once` by `kind`) cannot be compensated for from the client side. This is worth
  stating in operator-facing docs rather than leaving implicit.
- `drwn-command-bridge` is not part of this path. Its consent gate is interactive and
  fail-closed (`src/consent/gate.ts:19-23`), which suits a developer at a keyboard and is
  actively wrong for an unattended chat agent — every command above
  `consent_required_above` would be denied.

### 5.2 For status/doctor output (`drwn` CLI)

If `drwn status` reports Card governance for a deployed Worker, it should distinguish
*declared* from *enforced*. The repo already draws this distinction elsewhere — declared
project capabilities versus ambient user-home observations — so the vocabulary exists.
Reusing it here is a small change that prevents a materially misleading claim.

### 5.3 For the deployed runtime (`darwinian-services`)

Cards ship governance metadata that the runtime silently discards. Anyone reading a Card
would reasonably assume it is applied.

## 6. What Would Make Governance Real

A general declarative tool policy, evaluated by the runtime for every tool call, not only
Pipedream routes. Sketch, deliberately close to the existing shape so it can subsume it:

```jsonc
{
  "version": 2,
  "allow": ["mcp:github/*", "mcp:filesystem/read_*"],   // absent = allow all not denied
  "deny":  ["mcp:filesystem/write_*", "mcp:shell/*"],   // deny wins over allow
  "policyHash": "sha256-…",
  "routes": [ /* existing Pipedream routes, unchanged */ ]
}
```

Requirements that matter more than the exact schema:

1. **Deny beats allow**, unconditionally.
2. **Unknown policy versions fail closed**, not open. Today's fall-through to
   `{ serialized }` is the opposite, and is the root cause of the silent no-op in §3.
3. **Enforced at the call site**, inside the container's tool wrapper, so it covers every
   tool regardless of origin.
4. **Denials are observable** — emitted on the event stream so an ACP client can render them
   as a failed `tool_call_update` rather than the tool silently never happening.
5. **`policyHash` is recorded on the run**, so an audit can answer which policy was in force.

With that in place, the adapter projects Card `tools.allow`/`deny` into it at session start
and the governance claim becomes true. Until then it should not be made.

## 7. Sequencing Note

This does not block the ACP adapter. `129` Phases 1-3 ship without it; the adapter simply
makes no governance claim. It should land before any marketing or documentation describes
Darwinian Workers as policy-governed in deployment, and before public marketplace invocation
(`deploy-api/src/public-chat.ts`) is promoted, since that path runs someone else's Card
under a minted card-authz token.

## 8. Open Questions

1. Was `toolPolicy` always intended to be Pipedream-scoped, or is the general case
   half-built? The generic name suggests broader intent.
2. Where should enforcement live — the container tool wrapper, the coordination loop, or
   both? The wrapper is the only place that sees every call.
3. Should `permissions` and `escalation` from the Card manifest have runtime meaning at all,
   or should they be retired from the manifest if they will never be enforced? Carrying
   unenforced security fields indefinitely is its own risk.
