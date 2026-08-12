# ABOUTME: Defines the G1 target architecture for first-class Goose support under I214.
# ABOUTME: Freezes a capability adapter seam, safe directory ownership, consent, qualification, and strict Pi exclusions.

# I214 Goose Target Support — Target Architecture

**Status:** Post-I265 base-integration amendment — exact-byte Owner approval pending

**Issue:** [I214] Goose target support

**Date:** 2026-08-11

**Base:** origin/main at cef3090c013134b578d87fd938a6741fd288d36a

**Strategy:** .ai/analyses/cl0214_goose_target_team_strategy.md

## 1. Executive decision

Add Goose as a default-disabled, capability-oriented target. Do not extend the current
file-shaped target model with another enum branch. Introduce an internal
TargetProjectionAdapterV1 boundary whose adapters declare capabilities and produce pure,
deterministic plans. A shared projection executor exclusively owns path reads, locking,
writes, cleanup, journaling, recovery, and inspection.

Existing Claude, Codex, Cursor, and OpenCode behavior remains behind a legacy
file-shaped planner. Goose is the first directory-shaped adapter and owns only
Goose-specific declarative rendering. Directory ownership and consent are frozen before
any Goose plugin leaf implementation begins. Goose policy hooks are explicitly outside
I214.

I214 remains Goose-only. Pi participates only as a future-consumer witness and receives
no target identity, extension, package, SDK, runtime-bundle, or support claim in this
issue.

## 2. Evidence and provenance

### 2.1 Preserved Goose evidence

The perishable configuration guide was imported byte-for-byte from the primary
checkout:

- Source: /Users/pureicis/dev/darwinian-minds/.ai/analyses/134_goose-configuration-guide.md
- Imported path: .ai/analyses/134_goose-configuration-guide.md
- SHA-256 at import: 73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd
- Source status before import: untracked in the primary checkout
- Evidence base: drwn-lab experiment 07, 24 evidence files and 17 fixtures

The imported guide is evidence, not a support contract. Claims in this architecture are
qualified by the exact runtime and provider class that produced them.

### 2.2 Runtime identity

Two different evidence classes are intentionally retained.

The historical live probe used:

- Binary: /opt/homebrew/Cellar/block-goose-cli/1.41.0/bin/goose
- Homebrew entry: /opt/homebrew/bin/goose
- Platform: arm64 Mach-O
- SHA-256: ccbc134fdc59cb75c929fbb337951a3a1fd0b66231a9283515bbfb620fb01d50
- Version: 1.41.0
- Upstream v1.41.0 commit: 39c27c387d726ce4605108d2f974d4feec158ed5

That binary and its preserved precedence probe remain historical behavior evidence; they do not
qualify candidate-v5 publication or activation claims.

The authoritative design-source audit uses the clean local checkout at
`/Users/pureicis/dev/goose`:

- Commit: `db7a704446975c88d3b67490c74d33bcd684404e`
- Branch/tracking state at audit: `main...origin/main`, clean
- Commit date: `2026-08-11T13:58:12+00:00`
- Workspace version declared in `Cargo.toml`: `1.45.0`
- Describe string: `v2.0-rc-04-27-0-1016-gdb7a70444`
- Tag status: the commit itself is untagged

The support contract therefore binds to the full source commit plus a live binary digest/build
provenance record; the workspace version alone is insufficient. A future binary cannot qualify
merely by printing `1.45.0`.

Latest-source inspection confirms that project plugin discovery uses
`.agents/plugins`, auto-registers plugin-root paths in the global `plugins` map, and that
plugin `.mcp.json` represents only stdio servers with `command`, `args`, `env`, and optional
`cwd`. The deserializer ignores unknown keys; it does not reject header or timeout keys by
itself. HTTP, SSE, platform-provided servers, headers, and per-server timeout therefore have
no faithful plugin representation at the audited commit, and the drwn adapter rejects them before consent or
mutation instead of relying on Goose's permissive parser.

The prior live evidence used a CLI-harness provider after a direct provider returned
401. Instruction discovery, plugin discovery, MCP invocation, and SessionStart evidence
are useful inputs. PreToolUse enforcement, failure policy, batch behavior, and
direct-provider parity remain unverified.

### 2.3 Repository baseline

The historical initialized-worktree baseline at `ea13a582` passed:

- bun test ./test: 2212 pass, 10 skip, 0 fail across 351 files
- bunx tsc --noEmit: exit 0

Its immutable auditable run record is
.ai/analyses/cl0214_goose_g1_baseline_evidence.md. It records the command, checkout,
result summary, raw-log digest, and deterministic exclusions used for this freeze.

`origin/main` subsequently advanced 45 commits and landed I265 at
`cef3090c013134b578d87fd938a6741fd288d36a`. I214 rebased cleanly onto that exact tip; range-diff
and blob comparison proved the two pre-existing I214 documentation commits byte-equivalent.
I265 has real semantic overlap with I214 in Card declarations, Worker materialization, release
artifact qualification, and package/docs readiness. The bounded reconciliation below preserves
I265's runtime-admission and release contracts while retaining the selected I214 topology.

A fresh exact-Bun-1.2.21 qualification at rebased I214 head `efd7150` passed:

- focused I265/I214 seams: 306 pass, 1 skip, 0 fail across 11 files;
- `bun run test:gate`: 2365 pass, 11 skip, 0 fail across 351 files;
- typecheck, release readiness, package dry run, and Docusaurus production build: exit 0.

The separate current-base run record is
.ai/analyses/cl0214_goose_post_rebase_baseline_evidence.md. It records exact commands, tool
digest, checkout identities, counts, exclusions, package tuple, and raw-log digests. The old
baseline remains historical evidence and is not relabeled as current. Live-provider tests are
excluded from both deterministic baselines.

I238 and I266–I269 remain concurrently active under separate coworkers. This architecture does
not inspect or modify their mutable worktrees. Before G2 freeze, the coordinator must record each
remaining issue's landed SHA or explicit non-overlap disposition, re-audit the combined `main`
descendant against every I214 shared seam and plan path, and amend G1 again if the target contract
changes materially. I265 is no longer pending: its landed SHA and integration disposition are
the `cef3090` amendment recorded here.

### 2.4 Workflow-rule drift

The strategy references .ai/rules/org-wide/06_issue_workflow.md and repo-wide command
maps that are absent from this checkout. The checked-in repository uses Bun and the
local .ai/rules files. AGENTS.md supplies the authoritative v0.4 state contract.
Repository-reality commands in this architecture therefore use Bun while preserving the
AGENTS.md gate and transaction requirements.

### 2.5 Specialist and precedence evidence

The specialist packets, coordinator resolutions, human decisions, and latest-source delta audits are indexed in
.ai/analyses/cl0214_goose_g1_decision_evidence_register.md. The isolated Goose 1.41.0
skill-collision probe is preserved in
.ai/analyses/cl0214_goose_skill_precedence_probe.md.
The source-to-contract closure and entry-point matrix are preserved in
.ai/analyses/cl0214_goose_source_contract_coverage.md.

Candidate v5 does not extrapolate that historical probe. The latest source independently
confirms the project skill root order and exact-working-directory behavior while exposing four
material deltas: experimental state-machine skill activation is independent of the legacy
extension vector; `GOOSE_PATH_ROOT` accepts only absolute paths; Summon subagents suppress hook
loading; and the standalone legacy HTTP server and bundled text UI have been removed. The
remaining TUI launcher resolves a mutable external npm package and is not a qualified runtime.
These findings narrow the strict activation envelope and simplify the supported entry-point
matrix without changing the selected projection topology.

T5-R2 independently reviewed the exact Owner-approved candidate v2 hashes and returned seven
important findings. T1 through T4 then performed read-only P4 source reconciliation, and the
Owner approved candidate v3. T5-R3 reviewed those exact hashes and returned three further
important findings: Goose validates the entire winning plugin map as one value; the proposed
Unicode collision key was not portable; and five Parallel, Beads, and MarkItDown callers could
return before their locked project-config writes completed.

The P5 source pass accepts all three findings. Its candidate-v4 consistency reread further
confirmed that dirty state spans every settings-enabled discovered plugin and that Goose can
migrate and fully reserialize the writable user config. Candidate v4 validates the whole plugin
map before relevance filtering, models aggregate complete discovery, blocks plugin consent/
materialization for an unsafe existing writable config, broadens informed disclosure, makes
`PortableProjectionPathV1` an ASCII-only projector boundary, awaits all five extension
mutations, and closes the adjacent Card read-then-write race. The repository
corpus contains 49 eligible shared/Card source roots and 138 projected nodes (87 files and 51
directories); every node satisfies the new grammar, with a maximum segment of 34 bytes, path of
74 bytes, and depth of 5. The projector-only hard cut therefore removes Unicode normalization,
caseless matching, and Git-ignore escaping logic without migrating current data. It drastically
reduces both design complexity and implementation/qualification effort within that boundary,
meeting `I214-D004`; a universal target/ownership hard cut still fails that threshold.

No serialized ledger field, schema version, adapter ABI, consent-receipt schema, Pi production
scope, or universal-target decision changes. The ambient global-config disclosure and its digest
are re-frozen by the Owner-approved candidate because whole-map, aggregate-discovery, and
writable-config migration/serialization behavior is part of informed consent. The exact packets
and resolutions are preserved in the decision/evidence register. Candidate v4 received explicit
`I214-D006` approval on 2026-08-11; a fresh exact-hash T5 review remains mandatory before formal
G1 submission.

Subsequent D009/D010 freezes and T5-R5 findings remain historical in the decision register.
`I214-D011` authorized the clean rebase to `cef3090` and continued semantic integration, not the
changed bytes in this document. The I265 amendment changes no ledger schema, adapter ABI,
consent schema, Pi scope, or selected topology, but it does change the current base, ordering,
release, evidence, and task contracts. Renewed exact-byte Owner approval and a fresh exact-commit
independent PASS are therefore required before formal G1 submission.

## 3. Scope

### 3.1 In scope

- Goose target identity, descriptor, configuration, selection, and dispatch.
- Root AGENTS.md as the native project-instruction surface.
- Shared .agents/skills projection with a versioned consumer namespace.
- Project-local .agents/plugins/drwn two-file plugin projection for MCP.
- Per-entry ownership for directory-shaped output.
- Explicit target opt-in and pre-materialization consent.
- Ambient detection of Goose-created global plugin registration.
- Status and doctor diagnostics for current, stale, foreign, and malformed registration.
- Goose-specific deterministic tests and isolated live qualification.
- Existing-target non-regression.

### 3.2 Out of scope

- Pi target identity, .pi extension, SDK integration, runtime bundle, dependencies, or
  qualification.
- Goose recipes or sub-worker delivery.
- Editing or owning Goose global config.yaml.
- Automatic package or provider installation.
- Resolving secret references into generated files or logs.
- All Goose machine-scope capabilities and policy-hook emission.
- Runtime-use parity claims for unqualified providers, support claims for unqualified runtime
  versions, and all hook-event claims.
- Direct AgentHarness support.

## 4. Current-state constraints

### 4.1 Closed file-shaped target model

cli/core/types.ts defines a closed TargetName union and requires every target to carry
configPath, format, and mcpKey. cli/core/targets.ts centralizes metadata but executable
projection behavior remains distributed across hard-coded switches in paths, sync,
skills, hooks, diagnostics, and Worker generation.

Adding only a Goose union value would be unsafe:

- path selection can fall through to another target;
- sync contains only existing-target branches;
- project target filtering can suppress the canonical instruction projection;
- skills and hook runtime selection are closed;
- diagnostics and ownership validation reject unknown target/surface values.

### 4.2 Whole-directory ownership is unsafe for Goose

drwn.write-record@1 represents managed-directory as one recursive digest. Existing
cleanup may recursively remove the recorded directory. A Goose plugin directory can
contain foreign descendants, runtime-created state, or user additions. Treating the
root as one owned object would either destroy foreign content or make ordinary foreign
additions indistinguishable from managed drift.

### 4.3 Shared skills lack consumer identity

The current record allows one target per path and rejects duplicate paths. A shared
.agents/skills entry needs a stable producer plus multiple active consumers. Disabling
Goose must not remove a skill still required by another target, and removing the last
consumer must still preserve drifted bytes.

### 4.4 Materialization can trigger ambient state

The audited Goose source can activate every settings-enabled discovered plugin missing from its effective
whole plugin map and rewrite the writable user config after migrations. Drwn does not perform
that write, but project materialization creates one condition that triggers discovery. Target
opt-in alone is project intent; it is not sufficient machine-local consent for this broader
side effect.

### 4.5 Landed Worker 1.3 runtime-admission boundary

I265 changed the current repository contract before I214 implementation. `CardManifest` now
admits `runtimeAdmission` and `applicationRequirements`; deployable Worker closures require both
declarations, derive a canonical runtime-admission envelope, and raise
`store.minDrwnVersion` to at least `1.3.0` (a Card `harness.minVersion` may raise it further).
The package identity is separately `darwinian@1.3.0`. Declaration optionality exists only so
historical manifests can still be parsed; I214 must never interpret absence as deployability.

Worker materialization now has a pure, zero-effect admission gate in
`cli/core/worker-materialize.ts`. Before store bytes are decoded or verified and before any
filesystem effect, it strictly validates the outer payload, closure identity/portability,
reconstructed lock, canonical envelope bounds, and exact rederivation equality. The following
ordering is an invariant, not an implementation detail that I214 may replace:

