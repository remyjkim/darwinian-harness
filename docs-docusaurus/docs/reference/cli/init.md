---
sidebar_position: 1
---

# Init

`drwn init` creates the per-project config scaffold at `<project>/.agents/drwn/config.json`. In a TTY it runs guided setup; in non-interactive contexts it writes a minimal config.

Bootstrap a project from an interactive shell:

```bash
drwn init
```

When machine state is missing, guided init first offers the opt-out recommended
`@curation-labs/machine-defaults` Worker Blueprint. It then prompts for project
extensions such as Parallel and Beads. Project extension answers affect project
config only.

For scripts and CI:

```bash
drwn init --non-interactive
drwn init --minimal
```

`--non-interactive` and `--minimal` are equivalent: both skip prompts and write
the minimal first-supported project contract:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": [],
  "activeWorker": null
}
```

This is explicit empty project intent. Add one or more alternative roots with
`drwn add`, then select at most one with `drwn use` before projection.

Force the guided flow even when invoked with flags:

```bash
drwn init --guided
```

Re-run setup on a project that already has a config:

```bash
drwn init --force
drwn init --force --guided
```

Without `--force`, `drwn init` refuses to overwrite an existing project config.

Skip pre-registering the default community card catalog:

```bash
drwn init --no-default-catalogs
```

By default, `drwn init` registers the public Curation Labs community card catalog into `~/.agents/drwn/catalogs.json` so that `drwn search card <query>` works out of the box:

```text
https://github.com/curation-labs/dm-cards-catalog-v1.git
```

The default catalog URL is configured in the packaged registry at `defaults.communityCatalogUrl` (currently `https://github.com/curation-labs/dm-cards-catalog-v1.git`). To swap it for a fork or a private catalog, edit `registry/config.json` and rerun `drwn init`. To disable the default registration entirely without using the flag every time, set `defaults.communityCatalogUrl` to `null`.

## Side effects

- Writes `<project>/.agents/drwn/config.json`.
- Initializes missing strict `drwn.machine` V2 state. Prompt-free modes write `activeWorker: null` and `workerLock: null`; guided mode may pin the recommended Worker closure.
- In guided mode, may add `extensions.parallel` and/or `extensions.beads` blocks based on prompt answers.
- Registers the default `@community` card catalog under `~/.agents/drwn/` unless `--no-default-catalogs` is passed.
- Reads `<project>/.gitignore` if present and warns when it appears to exclude `.agents`. The file is never mutated.

## What you can edit afterward

The project overlay can:

- declare alternative Worker roots and one selected root
- enable or disable MCP servers for this project
- add project-local MCP server definitions
- enable extensions such as Parallel, Beads, or MarkItDown
- include or exclude skills during write
- enable or disable targets locally

See [Per-project configuration](../../guides/per-project-patterns) and `.ai/knowledges/02_per-project-config-guide.md` for the full overlay model.

The recommended machine defaults are a normal, immutable Worker Blueprint. Its
canonical name is stored in machine intent and its versioned source plus Card
closure are stored in the embedded lock. It is not part of the project scaffold.
Machine output may remain ambient to project sessions, but project declarations
never inherit it. Existing V1/prototype machine state is rejected without
migration or mutation.
