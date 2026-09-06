# ABOUTME: Maps every I214 Goose projection and activation claim to pinned runtime and drwn source evidence.
# ABOUTME: Separates projection, ambient effects, activation, transactions, and landed Worker admission through the post-I265 amendment.

# I214 Goose Source-to-Contract Coverage

**Status:** Post-I265 source-contract consolidation — exact-byte Owner approval pending

**Date:** 2026-08-11

**Repository base:** `cef3090c013134b578d87fd938a6741fd288d36a`

**Concurrent-source boundary:** I265 landed on `origin/main` at the repository base above and is
integrated by the Worker 1.3 amendment in this coverage. I238 and I266–I269 remain actively owned
elsewhere; their mutable worktrees are quarantined from I214. G2 freeze still requires their
landed SHAs or explicit non-overlap dispositions and a read-only overlap/source-delta audit on the
combined `main` descendant.

**Authoritative Goose source:** `/Users/pureicis/dev/goose` at
`db7a704446975c88d3b67490c74d33bcd684404e` (clean, untagged source snapshot; workspace
declares `1.45.0`)

**Historical live evidence:** The installed Goose `1.41.0` binary and immutable source commit
`39c27c387d726ce4605108d2f974d4feec158ed5` remain useful historical probes only. They do not
qualify the latest source contract, consent grant, plugin publication, or positive runtime-use
claim. A latest-source live claim requires a binary digest and build provenance tied to the
authoritative commit; the untagged workspace version string alone is insufficient.

**Authority:** This document is evidence and option analysis. It retains the historically
Owner-approved design basis and adds a not-yet-approved landed-I265 integration amendment; it is
not the G1 architecture, a T5 pass, or a human Reviewer verdict.

## 1. Why this consolidation exists

Candidate v4 retained a sound core topology but froze before every runtime entry point and every
current drwn mutation seam had been reconciled together. T5-R4 exposed two cross-seam gaps. The
source-complete pass then found adjacent cases that a narrow patch would have missed again.

The corrective rule is:

> Candidate v5 is not freeze-ready until each support claim names its source behavior, projection
> boundary, activation envelope, diagnostic result, mutation boundary, and required test.

The architecture must keep four truths separate:

1. **desired projection** — deterministic bytes and ownership drwn intends;
2. **physical projection state** — absent, current, drifted, foreign, or unsupported now;
3. **ambient target effect** — target-owned reads/writes that projection can trigger; and
4. **runtime activation** — whether one concrete target invocation will consume the projection.

A current projection is not proof of activation. An activation-suppressed invocation can still
trigger an ambient registration write.

## 2. Complete Goose project-root model

The authoritative Goose source does not use one project root across surfaces.