1. strict outer, closure/lock, and runtime-admission rederivation/equality validation;
2. store-export byte-length and SHA-256 verification;
3. I214 complete proposed-state preflight and any consent required by the derived effective
   target state; the current Worker payload derives a targetless project config and does not
   itself select Goose;
4. explicit independent upstream commits; and
5. the one journal-backed project-projection commit.

An invalid runtime-admission payload must beat every I214 blocker and leave acknowledgement,
registry, store, project state, consent, and projection bytes unchanged. A valid admission
payload that reaches a later generic I214 preflight/projection blocker must also leave all persistent bytes unchanged until
the complete preflight passes. I214 may factor or export the existing gate for composition, but
must not bypass, duplicate with weaker validation, or reorder it behind store/preflight effects.

I265 also retired the packaged Buzz delivery Card while retaining required Buzz tooling and
established additive Worker 1.3 release-source/readiness, provenance, publication-control,
recovery-workflow, and Windows derivation coverage. I214 will leave the current `cef3090`
`REQUIRED_RELEASE_MEMBERS` list unchanged. No separate runtime-admission membership
assertion exists yet; the paths are included incidentally by the broad `cli` package entry. I214
will add separate npm-pack membership assertions for exactly these paths:

- `cli/core/runtime-admission-manifest.ts`
- `cli/core/runtime-admission-derive.ts`
- `cli/core/runtime-admission-descriptors.ts`
- `cli/tools/runtime-admission-derive.ts`

I214 adds only the target-adapter registry member and its production parser; it does not append
those four paths to `REQUIRED_RELEASE_MEMBERS`, restore the retired Buzz delivery Card, remove
required Buzz tooling, replace `runtime-admission:derive:v2`, lower the package identity,
regenerate I265/I268 receipt/vector dependency chains, or claim release authority.

## 5. Alternatives

### 5.1 Add Goose to the current enums and switches

This is smallest by line count but retains mandatory fake file fields, unsafe
fallthroughs, central-file branching, and whole-directory ownership. It also forces Pi
or any future directory target through the same redesign later.

**Decision:** rejected.

### 5.2 Convert every target to a new adapter immediately

This yields a uniform architecture but broadens I214 into a repository-wide migration
and raises the non-regression surface unnecessarily.

**Decision:** rejected for I214.

### 5.3 Hard-cut every target/config/ownership format

A single universal record and immediate conversion of every target would remove the dual-record
journal. It would also require redesigning every Worker and target producer, merge-field
ownership, machine/project schema, cleanup path, and associated fixture. Under `I214-D004`, a
hard cut is justified only if it drastically reduces both design complexity and required effort;
this option does not.

**Decision:** rejected for I214.

The concrete delta is:

| Dimension | Universal cut | Selected sidecar/ledger |
| --- | --- | --- |
| Registry | Replace the packaged file-target schema and all loaders | Add one strict adapter sidecar and loader |
| Ownership | Re-express five V1 kinds, field-wise merge ownership, every producer, and cleanup fixture in one larger union | Keep V1 schema/producer semantics; add leaf/container ledger plus cross-record journal |
| Existing targets | Re-plan and re-qualify four targets against a new persistence model | Route them through a parity facade/executor seam with byte-level fixtures |
| Worker/Org Worker | Change ownership consumers and project-state fixtures | Preserve their record format; test composition at the executor boundary |
| Steady-state topology | One registry/record family, but still all old ownership semantics plus new leaf/consumer variants | Two strict registries/records and one subordinate project-projection coordinator |
| Implementation blast radius | Repository-wide | Bounded shared seams plus Goose leaf and safety modules |

The universal cut is somewhat simpler topologically, but it does not remove the existing
ownership semantics and is not a drastic design reduction. It sharply increases implementation
and qualification effort. It therefore fails both-threshold approval under `I214-D004`; the
selected design is justified by lower effort and blast radius, not by claiming a simpler
topology.

### 5.4 Adapter seam with a file-target facade

Introduce an internal versioned adapter interface, preserve existing behavior through a
file-target parity planner, and implement Goose as the first directory-shaped leaf. Shared safety
primitives evolve before the leaf.

**Decision:** selected.

## 6. Target architecture

### 6.1 TargetProjectionAdapterV1

The adapter is repository-internal in I214. It is not a public SDK API.

Conceptual contract:

    interface TargetProjectionAdapterV1 {
      readonly abiVersion: 1
      readonly target: RegisteredTargetId
      capabilities(context): TargetCapabilities
      declareReadSet(context, intent): ProjectionReadSet
      plan(snapshot, intent): TargetProjectionPlan
    }

TargetCapabilities declares project and machine support independently for instructions,
skills, MCP, hooks, and target-specific plugin effects. Adapter methods are pure and
receive no filesystem handle, absolute-path mutation authority, cleanup callback, or
arbitrary command execution surface. Capability support is not inferred from config
format, path, target family, or hook runtime.

Unsupported requested capabilities fail explicitly with a stable reason. They never
fall through to another target implementation.

Only the shared ProjectionExecutorV1 may snapshot paths, validate consent and
containment, acquire locks, stage bytes, publish leaves, clean stale entries, write the
ledger, recover a journal, or inspect owned state.

Runtime interpretation is not an adapter responsibility. An optional sibling interface keeps
point-in-time observation separate from deterministic projection:

    interface TargetRuntimeObserverV1 {
      readonly abiVersion: 1
      readonly target: RegisteredTargetId
      declareObservationReadSet(context): ObservationReadSet
      observe(snapshot, invocationProfile): TargetRuntimeObservation
    }

Observers are pure over an immutable caller-supplied snapshot. They never execute Goose, Git,
plugin installers, or network requests; acquire locks; repair state; or mutate configuration.
Existing targets need not adopt this interface in I214.

The executor API is frozen as four operations; callers cannot supply filesystem mutation
callbacks or choose a recovery direction:

    interface ProjectionExecutorV1 {
      prepare(input: ProjectionPrepareInputV1): Promise<PreparedProjectionV1>
      apply(input: { prepared: PreparedProjectionV1; authority: MutationAuthorityV1 }):
        Promise<ProjectionApplyResultV1>
      recover(input: ProjectionRecoveryInputV1): Promise<ProjectionRecoveryResultV1>
      inspect(input: ProjectionInspectInputV1): Promise<ProjectionInspectionV1>
    }

`ProjectionPrepareInputV1` contains the canonical project root, resolved machine-local
agents directory, effective canonical state, registered adapter set, selected targets,
scope, partial-write mode, operation intent (`materialize | cleanup | revoke`), qualified
runtime/provider/config-path observations, and a clock/UUID source used only to construct
proposed metadata.
`prepare` is read-only. It asks adapters for declared paths, snapshots exactly those paths
plus both ownership records, the four base/local state images, consent, all planned hygiene and
projection paths, and any existing journal,
then returns immutable normalized plans, before/after bytes and hashes, required
locks/consent, stable blockers/warnings, and a snapshot token over the full read set. It
creates no path, lock, receipt, or recovery artifact.

`MutationAuthorityV1` is a closed union: an ordinary project-write permit, or a revoke permit
bound to the exact tombstone and transaction intent. It conveys caller authority only; it
cannot override collisions, ledger compatibility, consent, containment, drift, or capability
failures. `apply` refuses a prepared value with blockers, acquires the declared locks in the
global order, re-reads the complete declared snapshot, and returns `PLAN_STALE` without
mutation if its token changed. Only then may it journal and publish. `recover` accepts only
projectRoot, agentsDir, and the expected journal transaction ID; it re-derives direction from
the journal intent and current receipt/tombstone and never accepts a caller-selected
roll-forward/rollback flag. `inspect` accepts the same read context as prepare, returns the
plan/record/ledger/consent/ambient classification, and is permanently read-only.

Intent is derived centrally, never adapter-selected. An ordinary unfiltered write and any
enabled-target write use `materialize`; a materialize plan may include retirement deltas for
disabled or stale adapter surfaces while also updating V1 state. An explicit disabled
`--target=goose` write uses `cleanup`. Consent revocation uses `revoke`. Recovery tests cover an
unfiltered materialize transaction that updates canonical V1 `AGENTS.md` while retiring disabled
Goose leaves.

All four result unions carry schema/ABI version, transaction or inspection identity, sorted
changes/diagnostics, and a stable outcome code. No adapter is handed `MutationAuthorityV1`, a
lock handle, journal bytes, or executor internals. This is the complete authority boundary T4
implements and T1 consumes.

### 6.2 Deterministic plan contract

`plan` is side-effect-free and returns normalized adapter-ledger entries:

    interface TargetProjectionPlan {
      adapterAbiVersion: 1
      target: RegisteredTargetId
      scope: "project" | "machine"
      entries: PlannedProjectionEntry[]
      ambientEffects: PlannedAmbientEffect[]
      warnings: PlannedTargetWarning[]
    }

Each entry contains:

- `PortableProjectionPathV1` canonical relative path;
- projection surface and target capability;
- normalized bytes plus executable/non-executable mode class, or an explicit
  directory-container marker;
- digest;
- producer identity;
- a shared-projection key when the entry is shareable;
- required consent identity, if any;
- compatibility and qualification metadata.

`entries` never contains canonical `AGENTS.md` or another V1-owned artifact. Instruction
capability selection invokes the existing canonical V1 planner as a separate shared-executor
input. Adapters cannot supply consumer IDs. For each accepted adapter-ledger plan, the executor derives
exactly `target:<plan.target>`, unions that identity with preserved consumers only when the
producer contract and shared-projection key match, and permits cleanup to remove only the
identity derived from that plan. This prevents one adapter from claiming, retiring, or forging
another target's consumer identity.

The plan has a deterministic digest. The shared executor, dry-run, status, doctor, and
evidence reporting consume the same plan instead of rebuilding target intent
independently. Unknown adapter ABI or requested capabilities fail before snapshot or
mutation.

Registered adapter keys match `[a-z][a-z0-9-]{0,63}`. Entries sort by canonical POSIX
relative path; consumers and warnings sort by stable ID/code then path. All `sha256-*`
digests hash UTF-8 bytes or canonical JSON with recursively lexicographic object keys,
semantic array order, no insignificant whitespace, and no platform-native path separator.
The digest algorithm and prefix are contract fixtures, not implementation-defined output.
UUIDs are lowercase RFC 4122 text. `PositiveSafeInteger` is an integer from 1 through
`Number.MAX_SAFE_INTEGER`; `RFC3339UTC` is a normalized UTC timestamp ending in `Z`;
safe paths are relative, slash-separated, contained, and contain no empty, dot, dot-dot,
backslash, drive, or absolute segments.
`CanonicalAbsolutePath` is the platform absolute realpath normalized without a trailing
separator (except a filesystem root), and `LowercaseHexSha256` is exactly 64 lowercase hex
digits without the `sha256-` prefix.

The new shared projector accepts only `SharedSkillIdV1`: 1–64 ASCII bytes matching
`[a-z0-9]+(?:-[a-z0-9]+)*`, excluding case-insensitive Windows device names `con`, `prn`,
`aux`, `nul`, `com1`–`com9`, and `lpt1`–`lpt9`. Validation occurs before source lookup,
path joining, projection-key computation, or plan construction. The root `SKILL.md` name must
equal that ID byte-for-byte. The projector rejects rather than normalizes, escapes, or slugs an
unsafe ID; legacy Claude, Codex, and OpenCode validators remain unchanged.

`PortableProjectionPathV1` is the closed target-ledger/journal path scalar and an intentional
projector-only hard cut. Its literal grammar is:

    Path = Segment ("/" Segment){0,31}
    Segment = 1–128 ASCII bytes, each in [A-Za-z0-9._-]

The complete path is 1–512 bytes including separators. It is relative and slash-separated;
segments cannot be empty, `.` or `..`, end in `.`, or have a case-insensitive Windows-reserved
basename (`con`, `prn`, `aux`, `nul`, `com1`–`com9`, or `lpt1`–`lpt9`) even when followed by an
extension. The grammar consequently rejects absolute, drive, and UNC paths, backslashes,
Windows-forbidden `< > : " | ? *`, spaces, controls, Unicode, trailing spaces/dots, and path
depth or byte lengths above the stated bounds. It deliberately admits required fixed names such
as `.agents`, `.gitignore`, and `.mcp.json`.

Every adapter plan entry, target-ledger path, adapter journal target/source, and selected source
tree path uses this grammar. A source or physical entry must additionally be a regular file or
directory, never a symlink or special node. Invalid input fails before source joining, plan
construction, collision analysis, hygiene rendering, or mutation with stable code
`TARGET_PROJECTION_PATH_INVALID` and one of the stable reasons `non-ascii`,
`forbidden-character`, `empty-segment`, `dot-segment`, `trailing-dot`, `reserved-name`,
`segment-too-long`, `path-too-long`, `too-deep`, `absolute-or-drive`,
`unsupported-entry-type`, or `platform-limit`. The projector rejects the entire selected skill
tree; it never normalizes, renames, escapes, slugs, or silently omits an invalid node.

`PortablePathKeyV1` is derived only by mapping ASCII `A`–`Z` to `a`–`z` in each stored segment
and rejoining with `/`. Distinct logical paths with the same key are a fatal collision on every
host. Equality and segment-aware ancestor overlap within plans, ledgers, journals, existing
directory entries, and across V1 use that key; force never merges, renames, or claims an alias.
The executor re-enumerates and revalidates the physical directory graph and collision keys under
its normal locks before publish or cleanup.

V1 write-record parsing and legacy-only writes remain unchanged. A syntactically valid existing
V1 path that is not representable as `PortableProjectionPathV1` remains valid V1 state but
conservatively blocks any transaction that would add, update, join, or clean target-ledger state
with `TARGET_PROJECTION_LEGACY_PATH_UNQUALIFIED`; it is never renamed or omitted. A future need
for Unicode projected paths requires a successor path scalar/version rather than weakening V1.

