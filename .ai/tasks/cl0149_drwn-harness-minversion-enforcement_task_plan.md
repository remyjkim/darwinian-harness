# ABOUTME: Task plan (GATE 2) for I149 — enforce each card's declared harness.minVersion during materialization.
# ABOUTME: Carries the implementation approach plus the executable Testing strategy (TDD contract).

# I149 — Enforce per-card `harness.minVersion` during materialization · Task Plan

**Status**: Planning (this is the GATE 2 artifact; GATE 1 architecture doc is the sibling `cl0149_…_target_architecture.md`) — v1, 2026-07-29
**Created**: 2026-07-29
**Issue**: #149 · Repo: darwinian-minds (the `drwn` CLI)
**References**: [analyses/cl0149_drwn-harness-minversion-enforcement_target_architecture.md, cli/commands/write.ts, cli/commands/install.ts, cli/commands/card/status.ts, cli/commands/doctor.ts, cli/core/card-manifest.ts, cli/core/card-lock.ts, cli/core/card-install.ts, cli/core/mind-capability.ts, cli/core/version.ts, cli/commands/card/source/set.ts]

> **Issue-number note (v0.4 contract):** Issue ID **149** was read back from the CL Issue Tracker (`ntn datasources query 393f1fbe-f8c2-8024-81c0-000bdf389999`) on 2026-07-29, where the highest allocated ID is 148. If the row was not created before this file was committed, create the row, re-read the generated ID, and retitle before proceeding. Do not guess.

---

## Objective / target state

A card's `harness.minVersion` field is honored, not merely validated as well-formed. Today `core/card-manifest.ts:277-278` only asserts the value is strict semver; `card source set --harness-min-version` (set.ts:41) writes a field that nothing ever reads. A card can therefore declare `"harness": { "minVersion": "1.5.0" }` and still materialize against `drwn` 1.0.0 with no signal.

After I149, every materialization preflight (`drwn write`, `drwn install`) compares each active card's declared `harness.minVersion` against the running `DRWN_VERSION`, warns by default, and fails under `--strict`. `drwn card status` and `drwn doctor` surface the same comparison so drift is visible without a write. The strict project-lock-graph floor (`store.minDrwnVersion`, derived in `minimumDrwnVersionForManifests`) is untouched — I149 adds a per-card check that runs **alongside** it, not inside it.

**Origin of the gap:** surfaced while reviewing `curation-labs/cl-workflow-card` PR #1 (merged 2026-07-30 as v1.1.0), which pins `"harness": { "minVersion": "0.9.0" }` against a CLI that only validates the shape.

## Success criteria

- [ ] A card declaring `harness.minVersion` greater than `DRWN_VERSION` produces a warning on `drwn write` and `drwn install`, naming the card and the required vs running versions.
- [ ] The same condition exits non-zero under `--strict` on both commands.
- [ ] A card with no `harness.minVersion`, or one ≤ the running version, is silent and exits 0 (no behavior change for the vast majority of cards).
- [ ] `drwn card status` prints a `harness: requires drwn >= X (running Y)` line per offending card.
- [ ] `drwn doctor` lists harness-floor mismatches in its report.
- [ ] The project-lock-graph floor (`store.minDrwnVersion`) continues to behave exactly as before; the two mechanisms do not interfere.
- [ ] Full `bun test` green; new tests cover each behavior above.

---

## How we fix it

### Fix A — per-card harness-floor evaluation · `cli/core/mind-capability.ts` (+ new helper)

**Change:** add a pure helper next to the existing `minimumDrwnVersionForManifests`. Reuse `evaluateVersionFloor` and `DRWN_VERSION` so the comparison logic stays in one place.

```ts
// cli/core/card-manifest.ts  (or mind-capability.ts — see "placement" below)
import type { CardManifest } from "./card-manifest";
import { evaluateVersionFloor, type VersionFloorStatus } from "./card-lock";
import { DRWN_VERSION } from "./version";

export interface CardHarnessFloor {
  name: string;
  declared: string;                 // manifest.harness.minVersion
  status: VersionFloorStatus;       // { required, running, satisfied }
}

export function evaluateCardHarnessFloor(
  manifest: CardManifest,
  runningVersion: string = DRWN_VERSION,
): CardHarnessFloor | null {
  const declared = manifest.harness?.minVersion;
  if (!declared) return null;       // most cards: no floor, no signal
  return {
    name: manifest.name,
    declared,
    status: evaluateVersionFloor(declared, runningVersion),
  };
}
```

**Placement decision (open Q1):** `mind-capability.ts` already owns "derive a floor from card manifests" and imports `CardManifest` — it is the natural home and keeps the new helper next to its sibling. `card-lock.ts` is the alternative (it owns `evaluateVersionFloor`) but would create a circular-ish coupling with `mind-capability.ts`. **Recommend `mind-capability.ts`.**

**Options considered:** (A) reuse `evaluateVersionFloor` *(chosen — single comparison path, already tested by `core-version-floor.test.ts`)*; (B) inline a fresh `gte` call *(rejected — second source of truth for the same comparison)*.

