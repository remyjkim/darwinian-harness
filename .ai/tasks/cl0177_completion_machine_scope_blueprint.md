# ABOUTME: Final coworker handoff for the completed I177 machine-scope Worker Blueprint V2 hard cut.
# ABOUTME: Reconciles the approved plan with delivered behavior, immutable releases, verification, and recovery guidance.

# [I177] Machine-Scope Worker Blueprint — Completion Evidence

**Status**: Complete. Implementation, completion handoffs, post-merge CLI CI,
and the corrected production-docs deployment are all merged and green.

**Issue**: [I177] · **Owner/Reviewer**: Remy K (owner-as-reviewer per campaign decision D5)

**Branch**: `remy/I177-machine-scope-blueprint` · **PR**: [#72](https://github.com/remyjkim/darwinian-worker/pull/72)

**Reviewed head**: `6180e8df21eafd3e6f1b0464fe10434188b5068c` · **Merge commit**: `b4817b1d64c76c7f31b06b44a1390cc79f1ce49c`

**Completion follow-up**: [PR #75](https://github.com/remyjkim/darwinian-worker/pull/75)
· **Merge commit**: `1b9a53f8f0f72fd859b83ba847c5f161e027c6d6`
· **Post-merge CLI**: [run 30875268803](https://github.com/remyjkim/darwinian-worker/actions/runs/30875268803)
· **Production docs**: [run 30875268802](https://github.com/remyjkim/darwinian-worker/actions/runs/30875268802)

**CLI release line validated**: `1.1.0` · **Date**: 2026-08-03

## Outcome

I177 replaces the pre-launch V1 machine profile/flat-capability model with one
strict V2 machine Worker Blueprint selection. Runtime capability state now comes
only from the active, immutable, verified closure. Project state remains
isolated. V1 and prototype machine state fail closed with controlled-reset
guidance; there is deliberately no compatibility reader or migration.

The final recommended Blueprint is the independently published
`@curation-labs/machine-defaults` `v2.0.0`. Its immutable closure is:

- `@darwinian/operator` `v2.0.2`;
- `@curation-labs/workflow-skills` `v1.0.1`;
- `@remyjkim/knowledge-docs` `v1.0.0`.

`personal-harness` `v0.1.0` is intentionally absent. Isolated projection found
13 overlapping workflow skill IDs and 12 byte-incompatible definitions between
it and `workflow-skills`; silently choosing precedence would violate the
Blueprint collision contract. Splitting that repository remains the already
declared non-goal.

## Approved plan versus delivered result

The G2 plan remains the design and TDD history. These are the material ways the
final implementation became stricter or more explicit during execution:

| Plan boundary | Delivered result | Why it changed |
|---|---|---|
| Bootstrap `machine-defaults@1.0.0`, then select a release candidate | Published final `machine-defaults@2.0.0` with exactly Operator, workflow-skills, and knowledge-docs | Removing the incompatible fourth member is semver-major; `personal-harness` had 13 overlapping IDs and 12 byte-incompatible definitions |
| Pin the recommended Blueprint root immutably | Pin root and every member by source tag, commit, tree, and Card integrity | Independent audit showed a root pin alone did not prove the complete recommended closure |
| Preflight planned and retained machine paths | Preflight retained **and removed** owned paths; retain ownership when cleanup cannot complete | Prevents drifted stale capabilities from remaining active after their ownership record disappears |
| Select installed or explicit root references | Bare names may select an installed root; any version/range/transport ref re-resolves and replaces an older same-name root | Avoids silently honoring stale installed bytes when the operator asked for an explicit ref |
| Force handles content drift | Force also repairs a recorded managed file replaced by a directory or other non-file | Final review reproduced a raw `EISDIR`; `cf19e47` converts it to controlled drift before any read |
| Disposable manual acceptance | Added a versioned Bash harness that packs `darwinian@1.1.0`, uses Bun `1.2.21`, resolves the exact remote closure, and proves 85 → 0 write idempotence plus clean diagnostics | Makes the release claim reproducible without relying on the developer's real HOME, Store, project, or Card collection |
| Documentation reconciliation and Operator release after implementation | Documentation was patched before runtime work, then reconciled again; Operator `v2.0.2` and machine-defaults `v2.0.0` were tagged after their release-specific validation passed, and the final branch matrix was rerun after subsequent review fixes | Preserves the documentation-first gate while distinguishing release validation from later whole-branch verification |

The core approved decisions did **not** change: strict V2 only, no migration or
dual read, Blueprint-only machine roots, immutable runtime bytes, active-closure
consent, project/machine isolation, and removal of direct machine capability
activation commands.

## Delivered commits

Tasks 2–8 were built as RED/GREEN slices on the I177 branch. Task 9 reconciles
documentation, releases, and completion evidence. The final implementation and
reconciliation tail is:

| Commit | Evidence boundary |
|---|---|
| `4ccf23a` | Register recommended machine-defaults descriptor and release contract |
| `60c6513` | Hard-cut machine configuration to strict V2 |
| `2be1ab8` | Add root-scoped Worker selection and reset semantics |
| `bcd0840` | Derive machine state from the verified active closure |
| `16e0cca` | Project the machine Worker closure with ownership guarantees |
| `e6d43f2` | Add hook/instruction consent carry-forward and replay |
| `47a8e06` | Remove the legacy activation model and finish diagnostics/capture |
| `c9c3fcd` | Preserve projection ownership and add isolated Bash/package acceptance |
| `4b6271d` | Reconcile hard-cut fixtures with the V2 contract |
| `99f2c6a` | Reconcile public, knowledge, and CLI guidance |
| `45d6bc9` | Pin the final Operator and machine-defaults immutable releases |
| `2a9e620` | Pin every recommended closure member by commit, tree, and integrity |
| `527c629` | Fail closed on stale removal drift and retain unresolved ownership |
| `0d51c1c` | Re-resolve explicit machine Worker refs and complete reset guidance |
| `fff2a39` | Reconcile the stale cleanup regression expectation |
| `cabd269` | Pin the packaged acceptance runner to Bun 1.2.21 |
| `cf19e47` | Classify changed-type managed content as force-repairable drift |

Earlier commits on the same branch contain the approved G1 architecture, G2
plan, documentation-first patch, and recorded RED evidence. Git and merged PR
#72 are the canonical implementation, review, and exact-head CI history.

## Immutable release evidence

### Operator `v2.0.2`

- Repository: `curation-labs/darwinian-operator`
- Release PR: [#1](https://github.com/curation-labs/darwinian-operator/pull/1)
- Tag: `v2.0.2`
- Commit: `b62965fde417fa1715d98d5c10fd45012c6cc05b`
- Tree: `7340729d0e4de604e51d4f341b299fa4004788a2`
- Card integrity: `sha256-51503533bd60943e5ba16873f129bd600f42c2553084e29d1770e43a7e858999`
- Parent worker-skills source commit: `e01dc06`
- Compatibility claim: `lastValidatedWith: "1.1.0"`

The release passed sync, identity, local-path, Markdown, skill, Card-source,
contract, and isolated CLI smoke checks before its tag and parent integrity pin
were created. A clean clone resolved the exact tag, commit, and integrity.

### machine-defaults `v2.0.0`

- Repository: `curation-labs/machine-defaults`
- Release PR: [#1](https://github.com/curation-labs/machine-defaults/pull/1)
- Tag: `v2.0.0`
- Commit: `df811c79b8a576e708833ed0f62d34548e522bb0`
- Tree: `0351baee669aca1ecfd74a630895a5389598937e`
- Card integrity: `sha256-6e1db61b9a3005ec4c49fdb17573ee9750f1bc8a1db42cd5606aa33ab49085ac`
- Compatibility claim: `lastValidatedWith: "1.1.0"`

The CLI correctly rejected the invalid four-member bootstrap and a patch bump:
removing/replacing exact Blueprint members is semver-major. No override was
used. The final `v2.0.0` tag was accepted from a clean clone and its exact
three-member closure was re-projected from immutable inputs.

## Verification evidence

All commands ran from the isolated I177 worktree. Manual acceptance additionally
used fresh disposable `HOME`, `AGENTS_DIR`, Store, Card collection, and project
directories; it did not inspect or mutate the operator's real machine state.

```sh
bunx bun@1.2.21 test --timeout 30000 \
  test/release-readiness.test.ts \
  test/scripts-verify-machine-contract.test.ts \
  test/scripts-verify-operator-contract.test.ts
bunx bun@1.2.21 test --timeout 30000 test/docs-readiness.test.ts
bunx bun@1.2.21 run typecheck
bunx bun@1.2.21 test --timeout 30000 ./test/
QUALITY_GATE_TEST_MODE=1 bunx bun@1.2.21 run verify:release
bunx bun@1.2.21 run docs:build
(cd docs-astro && bunx bun@1.2.21 run build)
DRWN_ACCEPT_RECOMMENDED=1 DRWN_ACCEPT_KEEP=1 \
  bash scripts/accept-machine-blueprint-package.sh
git diff --check
```

| Verification | Result |
|---|---|
| Focused machine/Operator/release suites | 29 passed, 0 failed; 62 assertions across 3 files |
| TypeScript typecheck | passed |
| Release readiness (`QUALITY_GATE_TEST_MODE=1`) | all 15 checks passed |
| Full Bash-driven Bun suite | 1,840 passed, 6 intentionally skipped, 0 failed; 9,205 assertions across 312 files in 474.48s at the exact final head |
| Docusaurus production build | passed |
| Astro check/build | passed with 0 diagnostics; duplicate-content-ID loader notices only |
| Documentation readiness | 3 passed, 0 failed; 231 assertions |
| `git diff --check` | passed |
| Operator validation matrix | 4/4 contract plus all source/release checks passed |
| Clean-tag source CLI acceptance | first write 85 changes; second write 0; all doctor issue counts 0 |
| Packed `darwinian@1.1.0` acceptance | exact remote `machine-defaults#v2.0.0` applied; first write 85; second write 0; all doctor issue counts 0 |

The exact-tag acceptance tarball SHA-256 was
`97faa66d7792bd747b5ec1e6775485bf73589a7b48ad7fdbf0d86fe4ed4549ca`.
Its temporary diagnostic sandbox was
`/var/folders/3n/d0fmlfyn56x36j439r_fb3gm0000gn/T/drwn-i177-package.5nQqeX`;
this host-local path is explicitly non-durable and not required for G3. The
versioned acceptance script and the commands/results above are the durable
reproduction evidence.

PR #72 passed all eight exact-head checks before G3 and merge: CLI CI run
`30872515127` plus docs preview run `30872515164`. The ordered Issue Tracker
transactions record G3 Review, G3 Passed with Owner `Received`, and Owner
acknowledgement into `In Review`. Post-merge CLI CI run `30873188326` passed on
merge commit `b4817b1`.

Production docs run `30873188311` built, link-checked, and deployed the I177
merge successfully to Cloudflare Pages, then failed only because its smoke test
still named the nonexistent legacy host `docs.darwiniantools.com`. Follow-up PR
#75 changed the workflow and active public links to the live canonical domain
and added a regression assertion for that boundary. On follow-up merge
`1b9a53f`, CLI run `30875268803` passed all six jobs and production-docs run
`30875268802` passed readiness, build, link check, deployment, and both smoke
targets. `https://docs.darwinian.dev` and deployment
`https://058b3613.darwiniantools-docs.pages.dev` were independently byte-checked
at SHA-256 `ff5a359536726cebddb64702eafae92a889297ec8d975b2fa8a7d74724ad18a8`.

## Contract-specific acceptance

- Strict V2 accepts a Blueprint root and rejects V1/prototype input without
  mutation.
- `policy.authoring` and its bridge are absent; authoring preferences remain in
  `config.json` and inventory-only commands still function.
- Init may pin the published recommended descriptor; declined or non-interactive
  init leaves machine selection empty.
- `use --root`, `apply --root`, `--none`, consent carry-forward, and consent
  replay use the documented exact-root contract.
- Effective skills, MCP, Worker bundle, hooks, and Claude/Codex instructions are
  closure-derived and ownership-aware.
- Hook cleanup preserves retained managed hooks and foreign target settings.
- Sibling disposable homes record stable virtual `.agents/...` ownership paths,
  not environment-specific absolute paths.
- Removed enable/disable commands fail nonzero with replacement guidance while
  inventory add/update/remove/gc remains available.
- Public docs, knowledge docs, CLI help, release contracts, and Operator skills
  use V2 terminology only.

## Remaining non-goals

- V1 migration, dual read, repair, or provenance inference;
- nested Blueprint closure expansion;
- runtime resolution from mutable catalog checkouts;
- credential or installed-tool copying into Cards;
- whole-machine backup/restore;
- Cursor/OpenCode user-instruction adapters or new hook encoders without proven
  target contracts;
- personal-harness repository decomposition and unrelated skill precedence work.

## Reset, rollback, and recovery

There is no V1 downgrade path. For unsupported V1/prototype state, preserve any
required non-secret audit copy of `machine.json` and
`global-write-record.json` outside the Store, deliberately remove the
unsupported files, rerun `drwn init`, and select a V2 Blueprint explicitly.
The strict parser intentionally prevents supported commands from interpreting
or mutating the invalid state.

For a failed or unwanted V2 projection:

1. Run `drwn doctor` from a neutral directory and preserve its evidence.
2. Use `drwn use --root --none` to clear a valid V2 selection and remove owned
   machine projection while retaining installed roots, inventory, and foreign
   target bytes.
3. Re-select an earlier immutable Blueprint tag or exact digest if rollback is
   required; never retarget an existing release tag.
4. Use `--force` only after reviewing reported drift. Ownership records prevent
   cleanup from deleting foreign or independently retained content.

Repository rollback means reverting the parent descriptor/gitlink commit and
publishing a new immutable Card version if release content must change. The
published `v2.0.2` and `v2.0.0` tags must remain immutable.
