# ABOUTME: Final coworker handoff for the completed I176 path-addressable Card source reform.
# ABOUTME: Reconciles the approved plan with delivered CLI behavior, migration boundaries, releases, and verification.

# [I176] Card Source Path Reform — Completion Handoff

**Status**: Merged, post-merge CI green, and superseded only where I177 later
replaced the machine-profile release surface.

**Issue**: [I176] · **PR**: [#71](https://github.com/remyjkim/darwinian-worker/pull/71)

**Reviewed head**: `91d99a3cf1c89537e40217b4798fe296d00ad414`
· **Merge commit**: `1fc03e6910a8e2a391a9dd4d53a2ec9513d27c1d`

**Post-merge CI**: [run 30848589215](https://github.com/remyjkim/darwinian-worker/actions/runs/30848589215)
· **Completed**: 2026-08-03

## Outcome

I176 removed runtime dependence on `~/.agents/drwn/sources/`. Editable Card and
Worker Blueprint sources are now ordinary user-controlled directories, usually
independent Git repositories under a collection such as
`~/dev/darwinian-cards/cards/`. The machine Store keeps immutable publications
and operational state; it is no longer an authoring workspace.

The supported source-input model is:

- explicit relative, absolute, `~`, `file:`, or `file://` paths;
- or a unique manifest-name match beneath configured collection checkouts;
- with `card.json.name` authoritative for identity;
- and zero mutation when lookup is missing, malformed, or ambiguous.

The principal user flows are now path-first:

```sh
drwn card new @team/reviewer --into ~/dev/darwinian-cards/cards
drwn card source doctor ~/dev/darwinian-cards/cards/reviewer
drwn card publish --from ~/dev/darwinian-cards/cards/reviewer
drwn config set catalogCheckouts '["~/dev/darwinian-cards"]'
drwn card publish @team/reviewer
```

## Approved plan versus delivered result

| Approved-plan boundary | Delivered result | Difference or clarification |
|---|---|---|
| One asynchronous resolver for explicit paths and configured collection lookup | Delivered in `card-source-input.ts` and reused across existing-source Card, Worker, release, and checkpoint commands; capture/defaults flows instead write to explicit `--into` destinations | Manifest validation and name-mismatch errors were centralized for commands that resolve an existing source, while source-creation destinations remain a separate contract |
| Strict `drwn.user-preferences` V1 separate from machine policy | Delivered with `catalogCheckouts` and `defaultAuthorScope` plus ordered, idempotent legacy author-scope migration | I177 subsequently removed the last machine `policy.authoring` compatibility bridge as part of the machine V2 hard cut |
| Convert authoring and publication commands to path-addressed sources | Delivered for Card/Worker new, mutate, compose, publish, release, fork, capture, defaults, and Mind checkpoint | The final CLI hardening made optional positional names subordinate to `card.json.name` and tightened missing/ambiguous guidance |
| Convert all source commands | Path/name commands were converted; `card source list` was deliberately deprecated and exits nonzero; `doctor` requires an input | A global source registry would recreate the retired abstraction, so list became read-only migration guidance rather than a new catalog scan |
| Eliminate Store source creation and discovery | Production `resolveSourcesRoot` / `resolveCardSourceDir` use was removed; normal initialization and commands do not create `drwn/sources` | `store-seed` and diagnostics retain only narrow legacy detection so old data can be reported safely |
| Inventory and migrate legacy sources without risking operator data | Delivered read-only classification for canonical, unresolved, ambiguous, and invalid legacy sources | No real `~/.agents/drwn/sources/` content was moved or deleted. Cleanup remains a separately authorized operation after re-inventory |
| Update the canonical Operator authoring workflow | Released and pinned `@darwinian/operator@2.0.1`; exact `2.0.0` pins remained accepted for upgrade compatibility | Final verification rejected a submodule-only pointer change and required an independent immutable Card release instead |
| Run the planned vertical TDD and full release matrix | Delivered 1,808 passing tests and all required PR/post-merge CI jobs | Phase 0 also fixed an inherited `sync-mcp.ts` defect so explicit `repoRoot` controls project discovery before I176 behavior was built |

The plan's safety boundary did not change: this was a breaking pre-launch CLI
reform, but never authority to delete the operator's legacy source data.

## Delivery map

| Commit | Delivered boundary |
|---|---|
| `c31afd4` | Bind legacy sync/project discovery to the explicit repository root |
| `d864e91` | Add strict user authoring preferences and migration ordering |
| `4f5470e` | Add the unified path/catalog source resolver |
| `1cfc1f1` | Expose `drwn config` authoring preferences |
| `0f2b655` | Convert core source APIs to explicit directories |
| `5438151` | Publish from explicit source paths with manifest authority |
| `85c5618` | Move Card and Worker authoring commands to source paths |
| `e3cef79` | Remove Store source discovery from production flows |
| `9471e29` | Add non-destructive legacy source inventory |
| `177f9e3`, `9cc0c1c`, `9fcf2b3` | Move fixtures and user journeys to collection repositories |
| `189c265` | Finish the hard cut in remaining source APIs |
| `11b1658` | Reconcile public and knowledge documentation |
| `ce6fc73` | Harden CLI grammar and failure guidance |
| `40db4ae`, `91d99a3` | Pin Operator `2.0.1` and retain exact `2.0.0` compatibility |

The full commit and review history is PR #71. Merge commit `1fc03e6` became the
required base for I177.

## Immutable Operator evidence at I176 completion

- Tag: `v2.0.1`
- Commit: `33e3aa7a4cc37bbc462efad8aa50400d940ab0d5`
- Tree: `c9623c0bc4998c625cc9fefa0ed4fc929e71f0d9`
- Card integrity: `sha256-e29b7f089df854e8f7f186778fa83de15717712fd710902d642114327b52f380`

I177 later published Operator `v2.0.2` for the machine Worker Blueprint V2
contract. Coworkers should use the I177 completion handoff for current machine
defaults, while this document remains authoritative for the Card source-path
reform itself.

## Verification evidence

All local commands used Bun `1.2.21` and isolated fixtures or disposable
stores. No manual probe used the operator's real machine Store.

```sh
git submodule update --init darwinian-worker-skills
bunx bun@1.2.21 install --frozen-lockfile
bunx bun@1.2.21 run typecheck
bunx bun@1.2.21 run verify:release
bunx bun@1.2.21 test --timeout 30000 ./test/
bunx bun@1.2.21 test drwn-command-bridge/test
```

| Verification | Result |
|---|---|
| TypeScript typecheck | passed |
| Release readiness | passed, including package, Worker, Mind, machine, Operator, inventory, ambient MCP, schema, and Store-security gates |
| Full suite | 1,808 passed, 6 intentionally skipped, 0 failed; 8,340 assertions across 306 files |
| Focused I176 regression set | 54 passed, 0 failed |
| Command bridge | 94 passed, 0 failed |
| Disposable-store acceptance | explicit-path publish, path doctor, configured-name publish, and no `drwn/sources` recreation all passed |
| Exact-head PR CI | all six required jobs passed in run `30842300601` |
| Post-merge CI | all six required jobs passed in run `30848589215` on `1fc03e6` |
| Independent code review | no remaining Critical or Important finding |

## Coworker guidance

- Treat `~/dev/darwinian-cards` as a collection checkout and each
  immediate `cards/*` directory as its own source repository.
- Pass a path when correctness matters. Bare names require exactly one match in
  configured `catalogCheckouts`.
- Do not restore `~/.agents/drwn/sources/` as an authoring registry or make the
  Store depend on mutable source repositories.
- Preserve unresolved legacy source data. Re-inventory it before proposing any
  cleanup and request explicit confirmation for the exact deletion target.
- Project `sourceOverrides` remain the first Mind-checkpoint lookup; collection
  checkouts are the fallback, not a replacement for project intent.

## Residual boundaries

- No automatic cleanup of real legacy source data was delivered or authorized.
- `drwn-lab` documentation existed locally at I176 closure but its parent
  repository boundary was unresolved; later work must verify the current
  canonical repository before claiming those local bytes are published.
- I177 intentionally changed the machine configuration and Operator release
  surface after I176; it did not reverse the path-addressable source model.

## Rollback

Repository rollback means reverting the I176 merge, not recreating a mutable
Store authoring directory. Any Card source already living in an independent
repository remains user data and must not be deleted as part of CLI rollback.
Published Card tags remain immutable; corrections require a new release.