| Surface | Runtime root and selection | Exact source seam | Static drwn certainty |
| --- | --- | --- | --- |
| Initial `AGENTS.md` / `.goosehints` | Normally `~/.agents/AGENTS.md` plus Goose-config global files, then local files from Git root through the session working directory; the global `AGENTS.md` participates only when `CONTEXT_FILE_NAMES` contains that exact filename | `crates/goose/src/hints/load_hints.rs:13-24,187-209,232-310` | Conditional on effective config and future session root |
| Dynamic contained hints | After tool arguments mention a path or command token, Goose canonicalizes the referenced parent and can load configured hint files from existing descendants strictly contained by the session working directory; outside, missing, and root-equal directories do not load | `crates/goose/src/hints/load_hints.rs:26-168` | Turn-dynamic and unknowable from projection alone |
| Project skills, legacy engine | Exact session working directory under `.agents`, `.goose`, then `.claude`; no ancestor walk; requires the effective `skills` platform extension | `crates/goose/src/skills/mod.rs:313-342,425-505`; `skills/client.rs:24-56` | Point-in-time plus effective-vector evidence |
| Project skills, experimental state-machine engine | Exact session working directory; `SkillOperation` independently discovers and exposes skills even when the profile, recipe, or entry-point vector omits the `skills` extension | `crates/goose/src/agents/state_machine/mod.rs:56-59`; `agents/agent.rs:1631-1659,1888-1894`; `agents/state_machine/ops_skills.rs:54-100,288-300` | A separate execution-engine axis; outside the strict I214 envelope |
| CLI project-plugin MCP | Exact process CWD, only for a fresh profile-enabled session with no recipe-owned extensions | `crates/goose-cli/src/session/builder.rs:526-561` | Future invocation normally unknown |
| ACP project-plugin MCP | Exact request CWD, only when recipe extensions, `_meta.enabledExtensions`, and explicit `mcpServers` do not supersede discovery | `crates/goose/src/acp/server.rs:769-805` | Requires the concrete ACP request |
| ACP load/fork and `goose serve` | Load/fork reuse or replace stored extension state rather than rediscovering merely because CWD changes; `serve` exposes those ACP handlers over HTTP/WebSocket | `crates/goose/src/acp/server.rs:887-940`; `acp/server/load_session.rs:269-329`; `acp/server/fork_session.rs:5-75`; `goose-cli/src/cli.rs:1391-1534` | MCP is session/request-carried; state-machine skills remain current-session-CWD-driven |
| Desktop ACP client | A nonempty selected Goose extension list becomes `_meta.enabledExtensions`; an empty list omits it and permits ACP server fallback. Load/fork remain session-carried | `ui/desktop/src/sessions.ts:26-55`; `ui/desktop/src/acp/sessions.ts:198-215,228-253,283-295` | Requires exact Desktop request metadata; never infer empty and nonempty cases are equivalent |
| CLI `term` | Reuses persisted extensions while changing the session working directory | `crates/goose-cli/src/commands/term.rs:178-227,265-325` | MCP is session-carried; state-machine skills follow the updated session CWD |
| Review | Default subprocess invokes `goose run --no-profile`; direct non-orchestrated review also sets `no_profile` and explicit builtins | `crates/goose-cli/src/commands/review/orchestrator.rs:190-289`; `commands/review/handler.rs:183-222` | Project MCP suppressed; state-machine skills can remain CWD-driven |
| Chat mode | Instructions and skill disclosure can load, but backend MCP and `load_skill` calls are skipped | `crates/goose/src/agents/agent.rs:2572-2601`; `agents/state_machine/ops_skills.rs:303-340`; `agents/state_machine/ops_toolcalling.rs:643-725` | Never claim positive MCP or skill-tool invocation |
| Hooks and ambient project-plugin registration | Process CWD when an ordinary `Agent::with_config` constructs the HookManager; summon subagents set `is_subagent` and receive an empty HookManager | `crates/goose/src/agents/agent.rs:378-440`; `agents/platform_extensions/summon.rs:1290-1303,1847-1859`; `hooks/mod.rs:237-242` | Main-agent discovery can differ from session/request root; Summon suppresses HookManager-triggered discovery/ambient registration but still loads its inherited/filtered session-carried MCP vector |
| Resume/fork MCP | Persisted expanded extension vector; no project rediscovery | `crates/goose/src/session/extension_data.rs:102-143`; CLI builder above | Requires session state |
| Scheduler | Scheduler process CWD, not recipe location | `crates/goose/src/scheduler.rs:1017-1059` | Requires scheduler launch context |
| Gateway | Generated gateway working directory | `crates/goose/src/gateway/handler.rs:250-300,325-352` | Intended project projection is not native there |
| Summon delegate/subagent | Parent persisted extension vector, optionally filtered; parent or contained nested working directory; a new Agent loads that vector without project-plugin rediscovery | `crates/goose/src/agents/platform_extensions/summon.rs:1557-1609,2076-2102`; `agents/subagent_handler.rs:122-160` | MCP is session-carried; state-machine skills remain CWD-driven; hooks are suppressed |
| Orchestrator `start_agent` | Requested canonical working directory, but new session creation does not project-discover extensions; provider construction receives the parent vector separately | `crates/goose/src/agents/platform_extensions/orchestrator.rs:160-163,388-440` | MCP is suppressed for the child Agent unless later session state supplies it; state-machine skills remain CWD-driven; ordinary hooks use process CWD |
| ExecutionManager restore/eviction reload | Stored session working directory and stored extension data; constructs a new Agent and reloads only the session vector | `crates/goose/src/execution/manager.rs:187-230` | MCP is session-carried; state-machine skills use stored session CWD; ordinary hooks use process CWD |
| External TUI | `goose tui` execs a separately resolved JavaScript frontend from an executable ancestor or `npx --package @aaif/goose@latest`, forwarding the Rust binary only through `GOOSE_BINARY` | `crates/goose-cli/src/commands/tui.rs:5-83`; `goose-cli/src/cli.rs:1048-1064` | Frontend version, arguments, CWD, and ACP requests are external and unverified |

Consequences:

- Root `AGENTS.md` can load from a nested Git-directory session while root skills and plugin do not.
- Under the legacy engine, `--no-profile`, recipe-owned extensions, review, resume, ACP overrides,
  or chat mode can suppress skills/MCP activation without preventing ordinary main-agent
  HookManager discovery and registration. Under the experimental state-machine engine, skill
  discovery is independent of the extension vector, while MCP remains vector-controlled.
- Hook discovery can use process CWD while ACP instructions/skills/MCP use a request or stored
  session root; summon subagents are the explicit hook-discovery exception.
- A moved project can have new root bytes and registration while a resumed session retains old
  expanded plugin paths.
- `CONTEXT_FILE_NAMES` can remove `AGENTS.md` from Goose's instruction inputs entirely.
- Global `~/.agents/AGENTS.md` is another instruction input, and later tool references can add
  newly discovered contained subdirectory hints after initial prompt construction.
- The legacy `crates/goose-server` HTTP `/agent/start` entry point no longer exists in the
  authoritative source. Historical server behavior is not part of candidate v5.

### 2.1 Effective extension selection and execution engine are separate activation inputs

“Profile enabled” is insufficient to prove that project skills are active. Candidate v5 must
first classify the execution engine:

- the **legacy engine** is selected when `GOOSE_STATE_MACHINE` is absent or is not one of the
  exact recognized values `1`, `true`, `TRUE`, or `yes`; and
- the **experimental state-machine engine** is selected for those recognized values, or for the
  isolated bang-shell dispatch path. Its always-present `SkillOperation` discovers filesystem
  and builtin skills independently of the selected extension vector.

The strict I214 harness requires the legacy engine. For a new legacy-engine session, Goose
resolves the extension vector in this order:

1. recipe extensions, when present, replace the profile vector;
2. otherwise an entry-point extension override, when present, replaces the profile vector;
3. otherwise enabled entries from the effective `extensions` configuration are selected; and
4. unavailable platform extensions and malformed entries are omitted.

The effective profile map is itself runtime configuration: an uppercase `EXTENSIONS`
environment value overrides files; otherwise system, `GOOSE_ADDITIONAL_CONFIG_FILES` entries,
and user configuration merge in order with nested extension fields merged by key. A missing,
malformed, or non-mapping value can yield an empty vector. Resume/fork can bypass all of those
current inputs by restoring its persisted extension vector.

When an `extensions` map entry omits its internal `name`, Goose injects the raw map key as that
name. When a name is present, the raw map key and runtime name may differ. Qualification must
therefore parse each effective value and derive the actual runtime name rather than infer it from
the map key.

