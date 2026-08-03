---
sidebar_position: 1
---

# Reading Doctor

`drwn doctor` runs every detector and reports what looks wrong without mutating anything. It is the inverse of `drwn write`: where `write` enforces invariants before touching disk, `doctor` enumerates problems and exits. Treat its output as a worklist, not a guarantee of safety.

Run it directly or with a machine-readable payload:

```bash
drwn doctor
drwn doctor --json
```

## The Report-Only Contract

`doctor` never removes a stale symlink, never rewrites a drifted MCP file, never re-pulls a missing card. It reads the same configuration `drwn write` would resolve and runs the detectors against current disk state. If you want it fixed, you decide which command to run next.

This is deliberate. The doctor and the write pipeline share one diagnostics engine in `cli/core/diagnostics.ts`, but the write path raises typed errors and aborts before mutation while doctor surfaces the same conditions as a report and returns normally. See [Diagnostics Model](../concepts/diagnostics-model) for the split.

## JSON Output Shape

`drwn doctor --json` returns a `DoctorReport`:

```json
{
  "brokenSymlinks": [],
  "staleSkillSymlinks": [],
  "mcpDrift": [],
  "missingGeneratedFiles": [],
  "hookIssues": [],
  "surfaceNotes": [],
  "platformChecks": [],
  "projectConfigIssues": [],
  "instructionDelivery": {
    "state": "current",
    "adapter": "owned",
    "consentEvidence": [],
    "issues": []
  },
  "orgWorkerMaterialization": {
    "state": "current",
    "bundleDigest": "sha256:...",
    "workerId": "worker:...",
    "blueprintDigest": "sha256:...",
    "lastVerifiedReceiptId": "worker-materialization-...",
    "instructionConsentSource": "organization",
    "issues": []
  },
  "cards": { "configuredRefs": [], "lockedVersions": [], "warnings": [] },
  "store": { "path": "...", "initialized": true, "schemaVersion": 1, "cardCount": 0, "sourceCount": 0, "skillBundleCount": 0, "mcpServerCount": 0 },
  "writeRecord": { "path": "...", "present": true, "corrupt": false, "managedPathCount": 0, "lastWriteAt": "...", "lastWriteHarnessVersion": "..." }
}
```

Each of the top-level arrays maps to one detector category below.
The project-only instruction/materialization sections use their own bounded
issue arrays. The materialization section omits instruction content, evidence
paths, secrets, and organization readiness.

## Detector Categories

### Broken symlinks

A symlink under `~/.claude/skills/` or `~/.codex/skills/` whose target file no longer exists. Usually means a previously projected source was removed.

```bash
drwn doctor --json
drwn write --dry-run
```

Re-running `drwn write` re-points drwn-owned links to the correct source if the
underlying skill is still resolved. If a machine skill is no longer desired,
publish/select a Blueprint without its owning Card; for a project overlay,
remove it from `skills.include`.

### Stale skill symlinks

A symlink that drwn no longer wants because the skill is no longer in the resolved set, but is still on disk. drwn-owned stale links are cleaned up on the next `drwn write` via the write record. User-owned replacements are preserved and warned about.

```bash
drwn doctor --json
drwn write
```

See [Stale Symlinks](./stale-symlinks) for the ownership distinction and safe manual inspection steps.

### MCP drift

The managed `mcpServers` key in `~/.claude/settings.json` or the `[mcp_servers]` block in `~/.codex/config.toml` has been edited outside drwn. Cursor reports drift when the generated `cursor-mcp.json` no longer matches the rendered expectation.

```bash
drwn doctor --json
drwn status --why server:<name>
drwn write --dry-run
drwn write --force
```

`--force` only overwrites drwn-managed regions. See [Ownership Conflicts](./ownership-conflicts) for the decision tree.

### Missing generated files

This category is retained for output-shape stability but is no longer triggered by Cursor. Cursor's `mcp.json` is written directly as `managed-content` rather than via a generated sidecar file, so there is no generated file that can go missing. If `missingGeneratedFiles` is non-empty in a report, it indicates an earlier generated-sidecar write record; re-running `drwn write` clears it.

