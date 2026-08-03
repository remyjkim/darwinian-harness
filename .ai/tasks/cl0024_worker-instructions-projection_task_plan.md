# ABOUTME: Review 02 execution plan for explicit Worker-instructions projection into a drwn-owned AGENTS.md block and Claude adapter.
# ABOUTME: Closes Review 01 with one contribution resolver, explicit consent only, dual hash domains, safe lifecycle rules, and OrgWorkerBundleV1 conformance.

# Worker Instructions Projection V1 Implementation Plan

**Issue:** CL0024 / I24
**Version:** V1
**Program:** `ARCH-PROV-REM-2026-07-23`
**Status:** Local implementation complete and verified on the owner-approved checkout; immutable `OrgWorkerBundleV1` producer/consumer conformance is checksum-pinned, and `drwn install --frozen --org-worker-bundle` verifies exact active-worker/Card pins and writes a bounded deterministic receipt. Live Claude/Cursor/OpenCode ingestion sessions and publication remain separately authorized and are `NOT RUN`.
**Created:** 2026-07-22
**Updated:** 2026-07-23
**Repository:** `/Users/pureicis/dev/darwinian-minds`
**Evidence base:** `346f560d8825dfa709499f998b39e733239fca94`; re-record status/revision before Task 0.
**Execution mode:** use the current checkout as explicitly directed; create no separate worktree or commit until the remediation is fully complete. Preserve every unrelated file/change.

## 1. Binding references

- `.ai/analyses/cl0024_worker-instructions-projection_target_architecture.md`
- `.ai/analyses/125_feature_canonical_instructions_projection_decision_analysis.md`
- `.ai/analyses/126_feature_canonical_instructions_architecture_proposal.html`
- `.ai/tasks/cl0024_review01_worker-instructions-projection-execution-readiness.md`
- `.ai/tasks/cl0024_review02_worker-instructions-projection-execution-readiness.md`
- `/Users/pureicis/dev/darwinian-org/.ai/analyses/08_architect_organization_provisioning_blueprint_target_architecture.md`
- `/Users/pureicis/dev/darwinian-org/.ai/tasks/01_org-worker-bundle-v1_task_plan.md`

## 2. Goal and boundary

Project the active Worker's composed explicit instructions into a consent-gated,
drwn-owned managed block inside repository-root `AGENTS.md`, optionally maintain the
Claude import adapter, expose stable doctor/status evidence, and consume
`OrgWorkerBundleV1` without absorbing organization-level authority.

This plan owns:

- explicit instruction contribution, consent, composition, projection, ownership,
  drift, cleanup, diagnostics, and documentation;
- a project-scoped, target-agnostic `"instructions"` write-record surface;
- producer/consumer conformance for resolved Card and explicit instruction inputs.

This plan does not own:

- brand or organization provenance decisions;
- inter-Worker grants, communication protocols, or collaboration flows;
- machine-capability grant application;
- Foundry apply/reconcile/readiness;
- nested `AGENTS.md`, per-target instruction variants, or session-hook injection.

## 3. Frozen V1 decisions

1. **Explicit instructions only.** The canonical contribution resolver reads
   `manifest.instructions.text` or the exact bytes at `manifest.instructions.path`.
   Bundled skills, hooks, READMEs, and model output are not instruction fallback.
2. **One resolver.** Consent, content digest, composition, write-time acknowledgement,
   doctor, status, and `OrgWorkerBundleV1` ingestion use the same resolver.
3. **Explicit consent for every Card origin.** Local/first-party origin does not
   bypass consent; there is no first-party auto-grant.
4. **Dual hash domains.**
   - Card/composed **content digest** hashes canonical instruction content bytes.
   - managed-block **ownership hash** hashes exact rendered block bytes, including
     markers and managed header, under a distinct domain separator.