For the fresh CLI path, Goose then concatenates the selected profile vector, discovered project
plugin MCP entries, and CLI-flag extensions. ACP replaces entries only when their **exact runtime
names** match before loading. `ExtensionConfig::key()` and the ExtensionManager later normalize
runtime names by lowercasing, removing whitespace, retaining ASCII alphanumeric/underscore/hyphen, and replacing
other characters with underscore. Extensions load concurrently and the final insertion at a
normalized key replaces any prior value. Thus exact-name duplicates can be replaced before ACP
load, while unequal exact-distinct names that normalize to the same key can both start and have a
completion-order-dependent winner.

Exact seams: `crates/goose/src/config/base.rs:124-180,276-323,713-752`;
`crates/goose/src/config/extensions.rs:22-31,43-96,209-229,296-315`;
`crates/goose-cli/src/session/builder.rs:526-561`;
`crates/goose/src/acp/server.rs:403-430,769-805`;
`crates/goose/src/agents/extension.rs:400-409`; and
`crates/goose/src/agents/extension_manager.rs:1227-1259`.

Therefore a positive legacy-engine skills-activation claim requires observed effective extension
evidence that contains the `skills` platform extension for the concrete harness. The
state-machine alternative is projected safely but activation remains `unverified` in I214.
Static project status may say the skill projection is current, but it does not infer future
activation from user config or the execution-engine environment alone.
Positive project-plugin MCP activation additionally requires a pre-launch inventory deriving
every normalized extension key across the effective profile, every discovered plugin MCP entry,
and any observed CLI flags. Every post-selection key must be unique; any duplicate—including any
`drwn:<server-id>` collision—makes MCP activation `shadowed`/unqualified even if the definitions
appear equal. The strict envelope excludes
CLI extension flags entirely.

### 2.2 `GOOSE_PATH_ROOT` is absolute-only

The authoritative source reads `GOOSE_PATH_ROOT` with `var_os`, converts it to a platform path,
and uses it only when that path is absolute. An unset, empty, or relative value falls back to the
normal platform strategy. An absolute non-Unicode value is accepted by Goose on platforms that
support it; it no longer falls back merely because UTF-8 decoding fails. The accepted root
controls Goose config/data/state, the user plugin directory, the agents home—including the
global `AGENTS.md`—and the user plugin settings path.

Project plugin registration still stringifies each discovered root with `to_string_lossy` for
the global `plugins` map. Candidate v5 therefore mirrors the absolute-only resolution exactly for
read-only status, but withholds plugin consent/publication when an accepted root or derived key
cannot be represented and round-tripped exactly by drwn. It never invents the old lexical empty/
relative roots and never treats an absolute non-Unicode value as an implicit home-directory
fallback.

Exact seams: `crates/goose/src/config/paths.rs:8-46,48-65`;
`crates/goose/src/plugins/discovery.rs:91-120,194-217`; and
`crates/goose/src/hints/load_hints.rs:240-249`.

## 3. Supported-invocation alternatives

### A. Strict verified native envelope — provisional recommendation

The only positive runtime-use claim in I214 is the exact qualified harness:

- a Goose CLI binary whose digest and build provenance bind it to authoritative commit
  `db7a704446975c88d3b67490c74d33bcd684404e`; workspace version `1.45.0` alone is not proof;
- fresh, non-resumed, non-forked session;
- process and session working directory canonicalize to the drwn project root;
- legacy execution engine: `GOOSE_STATE_MACHINE` absent or disabled;
- profile enabled;
- no recipe-owned extension set or ACP/client override;
- no CLI extension flags and unique normalized extension keys in the observed
  profile/project-plugin vector;
- `CONTEXT_FILE_NAMES` includes `AGENTS.md`, and global plus dynamically discovered contained
  instruction inputs pass the instruction-collision/read-set gates;
- effective extension selection is observed for that harness and contains the available `skills`
  platform extension;
- non-chat runtime mode for MCP tool-use claims; and
- all surface-specific ownership, consent, configuration, and collision gates pass.

Every other mode remains safely projectable but activation is `unverified`, `suppressed`,
`session-carried`, or `unknown` rather than active. Resume can be observed as session-carried only
when its stored extension evidence is explicitly supplied; ordinary status does not inspect all
future sessions.

Benefits: smallest truthful support claim, native direct `goose` UX, no process-supervisor scope,
and a closed live matrix. Cost: Desktop/ACP, nested-CWD, recipe, review, scheduler, gateway, and child-
agent parity are not claimed in I214. The external `goose tui` frontend is also unverified.

### B. Invocation-profile simulator

Add a large `GooseInvocationProfileV1` covering entry point, process/session/request roots,
extensions, recipe/no-profile flags, context filenames, mode, and persisted extension vector.
Status can predict one supplied profile but not arbitrary future sessions.

Benefit: broader diagnostic precision. Cost: large target-specific contract, continuing runtime
drift, and significantly more tests without making direct future invocations deterministic.

### C. Drwn-owned launcher

Add a launcher that sets the root and injects or constrains Goose extensions.

Benefit: a controlled CLI path. Cost: drwn becomes responsible for TTY/process lifetime, signals,
credentials, flags, provider behavior, resume, quoting, and exit semantics. It does not repair
ordinary Goose Desktop/ACP/direct CLI behavior and turns a projection issue into a runtime
supervisor. This is successor work, not the provisional I214 direction.

## 4. Projection versus activation contract

The durable adapter should remain pure:

    interface TargetProjectionAdapterV1 {
      readonly abiVersion: 1
      readonly target: RegisteredTargetId
      capabilities(context): TargetCapabilities
      declareReadSet(context, intent): ProjectionReadSet
      plan(snapshot, intent): TargetProjectionPlan
    }

