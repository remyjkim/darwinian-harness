<p align="center">
  <img src="./docs/assets/darwinian-worker-logo.png" alt="Darwinian Worker" width="120" height="120" />
</p>

# darwinian

`darwinian` is a local meta-harness for AI agent tools — a CLI that organizes Cards, Worker Blueprints, skills, MCP servers, extensions, project overlays, and downstream tool state surrounding the agents you already use.

The package is `darwinian`. The command is `drwn`.

## Install

Requires Bun 1.2+ and npm.

```bash
curl -fsSL https://bun.sh/install | bash
npm install -g darwinian
drwn status
```

Or work from a checkout:

```bash
git clone https://github.com/remyjkim/darwinian-worker.git
cd darwinian-worker
bun install
bun run drwn -- status
```

## First run

```bash
drwn init --non-interactive
drwn apply <worker-blueprint-ref>
drwn use <worker-name> --no-write
drwn write --dry-run
drwn write
```

Cards compose capabilities into one Blueprint. A project may install alternative
Worker roots but selects at most one; `drwn write` projects only the selected
root closure plus explicit project overlays. Project declarations do not inherit
the machine Worker.

Run several Claude or Codex processes in the same Git worktree with different
installed Worker profiles without changing the active shared base:

```bash
drwn worker launch-context prepare <installed-root> --target claude --json
drwn worker launch-context prepare <installed-root> --target codex --json
drwn worker launch-context list --json
```

Preparation is additive and content-addressed. Dry-run returns a strict plan;
normal mode returns opaque argv/env, writes only under
`.agents/drwn/generated/launch-contexts/`, and does not write to user home.
Claude Code 2.1.212 and Codex CLI 0.149.0 are the conservative first supported
targets. Context pruning is report-only unless `--execute --older-than` is
explicit. Cold-restored orchestrator bindings remain `relaunch_required`.

The installed CLI also exposes deployed-Worker and DAH authentication surfaces.
ACP is removed, and `drwn worker mind` is a provider-neutral placeholder until
a persistence backend is selected:

```bash
drwn worker mind
drwn org list --json
drwn org use org_acme
drwn worker register --organization org_acme --name worker-alpha --environment staging
drwn worker status --json
drwn worker deploy @team/worker@1.0.0
drwn worker deployments --json
drwn worker rollback --to deployment_attempt_0001
drwn worker chat --message "hello" --json
drwn worker retire --yes
drwn worker materialize --payload payload.json --project-root /srv/worker
drwn worker buzz-tools
drwn worker launch-context prepare <installed-root> --target codex --dry-run --json
printf '%s' "$WORKER_SECRET" | drwn worker secret set PROVIDER_API_KEY
drwn login --json
drwn refresh --json
drwn logout --json --require-remote-revoke
drwn analyze sessions --dry-run
```

`drwn analyze sessions` remains the Foundry/Analyzer-linked session-upload
feature. Safe installed-package release smokes use only version and documented
auth/Worker/launch-context help paths. Actual login, logout, refresh,
materialization, Buzz delivery, secret mutation, and analysis upload are
operational actions, not release smokes.

`worker status` reports only strict authoritative Deployed Worker detail. Names
and local Card slugs never select remote authority, and malformed or
secret-shaped responses fail closed before rendering.

Machine intent uses the V2 namespaced contract and the same immutable closure
model:

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

`drwn init --non-interactive` and `--minimal` initialize this explicit empty
intent. Guided `drwn init` offers the opt-out recommended
`@curation-labs/machine-defaults` Blueprint. If accepted, `activeWorker` stores
the canonical Card name while `workerLock.workerRoots[].requested` preserves the
immutable versioned source. The selected closure can contribute skills, MCP
definitions, a generated Worker, consented hooks, and consented instructions.

Select or replace the machine Worker, grant Card consent where required, then
preview user-home projection:

```bash
drwn apply --root <worker-blueprint-ref>
drwn card trust <card-name> --hooks --scope machine
drwn card trust <card-name> --instructions --scope machine
drwn write --root --dry-run
drwn write --root
```

