---
sidebar_position: 7
---

# Run drwn doctor In CI

This guide shows how to use `drwn doctor`, `drwn status --json`, and the card
and store verification commands in CI so configuration drift fails the build
instead of accumulating silently.

## What To Run In CI

CI-friendly read-only commands:

- `drwn status --json` for a structured snapshot of effective state
- `drwn doctor --json` for report-only diagnostics
- `drwn worker launch-context list --json` for immutable context ownership and currentness
- `drwn card outdated --check` to fail when project cards have newer versions
- `drwn card validate <ref>` for a single card

`doctor` is report-only and does not mutate state.

## Read-Only Validation

Set the read-only guard to refuse any store mutation in CI:

```bash
export DRWN_STORE_READONLY=1
drwn doctor
```

With `DRWN_STORE_READONLY=1`, inspection and dry runs still work; real
mutations fail before writing.

## Exit-Code Semantics

- `drwn doctor` exits non-zero for fatal ambient MCP collisions and
  error-severity instruction-delivery or Worker-materialization issues, and for
  drifted, corrupt, or foreign Worker launch contexts
- other report arrays may be non-empty without changing doctor's exit code;
  assert the categories your CI treats as blocking
- `drwn card validate <ref>` exits non-zero on integrity or schema failures
- `drwn card outdated --check` exits non-zero when any project card has a newer locked version available

Combine these in a CI step to surface every class of drift.

## JSON Parsing Tips

Use `--json` and `jq` to assert on the specific fields your policy treats as
blocking:

```bash
drwn doctor --json | jq -e '
  (.brokenSymlinks | length == 0) and
  (.staleSkillSymlinks | length == 0) and
  (.mcpDrift | length == 0) and
  (.projectConfigIssues | length == 0) and
  ((.instructionDelivery.issues // []) | all(.severity != "error")) and
  ((.orgWorkerMaterialization.issues // []) | all(.severity != "error"))
  and ((.launchContexts.drifted // 0) == 0)
  and ((.launchContexts.corrupt // 0) == 0)
  and ((.launchContexts.foreign // 0) == 0)
'
drwn card outdated --check --json | jq '.outdated | length == 0'
drwn status --json | jq -e '
  (.orgWorkerMaterialization.state // "absent") |
  IN("absent", "current", "removed")
'
```

`--json` output is the contract surface; the human-readable text format is not.
`launchContexts.obsolete` is advisory: it means effective inputs no longer
produce that context ID. Drifted/corrupt/foreign counts are unhealthy because
ownership cannot be verified. Doctor never prunes contexts.

## Minimal GitHub Actions Snippet

```yaml
name: drwn-doctor

on: [push, pull_request]

jobs:
  doctor:
    runs-on: ubuntu-latest
    env:
      DRWN_STORE_READONLY: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install -g darwinian
      - run: drwn install --frozen  # resolves card.lock; exits non-zero if lock is stale
      - run: drwn doctor --json
      - run: drwn card outdated --check --json
```

`drwn install --frozen` refuses to clone or rewrite `card.lock` in CI, so a
missing or stale lockfile fails the job instead of silently mutating.

## See Also

- [doctor CLI reference](../reference/cli/doctor)
- [card CLI reference](../reference/cli/card)
- [Reading drwn doctor output](../troubleshooting/reading-doctor)