5. **Consented byte identity.** The Worker-generated consented instructions artifact
   and `AGENTS.md` body use the same composed bytes. An unconsented contributor is
   absent from both and produces a warning; `--strict` returns nonzero.
6. **User-file safety.** Bytes outside a recognized managed block are preserved
   exactly. Malformed, duplicate, nested, reversed, or partial markers fail closed.
7. **Adapter truth.** A foreign `.claude/CLAUDE.md` already containing a valid
   `@../AGENTS.md` import satisfies delivery without ownership. Foreign files without
   the import are warning-only unless `--apply-claude-adapter` is explicitly supplied.
8. **Project scope.** Instructions are target-agnostic and project-only. Machine scope
   rejects them. Partial MCP/skill/target writes retain but do not rewrite ownership.
9. **Organization boundary.** `OrgWorkerBundleV1` contributes resolved Cards and
   explicit instructions. Grant/protocol/provenance references remain opaque metadata.

## 4. TDD and evidence protocol

For every behavior:

1. add one focused test;
2. run the exact focused command and inspect the intended RED;
3. implement the smallest GREEN;
4. rerun the focused test;
5. refactor only under green;
6. record command, exit code, counts, and evidence path.

A missing module/symbol or asserted behavior mismatch is valid RED. A broken fixture,
wrong import, missing dependency install, or unrelated baseline failure is not.
Unexpected behavior triggers `systematic-debugging`; completion claims require
`verification-before-completion`.

## 5. Ordered implementation tasks

### Task 0 — Revalidate baseline and freeze consumer fixtures

**Files**

- Create: `test/fixtures/instructions/{explicit-text,explicit-path,no-instructions}.json`
- Create: `test/fixtures/org-worker-bundle-v1/` from the immutable producer packet
- Modify only if needed: the test fixture manifest

**RED**

- fixture manifest verifier does not exist;
- current composer fallback includes bundled skill bytes;
- producer fixture cannot be verified because packet identity is absent.

**GREEN**

- record branch/revision/status, Bun/Node versions, baseline counts, current CI jobs,
  active docs root, and exact producer packet digest;
- freeze one text, path, empty, mixed-consent, CRLF, and adversarial contribution;
- freeze valid/invalid producer fixtures without copying the producer schema;
- record the existing bundled-skill behavior as the characterization test that later
  changes intentionally.

**Commands**

```bash
bun test ./test/core-worker-generator.test.ts
bun test ./test/
bunx tsc --noEmit
```

If the full baseline is not green, diagnose before feature edits.

### Task 1 — Add byte-preserving managed-block primitives

**Files**

- Create: `cli/core/managed-block.ts`
- Modify: `cli/core/git-hygiene.ts`
- Create: `test/core-managed-block.test.ts`
- Re-run: `test/core-git-hygiene.test.ts`

**Contract**

`parseManagedBlock(bytes, markers)` returns exactly one of:

- `absent` with original bytes/newline/final-newline metadata;
- `present` with exact `before`, `block`, and `after` byte slices;
- `malformed` with stable code and no writable result.

RED cases cover start-only, end-only, duplicate, nested, reversed, marker collision in
user content, LF, CRLF, no final newline, empty/whitespace file, and insertion policy.
GREEN preserves every byte outside the block. Git hygiene delegates without byte drift.

```bash
bun test ./test/core-managed-block.test.ts
bun test ./test/core-git-hygiene.test.ts
```

### Task 2 — Add instruction consent schema and update lifecycle

**Files**

- Modify: `cli/core/card-lock.ts`
- Modify: `cli/core/card-project.ts`
- Modify: `cli/commands/card/outdated.ts`
- Modify the existing Card status/show renderer located during Task 0, recording path
- Modify/create tests:
  `test/core-card-lock.test.ts`,
  `test/commands-card-outdated-fetch.test.ts`,
  `test/commands-card-trust.test.ts`,
  and the exact update/status tests identified in Task 0

**Schema**