Runtime observation belongs in an optional sibling interface:

    interface TargetRuntimeObserverV1 {
      readonly abiVersion: 1
      readonly target: RegisteredTargetId
      declareObservationReadSet(context, profile): RuntimeObservationReadSet
      observe(snapshot, projection, profile): TargetRuntimeObservationV1[]
    }

The shared observation vocabulary is small:

- surface: instructions, skills, MCP, hooks, or target-specific effect;
- projection: absent, current, drifted, foreign, or unsupported;
- activation: eligible, suppressed, shadowed, session-carried, unknown, or unsupported;
- qualification: qualified, degraded, unqualified, or not-applicable;
- target-local profile ID, stable reason code, version evidence, and redacted provenance.

Goose interprets Goose modes. A future Pi adapter can interpret trust, ancestor discovery,
`--no-skills`, `--no-extensions`, explicit resources, and SDK loaders without changing the
projection ABI. Existing file targets need only a no-regression fixture in I214; they are not
migrated to observers.

## 5. Complete Goose skill discovery and collision model

Goose processes roots in a stable tier order but recursively processes entries within a root in
unsorted `read_dir` order. Runtime `load_skill` resolves the first exact, case-sensitive
frontmatter `name` globally in both engines. Slash-command resolution is a separate path that
compares skill names with `eq_ignore_ascii_case`, so an ASCII-case alias can be ambiguous for
humans and slash invocation even though exact tool loading distinguishes it. The project plugin
directory is not a skill root: project-delivered skills belong in the Owner-selected
`.agents/skills` projection, while `.agents/plugins/drwn` remains MCP-only.

| Class | Source behavior | Candidate-v5 policy |
| --- | --- | --- |
| Managed destination already foreign | drwn lacks ownership | Fail closed |
| Any exact-name sibling/root/nested candidate inside project `.agents/skills` | Same-root winner is filesystem-order-dependent | Fail closed |
| ASCII-case alias inside the same root | Exact load differs, slash access can collide | Fail closed |
| Nested contender inside the managed tree | Can win and prunes supporting traversal | Fail closed as drift |
| Directory or `SKILL.md` symlink | Goose can follow it; aliases can change traversal winner | Fail closed without ownership traversal |
| Unreadable/canonicalization-blind subtree | Absence of a contender cannot be proven | Fail closed as indeterminate |
| Exact/case alias in strictly later roots | Valid managed project `.agents` candidate remains first in the authoritative source | Qualified warning only |
| Unqualified Goose version | Root/selection contract is not pinned | Projection may remain, but activation is unqualified; known alternatives block any positive selection claim |
| Installed-plugin root | Discovery may auto-update Git plugins before scanning; Open Plugins can add root/default/custom skill paths | Source-equivalent read-only mirror; due/unsafe/blind update state withholds positive activation |
| Project-plugin `skills/` subtree | Not included by `all_skill_dirs` | Never treat it as a skill delivery path; keep the drwn project plugin MCP-only |

Exact sources: `crates/goose/src/skills/mod.rs:313-505`, `skills/client.rs:103-150,
218-267`, `agents/state_machine/ops_skills.rs:79-141,235-359`,
`slash_commands/skill_slash_command.rs:43-57`, and `plugins/mod.rs:84-115,158-203`.

Managed Goose skill trees add a target-local topology rule: reject directory segments exactly
`.git`, `.hg`, or `.svn`. Goose skips those subtrees during both skill and supporting-file
discovery even though `PortableProjectionPathV1` correctly permits their spelling for other
targets. The generic portable scalar does not change.

Diagnostics recursively mirror the first project `.agents/skills` root without following
symlinks or executing Goose. Reports sort their own redacted results; they never sort candidates
to invent a runtime winner.

The installed-plugin tier uses a pinned-version, no-network mirror rather than Goose's discovery
function. It snapshots immediate children of Goose's plugin install directory, reads
`.goose-plugin-install.json`, includes an existing `<plugin>/skills` exactly as the outer Goose
function does, and parses the first existing Open Plugins manifest in this order:
`.goose-plugin/plugin.json`, `.plugin/plugin.json`, `plugin.json`. It then adds the root
`SKILL.md` fallback and existing custom `skills.paths` directories according to pinned
`exclusive` semantics, while preserving Goose's outer default-directory behavior. In particular,
`exclusive:true` suppresses the format adapter's default root but does not suppress the outer
loader's unconditional existing `<plugin>/skills` root. Open Plugins installation namespaces
only the selected skill root and its immediate child candidates, whereas later runtime discovery
is recursive; a deeper skill can therefore retain a raw frontmatter name and must be observed as
such rather than assigned an inferred plugin namespace.

The no-manifest root `SKILL.md` fallback applies only when the default skills directory is absent;
a malformed manifest omits Open Plugins root/custom contributions while the outer default
directory remains. The mirror never follows a symlink or executes Git. Unreadable entries,
unsafe relative custom
paths, unstable snapshot tokens, or a Git-backed `auto_update:true` install whose
`last_update_check` is absent or at least 24 hours old make installed-plugin alternatives
indeterminate and withhold positive activation. Malformed manifests reproduce Goose's pinned
fallback/omission behavior but remain an explicit warning. Observation is point-in-time: a later
auto-update or install invalidates it.

Latest Open Plugins installation validates and rewrites in a staging directory beneath the user
plugin root before a final rename. This removes partial live destinations but creates a transient
immediate child that a concurrent plugin scan can observe. The mirror therefore retains unstable-
snapshot handling and never assumes that every direct child is a durable installed plugin.

