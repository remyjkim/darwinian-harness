# ABOUTME: Registers the five specialist packets, coordinator resolutions, and human decisions for I214 G1.
# ABOUTME: Separates agent recommendations from Owner authority and records immutable review hashes.

# I214 Goose G1 Decision and Evidence Register

**Status:** Post-I265 amendment approved; commit and exact-commit T5-R6 pending

**Date:** 2026-08-11

**Base:** `cef3090c013134b578d87fd938a6741fd288d36a`

## 1. Authority boundary

The five specialists provide evidence and recommendations. A0 reconciles their packets but
does not issue a gate verdict. The human Owner decides architecture, scope, consent, and risk;
the human Reviewer alone records the formal G1 verdict in Notion.

## 2. Team identity and packet sources

All five agents ran as Codex `gpt-5.6-sol`, reasoning effort `xhigh`, with YOLO enabled, in
Herdr workspace `w1`, tab `w1:t1`. Their interactive panes remain the raw session source.

| Packet | Role | Herdr agent | Pane | Mutation authority |
| --- | --- | --- | --- | --- |
| T1-P1 | Target platform/runtime contract | `sol_status` | `w1:p6` | Read-only G1 advice |
| T2-P1 | Goose runtime | `sol_process` | `w1:p4` | Read-only G1 advice |
| T3-P1 | Pi future-consumer witness | `sol_stream` | `w1:p3` | Read-only G1 advice |
| T4-P1 | Ownership, safety, diagnostics | `sol_vector` | `w1:p8` | Read-only G1 advice |
| T5-R1 | Independent verifier | `sol_entropy` | `w1:pA` | Read-only review; no gate authority |
| T1-P2 | Shared-seam source reconciliation | `sol_status` | `w1:p6` | Read-only amendment review |
| T2-P2 | Immutable Goose-source reconciliation | `sol_process` | `w1:p4` | Read-only amendment review |
| T3-P2 | Ledger wire-compatibility review | `sol_stream` | `w1:p3` | Read-only amendment review |
| T4-P2 | Adversarial ownership/consent review | `sol_vector` | `w1:p8` | Read-only amendment review |
| T1-P3 | Shared/release seam audit | `sol_status` | `w1:p6` | Read-only candidate review |
| T2-P3 | Goose codec/mode audit | `sol_process` | `w1:p4` | Read-only candidate review |
| T3-P3 | Ledger/concurrency audit | `sol_stream` | `w1:p3` | Read-only candidate review |
| T4-P3 | Transaction/path-safety audit | `sol_vector` | `w1:p8` | Read-only candidate review |
| T5-R2 | Independent frozen-candidate review | `sol_entropy` | `w1:pA` | Read-only review; no gate authority |
| T1-P4 | Instruction/scope/Beads amendment review | `sol_status` | `w1:p6` | Read-only amendment review |
| T2-P4 | XDG/runtime/provider amendment review | `sol_process` | `w1:p4` | Read-only amendment review |
| T3-P4 | Cross-finding and Pi-wire-compatibility review | `sol_stream` | `w1:p3` | Read-only amendment review |
| T4-P4 | Watch/path/Git-hygiene amendment review | `sol_vector` | `w1:p8` | Read-only amendment review |
| T5-R3 | Independent frozen-candidate review | `sol_entropy` | `w1:pA` | Read-only review; no gate authority |
| T1-P5 | Project-config writer closure audit | `sol_status` | `w1:p6` | Read-only candidate-v4 amendment review |
| T2-P5 | Whole-map/discovery/write-path Goose-source audit | `sol_process` | `w1:p4` | Read-only candidate-v4 amendment review |
| T3-P5 | Cross-finding/Pi-wire adjudication | `sol_stream` | `w1:p3` | Read-only candidate-v4 amendment review |
| T4-P5 | Portable-path grammar and corpus audit | `sol_vector` | `w1:p8` | Read-only candidate-v4 amendment review |

## 3. Frozen specialist conclusions and A0 resolutions

### T1-P1 — Shared seam and file ownership

T1 concluded that adapters must be pure planners with capability, declared-read-set, plan,
and ambient-interpretation methods. The shared executor alone may snapshot, validate, lock,
write, clean, journal, recover, and inspect. T1 enumerated the previously missed closed seams
in `machine-config.ts`, `mcp.ts`, `effective-state.ts`, and command target parsing, and required
legacy parity for paths, bytes, warnings, filtering, drift, force, cleanup, and dry-run.

Resolution: accepted. The initial T1 reference to write-record V2 was superseded by T3-P1 and
T4-P1. T1 owns planning, configuration, selection, dispatch, and legacy integration; T4 owns
all physical mutation and new-ledger behavior.

### T2-P1 — Exact Goose surface matrix

T2 froze project instructions at root `AGENTS.md`, shared skills at
`.agents/skills/<id>`, and MCP as the indivisible two-file
`.agents/plugins/drwn/{plugin.json,.mcp.json}` unit. Full, MCP-only, and skills-only behavior
is exact; unselected surfaces are retained byte-for-byte. Every machine surface is unsupported,
global registration is diagnostic-only, and hooks/recipes emit no output. T2 required a stable
duplicate-source failure when another Goose-visible root exposes the same skill ID.

Resolution: accepted except its recommendation to remove consumer sets and its pre-probe
duplicate-source failure. T3-P1 and T4-P1 showed that a minimal `target:<registryKey>` set is
schema-stable, while I214 still emits only `target:goose`. The later isolated precedence probe
proved that project `.agents/skills` wins over the other known Goose roots on 1.41.0, so
qualified duplicates are warnings and unqualified-version duplicates fail closed.

### T3-P1 — Separate ledger and future-consumer compatibility

T3 rejected in-place migration. `drwn.write-record@1` remains unchanged; adapter-native leaves
use strict `drwn.target-projection-ledger@1`. Unknown schema versions block mutation, recovery,
and cleanup. Syntactically valid unknown `target:<id>` consumers remain opaque and active;
unknown producer-contract pairs are read-only; unknown entry kinds require a schema bump and
fail V1 closed. Malformed identity fails closed. Hook
capability remains in the adapter ABI but returns `unsupported:out_of_scope_i214` and creates
zero runtime wiring or files.

Resolution: accepted with the P2 clarification that strict V1 rejects unknown kinds while
preserving valid unknown consumers and valid entries from unknown producer-contract pairs.

### T4-P1 — Ownership, consent, transaction, and diagnostics

T4 froze leaf-only ownership, non-owning containers, foreign/symlink refusal, retained drift,
and cross-ledger overlap rejection. It specified the machine-local strict consent receipt,
typed interactive grant, exact binding validity, fixed consent-then-project lock order, durable
journal, third-state recovery conflict, revoke-first tombstone, idempotent revoke-pending
recovery, and separated consent/projection/transaction/ambient diagnostics.

Resolution: the authority boundary remains accepted, while T4-P1's initial single-path effect
description is superseded by T2-P5. The receipt never grants drwn authority to edit Goose global
configuration directly; it acknowledges that plugin materialization can cause Goose to insert
all enabled absent discoveries and migrate/fully serialize the writable user config.

### T5-R1 — Independent review of candidate v1

T5 verified the frozen hashes before and after its read-only review and recommended
`CHANGES REQUIRED` without changing Notion. Findings were:

