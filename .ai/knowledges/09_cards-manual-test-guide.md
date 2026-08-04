# ABOUTME: Manual acceptance guide for project and machine Worker Blueprint V2 behavior.
# ABOUTME: Exercises hard-cut state, immutable closure selection, consent, projection, isolation, ownership, and reset safety.

# Cards And Workers Manual Test Guide

## Purpose

Use this guide only after focused, full-suite, typecheck, and release gates pass.
It validates the CLI as an operator would without touching real home, Store,
credential, project, or target state.

Record the tested commit, Bun/drwn versions, platform, command, exit code, and
relevant artifact digest for every section. Stop on the first unexplained result.

## Sandbox

Create one explicit temporary root and route every command through isolated
environment values:

```bash
DRWN_TEST_SANDBOX="$(mktemp -d)"
DRWN_TEST_HOME="$DRWN_TEST_SANDBOX/home"
DRWN_TEST_AGENTS="$DRWN_TEST_SANDBOX/agents"
DRWN_TEST_PROJECT="$DRWN_TEST_SANDBOX/project"
DRWN_TEST_CARDS="$DRWN_TEST_SANDBOX/card-collection"
mkdir -p "$DRWN_TEST_HOME" "$DRWN_TEST_AGENTS" "$DRWN_TEST_PROJECT" "$DRWN_TEST_CARDS"

run_drwn() {
  (
    cd "$DRWN_TEST_PROJECT"
    env HOME="$DRWN_TEST_HOME" AGENTS_DIR="$DRWN_TEST_AGENTS" drwn "$@"
  )
}
```

Before continuing, print and inspect those five absolute paths. None may be the
operator's real home, real `~/.agents`, live project, or live Card collection.
Do not carry real tokens, OAuth state, MCP secrets, or tool config into the
sandbox.

To qualify the exact npm tarball through the same isolation boundary, run:

```bash
scripts/accept-machine-blueprint-package.sh
```

The script packs and installs the current CLI into a temporary prefix, creates
an isolated Card collection, publishes a fixture Card and Blueprint, projects
machine scope, proves the retired direct command is non-mutating, and verifies a
separate project does not inherit machine intent. Set `DRWN_ACCEPT_KEEP=1` only
when the resulting non-secret sandbox must be inspected after the run.

## 1. Strict V2 Initialization

```bash
run_drwn init --non-interactive
run_drwn status --machine --json --explain
```

Verify `$DRWN_TEST_AGENTS/drwn/machine.json` has:

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

Policy may contain serialized defaults, but capability intent must be empty.
There must be no profile, flat skills, flat MCP selection, or authoring policy.

Repeat with distinct state roots, never by replacing the state under test:

```bash
DRWN_DECLINE_AGENTS="$DRWN_TEST_SANDBOX/decline-agents"
DRWN_ACCEPT_AGENTS="$DRWN_TEST_SANDBOX/accept-agents"
mkdir -p "$DRWN_DECLINE_AGENTS" "$DRWN_ACCEPT_AGENTS"
(
  cd "$DRWN_TEST_PROJECT"
  env HOME="$DRWN_TEST_HOME" AGENTS_DIR="$DRWN_DECLINE_AGENTS" drwn init
)
(
  cd "$DRWN_TEST_PROJECT"
  env HOME="$DRWN_TEST_HOME" AGENTS_DIR="$DRWN_ACCEPT_AGENTS" drwn init
)
```

Decline the recommended Blueprint in the first guided run and verify empty
capabilities. Accept it in the second and verify a canonical `activeWorker`
plus an embedded validated lock whose root `requested` field is an immutable
versioned ref.

## 2. Hard-Cut Rejection

In a separate disposable state root, place a V1 `machine.json` containing
`profile`, `skills`, and `mcpServers`:

```bash
DRWN_V1_TEST_AGENTS="$DRWN_TEST_SANDBOX/v1-agents"
mkdir -p "$DRWN_V1_TEST_AGENTS/drwn"
# Seed machine.json and an optional global-write-record.json only in this root.
V1_MACHINE_BEFORE="$(shasum -a 256 "$DRWN_V1_TEST_AGENTS/drwn/machine.json")"
V1_RECORD_BEFORE="$(shasum -a 256 "$DRWN_V1_TEST_AGENTS/drwn/global-write-record.json" 2>/dev/null || true)"

run_v1_drwn() {
  (
    cd "$DRWN_TEST_PROJECT"
    env HOME="$DRWN_TEST_HOME" AGENTS_DIR="$DRWN_V1_TEST_AGENTS" drwn "$@"
  )
}
```

Then run:

```bash
run_v1_drwn status --machine --json
run_v1_drwn init --non-interactive
run_v1_drwn write --root --dry-run
```

Each command must fail with controlled-reset guidance. Verify the V1 file and
any planted global write record remain byte-identical by comparing their
post-run checksums with `V1_MACHINE_BEFORE` and `V1_RECORD_BEFORE`. There must be no
migration, dual read, projected file, automatic deletion, or preference bridge.

Repeat with a prototype/unknown shape and an unsupported embedded lock version.

## 3. Author Capability Cards

```bash
run_drwn card new notion --scope @manual --into "$DRWN_TEST_CARDS" --no-git
run_drwn card new fal --scope @manual --into "$DRWN_TEST_CARDS" --no-git
run_drwn card source doctor "$DRWN_TEST_CARDS/notion" --json
run_drwn card source doctor "$DRWN_TEST_CARDS/fal" --json
```

Add one uniquely named skill and one harmless MCP definition to the Notion
Card. Add one uniquely named skill to Fal. Use only dummy environment-variable
names, never resolved credentials. Publish exact `1.0.0` releases:

```bash
run_drwn card publish --from "$DRWN_TEST_CARDS/notion" --json
run_drwn card publish --from "$DRWN_TEST_CARDS/fal" --json
```

Verify immutable Store records and content integrity. Mutating either source
after publication must not change published bytes.

## 4. Compose And Publish Machine Blueprint

```bash
run_drwn worker new @manual/machine-defaults --into "$DRWN_TEST_CARDS" --no-git
run_drwn worker compose "$DRWN_TEST_CARDS/machine-defaults" --add @manual/notion@1.0.0
run_drwn worker compose "$DRWN_TEST_CARDS/machine-defaults" --add @manual/fal@1.0.0
run_drwn card source doctor "$DRWN_TEST_CARDS/machine-defaults" --json
run_drwn worker publish --from "$DRWN_TEST_CARDS/machine-defaults"
run_drwn card show @manual/machine-defaults@1.0.0 --json
```

Verify kind `blueprint`, canonical name, ordered members, immutable requested
refs, and no nested Blueprint member. Mutable `catalogCheckouts` may help the
authoring commands find source paths, but must not appear as runtime origin.

## 5. Apply Machine Worker Without Projection

```bash
run_drwn apply --root @manual/machine-defaults@1.0.0
run_drwn status --machine --json --explain
```

Verify:

- `activeWorker` is `@manual/machine-defaults`, not a versioned ref;
- `workerLock.workerRoots[0].requested` retains the requested version;
- lock Card order is machine-defaults, notion, fal;
- effective capabilities come only from that closure;
- no user-home target or generated Worker was written because `apply` projects
  only when `--write` is supplied.

## 6. Alternative Roots And Singular Selection

Publish a second independent Blueprint root (with at least one plain Card
member), then:

```bash
run_drwn use --root @manual/independent@1.0.0 --no-write
run_drwn use --root @manual/machine-defaults --no-write
run_drwn use --root --none --no-write
run_drwn status --machine --json --explain
```

Verify both roots remain installed, selection changes canonically, and `--none`
sets only `activeWorker` to null. No alternative contributes while inactive.

Attempt `use --root` with a plain Card ref and verify it fails without mutating
machine intent; machine roots must be Blueprints even though their members are
plain Cards.

Restore machine-defaults. Then use
`apply --root @manual/machine-defaults@1.0.0 @manual/independent@1.0.0 --none`
and verify the replacement roots remain locked while `activeWorker` is null.
Use `apply --root --none` with no refs and verify it clears the root
set to `workerLock: null`. Reapply machine-defaults for later sections.

## 7. Consent

Add one valid instruction resource and one harmless Claude hook declaration to
the Notion fixture Card, republish a new exact version, and reapply its
Blueprint. Before trust:

```bash
run_drwn write --root --dry-run
```

Verify the exact hook/instruction consent requirements are reported and no
acknowledgement is written by dry-run. Then:

```bash
run_drwn card trust @manual/notion --hooks --scope machine
run_drwn card trust @manual/notion --instructions --scope machine
run_drwn status --machine --json --explain
```

Verify consent is stored on the matching locked Card/range/digest. Reapply
unchanged bytes inside the authorized range and verify consent is preserved.
Publish changed hook/instruction bytes at a version inside an explicitly
consented range: consent must be re-granted with a fresh timestamp/current
digest and a warning. Publish outside that range: consent must be dropped and
the explicit trust command required again.

## 8. Complete Machine Projection

```bash
run_drwn write --root --dry-run --json
run_drwn write --root
run_drwn write --root --dry-run --json
```