Exact installed-plugin seams: `crates/goose/src/plugins/mod.rs:15-16,84-115,158-203,312-330` and
`plugins/formats/open_plugins.rs:68-152,297-468`.

## 6. Current drwn mutation boundary

Landed I265 adds a pre-effect boundary that I214 must preserve. Deployable Card closures carry
strict `runtimeAdmission` and `applicationRequirements` declarations; Worker deploy derives a
canonical envelope; and Worker materialization rederives and exact-compares that envelope after
outer/closure/lock validation but before store verification or filesystem effects. I214's
complete proposed-state preflight belongs after this admission gate and store length/SHA
verification, not around or ahead of them. Exact seams:
`cli/core/card-manifest.ts:36-64,342-365`;
`cli/core/mind-capability.ts:7-37`;
`cli/core/card-lock.ts:121-137,185-201`;
`cli/core/runtime-admission-manifest.ts:344-370,505-675`;
`cli/core/worker-deploy.ts:291-343`;
`cli/core/worker-materialize.ts:82-140,148-154,234-260`.

The landed release-source contract is also exact. `package.json` pins package 1.3.0, Bun 1.2.21,
the broad `cli`/`registry` package roots, and the exact `runtime-admission:derive:v2` command;
`build-identity.ts` pins the same target version. I214 leaves `cef3090`'s current release-artifact
required list unchanged; that list includes Buzz tooling, while package readiness proves the Buzz delivery Card and the entire
`registry/cards` replacement surface are absent. The four runtime-admission paths are currently
included only by the broad `cli` package root; I214 adds explicit membership assertions without
changing `REQUIRED_RELEASE_MEMBERS`. Exact seams:

- `package.json:16,30-38,52-58` and `cli/core/build-identity.ts:9-13`;
- `scripts/release/artifact-contract.ts:15-32,65-76` and
  `scripts/verify-release-readiness.ts:65-105,240-253,1125-1137`;
- `test/package-readiness.test.ts:195-239` and
  `test/scripts-release-artifact-contract.test.ts:34-63,95-162`;
- `test/scripts-runtime-admission-derive.test.ts:531-603,901-1025,1939-1996`;
- `test/scripts-release-provenance.test.ts:1-244`,
  `test/scripts-release-publication-controls.test.ts:1-248`,
  `test/scripts-release-workflow.test.ts:127-186`, and
  `test/scripts-release-recovery-workflow.test.ts:1-55`.

Current state-changing commands can commit state before `syncRepository`:

- `write` mutates hook and instruction acknowledgement stores at
  `cli/commands/write.ts:189-227`;
- Project Worker add/apply/remove/pin/update/use flows commit project config and lock through
  `cli/core/worker-project.ts:96-145` and their `cli/commands/project/*.ts` callers;
- `use` also mutates the machine project registry at `cli/commands/use.ts:65-80` and
  `cli/core/project-registry.ts:140-170`;
- `up` and bulk project updates can fetch Git state and then update config/lock at
  `cli/commands/up.ts:37-71` and `cli/core/project-registry.ts:235-297`;
- standard `install` hydrates machine Card-store bytes and may refresh the lock at
  `cli/commands/install.ts:242-311`;
- `dev` and `card unlink --write` mutate local overlay/lock state and `.gitignore` through
  `cli/commands/dev.ts:38-70`, `cli/commands/card/unlink.ts:31-47`, and
  `cli/core/config-local.ts:96-128`;
- standalone single/bulk `card link` and `card unlink` without `--write` publish local overlay
  state and return without `syncRepository` at `cli/commands/card/link.ts:29-61`,
  `cli/commands/card/unlink.ts:29-49`, and `cli/core/config-local.ts:163-186`;
- after the admission/store gates, Worker payload materialization seeds machine state and
  directly creates project state before sync at `cli/core/worker-materialize.ts:234-260`; and
- Org Worker materialize/remove holds its own journal, commits project state, and reconciles
  vendor state before nested sync at `cli/core/org-worker-materializer.ts:722-924,1308-1573`.

Current `syncRepository` then mutates in this order:

1. `.gitignore` and `.agents/drwn/.gitattributes`;
2. project vendor trees and sidecars;
3. generated Worker outputs;
4. canonical and target instruction files;
5. MCP files;
6. skill directories;
7. hook files and composers;
8. stale V1 cleanup; and
9. V1 write record last.

Every changed managed file can first create a dynamically numbered `.bak*`. Those backup paths
are unowned and unjournaled. Org Worker materialization/removal also holds an outer project-level
lock and journal while invoking sync, creating a consent-before-project lock inversion if a
preserved Goose target requires plugin consent.

Exact sync seams: `cli/core/sync.ts:829-988`;
`cli/core/git-hygiene.ts:65-112`; `cli/core/vendor-reconcile.ts:51-107`;
`cli/core/managed-file.ts:9-93`; `cli/core/org-worker-materializer.ts:722-924,
1308-1573`.

## 7. Transaction alternatives

### A. Unified entire-command transaction

Attempt to include proposed config/lock, machine/store inputs, every project output, target
consent, and external effects in one transaction.

Rejected: Git/network/process effects are not rollback participants; the rewrite spans roughly
30–40 production modules and replaces established project-state and Org recovery assumptions.

### B. Complete preflight plus ordered recoverable commits — provisional recommendation

Define the strong atomic unit as the **project projection commit**, not the whole CLI command:

For Worker payload materialization only, the I265 pre-effect admission gate and store length/SHA
verification precede this sequence. Their admitted immutable payload/store identities become
inputs to step 1; I214 must not move either validation behind consent, store seeding, project
preflight, or any other effect.

