# ABOUTME: Explains npm package-backed skill inventory, project selection, and Card-governed machine activation.
# ABOUTME: Covers bundle shape, ingestion, storage, lifecycle, and the Worker Blueprint boundary.

# NPM Skill Bundles Guide

## Purpose

This document explains the implemented package-backed skill bundle model in the
Darwinian Worker source tree.

Use it for:

- understanding what a bundle is
- adding extension bundles safely
- knowing how bundles are stored locally
- understanding the boundary between npm packages and `drwn`

## What A Package-Backed Skill Bundle Is

A package-backed skill bundle is an npm package used as a versioned content source for skills.

In this model:

- npm is the distribution and versioning layer
- the bundle provides skill files plus metadata
- `drwn` remains the only supported local meta-harness control plane for project selection, Card authoring, and downstream write

Bundles are extension sources. They do not replace the built-in first-party skill tree in the repo.

## What Bundles Are For

Use bundles when you want to:

- add optional skill sets without editing the built-in repo skill tree
- ship first-party extension packs later
- distribute trusted third-party skills as inspectable content bundles

The v1 design is intended for:

- built-in first-party skills in the repo
- first-party extension bundles
- trusted third-party bundles

It is not designed as a general public marketplace contract yet.

## Bundle Boundary

`drwn` uses npm packages as content bundles, not as write tools.

Specifically, the package contributes:

- package name
- version
- tarball contents
- metadata in `package.json`
- bundle metadata in `bundle.json`

`drwn` contributes:

- ingestion
- validation
- inventory
- project selection and Card authoring inputs
- downstream write

## Required Bundle Shape

Current contract requires:

```text
package.json
bundle.json
skills/
```

Each declared skill must point to a directory that contains `SKILL.md`.

The implemented bundle manifest shape is:

```json
{
  "schemaVersion": 1,
  "bundleName": "@scope/example-bundle",
  "version": "1.2.3",
  "displayName": "Example Bundle",
  "description": "Optional",
  "skills": [
    {
      "name": "skill-name",
      "scope": "shared",
      "path": "skills/shared/skill-name"
    }
  ]
}
```

Current supported scopes:

- `shared`
- `claude-only`
- `codex-only`
- `experimental`

## Ingestion Model

`drwn` ingests bundles with:

```bash
npm pack <spec> --ignore-scripts --json --pack-destination <tmp>
```

Why this path:

- it avoids relying on `node_modules` as the authoritative source
- it avoids install-time lifecycle mutation
- it keeps bundles content-oriented and inspectable

Why `--ignore-scripts` matters:

- plain local-folder `npm pack` can run `prepack`
- the implemented ingestion path explicitly suppresses scripts

After packing, `drwn` extracts the tarball, normalizes the top-level `package/` directory, validates `bundle.json`, and installs the bundle into managed local state.

## Local Storage Model

In the cards-era store, installed bundles live under:

```text
~/.agents/drwn/skills/<package-name>/<version>
```

There is also a `current` pointer file at the package root indicating the
version exposed by standalone inventory. This regular pointer does not activate
any skill.

Example:

```text
~/.agents/drwn/skills/@scope/example-bundle/
  current                  # contains: 1.2.3
  1.2.3/
    bundle.json
    skills/
```

This storage model is intentionally separate from:

- npm global install locations
- repo-native built-in skills
- downstream tool skill directories

## Supported Commands

Install a bundle:

```bash
drwn machine skill install <npm-package-or-local-path>
```

Installation creates inactive inventory. It never enables exported skills.

List installed bundles:

```bash
drwn machine skill list
drwn machine skill list --json
```

Show a bundle:

```bash
drwn machine skill show --package <package-name>
drwn machine skill show --package <package-name> --json
```

Update or uninstall the complete package:

```bash
drwn machine skill update <package-name> --from <source> --dry-run
drwn machine skill update <package-name> --from <source>
drwn machine skill uninstall <package-name> --dry-run
drwn machine skill uninstall <package-name>
```

These operations are package-scoped. They enumerate every exported skill ID and
report known Card-lock and project references. Package versions are immutable;
update compares complete-tree digests before atomically changing `current`.
Referenced inventory cannot be uninstalled through a force bypass.

## Availability, Selection, And Projection

Adding a bundle makes its skills available. It does not expose them automatically.

Typical flow:

```bash
drwn machine skill install <bundle>
drwn machine skill show --package <package-name>
drwn add skill <skill-name>
drwn write
```

