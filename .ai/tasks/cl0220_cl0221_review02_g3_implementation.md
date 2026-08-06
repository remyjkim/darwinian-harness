# ABOUTME: G3 implementation review record for [I220] (PR #94) and [I221] (PR #95) —
# ABOUTME: verdicts, condition dispositions, findings, and the evidence trail.

# [I220] + [I221] G3 Implementation Review (review02)

**Reviewer:** Remy (owner-as-reviewer, session grant on record in both issue threads).
**Scope:** [I220] governance field retirement — PR #94 (merged `ea8e7f0`); [I221]
`drwn worker materialize` — PR #95 (head `74c660c`).
**Bar:** plan fidelity against the G2 slice tables, G1 contract fidelity, the four
conditions carried out of review01, repo rules (TDD evidence, ABOUTME, evergreen comments,
fixture policy), and full-suite/CI gates.

## Verdicts

| Row | PR | Verdict |
| --- | --- | --- |
| [I220] | #94 | **Pass** — four slices RED-first; the slice-2 tolerance test caught and corrected slice 1's in-validator rejection (the exact failure I220-C1 existed to catch); six pre-existing tests amended to the ratified contract, none deleted; full suite 1877/6/0; CI 6/6 |
| [I221] | #95 | **Pass with three review findings, all fixed on the branch** (below); ten slices RED-first; full suite 1889/6/0 pre-findings, family + blast-radius suites green after |

## Condition dispositions (carried from review01)

1. **I220-C1** (publish-site location + consume-path non-execution): **met** — rejection
   lives in `card-source-input`/`card-source` only; `core-card-lock-legacy-governance.test.ts`
   proves published history with retired fields still installs.
2. **I221-C1** (golden fixtures only via the real payload builder): **met, with a recorded
   reading** — the e2e, emission, store-export, and command suites all build payloads via
   `scaffoldCliFixture` + `publishCardWithSkills` + `buildWorkerDeployPayload`
   (`test/worker-materialize-fixture.ts`). The derive/validate suites use minimal inline
   inputs; these are pure-function unit fixtures, not golden fixtures, and the condition's
   own wording scopes to golden fixtures. The reading was proven mid-flight: I220's
   payload-shape change merged under this branch and the rebase required **zero golden-suite
   edits** — the drift class the condition targets cannot occur.
3. **I221-C2** (seam extractions as flagged commits): **vacuously met** — no extraction was
   needed; the install/write cores (`ensureCardPresentFromLock`, `syncRepository`) were
   already callable. The only refactor commit is test-side fixture sharing, labeled as such.
4. **RED observed before every GREEN**: **met** for all I220 slices and all I221 slices,
   including the review-finding fixes below; each RED run is in the session record.

## Review findings ([I221], all fixed on PR #95)

1. **Empty-closure validation gap** — `validateMaterializePayload` accepted
   `lockfile.cards: []`, which would materialize an empty project silently despite
   `cards[0]` being the contractual entrypoint root. Fixed with a hard reject
   (`f36d55f`), RED observed.
2. **Stale ABOUTME** — the core file's header described implementation progress
   ("derivations now; orchestration follows") rather than the file as it is. Amended
   (`f36d55f`).
3. **Determinism claim unmet** — the G1 contract states "same payload + same flags → same
   bytes", but emitted tars recorded mtimes: probed empirically, identical content produced
   different bytes across a second boundary. Fixed by omitting mtimes in snapshot emission
   (additive `noMtime` through the shared archive helper; existing callers unchanged), with
   a byte-identity regression that re-materializes the same layout across a forced
   whole-second boundary (`74c660c`), RED observed.

## Non-blocking observations

- Deep per-card shape validation (e.g. `treeSha` presence) is deliberately left to the
  downstream cores, which fail loudly at install/emission time; the validation gate owns
  contract identity and byte integrity only. Consistent with the G1 fail-loud posture.
- `worker deploy`'s inline store-export bytes remain mtime-bearing (unchanged surface);
  digests there are computed over whatever bytes ship, so nothing depends on their
  stability. Making deploy emission deterministic is available later via the same option.

## Evidence

- Full pinned suite ([I221] branch, pre-findings head): 1889 pass / 6 skip / 0 fail,
  9559 expects, 321 files. Findings head: materialize family 21/0 + blast-radius
  (archive, archiver, worker-deploy, deploy-governance, deploy-commands) 68/0 across
  12 files; `tsc --noEmit` exit 0.
- [I220] merged after 6/6 CI on `6105662`; [I221] CI on the findings head gates the merge.
- Tracker transactions: both issue threads carry the per-gate entries with evidence links.