1. critical — write-record V2 migration was backward-unsafe and could not represent all V1
   ownership;
2. important — consent lacked an exact receipt, authority, corruption, partial-write, and
   transaction contract or attributable Owner decision;
3. important — hook/provider/version behavior was unqualified;
4. important — shared skill precedence and duplicate-source behavior were unresolved;
5. important — the adapter mutation boundary and exclusive file graph were not executable;
6. important — specialist packets, Owner decisions, and machine-scope disposition were not
   auditable;
7. minor — the baseline claim lacked a preserved execution artifact.

Resolution: all seven findings are addressed in candidate v2. T5-R2 must independently verify
the revised hashes; this register does not convert T5 advice into a human Reviewer verdict.

### T5-R2 — Independent review of Owner-approved candidate v2

T5 verified all six candidate hashes and the base commit before review, read the full evidence
set, challenged current writer, release, watch, skill, and pinned-runtime seams, then verified
the same hashes and clean tracked/staged state after review. It recommended `CHANGES REQUIRED`
without changing Notion or the worktree. Findings were:

1. important — the ambient classifier omits the pinned macOS `XDG_CONFIG_HOME` behavior shown
   by the preserved 1.41.0 live probe;
2. important — disabled target-filtered write semantics do not define one consistent
   `AGENTS.md` outcome across full, MCP-only, and skills-only modes;
3. important — write-watch lacks a frozen topology for authoritative `.agents/skills` and
   `.agents/plugins` roots, including absent-root creation and legacy suppression composition;
4. important — current skill identifiers permit glob, control, Unicode, and case-fold hazards
   that the proposed paths and raw anchored Git-ignore leaves do not constrain; and
5. important — Goose eligibility is undefined for the existing `shared`, `claude-only`,
   `codex-only`, and `experimental` skill scopes;
6. important — the exported Beads direct project-config writer remains conditionally outside
   the required shared locked mutation route; and
7. important — exact-runtime requirements for consent and plugin use conflict with a generic
   warning-only downgrade, leaving plugin-bearing apply behavior ambiguous for mismatched or
   unknown runtime/provider state.

Resolution: accepted for amendment. A0 withheld formal G1 submission and assigned read-only P4
reviews to T1 through T4. Candidate v2 hashes remain the immutable object T5 reviewed. The P4
packets resolved all seven findings in candidate v3 without changing the ledger schema, adapter
ABI, separate-ledger choice, Pi scope, or universal-cut decision. The Owner approved candidate
v3 in the active Codex conversation; a fresh exact-hash T5 review is still required before G1
submission. T5 advice is independent evidence only, not the formal human Reviewer verdict.

### T1-P2 through T4-P2 — Source-reconciled amendment pass

T1 found that the executor prose lacked callable authority boundaries, `project.ts` and
`write-watch.ts` were unassigned closed seams, and Git hygiene needed an explicit pure-renderer
versus journaled-publication split. T2 confirmed the version pin and plugin/skill behavior but
showed that Goose passes non-PLUGIN_ROOT interpolation literally, silently filters 31 environment
keys, and ignores unknown MCP keys. T3 required literal retained-entry/consumer grammar and
producer-contract compatibility. T4 required literal ledger/receipt variants, an honest
old-client concurrency boundary, intent-specific revoke recovery, file-leaf Git patterns, and a
deterministic ambient classifier.

Resolution: accepted except the old-client compatibility recommendation, which became irrelevant
under `I214-D004`. Candidate v2 now freezes prepare/apply/recover/inspect signatures; strict
registered-target validation; same-name environment inheritance with fail-closed
alias/interpolation/disallowed-key handling; closed ledger/receipt JSON shapes;
materialize/cleanup/revoke journal directions; per-file Git/watch behavior; and exact
pinned-runtime ambient paths, precedence, states, severity, and exit rules.

### T1-P3 through T4-P3 — Coordinator source/release reconciliation

P3 reviewed the amended design against current project mutation routes, the five V1 ownership
kinds, release packaging, lock enforcement, skill source resolution, and immutable Goose 1.41.0
source. Every reviewer independently concluded that a universal cut fails `I214-D004`: it may
simplify registry/record topology, but it does not remove the existing ownership semantics and
would greatly expand implementation and qualification effort.

T1 required the exact current project-versus-machine precedence chains, an exhaustive
project-config writer/test matrix, strict sidecar parser failures, production parsing from the
packed artifact, and an honest topology/effort delta. T2 required a Goose-local raw MCP
eligibility validator and preservation of executable skill mode. T3 required the project-state
lock for every apply/recover, journal-stable read-only inspection, executor-derived consumer
IDs, source-bound shared projection keys, segment-aware cross-record overlap, and removal of the
last stale adapter-mutation statement. T4 required a literal cross-record journal, assignment of
the five-level lock enforcer, corrupt-receipt revocation, unowned shared ancestor containers,
and an explicit same-UID filesystem-race boundary.

Resolution: accepted. Candidate v2 now includes all of those contracts and assigns the newly
discovered source/release seams. P3 reviewed evolving coordinator snapshots rather than a frozen
candidate; its pane transcripts are the evidence source, and T5-R2 still reviews the final exact
hashes after Owner approval.

### T1-P4 through T4-P4 — T5-R2 amendment reconciliation

T1 froze the exact instruction target matrix, scope eligibility, and Beads writer closure.
Enabled full reconciliation creates or updates target-neutral `AGENTS.md`; every partial or
disabled row retains it byte-for-byte, including drifted content. Goose consumes only effective
`shared` and Card shared-equivalent skills. The unused `ensureProjectSkillInclude` direct writer
is deleted; its live shared-writer path is awaited by both init and extension setup without
holding the project lock over `bd`.

T2 froze the pinned 1.41.0 writable-config algorithm and operation-specific qualification
matrix. A Unicode-readable `GOOSE_PATH_ROOT` wins even when empty or relative; a non-Unicode OS
value falls through, while otherwise absolute XDG redirects to
`<XDG>/goose/config.yaml`, and unset/empty/relative XDG falls back to
`<home>/.config/goose/config.yaml`. Consent and plugin publication require exact 1.41.0;
target-neutral instructions and collision-free shared skills may proceed with warnings;
unqualified same-ID precedence blocks; provider qualification never binds the receipt or blocks
cleanup. An unresolvable writable config path separately blocks plugin consent/materialize but
not consent-free projection or cleanup/revoke; warning identifiers are stable; and materialize
recovery rolls back when runtime qualification makes its receipt non-current or the independent
config-path gate is unresolved. Config path is not receipt-bound.

T3 adjudicated all seven findings and confirmed the amendment remains wire-compatible with the
separately scoped Pi successor. No ledger field, schema version, adapter ABI, or Pi production
surface changes. A future consumer may join an identical source-bound projection, but producer,
key, digest, topology, bytes, and mode changes require every active consumer to agree; unknown
consumers remain opaque.

T4 froze projection-boundary identifiers and paths, literal Git-ignore rendering, portable
collision detection, and dynamic watcher coverage. `SharedSkillIdV1` is 1–64 ASCII bytes matching
`[a-z0-9]+(?:-[a-z0-9]+)*`, excluding Windows device names. Nested paths reject traversal,
absolute/drive/UNC forms, controls, trailing dot/space, and portable NFC/lowercase aliases. The
watch topology covers project and `.agents` sentinels plus recursive managed roots, including
absent-root creation; suppression is ledger-derived and journal-stable, never static-membership
based.

