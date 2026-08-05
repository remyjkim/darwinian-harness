# OpenCode Target Support — Target Architecture

Design for adding OpenCode (`opencode.ai`, terminal-first agent by Anomaly) as a fourth
downstream target of the drwn harness CLI, alongside `claude`, `codex`, and `cursor`.

**Inputs:**
- `.ai/analyses/121_opencode-configuration-guide.md` — OpenCode's native surfaces (MCP,
  Plugins, Skills, config precedence). External research; native-behavior claims below that
  come only from this doc are marked *(121)*.
- `.ai/analyses/120_cursor-configuration-guide.md` — Cursor's native surfaces, used here as
  the alignment baseline for the closest prior-art target.
- `.ai/analyses/82_drwn-portable-multi-surface-write-path-target-architecture.md` — the
  descriptor-table architecture this design extends.
- `.ai/analyses/100_*_card_instructions_projection_gap_analysis.md` and
  `101_*_card_spine_delivery_design_options_analysis.md` — the unresolved instructions/spine
  projection decision that constrains what OpenCode support can promise today.
- Codebase investigation (2026-07-18), file:line citations against current `main`.

---

## 1. Current-state architecture summary

### 1.1 Target descriptor table

`cli/core/targets.ts:18-40` is the single source of truth:

| Target | surfaces | mcpFormat | hookRuntime |
| --- | --- | --- | --- |
| claude | claude-code, cowork | json-merge | claude-code |
| codex | codex | toml-merge | codex |
| cursor | cursor | json-standalone | null |

`TargetName` is the closed union at `cli/core/types.ts:7`. Per-target settings live in
`CanonicalConfig.targets` (`types.ts:34-40,52`): `{ enabled, configPath, userMcpPath?,
format, mcpKey }`, seeded from `registry/config.json`, overridable by machine policy
(`machine-config.ts:26-38`) and per-project config (`types.ts:161`).

### 1.2 Projection surfaces and ownership

`ProjectionSurface = "worker" | "mcp" | "skill" | "hook"` (`write-record.ts:32`).
Ownership validity (`write-record.ts:82-88`): mcp → claude|codex|cursor; skill →
claude|codex; hook → claude|codex|mastra. All writes are tracked in write-records with
`managed-fields` (per-field hashes), `managed-content` (whole file), or
`managed-directory` (tree hash) kinds; drift throws without `--force`
(`sync.ts:156-190,246-258`).

### 1.3 Per-target capability matrix (as implemented)

| Surface | claude | codex | cursor |
| --- | --- | --- | --- |
| MCP machine | merge into `~/.claude.json`, per-server hashes (`sync.ts:518-545`) | merge into `~/.codex/config.toml` (`sync.ts:548-564`) | merge into `~/.cursor/mcp.json`, per-server hashes (`sync.ts:567-585`) |
| MCP project | standalone `.mcp.json`, managed-content | merge `.codex/config.toml` | merge `.cursor/mcp.json`, per-server hashes |
| Skills | `.claude/skills/` (`skills.ts:276-314`) | `.codex/skills/` | none (forbidden, `write-record.ts:87`, `skills.ts:50`) |
| Hooks | composer + `settings.json` hooks (`sync-hooks.ts:209-248`) | composer + `.codex/hooks.json` (`sync-hooks.ts:254-277`) | none (`hookRuntime: null`) |
| Instructions/persona | none | none | none |

Instructions projection is unimplemented for **all** targets — that is the doc-100 gap and
is target-independent. Card hook policies are already runtime-agnostic:
`Runtime = "claude-code" | "codex" | "mastra"` (`hook-policy/types.ts:4`), and
`ToolPolicyDecision` is `allow (updatedInput, additionalContext) | deny (reason) | ask |
log-only`.

---

## 2. Cursor alignment audit (prior art for scoping)

Checked against `120_cursor-configuration-guide.md`. Verdict: **aligned for the surface it
claims (MCP at both scopes); hooks/skills/rules deliberately out of scope and documented as
such** (`docs/cli-quickref.md:275`: "Cursor has no hook runtime in this release").