An invalid shared skill ID fails with stable code `GOOSE_SKILL_ID_INVALID`; any logical or
physical portable-key alias or cross-record overlap fails with
`TARGET_PROJECTION_PATH_COLLISION`. Diagnostics JSON-escape every hostile ID/path and never
echo control characters raw.

### 6.3 Legacy file-shaped adapter

Claude, Codex, Cursor, and OpenCode route through a pure parity planner whose
first acceptance condition is byte-for-byte parity with current output and cleanup behavior.
Their existing configPath, mcpKey, and McpFormat fields remain internal legacy data.

The current `TargetName` becomes the explicitly legacy `LegacyFileTargetName` boundary.
`RegisteredTargetId = LegacyFileTargetName | AdapterTargetId`, where I214 registers only
`AdapterTargetId = "goose"`. CLI parsing, project overrides, status, and adapter dispatch
use `RegisteredTargetId`; existing file renderers, write-record V1, machine policy, Card
targets, hooks, and legacy ambient MCP policy accept only `LegacyFileTargetName`. Every
dispatch crossing that boundary uses a checked discriminator—never a cast or fallback.

I214 does not opportunistically redesign existing target renderers. Mechanical switch
replacement is limited to registration and dispatch needed to prevent Goose
fallthroughs.

The internal registry is a discriminated union: legacy-file registrations retain
`configPath`, `mcpKey`, and `format`; adapter registrations carry an adapter ID and no fake
file fields. A compatibility view exposes only legacy registrations to existing renderers,
so adding Goose does not make their switches non-exhaustive. Project target overrides remain
strict `{ enabled: boolean }` values over registered IDs. Machine policy and Card manifests
accept only legacy target overrides in I214. A Card, captured Card, extension, or machine
default cannot enable Goose; only the project config can express Goose intent.

The existing `registry/config.json`, its version, and `CanonicalConfig.targets` remain
byte-for-byte file-target-only. A separate strict `registry/target-adapters.json` carries:

    {
      "schema": "drwn.target-adapter-registry",
      "schemaVersion": 1,
      "targets": { "goose": { "enabled": false, "adapterAbiVersion": 1 } }
    }

New code loads that sidecar separately. The root keys are exactly `schema`, `schemaVersion`, and
`targets`; the only I214 target key is `goose`; and its value has exactly
`enabled:false` and `adapterAbiVersion:1`. Missing files, malformed JSON, unknown keys/targets,
wrong schema/version, a non-false packaged default, or an unsupported ABI fail with
`TARGET_ADAPTER_REGISTRY_INVALID` before any target-aware project mutation. There is no fallback
to `registry/config.json`, inferred default, or partial adapter set. Target-independent
`--version`/help and explicitly machine-scoped file-target commands do not load the adapter
sidecar; project projection, target enumeration, project status/doctor, and project target
validation do. File renderers receive only the unchanged canonical file-target view; machine
scope never receives the adapter view.

Release qualification requires more than package membership. It extracts
`registry/target-adapters.json` from the exact packed tarball, runs the production parser, and
asserts the default-disabled Goose ABI. Negative artifact tests cover missing, malformed,
unknown-key, and unsupported-ABI sidecars before installed smokes are accepted.

The existing project-config schema remains the project authority, but its `targets` member is
now strictly validated over registered IDs with exact `{enabled:boolean}` values. Machine policy
and Card manifests remain strictly limited to file targets.

Effective target intent has three literal chains. Project file-target state is the packaged
config after the current `projectBaseConfig` transform (packaged target defaults remain, while
machine defaults are removed and project parallel MCP starts disabled), followed by active Card
target effects with the direct project target override winning any Card value, plus the current
project-extension effects; machine policy and machine capabilities are excluded. Machine
file-target state is packaged config followed by
machine policy/capabilities and has no project or adapter view. Project adapter-target state
starts from the sidecar default and accepts only a direct project override. CLI `--target`
selection changes reconciliation scope, not enablement authority. Card capture omits adapter
target intent from the manifest with an explicit `PROJECT_ONLY_TARGET_EXCLUDED` diagnostic, and
Card diff treats it as project-local state; a Card containing a Goose target key is invalid.

Project-config mutation coverage is closed by route, not assumed from the type alone:

| Route | Required Goose-target behavior | T1 ownership |
| --- | --- | --- |
| `project-writes.ts` skill/MCP/extension helpers | Strictly validate and round-trip unchanged | Source plus focused tests |
| `card-project.ts` Card add/update/remove paths | Mutate only `workers` through the same read-and-write-under-lock primitive so a concurrent extension or Goose override cannot be overwritten; Card graph/lock work remains outside the config lock | Source plus deterministic concurrency tests |
| `extensions/project-config.ts`, `parallel.ts`, `beads.ts`, and `markitdown.ts` | Expose explicit `Promise<string>` helpers backed only by the shared locked extension mutation; delete unused unlocked `ensureProjectSkillInclude` | Source, type, durability, and preservation tests |
| `init.ts` | Await Parallel and then Beads sequentially before returning success; never use `Promise.all` for project-state mutations | Guided-init and injected busy/failure tests |
| `extensions/setup.ts` and `extensions/add.ts` | Await the selected extension mutation before constructing success JSON/text, outputting a path, or refreshing runtime state; `add.ts` remains the parity witness | Human/JSON output, busy/failure, and dry-run tests |
| `worker-project.ts` Worker mutations | Preserve through validated object spread | Regression tests |
| Org Worker removal | Preserve through validated object spread | Regression tests |
| `install.ts` lock refresh | Preserve the exact already-validated config bytes | Regression tests |
| `scaffoldProjectConfig`, Worker payload materialization, fresh Org Worker materialization | Deliberately create a new targetless config | Negative/shape tests |

The generic project-state transaction remains byte-oriented; its callers own the validation
proof above. No alternate writer may silently erase, coerce, or capture a Goose override. The
shared mutation primitive reads and validates only after acquiring the project-state lock,
changes only the selected `extensions.<name>` field or Card `workers` field, and atomically
publishes before command success. All five previously floating extension calls are awaited:
Parallel and Beads in guided init, then Beads, Parallel, and MarkItDown in extension setup. A
busy-lock or atomic-publication failure propagates as command failure and no success payload,
path, or message is emitted. Dry-run returns before the writer. Extension subprocesses, runtime
probes, downloads, and interactive prompts occur outside the project-state lock; their failure
causes no config mutation. If an external setup succeeds and the subsequent config publication
fails, the command reports failure without claiming rollback of the external effect. Any future
direct skill-reference mutation must use the shared inventory-then-project route.

### 6.4 Goose leaf adapter

The Goose adapter declares only evidence-supported capabilities. This first table applies when
Goose is enabled:

| Capability | Project output | Full write | --mcp-only | --skills-only | Machine |
| --- | --- | --- | --- | --- | --- |
| Instructions | root AGENTS.md | reconcile | retain | retain | unsupported |
| Skills | .agents/skills/<id>/ | reconcile | retain | reconcile | unsupported |
| MCP | two-file .agents/plugins/drwn | reconcile | reconcile | retain | unsupported |
| Policy hooks | no output | unsupported | unsupported | unsupported | unsupported |
| Recipes/sub-workers | no output | unsupported | unsupported | unsupported | unsupported |
| Goose global config (direct drwn write) | ambient diagnostic only | never write directly | never write directly | never write directly | never write directly |

Target-local renderers produce the approved plugin shape:

    .agents/plugins/drwn/
      plugin.json
      .mcp.json

The plugin is an indivisible MCP delivery unit. It is emitted only when the selected
effective MCP set is non-empty. It never contains hooks, handlers, skills, recipes, or
executable code. T2 owns these leaf bytes and must not change shared adapter, ownership,
or dispatch files.

At the audited Goose source commit the plugin codec supports selected stdio servers only. Before rendering,
a Goose-local raw eligibility validator inspects the uncast definition so permissive upstream
loaders cannot erase unsupported input. Its allowed input keys are exactly `description`,
`transport`, `command`, `args`, `env`, `capabilities`, `notes`, and `optional`;
`description`, `capabilities`, `notes`, and `optional` are metadata and are not emitted.
`transport` must be `stdio`, `command` must be a trimmed non-empty string, `args` must be an
ordered string array when present, and `env` must be a string-to-string map when present.
Every other key—including `cwd`, `url`, `headers`, `provider`, `startupTimeoutSec`,
`timeout`, and `env_keys`—is rejected before consent or mutation. `plugin.json`
contains the stable `drwn` identity and projection-contract version; `.mcp.json` contains
sorted `mcpServers` entries using only non-empty `command`, normalized `args`, and safe literal
`env` values. Although upstream can parse `cwd`, the canonical drwn server model has no cwd
field, so I214 never emits or invents one. Goose expands only the exact
`${PLUGIN_ROOT}` token; every other interpolation syntax is passed literally. Drwn therefore
rejects mixed/interpolated values, rejects Goose's 31 case-insensitively disallowed environment
keys instead of allowing Goose to silently discard them, emits literal configured values, and
omits an exact `${VAR}` reference only when the output key is also `VAR`, so the child inherits
that same name from the launch environment. The reserved `PLUGIN_ROOT` key is rejected
case-insensitively so a selected server cannot replace Goose's plugin-root binding. An alias
such as `OUTPUT=${SOURCE}`, any token in a
literal/mixed value, and any token in command, args, or cwd fails as
`GOOSE_MCP_ENV_INTERPOLATION_UNSUPPORTED`; the adapter never resolves it. Secret values are
never resolved into the file. Goose namespaces runtime identities as `drwn:<server-id>`.

The pinned case-insensitive denylist is: `PATH`, `PATHEXT`, `SystemRoot`, `windir`,
`LD_LIBRARY_PATH`, `LD_PRELOAD`, `LD_AUDIT`, `LD_DEBUG`, `LD_BIND_NOW`, `LD_ASSUME_KERNEL`,
`DYLD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`, `DYLD_FRAMEWORK_PATH`, `PYTHONPATH`,
`PYTHONHOME`, `NODE_OPTIONS`, `RUBYOPT`, `GEM_PATH`, `GEM_HOME`, `CLASSPATH`, `GO111MODULE`,
`GOROOT`, `APPINIT_DLLS`, `SESSIONNAME`, `ComSpec`, `TEMP`, `TMP`, `LOCALAPPDATA`,
`USERPROFILE`, `HOMEDRIVE`, and `HOMEPATH`. A source update changes this contract only through
re-qualification and an architecture amendment.
Any selected HTTP, SSE, platform-provided, header-bearing, or custom-timeout definition
fails the entire selected plan before consent or mutation with
`GOOSE_MCP_TRANSPORT_UNSUPPORTED` or `GOOSE_MCP_OPTION_UNSUPPORTED`; no server is silently
dropped or weakened. Exact JSON bytes and newline normalization freeze at C4.

Full --target=goose reconciles instructions, skills, and MCP. --mcp-only
--target=goose and drwn mcp write --target=goose reconcile only the plugin.
--skills-only --target=goose reconciles only .agents/skills. Unselected bytes, mtimes,
and ownership remain unchanged. Every machine-scoped Goose invocation fails with an
explicit non-mutating unsupported-capability result.

When Goose is disabled, those same mode boundaries select cleanup rather than output:
MCP-only retires the plugin, skills-only removes the `target:goose` skill consumers, and
full does both. Canonical AGENTS.md remains governed by the target-neutral instruction
contract and is never removed merely because Goose was disabled.

The exact operation matrix is:

| Effective Goose state | Mode | Root `AGENTS.md` | `.agents/skills` | Goose plugin |
| --- | --- | --- | --- | --- |
| enabled | full | reconcile through existing V1 instruction planner | reconcile | reconcile |
| enabled | skills-only | retain | reconcile | retain |
| enabled | MCP-only | retain | retain | reconcile |
| disabled | full | retain | remove only `target:goose`; clean after last consumer | clean owned plugin |
| disabled | skills-only | retain | remove only `target:goose`; clean after last consumer | retain |
| disabled | MCP-only | retain | retain | clean owned plugin |

`Retain` means no planning, inspection-specific drift blocker, cleanup, ownership change, byte
change, or mtime change for that surface. Disabled cleanup never materializes a new surface.
An unfiltered full write retains the existing target-neutral V1 instruction behavior regardless
of Goose enablement.

### 6.5 Canonical instructions

Root AGENTS.md remains the canonical project instruction artifact. Goose needs no
.goosehints or target-specific instruction copy for I214.

An enabled full target-filtered Goose write invokes the existing V1 instruction planner: absent
creates canonical `AGENTS.md` and target-neutral V1 ownership, current is a byte/mtime-identical
no-op, and owned drift uses the existing fail/force behavior while preserving foreign bytes.
An enabled partial write and every disabled Goose write retain absent/current/drifted
`AGENTS.md` without even making instruction drift a blocker. An empty desired composition in an
enabled full write removes only the recorded managed block. No Goose operation adds a ledger
consumer or a `target:"goose"` field to V1, and no Goose-targeted write creates or changes the
Claude instruction adapter.

### 6.6 Shared skills

.agents/skills is the default and authoritative drwn-owned Goose skill projection, per
the Owner's `I214-D002` decision. I214 never mirrors Goose skills into .claude/skills or
.goose/skills. Existing target-specific projections remain unchanged.

The historical isolated Goose 1.41.0 collision matrix established this observed precedence subset
for the same skill ID:

    project .agents > project .goose > project .claude > user .agents > user .claude