The post-draft P4 consistency read found additional bounded wording gaps, which A0 accepted
before freeze: stable runtime/provider/path codes and unresolvable-config behavior; materialize
recovery rollback under non-current qualification; adapter entries restricted to the target
ledger while instructions use the separate V1 planner; projection-wide compatible joins versus
all-consumer upgrades; explicit executor-intent derivation for mixed unfiltered writes;
`PortableProjectionPathV1` binding for target-ledger/journal paths; immediate journal-stable
inspection after watcher attachment; live-watch-only coverage failure; and closed root/
suppression diagnostic states. The final pass also removed a stale T2 instruction-renderer
assignment: T1 alone owns the separate V1 planner, while T2 owns conformance fixtures only.
These are stricter pre-implementation semantics, not serialized
field, schema-version, adapter-ABI, or Pi-scope changes.

Resolution: accepted. Candidate v3 incorporates all seven T5-R2 findings and the exact P4 test
obligations. The amendment is bounded to contracts and assigned seams; it does not reopen the
hard-cut decision. T5-R3 must independently verify the frozen candidate-v3 hashes before A0 may
prepare a formal human G1 review transaction.

### T5-R3 — Independent review of Owner-approved candidate v3

T5 verified all six candidate hashes, the base commit, Goose binary, and upstream tag before
review, read all six evidence documents in full, reconciled the contracts against current source
and pinned Goose 1.41.0 source, ran a fresh no-emit typecheck, and verified the same hashes and
clean tracked/staged state afterward. It recommended `CHANGES REQUIRED` without changing Notion
workflow status or the worktree. Findings were:

1. important — ambient classification validated only relevant registration keys, while Goose
   deserializes the entire winning plugin map as one value and treats it as empty when any entry
   is malformed; whole-map validation must precede redacted relevance filtering;
2. important — `PortableProjectionPathV1` omitted Windows-forbidden segment characters and its
   NFC-plus-lowercase collision key did not cover Unicode caseless aliases such as sigma versus
   final sigma; and
3. important — the writer closure awaited Beads only, while Parallel and MarkItDown use the same
   asynchronous locked project-config writer and remain unawaited in init/setup, allowing busy
   failures, premature success, or lost durability expectations.

Resolution: accepted for amendment. A0 withheld formal G1 submission and assigned source-
specific P5 reviews. Candidate v3 hashes remain the immutable object T5 reviewed. Candidate v4
requires renewed Owner approval plus a fresh exact-hash T5 review. T5 advice is independent
evidence only, not the formal human Reviewer verdict.

### T1-P5 through T4-P5 — T5-R3 amendment reconciliation

T1 enumerated exactly five floating locked-writer calls: Parallel and Beads in guided init, then
Beads, Parallel, and MarkItDown in extension setup. Every helper must expose `Promise<string>`;
init awaits Parallel then Beads sequentially; setup awaits before success output or runtime
refresh; dry-run returns before mutation; and prompts, subprocesses, downloads, and probes remain
outside the project-state lock. Busy or atomic failure propagates without a success payload. T1
also found an adjacent stale-write seam: `card-project.ts` reads config outside the lock and later
writes the whole object, so Card worker updates must use the same read-and-write-under-lock
mutation primitive. `extensions/add.ts` is an already-awaited parity path.

T2 reconciled the classifier with immutable Goose 1.41.0 source. A Unicode-readable `PLUGINS`
environment value is the sole winner; a non-Unicode OS value falls through to files. Otherwise,
successfully parsed layers containing `plugins` replace that value wholesale in `/etc`,
additional-file order, then writable-user order. Goose deserializes the entire winner as
`HashMap<String,PluginConfigEntry>`; every entry requires a boolean `enabled`, unknown fields are
accepted, and any malformed entry makes the runtime map empty.

The candidate-v4 consistency reread found and closed a further under-scoping in the initial P5
summary. Goose enumerates every direct project and user plugin child, project-winning same-name,
then settings-filters each name. It processes the complete enabled discovery set: every absent
lexical root key is active and inserted `enabled:true`, so an unrelated plugin can make the map
dirty even when `drwn` is present, and a malformed map can reinsert every enabled discovery.
Unicode-readable empty/relative `GOOSE_PATH_ROOT` produces relative user-plugin roots/keys; a
non-Unicode OS value falls back to the ordinary home/XDG roots. Persistence loads only
the writable user config: missing starts empty without migration; unreadable fails persistence
without deactivating the returned vector; and malformed/non-mapping YAML starts fresh. Every
nonmissing readable fresh or valid mapping is run through platform-extension/provider migrations.
Migration save precedes the final plugin save and may persist alone; full YAML serialization can
change ordering/comment/format/alias presentation, and provider migration can remove legacy keys.

Candidate v4 uses `GOOSE_PLUGIN_MAP_MALFORMED`, source-equivalent direct-child enumeration with
aggregate-only redaction, and `GOOSE_WRITABLE_CONFIG_UNSAFE` to block consent/plugin materialize
for unreadable, malformed, or non-mapping existing writable config. Missing and valid mappings
remain allowed with the broadened disclosure and predicted migration categories. This changes
proposed disclosure/effect digests but no receipt field or schema version.

T3 accepted findings 1 and 3 and adjudicated finding 2 as a projector-only ASCII hard cut. The
cut changes the pre-implementation value domain but no serialized field, schema number, adapter
ABI, Pi scope, or universal-target decision. A future Unicode need requires a successor path
scalar. Existing V1 paths remain valid legacy state; a nonrepresentable one conservatively
blocks target-ledger operations with `TARGET_PROJECTION_LEGACY_PATH_UNQUALIFIED`. Legacy-only
writes remain unchanged. No released receipts or ledgers require migration.

T4 froze the literal path grammar: one to 32 slash-separated segments; each segment 1–128 ASCII
bytes from `[A-Za-z0-9._-]`; total path 1–512 bytes; no dot segments, trailing dot,
case-insensitive Windows device basename, absolute/drive/UNC form, symlink, or special node.
`PortablePathKeyV1` is stored spelling with ASCII lowercase for collision only. Stable
`TARGET_PROJECTION_PATH_INVALID` reasons cover non-ASCII, forbidden characters, segment/path/
depth bounds, dot/reserved names, unsafe forms/types, and platform limits. Exact Git-ignore output
is `/` plus the validated path, with defensive invalid-state refusal.

The final executability pass removed two speculative diagnostic states. The classifier probes
only the exact current project plugin key and never scans arbitrary map keys for filesystem
aliases. Consent lookup reads only the exact current `<projectKey>.json`: effect/runtime binding
drift in a structurally valid current-scope receipt is stale, wrong placement/scope is invalid,
and a moved project observes missing rather than scanning old receipt files. This closes the
redaction and lookup contracts without adding an index or receipt archive.

