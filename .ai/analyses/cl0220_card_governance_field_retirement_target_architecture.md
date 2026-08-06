# ABOUTME: G1 target architecture for [I220]: retire permissions and escalation from the Card manifest, and give drwn status an honest declared-vs-enforced governance section.
# ABOUTME: Grounded in a full touchpoint census; the retirement is publish-strict and consume-tolerant, so no migration machinery is needed.

# [I220] Card Governance Field Retirement + Declared-vs-Enforced Status — Target Architecture

**Issue:** [I220] `[I220, DW] Retire permissions and escalation from the Card manifest; declared-vs-enforced governance in status`.
**Status:** G1 proposal. The scope was ratified on [I107] (2026-08-05): `permissions` and
`escalation` retire; `tools.allow`/`tools.deny` gain real runtime meaning via DS's
tool-grain `CARD_TOOL_POLICY`; `drwn status` must stop letting declared governance read as
active.
**Repo:** darwinian-worker; one coordination touchpoint with darwinian-services (§6).

## 1. The Gap, Evidenced

`permissions` and `escalation` are manifest fields with **no defined shape and no consumer
anywhere**. The complete census (2026-08-05):

- **CLI touchpoints — exactly two files.** `cli/core/card-manifest.ts` (type at `:38`/`:40`,
  blueprint-only listing `:128`, shape-only validation `:146-157`) and
  `cli/core/worker-deploy.ts` (optional passthrough into `WorkerDeployGovernance`,
  `:40`/`:42`/`:133`/`:135`). Nothing reads them back, ever.
- **Runtime consumers — none.** DS-confirmed (review01): stored into
  `deployment_members`, read by nothing in the deployed runtime.
- **Cards in the wild — zero.** No card in the `~/dev/darwinian-cards` collection declares
  either field. Blast radius of removal: nil.
- **Catalog schema — absent.** `drwn-catalog-schema` carries neither field.
- **Status/doctor — no governance display exists today** (verified by sweep), so the
  declared-vs-enforced work is net-new surface, not a correction of an existing lie.

The danger was never the fields' absence of function — it was their *appearance* of
function: an operator writing `escalation.humanOwner` reasonably believes something
escalates. I107's ratification ends that class.

## 2. Retirement Semantics — Options

**O1 — Publish-strict, consume-tolerant removal (recommended).**
Remove the fields from the `CardManifest` type and their shape validators; add an explicit
**publish-path rejection** ("`permissions` was retired (I220); remove it from card.json")
so new publishes cannot reintroduce them; leave consume/install untouched. This works with
zero migration machinery because `validateCardManifest` is **field-by-field with no
unknown-keys allowlist** (verified) — already-published immutable cards carrying the fields
keep validating everywhere, the fields simply become inert bytes with no type-level
existence.
*Pros:* authoring fails loud (the correct place), history stays installable, no
`harness.minVersion` bump required, no store rewrite, no catalog change.
*Cons:* old card.json content still displays the fields to a human reader — acceptable;
immutable history is immutable.

**O2 — Deprecation cycle (warn N releases, then remove).**
*Pros:* gentler for external authors. *Cons:* there is nothing to deprecate — zero wild
usage; it prolongs exactly the governance theater the parent issue exists to end; against
the repo's clean-slate release culture.

**O3 — Keep as reserved fields.** Rejected outright: reserved-but-inert *is* the
dangerous-appearance problem.

**Decision recommendation: O1.**

## 3. Deploy Payload Handling

`WorkerDeployGovernance` keeps `permissions?`/`escalation?` as **optional** members of the
V1-frozen payload contract — DW simply **stops populating them** (delete the two spreads at
`worker-deploy.ts:133`/`:135`). No `contractVersion` change, no coordination requirement:
optional-absent is valid today. DS drops the dead `deployment_members` columns on their own
schedule (their ratified side); the orders are independent.

Out of ratified scope, recorded so it is a decision and not an oversight: `evals`,
`contextMounts`, and `identity` sit in the same optional-unknown class in both the manifest
and the payload. They are untouched here; whether they follow is an open question for a
future row (each needs its own consumer-census before retirement).

## 4. Declared-vs-Enforced Status — Target Design

New `governance` section in deployed-Worker status output (`drwn worker status`, and the
project `drwn status --explain` where a deployed binding exists), built on the existing
declared-vs-ambient vocabulary (`cli/core/ambient-policy.ts`, `effective-state.ts`):

```text
Governance (deployed):
  tools.allow: 3 rules   declared — not enforced by the deployed runtime
  tools.deny:  1 rule    declared — not enforced by the deployed runtime
```

- **Phase 1 (ships with this issue): statically honest.** The enforcement column is a
  hard-coded truthful statement — today *nothing* enforces Card `tools.*` for interactive
  runs (I107-verified). No detection logic, no false positives possible.
- **Phase 2 (when DS ships `CARD_TOOL_POLICY`): capability-flagged.** The enforcement
  column flips per-deployment only on a positive signal from the Deploy API. Options for
  that signal, decided *then* with DS, in preference order: (a) the deployment record
  exposes an active `policyHash` (matches I107's own audit criterion — the natural
  carrier); (b) a runtime capability field on the deployment status response. The status
  code reads the signal; absence of signal always renders "not enforced". Fail-honest by
  construction.

Not in scope: any enforcement itself (DS), any change to local-target projection (local
targets never enforced and never claimed to).

## 5. Test Intent (G1)

| Claim | Evidence that proves it |
| --- | --- |
| New publishes reject the retired fields | RED-first validator test: card.json with `permissions` → publish fails naming I220; without → passes |
| History keeps installing | Fixture card published *with* the fields (pre-change bytes) installs + resolves clean via the tolerant path |
| Payload stops carrying them | `buildWorkerDeployPayload` unit: governance omits both fields even when a legacy manifest supplies them |
| Status never overstates | Output-contract test: deployed-worker status with `tools.*` declared renders the declared count and the literal not-enforced state; no input can render "enforced" before the Phase-2 signal exists |
| Nothing else regressed | Full suite ≥ baseline, 0 fail |

## 6. Sequencing and Coordination

1. DW lands O1 + §3 + §4-Phase-1 in one release (this issue's G3). Independent of DS.
2. DS drops the dead columns whenever (independent; fields already optional-absent).
3. §4-Phase-2 activates when `CARD_TOOL_POLICY` ships — one small DW follow-up consuming
   the agreed signal; tracked as an acceptance item on I107, not a new row.

## 7. Risks

| Risk | L | Mitigation |
| --- | --- | --- |
| An external author depends on the fields | L | zero wild usage; publish error names the issue and the removal rationale |
| Status honesty drifts when DS ships enforcement | M | Phase-2 flip requires a positive signal; absence renders not-enforced — the failure mode is understatement, never overstatement |
| Scope creep into evals/contextMounts/identity | L | explicitly out of scope (§3); own census required first |