```ts
instructionConsent?: {
  consentedAt: string
  consentedRange: string
  contentDigest: `sha256-${string}`
}
```

RED/GREEN:

- validate ISO time, semver range, and digest;
- round-trip lock bytes;
- compatible update carries consent only when version remains in range and content
  digest is unchanged;
- version/content drift drops consent and emits actionable outdated/status guidance;
- install/update/trust/untrust persistence is atomic;
- JSON and human readouts expose consent state without instruction content.

```bash
bun test ./test/core-card-lock.test.ts
bun test ./test/commands-card-outdated-fetch.test.ts
bun test ./test/commands-card-trust.test.ts
```

### Task 3 — Implement the one explicit-contribution resolver and digest lifecycle

**Files**

- Create: `cli/core/instruction-contribution.ts` (contribution resolution and consent validation)
- Create: `cli/core/instruction-consent-ack.ts`
- Modify: `cli/core/worker-generator/sync-worker.ts`
- Create: `test/core-instruction-consent.test.ts`
- Modify/create the focused Worker-generator test from Task 0

**API**

```ts
resolveExplicitInstructionContribution(card, contentRoot):
  | { bytes: Uint8Array; contentDigest: string; source: "text" | "path" }
  | null

isInstructionConsentValid(card, contribution): boolean
```

RED/GREEN:

- text/path resolve to exact canonical bytes;
- traversal, absolute path, missing/oversize/non-UTF-8 file fails with stable code;
- bundled skill only returns `null`;
- every current Card origin requires the same explicit-consent rule;
- version range and exact content digest both match;
- compute/has/record acknowledgement uses a distinct namespace;
- cross-machine lock with no local acknowledgement emits once, then records;
- content change invalidates both consent and old acknowledgement.

```bash
bun test ./test/core-instruction-consent.test.ts
bun test ./test/core-worker-generator.test.ts
```

### Task 4 — Add trust/untrust instruction commands

**Files**

- Modify: `cli/commands/card/trust.ts`
- Modify the exact untrust command found under `cli/commands/card/`
- Modify: `cli/core/card-project.ts`
- Modify: `cli/commands/write.ts` for acknowledgement notice only
- Modify: `test/commands-card-trust.test.ts`

RED/GREEN:

- require at least one of `--hooks` or `--instructions`;
- support both atomically and preserve hook behavior;
- default range `^<resolvedVersion>`; explicit range must include current version;
- trust records exact current content digest and time;
- no-contribution trust returns usage error;
- untrust clears only selected consent;
- same input is idempotent; failure leaves lock unchanged;
- JSON/human output and cross-machine acknowledgement are stable.

```bash
bun test ./test/commands-card-trust.test.ts
```

### Task 5 — Add the project-only instructions write-record surface

**Files**

- Modify: `cli/core/write-record.ts`
- Revalidate unchanged: `cli/core/projection-ownership.ts`
- Modify: `test/core-write-record-v1.test.ts`
- Modify: `test/commands-write-partial-ownership.test.ts`

RED/GREEN:

- add `ProjectionSurface = ... | "instructions"`;
- valid only at project scope with no target;
- reject machine scope and targeted entry;
- store managed-fields ownership hash for exact rendered block bytes;
- store adapter as managed-content or managed-fields according to transition state;
- `--mcp-only`, `--skills-only`, and `--target` retain bytes/mtime/ownership unchanged;
- schema remains backward-readable for prior records.

```bash
bun test ./test/core-write-record-v1.test.ts
bun test ./test/commands-write-partial-ownership.test.ts
```

### Task 6 — Implement pure composition and desired-state sync

**Files**

- Create: `cli/core/sync-instructions.ts`
- Modify: `cli/core/worker-generator/sync-worker.ts`
- Create: `test/core-sync-instructions.test.ts`

**API**

