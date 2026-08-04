# ABOUTME: Analysis of why Card tool governance has no enforcement path in the deployed Worker runtime.
# ABOUTME: Corrects an earlier assumption about ACP permissions and defines what would make governance real.

# Card Tool Governance Has No Enforcement Path In Deployed Workers

**Audience:** both `drwn` CLI and `darwinian-services`.
**Issue:** **[I107]** (`[I107, DS+DW] Card tool governance is declared but never enforced in the deployed runtime`, CL Issue Tracker v0.4).
**Status:** correction plus interface request. Amends
[`cl0105`](./cl0105_acp_buzz_worker_integration_target_architecture.md) §7.
**Severity:** correctness of a security claim, not an outage.
**Re-verified:** 2026-08-04 against `darwinian-services` `main` @ `ec7f9ff2`; behaviors hold, line anchors refreshed.

## 1. Summary

Card manifests declare tool governance — `tools.allow`, `tools.deny`, `permissions`,
`escalation` (`cli/core/card-manifest.ts:32-59`). None of it is enforced anywhere for a
deployed Worker. It is forwarded to the deploy payload as `governance`
(`cli/core/worker-deploy.ts:120-136`) and, on the runtime side, never consulted.

Two candidate enforcement seams were investigated for the ACP work. Both fail:

- **Interactive, via ACP `session/request_permission`** — impossible for remote execution.
  Tools run inside a Cloudflare container the ACP client cannot reach.
- **Declarative, via the `toolPolicy` field on the chat start call** — the field exists and
  is enforced, but only for routines and only at MCP-*server* granularity (corrected
  2026-08-04 by the DS-side review, `darwinian-services`
  `cl0106_acp_deploy_api_remediation_review01.md`; the original "serialized and ignored"
  reading stopped one hop short — see §3).

The correct conclusion, refined: **for an interactive (ACP) run, the only real tool
boundary today is the set of MCP servers the Card ships, plus the container sandbox** —
`ROUTINE_TOOL_POLICY` is unset, so every Card-declared server connects. Routines do get
enforcement, at server granularity. Per-tool-name governance (`tools.deny: ["x"]`) is inert
everywhere, and the Card manifest governance fields are read by nothing in the deployed
runtime.

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
An ACP client can only answer a permission request that an ACP *agent* raises. In `cl0105` the
agent is a thin local adapter; the actual tool execution happens server-side, inside a
container, driven by a Coordinator DO. Nothing in that path calls back out over ACP, and
building such a callback would mean routing every remote tool invocation through a local
stdio process — unacceptable for latency, and it would make the run's liveness depend on the
laptop staying awake.

The mapping remains valid for a *locally executed* agent. It does not survive the move to
remote execution, which is the architecture chosen in `cl0105`.

## 3. Why The Declarative Fallback Also Fails Today

`toolPolicy` looks like the answer. It is accepted on the chat start body and reaches the run:

```text
engine/src/worker.ts:188-191      readChatStart() → { …, toolPolicy } → buildChatInput(…)
engine/src/chat-input.ts:71       runtimeConfig.routineToolPolicy = …
engine/src/coordinator.ts:64-90   readRoutineToolPolicy(runtimeConfig)
engine/src/coordinator.ts:473     → serialized carried into the runtime config
engine/src/coordinator.ts:480-486 → pipedreamEnv(…, routineToolPolicy?.pipedream, …)
```

But `readRoutineToolPolicy` (`coordinator.ts:64-90`) recognizes exactly one schema:

```ts
if (policy.version !== 1 || !Array.isArray(policy.allowedApps) ||
    !policy.allowedApps.every((app) => typeof app === "string" && app.length > 0) ||
    typeof policy.policyHash !== "string") return { serialized: JSON.stringify(policy) };
```

**Correction (2026-08-04, DS-side review):** the fall-through `{ serialized: … }` is *not*
merely recorded — it continues into the container as the `ROUTINE_TOOL_POLICY` env var
(`mind-streaming-runtime.ts:305-306`), where `routine-tool-policy.js` parses it into one of
three modes: absent → `interactive` (every Card server connects, no gating);
present-and-valid → a *server-level* allowlist for routines; present-but-malformed →
`invalid`, which **fails closed** — all card servers suppressed, health 503, chat 409
(`routine-tool-policy.js:64-90`, `server.js`).

**So the failure mode is loud, not silent.** If the adapter projected Card
`tools.allow`/`tools.deny` into `toolPolicy` today, the run would break with a 409 rather
than silently succeed — still wrong, for a different reason. The real gaps are: enforcement
granularity is the MCP *server*, never the tool name (`tools.deny: ["x"]` is inert even in
a valid policy); and interactive/ACP runs carry no policy at all, so today's enforcement
exists only for routines, which mint a signed policy that nothing derives from Card
manifest `tools.*`.

## 4. What Actually Constrains A Deployed Worker

Stated accurately, so it can be relied on:

1. **The Card's MCP server set.** The container connects the Card's own MCP servers at boot
   and wraps each discovered tool for the model (`images/mind-runtime/runtime/mcp-connect.js`;
   specs read from `~/.agents/drwn/extracted/*/mcp-servers/*.json` in
   `runtime/server.js:48-66`). The agent cannot call a tool that was never connected. This is
   a real allowlist, at server granularity rather than tool granularity.
2. **Per-Worker secret scoping** (stored on `secrets.mind_id`, the deployed Worker's 1:1
   control-plane identity). MCP tokens are decrypted per run and injected only into
   run-scoped process env (`engine/src/mind-restore.ts:32-45`, `engine/src/coordinator.ts:477`).
   A tool without credentials generally cannot do damage.
3. **The container sandbox.** Whatever the Cloudflare container boundary enforces.
4. **Pipedream routing**, where `toolPolicy` genuinely applies.

Not on that list, and not enforced: `tools.allow`, `tools.deny`, `permissions`, `escalation`.

## 5. Consequences

### 5.1 For the ACP adapter (`drwn` CLI)

- The adapter **must not** advertise or imply tool gating. It has none.
- It should not send Card `tools.*` in `toolPolicy` until §6 lands: an unrecognized shape
  trips the container's fail-closed `invalid` mode and 409s the run outright.
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
2. **Unknown policy versions keep failing closed** — already true in-container for the
   routine path (§3 correction); preserve that property when generalizing to per-tool
   granularity and interactive scope.
3. **Enforced at the call site**, inside the container's tool wrapper, so it covers every
   tool regardless of origin.
4. **Denials are observable** — emitted on the event stream so an ACP client can render them
   as a failed `tool_call_update` rather than the tool silently never happening.
5. **`policyHash` is recorded on the run**, so an audit can answer which policy was in force.

With that in place, the adapter projects Card `tools.allow`/`deny` into it at session start
and the governance claim becomes true. Until then it should not be made.

## 7. Sequencing Note

This does not block the ACP adapter. `cl0105` Phases 1-3 ship without it; the adapter simply
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
