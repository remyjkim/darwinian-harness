# ABOUTME: Defines the hard-cut V2 machine-scope Worker Blueprint contract for drwn.
# ABOUTME: Replaces profile and bare capability selections with one immutable, consent-gated Card closure.

# [I177] Machine-Scope Worker Blueprint — Target Architecture (GATE 1)

**Status**: Revised hard-cut design; ready for G1 review (2026-08-03)

**Issue**: [I177] · **Owner**: Remy K · **Reviewer**: Minseung Lee · **Branch**: `remy/I177-machine-scope-blueprint`

**Plan**: [`../tasks/cl0177_machine_scope_blueprint_task_plan.md`](../tasks/cl0177_machine_scope_blueprint_task_plan.md) (GATE 2)

**Prerequisite**: [I176] is merged at `1fc03e6`; post-merge CI run `30848589215` passed all six jobs.

**Compatibility decision**: Pre-launch hard cut. V1 and prototype machine configurations are rejected. There is no migration, dual read, or legacy activation path.

## 1. Decision

Machine capability intent has one authority: a selected Worker Blueprint and its immutable Card closure.

The current V1 model has two incompatible activation mechanisms:

- a special, CLI-pinned Operator profile with integrity but no extensibility; and
- flat skill/MCP IDs with neither Card provenance nor version or content integrity.

V1 cannot be migrated losslessly because its bare IDs do not identify the Card release that supplied the bytes. I177 therefore replaces the model outright. A machine either has a valid V2 Blueprint selection or no active machine Worker.

This produces one mental model across scopes:

| Concern | Project scope | Machine scope |
|---|---|---|
| Selection | one active Worker root | one active Worker root |
| Reproducibility | `drwn.project-lock` V1 | embedded `drwn.project-lock` V1 value |
| Capability source | selected Card closure | selected Card closure |
| Consent | per locked Card/digest | per locked Card/digest |
| Projection | repository target surfaces | user-home target surfaces |
| Write record | project write record | global write record |

Project and machine state remain exclusive. A project write never inherits ambient machine capabilities, and a machine write never consults the current project.

## 2. Canonical V2 schema

`~/.agents/drwn/machine.json` becomes:

```jsonc
{
  "schema": "drwn.machine",
  "schemaVersion": 2,
  "policy": {
    "targets": {},
    "catalogs": {},
    "analyzer": {},
    "trustedSources": {}
  },
  "capabilities": {
    "activeWorker": null,
    "workerLock": null
  }
}
```

An active state replaces the two nulls with a canonical root name and a
complete validated `ProjectLockV1` value. That lock includes `store`,
`workerRoots`, and `cards`; every root contains `name`, the immutable requested
ref, `kind`, and ordered `members`. The architecture intentionally does not show
an abbreviated active lock as if it were valid JSON.

Normative rules:

1. `schemaVersion` is exactly `2`.
2. `policy` retains target, catalog, analyzer, and trusted-source policy. It has no `authoring` field.
3. `capabilities.activeWorker` is either a canonical root Card name or `null`. It is never a versioned or transport-bearing reference.
4. `capabilities.workerLock` is either a validated `ProjectLockV1` value or `null`.
5. A non-null `activeWorker` requires a non-null lock containing exactly one matching root name.
6. Every machine root has `kind: "blueprint"`; plain Cards may be members but cannot be installed or selected as machine roots.
7. The root's `requested` field preserves the user's versioned Git, Store, or integrity-locked file reference.
8. `activeWorker: null` may retain a valid lock containing installed alternative roots. `workerLock: null` means no installed machine roots.
9. The removed V1 fields `profile`, `skills`, and `mcpServers` are invalid in V2.
10. `config.json.defaultAuthorScope` and `config.json.catalogCheckouts` remain independent user preferences. No load-time bridge reads or removes `machine.policy.authoring`.

The existing `ProjectLockV1` TypeScript shape and `validateCardLockfile` behavior are reused; no nonexistent schema export is invented. Machine mutation validates both machine schema and lock version floors before committing bytes.

### Empty V2 state

Fresh non-guided or non-interactive initialization writes explicit empty intent:

```json
{
  "schema": "drwn.machine",
  "schemaVersion": 2,
  "policy": {},
  "capabilities": {
    "activeWorker": null,
    "workerLock": null
  }
}
```