Aligned:
- Paths match Cursor-native exactly: project `.cursor/mcp.json`, global `~/.cursor/mcp.json`
  (`paths.ts:75`, `registry/config.json`), top-level `mcpServers` key.
- Env interpolation rewritten to Cursor's `${env:VAR}` syntax (`mcp.ts:96-98`).
- Despite the `json-standalone` format label, the writer is a per-server **merge**
  (`mergeCursorConfigText`, `mcp.ts:447-494`): foreign user-authored servers are preserved,
  only drwn-owned servers are hash-tracked and reconciled. This matches Cursor-native
  expectations (users hand-edit `mcp.json`) better than a wholesale overwrite would.

Gaps / discrepancies found (relevant to the OpenCode design):
1. **Skills are implicit, not projected.** Cursor discovers `.claude/skills/`,
   `.codex/skills/`, and their `~` equivalents (120 §3.1), so drwn skills reach Cursor *only
   because* the claude/codex targets project them. On a cursor-only machine (claude+codex
   disabled) no skill surface Cursor reads is populated. The same compat-discovery question
   recurs for OpenCode (§4.3).
2. **Hooks are now feasible.** Cursor 1.7+ hooks (`hooks.json`) output
   `permission: allow|deny|ask` plus `updated_input`/`additional_context` — nearly 1:1 with
   drwn's `ToolPolicyDecision`. `hookRuntime: null` is a v1 scoping choice, not a technical
   blocker. (Out of scope here; noted as follow-up.)
3. **Remote server shape includes `type`.** `toCursorServerConfig` emits
   `{ type: "http"|"sse", url, headers }` (`mcp.ts:169-173`); 120 §1.2 documents only
   `url`/`headers` for remote servers. Almost certainly tolerated, but unverified against a
   real Cursor install. → verify item.
4. **Ambient collision model may not match documented Cursor behavior.**
   `CURSOR_PROJECT_MERGES_USER` / `CURSOR_PROJECT_TRANSPORT_OVERRIDE`
   (`ambient-policy.ts:215-225`) model field-level inheritance of same-ID user fields into
   project definitions; 120 §1.1 says project **wins wholesale**. These codes only produce
   warnings/remediation text, so impact is advisory, but the model should be empirically
   verified and corrected if wrong. → verify item.
5. Minor: no diagnostics for Cursor's ~40-active-tool guidance (120 §1.5) when many servers
   are enabled. Optional doctor enhancement.

---

## 3. OpenCode surface model

What OpenCode natively reads *(121)*:

| Surface | Project | Global | Notes |
| --- | --- | --- | --- |
| Config + MCP | `opencode.json` at project root, `mcp` block | `~/.config/opencode/opencode.json` | Later sources override earlier (global < project). `opencode.jsonc` also accepted. |
| Skills | `.opencode/skills/<n>/SKILL.md`, plus compat: `.claude/skills/`, `.agents/skills/` | `~/.config/opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/` | Name regex `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤64 chars, unique across locations |
| Hooks | Plugins: `.opencode/plugins/*.{js,ts}` | `~/.config/opencode/plugins/` | In-process JS/TS modules, not spawned commands |
| Instructions | `AGENTS.md` | — | Rules/routing guidance |

Key structural differences from existing targets:
- MCP config is **nested inside the shared config file** (`mcp` key of `opencode.json`),
  like codex's `config.toml` — not a dedicated MCP file like cursor. The file also carries
  user-owned keys (`$schema`, `plugin`, `tools`, `agent`, `permission`, …) that must be
  preserved byte-for-byte outside the servers drwn owns.
- Env interpolation syntax is `{env:VAR}` — not cursor's `${env:VAR}`.
- Local servers take a single `command` **array** (command + args combined) and
  `environment` (not `env`).
- Hooks are in-process plugin modules (closest existing precedent: the mastra emitter,
  `emit-mastra-composer.ts`), not stdin/stdout command hooks.

---

## 4. Design decisions

### D1 — Descriptor and config entry

```ts
// cli/core/targets.ts
opencode: {
  name: "opencode",
  family: "opencode",
  surfaces: ["opencode"],
  mcpFormat: "json-merge",
  hookRuntime: null,        // Phase 3 flips to "opencode"
}
```

```jsonc
// registry/config.json
"opencode": {
  "enabled": false,          // see D2
  "configPath": "~/.config/opencode/opencode.json",
  "format": "json-merge",
  "mcpKey": "mcp"
}
```

`mcpFormat` **reuses `"json-merge"`** rather than adding a fourth union member: all real
dispatch is by target name (`renderMcpServerForTarget`, `syncMcp` branches), `mcpKey`
already parameterizes the top-level key, and reuse avoids churn in
`machine-config.ts:26-38` and `types.ts:38`. The format field is descriptive, not
behavioral. (Rejected: `"json-nested-merge"` — adds schema surface for zero behavior.)

New surface value `"opencode"` joins the `Surface` union (`targets.ts:7`).

### D2 — Default `enabled: false` (deviation from precedent; needs Remy's sign-off)

claude/codex/cursor all default to enabled, so today every `drwn write` materializes
`.codex/` and `.cursor/` into every project. For OpenCode the equivalent write lands
`opencode.json` **at the project root** — a prominent, conventionally user-committed file.
Creating it in projects whose owners don't use OpenCode is intrusive in a way dot-dir
writes are not. Recommendation: ship `enabled: false` in the packaged registry; users
opt in via machine policy (`machine.json` → `targets.opencode.enabled: true`) or project
config. If we later see adoption, flip the registry default in a release.

### D3 — MCP rendering (`toOpencodeServerConfig`, in `cli/core/mcp.ts`)

| RegistryServer | OpenCode output |
| --- | --- |
| `transport: "stdio"`, `command`, `args?`, `env?` | `{ "type": "local", "command": [command, ...args], "environment": {…}, "enabled": true }` |
| `transport: "http" \| "sse"`, `url`, `headers?` | `{ "type": "remote", "url": …, "headers": {…}, "enabled": true }` |
| `transport: "platform-provided"` | skipped (existing behavior for non-writable servers) |
| `startupTimeoutSec` (default 30 in codex path) | `"timeout": startupTimeoutSec * 1000` — always emit; OpenCode's 5000 ms default *(121)* is too tight for `npx` cold starts |
| `${VAR}` in env values / header values | rewritten to `{env:VAR}` (`toOpencodeEnvValue`, sibling of `toCursorEnvValue` at `mcp.ts:96-98`) |

Both `http` and `sse` map to `"remote"` — OpenCode has no transport subtype *(121)*.
`enabled: true` is written explicitly so a server disabled-by-default from an org's remote
config layer is deliberately activated (121 §1.1). OAuth config is omitted (OpenCode
auto-detects on 401); revisit only if auto-OAuth probing on API-key servers proves noisy.

### D4 — Merge and ownership: `mergeOpencodeConfigText`

Modeled on `mergeCursorConfigText` (`mcp.ts:447-494`), with the `mcp` key instead of
`mcpServers`:

- Parse existing `opencode.json`; operate **only** on the `mcp` object; all other keys
  (including `$schema`) pass through untouched. If the file is absent, seed
  `{ "$schema": "https://opencode.ai/config.json" }` per OpenCode convention.
- Per-server ownership hashes in the write-record, kind `managed-fields`, at **both**
  scopes (project root `opencode.json`; machine `~/.config/opencode/opencode.json` via
  `expandHomePath(configPath)` — the existing mechanism handles the XDG path with no new
  plumbing).
- Drift on an owned server → throw with the standard `--force` remediation; foreign
  servers preserved; owned-but-removed servers deleted only when their current content
  still matches the recorded hash (same reconciliation contract as cursor).
- Prep refactor: `claudeMcpServerHashKey` (`mcp.ts:219`) is already shared by cursor and
  would now serve three targets — rename to `mcpServerHashKey` (record-key namespace,
  not claude-specific). Small, mechanical, do it first.
- **`opencode.jsonc` guard:** if the project (or global dir) contains `opencode.jsonc`,
  drwn must not write a competing `opencode.json`. `JSON.parse` cannot round-trip JSONC
  comments, and precedence between the two filenames is undocumented. Behavior: skip the
  opencode MCP write with a warning + doctor finding ("migrate to opencode.json or manage
  MCP manually"). Revisit with a comment-preserving parser only if demand appears.

### D5 — Ambient collision policy

New reason codes in `ambient-policy.ts`, appended to the target chain at
`targetOrder: { …, opencode: 3 }`:

- `OPENCODE_PROJECT_OVERRIDES_USER` (warning) — same server ID in project and global
  `opencode.json`; project wins per OpenCode's later-source-overrides rule *(121 §0)*.
- Identical definitions → existing `AMBIENT_IDENTICAL`.

Unlike codex there is no fatal transport-collision case: the project definition replaces
the global one wholesale. `ambient-capabilities.ts` (`inspectAmbientMcpDefinitions`) gains
an opencode reader that extracts the `mcp` block from both scopes; it must tolerate a
JSONC file by reporting it as unreadable-with-warning rather than crashing.

Whether OpenCode's config merge is per-server-wholesale or deep-merges fields within a
same-ID server is **unverified** — same class of uncertainty as cursor finding §2.4.
Verify both empirically in one sitting (V2, §7).

### D6 — Skills: rely on compat discovery in Phase 1; explicit projection deferred

OpenCode already discovers `.claude/skills/` and `~/.claude/skills/` *(121 §3.1)*, so on
any machine with the claude target enabled (the default), drwn-projected skills reach
OpenCode with **zero new code** — the cursor precedent (§2.1).

Explicitly projecting to `.opencode/skills/` as well would make every shared skill visible
twice (`.claude/skills/x` + `.opencode/skills/x`); OpenCode requires names unique across
locations and its dedup behavior is undocumented *(121 §3.8)*. Do not create that hazard
by default.

Phase 1 ships a **doctor lint** instead: when the opencode target is enabled, warn for any
projected skill whose name violates OpenCode's regex `^[a-z0-9]+(-[a-z0-9]+)*$` (e.g.
dotted names like `foo.bak` are discoverable by claude but invisible or erroring in
OpenCode).

Explicit `.opencode/skills/` projection (with an `opencode-only` scope in
`SkillScope`/`BundleSkillEntry.scope`, `write-record.ts:87` extended to allow
skill → opencode) becomes Phase 2, gated on a real opencode-only-machine use case. This
mirrors how cursor shipped and keeps the ownership matrix honest.

Note: OpenCode also scans `~/.agents/skills/` and `.agents/skills/` *(121 §3.1)* — inside
drwn's own `~/.agents` home. drwn does not write there today (`paths.ts` uses
`~/.agents/packages/skills` + `~/.agents/library`), but any future writer must treat
`~/.agents/skills/` as an OpenCode-visible surface, not private storage.

### D7 — Hooks: new in-process plugin runtime (Phase 3)

Add `"opencode"` to `Runtime` (`hook-policy/types.ts:4`) and to `ORDERED_RUNTIMES`
(`runtime-selection.ts:14`); descriptor flips `hookRuntime: "opencode"`.

Unlike claude/codex (spawned command hooks over stdin/stdout), OpenCode plugins are
in-process ESM modules. Precedent: the mastra path already emits an in-process composer
(`emit-mastra-composer.ts`, `sync-hooks.ts:279-292`). New emitter
`emit-opencode-plugin.ts` generates:

- `.agents/drwn/generated/hooks/opencode/composer.mjs` — the bundled policy composition
  (reuses `bundle-composer.ts` with `target: "node"`; Bun runs node-target bundles fine).
- `.opencode/plugins/drwn-hooks.js` (project) / `~/.config/opencode/plugins/drwn-hooks.js`
  (machine) — a thin adapter, recorded as `managed-content`:

| drwn `ToolPolicyDecision` | OpenCode plugin behavior |
| --- | --- |
| `allow` + `updatedInput` | `tool.execute.before`: mutate `output.args` |
| `allow` + `additionalContext` | `tool.execute.after`: append to tool output (verify output mutability — V4) |
| `deny (reason)` | `throw new Error(reason)` — blocks the call |
| `ask` | **no native equivalent**; fail closed: `throw` with an "requires approval — approve via drwn or adjust opencode permission config" message |
| `log-only` | observe via `tool.execute.after`, no mutation |

The adapter also normalizes tool names before matching (OpenCode ids are lowercase —
`bash`, `read`, `edit` — vs the capitalized names drwn matchers were written against).
Mapping table lives in the adapter, not in author-facing policies.

`sync-hooks.ts` gains an opencode branch (config-file location, emitter call, managed-path
recording, `write-record` hook → opencode allowed). Session/stop/compaction events are out
of scope for the first runtime cut.

### D8 — Instructions / AGENTS.md: explicitly deferred

OpenCode's instruction surface is `AGENTS.md`. The instructions/spine projection decision
(docs 100/101) is unresolved for every target; OpenCode must not jump the queue. This
design only reserves the slot: when a Family-1/2/3 decision lands, the opencode descriptor
gains the chosen instruction surface alongside claude/codex. No opencode-specific
instruction work in Phases 1-3.

### D9 — Git hygiene and watch

- `git-hygiene.ts:20-23` currently ignores `.codex/` and `.cursor/` wholesale. For
  OpenCode: **never** ignore `opencode.json` (user-committed config drwn merely merges
  into). Ignore only the drwn-generated plugin file (`.opencode/plugins/drwn-hooks.js`)
  when Phase 3 lands — not `.opencode/` wholesale, since users legitimately commit their
  own plugins/skills/agents there. This is a deliberate break from the `.cursor/`
  precedent because ownership differs (drwn owns `.cursor/mcp.json`'s managed servers; it
  does not own `opencode.json`).
- `write-watch.ts:24-25` watch exclusions gain the generated plugin path only.

---

## 5. Implementation checklist (Phase 1, MCP-only)

Derived from the verified add-a-target touch points; every item is a small, testable diff.

1. Prep refactors (no behavior change):
   - `user-config.ts:36` — iterate `ALL_TARGET_NAMES` instead of the hardcoded
     `["claude", "codex", "cursor"]`.
   - `mcp.ts:219-229` — rename `claudeMcpServerHashKey` → `mcpServerHashKey` (+ call sites).
2. `cli/core/types.ts:7` — add `"opencode"` to `TargetName`.
3. `cli/core/targets.ts` — descriptor entry (D1); `Surface` union.
4. `registry/config.json` — target entry, `enabled: false` (D2).
5. `cli/core/machine-config.ts:34-38` — `opencode` in `targetsSchema`.
6. `cli/core/paths.ts:63-77` — `opencodeConfig: join(root, "opencode.json")` in
   `resolveToolPaths` (project scope only; machine scope resolves via
   `expandHomePath(configPath)` as with codex/cursor).
7. `cli/core/mcp.ts` — `toOpencodeServerConfig` (D3), `toOpencodeEnvValue`,
   `renderMcpServerForTarget` dispatch, `mergeOpencodeConfigText` (D4),
   `hashOpencodeManagedServers` if the shared helper doesn't fit directly.
8. `cli/core/sync.ts` — `machineMcpRecordPath` (`opencode.json` record key ~ line 83-87),
   `machineTargetConfigPath`/`managedPathAbsolute` routing (149-154),
   `planMachineManagedPaths` (104-140), `targetConfigPath` closure + opencode branch in
   `syncMcp` (498-586) including the `opencode.jsonc` guard, `previousOpencode` hash
   recovery (479-484 pattern).
9. `cli/core/write-record.ts:33,67,82-88` — `ProjectionTarget` + mcp ownership rule.
10. `cli/core/projection-ownership.ts:9` — target extract union.
11. `cli/core/ambient-policy.ts` + `ambient-capabilities.ts` — D5.
12. `cli/core/effective-state.ts:402-408,463-466` — declared paths + collision filter.
13. `cli/core/diagnostics.ts:730,855-878` — target recognized; config drift check for
    `opencode.json`; jsonc warning; skill-name lint (D6).
14. `cli/core/git-hygiene.ts`, `write-watch.ts` — D9.
15. `cli/commands/write.ts:132`, `cli/commands/mcp/write.ts:55` — widen target cast (or
    better: derive from `isTargetName` so casts stop accreting).
16. Docs: `docs/cli-quickref.md`, `docs-astro` MCP/per-project pages, seminar deck matrix
    ("mcp → Cursor, OpenCode").

Phase 2 (skills, if warranted): `SkillScope`/`skills.ts:50,276-338`, `write-record.ts:87`,
`paths.ts` skill dirs, materialization loop + stale-entry cleanup, dedup strategy vs
claude-compat discovery.

Phase 3 (hooks): D7 items — `hook-policy/types.ts:4`, `runtime-selection.ts:14`,
`emit-opencode-plugin.ts`, `sync-hooks.ts` branch, descriptor flip, e2e coverage.

---

## 6. Test plan (TDD; mirrors the existing per-target contract surface)

Phase 1:
- `test/commands-write-opencode-conflict.test.ts` — foreign server preservation, owned
  drift → error, `--force` overwrite, user-key passthrough (`$schema`, `plugin`, `tools`
  survive merges), jsonc-present skip+warning. Modeled on
  `commands-write-cursor-conflict.test.ts`.
- `test/core-mcp-headers.test.ts` — `{env:VAR}` rewriting for env + headers; command-array
  composition; `timeout` emission; http|sse → `remote`.
- `test/core-targets.test.ts` — descriptor shape, `ALL_TARGET_NAMES` includes opencode,
  `hookRuntime` null in Phase 1.
- `test/core-machine-config.test.ts` / `core-config.test.ts` — schema + enabled-flag
  layering (registry false → machine true → project override).
- `test/core-reconcile.test.ts` — write-record ownership + cleanup when target disabled.
- Ambient: project-vs-global opencode collision codes.
- `test/core-hook-runtime-selection.test.ts` — `resolveHookRuntimes({opencode: true})`
  is `[]` in Phase 1 (cursor precedent).

Phase 3 adds `cli-hook-write-e2e` opencode cases (deny-throw, args mutation, name
normalization).

---

## 7. Open questions and verification items

For Remy (decisions):
- **Q1 (D2):** Default `enabled: false` for opencode breaks the all-targets-enabled
  precedent. Agree?
- **Q2 (D6):** Accept compat-discovery-only skills for Phase 1 (opencode sees skills via
  `.claude/skills/`), with explicit projection deferred?
- **Q3 (D7):** Accept fail-closed mapping of `ask` → deny-with-message in the plugin
  runtime, given OpenCode has no interactive permission return from `tool.execute.before`?
- **Q4 (D9):** Confirm the git-hygiene deviation (never ignore `opencode.json`; ignore
  only generated plugin files).

Empirical verification (needs a real OpenCode and Cursor install; none of these block
starting Phase 1, but V1-V2 should land before the ambient codes ship):
- **V1:** Cursor tolerance of `type` in remote server entries (§2.3).
- **V2 — ANSWERED 2026-08-05 (experiment 06 Q7): per-field deep merge, NOT wholesale.** Project wins conflicting fields (verified behaviorally); non-conflicting user-scope fields (e.g. `environment`) merge INTO the project entry — an injection surface, disposition tracked on I153. Original question: same-ID project/global merge semantics — field-inheritance vs wholesale-wins —
  for both Cursor (§2.4) and OpenCode (D5). Correct `ambient-policy.ts` texts accordingly.
- **V3:** OpenCode behavior on duplicate skill names across `.opencode/skills/` and
  `.claude/skills/` (affects Phase 2 design).
- **V4:** Whether `tool.execute.after` output mutation is honored for injecting
  `additionalContext` (affects D7 table).
- **V5 — ANSWERED 2026-08-04 (experiment 06 Q8): `.jsonc` wins** when both exist. Original question: precedence between `opencode.json` and `opencode.jsonc` when both exist
  (affects D4 guard messaging).

Risks:
- OpenCode is young and its config schema moves fast; pin the docs snapshot (121,
  2026-07) in review notes and re-verify before implementation starts.
- Writing to a root-level, user-committed `opencode.json` raises the blast radius of any
  merge bug relative to dot-dir targets — the per-server hash + foreign-key passthrough
  tests in §6 are the guardrail and must be written first.