A0 independently scanned the complete eligible repository corpus: 27 shared roots plus 22
active-Card roots, 49 roots total, projecting 138 nodes (87 files and 51 directories). There are
no symlinks, special nodes, or grammar incompatibilities; maximum segment length is 34 bytes,
maximum projected path is 74 bytes, and maximum depth is 5. The ASCII cut therefore removes
Unicode normalization, full-caseless comparison, and Git-ignore escaping logic while requiring
no current content migration. It drastically reduces both design complexity and implementation/
qualification effort within the projector boundary and satisfies the Owner's `I214-D004`
threshold. It does not reopen the rejected universal target/ownership cut.

Resolution: accepted into candidate v4. The three T5-R3 findings and the P5
source-equivalence defect are closed at the contract level, with the Card race added as another
bounded source-derived closure. No production code has changed. The human Owner approved the
exact amendment as `I214-D006` on 2026-08-11; A0 may freeze candidate-v4 hashes and dispatch
T5-R4, but may not treat that agent review as the formal human G1 verdict.

### T5-R4 — Independent review of Owner-approved candidate v4

T5 verified all six candidate hashes, the base commit, Goose binary, and upstream tag before
review, read all 4,056 lines of the six evidence documents, reconciled the contracts against
current source and pinned Goose 1.41.0 source, independently reproduced the complete eligible
path corpus, ran a fresh no-emit typecheck, and verified the same hashes and clean tracked/staged
state afterward. It recommended `CHANGES REQUIRED` without changing Notion workflow status or
the worktree. Findings were:

1. important — project discovery is working-directory and session-mode dependent. Goose loads
   skills and project plugins from the exact process current directory rather than a discovered
   repository root, and CLI plugin discovery is skipped for resume, `--no-profile`, or recipes
   that declare extensions. Candidate v4 models the canonical drwn project root as universally
   discoverable, so it needs an explicit supported-invocation contract or mitigation plus
   nested-CWD and session-mode diagnostics, disclosure, and qualification cases; and
2. important — a same-name skill contender inside the same discovery root is nondeterministic.
   Goose recursively traverses a root using unsorted directory iteration and keeps the first
   frontmatter `name`, so a foreign sibling under project `.agents/skills` can beat the managed
   directory. Candidate v4 permits every exact-1.41.0 alternative as a warning; same-root
   contenders must instead fail closed, while the shadow-warning policy may remain only for
   candidates in strictly later roots, with a regression fixture.

All other reviewed contracts reconciled, including the T5-R3 closures. The corpus reproduced 49
roots and 138 nodes (87 files and 51 directories), with no grammar, collision, symlink, or
special-node failures and maxima of 34-byte segment, 74-byte path, and depth 5. Fresh
`bunx tsc --noEmit` exited 0.

Resolution: accepted for amendment. A0 withholds formal G1 submission. Candidate v4 hashes remain
the immutable object T5-R4 reviewed; candidate v5 must reconcile the two findings, receive renewed
Owner approval, and pass a new exact-hash independent review. T5 advice is independent evidence
only, not the formal human Reviewer verdict.

### Authoritative latest-source audit — candidate-v5 input

After T5-R4, the human Owner identified `/Users/pureicis/dev/goose` as the authoritative latest
local Goose source and approved proceeding with the candidate-v5 direction. A0 directed a
read-only comparison from the historical audited commit
`39c27c387d726ce4605108d2f974d4feec158ed5` to current commit
`db7a704446975c88d3b67490c74d33bcd684404e`, workspace version `1.45.0`. The source worktree was
clean when its identity was recorded. This latest-source audit supersedes candidate-v4 runtime
assumptions only for the new candidate; it does not rewrite the evidence identities or hashes of
candidates v1 through v4 and is not a fresh live-binary probe.

The audit retained the exact-CWD project skill order `.agents` → `.goose` → `.claude`, unsorted
same-root traversal, CLI/ACP project-plugin gating, persisted MCP vectors for resume/fork/term,
scheduler process-CWD behavior, generated gateway roots, Desktop extension overrides,
orchestrator suppression, and ExecutionManager restore semantics. It requires these candidate-v5
amendments:

1. Model `GOOSE_STATE_MACHINE` as an invocation input. The legacy loop requires the effective
   `skills` extension for positive skill activation. The state-machine loop always installs a
   direct `SkillOperation` and discovers skills from the concrete session CWD, so
   `--no-profile`, recipes, resume/fork, and ACP overrides may suppress or carry MCP without
   suppressing state-machine skill discovery. Chat still discloses context but skips backend MCP
   and `load_skill` execution. Exact seams:
   `crates/goose/src/agents/state_machine/mod.rs:56-60`,
   `crates/goose/src/agents/agent.rs:1631-1659,1888-1894`,
   `crates/goose/src/agents/state_machine/ops_skills.rs:54-76,93-113,292-340`, and
   `crates/goose/src/agents/state_machine/ops_toolcalling.rs:643-725`.
2. Delete the separate legacy HTTP `/agent/start` row and its source-closure item because
   `crates/goose-server` was removed. `goose serve` is ACP over HTTP/WebSocket and shares ACP
   new/load/fork activation; transport parity replaces a duplicate legacy request contract.
3. Treat `goose tui` as launcher-only source evidence. The in-repository TUI runtime was removed;
   the launcher defaults to mutable `@aaif/goose@latest` and searches local code only through
   executable ancestors. TUI runtime activation remains unverified without a separate exact npm
   artifact pin (`crates/goose-cli/src/commands/tui.rs:5-43,45-95`).
4. Record that Summon marks its child Agent as a subagent and therefore receives an empty
   HookManager. Its inherited/filtered extension vector and contained working directory remain,
   while project-hook registration is now explicitly absent for that child
   (`crates/goose/src/agents/agent.rs:406,433-440`;
   `crates/goose/src/agents/platform_extensions/summon.rs:1302,1557-1609,1859`).
5. Replace the historical `GOOSE_PATH_ROOT` classifier for candidate v5. Current `Paths` reads
   the OS value with `var_os` and honors it only when absolute: unset, empty, or relative values
   fall through to platform paths, while an absolute non-Unicode value is accepted. Plugin
   settings reuse that validated root (`crates/goose/src/config/paths.rs:40-45,103-119`;
   `crates/goose/src/plugins/discovery.rs:194-209`). Candidate-v4 statements that Unicode-readable empty/relative
   values win and non-Unicode values fall through remain historical 1.41.0 evidence only.
6. Keep ACP exact-name replacement distinct from normalized-key collision. ACP removes an exact
   prior name and appends the later source deterministically, while unequal aliases that normalize
   to one runtime key remain completion-order dependent under concurrent loading. Configuration
   map keys are now injected as extension names when `name` is absent. The inventory and tests
   must cover both rules (`crates/goose/src/acp/server.rs:422-430,769-805`;
   `crates/goose/src/config/extensions.rs:22-32,43-81`;
   `crates/goose/src/agents/agent.rs:1302-1368`).

The source audit is an evidence packet, not an agent or human G1 verdict. No Notion workflow
state was read or changed by this work, and this register records no formal human Reviewer pass.

### T5-R5 — Exact-commit review of candidate v5

T5-R5 reviewed exact commit `35a1ac782ca1b5d335da9b403a49a2627b4a1818` over base
`ea13a582d7797619f2a934a59c34368241cca191`. It verified the clean eight-file range, all frozen
hashes, `git diff --check`, fresh `bun run typecheck`, the baseline log identity and
2,212-pass/10-skip/0-fail summary, clean Goose source at `db7a704...`, source-contract closure, and
the concurrent-work quarantine. It returned changes requested for two important task-plan defects:

