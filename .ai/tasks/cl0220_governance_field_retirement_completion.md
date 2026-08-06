# ABOUTME: Completion evidence for [I220]: permissions/escalation retired from the Card manifest
# ABOUTME: with consume tolerance for published history and declared-vs-enforced governance in status.

# [I220] Card Governance Field Retirement — Completion Evidence

**Status**: Complete. Implementation merged, full suite and CI green, tracker closed out.

**Issue**: [I220] · **Owner/Reviewer**: Remy (owner-as-reviewer, session grant on the issue thread)

**Branch**: `remy/I220-governance-retirement` · **PR**: [#94](https://github.com/remyjkim/darwinian-worker/pull/94)

**Merge commit**: `ea8e7f0` · **Docs (G1/G2/review01)**: [#93](https://github.com/remyjkim/darwinian-worker/pull/93) (`38b8a32`) · **G3 review record**: `cl0220_cl0221_review02_g3_implementation.md` · **Date**: 2026-08-06

## Outcome

`permissions` and `escalation` are retired from the Card manifest under the
publish-strict / consume-tolerant contract ratified via [I107]:

- **Authoring gateways reject** both fields with an error naming [I220]
  (`card-source-input`, `card-source`); the shared manifest validator stays
  tolerant because `card-lock.ts` validates published history's manifests —
  in-validator rejection would have broken installs of every legacy lock.
- **The deploy payload omits both fields** even when a legacy manifest carries
  them (`governanceFromEntry`); the V1 payload shape is unchanged (fields were
  optional by contract).
- **`drwn worker status` renders `Governance (deployed)`** with declared rule
  counts and the literal "declared — not enforced by the deployed runtime"
  statement; display-only, failure-proof, and no input renders "enforced" until
  DS ships tool-grain `CARD_TOOL_POLICY` ([I107] proper).

## Verification

- Four slices, RED observed before every GREEN; the slice-2 tolerance test
  caught slice 1's in-validator placement (the exact defect condition I220-C1
  targeted) before it could ship.
- Six pre-existing tests amended to the ratified contract, none deleted; golden
  deploy-contract JSON regenerated (treeSha/integrity moved because
  content-addressing saw the manifest bytes change — the retirement observed
  end to end).
- Full pinned suite at the reviewed head: 1877 pass / 6 skip / 0 fail. CI 6/6
  green at `6105662`; merged as `ea8e7f0`.

## Follow-ups

- DS drops the dead `deployment_members` columns alongside their
  `CARD_TOOL_POLICY` landing (their side of the [I107] ratification).
- The `Governance (deployed)` section flips to capability-flagged enforcement
  display when DS ships tool-grain policy — additive, no contract change.