Important distinction:

- available: the bundle exists in the active bundle cache, normally `~/.agents/drwn/skills`
- project-selected: the project declares the skill through `skills.include`, an extension, or its selected Worker closure
- Card-sourced: reviewed skill bytes have been copied into a Card source and published as an immutable Card release
- machine-active: the released Card belongs to the selected machine Worker Blueprint closure
- written: a project or machine write copies the selected bytes into recorded owned downstream paths

There is no bare-ID machine selection. To make bundle content machine-active,
put the reviewed bytes in a Card, compose that Card into a Blueprint, publish an
immutable release, and select the Blueprint:

```bash
drwn card source add-skill <card-source> <skill-name> --from <skill-directory>
drwn worker compose <blueprint-source> --add <published-card-ref>
drwn apply --root <published-blueprint-ref>
drwn write --root --skills-only --dry-run
drwn write --root --skills-only
```

The machine file uses strict `drwn.machine` V2:

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

An active state embeds a validated `drwn.project-lock` V1 value containing a
matching canonical root and complete Card entries. The versioned source is kept
in `workerRoots[].requested`. Package installation never mutates this lock or
the active closure. V1 profile/skills/MCP arrays are rejected, not migrated.

## Current Constraints

### Supported machine scopes

Machine closure skills may be shared, Claude-only, or Codex-only. Projection
writes only to targets supported by each Card-owned skill's scope. Standalone
inventory and ambient compatibility directories are not activation authority.

### Unique skill names assumed

The current v1 model assumes package-backed shared skills do not collide with existing skill names.

If a bundle introduces a colliding skill name, ingestion should fail.

### Reference And Recovery Contract

Use `drwn machine skill references <skill-id>` or `--package <package-name>`
before lifecycle changes. Repeated `--project` roots widen the known scan scope.
Reference-sensitive operations account for supported Card-lock/project
references; authoring copies are independent bytes, not live links. Interrupted
removal uses tombstone recovery. `drwn machine inventory gc` is a
dry-run by default and never removes a current package because it has zero known
references.

### Project include supports package-backed skills

Per-project `skills.include` supports both repo-native shared skills and installed package-backed shared skills.

Keep package-backed skill names unique. If a project include references an unknown or ambiguous skill name, `drwn doctor` reports it and write will not silently pick an arbitrary source.

## Loose Skill Ingestion

In addition to npm bundles, `drwn` supports adding individual skill directories from local paths:

```bash
drwn add skill /path/to/skill-directory
drwn machine skill install /path/to/skill-directory
```

A loose skill directory must contain a `SKILL.md` file. The skill is copied into
the managed skill tree and becomes available for project selection or Card
authoring like any other skill. Ingestion does not activate or project it.

This is useful for:

- importing skills from other projects without publishing an npm package
- testing locally authored skills before bundling them
- one-off skill additions that do not justify a full package

Related commands:

- `drwn add skill <name>` — declare an available skill in the current project
- `drwn card source add-skill ...` — copy reviewed bytes into an editable Card source
- `drwn apply --root <blueprint-ref>` — select the immutable machine closure that contains the Card
- `drwn search skill <query>` — search available skills by name or keyword

The retired `drwn machine skill enable|disable` commands fail nonzero with
Blueprint guidance.

## How Bundles Relate To Built-In Skills

Built-in first-party skills remain repo-native.

That means:

- the repo is still the default first-party source
- bundles are additive extension sources
- `darwinian` remains the single first-party harness package

This is intentional. The project is not splitting first-party skills into separate packages by default.

## Troubleshooting

Common failures include:

- missing `bundle.json`
- mismatched `bundleName`
- mismatched `version`
- invalid skill paths
- missing `SKILL.md`
- skill-name collisions

The safest first debug steps are:

```bash
drwn machine skill list --json
drwn machine skill show --package <package-name> --json
drwn doctor --json
```

## Non-Goals

Current bundle support does not mean:

- bundle CLIs are the supported write surface
- npm install locations are the authoritative source
- arbitrary public npm packages are automatically trusted
- install-time scripts are part of the intended workflow
- adding a package implicitly activates machine or project capabilities

`drwn` remains the local harness control plane.

## Relationship To Other Docs

- general CLI usage: [01_agents-cli-usage-guide.md](./01_agents-cli-usage-guide.md)
- per-project overrides: [02_per-project-config-guide.md](./02_per-project-config-guide.md)