The audited latest source independently confirms the complete root order: project `.agents`, project
`.goose`, project `.claude`, user `.agents`, Goose config-dir `skills`, user `.claude`,
user `.config/agents/skills`, installed-plugin skill roots, then built-ins. First name wins.

The project .agents copy therefore remains the selected Goose source when Claude and
Goose targets are enabled together. For the exactly qualified audited source/binary identity, other visible
same-ID copies produce a shadowed-source warning with redacted provenance, not a plan
failure. For an unqualified Goose version, any same-ID alternative source fails the
selected skill plan until precedence is re-qualified. A foreign destination at project
.agents/skills/<id> always fails closed regardless of runtime version.

Project-plugin `skills/` directories are not Goose skill roots. I214 therefore preserves the
approved split: `.agents/skills` carries shared skills, while `.agents/plugins/drwn` carries MCP
only. The observer mirrors installed-plugin skill sources without triggering their possible Git
auto-update, rejects blind or symlinked traversal, and treats a changing snapshot as unqualified.

Goose-owned projection eligibility is closed over the existing effective scopes:

| Effective source scope | Goose `.agents/skills` consumer | Existing projection behavior |
| --- | --- | --- |
| `shared` | yes | existing eligible targets remain unchanged |
| `claude-only` | no | Claude and OpenCode keep their existing projections |
| `codex-only` | no | Codex keeps its existing projection |
| `experimental` | no | no production target projection |
| active Card skill | yes | the current resolver explicitly treats it as shared-equivalent |

An explicit include selects a source but never reclassifies its scope. Repository and installed
package sources retain their declared scope; ineligible sources create no Goose plan entry or
consumer. OpenCode remains independently V1-owned at `.agents/drwn/opencode-skills` and never
becomes a consumer of `.agents/skills`. When Goose and OpenCode project the same shared skill,
both copies derive from the same source identity and are byte/mode identical; disabling Goose
may remove its `.agents` copy while OpenCode survives. A `claude-only` `.claude` copy may still
be ambiently visible to Goose when Claude is enabled; report
`GOOSE_SKILL_SCOPE_AMBIENT_VISIBLE` and never mirror, claim, or delete it.

Rules:

- identity is stable skill source plus skill ID, not target path alone;
- every Goose-selected ID satisfies `SharedSkillIdV1`, while every nested path satisfies the
  portable path and collision rules in section 6.2;
- the skill resolver emits a closed `SkillSourceIdentityV1`: Card and machine-Worker
  variants contain layer, locked Card name/version/integrity/tree SHA, and the
  `skills/<id>` manifest-relative path; packaged-repository variants contain layer,
  package/build source identity, scope, and registry-relative path; installed-package
  variants contain layer, package name, active version, scope, and manifest-relative path;
- `sharedProjectionKey` is the lowercase SHA-256 of canonical JSON
  `{schema:"drwn.shared-skill-projection-key",schemaVersion:1,source:SkillSourceIdentityV1,skillId}`;
- the shared-skill `planDigest` hashes the producer pair, sharedProjectionKey, and the sorted
  relative file/container paths, content hashes, and mode classes; it excludes target,
  consumer set, timestamps, and transaction identity so equal sources can merge consumers;
- consumer IDs use target:<registry-key>; I214's executor derives target:goose only;
- one materialized entry may retain multiple present or future consumers;
- a compatible consumer join requires the recognized producer pair, `sharedProjectionKey`,
  `planDigest`, complete sorted path topology, content hashes, and mode classes to be identical;
- every entry in one `sharedProjectionKey` projection has the same sorted consumer set;
- removing one consumer updates every entry and preserves bytes while another consumer remains;
- changing producer, key, digest, topology, bytes, or mode requires every active recognized
  consumer to be selected and agree to the same next projection;
- unknown or unselected consumers permit a byte-identical compatible join and removal of another
  consumer, but block every projection-wide upgrade; an unknown producer pair remains wholly
  read-only under section 6.7;
- active consumer sets are sorted, unique, non-empty, and deterministic; retained entries use
  the empty/current plus non-empty/former split defined by the ledger schema;
- disabling one target removes only that consumer;
- cleanup begins only after the last consumer is removed;
- drift preserves bytes and produces a diagnostic;
- each regular source file becomes one owned file leaf and each required directory is a
  non-owning container marker; source symlinks are rejected rather than dereferenced;
- the root `SKILL.md` must have a valid name matching the selected skill ID and a
  non-empty description; nested `SKILL.md` files are rejected to prevent undeclared
  extra skills;
- alternative same-ID sources are inspected in every source-confirmed latest-audit root above;
- foreign paths and unknown consumers are preserved;
- write-twice is byte-identical.

### 6.7 Separate target-projection ledger

`drwn.write-record@1` remains byte-for-byte unchanged and exclusively owns file-target state,
generated Workers, and canonical AGENTS.md. I214 adds
`.agents/drwn/target-projection-ledger.json` with the strict schema-name/version pair
`schema:"drwn.target-projection-ledger"` and `schemaVersion:1` for adapter-native plugin
leaves and `.agents/skills`. There is no migration or translation between the records. Any
cross-record overlap fails before mutation. Overlap is segment-aware over `PortablePathKeyV1`:
exact equality or either recorded path being an ancestor of the other is rejected. This includes every target-ledger
entry below a V1 `managed-directory`; equality and both prefix directions are contract tests so
recursive V1 cleanup can never reach adapter-owned state.
Before deriving cross-record keys, every transaction that affects target-ledger state verifies
that every existing V1 path is representable by the portable grammar. A nonrepresentable but otherwise
valid V1 record is preserved and triggers `TARGET_PROJECTION_LEGACY_PATH_UNQUALIFIED` as specified
in section 6.2; legacy-only interpretation and mutation do not derive a portable key.

The normative JSON shape is the following closed discriminated schema:

    {
      "schema": "drwn.target-projection-ledger",
      "schemaVersion": 1,
      "scope": "project",
      "generation": PositiveSafeInteger,
      "lastTransactionId": UUID,
      "entries": [
        {
          "path": PortableProjectionPathV1,
          "kind": "file",
          "surface": "goose-plugin" | "shared-skill",
          "producer": { "id": ProducerId, "contractVersion": PositiveSafeInteger },
          "sharedProjectionKey": SHA256,
          "consumers": ConsumerId[],
          "planDigest": SHA256,
          "contentHash": SHA256,
          "executable": Boolean,
          "consentReceiptId": UUID,
          "lifecycle": { "state": "active" }
        }
      ]
    }

The file variant shown is illustrative: `consentReceiptId` is required only for a
`goose-plugin` file and forbidden for `shared-skill`; `sharedProjectionKey` is required only
for `shared-skill` and forbidden for `goose-plugin`. A container variant replaces
`kind:"file"` with `kind:"container"` and forbids `contentHash`, `executable`, and
`consentReceiptId` while retaining the surface-appropriate sharedProjectionKey rule. Either
variant may instead use the lifecycle
`{"state":"retained","reason":"drift"|"nonempty-container","retiredAt":RFC3339UTC,
"formerConsumers":ConsumerId[]}`.

Active entries require a non-empty `consumers` array and forbid `formerConsumers`. Retained
entries require `consumers:[]` and a non-empty sorted `formerConsumers`; only a file may retain
for `drift`, and only a container may retain for `nonempty-container`. Entries sort uniquely by
UTF-8 byte order of path. Consumer arrays and former-consumer arrays are unique and sorted by
the same byte order. `ConsumerId` is exactly `target:<suffix>`, where suffix matches
`[a-z][a-z0-9-]{0,63}`; a well-formed suffix is preserved even when the local target registry
does not recognize it. `ProducerId` matches `[a-z][a-z0-9.-]{0,127}` with no consecutive or
trailing punctuation.

Plugin leaves use the recognized producer pair (`drwn.goose-adapter`, 1). Shared-skill leaves
use (`drwn.shared-skill-projector`, 1). On POSIX the executor normalizes non-executable files
to 0644, executable source files to 0755, and created containers to 0755; the adapter preserves
each source file's executable/non-executable class and the executor treats a mode-class change
as drift. Every object is strict:
unknown keys, kind, surface, malformed value, invalid conditional field, order violation, or
duplicate invalidates the whole V1 ledger. A future kind or surface requires a schema bump.

Container entries permit creation and physically empty bottom-up removal only. They do not own
descendants. `.agents`, `.agents/skills`, and `.agents/plugins` are unowned shared anchors: they
may preexist, may be created as prerequisites, are never ledger entries, and are never removed
by the projection executor. Ownership begins only at `.agents/skills/<id>` and
`.agents/plugins/drwn`. Any such destination that preexists without matching ledger ownership is
foreign. Other unrecorded roots, files, siblings, and descendants remain foreign even when
byte-identical; force cannot claim them. Drifted files and nonempty owned containers remain
recorded as retained so cleanup evidence is not lost.

Unknown ledger versions block every ledger-affecting plan, write, cleanup, repair, and recovery
before mutation. Read-only status may report only schema identity/version. Within V1, a
syntactically valid unknown consumer is preserved opaquely and counts as active. An unrecognized
`(producer.id,producer.contractVersion)` pair makes that valid entry wholly read-only: no
consumer, lifecycle, path, or bytes may be reinterpreted or changed. Unknown kinds are rejected,
not preserved. Malformed namespaces or IDs fail the ledger closed. A no-op write does not
advance generation, transaction ID, or bytes.

### 6.8 Transaction and concurrency model

I214 deliberately does not promise a whole-command transaction. Git fetches, network activity,
machine stores, project-registry changes, acknowledgements, and Goose-owned ambient writes do
not share one rollback authority. The honest sequence is:

1. resolve external inputs without drwn-owned mutation;
2. derive one complete proposed state;
3. evaluate every known deterministic blocker against that state;
4. obtain or validate consent where the plan contains a plugin effect;
5. execute independently durable upstream commits;
6. publish one whole-image project-projection commit; and
7. take a fresh read-only observation.

An upstream commit is never described as rolled back by a later projection failure. The command
returns `projection-retry-required`, reports the committed upstream state without claiming
overall success, and a retry converges idempotently.

Projection mutation uses `.agents/drwn/.target-projection.lock`. The shared lock order is:

`inventory → machine → Goose consent → Org operation → project state → project projection`

Consent and complete preflight occur before the Org lock. Org Worker projection is an
idempotent subordinate commit. Reverse acquisition fails; same-level paths use lexical order;
same-path reentrancy and stale-lock behavior remain explicit tests. Interactive confirmation,
runtime invocation, network access, and long-running source discovery do not occur while the
project locks are held.

`project-state-transaction.ts` atomically covers any selected subset of base config, base lock,
local config, and local lock. Absence is an explicit before/after image. Local-state writers do
not edit `.gitignore`; before either local overlay can be published, the shared executor commits
the permanent monotonic rules `/.agents/drwn/config.local.json` and
`/.agents/drwn/card.lock.local`.

The subordinate project-projection transaction spans every physical image changed by the
prepared plan, including `.gitignore`, `.gitattributes`, vendor trees and sidecars, generated
Worker and hook trees, canonical instructions, MCP and skill trees, stale cleanup, durable
sentinels, the unchanged `drwn.write-record@1`, Goose leaves, and the separate
`drwn.target-projection-ledger@1`. The closed `ProjectionImageV1` union is:

- `absent`;
- `file`: exact bytes, digest, mode class, and durable staged blob;
- `symlink`: literal target bytes; or
- `tree`: a no-follow, sorted manifest of directories, modes, file blobs, and literal symlinks,
  plus a durable staged tree.

There is no generic `directory` placeholder. Every before and after image is durable before the
journal becomes prepared, and the operation list is unique, sorted, exhaustive, and closed over
every V1 `ManagedPathData` kind. Unknown variants, unsafe or overlapping paths, missing blobs,
manifest mismatches, or a changed preimage block publication and preserve evidence.

Recovery compares every current image with its exact before/after image and uses a fixed
intent-derived direction. Materialization rolls forward only while its accepted receipt and
qualification remain current; otherwise it rolls back. Consent-free cleanup rolls forward.
Revoke rolls forward under its exact tombstone and never restores plugin bytes. A state matching
neither image yields `TARGET_PROJECTION_RECOVERY_CONFLICT`. The V1 write record and target ledger
remain separate schemas but commit under the same project journal, so readers never accept a
mixed generation.

Read-only inspection uses journal-before / state / journal-after reads. A stable present journal
returns transaction-in-progress or recovery-required metadata without interpreting mixed
records; an unstable journal returns `TARGET_PROJECTION_INSPECTION_UNSTABLE`. Status, doctor,
dry-run, and watch never lock, recover, invoke Goose, run Git, or access the network.

This journal-backed project path creates no `.bak*`. Existing machine projection and its backup
behavior are unchanged; the hard cut is intentionally project-only.

### 6.9 Physical path safety

Before read, write, rename, or remove:

- canonicalize the allowed project target root or machine-local consent root;
- reject a symlink root;
- walk and reject symlinked intermediate components;
- verify the physical parent remains contained;
- reject traversal and absolute planned paths;
- use no-follow semantics where available;
- re-check containment at publish and cleanup boundaries.

Force permits repair of a known owned leaf. It never claims a foreign root, sibling,
descendant, or symlink.