### Hook issues

A locked card declares hook policies but no hook consent has been recorded. `drwn write` will not materialize hooks for this card until consent is granted.

```bash
drwn doctor --json
drwn card trust @your-handle/backend --hooks
drwn write
```

Use `drwn card untrust @your-handle/backend` to revoke consent.

### Instruction delivery and organization Worker materialization

`instructionDelivery` reports local consent/projection/adapter health.
`orgWorkerMaterialization` independently classifies local handoff evidence as
`absent`, `current`, `drifted`, `blocked`, `removed`, or `unknown`
(`compatible` is reserved and not emitted by V1).

Error-severity issues in either section make doctor exit non-zero. For
materialization, common codes are:

- `ORG_WORKER_OPERATION_INCOMPLETE`;
- `ORG_WORKER_EVIDENCE_MALFORMED|ORPHANED|MISSING`;
- `ORG_WORKER_PROJECT_STATE_DRIFT`;
- `ORG_WORKER_RECEIPT_MISMATCH`;
- `ORG_WORKER_ARTIFACT_DRIFT`;
- `ORG_WORKER_PROJECTION_DRIFT`;
- `ORG_WORKER_REMOVAL_DRIFT`.

Doctor never resumes, reconciles, or removes. Preserve evidence, retry an
incomplete operation with the same operation ID, or use the exact immutable
handoff with `drwn install --reconcile`/`--remove`.

### Platform checks

`platformChecks` is an array of `{ name, ok, detail? }` entries for environment prerequisites. A non-empty array with `ok: false` entries indicates a setup problem that will cause commands to fail.

Currently checked:

| Check | What it verifies | Resolution when `ok: false` |
|---|---|---|
| Home directory resolves | `AGENTS_HOME_DIR`, `HOME`, `USERPROFILE`, or `os.homedir()` returns a non-empty path | Set `AGENTS_HOME_DIR` or ensure `HOME` is set |
| `node` on PATH | `node` is findable; required for MCP servers that spawn Node processes | Install Node.js and ensure it is on `PATH` |

`platformChecks` entries with `ok: true` are normal. Only `ok: false` entries require action.

### Project config issues

A single category that aggregates problems with `<project>/.agents/drwn/config.json` and the resolved card lock:

- **Unknown server reference** — `mcpServers["<name>"]` toggles a server that is not in the registry, standalone MCP inventory, or selected Worker closure.
- **Unknown skill reference** — `skills.include` or `skills.exclude` names a skill that no repo-native source, package-backed bundle, or selected Worker closure provides.
- **Unknown extension reference** — `extensions["<name>"]` references an extension the registry does not know about.
- **Stale target override** — `targets["<name>"].enabled` matches packaged project policy; the override is a no-op.
- **Card references unavailable skills** — a Card in the selected root closure lists a skill name the project's available inventory cannot satisfy.
- **Invalid machine Worker lock** — active root, topology, version floor, or Card entries are inconsistent.
- **Invalid locked Card bytes** — a machine-closure extraction is missing or no longer matches recorded integrity.
- **Machine consent gap** — an active locked Card requires reviewed hook or instruction consent.
- **Machine projection conflict** — a destination is foreign or prior-owned state has drifted. Doctor reports it without repair.

At write time these would each abort `drwn write` before mutation. At doctor time they collect into `projectConfigIssues` and the run continues so the rest of the report still renders.

```bash
drwn doctor --json
drwn status --why skill:<name>
drwn status --why server:<name>
```

Fix project overlays by editing the offending project config or installing the
missing project-safe package/record. Fix machine state by selecting a valid
immutable Blueprint or repairing its Store content; do not hand-edit the
embedded lock or infer provenance from standalone inventory.

## Cross-References

- [reference/cli/doctor](../reference/cli/doctor) for the command surface
- [Diagnostics Model](../concepts/diagnostics-model) for how doctor and the write pipeline share one engine
- [Using `status --why`](./using-status-why) for tracing where an active item came from
- [Stale Symlinks](./stale-symlinks) and [Ownership Conflicts](./ownership-conflicts) for the most common follow-ups