Default-filled policy values may be materialized by the parser, but serialized intent must not invent a selected Worker.

## 3. Hard-cut behavior

All V1 and prototype `machine.json` shapes fail closed with one actionable error. drwn does not infer provenance, migrate IDs, delete state, or project from invalid state.

The error directs the operator to:

1. copy `machine.json` and `global-write-record.json` outside the state root if they need an audit record;
2. remove the unsupported machine intent and write record intentionally;
3. run `drwn init`; and
4. select a Blueprint with `drwn apply --root <ref>` or leave machine intent empty.

The reset is operator-controlled because deletion may relinquish ownership of user-home files. `drwn init` must not silently overwrite an unsupported file.

The legacy commands below exit nonzero and explain the replacement workflow:

```sh
drwn machine skill enable <id>
drwn machine skill disable <id>
drwn machine mcp enable <id>
drwn machine mcp disable <id>
```

Inventory commands remain supported. Installation is not activation:

```sh
drwn machine skill install|update|uninstall|list|show|references ...
drwn machine mcp add|update|remove|list|show|references ...
drwn machine inventory export|bundle|verify|sync|gc ...
```

## 4. Blueprint source and recommended defaults

The recommended source is a real standalone Card repository under the Card collection:

`/Users/pureicis/dev/darwinian-cards/cards/machine-defaults`

It is authored with the existing Worker commands, published as an immutable Git release, and consumed through an explicit immutable ref. It is not a directory inside the drwn Store and not a mutable catalog checkout at runtime.

Initial composition is verified against real released refs before publication and is expected to include the current Operator, workflow-skills, knowledge-docs, and personal-harness Cards. If any intended member lacks a valid immutable release, publication stops rather than substituting ambient bytes.

Task 2 may publish a bootstrap `machine-defaults` `v1.0.0` using the current
already-released member refs so the resolver and descriptor can be built without
a circular dependency. That bootstrap is not the G3 release candidate. After
`drwn` `1.1.0` validates Operator `2.0.2`, Task 9 must publish a new immutable
`machine-defaults` version containing that Operator release and move the shipped
descriptor to it. G3 cannot pass while the descriptor still names the bootstrap.

Guided `drwn init` discovers the recommended ref from a versioned descriptor such as `registry/machine-workers.json`. The descriptor pins the complete source ref; a contract module validates that descriptor. Non-interactive and declined setup remain empty.

The Operator remains a normal Card member. The changed workflow payload is
versioned independently as Operator `2.0.2` with `harness.minVersion: "1.1.0"`.
It is neither tagged nor marked `lastValidatedWith` until the I177 `drwn`
`1.1.0` implementation passes the complete release matrix. Its release
verifier continues to validate canonical Operator content and compatibility,
but the special machine-profile activation contract and profile registry are
removed. If practical, `operator-profile-contract.ts` is renamed to
`operator-card-contract.ts`; otherwise its machine-profile concerns are
deleted and its Card-release responsibility is made explicit.

### Resolution boundary

Runtime selection uses only the existing reproducible Card sources:

- an immutable Card already present in the local Store;
- an explicit Git ref permitted by trusted-source policy; or
- an explicit file source permitted by policy and locked to its resolved content digest.

Store and pinned Git releases are immutable. An explicit file source is a
development convenience, not immutable: every machine evaluation re-hashes its
live source path and fails closed if it differs from the lock. `config.json.catalogCheckouts`
is an authoring lookup for Card source commands. It must not be added to
`resolveCard`, `use`, or `apply`; ambient mutable checkouts never satisfy a
runtime ref implicitly.

## 5. Machine Worker mutations

Project mutation semantics are lifted to a scope-aware transaction rather than copied into unrelated command code.

### `drwn apply --root`

- Resolves every supplied root and replaces the installed machine root set atomically.
- Rejects any root whose locked `kind` is not `blueprint`.
- Selects the sole root automatically or the root named by `--active`.
- Persists canonical `activeWorker`, requested refs, resolved versions, Card entries, integrity hashes, and consent carried forward through the shared range-authorized project contract.
- `--none` suppresses selection while retaining the supplied replacement roots in a valid lock. `apply --root --none` with no refs clears the root set and produces `activeWorker: null`, `workerLock: null`.
- Commits intent without projection by default, matching project `apply`; `--write` chains projection after the successful commit.

