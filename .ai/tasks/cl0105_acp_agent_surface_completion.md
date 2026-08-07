# I105 ACP and Buzz Worker surface — implementation completion evidence

**Status:** Worker implementation passed G3 and merged; Services runtime pin is source-approved but staging-deployment gated

**Evidence date:** 2026-08-06

**Implementation branch:** `remy/I105-acp-adapter-phase-0-3`

**Stable production head before this document:** `882010ddf9bc7619e7b0c524f7e04972b0044b47`

**Worker PR:** [#97](https://github.com/remyjkim/darwinian-worker/pull/97)

**Reviewed Worker head:** `144cab4e69b488889a882c100bc8b565c8e66fc3`

**Worker merge commit:** `6258f5c9cd5c2d8711201aaea837a23699461c26`

**Services runtime-image PR:** [#437](https://github.com/curation-labs/darwinian-services/pull/437) at `dab65c2fbfddbb7900cbd40f61f715cc56b959f9`

**Release or deployment:** Not authorized and not performed; Services PR #437 remains
unmerged because merge automatically deploys staging

## Outcome

I105 now provides a local ACP stdio adapter for deployed Darwinian Workers, with durable
opaque `sess_*` identity, restart/load, multi-turn continuation, device-flow authentication,
current six-state run settlement, and truthful I106 cancellation. A `202 accepted` or
`already_cancelling` response remains nonterminal; ACP returns `stopReason: "cancelled"`
only after the terminal stream event or authoritative `cancelled` status.

The Buzz profile is derived only from the first exact `clientInfo.name = "buzz-acp"`
initialize request. A Buzz-bound turn counts delivery only after a
`buzz_messages_send` or `buzz_messages_thread` call is correlated by `toolCallId` to a
non-error result. If the first yielded turn lacks that proof, the adapter issues one
redacted corrective continuation; a second miss fails visibly without exposing message,
credential, relay, or tool-output content.

The Worker source also provides a narrow `drwn worker buzz-tools` MCP server, a stdin-only
`drwn worker secret set` command, a governed `buzz-tools` Card declaration, a rollout
runbook, and an opt-in real relay E2E. Services PR #437 independently pins the official
Buzz 0.5.5 Linux CLI into each relevant runtime image. No broad `buzz-dev-mcp`, wildcard
selector, policy bypass, secret value, candidate deployment, or live-environment claim is
present.

## Identity boundary

The implemented persisted schema names the current backend execution `activeRunId` and
keeps ACP's `sess_*` identifier opaque. It intentionally does not invent the unimplemented
Darwinian Services Task API. The additive future mapping remains:

```text
ACP sessionId
    ├── taskId       stable product-level work identity
    └── activeRunId  current executable run
```

Streaming, status, cancellation, artifacts, and continuation remain addressed to
`activeRunId`; a later Task layer may span zero or more runs without changing the ACP wire
identity.

## Implementation lineage

The branch was refreshed from Worker `main` and preserves reviewable phases:

1. `baea72c` — merge the then-current Worker main into I105
2. `f532196` — amend the G2 contract against merged I106/I107 and local Buzz evidence
3. `5b2ea37` — harden ACP lifecycle for the current run-state and projection contracts
4. `c120775` — implement truthful ACP cancellation
5. `b193ff6` — enforce Buzz ACP delivery confirmation
6. `eaca0f9` — add the governed Buzz delivery tools, secret command, and Card
7. `426d381` — record the Buzz delivery rollout contract
8. `10afc1b` — prove the real MCP stdio command
9. `5377201` — satisfy the repository-wide detailed-help contract
10. `882010d` — add the credential-gated real Buzz relay delivery proof

Earlier Phase 0–3 commits remain below this refresh and are part of PR #97's complete
history.

## Acceptance matrix

| Contract | Implementation evidence | Executable evidence |
|---|---|---|
| ACP framing and compatibility | SDK-backed NDJSON connection; answer protocol 1 to the recorded Buzz version-2 request; unknown methods receive `-32601`; stdout is protocol-only | SDK spike, connection, and command-surface suites |
| Stable local identity | Opaque `sess_*` maps to persisted `activeRunId`; v1 `runId` rows migrate to v2; store absence is authoritative | Session persistence, restart, pruning, and two-manager race tests |
| Cross-process ownership | Per-session owner locks cover prompt and load; durable state is refreshed after lock acquisition; live peers fail busy | Contention, stale-cache, deletion, LRU, and resurrection regressions |
| Current run lifecycle | `running`, `cancelling`, `yielded`, `cancelled`, `done`, and `failed` are parsed without fallback coercion; status is settlement authority | Session and real-command lifecycle tests |
| Projection fidelity | Projection-v2 cursor is preserved; reasoning, message, tool call, successful result, and failed result map to ACP updates | Project-event and command tests |
| Truthful cancellation | Cancel races admission without the prompt lock; 202 stays live; both typed 409s and 200 terminal acknowledgement are handled; status repairs a missing terminal event | Session cancellation matrix and real `drwn acp serve` command proof |
| Local EOF semantics | Request abort/stdio EOF stops local waits without claiming the remote run stopped | Connection, authentication, and session abort tests |
| Buzz detection | Only the first exact `buzz-acp` initialize latches the profile | Permanent fake-Buzz profile and connection tests against local Buzz `0afeac8a7` evidence |
| Delivery rider | Only correlated non-error send/thread results count; denied, malformed, mismatched, replayed, or unrelated results do not | Buzz profile plus session correction/failure tests |
| Bounded correction | One yielded delivery miss triggers exactly one redacted continuation; a second miss fails; cancellation/failure bypass the rider | Session tests across first-turn, second-turn, cancel, fail, and non-Buzz cases |
| Narrow delivery MCP | Exactly `buzz_messages_send` and `buzz_messages_thread`; argv-only `Bun.spawn`; message body on stdin; UUID/event/byte limits; redacted failure | Unit MCP tests plus real subprocess initialize/list/EOF proof |
| Secret ingestion | Secret bytes come only from noninteractive stdin; one trailing newline is removed; kind/env-var rules fail before fetch; errors never reflect bytes | Secret command tests including reflected-server-error adversary |
| I107 governance | Card server key is exactly `buzz-tools`; selectors are exact; deny remains authoritative; no wildcard, broad server, or bypass | Card/evidence schema tests and merged I107 runtime enforcement |
| Real relay harness | Opt-in test spawns actual `buzz-acp`, starts this repository's adapter, sends a real mention, requires an exact signed channel response, then requires an exact threaded reply | `test/e2e-acp-buzz.test.ts`; skipped unless every real credential/deployment input is explicit |

## Exact source evidence

### Local Buzz protocol and artifact

The local Buzz checkout at `/Users/pureicis/dev/buzz` was inspected read-only at tracked
revision `0afeac8a7c173fd3ede8a22e27919e63161bf07c`; its only working-tree entry was the
pre-existing untracked `.ai/` directory, which was not touched. Source verification proved:

- initialize uses `clientInfo.name = "buzz-acp"` and requests protocol version 2;
- `BUZZ_ACP_AGENT_COMMAND` plus comma-separated `BUZZ_ACP_AGENT_ARGS` launches an ACP agent;
- `buzz messages send` accepts explicit channel, stdin content, optional reply event, and
  explicit mentions;
- channel reads return normalized signed events containing `id`, `pubkey`, `content`, and
  tags.

The official release asset `Buzz_0.5.5_amd64.deb` was downloaded independently from
`desktop-v0.5.5`; its measured SHA-256 is:

`4bd115a5aba836de3ad995ad87d8cb04d02bd0a133c70f64ca2325c653808dcd`

The archive contains `usr/bin/buzz`. The extracted binary is x86-64 Linux and declares only
the ordinary glibc, libm, and libgcc runtime dependencies.

### Services runtime images

Services PR #437 adds the exact version and digest to the local mind-runtime,
mind-runtime cloud, and engine-runtime cloud Dockerfiles. It uses HTTPS/TLS-restricted
`curl`, `sha256sum -c`, `dpkg-deb -x`, installs only `/usr/bin/buzz` as
`/usr/local/bin/buzz`, and removes the downloaded/extracted temporary files.

Source verification before G3:

- Dockerfile pin tests: 6/6 passed.
- Full engine-runtime Node suite: 31/31 passed.
- `pnpm engine-runtime:prebuild`: passed.
- GitHub `Validate studio-deployment`: passed, including validation-only linux/amd64 builds
  of both cloud runtime images with `push: false`.
- PR head is one commit ahead and zero behind current Services `main`; PR is mergeable.

No image was published or deployed by this issue lane. GitHub CI built both cloud images
only for validation and explicitly set `push: false`.

## Worker verification

At reviewed Worker head `144cab4e69b488889a882c100bc8b565c8e66fc3`
(production changes through `882010ddf9bc7619e7b0c524f7e04972b0044b47`, followed by completion evidence):

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | Passed; lockfile unchanged |
| `bun run typecheck` | Passed |
| Focused ACP Phase 4 before Phase 5 | 75 passed, 1 expected live skip, 0 failed |
| Buzz profile/rider focused proof | 59/59 passed |
| Buzz tools/Card/secret focused proof | 30/30 passed |
| Real `drwn worker buzz-tools` subprocess | 1/1 passed |
| Rollout evidence/Card schema | 3/3 passed |
| CLI help regression plus subprocess | 4/4 passed |
| Credential-gated Buzz relay harness | Parsed and typechecked; 1 explicit skip without credentials |
| Full `bun test ./test/` before adding the opt-in relay file | 1,998 passed, 7 skipped, 0 failed; 9,846 assertions across 340 files |
| Final exact-head `bun test ./test/` | 1,998 passed, 8 explicitly gated skips, 0 failed; 9,847 assertions across 341 files |
| Release verifier unique/static gates | All passed using `QUALITY_GATE_TEST_MODE=1`; full tests/typecheck were run separately |
| `git diff --check` | Passed before this document |

The first aggregate run found one real issue: the new `buzz-tools` command lacked the
repository-required `Examples` help section. That failure was fixed under the exact failing
test, then the complete pre-relay suite passed. A separate sandbox attempt failed only when
existing fake BeginningDB tests could not bind localhost; the identical authorized rerun is
the green aggregate reported above.

## Security and privacy review

- No secret value is present in source, tests, PR text, rollout evidence, or this record.
- The secret command accepts values only over stdin and reports generic failures.
- The Buzz command receives content through stdin and is never invoked through a shell.
- Tool-denial and delivery-failure diagnostics omit content, relay output, credentials, and
  MCP result bytes.
- The deployment Card grants only two exact I107 selectors.
- `candidateDeploymentId` remains `null`; no environment inventory was read or inferred.
- The real relay test is opt-in and never prints relay stderr or key material.

## Operational exits deliberately not claimed

The following remain separate, authorized rollout steps and are not evidence for source
completion:

1. publish a Darwinian release satisfying the Card's `harness.minVersion: 1.2.0`;
2. publish candidate runtime images containing both that Darwinian release and pinned Buzz;
3. install only secret metadata through the authenticated control plane;
4. create an immutable candidate deployment and replace `candidateDeploymentId: null` with
   its real ID;
5. prove the I107 governance row is present and contains the exact selectors;
6. run the deployed two-turn/restart and live I106 cancellation gates;
7. run the opt-in real Buzz channel and threaded-reply test;
8. perform the literal Zed launch smoke;
9. obtain separate product-surface and deployment authorization.

Until all applicable rollout gates pass, no live-delivery, deployment, secret-installation,
or product-enablement claim is valid.

## G3 and merge disposition

Completed:

1. Worker PR #97 carried the mandatory `Testing & CI evidence` section and passed all six
   exact-head checks.
2. The explicitly authorized owner-as-reviewer G3 review passed at `144cab4`; no Critical,
   Important, or Minor implementation finding remained.
3. The v0.4 G3 PASS and Owner acknowledgment were recorded as separate tracker transactions.
4. Worker PR #97 merged as `6258f5c9`; the reviewed head is its second parent and is reachable
   from Worker `main`.
5. Services PR #437 passed exact-head source review and its validation-only image builds passed.

Still gated:

1. Services PR #437 cannot merge until staging deployment is explicitly authorized.
2. I105 remains `In Review / G3 Passed` rather than being falsely marked Merged or
   Knowledge-captured while that source PR is open.
3. Release publication, secret installation, candidate deployment selection, live relay proof,
   product enablement, and production rollout remain separate authorization/evidence gates.

Services PR #437 is a separately gated merge despite being source-complete: this repository's
`deploy-staging.yml` runs on every `main` push and classifies `studio-deployment/**` as an
automatic staging deploy. Merging that PR therefore requires explicit staging-deployment
authorization; a CI-skip marker will not be used to evade the boundary.
