# ABOUTME: I171 G2 plan for making immutable Cards the canonical source of direct MCP configuration across Claude, Codex, Cursor, and OpenCode.
# ABOUTME: Defines the schema, security, adapters, adoption, machine activation, health, provider rollout, and native-config cutover sequence.

# Card-Based Direct MCP Control Plane Implementation Plan

> **For Codex:** REQUIRED SUB-SKILLS: Use `executing-plans`, `test-driven-development`, `incremental-commits`, and `verification-before-completion`. Execute one PR unit at a time and stop at every decision or real-client gate.

**Goal:** Make immutable drwn Cards the canonical, secret-free desired-state source for directly connecting supported MCP providers to Claude Code, Codex, Cursor, and OpenCode, while leaving credentials, trust, approvals, and native-only capabilities under their owning clients.

**Architecture:** Normalize legacy server records and new typed capability variants into one internal MCP capability model. Resolve those capabilities from project Worker closures or explicitly selected machine capability Cards, choose a target- and client-version-specific binding, render through independent native adapters, and record projection ownership without ever storing OAuth tokens. Add read-only discovery, explicit adoption, layered readiness/identity observations, and a staged provider cutover; reserve gateways for a later exception-driven task.

**Tech stack:** TypeScript 6, Bun 1.3, Clipanion, Zod, `smol-toml`, existing Card/store/lock/write-record machinery, native client CLIs, JSON/TOML fixture corpora, and a disposable reference MCP/OAuth test server.

---

## Document status and workflow identity

**Status:** Provisional G2 draft, 2026-08-01. Implementation has not started; G1 must pass before this plan may enter G2 review.