1. Resolve/fetch external inputs into immutable temporary sources without publishing drwn-owned
   project, acknowledgement, registry, config/lock, local-overlay, or machine-store state;
   unavoidable third-party/network effects are explicit and are never claimed as rollback-safe.
2. Derive proposed base config/lock, local config/lock, acknowledgement, registry, and store state
   without publishing them.
3. Prepare the entire deterministic projection and fail every known blocker before any
   drwn-owned state or projection mutation.
4. Acquire target consent before project-level locks when plugin publication is possible.
5. Commit independent upstream state in declared order. Extend the project-state transaction to
   atomically cover optional `config.local.json` and `card.lock.local` alongside base config/lock;
   local writers no longer mutate `.gitignore`. Acknowledgement, registry, and machine-store
   commits remain explicit independent commits with no false rollback claim.
6. Apply all project projection leaves, hygiene, V1 ownership, target ledger, and their one
   projection journal under
   `inventory → machine → Goose consent → Org operation → project state → project projection`.
7. Revalidate snapshot tokens; on a late failure, retain explicit retryable upstream state and
   never print false projection success.
8. Observe runtime state read-only after a valid durable projection.

Ordinary `write` has no upstream state commit. Org Worker keeps its existing outer journal as an
operation coordinator, but must run target/consent preflight before acquiring the Org lock and
treat projection apply as an idempotent subordinate commit.

This explicitly permits an upstream config/lock/store commit to persist when later projection
publication fails. Status reports both states and the retry action; it does not claim command-
level all-or-nothing behavior.

The extended project-state transaction has one ordered journal over the subset of proposed base
and local files selected by the command; absent files have explicit absent images. Failure at any
local/base publication checkpoint recovers that transaction as a unit. `.gitignore` is computed
from the resulting state but owned only by the later projection transaction. If projection then
fails, the committed state is retained, hygiene remains at its last committed projection, and
status reports `projection-retry-required` until an idempotent retry converges.

There is one safety exception to the normal upstream-then-projection order. The two static local
overlay ignores—`.agents/drwn/config.local.json` and `.agents/drwn/card.lock.local`—are permanent,
target-neutral hygiene invariants. Before any command can create either local file, the shared
projection executor first applies a journal-backed, monotonic `local-overlay-safety` hygiene plan
that preserves every foreign line and every other drwn entry while ensuring those two rules.
Only after that transaction commits may the extended project-state transaction publish local
files. No lock is nested across the two commits. A later full projection reconciles all other
derived hygiene; standalone link/unlink needs no full projection. If local publication fails,
the extra ignore rules are harmless and retained. If safety-hygiene publication fails, no local
file changes.

Exact current local-state seams: `cli/core/config-local.ts:75-128`,
`cli/core/project-state-transaction.ts:34-72`, and `cli/commands/dev.ts:38-68`.

#### Projection journal closure

The projection journal is a recovery mechanism over physical filesystem images, not another
ownership schema. Before the first publication mutation, its durable staged state must contain
the exact ordered operations and both expected preimage and desired postimage for every affected
project path. Its image union is:

- `absent`;
- `file` with content digest, mode, and durable blob reference;
- `symlink` with the literal link target; or
- `tree` with a no-follow, path-sorted manifest, manifest digest, modes, file-blob references,
  literal symlink targets, and a durable staged-tree reference.

This union is representationally closed over current `ManagedPathData`: `managed-content` and
`managed-fields` publish whole computed file images; `symlink` and `generated-symlink` publish
literal symlink images; and `managed-directory` publishes a complete tree image. Field ownership
remains in the unchanged V1 record, while rollback restores the whole containing file. Parent
containers are explicit tree/container operations when their existence or removal is material.

The operation set must include shared `.gitignore` and `.gitattributes` merge results, vendor
trees and sidecars, generated Worker and hook trees, canonical instructions, MCP files, skill
trees, hook runtime files, stale V1 cleanup, the V1 record, Goose plugin/skill leaves, the target
ledger, and durable sentinels. The planner computes final bytes/trees without creating project
paths; the executor stages and fsyncs all referenced images before publication, revalidates
preimages, publishes, and records progress. Recovery selects roll-forward or rollback from those
same immutable images and never creates dynamic `.bak*` paths.

Exact current representation seams: `cli/core/write-record.ts:22-72` and
`cli/core/materialize.ts:19-55`.

### C. Coordinated dual/third journal

Add a coordinator over project-state, projection, and Org Worker journals.

Rejected: three recovery state machines, increased Pi coupling, and more ambiguous recovery than
the explicit ordered-commit model.

## 8. Bounded hard cuts and retained compatibility

- Remove dynamic `.bak*` creation only from journal-backed **project projection** publication
  after executor before-images cover the same files. This eliminates nondeterministic project
  paths and duplicate ownership/recovery logic and meets the Owner's complexity/effort threshold.
  Machine-scope synchronization retains its current backup behavior in I214; project planners no
  longer call the shared imperative managed-file writer. Replacing machine recovery is successor
  work, not an accidental consequence of this hard cut.
  Exact current shared-writer seams: `cli/core/managed-file.ts:9-93` and
  `cli/core/sync.ts:829-868,958-980`.
- Keep `drwn.write-record@1`; do not convert all existing producers to the target ledger.
- Keep the legacy `sync-mcp.ts` wrapper unless a later bounded proof shows its removal drastically
  reduces both complexity and effort. It must delegate to the one registered-target parser rather
  than own a second target grammar.
- Preserve `init --force` as an explicitly destructive reset, not a “fresh config” writer. Target
  preservation guarantees do not apply to that explicit reset; residual owned projection is
  diagnosed and cleaned by the next target-aware operation.