1. Tasks 15–17 assigned T2 or T4 edits to T1-exclusive shared hotspots without the required
   bounded ownership transfers.
2. Tasks 12 and 16 did not expose the plan's required behavior-by-behavior observed RED, minimal
   implementation, and exact GREEN commands.

The architecture/source packet remained coherent. A0 stopped before push, PR creation, or Notion
mutation and routed both findings back into the task plan. This agent review is not a human
Reviewer verdict and changes no workflow status. The amended plan requires renewed exact-byte
Owner approval, a new commit, and a fresh exact-commit T5 review before formal G1 submission.

### Landed-I265 base-integration audit

After the T5-R5 amendment commit, the human Owner reported that `origin/main` had moved and
directed I214 to integrate the latest tip without conflicting with it. A0 fetched
`cef3090c013134b578d87fd938a6741fd288d36a`, confirmed it was 45 commits ahead of the historical
base and the merge of I265, rebased the two I214 commits without textual conflict, and proved
their pre/post-rebase blob equivalence with range-diff and direct comparison. The rebased commits
are `bbd21f4` and `efd7150`. No coworker worktree was entered or mutated.

The absence of a merge conflict was insufficient. Two read-only specialist audits independently
closed the semantic overlap:

1. The Worker/materializer audit found that `card-manifest.ts` now carries strict
   `runtimeAdmission` and `applicationRequirements` declarations and that
   `worker-materialize.ts` rederives the canonical envelope before store verification or any
   effect. It froze admission → store identity → I214 preflight/any applicable consent → upstream
   commit → projection ordering, targetless Worker-config derivation, exact declaration round
   trips, and zero-effect invalid/late-generic-blocker tests.
2. The release audit found package `1.3.0`, `runtime-admission:derive:v2`, existing required
   members, provenance/publication/recovery controls, Windows derivation coverage, retired Buzz
   delivery Card absence with required Buzz tooling retained, and accepted I268 vectors. It
   required a strictly additive target-registry artifact contract
   and left release/adoption to I267 and Finch publication to I268.

A0 then ran a fresh baseline with an official standalone Bun 1.2.21 binary whose SHA-256 is
`2803929d4d8a82b6d0a76b1cefb3c929dd6d0c3888604e449d59b64ba891d82a`. The focused overlap suite
passed 306/1 skip/0 fail; the full suite passed 2,365/11 skip/0 fail; typecheck, release readiness,
package dry-run, and the Docusaurus production build also passed. The separate qualification run
record is `.ai/analyses/cl0214_goose_post_rebase_baseline_evidence.md`; it remains an
approval-pending draft until its exact digest and commit are frozen.

Resolution: bounded G1 amendment required; topology unchanged. I265's landed SHA closes its
portion of `I214-D008`, while I238 and I266–I269 remain quarantined and pending. The prior D010
approval does not authorize these changed bytes. No push, PR, Notion mutation, G1 verdict, G2
approval, or production implementation follows until renewed exact-byte Owner approval and a
fresh exact-commit independent review.

### Post-I265 pre-freeze review

Three independent read-only reviews challenged the uncommitted amendment before hash freeze.
Their first round found bounded defects: a nonexistent Goose selection in targetless Worker
materialization; an already-GREEN preservation case mislabeled as Task 12's first RED; an
ambiguous Card target fixture; imprecise `store.minDrwnVersion`, release-member, and Buzz wording;
missing producer/release citations and focused tests; omitted T1 ownership of
`worker-materialize.ts`; and baseline head/base/freeze imprecision. A0 accepted every finding and
amended only the affected documents.

The reviewers then re-read the corrected shared bytes and all returned PASS with no material
findings:

- Worker/architecture review: architecture
  `eeeaa311cdba8bcf2257761397ff0997824ac7eef921a98f40231a8bffc5ba96`, coverage
  `d43c86fc75505920ec920adb480d0caf46988c1eb5f21cc37f7e252cd58dee69`, and strategy
  `b3373a46a432e8009ef58423be78a57dadad39c13b59c355b0db7fefb4360bd3`.
- Release/plan review: plan
  `67656206944d79a39fea217326f3caaae3b53a895cd1a729104ee875284018f0`, plus the same architecture,
  coverage, and strategy hashes.
- Provenance/authority review: exact raw-log sizes/digests, historical evidence immutability,
  D011 scope, head/base ancestry, Buzz precision, concurrent quarantine, and `git diff --check`.

These are agent evidence passes, not human Owner approval, a formal Reviewer verdict, or workflow
state. Any edit to a reviewed non-register artifact invalidates the corresponding PASS.

## 4. Human decisions