`drwn use --root <worker-name-or-ref>` switches among installed roots;
`drwn use --root --none` leaves them installed but selects none. The legacy
`drwn machine skill|mcp enable|disable` commands fail with guidance because
machine activation is now Card-governed, not a list of bare inventory IDs.

Machine writes claim only paths or MCP fields they create and record. Foreign
destinations fail with `MACHINE_PROJECTION_CONFLICT`, including under
`--force`; force can repair only drift in prior drwn-owned state. For a
controlled prelaunch reset, back up the non-secret machine intent and global
write record outside the machine state root, remove unsupported V1/prototype
state deliberately, rerun setup, and select a Blueprint explicitly. V1 is
rejected; it is not migrated or dual-read.

Standalone machine inventory is inactive until referenced by supported project
or Card workflows. Manage
package-scoped skills and record-level MCP definitions with `drwn machine
skill|mcp`; inspect references before removal and use `drwn machine inventory
gc` for dry-run garbage collection.

Transfer only active standalone inventory with the portable V1 surface:

```bash
drwn machine inventory export --output ./inventory.json
drwn machine inventory bundle --output ./inventory.tar.gz
drwn machine inventory verify --from ./inventory.tar.gz
drwn machine inventory sync --from ./inventory.tar.gz --dry-run
drwn machine inventory sync --from ./inventory.tar.gz
```

The manifest is deterministic metadata; the bundle adds allowlisted package and
MCP bytes. Sync is additive, extras are preserved, and transferred entries stay
inactive. On a fresh home it creates inventory infrastructure but no
`machine.json`. These artifacts are not a backup or restore. A checksum is not
authenticity, and the built-in secret scan is a source-content safeguard rather
than a general secret detector; review bundles before sharing them.

## Whole-Store Safety

Whole-Store export is unavailable because `~/.agents/drwn` can contain
credentials and operational machine state. No public command creates that
archive. Treat broad Store archives created by prototype releases as sensitive;
remote deploy uses a separate allowlisted Card payload.

## Claude Session Signals Beta

`drwn` includes hidden Claude Code hook commands that can record active Cards and
skill usage beside Claude transcript files. This is an opt-in beta and is disabled by
default.

Enable it in the project you want to observe:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": [],
  "activeWorker": null,
  "hooks": {
    "signals": { "enabled": true }
  }
}
```

Then run `drwn write`. `drwn` registers the Claude hooks it owns while preserving
user-authored hooks in `.claude/settings.json`.

Signals are appended next to Claude transcripts as `<session-id>.drwn-signals.jsonl`.
The hook commands always exit successfully and stay silent so they do not interrupt Claude
sessions.

## Documentation

- **Public docs:** [docs.darwinian.dev](https://docs.darwinian.dev) — concepts, getting-started paths, guides, troubleshooting, CLI reference. Source in [`docs-docusaurus/`](./docs-docusaurus).
- **Disciplines that shape the design:** [`concepts/disciplines`](https://docs.darwinian.dev/concepts/disciplines)
- **Safety model:** [`concepts/safety-model`](https://docs.darwinian.dev/concepts/safety-model)
- **CLI quick reference:** [`docs/cli-quickref.md`](./docs/cli-quickref.md)
- **Project Worker V1 contract:** [`docs/contracts/project-worker-v1.md`](./docs/contracts/project-worker-v1.md)
- **Prelaunch project reset:** [`docs/prelaunch-project-reset.md`](./docs/prelaunch-project-reset.md)
- **Architecture (contributors):** [`.ai/knowledges/10_drwn-cli-architecture.md`](./.ai/knowledges/10_drwn-cli-architecture.md)
- **Maintainers:** [`docs/maintainers/`](./docs/maintainers/)

Local docs workflow:

```bash
bun run docs:dev
bun run docs:build
```

Notion OAuth, `ntn` API keys, and external stdio tools such as Momentic remain
operator-owned runtime state. Definitions may be carried by Cards, but secrets
and machine installation state are never project or Blueprint content.

## Contributing

Contributions are welcome when they preserve the conservative write model and include tests for behavior changes. Start with `bun install`, `bun test`, `bun run typecheck`, then read [CONTRIBUTING.md](./CONTRIBUTING.md).
