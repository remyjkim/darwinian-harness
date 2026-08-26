---
sidebar_position: 9
---

# Per-Agent Worker Launch Contexts

A project may keep several Worker roots installed while selecting at most one
`activeWorker`. The active Worker remains the shared project base written by
`drwn write`. Darwinian Worker 1.4.2 can prepare an additional installed root
for one Claude or Codex process without changing that shared selection.

```text
shared active Worker projection
  + assigned-root-only, non-conflicting additions
  = one immutable per-process launch context
```

The command is:

```bash
drwn worker launch-context prepare <installed-root> \
  --target claude|codex \
  [--enable-mcp <optional-id>]... \
  [--strict] [--dry-run] [--json]
```

## What prepare reads and writes

`prepare` reads effective committed and local project config/lock state. The
root must already appear in `drwn status --json`; a registry, Git, file, or
version-range ref is not accepted. When an active Worker exists, its ordinary
project projection must be current. Run `drwn write` first if preparation
reports `LAUNCH_BASE_PROJECTION_STALE`.

Dry-run executes no target client and writes nothing. Normal preparation probes
the target version and writes only below:

```text
.agents/drwn/generated/launch-contexts/v1/<target>/<sha256-context-id>/
```

The context is content-addressed, concrete (no symlinks), self-identifying, and
owned by a strict manifest and receipt. Preparation does not change project
config, either lock, the write record, root `AGENTS.md`, shared target files, or
the active Worker. It does not write to user home.

Before publication, Worker verifies every store ancestor, copies skills and
hook source trees into concrete staging snapshots, checks those copies against
the hashes used by the plan, and rechecks project intent plus capability source
bytes. A source edit during preparation therefore fails with
`LAUNCH_PROJECT_STATE_CHANGED`; it cannot silently publish under the old ID.

## Additive semantics

Darwinian Worker computes the base and assigned closures in locked root/member
order.

- shared Cards do not repeat;
- identical skill and MCP identities do not repeat;
- divergent skill or MCP identities fail before writes;
- optional MCP servers are absent unless named by repeatable `--enable-mcp`;
- assigned-only hooks and explicit instructions use existing Card consent;
- normal mode warns and excludes missing consent;
- `--strict` fails instead of excluding it; and
- resolved environment secrets never enter plans, contexts, receipts, or errors.

Project overlays participate in both sides of the comparison. Ambient
user-level MCP definitions are inspected so a nested launch layer cannot
silently replace a different same-ID server.

## Claude materialization

Claude Code receives a launch-local directory plugin through `--plugin-dir`.
The plugin can contain assigned-only skills, MCP servers, and consented hooks.
Additional explicit instructions use `--append-system-prompt-file`; the default
Claude system prompt and project instructions remain present. Generated plugins
are validated before publication.

The conservative first supported Claude Code version is **2.1.212**.

## Codex materialization

Codex `skills.config` is an enable/disable control for already discovered
skills; it is not arbitrary skill injection. Darwinian Worker instead creates a
nested launch workspace inside the same Git worktree:

```text
codex/workspace/
├── AGENTS.md
├── .agents/skills/
└── .codex/
    ├── config.toml
    └── hooks.json
```

Codex walks project layers from the Git root to its working directory, so root
instructions/config/skills remain active and the nested layer adds only the
assigned delta. The descriptor uses:

```text
-C <context>/codex/workspace --add-dir <canonical-project-root>
```

The nested `AGENTS.md` tells Codex to perform all project reads, writes, Git
operations, and commands in the real worktree. Non-Git projects are rejected
for the Codex target because the required root-to-CWD layering cannot be proven.

The conservative first supported Codex CLI version is **0.149.0**.

## Lifecycle and diagnostics

```bash
drwn worker launch-context list --json
drwn doctor --json
drwn worker launch-context prune --older-than 7d
drwn worker launch-context prune --older-than 7d --execute
```

`list` and `doctor` scan a bounded self-identifying store—there is no mutable
index—and classify contexts as current, obsolete, drifted, corrupt, or foreign.
Drifted/corrupt/foreign contexts are retained. Prune is report-only unless
`--execute` is present, and execution requires `--older-than`; use `0s` only
when deliberately selecting all ages.

Darwinian Worker does not inspect Herdr bindings. A current context may still
belong to a live process, so an orchestrator should not execute prune while its
agents use those files.

Prepare/reuse and executing prune share a cross-process lock for each context
ID. This prevents prepare from returning a descriptor concurrently removed by
prune while allowing distinct target/root contexts to publish independently;
it does not make deletion of a context already used by a running target safe.
Self-identified crash-left stages are recovered under that same lock. Unowned
or malformed stage-shaped paths remain visible as foreign evidence.

## Qualification gates

The credential-free compatibility gate is:

```bash
bun run verify:worker-launch-targets
```

Release CI installs the exact Claude 2.1.212 and Codex 0.149.0 clients before
running it. Model- and Herdr-bearing drills are explicit opt-ins because target
authentication, project trust, and inference cost remain operator-controlled:

```bash
RUN_DRWN_REAL_CLAUDE=1 bun test --timeout 150000 test/live/worker-launch-context-claude.e2e.test.ts
RUN_DRWN_REAL_CODEX=1 bun test --timeout 150000 test/live/worker-launch-context-codex.e2e.test.ts
RUN_DRWN_REAL_HERDR=1 bun test --timeout 600000 test/live/worker-launch-context-herdr.e2e.test.ts
```

The three-agent Herdr drill requires `DRWN_LIVE_DRWN_BIN` to name the installed
v1.4.2 candidate binary, and verifies its version before setup. The tests use isolated Worker
state and Git projects but deliberately do not copy or manufacture target
credentials or trust decisions.

## Resume boundary

Cold process reconstruction is not part of 1.4.2. Orchestrators should record
the context ID for diagnostics, but restored agents are `relaunch_required`
until explicitly started again with a newly verified descriptor. There is no
resume command in this release.

## Contract schemas

- `drwn.worker-launch-plan` version 1 — deterministic no-write plan
- `drwn.worker-launch-context` version 1 — immutable target launch descriptor
- `drwn.worker-launch-receipt` version 1 — ownership and drift evidence
- `drwn.worker-launch-prepare-result` version 1 — response envelope with reuse

See [Worker launch context schemas](../reference/schemas/worker-launch-context-v1)
and the [Worker command reference](../reference/cli/worker).