- No mandatory launcher, Pi target, hook delivery, recipe delivery, machine Goose projection, or
  existing-target observer migration belongs in I214.

## 9. Source-closure register

| ID | Gap closed before candidate v5 | Required contract/test consequence |
| --- | --- | --- |
| `V5-C01` | Surface-specific CWD/root behavior | Separate instruction/skill/MCP/hook observations |
| `V5-C02` | Session/entry-point suppression and persistence | Strict positive envelope; all other modes unverified/suppressed/session-carried |
| `V5-C03` | Hook discovery can register without MCP activation | Ambient registration is a separate axis and disclosure |
| `V5-C04` | `CONTEXT_FILE_NAMES` can exclude `AGENTS.md` | Instruction activation qualifier |
| `V5-C05` | Same-root skill order is unspecified | Recursive same-root fail-closed proof |
| `V5-C06` | Slash access has case-insensitive aliases | Same-root ASCII-case collision blocker |
| `V5-C07` | Goose follows skill symlinks and can leave the root | No-follow mirror, unsafe/blind-subtree blocker |
| `V5-C08` | VCS directories are skipped | Goose-specific `.git/.hg/.svn` topology rejection |
| `V5-C09` | Installed-plugin discovery can auto-update | Status/doctor never invoke Goose discovery; later roots remain ambient |
| `V5-C10` | Projection and activation use different clocks | Optional target-neutral runtime observer sibling |
| `V5-C11` | Existing sync mutates before late blockers | Whole proposed-state preflight before known mutations |
| `V5-C12` | Command state and projection cannot be one rollback domain | Ordered independent upstream/projection commits with retry state |
| `V5-C13` | `.gitattributes`, vendor, generated output omitted from v4 groups | Complete project-projection mutation inventory and journal groups |
| `V5-C14` | Dynamic `.bak*` is unowned/nondeterministic | Executor-before-image hard cut |
| `V5-C15` | Org Worker lock inversion | Consent/preflight before Org lock; idempotent subordinate projection |
| `V5-C16` | Registry-backed validation dependency missing | One injected/compiled registered-target validator, no casts/fallback parser |
| `V5-C17` | `init --force` misclassified | Explicit destructive-reset exemption and residual diagnostics |
| `V5-C18` | Status/doctor rebuild mixed snapshots | One immutable inspection per command |
| `V5-C19` | Canonical instructions coupled to Claude target adapter | Split target-neutral V1 instruction planner from target codec |
| `V5-C20` | Card capture/diff can silently copy or omit Goose intent | Explicit project-local exclusion/classification tests |
| `V5-C21` | Effective selection controls legacy skills while the state machine discovers them independently | Two-engine contract, concrete-vector evidence, and separate skill/MCP verdicts |
| `V5-C23` | V1 ownership includes symlink, field, content, and recursive-tree kinds | Closed whole-image journal union and recovery tests for every kind |
| `V5-C24` | Normalized extension keys race under concurrent loading | Pre-launch uniqueness gate across profile/plugin inputs; no CLI flags in strict envelope |
| `V5-C25` | Summon, orchestrator, and restored Agents inherit different state | Explicit session-carried/suppressed rows and child-mode tests |
| `V5-C26` | Installed-plugin skill paths include mutable default/custom sources | No-network source-equivalent mirror; due/unsafe/blind state withholds activation |
| `V5-C27` | Local config/lock and hygiene currently publish separately | Extended optional-file project-state transaction; hygiene only in projection commit |
| `V5-C28` | Managed-file backups also protect machine writes | Project-only hard cut; unchanged machine backup fixture |
| `V5-C29` | Standalone link/unlink can publish local state without full projection | Permanent local-ignore precommit through the shared executor |
| `V5-C30` | Authoritative local Goose source moved beyond the historical 1.41 live probe | Pin source commit plus binary digest/build provenance; retain 1.41 evidence as historical only |
| `V5-C31` | Legacy and experimental state-machine engines activate skills differently | Strict legacy-engine envelope; explicit engine observation and negative state-machine tests |
| `V5-C32` | Latest `GOOSE_PATH_ROOT` accepts only absolute paths and can accept non-Unicode absolute values | Absolute-only mirror, corrected path matrix, fail-closed unrepresentable plugin effect |
| `V5-C33` | Global agents-home instructions and turn-dynamic contained hints expand the instruction read set | Global/dynamic instruction observations and containment tests |
| `V5-C34` | Latest `goose tui` execs an external frontend and summon subagents suppress hooks | TUI unverified; main/subagent hook and registration rows tested separately |
| `V5-C35` | Config map keys, exact runtime names, and normalized manager keys are distinct identities | Parse injected/explicit names and require post-selection normalized-key uniqueness before launch |
| `V5-C36` | I238 and I266–I269 are concurrently changing repository state outside I214 authority | Quarantine their worktrees; require landed-SHA overlap and seam re-audit before G2 freeze/implementation |
| `V5-C37` | I265 landed Worker 1.3 Card declarations and a zero-effect materializer admission gate on an I214 shared seam | Preserve declaration validation and enforce admission → store identity → I214 preflight/any applicable consent → upstream commits → projection ordering with targetless-config and zero-effect rejection tests |
| `V5-C38` | I265 changed package/release contracts and retired the Buzz delivery Card before I214 adds a packaged registry | Preserve package 1.3.0, derivation command, existing required members, required Buzz tooling, provenance/publication/recovery controls, retired-Card absence, and accepted vectors; append and production-parse only the target-adapter sidecar |

## 10. Minimum pre-approval adversarial matrix