The delivered Node implementation guarantees this for pre-existing links, ordinary edits, and
cooperating drwn processes serialized by the lock protocol. A malicious same-UID process racing
an intermediate directory replacement between the final pathname check and the filesystem
syscall is outside I214's threat boundary because Node exposes no portable descriptor-relative
`openat`/`renameat`/`unlinkat` chain. Tests still inject swaps before under-lock revalidation and
at every exposed pre-publish/pre-cleanup checkpoint and require a non-mutating refusal. Stronger
protection against an actively hostile same-UID filesystem racer requires native
descriptor-relative primitives and is a declared residual risk, not an implied guarantee.

### 6.10 Git hygiene and committed surfaces

Except for the two permanent monotonic local-overlay safety rules described in section 6.8, all
collision, ledger, consent, and path preflight completes before `.gitignore` changes.
The drwn block always ignores the target-projection ledger, lock, journal, and transaction
staging root using anchored exact internal patterns. The transaction root is an exclusive drwn
internal namespace, unlike output containers, and may be ignored as a subtree. Existing
file-target/Worker ignore behavior remains
byte-compatible when Goose is absent. In normal projection mode Goose/shared entries add an
anchored pattern for each active owned file leaf whose current content and mode match, including only
`/.agents/plugins/drwn/plugin.json`, `/.agents/plugins/drwn/.mcp.json`, and the exact files
inside each owned skill. It never ignores a container, plugin root, skill root, or the whole
`.agents/skills/` root. During disabled/revoke cleanup, a drifted leaf transitions to retained
and loses its generated-file ignore pattern transactionally, so residual bytes become visible to
Git. Drift discovered while the consumer remains active is a write blocker and cannot itself
authorize a `.gitignore` mutation; doctor explicitly reports when that blocked drift remains
ignored pending repair or cleanup. Foreign descendants and siblings are never hidden.

Every complete managed-leaf path is already a validated `PortableProjectionPathV1`, so its exact
Git-ignore pattern is simply `/` plus the stored path. The grammar admits no Git-ignore
metacharacter, escape character, whitespace, `#`, or `!`; no escaping or alternate spelling is
permitted. Deterministic `git check-ignore -v` fixtures prove that each pattern matches only its
leaf and cannot hide a sibling or container. The renderer still defensively validates every
input and fails unexpected or unencodable state with
`TARGET_PROJECTION_GITIGNORE_LITERAL_INVALID` before the hygiene plan exists.

T1 owns a pure `renderGitHygienePlan(snapshot, ledgerPlan, fileTargetPlan)` function and existing-target
byte-parity fixtures. It returns before/after bytes, exact leaf patterns, and any
committed-surfaces blocker but cannot write. T4's executor alone journals and publishes the
returned `.gitignore` bytes. Existing init/config-local callers route their plans through
the same renderer/executor-compatible publication path; none may independently regenerate a
block and erase dynamic ledger entries. Ignore-block before/after bytes participate in the
same recovery journal as projection leaves.

Write-watch uses an explicit dynamic topology. It shallow-watches the project root for
`.agents`; shallow-watches `.agents` for `drwn`, `skills`, and `plugins`; recursively watches
existing `.agents/drwn` and `.agents/skills`; shallow-watches `.agents/plugins` only for
`drwn`; and recursively watches existing `.agents/plugins/drwn`. Existing `AGENTS.md`,
`.claude/CLAUDE.md`, and linked-source behavior remains unchanged. Every possibly absent
structural path also uses the existing bounded 50–500 ms polling interval as an event-loss and
creation backstop. The watcher never creates a root. Creation, deletion, rename, type change,
null-filename event, watcher error, successful or failed run, and stable inspection all rebuild
topology. Startup and every structural rebuild attach the new topology and then immediately run
the journal-before/state/journal-after inspection before publishing suppression state or waiting
for another event; this closes the parent-event-to-recursive-attachment race. A file or symlink
at an expected root retains its parent sentinel, is never followed,
and reports `TARGET_PROJECTION_WATCH_ROOT_UNSAFE`. Native recursive watching and the existing
per-directory fallback have identical semantics; inability to attach either fails live watch
with `TARGET_PROJECTION_WATCH_COVERAGE_INCOMPLETE`.

The existing legacy suppression predicate remains byte-compatible and composes before the new
projection classifier. Projection events have three outcomes. `IGNORE` requires an exact active
ledger file whose no-follow type, content hash, and executable class still match the stable
suppression snapshot, or `.gitignore` at the executor-published hygiene hash. `REFRESH` covers
ledger, lock, journal, staging, and structural-sentinel events. `RECONCILE` covers missing or
drifted active leaves, retained paths, containers, foreign/unknown descendants, unsafe types,
and unattributable directory events. Static membership never suppresses an event. During apply,
projection events coalesce into one post-apply journal-stable refresh while source-input events
still queue reconciliation. A suppression snapshot is published only after two matching
absent-journal reads and a stable state token; a valid journal is transitioning with bounded
retry, and changing journal/state is unstable. Refresh calls read-only `inspect`, never recovery
or mutation. This closes self-trigger loops without masking foreign or drift edits.

Status and doctor classify every structural root as exactly `active-native`,
`active-fallback`, `absent-observed`, `unsafe-type`, or `unavailable`, and classify suppression
as `fresh`, `transitioning`, or `stale` with the redacted ledger generation and transaction ID.
Hostile path and skill names are JSON-escaped. The stable watch/hygiene codes are
`TARGET_PROJECTION_WATCH_ROOT_UNSAFE`, `TARGET_PROJECTION_WATCH_COVERAGE_INCOMPLETE`, and
`TARGET_PROJECTION_GITIGNORE_LITERAL_INVALID` in addition to the ID/collision codes above.

`committedSurfaces: true` with a selected Goose plan that would materialize or retain active
Goose output is explicitly unsupported in I214 and fails before mutation with
`GOOSE_COMMITTED_SURFACES_UNSUPPORTED_I214`. Disabled-target and revoke cleanup remain
permitted: they create no output, retire only clean ledger-owned leaves, and transactionally
remove obsolete leaf-ignore patterns. A portable adoption manifest is separate successor work;
the machine-local ownership ledger cannot be silently reconstructed from committed bytes.
Existing target committed-surface behavior is unchanged when Goose is not selected.

## 7. Consent and ambient-state contract

### 7.1 Default disabled

`registry/target-adapters.json` declares `targets.goose.enabled=false`. Enabling the target records
project intent but does not satisfy plugin-side-effect consent. Goose can be enabled
only by `targets.goose.enabled: true` in the project config. Machine policy cannot enable
or configure Goose. A disabled Goose target is cleanup-only: full or explicitly targeted
writes retire clean owned entries for the selected surfaces, preserve drift/foreign state,
and never materialize new output. With no prior Goose ledger state it is a stable no-op
diagnostic. Selecting Goose at machine scope returns `unsupported:out_of_scope_i214`.

### 7.2 Consent receipt

The receipt is machine-local operator state, outside both ownership records and Git:

    <agentsDir>/drwn/state/target-consent/goose/<projectKey>.json

agentsDir defaults to ~/.agents. projectKey is the lowercase SHA-256 of the UTF-8
canonical project realpath. Receipt directories are mode 0700 and the file mode is 0600.
The accepted variant is the following closed JSON object:

    {
      "schema": "drwn.target-consent-receipt",
      "schemaVersion": 1,
      "receiptId": UUID,
      "decision": "accepted",
      "scope": {
        "kind": "project",
        "canonicalRoot": CanonicalAbsolutePath,
        "projectKey": LowercaseHexSha256
      },
      "target": "goose",
      "effect": {
        "id": "goose.global-plugin-auto-registration",
        "version": 1,
        "disclosureDigest": SHA256
      },
      "binding": {
        "producer": { "id": "drwn.goose-adapter", "contractVersion": 1 },
        "effectPlanDigest": SHA256,
        "gooseVersionRange": "=1.45.0"
      },
      "decidedAt": RFC3339UTC,
      "predecessorReceiptId": UUID | null
    }

There are two closed revoked tombstone variants, both preserving the same schema, scope, target,
effect, receipt ID, and decided-at fields and both forbidding `binding`:

- normal revoke requires `predecessorReceiptId:UUID` naming the accepted receipt it revokes,
  `revocationSource:"accepted-receipt"`, and forbids `invalidReceiptHash`;
- invalid-receipt replacement requires `predecessorReceiptId:null`,
  `revocationSource:"invalid-receipt-replaced"`, and `invalidReceiptHash:SHA256` over the exact
  corrupt bytes replaced under the consent lock.

Every object is strict; UUID, SHA256, path, timestamp, project-key derivation,
conditional-field, and mode validation are normative. An accepted atomic replacement always
creates a new UUID; it links the immediately prior valid receipt, uses null for the first grant,
and uses null for explicit `--replace-invalid` because invalid bytes cannot supply trusted
ancestry. Receipt IDs are never reused; the single current path is not misrepresented as a
durable history store.

No resolved secret or global-config content is stored.

The effect-plan digest covers the canonical plugin root, exact two-file shape, plugin
identity, producer contract, audited Goose source commit, live binary SHA-256, build-provenance
digest, and ambient global-config disclosure. It deliberately excludes
the selected MCP content digest: changing MCP declarations is already governed by project
configuration and does not change the ambient global-config effect. Adding a file class,
executable handler, hook, skill, path, producer contract, or effect version changes the
effect-plan digest and requires new consent.

The candidate-v5 disclosure states that Goose discovers every direct directory child under the
project and user plugin roots, with the project plugin winning a same-name collision, then
filters every discovered name through local/project/user settings. Goose deserializes the entire
winning global `plugins` value as one map; one malformed entry, even for an unrelated plugin,
makes the runtime effective map empty. It then processes the complete settings-enabled discovery
set, not only `drwn`: every discovered lexical root key absent from that map is returned active
and inserted as `enabled:true`. Thus another absent plugin can trigger persistence even when `drwn`
is already registered, and a malformed map can effectively erase disabled entries and reinsert
multiple discovered plugins as enabled.

On any insertion Goose loads only the writable user config. A missing file starts as an empty
mapping and returns before migration. An unreadable file prevents persistence but does not
deactivate the in-memory plugins. Malformed or non-mapping YAML starts from a fresh mapping and
can replace the prior file. Every nonmissing readable file—whether parsed as a valid mapping or
reset fresh—is then run through platform-extension and provider migrations before the `plugins`
value is replaced; migrations may add/update extension definitions, create provider mappings,
and remove legacy provider keys. A migration save occurs before the final plugin-map save and can
therefore persist even if that final save fails. Full YAML serialization can change comments,
formatting, ordering, and alias presentation; the typed plugin `HashMap` does not promise
canonical key order. Other valid top-level values are semantically retained only
when parsing succeeds and migrations do not intentionally change them; unknown per-plugin fields
are lost when the effective map is serialized.

I214 refuses consent grant and plugin-bearing materialization when the writable config exists
but is unreadable, malformed, or non-mapping, using `GOOSE_WRITABLE_CONFIG_UNSAFE`; it never
creates plugin bytes that could expose such state to Goose's fresh-file replacement behavior.
A missing file and a valid mapping are allowed after the operator sees the exact disclosure,
including predicted migration categories. This policy does not alter Goose itself: if an
already-materialized or foreign plugin is loaded outside drwn, Goose retains the behaviors
above. Drwn never authors this global-config mutation directly.

This wording is part of both the disclosure digest and effect-plan digest. The candidate-v5
freeze re-freezes those digests. The existing exact version-range field remains, while the
effect-plan digest supplies the source/binary/build binding because the latest source commit is
untagged and the printed workspace version cannot identify its behavior. No released receipts exist; any receipt minted
against earlier private candidate wording is stale rather than silently accepted. The receipt
schema and effect version remain 1.

The sole grant command is:

    drwn target consent goose --global-plugin-registration

It requires an interactive TTY, displays the canonical root, exact plugin paths/digest,
qualified runtime range, audited source commit, binary/build digests, and effect disclosure, then requires typing
accept <canonicalRoot>. It writes only the receipt. Project config, Card content,
drwn write, dry-run, and Goose cannot mint or refresh consent. The local OS-account
operator is the authority.

The grant command computes the plugin plan read-only and refuses when Goose is absent,
does not match the exact audited source/binary/build identity and version range, the target is disabled, the plan has no MCP plugin, or any
foreign/ledger/path preflight fails, the writable config path is unresolved, or an existing
writable config is unreadable/malformed/non-mapping. It displays aggregate discovery/insertion
counts and predicted migration categories without unrelated names or paths. It never creates
project directories or plugin bytes and never runs a config migration.

Receipt lookup reads only the exact current `<projectKey>.json`; it never scans the consent
directory by receipt ID, old root, or global-config key. Receipt states are missing, current,
stale, revoked, and invalid. An accepted receipt is current only when its internally coherent
scope exactly matches the current canonical root/key and its target, effect/disclosure version,
producer version, effect-plan digest, and installed Goose version range match. There is no clock
TTL. A structurally valid current-scope receipt whose effect, producer, digest, or runtime-range
binding no longer matches is stale before mutation. Malformed JSON, unknown keys/version,
invalid hashes, internally inconsistent root/key derivation, wrong file placement, target
mismatch, or current-project scope mismatch are invalid and fail closed without echoing
contents. If a project moves, the old coherent receipt remains at its old key and the new project
observes `missing`; drwn neither searches for nor interprets the old file. Only an explicit
consent command with `--replace-invalid` may replace an invalid current-path receipt.

When a selected plan contains a plugin and consent is missing, stale, revoked, invalid,
or revoke-pending, the entire write fails before any instruction, skill, plugin,
git-hygiene, record, or journal mutation. A skills-only plan and a plan with an empty
effective MCP set contain no plugin and require no registration consent.