| Decision ID | Authority | State | Decision |
| --- | --- | --- | --- |
| `I214-D001` | Human Owner in the active Codex conversation | Recorded | Approved proceeding with the initial G1 design and the six-seat strategy. This authorized architecture work, not a formal Notion G1 pass. |
| `I214-D002` | Human Owner in the active Codex conversation | Recorded | Use `.agents/` as the default Goose folder when choosing between Goose-visible alternatives. The 1.41.0 precedence probe supports `.agents/skills` as the authoritative project source. |
| `I214-D003` | Human Owner in the active Codex conversation | Recorded | Approved candidate v2: `.agents` authoritative; file-target registry/config and V1 write-record unchanged; separate strict default-disabled adapter sidecar and leaf ledger; project-only Goose intent; executor-derived consumers and source-bound shared skills; effect-scoped machine-local consent with safe corrupt-receipt revoke; literal cross-record journal and revoke-never-restores recovery; exact Goose 1.41.0 stdio-only MCP with fail-closed raw/env rules; hooks and machine projection excluded; active Goose committedSurfaces output unsupported while disabled/revoke cleanup remains allowed; portable Node path safety excludes a malicious same-UID intermediate-directory race. |
| `I214-D004` | Human Owner in the active Codex conversation | Recorded | Backward compatibility is not a requirement because no version has been publicly released. Use a hard cut only if it drastically reduces both design complexity and required effort. A0 and all four P3 authoring specialists evaluated a universal cut and rejected it: it simplifies dual registry/record topology but does not eliminate the five existing ownership semantics, and it expands changes across every target, Worker ownership consumer, merge-field path, schema, and fixture. It therefore does not drastically reduce either dimension and substantially increases effort. |
| `I214-D005` | Human Owner in the active Codex conversation | Recorded | Approved candidate v3 after T5-R2/P4 reconciliation: exact enabled/disabled instruction retention; shared/Card-only Goose skill eligibility; strict projector-only skill IDs, nested paths, portable collision keys, and literal Git-ignore encoding; dynamic `.agents` watcher topology; exact XDG/`GOOSE_PATH_ROOT` configuration behavior; operation-specific runtime/provider qualification; deletion of the unused Beads direct writer and awaited shared-writer callers. No ledger schema, adapter ABI, Pi scope, or universal-cut change. This authorizes exact-hash T5-R3 review, not a formal human Reviewer verdict. |
| `I214-D006` | Human Owner in the active Codex conversation | Recorded | Approved candidate v4 on 2026-08-11: whole-winning-plugin-map validation; complete project/user plugin discovery and aggregate lexical-key insertion semantics, including relative keys under Unicode-readable empty/relative `GOOSE_PATH_ROOT` and ordinary-path fallback for a non-Unicode OS value; writable-user migration/full-serialization disclosure; `GOOSE_WRITABLE_CONFIG_UNSAFE` blocking unreadable, malformed, or non-mapping existing config; exact-current-key-only registration diagnostics and receipt lookup with project moves classified missing; and consent-disclosure/effect-digest re-freeze. Also approved ASCII-only `PortableProjectionPathV1` with conservative nonportable-V1 blocking, all five Parallel/Beads/MarkItDown writes awaited, and Card worker config mutation under the shared lock. The projector-only hard cut satisfies `I214-D004` because the 138-node current corpus is already compatible and the cut removes Unicode/caseless/escaping design and qualification work. No schema number, adapter ABI, Pi scope, or universal-cut change. Approval authorizes the digest and exact-hash candidate freeze followed by T5-R4 review, not a formal human Reviewer verdict. |
| `I214-D007` | Human Owner in the active Codex conversation | Recorded | On 2026-08-11, approved proceeding with the candidate-v5 direction after the source-complete reconciliation and identified `~/dev/goose` (`/Users/pureicis/dev/goose`) as the authoritative latest Goose source. This approves continued architecture amendment against commit `db7a704446975c88d3b67490c74d33bcd684404e`; it does not approve not-yet-frozen candidate-v5 bytes, does not record a Notion transition, and is not a formal human Reviewer G1 verdict. |
| `I214-D008` | Human Owner in the active Codex conversation | Recorded | On 2026-08-11, identified I238 and I265–I269 as active coworker-owned work and directed I214 not to interfere. Their mutable worktrees are quarantined from I214 edits, rebases, tests, cleanup, and cherry-picks. Before G2 freeze or implementation, A0 records owner-supplied landed SHAs or explicit non-overlap dispositions and audits the combined `main` descendant for I214 path/semantic overlap. This decision changes no Notion status and grants no authority over those issues. |
| `I214-D009` | Human Owner in the active Codex conversation | Recorded | On 2026-08-11, approved the exact candidate-v5 pre-freeze hash set recorded below after an independent read-only adversarial review returned PASS with no material findings. This authorizes deterministic integrity-register finalization only. It does not authorize a Git commit, mutate Notion, record a formal Reviewer G1 verdict, close the concurrent-issue integration gate, approve G2, or authorize implementation. |
| `I214-D010` | Human Owner in the active Codex conversation | Recorded | On 2026-08-11, approved the exact T5-R5 amendment: task plan `f4185413ab65239bf5570adf4465b6d672dcd02bbd65ecfd0c44edb040b34de7` and pre-approval decision register `9c237ba6911e0667b25a5127113ac3dfa9949e9d9488caaa5e8c36655da83d9c`, with the other six artifact hashes unchanged. This authorizes deterministic register finalization, a replacement documentation commit, fresh exact-commit T5-R6 review, and—only if T5-R6 passes—the G1 PR/submission and a separately recorded stacked Planning transition. It does not itself record a human Reviewer verdict, close the combined-base gate, approve G2, or authorize implementation. |
| `I214-D011` | Human Owner in the active Codex conversation | Recorded | On 2026-08-11, reported that `origin/main` had moved and directed I214 to avoid conflicts, ideally by rebasing onto the latest tip. A0 fetched and rebased onto landed-I265 commit `cef3090c013134b578d87fd938a6741fd288d36a`, then performed the semantic overlap and fresh-baseline audit recorded above. This authorizes the rebase and continued integration amendment only; it does not approve the changed document bytes, mutate Notion, record a Reviewer verdict, approve G2, authorize production implementation, or grant authority over I238/I266–I269. |
| `I214-D012` | Human Owner in the active Codex conversation | Recorded | On 2026-08-11, approved the exact post-I265 pre-approval hash set recorded below: preserved evidence `73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd`, historical baseline `d25e169ef62f9b8003f07be9e1f423092da4df28beb637cb9f6eddd665dfe1c1`, fresh baseline `71159b8baae11407c9846d9be9c2197c0cd89fcff458c122019b9733402e252b`, skill probe `3b4ea0ec0f25b76998cd94fce79b8af7636ed22f09498d7d2124cb84bafed280`, coverage `d43c86fc75505920ec920adb480d0caf46988c1eb5f21cc37f7e252cd58dee69`, architecture `eeeaa311cdba8bcf2257761397ff0997824ac7eef921a98f40231a8bffc5ba96`, strategy `b3373a46a432e8009ef58423be78a57dadad39c13b59c355b0db7fefb4360bd3`, task plan `67656206944d79a39fea217326f3caaae3b53a895cd1a729104ee875284018f0`, and pre-approval register `624def21200d702f9e8e4339e6be422593e4743266d8811820fb63c9d013ce25`, on integrated base `cef3090c013134b578d87fd938a6741fd288d36a` with authoritative Goose source `db7a704446975c88d3b67490c74d33bcd684404e`. This authorizes deterministic register finalization, the six-file amendment commit, and exact-commit T5-R6 review. Only if T5-R6 passes does it also authorize branch push, G1 PR/submission, and a separate stacked Planning transaction. It does not record a human Reviewer verdict, approve G2, authorize production implementation, close the I238/I266–I269 integration gate, authorize release/publication, or grant authority over coworker worktrees. |

Candidate v3 received `I214-D005` and was reviewed by T5-R3. Candidate v4 received explicit
`I214-D006` Owner approval in the active Codex conversation and was reviewed by T5-R4. That
review returned changes required. `I214-D007` approves the candidate-v5 direction and latest
source authority, not its future exact bytes. `I214-D008` quarantines active concurrent work and
adds a pre-G2 integration audit without blocking isolated G1 documentation. `I214-D009` approves
the candidate-v5 pre-freeze bytes and permitted the deterministic integrity finalization below.
Exact-commit T5-R5 subsequently returned changes requested. `I214-D010` approves the exact
two-file amendment and authorized its replacement commit. `I214-D011` then required a latest-main
rebase and opened this post-I265 semantic amendment; D010 cannot authorize its changed bytes.
`I214-D012` approves the exact post-I265 bytes and authorizes their deterministic finalization,
commit, and T5-R6 review. Formal G1 submission remains prohibited until that exact commit passes
T5-R6; the human Reviewer alone records the subsequent formal G1 verdict.

## 5. Integrity register

### Candidate v1 reviewed by T5-R1

- preserved evidence 134:
  `73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd`
- team strategy:
  `dc569a24a14feda39f6cd968f604c512e487dcf388b156af9374734235ff5bee`
- target architecture v1:
  `6fe70b1862d25dc7c17f7de0db771a19baada366a5bb5745fc38cd798d71cd3e`

### Candidate v2 reviewed by T5-R2

Frozen after `I214-D003` and before T5-R2 dispatch:

- preserved evidence 134:
  `73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd`
- deterministic baseline evidence:
  `d25e169ef62f9b8003f07be9e1f423092da4df28beb637cb9f6eddd665dfe1c1`
- Goose skill-precedence probe:
  `7a21ec6156717f1abdd43479026ff043de4ef13a94640f8aeb1db553093ae280`