- Every entry-point row in section 2: root, nested, no-profile, recipe variants, resume/fork/move,
  terminal, review, ACP overrides, Desktop, external TUI, scheduler, gateway, summon/orchestrator,
  and chat. No deleted legacy HTTP-server fixture remains.
- Authoritative source identity, workspace version, binary digest, and build provenance disagree
  independently; the historical 1.41 binary never satisfies a latest-source positive claim.
- `CONTEXT_FILE_NAMES` with and without `AGENTS.md`; normal and absolute-root agents-home
  `AGENTS.md`; Git-root-to-CWD initial hints; and dynamic path/command discovery for existing,
  missing, root-equal, parent-traversing, outside-symlink, contained-symlink, and duplicate
  canonical subdirectories.
- `GOOSE_STATE_MACHINE` unset, empty, unrecognized, `1`, `true`, `TRUE`, and `yes`; legacy mode
  with the `skills` extension present/absent versus state-machine mode with profile, no-profile,
  recipe-owned, and filtered vectors. Only the legacy qualified row can claim I214 activation.
- `EXTENSIONS` environment override, layered extension-map merges, malformed/unavailable entries,
  recipe/ACP overrides, and persisted vectors with and without `skills`; map-key name injection,
  explicit names unequal to map keys, and malformed non-mapping entries.
- Exact-name replacement and exact-distinct/normalized-equal profile, project-plugin, ACP, and CLI
  extension aliases under reversed async completion; the strict harness rejects unequal
  post-selection normalized duplicates and all CLI extension flags.
- Summon at root/nested roots with inherited, filtered, and empty vectors; orchestrator child and
  ExecutionManager restore prove no project MCP rediscovery and the specified activation class;
  ordinary Agents discover/register hooks while Summon subagents have no HookManager-triggered
  discovery or ambient registration; independently assert that their inherited/filtered
  session-carried MCP vector still loads.
- Default-platform, absolute Unicode, empty, relative, absolute non-Unicode, and relative non-
  Unicode `GOOSE_PATH_ROOT` cases cover config, user settings, agents home, user-plugin roots,
  plugin-map keys, status redaction, and consent blocking when exact round-trip is impossible.
- Every skill collision class in section 5 under reversed enumeration orders.
- Same-root symlink, unreadable/blind subtree, nested marker, case alias, and VCS segment cases.
- Status/doctor with an auto-update-enabled plugin proves zero Goose/network/filesystem mutation.
- Installed-plugin mirror covers default, root fallback, custom, and exclusive Open Plugins skill
  paths, including `exclusive:true` with a simultaneously present default root; deeper-than-
  immediate raw-name skills; project-plugin `skills/` non-discovery; transient staging children;
  malformed manifests, unsafe/blind paths, and due auto-update withhold qualification.
- Proposed-state preflight blocks before acknowledgements, hygiene, vendor, V1, or target output.
- Worker materialization rejects an invalid outer/lock/runtime-admission envelope before store
  decoding/verification and before any I214 preflight effect; a valid envelope plus a late generic
  I214 blocker leaves acknowledgement, registry, store, state, consent, and projection bytes
  unchanged, and current materialization still derives a targetless project config.
- Card target changes round-trip `runtimeAdmission` and `applicationRequirements`; every deployable
  fixture has both declarations, `store.minDrwnVersion` of at least 1.3.0, and a derived envelope,
  including empty explicit declarations for closures with no owned servers/applications.
- Upstream commit followed by injected projection failure reports retryable partial state.
- Failure injection between local lock/config checkpoints recovers the extended state transaction;
  failure after that commit but before hygiene/projection reports retry-required and converges.
- Single/bulk link, unlink with and without `--write`, missing/drifted `.gitignore`, and failure
  between safety-hygiene and local publication prove local files are never exposed unignored.
- Projection failure injection at every group and every absent/file/symlink/tree transition;
  managed-fields recovery restores the complete container and tree recovery preserves literal
  symlinks; recovery converges without `.bak*`.
- Org Worker materialize/remove/reconcile with disabled and enabled Goose, consent absent/current/
  stale/revoked, and crash at every outer/subordinate boundary.
- One snapshot feeds all status/doctor JSON, human output, and severity decisions.
- Packed sidecar bytes production-parse before any project command; help/version remain target-
  independent.
- The same qualified tar retains every pre-I214 `REQUIRED_RELEASE_MEMBERS` entry, separately
  asserts the four exact runtime-admission paths, keeps the retired Buzz delivery Card absent and
  required Buzz tooling present, and production-parses the sidecar in both initial and
  recovery/download artifact lanes.
- Existing target byte/mtime/output-schema non-regression.
- Journal-backed project writes create no `.bak*`; machine-write backup/failure behavior remains
  byte-for-byte covered by an explicit retained fixture.
- Conceptual Pi observer compiles against the sibling observation seam with zero Pi production.

## 11. Provisional recommendation

Candidate v5 should combine:

1. authoritative latest-source pin plus a strict verified native Goose legacy-engine envelope;
2. pure projection adapter plus optional target-neutral runtime observer;
3. tier-aware, no-follow, same-root-fail-closed skill qualification;
4. complete proposed-state preflight;
5. ordered upstream and atomic project-projection commits with explicit retry state;
6. executor before-images instead of `.bak*` for project projection, with machine behavior
   retained; and
7. no launcher, universal ledger cut, coordinated multi-journal, or Pi production.

The historical Goose 1.41 live probe remains evidence, not current qualification. The external
TUI and experimental state-machine engine remain safely projectable but unverified. This is the
smallest design that is both truthful about Goose and long-term compatible with Pi.
It remains consolidation evidence until candidate v5 incorporates the contract and an independent
pre-approval challenge tests it; the human Reviewer verdict remains separate.