Verify the first preview plans and the final preview is current. Expected
surfaces include:

```text
$DRWN_TEST_AGENTS/drwn/generated/workers/
$DRWN_TEST_HOME/.claude/skills/
$DRWN_TEST_HOME/.claude/CLAUDE.md
$DRWN_TEST_HOME/.claude/settings.json
$DRWN_TEST_HOME/.codex/skills/
$DRWN_TEST_HOME/.codex/AGENTS.md
$DRWN_TEST_AGENTS/drwn/global-write-record.json
```

Verify:

- one aggregate generated Worker represents the active root closure;
- skill and MCP provenance names the owning Cards;
- Claude/Codex instruction files contain a drwn managed block;
- `$DRWN_TEST_HOME/AGENTS.md` does not exist;
- Claude settings preserve unrelated fields;
- only consented hooks/instructions project;
- no inactive alternative or standalone inventory appears.

## 9. Filters

Record all destination digests, then exercise:

```bash
run_drwn write --root --skills-only --dry-run
run_drwn write --root --skills-only
run_drwn write --root --mcp-only --dry-run
run_drwn write --root --mcp-only
```

Verify each mode plans, owns, writes, and cleans only its allowed surfaces.
Repeat with one target disabled in machine policy; excluded target paths must
remain unclaimed and byte-identical.

## 10. Ownership, Drift, Force, And Cleanup

Use a fresh disposable home and plant foreign content at one planned
destination before first write. The write must fail before creating any other
planned path, including under `--force`.

After a successful clean write, modify one managed block/field and rerun:

```bash
run_drwn write --root --dry-run
run_drwn write --root
run_drwn write --root --force
```

Dry-run and normal write must report drift without mutation. Force may repair
only the prior drwn-owned content and must preserve unrelated bytes/fields.

Remove one Card capability by publishing and selecting a new Blueprint release.
The next write removes unchanged stale owned output, but preserves and reports a
user-modified replacement.

## 11. Root-Forced Consent Replay

Initialize a disposable project inside `$DRWN_TEST_PROJECT`, select a project
Worker, then invoke machine projection from that directory:

```bash
cd "$DRWN_TEST_PROJECT"
run_drwn write --root --dry-run
run_drwn write --root
```

Verify machine consent is replayed and only user-home/global paths are planned.
The project config, lock, generated directory, targets, and write record remain
byte-identical.

## 12. Project Isolation

From the project, apply a different project Blueprint and run:

```bash
run_drwn write --dry-run
run_drwn write
run_drwn status --json
```

Verify only the project closure plus project overlays project under the project
root. Machine alternatives, active machine capabilities, and user-home
inventory are not project declarations. Ambient user-home target state may be
reported separately but is never imported.

## 13. Legacy Commands And Inventory

```bash
run_drwn machine skill enable machine-only
run_drwn machine skill disable machine-only
run_drwn machine mcp enable example
run_drwn machine mcp disable example
```

All four commands must exit nonzero, leave `machine.json` byte-identical, and
name `apply --root`/`use --root` as the replacement.

Confirm inventory remains usable and inactive:

```bash
run_drwn machine skill list --json
run_drwn machine mcp list --json
run_drwn machine inventory gc --json
```

## 14. Capture, Diagnostics, And Transfer

With machine-defaults selected:

```bash
run_drwn card new captured-defaults --scope @manual --from-defaults --into "$DRWN_TEST_CARDS" --no-git
run_drwn card source doctor "$DRWN_TEST_CARDS/captured-defaults" --json
run_drwn status --machine --json --explain
run_drwn doctor --json
```

The captured source is a plain Card containing only effective skills and MCP
definitions from the active closure. It excludes inactive roots, ambient
inventory, generated bytes, hooks/instructions unless the capture contract
explicitly supports them, credentials, and resolved secrets.

Status/doctor must report V2 root, lock, closure provenance, integrity, consent,
and projection ownership without exposing secret values.

Export/bundle/verify/sync inventory in a second disposable state root. Confirm
the artifact excludes `machine.json`, Worker locks, Cards, credentials,
projects, generated output, and write records; imported inventory remains
inactive.

## 15. Controlled Reset

Copy the sandbox's non-secret `machine.json` and global write record to a
separate audit directory. Deliberately remove only those exact sandbox files,
rerun non-interactive init, and verify empty V2 state. Previously projected
foreign/drifted user-home content must not be silently claimed or deleted.

## Cleanup

Review the exact value of `$DRWN_TEST_SANDBOX`, confirm it is the temporary path
created by this guide, then remove or trash that one sandbox. Keep the evidence
summary, not the sandbox's generated or credential-shaped state.