Consent and revoke acquire the machine-local project receipt lock. Projection mutation follows
the full inventory → machine → consent → optional Org operation → project-state → project-
projection order and revalidates receipt, ledger, paths, and hashes under all applicable locks.

Revocation uses:

    drwn target consent goose --global-plugin-registration --revoke

Normal and invalid-receipt revocation require an interactive TTY and typing
`revoke <canonicalRoot>`. Invalid state additionally requires
`--revoke --replace-invalid`; under the consent lock it binds the tombstone to the unchanged
invalid byte hash without trusting or displaying corrupt ancestry. It may clean only
recognized-ledger plugin leaves whose content and modes still match; invalid/unknown ledger,
drift, or foreign descendants are preserved and reported.

Revocation publishes the applicable tombstone before cleanup and then starts a journal whose
intent is `revoke` and whose consent binding matches that tombstone exactly. It removes only
clean recorded plugin leaves. Drifted leaves and foreign descendants remain with retained
ledger entries. Failure leaves revoke-pending, blocks future materialization, and resumes
idempotently under the same tombstone on repeated revoke or recovery. Revoke recovery always
rolls cleanup forward and never restores plugin bytes. Shared skills are unaffected. Goose
global registration is never deleted.

Revocation withdraws drwn authority; it cannot promise runtime disablement when drifted or
foreign plugin content remains. That state is unhealthy and diagnostics provide exact manual
remove-or-disable guidance. Drwn never writes Goose `disabledPlugins` settings to simulate a
successful revoke.

### 7.3 Ambient diagnostics

Status and doctor use a read-only `GooseAmbientClassifierV1` pinned to audited commit
`db7a704446975c88d3b67490c74d33bcd684404e`
path and precedence code. The global file-layer order is `/etc/goose/config.yaml`, each path in
`GOOSE_ADDITIONAL_CONFIG_FILES` from left to right, then Goose's writable user `config.yaml`.
Missing layers are ignored. Unreadable or syntactically invalid YAML layers are skipped as Goose
skips them and are reported separately. A readable non-mapping scalar/list top level is likewise
skipped because Goose parses each layer as a YAML mapping. Among successfully parsed mapping
layers, each later layer that
contains a top-level `plugins` value replaces that value wholesale; a later layer without the
key leaves the earlier winner intact.

A Unicode-readable `PLUGINS` environment variable is the sole winning source and never falls
back to file layers. Goose first parses it as JSON and, when that fails, as a boolean/numeric
primitive or string. If the operating-system value is present but not valid Unicode, Rust
`env::var` fails and Goose falls through to file layers. File values are deserialized from YAML;
a YAML string is reparsed using the same JSON/primitive/string path. After source selection and
scalar reparsing, Goose deserializes the entire winning value as one
`HashMap<String, PluginConfigEntry>` before any path relevance decision. The outer value must be
an object with string keys; every entry value must be an object containing a required boolean
`enabled`. Unknown entry fields are accepted, and `{}` is valid. A nonobject, nonstring YAML key,
null/nonobject entry, missing `enabled`, or nonboolean `enabled` invalidates the whole map. A
missing `plugins` value and a malformed value both yield an empty runtime map, but diagnostics
distinguish absence from malformed input. In particular, one malformed unrelated entry can erase
every otherwise valid disabled entry in the effective runtime view.

The writable path algorithm is exact for the audited source. Goose reads `GOOSE_PATH_ROOT` with
`var_os` and accepts it only when it is absolute. Empty and relative values are ignored and use
the platform default. An absolute non-Unicode path is accepted by Goose, but drwn cannot safely
round-trip it through Node while Goose later creates lossy plugin-map strings; consent and plugin
publication therefore fail closed unless the path and expected registration key are exactly
representable. A representable absolute root yields
`<GOOSE_PATH_ROOT>/config/config.yaml`. Otherwise the qualified macOS and Linux builds use
etcetera 0.11 XDG semantics:
absolute `XDG_CONFIG_HOME` yields `<XDG_CONFIG_HOME>/goose/config.yaml`, while unset, empty, or
relative `XDG_CONFIG_HOME` yields `<resolved-home>/.config/goose/config.yaml`. Unresolvable home
or an unsupported platform is explicitly unqualified. The audited macOS config path never uses
`~/Library/Application Support`.

Settings are a separate classifier. With an accepted, exactly representable absolute
`GOOSE_PATH_ROOT`, user settings are `<GOOSE_PATH_ROOT>/.config/goose/settings.json`; otherwise they are
`~/.config/goose/settings.json`. Project and local settings are exactly
`<project>/.config/goose/settings.json` and `settings.local.json`. Precedence is local,
project, user. At the first scope mentioning plugin name `drwn`, `disabledPlugins` wins over
`enabledPlugins`; if neither list mentions it, evaluation continues, then defaults enabled.
Each readable settings file must be a JSON object; missing `enabledPlugins`/`disabledPlugins`
arrays default empty and unknown fields are accepted. Malformed files or wrong field shapes are
skipped by Goose and reported as warnings alongside the resulting lower-precedence/default
decision.

Discovery and settings precede plugin-map lookup. The classifier mirrors Goose by enumerating
direct children of `<project>/.agents/plugins` first and the source-exact user plugin root
second. With an accepted absolute `GOOSE_PATH_ROOT`, that root is
`<GOOSE_PATH_ROOT>/.agents/plugins`; empty and relative values use
`<resolved-home>/.agents/plugins`. There is no supported relative user-plugin root. An absolute
non-Unicode value is a qualification blocker rather than being silently replaced or lossily
rendered. Discovery retains `is_dir`
entries with Unicode-readable names only and lets the project child win a same-name collision.
Unreadable roots/entries and non-Unicode names are skipped as Goose skips them and reported only
as aggregate warnings. It applies the settings decision to every discovered name. It never
descends into, canonicalizes, or
renders an unrelated discovery directory, but direct-child enumeration and `is_dir` checks are
required for source equivalence.

Goose then loops over the complete settings-enabled discovery set. Every discovered lexical
root key absent from the effective map is inserted as `enabled:true`, returned active, and makes the
map dirty. A settings-disabled `drwn` is excluded, but unrelated enabled discoveries can still
trigger a write. A malformed whole map makes every enabled discovery absent. A dirty write loads
only the writable user config and follows the full-file parsing, migration, preliminary-save,
and serialization behavior disclosed in section 7.2. Persistence failure does not change the
active vector returned for that invocation.

The classifier performs this computation read-only and reports an exact aggregate discovered
count, settings-enabled count, insertion count, whether `drwn` itself would be inserted, the
writable-config state, and predicted migration categories. It never reports unrelated names,
paths, or values. If complete discovery enumeration or writable-config inspection is impossible,
the write prediction is `unknown`, never false. Status and doctor never perform a migration or
write.

The classifier computes the expected lexical absolute plugin key and, only when the path
exists safely, its canonical identity. It never invokes Goose. Registration states are
ordered, so one input has one primary result:

| Priority | Predicate | State | Doctor severity |
| --- | --- | --- | --- |
| 1 | The whole winning `plugins` value fails `HashMap<String,{enabled:boolean,...}>` deserialization | `malformed` / `GOOSE_PLUGIN_MAP_MALFORMED` | error |
| 2 | The exact expected key exists and its path is symlinked, foreign, ledger-unowned, or its manifest/content differs from the ledger | `foreign` | error |
| 3 | Exact expected key exists with `enabled:false` | `disabled-global` | warning when no plugin is expected; error when current consent/output expects it |
| 4 | Exact expected key exists with `enabled:true` and owned bytes are current | `current` | advisory |
| 5 | No exact expected key exists | `absent` | advisory before first Goose load; warning if current evidence says registration should exist |

The exact lexical key alone controls the pinned runtime lookup. A projected plugin disabled by
settings adds `disabled-local`, `disabled-project`, or `disabled-user` with the winning scope. A
revoked or disabled target with a residual exact registration adds
`residual-user-registration` warning. Residual plugin bytes without current consent, invalid
consent, ledger conflict, or recovery conflict remain errors even though unrelated global
registration is user-owned. Drwn does not scan arbitrary map keys for filesystem aliases or old
project roots; those entries remain user-owned and redacted.

The report keeps `projection`, `consent`, `transaction`, `registration`, `settings`,
`discovery`, and `writableConfig` as separate axes; the ordered table chooses only the primary
registration state. Thus an absent registration can coexist with foreign project bytes, an
unrelated aggregate insertion prediction, or an unsafe writable sink, and none overwrites the
others.

Whole-map structural validation necessarily parses every config-map entry, but config-key
relevance, path probing, and rendering occur only afterward. Only the exact expected current-
project key is config-path-relevant. Valid unrelated config-map entries are never printed,
canonicalized, statted, or otherwise probed.
Source-equivalent discovery separately enumerates direct child directories as described above,
but renders only aggregate counts and the `drwn` insertion bit.

Evidence includes the winning layer label, whole-map status, redacted exact expected path,
expected-path lexical/canonical identity match bit, enabled bit, `drwn` settings winner,
aggregate discovery/enabled/insertion
counts, `drwn` insertion bit, predicted write state, writable-config state, predicted migration
categories, qualification, and reason code—never arbitrary YAML, unrelated names/paths/keys/
values, headers, environment values, or secrets. Malformed-map status does not derive from
relevance and uses stable code `GOOSE_PLUGIN_MAP_MALFORMED`. Unsafe writable config uses
`GOOSE_WRITABLE_CONFIG_UNSAFE` and repair guidance. `status` renders both while preserving exit 0
unless structural project inspection throws a `DrwnError`; `doctor` treats a malformed effective
map as an error and applies the operation-specific writable-config severity in section 7.4.
Neither command creates, locks, recovers, migrates, or rewrites config, settings, receipts,
ledger, or plugin bytes.

### 7.4 Runtime and provider qualification

Runtime/source identity and provider class are separate axes. The exact audited source contract
plus binary digest/build provenance gates the ambient global-config effect contract, consent
grant, and plugin publication. Provider class gates only
runtime-use claims: pinned plugin discovery and auto-registration are provider-independent, so a
provider change never stales a receipt or blocks filesystem cleanup.

| Surface | Exact audited source/binary identity | Mismatched identity | Unknown or absent runtime | Provider-unqualified |
| --- | --- | --- | --- | --- |
| target-neutral `AGENTS.md` | allow | allow with `GOOSE_RUNTIME_UNQUALIFIED` | allow with `GOOSE_RUNTIME_UNKNOWN` or `GOOSE_RUNTIME_ABSENT` | allow with `GOOSE_PROVIDER_UNQUALIFIED` |
| collision-free shared skills | allow | allow with `GOOSE_RUNTIME_UNQUALIFIED` | allow with `GOOSE_RUNTIME_UNKNOWN` or `GOOSE_RUNTIME_ABSENT` | allow with `GOOSE_PROVIDER_UNQUALIFIED` |
| shared skill with another same-ID Goose-visible source | allow with qualified shadow warning | block `GOOSE_SKILL_PRECEDENCE_UNQUALIFIED` | block the same | provider does not change precedence |
| plugin-bearing apply | allow only with current receipt | block entire transaction with `GOOSE_RUNTIME_VERSION_UNSUPPORTED_FOR_PLUGIN` | block entire transaction with `GOOSE_RUNTIME_REQUIRED_FOR_PLUGIN` | allow with current receipt, but make no invocation claim |
| consent grant | allow after normal preflight | refuse with the version blocker | refuse with the runtime-required blocker | allow with `GOOSE_PROVIDER_UNQUALIFIED`; provider is not receipt-bound |
| disabled cleanup, cleanup recovery, revoke, or revoke recovery | allow | allow | allow | allow |
| `status` | exit 0 and report qualification | exit 0 and report plugin blocker/unqualified interpretation | exit 0 with absent/unknown reason | exit 0 with warning |
| `doctor` | existing state severity | error when plugin output or accepted consent exists or desired plugin apply is blocked; otherwise warning | same | warning/exit 0 absent another error |

For a full plan containing a plugin, runtime qualification precedes consent-state evaluation;
failure publishes no instructions, skills, plugin, hygiene, receipt, ledger, or journal. Missing,
stale, revoked, or invalid consent is retained as a secondary blocker. Cleanup and revocation
remain version/provider-independent so an unavailable runtime cannot strand clean owned bytes.
Materialize recovery is still executable under any runtime state, but it rolls back rather than
forward when runtime qualification makes the accepted receipt non-current. The stable
qualification warnings are exactly `GOOSE_RUNTIME_UNQUALIFIED`, `GOOSE_RUNTIME_UNKNOWN`,
`GOOSE_RUNTIME_ABSENT`, and `GOOSE_PROVIDER_UNQUALIFIED`; plugin and precedence blockers retain
the exact codes in the table.

Config-path qualification is a separate gate and is not a receipt binding. The receipt consents
to the ambient global-config effect, not one environment-selected global config location.
`GOOSE_CONFIG_PATH_UNRESOLVED` blocks consent
grant and plugin-bearing materialize before mutation because the global-config effect cannot be
bound to one writable config path. It does not block consent-free instructions, collision-free
skills, disabled cleanup, cleanup recovery, revoke, or revoke recovery. `status` exits 0 and
reports the reason. `doctor` exits 1 when plugin output or accepted consent exists, or desired
plugin apply is blocked; otherwise it reports a warning. A materialize journal with an
unresolvable path remains recoverable but rolls back under this independent qualification gate;
receipt current/stale classification remains exactly the closed section 7.2 rule.