### Fix B — wire the check into `drwn write` preflight · `cli/commands/write.ts:165-175`

**Change:** after the existing `lock.store.minDrwnVersion` floor check (line 169), iterate `consentState.activeCards` and evaluate each manifest's harness floor. The card manifests are already on the lock entries (`CardLockEntry.manifest`, `card-lock.ts:38`); load them from the same lock used at line 168.

```ts
// in write.ts, immediately after the existing store-floor block (~line 175):
const harnessFloors = (lock?.cards ?? [])
  .map((c) => evaluateCardHarnessFloor(c.manifest))
  .filter((f): f is CardHarnessFloor => f !== null);
for (const floor of harnessFloors) {
  if (floor.status.satisfied) continue;
  this.context.stderr.write(
    `Card ${floor.name} requires drwn >= ${floor.status.required} ` +
    `(declared harness.minVersion), but you are running ${floor.status.running}.\n`,
  );
  if (this.strict) return 1;
}
```

**Note:** `lock.cards` is already loaded at line 168; no second read. The `consentState.activeCards` loop just below (line 178) continues unchanged — harness-floor is an independent concern from hook/instruction consent.

### Fix C — same check in `drwn install` · `cli/commands/install.ts`

**Change:** `install.ts` currently performs no version-floor check at all (confirmed: no `evaluateVersionFloor` import). Add the same per-card loop after the lock is resolved. Because `install` lacks a `--strict` flag today, the failure path for install is: **warn only, unless `--strict` is added** (open Q2 — see Open questions). Add `--strict` parity with `write` for symmetry.

**Options considered:** (A) add `--strict` to `install` *(chosen — symmetric with `write`; install is the CI restoration path where a hard failure is most useful)*; (B) warn-only forever *(rejected — install is exactly where a silent floor breach on a fresh checkout is dangerous)*.

### Fix D — surface in `drwn card status` · `cli/commands/card/status.ts`

**Change:** the per-card line at `status.ts:99` already prints version/consent info. Append a harness-floor segment when the manifest declares one that the running CLI does not satisfy:

```ts
// build alongside the existing modeLine:
const harnessLine = (() => {
  const f = evaluateCardHarnessFloor(card.manifest);
  if (!f || f.status.satisfied) return "";
  return ` harness: requires drwn >= ${f.status.required} (running ${f.status.running})`;
})();
// then in the template string at line 99:
return `- ${card.name}@${card.version} (${card.requested}) hook-consent: ${…} instruction-consent: ${…}${modeLine}${harnessLine}`;
```

### Fix E — surface in `drwn doctor` · `cli/commands/doctor.ts`

**Change:** add a harness-floor pass to the doctor report. `doctor` already "inspects local harness state for broken symlinks, stale generated files" (`doctor.ts:17`); a version-floor mismatch is the same class of local-state health check. Collect offending cards across the active project lock and print them under a `Harness minVersion mismatches` section.

---

## Testing strategy (TDD contract)

### Behaviors & invariants
- **write (default):** a card with `harness.minVersion > DRWN_VERSION` → stderr warning naming the card + required + running; exit 0.
- **write (--strict):** same condition → exit 1.
- **write (no/satisfiable floor):** a card with no `harness.minVersion`, or one ≤ running → no warning, exit 0.
- **install:** same three behaviors; `--strict` added for parity.
- **card status:** offending card prints the `harness: requires drwn >= …` line; satisfied/absent cards print nothing extra.
- **doctor:** offending cards appear in a `Harness minVersion mismatches` section.
- **Non-interference:** the strict lock-graph floor (`store.minDrwnVersion`) still rejects forged floors exactly as in `commands-write-version-floor.test.ts`; the harness check does not weaken or duplicate it.
- **Pure helper:** `evaluateCardHarnessFloor` returns `null` for absent/minimal manifests, returns `{satisfied:false}` only when `declared > running`.

### Layer ownership
- **Unit** (pure): `evaluateCardHarnessFloor` (Fix A) — absent floor, satisfied floor, unsatisfied floor, custom running version.
- **Command-level** (clipanion `Cli` + injected agents dir / temp lock): `write`, `install`, `card status` (Fixes B/C/D) against fixtures that craft a `card.lock` with a `manifest.harness.minVersion` above/below a faked running version.
- **doctor:** a command test that builds a project lock with one offending + one clean card and asserts the section (Fix E).
- **Integration/E2E:** none beyond existing `commands-write-*` harness — the new check rides the same preflight loop.

### TDD sequence (ordered red → green)
1. **Fix A (pure):** red — `test/core-card-harness-floor.test.ts` asserts the four helper outcomes; green — add `evaluateCardHarnessFloor`.
2. **Fix B (write):** red — extend `test/commands-write-version-floor.test.ts` (or new `commands-write-harness-floor.test.ts`) with a fixture whose card declares `harness.minVersion: "9.9.9"`; assert warning + (under `--strict`) exit 1; green — wire the loop in `write.ts`.
3. **Fix C (install):** red — new `test/commands-install-harness-floor.test.ts`, same shape; green — wire `install.ts` + add `--strict`.
4. **Fix D (card status):** red — `test/commands-card-status.test.ts` (extend or new) asserts the harness line appears for an offending card and not for a clean one; green — edit `status.ts`.
5. **Fix E (doctor):** red — `test/commands-doctor.test.ts` asserts the mismatches section; green — edit `doctor.ts`.

