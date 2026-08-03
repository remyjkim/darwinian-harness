---
sidebar_position: 10
---

# Card

`drwn card` manages mind cards from authoring through project consumption.

Author and publish:

```bash
drwn card new @your-handle/backend --no-git
drwn card new backend --scope @your-handle --from-project .
drwn card publish @your-handle/backend
drwn card catalog publish @your-handle/backend@1.0.0 --catalog @your-handle --mode direct
drwn card show @your-handle/backend@1.0.0
drwn card validate @your-handle/backend@1.0.0
drwn card diff @your-handle/backend@1.0.0 @your-handle/backend@1.1.0
drwn card deprecate @your-handle/backend@1.0.0
```

Edit sources:

```bash
drwn card source list
drwn card source show @your-handle/backend
drwn card source show @your-handle/backend --json
drwn card source doctor
drwn card source doctor @your-handle/backend
drwn card source add-skill @your-handle/backend reviewer
drwn card source add-skill @your-handle/backend reviewer --from ./skills/reviewer --force
drwn card source add-skill @your-handle/backend reviewer --replace
drwn card source remove-skill @your-handle/backend reviewer
drwn card source remove-skill @your-handle/backend reviewer --keep-files
drwn card source set @your-handle/backend --description "Backend review harness" --version 0.1.0
drwn card source set @your-handle/backend --harness-min-version 0.4.0 --license MIT
drwn card source set @your-handle/backend --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
drwn card source add-mcp @your-handle/backend context7
drwn card source add-mcp @your-handle/backend context7 --from ./context7.json
drwn card source add-mcp @your-handle/backend context7 --replace
drwn card source remove-mcp @your-handle/backend context7
drwn card source remove-mcp @your-handle/backend context7 --keep-files
```

Mind content (beliefs, persona, memory, hooks):

```bash
# Beliefs — factual assertions composed into the system prompt
drwn card source add-belief @your-handle/mind engineering --visibility public
drwn card source remove-belief @your-handle/mind engineering
drwn card source remove-belief @your-handle/mind engineering --keep-files

# Persona — behavioral and stylistic identity
drwn card source add-persona @your-handle/mind voice --visibility internal
drwn card source remove-persona @your-handle/mind voice
drwn card source remove-persona @your-handle/mind voice --keep-files

# Memory — layered knowledge (l4 = short-term, l5 = mid-term, l6 = long-term)
drwn card source add-memory @your-handle/mind context --layer l4 --visibility private --format md
drwn card source add-memory @your-handle/mind raw --layer l6 --visibility private --format jsonl
drwn card source remove-memory @your-handle/mind context --layer l4
drwn card source remove-memory @your-handle/mind context --layer l4 --keep-files

# Hook policies — runtime tool intercept modules
drwn card source add-hook @your-handle/backend audit-tool-calls
drwn card source remove-hook @your-handle/backend audit-tool-calls
drwn card source remove-hook @your-handle/backend audit-tool-calls --keep-files
```

All `add-*` and `remove-*` source commands accept `--dry-run` and `--json`.

`add-belief`, `add-persona`, and `add-memory` require `--visibility` (`private`, `internal`, or `public`). `add-memory` additionally requires `--layer` (`l4`, `l5`, or `l6`) and accepts `--format` (`md`, `jsonl`, or `mixed`; default `md`).

`remove-*` commands delete the bundled directory by default. Pass `--keep-files` to remove only the manifest entry while keeping files on disk.

Install Card or Blueprint roots in a project:

```bash
drwn apply @your-handle/backend@^1.0.0
drwn add @your-handle/backend@^1.0.0
drwn add @your-handle/backend@^1.0.0 --allow-untrusted-source
drwn pin @your-handle/backend@1.0.0
drwn remove @your-handle/backend
drwn update
drwn use @your-handle/backend
drwn card outdated
drwn card status --explain
```

Root mutation commands accept `--write` to chain into `drwn write` after the atomic config/lock mutation succeeds:

```bash
drwn add @your-handle/backend@^1.0.0 --write
drwn pin @your-handle/backend@1.0.0 --write
drwn remove @your-handle/backend --write
drwn update --write
```

These are the canonical project commands. `drwn card` remains the authoring, publication, trust, catalog, and inspection namespace.

If a consumed card declares optional MCP servers, `--write` output reports whether each one is active, skipped, or shadowed by a different active definition. Skipped optional MCPs are not materialized until the project opts in:

```bash
drwn add mcp <server-name>
drwn write --dry-run
```

List local cards:

```bash
drwn card list
drwn card list --json
```

Check for outdated locks in CI and pre-fetch origins:

```bash
drwn card outdated --check
drwn card outdated --fetch
drwn card outdated --check --json
```

`--check` exits non-zero when any locked card has a newer version available locally, which makes it suitable as a CI gate. `--fetch` runs `git fetch` against each card's origin before computing the diff so the check uses up-to-date tag listings.

