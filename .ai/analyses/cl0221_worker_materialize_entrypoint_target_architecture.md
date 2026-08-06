# ABOUTME: G1 target architecture for [I221]: drwn worker materialize --payload, the first-class CLI entrypoint that owns the V1-deploy-payload → V2-project translation.
# ABOUTME: Retires deploy-api's hand-rolled bridge; contract seeded from the four transforms verified single-shot against the real payload on 2026-08-05.

# [I221] `drwn worker materialize` — Target Architecture

**Issue:** [I221] `[I221, DW] drwn worker materialize --payload — first-class V1-payload materialize entrypoint`.
**Status:** G1 proposal. Born from the [I204] bridge campaign; DS's adoption commitment is
on record ("I'll adopt it in deploy-api the moment it ships, and happy to be the first
consumer / review the payload contract").
**Consumers:** deploy-api's DeployRunner container (primary); the local replica/test
harness (secondary).

## 1. The Gap, Evidenced

The deploy payload (`WorkerDeployPayload`, `contractVersion: 1`, intentionally frozen —
v2 contract invariant 13) is produced by the CLI but consumed by **hand-written deploy-api
code** that re-implements the CLI's own semantics: V2 config derivation, lock wrapping with
container-absolute card paths, store seeding, snapshot shaping. That bridge broke at every
V2 hard cut — the removed `store` commands, the V1 config shape, the lock shape, the path
rewrite, the disposable-generated-state contract — costing a multi-wall production
debugging campaign (full trail: `darwinian-services/.ai/analyses/
cl0106_addendum01_staging_runtime_bump_request.md` §7–§8 and
`cl0204_acp_live_lane_completion_handoff.md`). Every future V2 evolution re-exposes the
same class of break, because the translation's owner is not the translation's author.

The fix is structural: **the CLI owns the payload→project translation as supported,
versioned public surface.** The frozen payload stays frozen; the consumer becomes ours.

## 2. Command Contract

```bash
drwn worker materialize \
  --payload <payload.json> \
  [--store-export <store.tar>] \      # external store bytes; else payload.storeExport.bytesBase64
  --project-root <dir> \              # the project to stage + materialize (created if absent)
  [--agents-dir <dir>] \              # store root; default: resolved AGENTS_DIR/HOME behavior
  [--emit-store-tar <path>] \         # snapshot outputs for the caller's boot contract
  [--emit-project-tar <path>] \       # minimal shape: drwn/config.json + drwn/card.lock only
  [--json]
```

Behavior, in order (all internal — no shelling out to other drwn commands):

1. **Validate** `contractVersion === 1` (hard reject otherwise — forward payloads get a new
   flag or version, never silent tolerance), `materialization === "lockfile-store-export"`,
   and the storeExport `sha256`/`byteLength` against the supplied bytes.
2. **T3 — seed the store**: extract the store archive into `--agents-dir` (the archive *is*
   the V2 store layout: `drwn/store.json` + bare repos + extracted trees).
3. **T1 — derive the V2 project config** from `payload.entrypoint`
   (`workers: [requested]`, `activeWorker: name`); the legacy `payload.config` field is
   ignored by design.
4. **T2 — derive the V2 lock**: wrap `payload.lockfile` into `drwn.project-lock` shape
   (`workerRoots` from the entrypoint + member order; card `path` rewritten
   **relative to the target `--agents-dir`** — the portability lesson: absolute paths baked
   for one container broke the next).
5. **Materialize**: run the install-`--frozen` and `write` cores directly (the command
   imports the same cores `cli/commands/install.ts` composes — `ensureCardPresentFromLock`,
   `mutateProjectState`, the sync/write pipeline), against the staged project.
6. **Emit snapshots** if requested: `--emit-project-tar` produces the **minimal** shape
   (config + lock only — generated output is disposable by V2 invariant 8; shipping write
   records without their files was the reproduced restore-breaker);
   `--emit-store-tar` re-archives the store (content-identical under `--frozen`).
7. `--json` reports a machine-readable result (staged paths, card count, skill count,
   emitted artifacts + digests) for the DeployRunner to log.

Determinism: same payload + same flags → same bytes (the org-worker materialization plan's
pure-change-plan precedent, `org-worker-materialization-plan.ts`, is the internal pattern —
plan first, then apply).

## 3. Options Considered

**O1 — Full materialize command (recommended, as specified above).** One invocation owns
validate→stage→install→write→emit. *Pros:* deploy-api's container script collapses to one
line; every future V2 semantic change ships inside the CLI that caused it; the local test
harness and production run identical code. *Cons:* the command composes install/write
cores — those must be callable without Clipanion context (they are; the command layer
already imports them as functions).

**O2 — Stage-only command** (transforms + store seed; deploy-api keeps running
`install --frozen && drwn write` itself). *Pros:* smaller surface. *Cons:* leaves the
sequencing and env contract (AGENTS_DIR/HOME discipline) in deploy-api's bash — the exact
place two of the campaign's walls lived; splits ownership of one invariant.

**O3 — Library export, no command.** Rejected: the consumer is a bash step inside a
container image; a TS API is unreachable from there without inventing a runner — which is
this command.

**Input-bytes options** (orthogonal, both supported by design): inline
`payload.storeExport.bytesBase64` (today's frozen contract) **and** `--store-export <file>`
taking precedence. The external-file path is deliberate convergence with DS's queued
R2-staging fix for the 1 MiB `DEPLOY_WF.create` limit — when deploy-api starts staging the
archive in R2, the container downloads it and hands the file over; the payload JSON goes
lean with **no contract change on our side**.

**Boot-side restore** is out of scope for v1: with the minimal project.tar shape, restore
is `tar -x` + this command's step 5 — if DS later wants `drwn worker materialize --restore`
sugar, it is an additive flag over the same cores, not a new design.

## 4. Public-Surface Governance (per `.ai/rules/07_sdk_export_governance.md`)

- **Owner:** Remy (darwinian-worker) · maintained with the ACP/deploy lane.
- **Tier:** public CLI command consumed by production infrastructure — treat as Tier 1:
  breaking changes require a deprecation path and DS sign-off.
- **Intended consumers:** deploy-api DeployRunner (primary, committed); DW test harnesses.
- **Test obligations:** §5. **Documentation:** command reference + a deploy-pipeline page
  showing the one-line container usage. **Deprecation path:** replaces deploy-api's inline
  T1–T4 bridge; DS removes their implementation on adoption (their stated intent), after
  which the bridge code is deleted, not kept as fallback.

## 5. Test Intent (G1)

| Claim | Evidence |
| --- | --- |
| The four transforms are correct | Golden-payload fixtures built by `buildWorkerDeployPayload` from a real multi-card lock (the campaign's replica harness, promoted into `test/`); RED-first unit tests per transform |
| End-to-end materialize works | Command test: payload in → staged project resolves all cards, `write` projects, exit 0 — single-shot on a clean root (the first-run discipline the campaign taught) |
| Path portability holds | Same payload materialized into two different `--agents-dir` roots both succeed (kills the absolute-path class) |
| Contract discipline | `contractVersion: 2` payload → hard reject naming the version; corrupted `sha256` → reject before any filesystem effect |
| Snapshot shape stays minimal | `--emit-project-tar` contains exactly `drwn/config.json` + `drwn/card.lock`; a restore replica from those two files + the store tar materializes clean (the reproduced-breaker regression test) |
| External bytes path | `--store-export` file takes precedence over inline base64; byte-identical results |
| Nothing regressed | Full suite ≥ baseline, 0 fail |

## 6. Sequencing

1. G2 plan → build (this repo, behind the ACP phases unless reprioritized).
2. Ship in a `darwinian` release; DS bumps the image pin (the pin test now guards it) and
   swaps DeployRunner's script for the one-line invocation — coordinated with their
   R2-staging change if timing aligns.
3. DS deletes the inline bridge; the deploy pipeline's V1↔V2 seam is closed permanently.

## 7. Risks

| Risk | L | Mitigation |
| --- | --- | --- |
| Install/write cores prove Clipanion-coupled | L | install.ts already composes them as imported functions; §2's design uses the same seams — verified by imports census |
| Payload contract evolves (R2 era) | M | inline + external-file inputs both supported from v1; contractVersion hard-gate keeps evolution loud |
| Version skew (image CLI older than payload builder) | M | the command validates and names its own version in `--json` output; the existing `dockerfile-cli-pin` test on the DS side guards the pin |