```ts
composeConsentedInstructions(state): {
  bytes: Uint8Array | null
  contentDigest: string | null
  excluded: Array<{ card: string; reason: string }>
}

planInstructionProjection(input): InstructionProjectionPlan
```

RED/GREEN:

- one consented + one unconsented Card yields exactly consented bytes in both Worker
  artifact and planned `AGENTS.md` body;
- empty composition produces no placeholder block;
- header contains `Instruction-ID` and content digest;
- ownership hash uses domain-separated exact marker+header+body bytes;
- absent block inserts at the documented position;
- matching block is byte/mtime idempotent;
- body/header/marker tamper independently fails without mutation;
- `force` heals only a uniquely recognized previously owned block;
- warnings contain Card IDs, not instruction text.

This task tests the pure/direct seam; it does not use CLI-spawned integration before
pipeline wiring exists.

```bash
bun test ./test/core-sync-instructions.test.ts
```

### Task 7 — Wire typed options, pipeline, cleanup, and watch

**Files**

- Modify: `cli/core/types.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/commands/write.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/write-watch.ts`
- Create: `test/commands-write-instructions.test.ts`
- Modify: `test/commands-write-watch.test.ts`

Thread exact options:

```text
WriteCommand --strict / --apply-claude-adapter
  -> SyncOptions
  -> normalized/effective state
  -> syncRepository
  -> syncInstructions
```

RED/GREEN:

- normal mode warns for excluded Cards; `--strict` returns nonzero with no partial
  instruction mutation;
- full project write invokes instructions after state/card resolution;
- partial writes do not invoke or clean instruction projection;
- desired projection verifies prior ownership before replace;
- no-longer-desired cleanup removes only unchanged owned bytes, retains user content,
  and warns on drift;
- removed Worker, empty composition, same-path replacement, force, dry-run, and
  failure atomicity are covered;
- external edits to root `AGENTS.md` and `.claude/CLAUDE.md` trigger one re-evaluation;
  self-writes are suppressed and cannot loop;
- watch run-once retains strict/adapter options.

```bash
bun test ./test/commands-write-instructions.test.ts
bun test ./test/commands-write-watch.test.ts
```

### Task 8 — Implement the Claude adapter transition table

**Files**

- Modify: `cli/core/sync-instructions.ts`
- Modify: `cli/core/sync.ts`
- Extend: `test/commands-write-instructions.test.ts`

| Current state | Default | With `--apply-claude-adapter` | Ownership |
|---|---|---|---|
| absent | write exact `@../AGENTS.md\n` | same | managed-content |
| exact owned adapter | preserve/idempotent | same | retain |
| foreign with valid import | preserve, no warning | preserve | none |
| foreign without import | preserve + advisory | add marked import block | managed-fields block |
| formerly owned one-line file with user edits | preserve + ownership-drift warning | fail unless `--force` and recognized | drop/replace per proof |
| projection removed | delete exact owned-only file; otherwise remove unchanged owned block | same | remove |

Malformed adapter markers fail closed. Force never overwrites unrelated foreign bytes.

```bash
bun test ./test/commands-write-instructions.test.ts --test-name-pattern adapter
```

### Task 9 — Add instruction authoring to source mutation

**Files**

- Modify: `cli/commands/card/source/set.ts`
- Modify: `cli/core/card-source.ts`
- Modify the exact existing source-set tests identified in Task 0

Extend `CardSourceManifestPatch` with mutually exclusive instruction text/path and
explicit clear semantics. RED/GREEN command parsing, core patch, replace, clear,
conflicting flags, relative-safe path, immediate manifest validation, publish, and
lock resolution. Invalid input fails during `source set`, not deferred to publish.

```bash
bun test ./test/commands-card-source-set.test.ts
```

Use the exact existing filename if Task 0 discovers a differently named suite and
record that evidence before RED.

### Task 10 — Consume `OrgWorkerBundleV1` safely

**Files**

