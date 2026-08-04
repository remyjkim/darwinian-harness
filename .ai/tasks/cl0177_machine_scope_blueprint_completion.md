# ABOUTME: Completion evidence for the I177 hard cut to machine-scope Worker Blueprint V2.
# ABOUTME: Records immutable releases, isolated acceptance, verification totals, non-goals, and recovery guidance.

# [I177] Machine-Scope Worker Blueprint — Completion Evidence

**Status**: Local completion evidence final; exact-head CI and G3 remain pending external gates and will be recorded in PR #72 and the Issue Tracker.

**Issue**: [I177] · **Owner/Reviewer**: Remy K (owner-as-reviewer per campaign decision D5)

**Branch**: `remy/I177-machine-scope-blueprint` · **PR**: [#72](https://github.com/remyjkim/darwinian-worker/pull/72)

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
plan, documentation-first patch, and recorded RED evidence. Git contains the
complete local history; PR #72 becomes the canonical exact-head review and CI
record after this head is pushed.

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
| Full Bash-driven Bun suite | 1,840 passed, 6 intentionally skipped, 0 failed; 9,205 assertions across 312 files in 457.57s |
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

The final PR head must also pass all required GitHub checks before G3 is
recorded or the branch is merged. PR #72 will be the canonical exact-head CI
record after push; the issue page is the canonical G3 and Owner-acknowledgement
record.

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