- target architecture v2:
  `80c3d469d2d11ee64f46e129ec2749ea9fd67873251cf2662bc87c27f29f017c`
- team strategy v2:
  `a83829c34febe5a6c5607cb8ed38a967ea20c7feccb2c23dd562d4c7277097e2`
- repository base:
  `ea13a582d7797619f2a934a59c34368241cca191`
- Goose 1.41.0 binary:
  `ccbc134fdc59cb75c929fbb337951a3a1fd0b66231a9283515bbfb620fb01d50`
- Goose upstream v1.41.0 source commit:
  `39c27c387d726ce4605108d2f974d4feec158ed5`
- decision/evidence register as reviewed by T5-R2:
  `72093f6d7007d5ed77b510c05729fe004be3b802c0a8a2f01804ef99191cf895`

### Candidate v3 frozen for T5-R3

Frozen after `I214-D005`, P4 reconciliation, and the final specialist consistency passes:

- preserved evidence 134:
  `73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd`
- deterministic baseline evidence:
  `d25e169ef62f9b8003f07be9e1f423092da4df28beb637cb9f6eddd665dfe1c1`
- Goose skill-precedence probe:
  `7a21ec6156717f1abdd43479026ff043de4ef13a94640f8aeb1db553093ae280`
- target architecture v3:
  `e8ba03f43a29d3c9d80e2863dc1de66daf76b28e5d0b8759d13772f3ebf7fb31`
- team strategy v3:
  `095a8cb70d66bdb19a7e41e98ad1afaa57152410998ffef45f369d30dd52a9e8`
- repository base:
  `ea13a582d7797619f2a934a59c34368241cca191`
- Goose 1.41.0 binary:
  `ccbc134fdc59cb75c929fbb337951a3a1fd0b66231a9283515bbfb620fb01d50`
- Goose upstream v1.41.0 source commit:
  `39c27c387d726ce4605108d2f974d4feec158ed5`

The register cannot contain its own dispatch hash without recursion. A0 supplies that exact hash
out of band in the T5-R3 prompt; the post-review packet records it as the reviewed-register
digest after T5 verifies the same bytes before and after review.

- decision/evidence register as reviewed by T5-R3:
  `d2598b6ecab4b0ffb334b02a0c89f6f490d6a86762b75e113b767cf601f4f433`

### Candidate v4 frozen for T5-R4

Frozen after explicit `I214-D006` Owner approval, P5 source reconciliation, four read-only
consistency checks, and fresh typecheck:

- preserved evidence 134:
  `73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd`
- deterministic baseline evidence:
  `d25e169ef62f9b8003f07be9e1f423092da4df28beb637cb9f6eddd665dfe1c1`
- Goose skill-precedence probe:
  `7a21ec6156717f1abdd43479026ff043de4ef13a94640f8aeb1db553093ae280`
- target architecture v4:
  `85415f254c37768cb100500e213a958ecfae9aac29d6a2d98ef66d70be4c3749`
- team strategy v4:
  `6c44f668d4eb79ac2f5ea82ae50f274372a8efda51f059811bc33c63f21e4954`
- repository base:
  `ea13a582d7797619f2a934a59c34368241cca191`
- Goose 1.41.0 binary:
  `ccbc134fdc59cb75c929fbb337951a3a1fd0b66231a9283515bbfb620fb01d50`
- Goose upstream v1.41.0 source commit:
  `39c27c387d726ce4605108d2f974d4feec158ed5`

The register cannot contain its own dispatch hash without recursion. A0 supplies that exact hash
out of band in the T5-R4 prompt. No author may mutate the frozen candidate until T5-R4 returns;
any change invalidates this freeze and requires a new Owner-approved candidate/hash set.

- decision/evidence register as reviewed by T5-R4:
  `cc18c5798e8736a8fa61f0ab9d1c52c9d8b1b912df09fb90f07a97c4fccf1a32`

### Candidate v5 integrity freeze

Frozen under `I214-D009` after an independent read-only pre-freeze adversarial review verified the
same eight supplied hashes and returned PASS with no material findings:

- preserved evidence 134:
  `73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd`
- deterministic baseline evidence:
  `d25e169ef62f9b8003f07be9e1f423092da4df28beb637cb9f6eddd665dfe1c1`
- latest-source skill-precedence audit:
  `3b4ea0ec0f25b76998cd94fce79b8af7636ed22f09498d7d2124cb84bafed280`
- source-to-contract coverage:
  `04333772caec3fb61bcae050310ad043c36eb8f717edffdc7740836da3a91de8`
- target architecture candidate v5:
  `535180d0877bd20b50b8f97392f668a845570c177a1571f28f79995fcc35cef0`
- team strategy candidate v5:
  `834cbcd792c1d3e53fd486f38fb2f43245fdf5f3e158b168b35a3c5ba1b75d6b`
- candidate GATE 2 task plan:
  `fe4b56a925d29bddb232c21fac4cd04d1f4876f121f6448f8d077a88bc265139`
- decision/evidence register before this deterministic approval record and placeholder fill:
  `3b7e4bdc29b570df4b108a8cfc1415b4989fc86f61949de88e53fa977727acea`
- repository base commit:
  `ea13a582d7797619f2a934a59c34368241cca191`
- authoritative latest Goose source:
  `db7a704446975c88d3b67490c74d33bcd684404e` (workspace version `1.45.0`)
- latest Goose runtime qualification: source-qualified but live-unverified; no binary whose
  digest/build provenance is tied to `db7a704...` was used for a positive runtime claim

The register cannot contain its own frozen dispatch digest without recursion. A0 supplied the
post-finalization SHA-256 out of band with T5-R5. The pre-freeze adversarial PASS was not T5-R5,
and exact-commit T5-R5 returned changes requested as recorded above. Commit `35a1ac7` is therefore
a historical reviewed candidate, not eligible for formal G1 submission. The amended plan and this
register require renewed exact-byte Owner approval, a new commit, and a fresh clean-checkout review.

### Candidate v5 amendment integrity freeze

Frozen under `I214-D010` after two independent read-only pre-freeze reviews returned PASS with no
material findings:

- preserved evidence 134:
  `73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd`
- deterministic baseline evidence:
  `d25e169ef62f9b8003f07be9e1f423092da4df28beb637cb9f6eddd665dfe1c1`
- latest-source skill-precedence audit:
  `3b4ea0ec0f25b76998cd94fce79b8af7636ed22f09498d7d2124cb84bafed280`
- source-to-contract coverage:
  `04333772caec3fb61bcae050310ad043c36eb8f717edffdc7740836da3a91de8`
- target architecture candidate v5:
  `535180d0877bd20b50b8f97392f668a845570c177a1571f28f79995fcc35cef0`
- team strategy candidate v5:
  `834cbcd792c1d3e53fd486f38fb2f43245fdf5f3e158b168b35a3c5ba1b75d6b`
- amended candidate GATE 2 task plan:
  `f4185413ab65239bf5570adf4465b6d672dcd02bbd65ecfd0c44edb040b34de7`
- decision/evidence register before this deterministic approval record and freeze:
  `9c237ba6911e0667b25a5127113ac3dfa9949e9d9488caaa5e8c36655da83d9c`
- historical T5-R5-reviewed commit:
  `35a1ac782ca1b5d335da9b403a49a2627b4a1818`