Writable-config safety is another non-receipt qualification gate. A missing writable user file
is safe. An existing file must be Unicode-readable and parse as a YAML mapping; otherwise
`GOOSE_WRITABLE_CONFIG_UNSAFE` blocks consent grant and plugin-bearing materialize before any
project mutation and provides repair/backup guidance. A valid mapping is allowed with the
disclosed platform-extension/provider migration categories and full-serialization warning.
The blocker does not affect consent-free projection, disabled cleanup, cleanup recovery, revoke,
or revoke recovery. `status` exits 0. `doctor` exits 1 when plugin output or accepted consent
exists, or desired plugin apply is blocked; otherwise it reports a warning. Materialize recovery
rolls back while this gate is unsafe. Receipt validity is unchanged because writable file
contents and path are not receipt-bound.
Direct-provider parity remains unqualified; only the recorded CLI-harness MCP invocation may be
claimed until a separate live matrix proves more.

Positive runtime activation requires one concrete strict native profile: a fresh direct CLI
session at the canonical project root; process and session CWD equal that root; profile enabled;
no recipe, resume/fork, `--no-profile`, or CLI extension flags; no ACP override; unique effective
extension keys after applying `explicit name ?? config-map key`; `AGENTS.md` present in
`CONTEXT_FILE_NAMES`; `GOOSE_STATE_MACHINE` unset or false; no bang-shell message that selects
the state-machine reply path; an observed `skills` platform
extension; and non-chat mode for MCP or `load_skill` invocation claims. The observer records the
actual vector and environment rather than simulating Goose.

The runtime observer models skills and MCP independently:

- legacy agent loop: project skills require the effective `skills` extension; project-plugin MCP
  follows the entry point's extension selection;
- experimental state machine (`GOOSE_STATE_MACHINE` equal to `1`, `true`, `TRUE`, or `yes`, or a
  bang-shell dispatch for that reply):
  `SkillOperation` discovers skills directly from the current session CWD, while MCP remains
  extension-selected; this mode is outside the positive support envelope;
- resume, fork, term, review, ACP, Desktop, scheduler, gateway, Summon, orchestrator, restore, and
  chat receive separate skill and MCP verdicts—never one combined activation claim;
- ACP exact-name replacement is deterministic, but distinct names that normalize to the same
  extension key remain unqualified because concurrent load order can decide the winner;
- Summon children carry/filter the parent MCP vector and use a canonical contained working
  directory, but `is_subagent` installs an empty HookManager, so they do not perform hook-triggered
  project-plugin registration;
- the deleted standalone `goose-server` HTTP entry point has no contract. ACP stdio and
  HTTP/WebSocket transports share one ACP session-selection contract;
- the `goose tui` launcher can select a mutable external `@aaif/goose@latest` runtime. I214 tests
  launcher selection only and reports TUI activation unverified unless that artifact is separately
  pinned and audited.

Latest Goose also loads the resolved agents-home `AGENTS.md`—normally
`~/.agents/AGENTS.md`, or `<GOOSE_PATH_ROOT>/.agents/AGENTS.md` for an accepted override—as a
global hint when `AGENTS.md` is enabled and can
load canonical, working-directory-contained subdirectory hints after relevant tool arguments.
Those are ambient instruction sources. They never become drwn-owned projection and must appear
as separate observer evidence; a root `AGENTS.md` current state alone does not prove exclusive or
complete instruction activation.

## 8. Hook and provider policy

Goose policy-hook projection is unsupported and out of scope for I214 at both project
and machine scopes. The adapter retains an explicit hooks capability discriminator that
returns unsupported:out_of_scope_i214. I214 adds no Goose hook files, event codecs,
runtime-selection value, public hook-policy export, hook composer, or hook enforcement
claim.

SessionStart evidence remains historical qualification input only. PreToolUse,
timeout/crash behavior, batch behavior, and provider bypass are not I214 acceptance
criteria and cannot appear as delivered support. A successor issue may re-probe and
design hooks without changing the adapter ABI.

## 9. Security and ownership invariants

- Generated artifacts contain secret references, never resolved values.
- Logs, evidence, status, and doctor redact sensitive values.
- No package installation, remote import, or implicit evaluation is introduced.
- Foreign .agents/plugins/drwn fails closed even when bytes are identical.
- Mixed-owned directories are never recursively removed.
- Drifted managed content is preserved on removal.
- Unknown descendants and siblings are preserved.
- Traversal and all non-racing symlink cases cannot escape the managed root; the documented
  malicious same-UID intermediate-swap race remains outside I214's portable Node threat model.
- Partial failure is recoverable.
- Concurrent writes in the delivered version cannot produce bytes/record divergence.
- Goose's complete global plugin-map/migration/serialization effect remains ambient and user-
  owned; drwn discloses and diagnoses it but never directly authors that config write.

## 10. Data flow

For Worker payload materialization, the landed Worker 1.3 gate first validates the outer payload,
closure/lock, and exact rederived runtime-admission envelope, then verifies the store-export
length and digest. Neither step publishes state. Every other entry point begins directly at step
1 below.

1. Resolve external inputs without publishing drwn-owned state; record any unavoidable external
   effect as outside the rollback domain. A materializer carries only already-admitted payload and
   verified store bytes past this boundary.
2. Load and strictly validate project config, canonical state, target intent, file-target and
   adapter registries, and mode without widening the file-renderer view.
3. Derive the complete proposed base/local state and ask pure adapters for declared read sets and
   deterministic plans.
4. Snapshot every physical input and output image, then compute target-neutral instructions,
   shared entries, MCP/skills/hooks, vendor and Worker trees, stale cleanup, `.gitignore`,
   `.gitattributes`, V1, the target ledger, sentinels, and watch topology.
5. Evaluate every known blocker: capability support, aggregate Goose discovery, writable-config
   safety, runtime identity, consent state, ledger schema, cross-ledger overlap, physical paths,
   foreign collisions, shared-consumer compatibility, normalized extension keys, and the
   unchanged Worker 1.3 admission/store identity carried from the pre-effect gate.
6. Dry-run stops here. A mutating command obtains required consent, then publishes each declared
   upstream commit independently. Failure stops before project projection; a later projection
   failure reports the committed upstream state as retry-required rather than rolled back.
7. Acquire applicable locks in the fixed
   `inventory → machine → Goose consent → Org operation → project state → project projection`
   order and revalidate the complete proposed-state token and intent-specific receipt/tombstone.
8. Commit the selected base/local state transaction when required, then prepare one projection
   operation list containing exact before/after absent, file, symlink, or tree images.
9. Stage and durably sync every referenced blob/tree and the journal before the first projection
   publication.
10. Publish the exhaustive ordered project operation list. Clean only ledger-eligible paths;
    never recursively remove a mixed-owned container or create a project `.bak*`.
11. Verify every postimage and make the V1 record plus separate target ledger generation durable
    under the same journal before marking committed and removing journal/staging evidence.
12. Take one fresh read-only observation of projection, V1, ledger, consent, transaction, watch,
    runtime selection, writable config, and ambient state.

Dry-run stops after step 5 and produces no receipt, directory, lock residue, or runtime
configuration change. Missing/stale/revoked consent is reported as an apply blocker in the
otherwise exact plan; it does not prevent read-only plan computation. Structural failures
such as an unknown ledger, unsupported transport/capability, foreign collision, or unsafe
path still make dry-run fail because no valid apply plan exists.

## 11. Failure behavior

| Failure | Required outcome |
| --- | --- |
| Unsupported capability | Explicit non-mutating error or documented degradation |
| Missing/stale consent | No plugin bytes; actionable diagnostic |
| Foreign root/leaf | Fail closed; force does not claim it |
| Owned drift | Preserve bytes; require explicit repair policy |
| Traversal or detected symlink | Fail before any outside-root access within the stated threat boundary |
| Interrupted publish | Recover from journal to a consistent state |
| Concurrent write | Serialize or deterministic busy result |
| Unreadable/syntax-invalid global config layer | Match Goose by skipping the layer; report read-only warning; no rewrite |
| Malformed whole winning plugin map | Treat the runtime map as empty; status exit 0 and doctor error `GOOSE_PLUGIN_MAP_MALFORMED`; predict aggregate enabled-discovery reinsertion/write behavior; no rewrite by drwn |
| Unreadable/malformed/non-mapping writable user config | Block consent/plugin materialize with `GOOSE_WRITABLE_CONFIG_UNSAFE`; status/doctor remain read-only; allow cleanup/revoke |
| Invalid projector path or nonportable relevant V1 path | Fail before plan/hygiene/mutation with the stable path or legacy blocker; never rename or omit |
| Extension/Card project-config publication failure | Propagate command failure without success output; preserve competing config mutation; do not claim rollback of prior external effects |
| Projection failure after an upstream commit | Preserve and report committed upstream state; return `projection-retry-required`; retry idempotently; never claim whole-command rollback or success |
| Mismatched/unknown/absent runtime with plugin-bearing apply or consent grant | Block before any mutation with the surface-specific runtime code |
| Mismatched/unknown/absent runtime with consent-free instructions or collision-free skills | Allow with explicit qualification warning |
| Unqualified runtime plus same-ID alternative skill source | Block because precedence is unqualified |
| Unresolvable Goose writable config path | Block plugin consent/materialize with `GOOSE_CONFIG_PATH_UNRESOLVED`; allow consent-free projection and cleanup/revoke; status reports and doctor applies the conditional error rule |
| Unqualified provider | `GOOSE_PROVIDER_UNQUALIFIED` warning and support-claim downgrade; does not block or alter projection, consent grant, plugin apply, cleanup, or receipt validity |
| Unknown ledger schema | Block all ledger mutation, cleanup, and recovery |
| Cross-ledger path overlap | Fail before mutation; neither record is rewritten |
| Revocation cleanup failure | Persist revoke-pending and resume idempotently |
| Hook or machine-scope request | Explicit unsupported:out_of_scope_i214 result |
| Active Goose output plus committedSurfaces | Explicit non-mutating unsupported result; disabled/revoke cleanup is still allowed |

## 12. Contract-freeze checkpoints

### C0 — G1 evidence and decision freeze

- Analysis 134 provenance, runtime identity, historical and post-rebase baseline evidence, the
  landed-I265 seam audit, and the T1–T5 packet register are preserved.
- The Owner explicitly decides the separate-ledger, consent/disclosure, ASCII projector hard
  cut, writer closure, hook-exclusion, and machine-exclusion contracts.
- T5 reviews the exact candidate hashes independently before G1 submission.

### C1 — Adapter ABI freeze (T1)

- Complete the closed-seam inventory before editing production files.
- Freeze TargetProjectionAdapterV1, read-set, plan, ambient-observation, and capability
  schemas with deterministic fixtures.
- Prove unknown ABI and unsupported capability failures.
- Preserve Worker 1.3 Card declaration fields and validation, package identity 1.3.0,
  declaration-driven `store.minDrwnVersion >= 1.3.0`, runtime-admission derivation entrypoint, and
  all pre-I214 required release members while appending the adapter registry contract.
- T3 confirms future-consumer compatibility without Pi production work.

### C2 — Executor, ledger, and consent freeze (T4)

- Keep drwn.write-record@1 byte-for-byte and behaviorally unchanged.
- Freeze the separate target-projection ledger, cross-ledger overlap rejection,
  executor, lock order, journal, receipt, revocation, and path-safety contracts.
- Prove collision, drift, cleanup, consumer-set, recovery, concurrency, consent, and
  symlink behavior under failure injection.

### C3 — Legacy integration and parity freeze (T1)

- Route existing targets through the pure legacy planner and shared executor seam.
- Prove byte, warning, filtering, drift, force, cleanup, dry-run, and command parity.
- Close every central switch that could fall through for Goose.
- Prove Worker materialization still rejects an invalid admission envelope before store or I214
  preflight, while a valid envelope plus a late generic I214 blocker has zero persistent effects.

### C4 — Goose leaf output freeze (T2)

- Freeze instruction-capability and shared-skill conformance fixtures against T1/T4 plans, plus
  the exact two plugin-file bytes. T2 owns no instruction renderer, V1 mutation, or shared
  projector.
- Assert that hooks, recipes, executable plugin code, machine output, and global-config
  writes are absent.
- T2 changes no shared-hotspot or executor-owned file.

### C5 — Diagnostics and candidate freeze (T4, then T5)

- Freeze ambient global-registration and ledger/consent diagnostics against C4 bytes.
- Run deterministic qualification, typecheck, security cases, and approved live probes.
- T5 reviews the immutable integration SHA and evidence bundle from a clean checkout.

Any material post-freeze schema change returns to the Owner for an architecture
amendment and repeats invalidated review and qualification.

## 13. TDD and qualification strategy

Every implementation behavior follows RED, observed failure, minimal GREEN, regression,
and refactor.

### 13.1 Deterministic contract tests

- target recognition, project-only enablement, disabled cleanup-only reconciliation, and
  explicit unsupported capabilities;
- legacy target byte-for-byte non-regression;
- Worker 1.3 Card declaration validation and round-trip preservation; deployable-closure
  completeness; admission-before-store/preflight priority; valid-admission/late-I214-blocker zero
  effects; targetless Worker-config derivation; and envelope/lock/materialization round trips;
- additive package/release qualification retaining package 1.3.0, the exact derivation command,
  every existing `REQUIRED_RELEASE_MEMBERS` entry, separate membership assertions for the exact
  four runtime-admission paths, retired Buzz delivery Card absence, required Buzz tooling,
  accepted vector/receipt chains, and production parsing of the new sidecar in initial and
  recovery/download artifacts;
