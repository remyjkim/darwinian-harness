---
sidebar_position: 7
---

# FAQ

## What is the difference between `darwinian` and the agent itself (Claude, Codex)?

`darwinian` (the `drwn` CLI) is a control plane around the agent tools you already have installed. The agents — Claude Code, Codex, Cursor (deprecated) — execute the tasks. `drwn` decides which skills, MCP servers, and extensions each agent has access to, then writes that decision into `~/.claude`, `~/.codex`, and `~/.cursor` so the agents can find it. `drwn` does not run agents and does not call models.

See [Concepts overview](./concepts/layered-model) for the layered model.

## Why is `drwn` conservative by default?

Because the things `drwn` touches — agent settings files, skill directories, MCP server lists — are shared with other tools and with humans. Silent overwrites would lose user-authored content. So `drwn` previews every change (`--dry-run`), records what it wrote (write record), refuses to overwrite content it did not write (managed-field hashing), and reports problems rather than fixing them silently (`doctor`).

See [Ownership and Write Records](./concepts/ownership-and-write-records).

## Why does `drwn doctor` not auto-fix?

Because the right fix depends on intent that `drwn` does not have. A stale skill symlink might mean "remove this skill from defaults" or "the underlying bundle moved, point me at the new path." A managed-field hash mismatch might mean "publish over the drift" or "migrate the manual edit into config." `doctor` enumerates the conditions and lets the operator (or an agent following a skill) decide. The write pipeline and doctor share the same engine — see [Diagnostics Model](./concepts/diagnostics-model).

## How do bundle update and uninstall work?

Both are package-scoped. They enumerate exported skill IDs and known machine or
project references. Uninstall is blocked while references remain, and there is
no force bypass. Update writes an immutable version and atomically changes the
regular `current` pointer only after complete-tree digest validation.

See [Machine Inventory](./reference/cli/machine) and the [npm skill bundles guide](https://github.com/remyjkim/darwinian-worker/blob/main/.ai/knowledges/03_npm-skill-bundles-guide.md).

## Can I run `drwn` without writing anything?

Yes. Every write command supports `--dry-run` and prints the exact planned
changes. Inspection commands such as `status`, `doctor`, `machine skill list`,
`machine mcp list`, and `card show` never write. Inventory GC is a dry-run by
default. For a stricter guarantee against machine-state mutation, set
`DRWN_STORE_READONLY=1`.

## What does `DRWN_STORE_READONLY=1` actually block?

It blocks every write under `~/.agents/drwn/` — published Card mutations,
source mutations, machine-config edits, inventory lifecycle, catalog updates,
and URL-card-map updates. Inspection, dry runs, and source `doctor` continue to
work. Downstream tool config is governed separately.

See [Machine State](./concepts/local-store) for the boundary.

## How does the URL-to-card-name cache work?

When `drwn` resolves a card by Git URL for the first time, it records the URL-to-name mapping at `~/.agents/drwn/url-card-map.json`. Subsequent fetches of the same URL skip the discovery step and reuse the cached name. The cache is treated as an optimization — a missing or corrupt file is ignored and rebuilt on the next successful resolution. Writes go through the atomic-rename path like every other store mutation.

## Can I version-control `<project>/.agents/drwn/`?

Yes — that is the recommended setup for shared projects. `config.json` and `card.lock` are the contract a teammate needs to reproduce the harness; check them in. The generated `write-record.json`, the downstream `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor` directories, and the `<project>/.agents/drwn/generated/` cache are local artifacts — gitignore them. `drwn init` warns if your `.gitignore` appears to exclude the whole `.agents` directory, which would hide the parts you want to commit.

## What does `drwn scan` do today vs in the future?

Today `drwn scan` is a verified placeholder. It emits a fixed JSON payload and
exits without touching disk. Its planned role is to report candidates for
standalone inventory, explicit machine intent, or project config, and stop short
of any write.

## How is this different from Docker, Flox, or Nix?

`drwn` pins **harness state** — skills, MCP servers, extensions, and downstream targets. It does not pin runtimes, system libraries, services, or shell environment. Docker pins service stacks (Postgres, Redis). Flox and Nix pin the runtime layer (Node, Python, system libs). asdf and mise pin toolchain versions. These tools compose: use `drwn apply` for the harness, pair with Flox or Nix for the runtime layer, and Docker Compose for the service layer. Each tool pins what it owns. See the layered reproducibility section of [the CLI quick reference](https://github.com/remyjkim/darwinian-worker/blob/main/docs/cli-quickref.md#layered-reproducibility) for the composition.