Remote and catalog flows use Git refs. `drwn` delegates authentication to Git.

Clone and fetch cards from Git remotes:

```bash
# Clone a card from a Git ref into the local store
drwn card clone git+https://github.com/team/backend.git#v1.0.0
drwn card clone github:team/backend@^1.0.0
drwn card clone git+https://github.com/external/card.git#v1.0.0 --allow-untrusted-source

# Fetch updates for a locally cloned card from its remote
drwn card fetch @team/backend
drwn card fetch @team/backend --remote upstream
```

Manage Git remotes for a local card repo:

```bash
# Add a new remote
drwn card remote add @team/backend https://github.com/team/backend.git

# Add or update the origin URL (idempotent)
drwn card remote set @team/backend https://github.com/team/backend.git

# Use a non-default remote name
drwn card remote set @team/backend https://internal.example.com/backend.git --name upstream

# Remove a remote
drwn card remote remove @team/backend

# List configured remotes
drwn card remote list @team/backend
drwn card remote list @team/backend --json
```

Push a card to its configured remote:

```bash
# Push main branch and all version tags
drwn card push @team/backend

# Push to a non-default remote
drwn card push @team/backend --remote upstream

# Declare the remote visibility to control the push gate
drwn card push @team/backend --remote-visibility private
drwn card push @team/backend --remote-visibility public --unsafe-push-public
```

`drwn card push` evaluates a visibility gate before pushing. If the card contains content with a stricter visibility than the target remote (e.g., `private` mind content pushed to a `public` remote), the push is blocked. Use `--remote-visibility` to declare the remote's visibility when `drwn` cannot auto-detect it, and `--unsafe-push-public` to override the block when you intentionally want to publish restricted content.

Publish to a card catalog after the card has been pushed to an installable Git remote:

```bash
drwn card remote add @team/backend <card-git-url>
drwn card push @team/backend
drwn catalog add <catalog-git-url>
drwn card catalog publish @team/backend@1.0.0 --catalog @team --mode direct --tag backend --json
drwn search card backend --scope @team
```

`drwn card catalog publish` accepts a store card ref or Git-origin card ref.
`--catalog` can be a registered scope such as `@team`, a catalog Git URL, or a
local catalog checkout path. `--mode local` updates `catalog.json` only; it does
not commit or push. `--mode direct` requires a clean catalog worktree, commits
the `catalog.json` change, pushes the current branch, and refreshes a registered
catalog cache when possible.

Use `--dry-run --json` to validate the card ref, entry URL, catalog schema, and
duplicate-entry behavior before writing. Existing entries require `--replace`
unless the generated payload is already identical.

## Hook Consent

When a locked card declares hook policies, `drwn write` will not materialize hooks until consent is explicitly recorded. `drwn doctor` surfaces this as `hookIssues`.

Review and grant consent:

```bash
drwn card trust @your-handle/backend --hooks
```

By default, consent covers `^<locked-version>`. Override with `--range`:

```bash
drwn card trust @your-handle/backend --hooks --range "^1.0.0"
```

Revoke consent:

```bash
drwn card untrust @your-handle/backend --hooks
```

Preview what hooks a card declares without granting consent:

```bash
drwn card audit
```

`drwn card audit` is a v1.1 placeholder — it makes the planned command discoverable but does not yet produce a diff output.

## Instruction Authoring and Consent

Declare inline or Card-relative explicit instructions:

```bash
drwn card source set @your-handle/backend --instructions-text "Operate carefully."
drwn card source set @your-handle/backend --instructions-path INSTRUCTIONS.md
drwn card source set @your-handle/backend --clear-instructions
```

Grant or revoke projection consent:

```bash
drwn card trust @your-handle/backend --instructions
drwn card trust @your-handle/backend --hooks --instructions --range "^1.0.0"
drwn card untrust @your-handle/backend --instructions
```

The range must include the locked version. Instruction consent also pins the
exact canonical content digest and is dropped when that content changes.
`--hooks` and `--instructions` may be granted or revoked together atomically.

See [Worker Instructions](../../concepts/worker-instructions).

## Typical Source Authoring

The canonical authoring sequence from empty source to published card:

```bash
drwn card new @your-handle/backend --no-git
drwn card source add-skill @your-handle/backend reviewer
drwn card source add-mcp @your-handle/backend context7
drwn card source set @your-handle/backend \
  --description "Backend review harness" \
  --version 0.1.0 \
  --stability stable \
  --last-validated-with 0.1.0 \
  --test-status-badge https://example.com/status.svg
drwn card source doctor @your-handle/backend
drwn card publish @your-handle/backend
```

The quality fields (`--stability`, `--last-validated-with`, `--test-status-badge`) surface in `drwn card show` so consumers can see the maturity signal before applying a card.