- **Issue:** [I171 — Card-based direct MCP control plane for drwn](https://app.notion.com/p/3b0f1fbef8c2814cb176c04974b242d2)
- **Owner:** JGB
- **Reviewer:** Unassigned
- **Owner Status:** Architecting
- **Reviewer Status:** Before G1
- **Repository:** `darwinian-minds` (the tracker currently has no matching `Repo` option, so the property is intentionally unset)
- **Canonical plan:** `.ai/tasks/cl0171_card_based_mcp_control_plane_task_plan.md`
- **G1 architecture:** Existing evidence is summarized below; create or reconcile the canonical `cl0171_..._target_architecture.md` artifact before requesting G1 review.

Before execution:

1. Assign the Reviewer and produce/reconcile the canonical G1 architecture artifact.
2. Submit G1 and atomically synchronize the tracker properties, Issue Status table, and newest-first Issue Thread.
3. After G1 passes, reconcile this provisional plan with all G1 decisions.
4. Submit this document for G2 review; do not begin G3 implementation before G2 passes.
5. Create the implementation worktree/branch from a clean, current `main`; do not execute in the present dirty checkout.

The missing `.ai/rules/org-wide/06_issue_workflow.md` and `.ai/rules/repo-wide/*` files referenced by the generated `AGENTS.md` were not present in this checkout during drafting. Resolve that instruction projection before selecting branch names or commit prefixes. The verified repository test stack is Bun (`bun test`, `bun run typecheck`, `bun run verify:release`).

## Architecture and evidence authority

- `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md` remains authoritative for one selected project Worker, ordered Card closure, immutable pins, pure projection, and project/machine isolation.
- `.ai/tasks/80_drwn-machine-defaults-v2-remediation-plan.md` through Task 85 remain authoritative for strict machine intent, inventory ownership, transfer exclusions, ambient collision policy, and write-record semantics.
- This plan amends only the MCP capability representation and machine activation source. Machine capability Cards are explicit machine intent; they are not Workers and never enter project closure implicitly.
- Official client/provider evidence collected 2026-08-01:
  - Claude: `https://code.claude.com/docs/en/mcp`
  - Codex: `https://developers.openai.com/codex/mcp/`
  - Cursor: `https://docs.cursor.com/context/model-context-protocol`
  - OpenCode current and V2: `https://dev.opencode.ai/docs/mcp-servers/`, `https://opencode.ai/v2/docs/mcp-servers`
  - MCP transport/auth/security: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports`, `https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`, `https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices`
  - Provider sources: Notion, Slack, Google Workspace, Figma, Parallel, and Browserbase official MCP documentation.

## Verified baseline

| Finding | Evidence / implication |
|---|---|
| Current CLI version is `1.0.0`; installed clients are Claude Code `2.1.212`, Codex `0.144.6`, Cursor Agent `2026.07.09-a3815c0`, and OpenCode `1.18.4`. | Adapter compatibility must be versioned and tested against these first. |
| 95 focused MCP/Card/projection tests pass. | Existing render, ownership, drift, and ambient behavior is a safe characterization baseline, not proof of runtime health. |
| `drwn scan --json` returns `implemented:false`. | Discovery/adoption is a new implementation lane, not a repair of existing semantics. |
| `RegistryServer` has one transport/command/URL definition rendered to every enabled target. | It cannot express provider/client eligibility, per-target OAuth, policy, or version variants. |
| Machine intent selects one profile plus standalone skill/MCP IDs. | Global MCP configuration can be drwn-owned today, but is not sourced from independently selected capability Cards. |
| Card manifest validation checks little beyond header shape; `collectCardServerDefinitions` silently filters malformed entries; later same-ID definitions overwrite earlier definitions. | Card MCP validation and collision handling are P0 security/correctness work. |
| Standalone MCP inventory applies `sanitizeMcpServerSecrets`; Card source `add-mcp --from` does not apply the same policy. | All Card ingestion/publication/capture boundaries must share one secret-free validator. |
| OpenCode 1.18.4 accepts the current direct `mcp` shape; OpenCode V2 requires `mcp.servers`. | OpenCode needs two explicit adapter generations selected by detected version. |
| Cursor documents global and project files but not the full same-ID merge algorithm; an isolated probe stopped at project approval. | Cursor precedence remains a release-blocking real-client experiment; do not encode the current inheritance assumption as permanent truth. |
| Built-in `parallel-search` points to `https://search.parallel.ai/mcp`; current official Parallel docs specify `https://search-mcp.parallel.ai/mcp`. | Correct the registry only with a regression test and provider smoke; never silently preserve the stale URL in newly authored Cards. |
| Eight local Card sources use the V1 server shape. | Use a bounded V1-to-V2 normalization window; do not require a flag-day migration. |
| Current credentials were exposed in local diagnostic output during investigation. | Rotate Context7 and Browserbase credentials before real migration tests; add no-secret-output regression fixtures. |

## Non-negotiable decisions

1. **Direct-first:** A Card selects a provider's direct hosted endpoint or an exact-pinned local stdio server whenever a supported client can connect directly.
2. **Projection, not credential ownership:** drwn owns desired state, native bindings, projections, hashes, and observations. The native client owns OAuth tokens, keychain entries, trust, approvals, and admin policy.
3. **Secret-free immutable bytes:** Card source, manifest, published Card, lock, inventory bundle, scan output, journal, diagnostics, and logs may contain references and redacted metadata but never resolved secrets.
4. **Typed variants:** `stdio`, `streamable-http`, `sse-compat`, and `native-only` are discriminated variants. Ambiguous command-plus-URL records are invalid.
5. **Target bindings are first-class:** Provider capability and client projection are separate. Auth and policy translation may vary by target and client version.
6. **Fail closed:** Unsupported required auth/policy/transport semantics, duplicate capability IDs, unknown client schemas, and policy broadening block projection unless the user explicitly selects a documented degraded mode.
7. **Machine/project isolation remains:** Project output comes only from the active Worker closure plus project overlay. Machine capability Cards remain ambient to projects and are projected only by machine-scope writes.
8. **Read-only discovery is separate from mutation:** `drwn scan` never writes. `drwn mcp adopt` changes drwn state only after an explicit candidate selection; native files change only in a later `drwn write`.
9. **Health is layered:** File presence is not connection health. Parse, projection, reachability, initialization, authentication, approval, policy, tools, and identity are separate states.
10. **No gateway in this epic:** Define an explicit `native-only` result and record direct-connect exceptions. Implement a gateway only in a later issue justified by a proven exception, with no token passthrough.
11. **Legacy support is bounded:** Existing V1 server definitions normalize internally and emit a warning in authoring/doctor paths. New authoring writes V2 only. Remove V1 authoring support only after the eight known sources and published Cards are migrated.
12. **No automatic connector deletion:** Cutover removes or disables a native connector only after the replacement target is authenticated, approved, tool-listed, identity-checked where possible, and read-only-canary verified.

## Target domain contract

Create this conceptual model in `cli/core/mcp-capability.ts`; exact naming can change during G2 review, but the separation may not collapse back into `RegistryServer` optional fields.

```ts
export type McpTransportVariant =
  | {
      kind: "stdio";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, SecretReference | string>;
      runtime?: { name: string; version: string; integrity?: string };
    }
  | {
      kind: "streamable-http";
      url: string;
      headers?: Record<string, SecretReference | string>;
    }
  | {
      kind: "sse-compat";
      url: string;
      headers?: Record<string, SecretReference | string>;
    }
  | {
      kind: "native-only";
      reason: "host-capability" | "provider-client-allowlist" | "host-session-auth";
    };

export type McpAuthIntent =
  | { kind: "none" }
  | { kind: "client-managed-oauth"; scopes?: string[] }
  | {
      kind: "pre-registered-oauth";
      clientId: string | SecretReference;
      clientSecret: SecretReference;
      callbackPort?: number;
      scopes?: string[];
    }
  | { kind: "environment-bearer"; env: string };

export interface McpBindingSelector {
  targets: TargetName[];
  clientVersion?: string;
  priority: number;
}

export interface McpConnectionBinding {
  selector: McpBindingSelector;
  connection: McpTransportVariant;
  auth: McpAuthIntent;
  policy?: {
    enabledTools?: string[];
    disabledTools?: string[];
    approval?: "auto" | "prompt" | "writes" | "approve";
    required?: boolean;
  };
  probe?: {
    identityTool?: string;
    readOnlyTool?: string;
  };
}

export interface McpCapabilityV2 {
  schema: "drwn.mcp-capability";
  schemaVersion: 2;
  id: string;
  description: string;
  provider?: string;
  optional: boolean;
  machineEligible?: boolean;
  bindings: McpConnectionBinding[];
}
```

`SecretReference` must initially support only `{ kind: "env"; name: string }`. Do not add a drwn token vault or arbitrary shell/keychain expressions in this epic. Client-native OAuth has no `SecretReference` because the client owns the resulting credential.

Binding resolution returns exactly one result per `(capability, target, installed client version)`:

```ts
type BindingResolution =
  | { state: "selected"; binding: McpConnectionBinding }
  | { state: "native-only"; reason: string }
  | { state: "unsupported"; reasons: string[] }
  | { state: "ambiguous"; bindingIndexes: number[] };
```

No match, multiple equal-priority matches, invalid semver ranges, or a required policy that the adapter cannot express must be stable typed errors.

## PR and dependency map

```text
PR 1 Domain model + legacy normalization
  -> PR 2 Card security + collision hardening
  -> PR 3 Versioned target bindings/adapters
      -> PR 4 Read-only scan + explicit adoption
      -> PR 5 Machine capability Cards
      -> PR 6 Runtime status/auth/probe
          -> PR 7 Provider Cards + registry repair
              -> PR 8 Real-client acceptance matrix
                  -> PR 9 Staged native cutover + enforcement
```

PRs 4 and 5 may be developed in parallel only after PR 3 lands; they must not be merged out of order if they touch shared effective-state types. PR 7 spans `darwinian-minds` and `darwinian-cards` and must use separate commits/PRs per repository.

---

## PR 1 — Typed MCP capability model and bounded V1 normalization

### Task 1.1: Freeze V1 behavior with characterization fixtures

**Files:**
- Create: `test/fixtures/mcp-config/legacy-v1/*.json`
- Create: `test/core-mcp-capability-normalization.test.ts`
- Modify: `test/core-mcp-headers.test.ts`
- Modify: `test/core-effective-state.test.ts`

**Steps:**

1. Add V1 fixtures for stdio, HTTP, SSE, `platform-provided`, environment references, header references, optional servers, and malformed mixed transport fields.
2. Write red tests for deterministic `RegistryServer -> McpCapabilityV2` normalization. Valid legacy records receive one wildcard binding; `platform-provided` becomes `native-only`; malformed mixed records fail instead of being silently filtered.
3. Run:

   ```bash
   bun test test/core-mcp-capability-normalization.test.ts
   ```

   Expected: FAIL because the normalizer and V2 schema do not exist.
4. Record current renderer snapshots for Claude, Codex, Cursor, and OpenCode 1.x. These snapshots are the compatibility promise during PR 1-3.

### Task 1.2: Implement the strict V2 schema and normalizer

**Files:**
- Create: `cli/core/mcp-capability.ts`
- Create: `cli/core/mcp-capability-schema.ts`
- Modify: `cli/core/types.ts`
- Modify: `cli/core/semver-utils.ts` only if selector helpers are needed
- Test: `test/core-mcp-capability-normalization.test.ts`

**Steps:**

1. Define discriminated Zod schemas for capability, connection, auth, policy, selector, and probe.
2. Reject unknown fields, empty binding arrays, unsafe IDs, invalid URLs, non-HTTPS remote production endpoints, invalid semver ranges, ambiguous connection shapes, and literal values in secret-reference fields.
3. Implement `normalizeMcpCapability(id, unknownDefinition)` returning V2 or a typed `MCP_CAPABILITY_INVALID` error.
4. Preserve V1 renderer meaning only; do not preserve malformed V1 data.
5. Run the new test, then the existing MCP core suite.

   ```bash
   bun test test/core-mcp-capability-normalization.test.ts \
     test/core-mcp-headers.test.ts test/core-mcp-sync.test.ts test/sync-mcp.test.ts
   ```

   Expected: PASS.

### Task 1.3: Thread normalized capabilities through Card, registry, and effective state

**Files:**
- Modify: `cli/core/card-manifest.ts`
- Modify: `cli/core/card-mcp.ts`
- Modify: `cli/core/mcp-library.ts`
- Modify: `cli/core/inventory.ts`
- Modify: `cli/core/defaults.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/mcp-report.ts`
- Modify: `registry/mcp-servers.json`
- Test: `test/core-card-manifest.test.ts`
- Test: `test/core-effective-state.test.ts`
- Test: `test/core-mcp-library.test.ts`

**Steps:**

1. Permit V1 and V2 input at read boundaries, but expose only normalized V2 internally.
2. Change malformed Card MCP behavior from silent filtering to a typed failure attributed to Card name/version/server ID.
3. Keep immutable Card lock bytes unchanged; normalization happens after integrity verification, never by mutating locked manifests.
4. Add `legacyDefinitionCount` and warnings to status/doctor diagnostics.
5. Keep registry JSON V1 temporarily in PR 1 so snapshot diffs remain focused. PR 7 migrates built-ins to V2.
6. Run focused and full tests; then typecheck.

   ```bash
   bun test test/core-card-manifest.test.ts test/core-effective-state.test.ts \
     test/core-mcp-library.test.ts test/core-mcp-report.test.ts
   bun run typecheck
   ```

### PR 1 completion gate

- Every valid current Card/registry/inventory record renders byte-equivalent native output.
- Malformed records fail with source attribution.
- New code consumes normalized V2 only.
- No native user files are touched by tests.
- Commit after red/green verification using the repository's issue-approved prefix.

---

## PR 2 — Card MCP secret policy, validation, and conflict safety

### Task 2.1: Make secret policy structural and universal

**Files:**
- Modify: `cli/core/mcp-secret-policy.ts`
- Modify: `cli/core/card-source.ts`
- Modify: `cli/core/card-capture.ts`
- Modify: `cli/core/card-manifest.ts`
- Modify: `cli/core/card-catalog-publish.ts`
- Modify: `cli/core/mcp-library.ts`
- Modify: `cli/core/inventory-transfer.ts`
- Test: `test/core-mcp-secret-policy.test.ts` (create)
- Test: `test/commands-card-source-mcp-mutate.test.ts`
- Test: `test/core-card-capture.test.ts`
- Test: `test/commands-card-publish.test.ts`

**Steps:**

1. Write red tests covering literals in sensitive env/header names, bearer headers, command arguments following sensitive flags, URL userinfo, secret-looking query parameters, scan output, error output, and backups/journals.
2. Replace heuristic-only sanitization with validation over typed secret-reference positions.
3. Reject credentials in URLs/query strings even if the current process environment does not contain the value.
4. Apply the same validator to `card source add-mcp --from`, source doctor, capture, publish, inventory import/export, and standalone inventory.
5. Redact before error construction; never construct an error string containing the rejected literal.
6. Run:

   ```bash
   bun test test/core-mcp-secret-policy.test.ts \
     test/commands-card-source-mcp-mutate.test.ts \
     test/core-card-capture.test.ts test/commands-card-publish.test.ts
   ```

### Task 2.2: Reject duplicate capability definitions deterministically

**Files:**
- Modify: `cli/core/card-mcp.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/worker-generator/sync-worker.ts`
- Modify: `cli/core/project-registry.ts`
- Test: `test/core-card-mcp-conflicts.test.ts` (create)
- Test: `test/core-effective-state-worker.test.ts`

**Steps:**

1. Write red tests for two active Cards declaring identical same-ID capabilities, incompatible definitions, and explicit project overlays.
2. Approve this precedence contract at G2:
   - Canonically identical Card definitions deduplicate and retain all provenance.
   - Incompatible Card definitions fail `MCP_CAPABILITY_CONFLICT`; ordered closure does not silently pick a winner.
   - An explicit project full-definition overlay may replace the closure definition only when the project config names the source/provenance intentionally; an enable/disable toggle never changes the definition.
3. Include Card names, versions, and binding summaries in errors, never headers/env values.
4. Verify inactive roots still contribute nothing.

### Task 2.3: Add release and artifact leak gates

**Files:**
- Create: `scripts/verify-mcp-secret-contract.ts`
- Modify: `scripts/verify-release-readiness.ts`
- Test: `test/scripts-verify-mcp-secret-contract.test.ts`

**Steps:**

1. Scan packaged registries, Card fixtures, docs examples, generated test artifacts, and portable inventory fixtures for prohibited literal credential patterns.
2. Assert known placeholder forms are symbolic references, not realistic token fixtures.
3. Ensure release output contains counts/paths only and never matched file content.
4. Run `bun run verify:release --json` and expect the new independent MCP secret-contract gate to pass.

### PR 2 completion gate

- All MCP ingestion paths enforce the same secret contract.
- Same-ID conflicts never silently overwrite.
- Diagnostics and errors are redaction-tested.
- Rotate the exposed real Context7 and Browserbase credentials before PR 8; record rotation only as redacted evidence.

---

## PR 3 — Versioned target bindings and fail-closed native adapters

### Task 3.1: Detect installed target generations without mutating them

**Files:**
- Create: `cli/core/target-client-version.ts`
- Modify: `cli/core/targets.ts`
- Modify: `cli/core/process.ts`
- Test: `test/core-target-client-version.test.ts`

**Steps:**

1. Add injectable executable resolution and `--version` probes for `claude`, `codex`, `cursor-agent`/`agent`, and `opencode`/`opencode2`.
2. Return `missing`, `detected`, `unparseable`, or `probe-failed`; do not treat missing clients as version `0`.
3. Cache only within one command execution. Do not persist machine observations in immutable Card state.
4. Add fixture executables to prove version parsing and timeouts without invoking real clients in CI.

### Task 3.2: Extract one adapter module per target generation

**Files:**
- Create: `cli/core/mcp-adapters/types.ts`
- Create: `cli/core/mcp-adapters/claude.ts`
- Create: `cli/core/mcp-adapters/codex.ts`
- Create: `cli/core/mcp-adapters/cursor.ts`
- Create: `cli/core/mcp-adapters/opencode-v1.ts`
- Create: `cli/core/mcp-adapters/opencode-v2.ts`
- Create: `cli/core/mcp-adapters/index.ts`
- Modify: `cli/core/mcp.ts`
- Modify: `cli/core/sync.ts`
- Test: `test/core-mcp-adapters.test.ts`
- Test: existing `test/core-mcp-headers.test.ts`, `test/core-mcp-sync.test.ts`, `test/sync-mcp.test.ts`

**Adapter contract:**

```ts
export interface McpTargetAdapter {
  id: string;
  target: TargetName;
  supportedClientVersions: string;
  resolve(binding: McpConnectionBinding): AdapterResolution;
  render(serverName: string, resolution: AdapterResolution): Record<string, unknown>;
  validatePolicy(policy: McpConnectionBinding["policy"]): PolicyTranslation;
}
```

**Steps:**

1. Move current rendering logic without semantic changes into Claude, Codex, Cursor, and OpenCode V1 adapters.
2. Implement OpenCode V2 separately (`mcp.servers`, `disabled`, V2 OAuth field names); never infer V2 merely from a documentation URL.
3. Add Codex support for `env_http_headers`, tool lists, required, timeouts, and approval policy.
4. Add Claude OAuth object/scopes/callback fields only where the installed Claude version supports them.
5. Keep Cursor policy/auth fields limited to behavior proven by official docs or fixtures; unknown precedence remains a compatibility warning.
6. For every adapter, return `exact`, `degraded`, or `unsupported`. A required policy in `degraded` state blocks projection.
7. Preserve the PR 1 V1 snapshots under the installed-version adapters.

### Task 3.3: Make binding selection part of effective state and ambient policy

**Files:**
- Create: `cli/core/mcp-binding-resolution.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/ambient-policy.ts`
- Modify: `cli/core/ambient-capabilities.ts`
- Modify: `cli/core/diagnostics.ts`
- Test: `test/core-mcp-binding-resolution.test.ts`
- Test: `test/core-ambient-policy.test.ts`
- Test: `test/core-diagnostics-sections.test.ts`

**Steps:**

1. Resolve active capability names before target bindings; resolve bindings separately for each enabled target.
2. Report missing/ambiguous/native-only/unsupported bindings without flattening them into one `activeServers` map.
3. Classify ambient collisions against the rendered target binding, not the logical capability object.
4. Add target adapter ID and detected version to `status --json`, `doctor --json`, and `mcp list --json`.
5. Block a write before any projection mutation when selected target binding resolution is ambiguous or unsupported.

### Task 3.4: Build the golden native-config corpus

**Files:**
- Create: `test/fixtures/mcp-projection/{claude,codex,cursor,opencode-v1,opencode-v2}/`
- Create: `test/scenarios-mcp-projection-matrix.test.ts`

Cover stdio, remote OAuth, pre-registered OAuth, bearer env, static nonsecret headers, scope/tool policy, optional/required, disabled, unsupported header, native-only, and unknown target-version cases. Assert parsing and semantic snapshots, not fragile formatting alone.

### PR 3 completion gate

- Current installed target generations reproduce existing valid output.
- OpenCode V1 and V2 cannot be confused.
- Unsupported semantics block before write.
- Effective state and collision policy use the same selected binding.
- `bun test ./test/`, `bun run typecheck`, and `bun run verify:release` pass.

---

## PR 4 — Read-only native discovery and explicit adoption

### Task 4.1: Implement secret-safe native scanners

**Files:**
- Create: `cli/core/mcp-discovery/types.ts`
- Create: `cli/core/mcp-discovery/claude.ts`
- Create: `cli/core/mcp-discovery/codex.ts`
- Create: `cli/core/mcp-discovery/cursor.ts`
- Create: `cli/core/mcp-discovery/opencode.ts`
- Create: `cli/core/mcp-discovery/index.ts`
- Modify: `cli/commands/scan.ts`
- Test: `test/core-mcp-discovery.test.ts`
- Test: `test/commands-scan.test.ts`

**Discovery result:**

```ts
interface McpDiscoveryCandidate {
  candidateId: string;
  target: TargetName;
  nativeScope: "project" | "user" | "local" | "plugin" | "connector";
  serverName: string;
  sourcePath?: string;
  sourceFingerprint: string;
  classification:
    | "adoptable"
    | "secret-bearing"
    | "native-only"
    | "duplicate"
    | "conflicting"
    | "malformed";
  normalizedCapability?: McpCapabilityV2;
  credentialPresentNotCaptured: boolean;
  reasons: string[];
}
```

**Steps:**

1. Parse documented user/project files using isolated `homeDir`/`cwd` inputs.
2. Observe plugin/connector entries as non-portable sources; do not crawl token stores or client databases.
3. Fingerprint canonical nonsecret structure plus source file bytes without emitting raw contents.
4. Replace every literal credential value with an absent secret reference and `credentialPresentNotCaptured:true` before constructing output.
5. `drwn scan` remains read-only. Add `--target`, `--scope machine|project|all`, and `--json`; no `--write`, `--fix`, or `--adopt` flag.
6. Characterize malformed JSON/TOML and unreadable files as candidates/errors without aborting unrelated target scans.

### Task 4.2: Add deterministic adoption plans

**Files:**
- Create: `cli/core/mcp-adoption.ts`
- Create: `cli/core/mcp-adoption-journal.ts`
- Create: `cli/commands/mcp/adopt.ts`
- Modify: `cli/index.ts`
- Test: `test/core-mcp-adoption.test.ts`
- Test: `test/commands-mcp-adopt.test.ts`

**Command contract:**

```text
drwn scan --json
drwn mcp adopt <candidate-id> --card @scope/name [--machine|--project] --dry-run
drwn mcp adopt <candidate-id> --card @scope/name [--machine|--project] --yes
```

**Steps:**

1. Re-scan and require the candidate's source fingerprint to match; stale candidates fail `MCP_ADOPTION_SOURCE_CHANGED`.
2. Dry-run returns exact Card source and intent changes without writing.
3. Real adoption creates or updates a V2 Card source through existing Card mutation transactions and applies the source secret validator.
4. Adoption does not modify the native source or copy OAuth credentials.
5. A literal-secret candidate requires credential rotation/removal or an explicit symbolic environment mapping; never offer “copy anyway.”
6. Machine adoption selects the resulting immutable published Card only after Card publication/pinning; project adoption follows existing Card apply/Worker rules rather than injecting an unpinned source into committed state.

### Task 4.3: Implement adoption-by-reference ownership

**Files:**
- Modify: `cli/core/write-record.ts`
- Modify: `cli/core/projection-ownership.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/diagnostics.ts`
- Test: `test/core-mcp-adoption-ownership.test.ts`

Add ownership states `unmanaged`, `adopted`, `projected`, `conflicted`, and `partial`. An identical pre-existing native entry may be adopted without first overwriting it; its canonical target hash becomes the initial owned hash. Different same-ID entries remain conflicts under Task 83 policy.

### PR 4 completion gate

- Scan is provably zero-write.
- Scan/adoption output contains no secret values.
- Adoption refuses source drift and native-file mutation.
- Identical existing config can become managed without a forced destructive first write.

---

## PR 5 — Explicit machine capability Cards

### Task 5.1: Approve and implement machine schema V2

**Files:**
- Modify: `cli/core/types.ts`
- Modify: `cli/core/machine-config.ts`
- Create: `cli/core/machine-card-pins.ts`
- Test: `test/core-machine-config.test.ts`
- Test: `test/core-machine-card-pins.test.ts`

**Target machine shape:**

```json
{
  "schema": "drwn.machine",
  "schemaVersion": 2,
  "policy": {},
  "capabilities": {
    "profile": null,
    "cards": [
      {
        "name": "@darwinian/notion",
        "version": "2.0.0",
        "integrity": "sha256-...",
        "source": "git+https://...#v2.0.0"
      }
    ],
    "skills": [],
    "mcpServers": []
  }
}
```

**Steps:**

1. Add strict immutable Card pin validation; reuse Card store integrity verification rather than creating a second artifact format.
2. Add a one-time locked V1→V2 migration that preserves profile and explicit loose selections and initializes `cards:[]`. This is supported-state migration, not prototype recovery.
3. Never include machine Card pins in Task 82 inventory transfer; they are machine intent, already excluded by contract.
4. Machine Card pins are independent capability Cards, not a Worker stack. They do not create a machine `activeWorker` and cannot be inherited by project locks.

### Task 5.2: Declare machine eligibility and consent

**Files:**
- Modify: `cli/core/card-manifest.ts`
- Modify: `cli/core/card-publish-guardrail.ts`
- Create: `cli/core/machine-card-consent.ts`
- Test: `test/core-machine-card-consent.test.ts`
- Test: `test/core-card-publish-guardrail.test.ts`

Add `machine: { eligible: true }` to Card manifests. A machine-eligible Card may contribute only explicitly supported machine-safe skills and MCP capability definitions; hooks, instructions, persona, beliefs, memory, and project extensions are ignored and reported, not projected globally. First activation requires a content summary and explicit consent, including exact stdio commands and requested OAuth scopes.

### Task 5.3: Add machine Card commands and resolver

**Files:**
- Create: `cli/commands/machine/card.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/defaults.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/inventory-references.ts`
- Modify: `cli/core/diagnostics.ts`
- Test: `test/commands-machine-card.test.ts`
- Test: `test/core-project-machine-isolation.test.ts`
- Test: `test/scenarios-machine-card-mcp.test.ts`

**Command contract:**

```text
drwn machine card list|show
drwn machine card add <card-ref> [--dry-run]
drwn machine card update <card-name> [--to <ref>] [--dry-run]
drwn machine card remove <card-name> [--dry-run]
```

**Steps:**

1. Resolve and pin immutable published Card bytes using existing trusted-source policy.
2. Derive machine MCP capabilities from selected Cards plus the existing profile and explicit loose selections.
3. Fail same-ID incompatible Card/profile/loose definitions with provenance; identical definitions deduplicate.
4. Keep loose `machine mcp` and `machine skill` commands as transitional escape hatches, but mark their origin `standalone`, not Card-based.
5. Prove project output is byte-identical when machine Cards change.
6. `drwn write --root` projects the machine Card result through PR 3 bindings; normal project `drwn write` does not.

### Task 5.4: Update Operator skills and machine documentation

**Files in `/Users/pureicis/dev/darwinian-cards`:**
- Modify: `cards/operator/skills/manage-machine-capabilities/SKILL.md`
- Modify: `cards/operator/skills/manage-machine-inventory/SKILL.md`
- Modify: `cards/operator/card.json` with a semver bump after tests

**Files in this repo:**
- Modify: `docs-docusaurus/docs/concepts/layered-model.md`
- Modify: `docs-docusaurus/docs/concepts/mcp-servers.md`
- Modify: `docs-docusaurus/docs/concepts/local-store.md`

Document Card-based machine intent as preferred, standalone machine inventory as a lower-level capability source, and project isolation as unchanged.

### PR 5 completion gate

- A clean isolated home can pin a provider Card, run `drwn write --root`, and receive native config without standalone MCP inventory.
- Removing the Card removes only unchanged drwn-owned projections.
- Project locks/output never inherit machine Cards.
- Machine V1 migrates losslessly under lock.

---

## PR 6 — Layered MCP status, auth handoff, and safe probes

### Task 6.1: Implement the readiness state model

**Files:**
- Create: `cli/core/mcp-readiness.ts`
- Create: `cli/core/mcp-client-observers/types.ts`
- Create: `cli/core/mcp-client-observers/{claude,codex,cursor,opencode}.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/commands/mcp/list.ts`
- Test: `test/core-mcp-readiness.test.ts`
- Test: `test/commands-mcp.test.ts`

**Readiness dimensions:** `discovered`, `parsed`, `projected`, `reachable`, `initialized`, `authenticated`, `approved`, `policyAllowed`, `toolsLoaded`, `identityKnown`. Each is `yes`, `no`, `pending`, `blocked`, `unknown`, or `not-applicable`, with evidence source and timestamp.

Observers may invoke documented read-only status commands with strict timeouts. They may not parse token stores, log environment values, approve servers, or start OAuth.

### Task 6.2: Add explicit client-native auth handoff

**Files:**
- Create: `cli/core/mcp-auth-handoff.ts`
- Create: `cli/commands/mcp/auth.ts`
- Modify: `cli/index.ts`
- Test: `test/core-mcp-auth-handoff.test.ts`
- Test: `test/commands-mcp-auth.test.ts`

**Command contract:**

```text
drwn mcp auth <capability-id> --target claude|codex|cursor|opencode
drwn mcp auth <capability-id> --target ... --print-command
```

`--print-command` is read-only. Without it, drwn launches the documented native login command or prints UI instructions. It never receives, proxies, or stores the returned token. Pre-registered OAuth secrets are resolved only through the target's supported secure input mechanism; if a target requires a literal config secret, projection is unsupported.

### Task 6.3: Add safe static and connection probes

**Files:**
- Create: `cli/core/mcp-probe.ts`
- Create: `cli/commands/mcp/probe.ts`
- Modify: `cli/index.ts`
- Test: `test/core-mcp-probe.test.ts`
- Test: `test/commands-mcp-probe.test.ts`

**Command contract:**

```text
drwn mcp probe <id> --target <target>                 # static/client-status only
drwn mcp probe <id> --target <target> --connect       # initialize + tools/list
drwn mcp probe <id> --target <target> --identity      # configured identity tool only
drwn mcp probe <id> --target <target> --read-only-canary
```

`--connect`, `--identity`, and `--read-only-canary` require explicit flags because stdio startup and provider calls may have effects or cost. Never call an arbitrary tool. A provider Card must declare the exact identity/canary tool and expected read-only classification before those modes are available.

### Task 6.4: Build a disposable reference MCP/OAuth fixture

**Files:**
- Create: `test/fixtures/reference-mcp-server.ts`
- Create: `test/fixtures/reference-oauth-server.ts`
- Create: `test/scenarios-mcp-auth-readiness.test.ts`

Exercise unauthenticated, 401 metadata discovery, PKCE, pre-registered client, expired/revoked token, wrong audience, empty tool list, delayed startup, and read/write/destructive tool annotations. Tokens must be synthetic and assertions must verify they never appear in drwn output or persisted state.

### PR 6 completion gate

- Auth remains target-native.
- Readiness distinguishes projected from usable.
- Connect and tool probes are opt-in and timeout-bounded.
- Identity remains unknown unless a safe provider mechanism proves it.

---

## PR 7 — Provider capability Cards and built-in registry repair

### Task 7.1: Migrate built-in registry records to V2

**Files:**
- Modify: `registry/mcp-servers.json`
- Modify: `registry/config.json` only where activation defaults change explicitly
- Test: `test/sync-mcp.test.ts`
- Test: `test/core-mcp-adapters.test.ts`
- Test: `test/registry-mcp-contract.test.ts` (create)

**Required corrections:**

1. Change Parallel Search to `https://search-mcp.parallel.ai/mcp`; keep Task at `https://task-mcp.parallel.ai/mcp`.
2. Prefer hosted Context7 HTTP as the primary binding; retain exact-pinned stdio only as a fallback if required.
3. Replace `@latest`/broad executable ranges in production Cards with exact package versions and runtime identity.
4. Encode Notion as client-managed OAuth and human-in-loop; do not advertise bearer/headless support.
5. Encode Slack as pre-registered OAuth with target callback/client-secret requirements and no DCR assumption.
6. Do not put Google preview servers into non-optional defaults.

### Task 7.2: Publish focused provider Cards in `darwinian-cards`

**Files in `/Users/pureicis/dev/darwinian-cards`:**
- Modify/migrate: `cards/notion/card.json`
- Create or split: `cards/context7/`, `cards/chrome-devtools/`, `cards/parallel-search/`, `cards/parallel-task/`, `cards/figma/`, `cards/slack/`
- Create experimental: `cards/google-workspace/` with separate product capabilities/bindings
- Modify: `cards/personal-harness/card.json` and `cards/live-context-extended/card.json` to compose focused Cards instead of copying definitions
- Add per-Card tests/doctor evidence following existing Card repository conventions

Each provider Card declares supported target/version bindings, auth intent, optionality, machine eligibility, scopes/policy, and safe probes. Figma must mark unsupported clients as native-only/provider-allowlist; Google must be experimental/preview; Chrome DevTools must expose its local runtime and browser-profile prerequisites.

### Task 7.3: Migrate the eight known V1 Card sources

Inventory as of drafting:

- `@curation-labs/live-context-extended`
- `@darwinian/drwn-command-bridge`
- `@darwinian/notion`
- `@remyjkim/ai-cloner-website`
- `@remyjkim/fal`
- `@remyjkim/notion-agent`
- `@remyjkim/notion-token`
- `@remyjkim/personal-harness`

Migrate canonical sources, bump versions according to structural change policy, publish immutable replacements, and update dependent Blueprints. Do not mutate already-published versions. Remove V1 warnings only after every active project lock has moved to migrated Cards.

### PR 7 completion gate

- Provider endpoint/auth facts are linked to primary official sources in Card metadata/docs.
- Built-in registry and Card definitions agree canonically.
- Provider Cards contain no secrets and no `@latest` runtime commands.
- Legacy V1 remains readable for old locks but new authoring emits V2 only.

---

## PR 8 — Real-client compatibility and provider canaries

### Task 8.1: Automate isolated client schema/precedence tests

**Files:**
- Create: `scripts/verify-mcp-client-matrix.ts`
- Create: `test/scenarios-mcp-real-client-fixtures.test.ts`
- Modify: `scripts/verify-release-readiness.ts`
- Create: `.ai/tasks/clNNNN_mcp_real_client_evidence.md` only after Issue ID assignment

Use isolated home directories/config paths wherever the client supports them. Never point tests at the operator's real home. Cover:

- Claude local/project/user whole-entry precedence and project approval pending state.
- Codex user/project field layering and cross-transport rejection.
- Cursor global/project same-ID semantics, approval, and env expansion—the unresolved release blocker.
- OpenCode 1.x direct `mcp` schema and V2 `mcp.servers` schema using their matching binaries.

If a client cannot be isolated safely, provide a scripted manual runbook and record exact version/redacted output. Do not “test” by modifying the live user config.

### Task 8.2: Run the direct-provider canary ladder

Run one target at a time in this order:

1. Context7 hosted HTTP: project, list tools, one documentation lookup.
2. Chrome DevTools exact-pinned stdio: isolated browser profile, list tools, open a local static page.
3. Notion: authenticate separately in each supported target, verify identity/workspace if available, perform a read-only search.
4. Parallel Search and Task: OAuth or environment bearer according to binding; run minimal-cost read-only operations.
5. Figma: Claude, Codex, Cursor only; verify `whoami` and a read operation.
6. Slack: registered development app per target/callback; request least-privilege search scopes; verify workspace identity and search only.
7. Google Workspace: preview sandbox account/project; Gmail/Drive/Calendar separately; no production account until preview behavior passes.

For every `(provider,target)` record: client version, adapter ID, binding, projection hash, auth state, approval state, tools count/names hash, identity observation, read-only canary, latency, failure, and cleanup. Never record tokens, authorization URLs with codes, secret-bearing headers, or full private tool results.

### Task 8.3: Establish the supported matrix

Convert canary results into a checked-in compatibility table used by bindings and docs. A combination becomes supported only after static render, native parse, auth, tools list, and canary all pass. `projected but untested` is not supported.

### PR 8 completion gate

- Cursor precedence is empirically resolved for the supported Cursor version.
- At least Context7, Chrome DevTools, Notion, and Parallel pass on their intended target set.
- Figma/Slack/Google unsupported combinations fail closed with useful reasons.
- Exposed Context7/Browserbase credentials have been rotated.

---

## PR 9 — Controlled native cutover and unmanaged-config enforcement

### Task 9.1: Add managed-only policy and cutover reports

**Files:**
- Modify: `cli/core/machine-config.ts`
- Modify: `cli/core/project.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `cli/commands/scan.ts`
- Test: `test/commands-doctor.test.ts`
- Test: `test/scenarios-mcp-managed-only.test.ts`

Add opt-in policy `mcp.requireManaged: true` at machine or project scope. Under this policy, unmanaged duplicate/adoptable/conflicting native entries are diagnostic errors; native-only capabilities remain explicit exceptions with reason and target. Do not auto-delete them.

### Task 9.2: Execute one-server/one-target cutovers

For each existing native entry:

1. Freeze and redact the discovery report.
2. Create/pin the provider Card.
3. Preview the target projection.
4. Adopt an identical entry or resolve the conflict without `--force` where possible.
5. Authenticate through the target-native flow.
6. Observe approval, tools, and identity.
7. Run the Card-declared read-only canary.
8. Disable/remove the old connector or foreign config through its owning client.
9. Re-scan and require one managed effective definition.
10. Run `drwn write --dry-run`, `drwn write`, `drwn status --json`, and `drwn doctor --json`.
11. Record rollback instructions before moving to the next target.

Recommended live order: duplicate direct Notion → Context7 → Chrome DevTools → Parallel → Figma → Slack → Google. Handle `claude_design`, Codex Node REPL, Computer Use, and other host-native capabilities last as documented exceptions or deliberate removals.

### Task 9.3: Retire obsolete migration surfaces

**Files:**
- Update or retire the installed `import-mcp-from-claude` skill, whose documented `drwn library` commands are obsolete.
- Modify: `docs-docusaurus/docs/guides/migrating-hand-edited-configs.md`
- Modify: `docs-docusaurus/docs/troubleshooting/credential-errors.md`
- Modify: `docs-docusaurus/docs/troubleshooting/ownership-conflicts.md`
- Modify: `docs-docusaurus/docs/concepts/mcp-servers.md`

Teach `scan → adopt → publish/pin Card → write → auth → probe → remove old source`. Remove any instruction that copies OAuth tokens, writes literal secrets, or treats connector authentication as transferable.

### PR 9 completion gate

- Every in-scope effective native MCP definition is either drwn-projected or an explicit native-only exception.
- `mcp.requireManaged` passes on the operator machine after redacted evidence capture.
- Removing/reinstalling projection from Card state is deterministic without credential copying.
- Rollback restores config bytes drwn wrote but makes no claim to undo OAuth logins, approvals, or administrator changes.

---

## Cross-cutting test matrix

| Layer | Required proof |
|---|---|
| Schema | Strict V2 validation; bounded V1 normalization; unknown fields rejected. |
| Security | Literal secrets rejected at every boundary; output/log/journal/backups redacted. |
| Resolution | One binding per target/version; ambiguity and unsupported policy fail closed. |
| Projection | Golden native configs for every adapter generation; parse-back succeeds. |
| Ownership | Identical adoption, drift, partial transaction, rollback, foreign preservation. |
| Isolation | Machine Cards never alter project desired bytes; inactive project roots contribute nothing. |
| Discovery | Zero writes; malformed targets isolated; source drift aborts adoption. |
| Authentication | Target-native login only; no tokens in drwn state; revoked/wrong-audience fixture coverage. |
| Readiness | Parsed/projected/authenticated/approved/tools/identity remain independent. |
| Runtime | Reference stdio/HTTP/OAuth server plus real-client/provider canaries. |
| Release | Full suite, typecheck, release verifier, packaged registry/Card contract. |

Focused command after each MCP PR:

```bash
bun test test/core-mcp-*.test.ts test/commands-mcp*.test.ts \
  test/commands-scan.test.ts test/core-effective-state*.test.ts \
  test/core-ambient-policy.test.ts test/core-mcp-drift.test.ts \
  test/sync-mcp.test.ts test/sync-mcp-compat.test.ts
bun run typecheck
```

Final CLI gate:

```bash
bun test ./test/
bun run typecheck
bun run verify:release
npm pack --dry-run --json
```

Card repository gates must be discovered from that repository's current instructions at execution time and recorded separately.

## Stable error codes to reserve

- `MCP_CAPABILITY_INVALID`
- `MCP_CAPABILITY_CONFLICT`
- `MCP_BINDING_AMBIGUOUS`
- `MCP_BINDING_UNSUPPORTED`
- `MCP_TARGET_VERSION_UNKNOWN`
- `MCP_SECRET_LITERAL`
- `MCP_SECRET_IN_URL`
- `MCP_DISCOVERY_SOURCE_INVALID`
- `MCP_ADOPTION_SOURCE_CHANGED`
- `MCP_ADOPTION_CREDENTIAL_REQUIRED`
- `MCP_ADOPTION_PARTIAL`
- `MCP_AUTH_HANDOFF_UNSUPPORTED`
- `MCP_PROBE_CONSENT_REQUIRED`
- `MCP_IDENTITY_UNKNOWN`
- `MCP_UNMANAGED_NATIVE_DEFINITION`

## Rollback and recovery contract

- Schema PRs retain read support for immutable V1 Card locks during the migration window.
- Projection writes use existing atomic write-record machinery, per-server hashes, and foreign-entry preservation.
- Adoption journals hashes and per-target states only; no native config bytes or secrets are copied into Card state.
- A multi-target run may end `partial`; rerun resumes verified pending targets or rolls back only drwn-written files.
- OAuth login, logout, approval, connector disablement, and admin policy are external irreversible/independent actions. Runbooks must list their client-native reversal steps; drwn must never claim transactional rollback for them.
- Unknown client major/schema changes stop projection and preserve the last known native file.

## Explicit non-goals

- Building or operating a central MCP gateway.
- Sharing one OAuth token among clients.
- Importing client token stores or keychain contents.
- Replacing client trust dialogs, approvals, or administrator policy.
- Making Claude-only/Codex-only host capabilities portable.
- Automatically deleting platform connectors or foreign native config.
- Adding every possible MCP client; the first contract is Claude, Codex, Cursor, OpenCode.
- Using mutable package tags such as `latest` as reproducible Card runtime identity.
- Treating a successful config render as runtime/provider validation.

## Stop conditions requiring a new architecture decision

Stop and return to G1/G2 review if:

1. A supported provider requires drwn to collect or store an OAuth token.
2. A client cannot represent required least-privilege policy without broadening it.
3. Cursor or another client merges same-ID config in a way that can combine credentials/transports unsafely and cannot be avoided by unique names or scope policy.
4. Machine capability Cards cannot reuse immutable Card verification without introducing a second lock/distribution substrate.
5. A real provider rejects an otherwise supported client by allowlist/entitlement.
6. A gateway appears necessary before direct provider canaries have been attempted and the exception documented.
7. The migration would require mutating already-published Card bytes.
8. The present dirty checkout cannot be isolated into a clean worktree without losing user-owned changes.

## Definition of done

- [ ] Issue identity assigned; draft renamed to canonical `clNNNN_..._task_plan.md`; G2 passed.
- [ ] V2 capability/binding schema implemented with bounded V1 normalization.
- [ ] Secret and duplicate-definition holes closed at all Card boundaries.
- [ ] Versioned adapters pass golden and installed-client tests.
- [ ] `drwn scan` is read-only and `drwn mcp adopt` is explicit/transactional.
- [ ] Machine capability Cards are preferred global activation authority and remain project-isolated.
- [ ] Auth handoff is client-native; layered readiness and safe probes ship.
- [ ] Provider Cards and current endpoints are published without mutable runtime tags.
- [ ] Real-client compatibility matrix passes required canaries.
- [ ] Existing native MCP setup is cut over one target at a time with rollback evidence.
- [ ] Remaining native-only exceptions are explicit and justified.
- [ ] `mcp.requireManaged` passes for the intended strict environment.
- [ ] Full CLI/Card/release gates pass and GATE 3 evidence is recorded without secrets.

## Recommended execution handoff

After Issue ID assignment and G2 approval, execute each PR unit in a separate clean worktree/session with `executing-plans`. PRs 1-3 should remain serial because they establish the shared types and adapters. PRs 4 and 5 can be assigned independently after PR 3, then integrated before PR 6. Real-client and provider work in PR 8 remains human-in-the-loop and should not be delegated to unattended automation.