- Create: `cli/core/org-worker-bundle-v1.ts`
- Create: `test/org-worker-bundle-v1-conformance.test.ts`
- Add minimal install/write input wiring only after naming the current seam in Task 0

RED/GREEN:

- parse producer goldens and reject every negative fixture;
- verify blueprint/bundle identity and each resolved Card `contentDigest`;
- frozen mode forbids network, floating resolution, or local-source substitution;
- ingest explicit instructions only;
- require explicit instruction consent; no first-party auto-grant;
- keep grant/protocol/organization-provenance references as opaque receipt metadata;
- reject credential, harness-file, applied-state, or current-readiness claims;
- prove content digest and ownership hash remain distinct;
- USMS producer fixture → bundle validate → dry-run write receipt.

```bash
bun test ./test/org-worker-bundle-v1-conformance.test.ts
bun test ./test/commands-write-instructions.test.ts
```

### Task 11 — Add stable doctor/status instruction-delivery contracts

**Files**

- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `cli/commands/status.ts`
- Create: `test/core-instructions-drift.test.ts`
- Modify the existing doctor/status JSON and human-renderer tests named in Task 0

Extend `ProjectStatusV1` additively with:

```ts
instructionDelivery: {
  state: "absent" | "current" | "drifted" | "blocked"
  instructionId?: string
  contentDigest?: string
  ownershipHash?: string
  adapter: "absent" | "owned" | "foreign-valid" | "foreign-missing" | "drifted"
  issues: Array<{
    code:
      | "INSTRUCTIONS_BLOCK_MALFORMED"
      | "INSTRUCTIONS_CONTENT_STALE"
      | "INSTRUCTIONS_OWNERSHIP_DRIFT"
      | "INSTRUCTIONS_ID_STALE"
      | "INSTRUCTIONS_CONSENT_REQUIRED"
      | "CLAUDE_ADAPTER_MISSING"
      | "CLAUDE_ADAPTER_DRIFT"
    severity: "error" | "warning" | "advisory"
  }>
}
```

Errors affect doctor exit health; warnings/advisories do not unless strict mode is
explicit. JSON and human output are tested. This is a separate project instruction
delivery section, not an extension of user-home ambient skill/MCP taxonomy.

```bash
bun test ./test/core-instructions-drift.test.ts
bun test ./test/commands-doctor.test.ts
bun test ./test/commands-status.test.ts
```

Record exact existing filenames if repository naming differs.

### Task 12 — Update active contracts and documentation

**Files**

- Modify: `docs/contracts/project-worker-v1.md`
- Modify: `docs/cli-quickref.md`
- Modify exact relevant pages under `docs-docusaurus/`
- Modify: `CHANGELOG.md`
- Do not edit `docs-astro/`

Document explicit instructions only, consent lifecycle, content digest versus ownership
hash, warning/strict behavior, user-file ownership, adapter transitions,
`OrgWorkerBundleV1` boundary, diagnostics, and rollback.

```bash
bun run docs:build
```

Documentation build is a separate gate; `verify:release` does not substitute for it.

### Task 13 — Full integration, binary smoke, and release gates

One CLI-spawned journey:

```text
author explicit instructions
 -> publish/install/use
 -> write warns/excludes
 -> trust --instructions
 -> write creates block + adapter
 -> repeat proves bytes and mtime unchanged
 -> tamper proves fail-closed / force behavior
 -> compatible and incompatible update consent lifecycle
 -> Worker removal cleans only owned bytes
```

Add a portable test helper that compares bytes and `mtimeNs`; `shasum` alone is
insufficient. Run a scratch-home binary smoke. Live Cursor/OpenCode/Claude ingestion
probes remain explicit operator gates and are recorded `NOT RUN` unless the exact
binary/session is available and authorized; config parsing alone is not evidence of
instruction ingestion.