### `drwn use --root`

- With a ref, resolves or adds that root and selects it without discarding installed alternatives.
- Rejects a plain Card root.
- With `--none`, clears only `activeWorker`; a valid lock may retain installed roots.
- Carries forward consent using the same range-authorized rules as project selection.
- Projects after committing unless `--no-write` is supplied.

Existing add/remove/pin/update primitives should be shared where their semantics are safe. Every machine mutation uses the locked `mutateMachineConfig` transaction and validates the resulting lock before rename.

## 6. Effective state and integrity

When no project config is active, `buildEffectiveState` reads the machine selection:

1. validate V2 and the embedded lock;
2. locate the canonical active root;
3. reconstruct its selected closure from the locked topology;
4. load every locked Card from the location dictated by its locked origin;
5. re-hash Store/Git extractions and explicit file-origin source paths against the lock before projection;
6. derive skills, MCP definitions, hooks, and instructions only from the active closure; and
7. report missing, changed, or unsupported bytes as a blocking integrity error.

The closure follows the current Card validator: a Blueprint root may compose plain Cards; nested Blueprint behavior does not expand as part of I177.

`machineCapabilities` is no longer populated from machine inventory IDs. Skills and MCP servers flow through the same active-Card ordering and provenance used at project scope. Inactive installed roots and unrelated inventory never enter effective state.

Status/doctor output becomes a V2 contract reporting:

- canonical active Worker and requested root ref;
- installed roots and locked Card closure;
- closure-derived skill, MCP, hook, and instruction counts/provenance;
- lock/content integrity;
- consent gaps; and
- projection ownership/currentness.

## 7. Consent

Hooks and instructions remain opt-in per locked Card and digest.

```sh
drwn card trust <card> --hooks --scope machine
drwn card trust <card> --instructions --scope machine
```

Machine consent is stored in `machine.json capabilities.workerLock.cards[]`, not a second database. A typed consent scope discriminator identifies project versus machine acknowledgements; an unexplained magic path such as `"__machine__"` is not public state. At machine scope, `card trust` accepts only a Card in the currently active closure. This deliberate tightening prevents granting ambient consent to an inactive alternative; consent already recorded while that Card was active remains attached to its lock entry when another root is selected.

Machine `use`, `apply`, and `write` must preserve the project contract:

- unchanged content inside the prior consented semver range preserves consent;
- changed hook/instruction content inside that range is re-granted with a fresh timestamp/current digest and an explicit warning, matching `carryCardConsent`;
- versions outside the consented range or removed consent-relevant contributions drop consent and require an explicit trust command;
- a mutation that newly requires consent reports it precisely;
- `drwn write --root` replays acknowledged consent before planning, including when `--root` forced machine scope from a project directory; and
- no consent prompt or acknowledgement is written during `--dry-run` or non-interactive failure.

## 8. Projection contract

`drwn write --scope machine` and `drwn write --root` project the active closure to user-home surfaces. They never project inactive roots or arbitrary installed inventory.

### Generated Worker

The existing scope-agnostic Worker generator writes the active aggregate bundle beneath:

`~/.agents/drwn/generated/workers/<scope>/<name>/`

This includes the Worker manifest, composed skills, consented instructions, and consented hook assets. The implementation lifts the current project-only orchestration gate; it does not fork the generator.

### Skills and MCP

Skills and MCP definitions are derived from `activeCards` in deterministic closure order. The V1 `machineCapabilities.skills` and `machineCapabilities.mcpServers` inputs disappear. Target and mode filters still apply.

### Instructions

The canonical composed instructions are part of the generated Worker. Managed adapters deliver them to:

- `~/.claude/CLAUDE.md`; and
- `~/.codex/AGENTS.md`.

I177 never writes `~/AGENTS.md`. Cursor/OpenCode instruction adapters are excluded until their user-scope discovery contract is proven. The existing managed-block format, content digest, foreign-byte preservation, drift refusal, force handling, cleanup, `--mcp-only`, `--skills-only`, and target filters apply.

### Hooks

The current target routing already maps machine-scope Claude hooks to managed fields in `~/.claude/settings.json`. I177 enables the closure-derived hook input and verifies that unrelated settings survive first write, update, drift, force, and cleanup. Unsupported target hook encoders remain unsupported.

