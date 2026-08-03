---
sidebar_position: 4
---

# Override for One Project

One project needs explicit, reproducible harness intent. This path scaffolds a project config at `<project>/.agents/drwn/config.json`, selects one Worker root, and writes project-scoped downstream state into `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor`.

## Prerequisites

- `drwn` installed and the machine already set up — see [Set Up Your Machine](./setup-your-machine).
- A project directory you can write to.

## Scaffold the project overlay

`drwn init` writes `<project>/.agents/drwn/config.json`. Pass `--non-interactive` (or `--minimal`) when you want a prompt-free minimal config; the default is guided when both stdin and stdout are TTYs.

```bash
cd /path/to/project
drwn init
drwn init --non-interactive
```

`init` warns if your `.gitignore` appears to exclude `.agents`. It never edits `.gitignore` for you.

## Edit the overlay

The config is plain JSON. Use the project mutation commands to keep the config
and lock graph coherent, and use capability-specific commands for explicit
project overlays.

```bash
drwn add @team/operator@^1.0.0
drwn use @team/operator
drwn add skill <skill-name>
drwn add mcp <server-name>
drwn extensions add parallel
drwn extensions add markitdown
drwn extensions add beads --include-skill
```

The shape is documented in the [project config schema](../../reference/schemas/project-config-json). Every config carries `schema: "drwn.project-config"`, `schemaVersion: 1`, an ordered `workers` root list, and one `activeWorker` name or `null`. Optional explicit overlays include `skills`, `mcpServers`, `extensions`, `targets`, and `trustedSources`.

**Machine capability isolation inside configured projects.** When a project
config is present, project-safe packaged policy combines with the selected
Worker closure and explicit project overlays. The separate machine Worker in
`~/.agents/drwn/machine.json` does not become project intent.
User-home output may remain ambient in the downstream client and is reported
separately. A different teammate can reproduce the declared project state from
the project files plus immutable Card content.

## Confirm the project overlay is detected

```bash
drwn status
drwn status --explain
drwn status --json
```

The JSON output identifies `schema: "drwn.project-status"`, the installed roots,
one `activeWorker`, its active Card closure, explicit overlays, declared
capabilities, and diagnostic-only ambient observations. If project state is
missing, `drwn` did not find the config; re-check the path or run from inside
the project directory.

For provenance questions ("why is this skill in the effective state?"), use `drwn status --why`:

```bash
drwn status --why skill:<name>
drwn status --why server:<name>
```

## Preview, then write

```bash
drwn write --dry-run
drwn write
```

`drwn write` materializes the selected root's aggregate plus explicit project
overlays into `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor`.
It does not mutate project intent and does not project machine capabilities into the
project. The project write record at `<project>/.agents/drwn/write-record.json`
tracks what was written so the next run can clean up safely.

## Verify

```bash
drwn status
drwn doctor
ls <project>/.claude/skills
ls <project>/.codex/skills
cat <project>/.cursor/mcp.json
```

`drwn doctor` against the project (run from inside the project directory) reports project-scoped issues — unknown skill references, stale target overrides, card-skill availability, and the rest of the categories described in [Reading Doctor](../../troubleshooting/reading-doctor).

## Cross-References

- [Layered Model](../../concepts/layered-model) for declared project and ambient machine scope
- [Use a Team's Harness](./use-team-harness) when the project overlay should consume a card rather than be defined locally
- [Using `status --why`](../../troubleshooting/using-status-why) for tracing where an active item came from
- [Reading Doctor](../../troubleshooting/reading-doctor) for the diagnostic surface