```bash
bun test ./test/core-managed-block.test.ts
bun test ./test/core-instruction-consent.test.ts
bun test ./test/core-sync-instructions.test.ts
bun test ./test/core-write-record-v1.test.ts
bun test ./test/commands-write-partial-ownership.test.ts
bun test ./test/commands-write-watch.test.ts
bun test ./test/commands-write-instructions.test.ts
bun test ./test/org-worker-bundle-v1-conformance.test.ts
bun test ./test/core-instructions-drift.test.ts
bun test ./test/
bunx tsc --noEmit
bun run docs:build
bun run verify:release
```

## 6. Exit evidence

CL0024 exits only with:

- exact source/packet revisions and dirty-state ownership record;
- focused RED and GREEN receipts for every task;
- full test/typecheck/docs/release results with pass/skip/fail counts;
- valid/negative `OrgWorkerBundleV1` producer-consumer matrix;
- explicit-instructions-only and mixed-consent byte-identity proof;
- every-origin explicit-consent matrix and update lifecycle proof;
- independent content digest and ownership hash vectors;
- malformed-marker/user-byte-preservation matrix;
- adapter transition, cleanup, partial-write, and watch-loop evidence;
- doctor/status JSON and human output fixtures;
- binary smoke receipt and honest status for each manual live-session gate.

## 7. Rollback

Before release, disable/remove the new pipeline call and retain prior write records;
do not delete a user `AGENTS.md`. Cleanup may remove only exact bytes proven owned by
the prior write record. If a released projection is faulty, publish a V1 patch,
denylist the bad fixture/package digest, and keep instruction projection disabled until
consumer conformance is green. Never recover by enabling implicit consent, treating a
skill as instructions, overwriting malformed user files, or conflating content and
ownership hashes.

## 8. Execution evidence log

Append; never rewrite prior evidence.

| Timestamp | Task | Base revision | RED command/result | GREEN command/result | Tests/skips | Evidence | Actor |
|---|---|---|---|---|---|---|---|
| 2026-07-23 | Tasks 0–9, local implementation and frozen bundle install | `346f560d8825dfa709499f998b39e733239fca94` | Focused RED tests exposed missing projection, unsafe reserved-marker adoption, malformed adapter misclassification, absent cross-machine acknowledgement, and the missing immutable bundle-install boundary | Focused suites, `bunx tsc --noEmit`, docs build, release verification, and full `bun test ./test/` pass | 1,637 pass; 6 environment/live skips; 0 fail across 285 files | Producer fixture checksum matches; exact bytes/mtime idempotence, consent lifecycle, symlink/path safety, partial writes, tamper recovery, diagnostics, frozen install receipt, and CLI journeys covered. Live Claude/Cursor/OpenCode ingestion `NOT RUN`. | Codex |
| 2026-07-23 | Task 13 residual: independent gate verification and live ingestion probes | `57b872173567fb857356bf33650df19ef638f701` | — (verification pass, no new RED) | Sequential full `bun test ./test/` 1637 pass · 6 skip · 0 fail; `bunx tsc --noEmit` exit 0; `bun run docs:build` exit 0; `bun run verify:release` exit 0 | 1,637 pass; 6 skip; 0 fail across 285 files | Live ingestion probes against renderer-generated bytes (real `planInstructionProjection` output, sentinel + Instruction-ID): Claude Code via the `.claude/CLAUDE.md` `@../AGENTS.md` adapter — PASS (exact sentinel and Instruction-ID reported); OpenCode — PASS including AGENTS.md-over-CLAUDE.md preference (root CLAUDE.md decoy sentinel not reported; default glm model hit auth failure, probe run on anthropic/claude-haiku-4-5); Codex `exec` — PASS (native root read, decoy not reported). Cursor probe `NOT RUN` — cursor-agent not logged in (operator gate, needs owner login). One full-suite failure observed only when the suite ran concurrently with tsc in one shell; the clean sequential rerun and all gates are green. | Claude (drwn worker) |