### Preflight and atomicity

`planMachineManagedPaths` must include every possible closure-derived destination before writes begin:

- skills;
- MCP config fields/files;
- generated Worker and hook artifacts;
- Claude/Codex instruction adapters; and
- target hook/settings destinations.

The global write record remains the ownership authority. First-write foreign content fails, drift fails without force, force updates only planned managed content, stale unchanged output is cleaned, and partial planning failure writes nothing.

## 9. Other V1 consumers

The hard cut is not complete until direct V1 readers are removed or updated:

- `cli/commands/machine/mcp.ts`
- `cli/commands/machine/skill.ts`
- `cli/core/card-from-defaults.ts`
- `cli/core/defaults.ts`
- `cli/core/diagnostics.ts`
- `cli/core/inventory-references.ts`
- `cli/core/machine-profiles.ts`
- `scripts/verify-release-readiness.ts`
- their focused, contract, release, and end-to-end tests.

`drwn card new <name> --from-defaults` remains useful, but V2 defines defaults as the active machine closure. It creates a new plain Card by intentionally flattening that closure's effective skills and MCP definitions. It does not read V1 arrays, include inactive roots, copy secrets, or turn generated output into source.

Inventory reference reporting no longer reports V1 explicit machine selections. It may report immutable Card-lock references when an installed inventory record is genuinely used by the active machine closure; Store-backed Cards are not falsely described as standalone inventory selections.

Release readiness verifies the V2 schema, hard-cut errors, machine Blueprint descriptor, recommended Card contract, and deprecated command failures. Documentation and tests must contain no active instructions to enable a machine skill or MCP record directly.

## 10. Safety and boundaries

- Secrets and runtime credentials remain operator-owned environment or tool state. Cards carry definitions and secret references, never resolved values.
- Machine inventory transfer remains inventory-only. It excludes machine intent, Worker locks, Cards, credentials, generated output, and write history.
- Project projection remains independent and unchanged except for shared refactoring covered by regression tests.
- Authoring checkout discovery from I176 remains independent of runtime selection.
- The personal-harness Card split and unrelated curated-directory precedence work remain separate issues.
- Manual acceptance runs only with disposable `HOME`, `AGENTS_DIR`, project roots, and downstream target paths. I177 never experiments against the operator's real home.

## 11. Rejected alternatives

### Automatic V1 migration

Rejected. Bare skill/MCP IDs do not identify a source Card release, so migration would fabricate provenance or bind whichever mutable bytes happen to be present.

### Dual read or coexistence

Rejected. Retaining profile/explicit activation recreates two authorities and makes status, write, and consent ambiguous.

### Mutable catalog checkout resolution

Rejected. Authoring convenience cannot replace immutable runtime resolution or content-addressed integrity.

### A second machine lock file

Rejected. Embedding the validated lock in `machine.json` keeps one atomic machine-intent transaction and avoids split-brain selection.

### Home-root `AGENTS.md`

Rejected. It is too broad and may affect unrelated shells and repositories. Only harness-specific user adapters are managed.

## 12. Acceptance criteria

I177 is complete only when all of the following are evidenced:

1. Only strict machine V2 is accepted; V1/prototype inputs fail with controlled-reset guidance and no mutation.
2. `policy.authoring` and its compatibility bridge are absent; `config.json` preferences work independently.
3. A published, immutable `@curation-labs/machine-defaults` Blueprint exists in its own Card repository.
4. Guided init can pin that descriptor; non-interactive/declined init is empty.
5. `use --root`, `apply --root`, `--none`, consent carry-forward, and projection failure semantics match the documented contract.
6. Effective state is derived only from the active verified closure.
7. Machine skills, MCP, Worker bundle, hooks, and Claude/Codex instructions project with ownership and filter guarantees.
8. Legacy enable/disable commands fail nonzero with replacement guidance while inventory operations remain functional.
9. Diagnostics, capture-from-defaults, inventory references, release verification, public docs, knowledge docs, and Operator skills describe V2 only.
10. Focused tests, typecheck, full pinned suite, release readiness, post-push CI, and disposable-HOME acceptance all pass with recorded evidence.

No production implementation begins until this architecture, the companion TDD plan, and all affected existing documentation have been revised and checked for internal consistency.