- repository base commit:
  `ea13a582d7797619f2a934a59c34368241cca191`
- authoritative latest Goose source:
  `db7a704446975c88d3b67490c74d33bcd684404e` (workspace version `1.45.0`)
- latest Goose runtime qualification: source-qualified but live-unverified; no binary whose
  digest/build provenance is tied to `db7a704...` was used for a positive runtime claim

The register cannot contain its own amended dispatch digest without recursion. A0 supplies the
post-approval SHA-256 out of band with T5-R6. Any further candidate edit invalidates this freeze
and requires renewed exact-byte Owner approval before another commit.

### Post-I265 amendment integrity freeze

Frozen under `I214-D012` after three independent read-only pre-freeze reviews returned PASS and
the Owner approved the exact supplied hashes:

- preserved evidence 134:
  `73b8f3e11a870aefd3863f377250ea22e4dac2ed5df772c160b6a020a02596fd`
- historical deterministic baseline evidence:
  `d25e169ef62f9b8003f07be9e1f423092da4df28beb637cb9f6eddd665dfe1c1`
- fresh post-rebase baseline evidence:
  `71159b8baae11407c9846d9be9c2197c0cd89fcff458c122019b9733402e252b`
- latest-source skill-precedence audit:
  `3b4ea0ec0f25b76998cd94fce79b8af7636ed22f09498d7d2124cb84bafed280`
- post-I265 source-to-contract coverage:
  `d43c86fc75505920ec920adb480d0caf46988c1eb5f21cc37f7e252cd58dee69`
- post-I265 target architecture:
  `eeeaa311cdba8bcf2257761397ff0997824ac7eef921a98f40231a8bffc5ba96`
- post-I265 team strategy:
  `b3373a46a432e8009ef58423be78a57dadad39c13b59c355b0db7fefb4360bd3`
- post-I265 candidate GATE 2 task plan:
  `67656206944d79a39fea217326f3caaae3b53a895cd1a729104ee875284018f0`
- decision/evidence register before this deterministic D012 approval record and freeze:
  `624def21200d702f9e8e4339e6be422593e4743266d8811820fb63c9d013ce25`
- qualified rebased documentation head:
  `efd7150dad20d38a52306d10031622f2d24b8fe3`
- integrated repository base:
  `cef3090c013134b578d87fd938a6741fd288d36a`
- authoritative latest Goose source:
  `db7a704446975c88d3b67490c74d33bcd684404e` (workspace version `1.45.0`)
- latest Goose runtime qualification: source-qualified but live-unverified; no binary whose
  digest/build provenance is tied to `db7a704...` was used for a positive runtime claim

The register cannot contain its own finalized digest without recursion. A0 supplies the
post-approval SHA-256 out of band with T5-R6. Any further candidate edit invalidates this freeze
and requires renewed exact-byte Owner approval before another commit.

## 6. Baseline and provenance index

- Goose configuration evidence:
  `.ai/analyses/134_goose-configuration-guide.md`
- Team strategy and execution graph:
  `.ai/analyses/cl0214_goose_target_team_strategy.md`
- Candidate target architecture:
  `.ai/analyses/cl0214_goose_target_support_target_architecture.md`
- Deterministic repository baseline:
  `.ai/analyses/cl0214_goose_g1_baseline_evidence.md`
- Fresh post-I265 exact-Bun-1.2.21 baseline:
  `.ai/analyses/cl0214_goose_post_rebase_baseline_evidence.md`
- Integrated repository base:
  `cef3090c013134b578d87fd938a6741fd288d36a`
- Historical Goose 1.41.0 same-ID skill precedence plus latest-source delta:
  `.ai/analyses/cl0214_goose_skill_precedence_probe.md`
- Goose 1.41.0 binary SHA-256:
  `ccbc134fdc59cb75c929fbb337951a3a1fd0b66231a9283515bbfb620fb01d50`
- Goose upstream v1.41.0 commit:
  `39c27c387d726ce4605108d2f974d4feec158ed5`
- Authoritative latest local Goose source commit:
  `db7a704446975c88d3b67490c74d33bcd684404e` (workspace `1.45.0`)
- Candidate-v5 source-to-contract coverage:
  `.ai/analyses/cl0214_goose_source_contract_coverage.md`

## 7. Coordinator conflict log

- T1's original V2 assumption versus T3/T4 separate-ledger finding: separate ledger wins
  because it preserves every existing producer's V1 schema and ownership semantics with parity
  integration at shared dispatch seams. It adds dual-record topology, but still requires far
  less implementation and qualification work than converting five V1 kinds, field-wise merge
  ownership, and every Worker/target consumer. The universal cut therefore fails the Owner's
  requirement that a hard cut drastically reduce both complexity and effort.
- T2's single-consumer recommendation versus T3/T4 consumer namespace: retain only the
  minimal schema namespace; I214 emits `target:goose` only and gains no speculative second
  runtime behavior.
- Strategy prose that originally assigned Goose hooks versus T2/T3/T5 evidence: the G1 target
  architecture narrows the delivery contract. No hook module or public hook API changes land.
- Historical machine-scope ambiguity: resolved to uniformly unsupported and out of scope for
  every Goose capability in I214.
- Full plugin-plan digest versus effect-scoped consent: the receipt binds the path, two-file
  shape, producer, exact version range, source/binary/build identity inside the effect-plan
  digest, and disclosed aggregate global-config effect—not ordinary MCP
  content changes, which remain governed by project configuration and ledger content hashes.
- Relevance-first ambient classification versus pinned Goose deserialization: whole-map
  validation and complete enabled-discovery modeling win because they determine the runtime's
  effective map and dirty state before the expected key alone can be interpreted. Redaction is
  preserved by aggregate-only direct-child discovery and by never rendering or path-probing valid
  unrelated config-map keys.
- Unicode preservation versus portable collision certainty: the projector-only ASCII hard cut
  wins. The current corpus is fully compatible, the path value is not released, and the cut
  eliminates substantially more design and qualification work than it creates. Existing V1
  state is not reinterpreted or migrated.
- Beads-only writer closure versus the actual shared-helper call graph: all five floating
  Parallel/Beads/MarkItDown calls must be awaited, and the adjacent Card whole-config stale-write
  seam must use the same under-lock mutation primitive. External effects remain outside the lock
  and are not falsely claimed as rolled back.
- Historical 1.41.0 runtime assumptions versus authoritative latest source: preserve the old
  binary probe and every candidate-v1-through-v4 digest as immutable evidence, but derive
  candidate v5 from `db7a704...`. In particular, split skills from MCP across legacy and
  state-machine engines, delete the removed HTTP surface, leave external TUI activation
  unverified, suppress hooks for Summon subagents, and use absolute-only OS-native
  `GOOSE_PATH_ROOT` semantics. This is a bounded source reconciliation, not retroactive evidence
  mutation or a human gate verdict.
- Conflict-free Git rebase versus landed I265 semantic overlap: the latter wins. Preserve the
  I265 declaration/admission and Worker 1.3 release contracts, place I214 preflight after
  admission/store verification, append rather than replace the packaged registry contract, and
  require focused regressions. This bounded amendment leaves the adapter/ledger topology intact
  and does not enter or coordinate coworker worktrees.