- file- and directory-shaped adapter fixtures;
- the 18-case enabled/disabled × full/MCP-only/skills-only × absent/current/drifted
  `AGENTS.md` matrix, plus unfiltered full, empty composition, foreign bytes, force, and
  unsupported machine-scope cases; enabled full has no adapter-native `AGENTS.md` entry and
  produces only target-neutral V1 instruction ownership;
- shared skill per-file plans, four-scope eligibility, Card shared-equivalence, Goose/OpenCode
  coexistence, consumer sets, latest-source-confirmed precedence, unqualified-identity collision refusal,
  disable, and last-consumer cleanup;
- unchanged write-record V1 fixtures plus exact and ancestor/descendant cross-ledger overlap rejection;
- target-projection ledger validation, deterministic ordering, unknown-version
  rejection, opaque unknown consumers, strict unknown-kind rejection, and read-only unknown
  producer-contract pairs;
- source-identity-derived shared projection keys, consumer derivation by the executor, and
  refusal of forged or mismatched consumer identities;
- compatible `target:goose` join to an identical recognized projection with opaque
  `target:pi`, Goose removal while Pi remains, identical consumer sets across every tree entry,
  and blocked key/digest/topology/hash/mode upgrades when any unknown or unselected consumer
  cannot agree;
- `SharedSkillIdV1`; exact ASCII `PortableProjectionPathV1` segment/depth/path bounds; every
  allowed byte and fixed hidden name; Windows-reserved/forbidden names; Unicode rejection
  including sigma/final-sigma, Kelvin sign, sharp-s, and emoji; current 138-node corpus;
  ledger/journal validation; ASCII case aliases; conservative nonportable-V1 blocker; exact
  unescaped anchored Git-ignore leaves; stable ID/path reason codes; JSON-escaped hostile input;
  and `git check-ignore -v`;
- foreign root/sibling/descendant preservation;
- owned drift and force limits;
- traversal, root/intermediate/leaf symlink rejection, and checkpointed intermediate-swap refusal;
- interrupted materialize/cleanup/revoke recovery, revoke-never-restores assertions, and
  concurrent writes in the delivered version; unfiltered materialize recovery both updates V1
  instructions and retires disabled Goose entries;
- closed absent/file/symlink/tree journal images, every V1 `ManagedPathData` kind, exhaustive
  operation inventory, fixed recovery direction, project-only no-`.bak*` behavior, unchanged
  machine backups, journal-stable read-only inspection, receipt
  missing/current/stale/revoked/invalid states, exact-current-key-only lookup, internally
  inconsistent/wrong-placement invalidity, project-move-as-missing, no old-receipt scan, typed
  acceptance, replacement,
  invalid-receipt revocation,
  revoke-pending recovery, lock order, and dry-run purity;
- deterministic Goose plugin bytes;
- non-executable 0644 and executable 0755 skill-file preservation;
- stdio codec normalization; literal, inherited, aliased, templated, and all disallowed env-key
  cases; and fail-closed HTTP/SSE/platform/header/timeout cases;
- status/doctor parity and redaction;
- project/`.agents` sentinels, absent-root creation/deletion/recreation, native/fallback watcher
  attachment, create-complete-tree-during-attach and delete/recreate races, null filenames/errors,
  exact hash/mode suppression, root-coverage and suppression-state diagnostics, unstable journals,
  foreign-descendant visibility, retained-path visibility, legacy-only suppression/hygiene
  parity, and selected-Goose committedSurfaces refusal;
- removal of the unused Beads direct writer; explicit Promise-returning Parallel, Beads, and
  MarkItDown helpers; all five init/setup calls awaited; exact human/JSON path output; no success
  on busy or atomic failure; sequential guided init; dry-run purity; external-effect lock
  boundaries; exact Goose-override preservation; and deterministic Card-versus-extension/Goose
  concurrency;
- default and absolute/empty/relative XDG; absent, representable absolute, ignored empty/relative,
  accepted-but-unrepresentable absolute non-Unicode `GOOSE_PATH_ROOT`; unresolvable config paths,
  mapping/non-mapping config layers and Unicode/non-Unicode `PLUGINS` JSON/scalar/string shapes;
  whole-map invalidation
  by an unrelated malformed entry; missing-versus-malformed diagnostics; project-over-user same-
  name discovery; platform-default user-plugin roots for empty/relative `GOOSE_PATH_ROOT`;
  unreadable roots/entries and non-Unicode child-name skipping; registered `drwn` plus another
  absent discovery; settings missing-array defaults, accepted unknown fields, wrong-shape skip,
  and disabled exclusions;
  malformed-map reinsertion of every enabled discovery; aggregate redaction; missing, unreadable,
  malformed, valid-current, and valid-legacy writable user config; malformed-to-fresh platform-
  migration output; full YAML serialization with possible ordering/comment/alias presentation
  changes; platform/provider migrations; migration-save success followed by plugin-save failure;
  write-failure-still-active prediction; unsafe-config blocker; candidate-
  v5 disclosure/effect-digest staleness; exact/mismatched/unknown/absent runtime; stable
  qualification codes; config-path-independent receipt validity; provider qualification; and
  every operation row in section 7.4;
- legacy-loop versus state-machine skill activation with `GOOSE_STATE_MACHINE` unset, false, and
  each enabling value plus per-reply bang-shell selection; skill and MCP verdicts asserted separately across fresh, no-profile,
  recipe, resume, fork, term, review, ACP, Desktop, scheduler, gateway, Summon, orchestrator,
  restore, and chat; main-Agent versus Summon hook registration; ACP transport parity;
  deterministic exact-name replacement; normalized-key and config-map-key name collisions;
  external-TUI launcher selection without runtime activation claims; global and contained
  subdirectory hints; and negative project-plugin-skill discovery;
- Open Plugins `exclusive:true` with default plus custom roots, deeper-than-immediate raw nested
  skill names, project-plugin `skills/` exclusion, and unstable staged-install snapshots;
- explicit no-hook, no-machine-output, no-recipe, and no direct drwn-authored global-config-write
  assertions;
- write-twice and install/remove/install idempotence.

### 13.2 Filesystem/runtime integration

Use temporary project, home, agents, XDG config/data/state/cache, and context-name roots.
Exercise a fake Goose plugin loader, deterministic local MCP server, child-process
cleanup, complete sandbox before/after diff, and negative security cases. No real user
home, global config, or credential store participates.

### 13.3 Opt-in live qualification

Each live claim records source commit, build-provenance digest, binary path/digest, printed
version, provider class, candidate SHA,
fixture digest, isolated state paths, exact command, exit status, redacted evidence, and
filesystem before/after diff.

Minimum matrix:

- root AGENTS.md ingestion;
- shared skill discovery and exact source;
- project plugin discovery;
- deterministic MCP invocation;
- state-machine-disabled legacy skill activation and state-machine-enabled negative-envelope
  behavior, with skills and MCP recorded separately;
- ACP stdio versus HTTP/WebSocket session-selection parity;
- TUI launcher selection only, unless a separately pinned npm artifact receives its own audit;
- ambient global-config discovery/insertion/migration/serialization effect;
- cleanup plus stale registration diagnostic.

Hook events, timeout/crash enforcement, batch enforcement, and provider bypass are not
part of the I214 live matrix. They remain historical evidence or successor-issue work.

Live success never substitutes for deterministic CI.

## 14. File ownership and integration order

### T1 exclusive shared hotspots

- cli/core/types.ts
- cli/context.ts adapter-sidecar discovery/loading boundary
- cli/core/targets.ts
- cli/core/paths.ts
- cli/core/machine-config.ts
- cli/core/mcp.ts
- cli/core/effective-state.ts
- cli/core/user-config.ts
- cli/core/config-local.ts
- cli/core/card-manifest.ts, preserving I265 `runtimeAdmission` and
  `applicationRequirements` fields and validation through registered-target changes
- cli/core/card-project.ts
- cli/core/card-capture.ts
- cli/core/card-diff.ts
- cli/core/project.ts, including strict registered-target overrides
- cli/core/project-writes.ts, preserving project schema through every mutation
- cli/core/extensions/project-config.ts plus cli/core/extensions/parallel.ts,
  cli/core/extensions/beads.ts, and cli/core/extensions/markitdown.ts Promise-returning locked
  wrappers; remove the unused Beads direct writer
- registry/config.json read-only byte-parity fixture and new registry/target-adapters.json
- cli/core/sync.ts and cli/core/sync-project-instructions.ts planning/dispatch
- cli/core/skills.ts shared wiring
- cli/core/card-skill-resolver.ts shared-skill source-identity derivation
- cli/core/projection-ownership.ts legacy partial-selection semantics
- cli/core/git-hygiene.ts pure plan rendering and legacy byte parity only
- cli/core/write-watch.ts exact ledger-derived suppression and refresh wiring
- cli/core/hook-generator/runtime-selection.ts and cli/core/hook-generator/sync-hooks.ts,
  legacy planning only; no Goose runtime change
- cli/core/worker-materialize.ts, factoring only as needed to compose I214 preflight while
  preserving the complete I265 admission gate, targetless config derivation, and
  admission → store identity → preflight/any applicable consent ordering
- cli/core/worker-generator/sync-worker.ts
- cli/commands/write.ts
- cli/commands/mcp/write.ts
- cli/commands/mcp/list.ts registered-target reporting
- cli/index.ts bounded command registration for T4's frozen consent command; no target behavior
  in the shared entrypoint
- cli/commands/init.ts
- cli/commands/extensions/setup.ts, awaiting Beads, Parallel, or MarkItDown before success
- cli/commands/extensions/add.ts awaited-writer parity
- scripts/verify-release-readiness.ts and test/package-readiness.test.ts, additively proving the
  packaged adapter registry is present without weakening Worker 1.3 readiness, provenance, or
  runtime-admission checks
- scripts/release/artifact-contract.ts and test/scripts-release-artifact-contract.test.ts,
  preserving every pre-I214 `REQUIRED_RELEASE_MEMBERS` entry while separately asserting the four
  exact runtime-admission paths remain npm-pack members, then appending, extracting, and
  production-parsing registry/target-adapters.json from both the exact initial tar and
  downloaded/recovery tar, with negative artifact fixtures
- new adapter contract, registry, and legacy-planner modules

### T4 ownership and diagnostics

- read-only regression fixtures for cli/core/write-record.ts; V1 production code is
  changed only if a proven integration defect requires an Owner-reviewed amendment
- new target-projection ledger, graph, snapshot, executor, transaction, journal,
  consent, and physical-path-safety modules; the executor exclusively publishes the T1-rendered
  `.gitignore` plan
- cli/core/inventory-lock.ts six-level order including Org operation, reentrancy, and
  reverse-order enforcement
- cli/core/project-state-transaction.ts extension across selected base/local config and lock
  images, including absence
- cli/core/ambient-capabilities.ts
- cli/core/ambient-policy.ts
- cli/core/diagnostics.ts
- cli/commands/status.ts and cli/commands/doctor.ts safety projections
- new `cli/commands/target/consent.ts` grant/revoke command

### T2 Goose leaf

- new Goose-local plugin renderers and capability/qualification modules
- instruction and shared-skill conformance fixtures against T1/T4 plans; no instruction renderer,
  V1 mutation, or shared-projector implementation
- Goose target-local tests and fixtures
- Goose documentation and live qualification evidence

### T3

- research-only compatibility witness; no production paths

### T5

- clean-checkout review and qualification only; no production authorship

Integration order is C1 T1 planning ABI, C2 T4 ledger/executor/consent, C3 T1
integration/parity, C4 T2 Goose output, C5 T4 diagnostics, then T5 final review.

## 15. Acceptance criteria

G1 is ready for human review when:

- analysis 134 is preserved with verified provenance;
- current state and runtime/provider uncertainty are explicit;
- the adapter, ownership, consent, ambient, and failure contracts are unambiguous;
- existing target behavior is protected;
- Goose claims are exact by version/provider/scope;
- Pi production remains excluded;
- the evidence register identifies every specialist/review packet and every Owner decision;
- T5 independently reconciles requirements to evidence.

G3 later requires:

- I238/I266–I269 landed-SHA or explicit non-overlap dispositions and the combined-base I214
  path/semantic audit are recorded without mutating coworker worktrees;
- landed I265 remains integrated at or after `cef3090`, with its runtime-admission and Worker 1.3
  release contracts covered by focused regressions;
- all deterministic tests and typecheck pass from initialized state;
- package dry-run and release-artifact qualification prove registry/target-adapters.json
  is present alongside registry/config.json, every existing `REQUIRED_RELEASE_MEMBERS` entry,
  and the separately asserted four runtime-admission npm-pack paths;
- isolated live qualification evidence is attached;
- no foreign bytes or real user configuration were mutated;
- candidate SHA equals the independently reviewed SHA;
- PR Testing & CI evidence names exact commands, outcomes, skips, and residual risks.

## 16. Open evidence and successor items

- Compatibility policy for Goose identities other than audited commit
  `db7a704446975c88d3b67490c74d33bcd684404e`.
- Native descriptor-relative filesystem primitives if protection from a malicious same-UID
  intermediate-directory swap is later required.
- Additional direct-provider parity for instruction, skill, plugin, and MCP claims.
- Hook event availability, failure semantics, batch behavior, provider bypass, exact
  subtree, and codecs belong to a separately approved successor issue.
- Machine-scope instructions, skills, MCP, hooks, and global-registration management
  belong to a separately approved successor issue.

These are qualification items, not permission to infer support.

## 17. Success definition

I214 succeeds when Goose can be explicitly selected and safely projected without
changing existing target behavior, without claiming or deleting ambient/user-owned
state, and without broadening into Pi. Every support statement is tied to reproducible
evidence and an immutable candidate SHA.