### Case catalog (case → intended layer → target file)
- helper: absent-floor / satisfied-floor / unsatisfied-floor / custom-running-version → unit → `test/core-card-harness-floor.test.ts`
- write: harness-too-high (warn, exit 0) / harness-too-high --strict (exit 1) / harness-absent (silent) / harness-satisfied (silent) → command → `test/commands-write-harness-floor.test.ts`
- install: same four cases, plus `--strict` parity → command → `test/commands-install-harness-floor.test.ts`
- card status: offending-card-shows-line / clean-card-silent → command → `test/commands-card-status.test.ts`
- doctor: one-offending-one-clean → section lists exactly the offending → command → `test/commands-doctor.test.ts`
- regression: existing `commands-write-version-floor.test.ts` still passes (forged `store.minDrwnVersion` still rejected) → command → unchanged file

### Harness, fixtures & test data
- Runner **`bun test`**. Reuse `scaffoldCliFixture` / `cleanupTempRoots` / `writeSupportedProjectConfig` / `runAgentsCli` from `test/helpers` (same as `commands-write-version-floor.test.ts`).
- For the running-version seam: prefer asserting against `DRWN_VERSION` by declaring a card floor just above it (e.g. bump the fixture card's `harness.minVersion` to `"9.9.9"`); do not mutate `DRWN_VERSION`. If a custom running version is needed in the pure unit test, pass it as the helper's second arg.
- Lock fixtures: a `card.lock` with one card whose `manifest.harness.minVersion` exceeds running, plus a control card with no harness block. Follow the shape in `commands-write-version-floor.test.ts:24-30`.

### Commands & environment
```bash
bun test test/core-card-harness-floor.test.ts \
         test/commands-write-harness-floor.test.ts \
         test/commands-install-harness-floor.test.ts \
         test/commands-card-status.test.ts \
         test/commands-doctor.test.ts                                              # focused
bun test ./test/                                                                     # full suite
```
No env prereqs beyond the existing fixture helpers; no network.

### Required CI jobs / definition of green
- The repo's `bun test` job passes on all platforms it already runs. "Green" = the new behaviors above are asserted and pass, and no existing test regresses — especially `commands-write-version-floor.test.ts`, `core-card-lock.test.ts`, `core-version-floor.test.ts`, `commands-write*.test.ts`, and `commands-install-unsupported-lock.test.ts`.

### Non-goals, manual checks & residual risk
- **Not changing `store.minDrwnVersion` derivation.** `minimumDrwnVersionForManifests` stays at 0.8.0/0.9.0; per-card `harness.minVersion` does not feed into the lock-graph floor. The two are independent signals (open Q3 — confirm this separation is desired vs. folding harness floors into the lock derivation).
- **Not enforcing `lastValidatedWith`.** `card source set --last-validated-with` (set.ts:49) writes a field that is similarly unread; that's a separate drift signal and out of scope here.
- **Not changing the `card source set` authoring UX** beyond ensuring the field it writes is now load-bearing. Optionally add a one-line note to `--harness-min-version`'s description that it is now enforced at materialization (open Q4).
- **Manual check:** one real card (`@curation-labs/workflow-skills@1.1.0`, declares `0.9.0`) materialized against `drwn` 1.0.0 stays silent (1.0.0 ≥ 0.9.0); temporarily bumping the card's floor to `1.5.0` should produce the warning. Record in the PR evidence.
- Residual: cards authored before this change that carry a stale/incorrect `harness.minVersion` will now warn where they previously silently passed. That is the intended behavior (the warning is the feature), but expect a small wave of "why is my card warning now" during rollout — the message names the card and the required version to make the fix obvious.

---

## Sequence / phasing
1. **Phase 1 (pure + write):** Fix A → Fix B, red→green. This is the core enforcement and unblocks the rest.
2. **Phase 2 (install + UX):** Fix C → Fix D → Fix E, red→green each.
3. **GATE 3:** open the code-PR with the `Testing & CI evidence` section; Owner Status → In Review after G2 passes.

## Open questions for review
1. **Helper placement:** `mind-capability.ts` (recommended, next to `minimumDrwnVersionForManifests`) vs. `card-lock.ts` (next to `evaluateVersionFloor`) vs. a new `core/card-harness-floor.ts`?
2. **install `--strict`:** add the flag for parity with `write` (recommended), or keep install warn-only and rely on `write --strict` in CI?
3. **Separation vs. folding:** keep per-card `harness.minVersion` as an independent preflight check (recommended — a card author's floor is a different statement than the lock-graph's derived capability floor), or fold it into `minimumDrwnVersionForManifests` so the lock itself refuses to form?
4. **Authoring UX:** add a note to `card source set --harness-min-version`'s description that the value is now enforced at materialization?
