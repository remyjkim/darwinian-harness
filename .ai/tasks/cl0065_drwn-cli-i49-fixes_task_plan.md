# ABOUTME: Task plan (GATE 2) for I65 — how we fix the drwn CLI bugs/DX gaps surfaced by I49.
# ABOUTME: Carries the implementation approach per fix plus the executable Testing strategy (TDD contract).

# I65 — drwn CLI bug fixes from I49 · Task Plan

**Status**: Planning (GATE 1 in review · this is the GATE 2 artifact) — v2, 2026-07-22 (Fix 5 → I80; Fix 4 UX decided)
**Created**: 2026-07-21
**Issue**: #65 · Owner: JGB · Reviewer: Remy · Turn: JGB
**References**: [analyses/cl0065_drwn-cli-i49-fixes_target_architecture.md, cli/commands/auth/logout.ts, cli/core/machine-config.ts, cli/core/worker-http.ts, cli/commands/worker/chat.ts, cli/core/auth/jwt.ts, cli/core/git.ts, cli/core/worker-config.ts]

---

## Objective / target state

The five CLI defects/DX gaps from I49 in I65's scope are fixed in the `darwinian` CLI, each with tests, so that: logout always clears local creds, a legacy `machine.json` no longer bricks the CLI, auth/token errors read as auth (not connectivity), a chat reply is readable in the terminal (and one click away in the web app), and the git-ref error is clean. (Defaults/env docs/per-hub creds — ex-Fix 5 — live in **I80**.)

**Buildable now (4):** Fix 1 logout · Fix 2 machine.json · Fix 3 error helper · Fix 6 git-ref.
**Pending Remy (1):** Fix 4 chat — **UX decided** (chat waits/streams + prints the studio web-app run URL; plus `drwn worker run status <runId>`); implementation needs the run-read/stream endpoint shape + the web-app URL path.

## Success criteria

- [ ] `drwn logout` removes `credentials.json` + keychain key even when the DAH revoke fails; exits 0.
- [ ] A recognized legacy `machine.json` is migrated to valid v1 on read (no command aborts); error hints name a **real** command.
- [ ] Auth/expired-token failures no longer print "Cannot reach Deploy API"; genuine network failures still do.
- [ ] `drwn worker chat` prints the studio web-app run URL immediately, then waits/streams and prints the mind's reply; `--json` keeps machine output; timeout still leaves the user with the URL.
- [ ] `drwn worker run status <runId>` reports queued/running/done/failed and prints the result when done.
- [ ] Git ref-not-found prints a clean "ref/tag not found" message (no raw git `--` advice).
- [ ] Full `bun test` green; new tests cover each behavior above.

---

## How we fix each issue

### Fix 1 — logout best-effort revoke (P1) · `cli/commands/auth/logout.ts`

**Change:** move `deleteCredentials()` *out* of the revoke `try/catch`. Attempt revoke best-effort (v2 creds only); on failure warn and continue; **always** delete local creds.

```ts
async execute() {
  const credentialsPath = resolveCredentialsPath(this.context.agentsDir);
  const creds = await readCredentials(credentialsPath);
  if (!creds) { this.context.stdout.write("Not logged in.\n"); return 0; }

  const deps = LogoutCommand.testDeps ?? {};
  if ("version" in creds) {                       // v2 creds carry a refresh token
    try {
      await revokeToken(drwnCliProfile(deps.env ?? process.env), creds.refreshToken, deps.fetch ?? fetch);
    } catch (error) {
      this.context.stderr.write(
        `Warning: remote token revoke failed (${error instanceof Error ? error.message : String(error)}); ` +
        `removing local credentials anyway.\n`,
      );
    }
  }
  await deleteCredentials(credentialsPath);        // authoritative — always runs
  this.context.stdout.write("Logged out. Credentials removed.\n");
  return 0;
}
```
**Options considered:** (A) best-effort revoke then always delete *(chosen — matches file's stated "local deletion is authoritative" intent)*; (B) add `--force`/`--local-only` flag *(rejected — logout should already be local-authoritative; a flag pushes the bug onto users)*.

### Fix 2 — legacy `machine.json` migration + correct hint (P1) · `cli/core/machine-config.ts`

**Change A (hint, 1 line):** `invalidMachineConfig` at `:92` — replace `rerun drwn setup` with `rerun \`drwn init\``.

**Change B (migration):** detect the legacy shape (`{ version, optional, authoring }`, i.e. no `schema` key) in `readMachineConfigFile`, map to a valid v1 config (carry `authoring.scope` → `policy.authoring.scope`), re-persist, return.

```ts
function isLegacyMachineConfig(value: unknown): value is { authoring?: { scope?: string } } {
  return typeof value === "object" && value !== null
    && (value as Record<string, unknown>).schema === undefined
    && "version" in (value as object);            // prototype marker
}
function migrateLegacyMachineConfig(legacy: { authoring?: { scope?: string } }): MachineConfig {
  const config = createEmptyMachineConfig();
  const scope = legacy.authoring?.scope;
  if (scope) config.policy.authoring = { scope };
  return config;
}
// in readMachineConfigFile, after JSON.parse:
const raw = JSON.parse(await readFile(path, "utf8"));
if (isLegacyMachineConfig(raw)) {
  const migrated = migrateLegacyMachineConfig(raw);
  await writeMachineConfigFile(path, migrated);   // persist v1 in place
  return migrated;
}
return parseMachineConfig(raw, path);
```
**Options considered:** (A) migrate-on-read *(chosen — seamless; no user action; unblocks every reader incl. deploy)*; (B) explicit `drwn init --migrate`/repair command *(rejected as the primary path — still bricks existing commands until the user knows to run it; keep the corrected hint as the fallback for truly-unknown shapes)*.
**Risk note:** migration writes the file on read — must stay inside the existing `writeMachineConfigFile` validation; corrupt/unknown non-legacy shapes still throw (with the fixed hint).

### Fix 3 — classify auth vs connectivity (P2) · new `cli/core/worker-error.ts` + `worker-http.ts` + 8 command sites

**Change A:** replace the plain `Error` at `worker-http.ts:33` with a typed `NotAuthenticatedError` (new, in `worker-http.ts` or `core/errors.ts`) so classification isn't string-matching.

**Change B:** shared presenter, reused by all worker commands:
```ts
// cli/core/worker-error.ts
import { JwtAudienceError } from "./auth/jwt";
import { NotAuthenticatedError } from "./worker-http";
export function describeWorkerError(error: unknown, apiBaseUrl: string): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (error instanceof NotAuthenticatedError || error instanceof JwtAudienceError) {
    return msg;                                    // auth/token → surface as-is, no connectivity prefix
  }
  return `Cannot reach Deploy API at ${apiBaseUrl}: ${msg}`;
}
```
**Change C:** in each of the 8 sites (`chat.ts:60`, `deploy.ts:138`, `rollback.ts:47`, `list.ts:48`, `deployments.ts:50`, `status.ts:51,71`, `delete.ts:47`) replace the inline template with `describeWorkerError(error, apiBaseUrl)`.
**Options considered:** (A) typed errors + `instanceof` classifier *(chosen — robust)*; (B) message-substring matching in the helper *(rejected — brittle to message edits; but acceptable as a secondary heuristic for `fetch` network `TypeError`s that carry no type)*.

### Fix 6 — clean git-ref-not-found message (P2) · `cli/core/git.ts`

**Change:** in `classifyGitFailure` the `GIT_REF_NOT_FOUND` branch (`:556-557`) currently returns `${message}: ${stderr}` — dumping raw git plumbing (the `Use '--' to separate paths…` advice). Produce a concise message and drop the raw stderr for this class; keep full stderr in the error `context` for debug. (The I49 `forv9.9.9` missing-space report does not reproduce at HEAD — templates at `git.ts:128/:269` have always carried the space; the red test locks the exact expected format regardless.)
```ts
if (/unknown revision|bad revision|not a valid object name|ambiguous argument|couldn't find remote ref|not found/i.test(stderr)) {
  return new GitRefNotFoundError("GIT_REF_NOT_FOUND", message, context); // clean; stderr stays in context
}
```

### Fix 4 — read a chat run (P2, feature) · `cli/commands/worker/chat.ts` + new `cli/commands/worker/run-status.ts` + `cli/core/worker-run.ts`

**UX decided (Owner, 2026-07-22):** A + B + web link. **Endpoint contract grounded from source** (2026-07-22, `studio-deployment` `workers/deploy-api/src/chat-proxy.ts` + `workers/engine/src/worker.ts` + `containerized-cli-harness/packages/coordination`), removing the Remy dependency:

- `POST /api/minds/:slug/chat` `{message}` → `{runId}` (unchanged).
- `GET /api/chat/:runId/poll?since=N` (runId-addressed, no slug) → `{status, result, lastSeq, events}`.
- `status ∈ running | yielded | done | failed | not_found`; **yielded** = the mind replied and awaits the next message (the conversational settle state); settled = anything ≠ running.
- Reply text: `orchestrator_turn.thought` events (single-agent reply); `worker_result.output` coerced via the console's `{text|result|error}` rules (mirrored in `cli/core/worker-run.ts`).
- Web-app URL: `${apiBaseUrl}/c/${runId}` (studio console `ConversationPage`, same-origin with the Deploy API).

**Change A (`worker chat`):**
1. POST as today → `{runId}`. A response without `runId` keeps the legacy raw-JSON passthrough.
2. Immediately print `Run: <runId>` + `Open in browser: ${apiBaseUrl}/c/<runId>` (survives timeouts).
3. Poll `/api/chat/:runId/poll` from `since=0`, advancing `since=lastSeq`; interval `DRWN_POLL_MS` (default 1500), cap `DRWN_CHAT_TIMEOUT_MS` (default 120s).
4. Settled: failed → `Run failed: <error>` on stderr + exit 1; yielded/done → replies printed + exit 0; timeout → hint to `drwn worker run status <runId>` + exit 0.
5. `--json` waits and prints one object `{runId, url, status, result, events}`; `--no-wait` returns the handle without polling (decided: both flags, per plan review recommendation).

**Change B (`worker run status <runId>`):** new clipanion command; GET `/api/chat/:runId/poll?since=0`; print status + web URL + visible replies; `not_found`/`failed` → exit 1; `--json` prints the raw poll body. Reuses `fetchJsonWithWorkerAuth` + `describeWorkerError` (Fix 3).

**Options considered:** wait-only (rejected — scripting needs the handle + a fetch path); status-only (rejected — chat's primary use is conversational, the reply belongs in the terminal); SSE stream route (deferred — polling is the JSON sibling of the same cursor, CI-testable without stream plumbing; stream upgrade possible later without contract change).

---

## Testing strategy (TDD contract)

### Behaviors & invariants
- **Logout:** post-condition = no local creds + no keychain key, regardless of revoke result; exit 0. Revoke failure → a warning on stderr, not an error.
- **machine.json:** legacy shape → valid v1 persisted (scope preserved); v1 → untouched; unknown/corrupt → throws with a hint naming a real command.
- **Worker errors:** unauthenticated/expired/bad-audience → message without "Cannot reach Deploy API"; DNS/connect failure → with it. Exit codes unchanged (1).
- **Chat/run:** the web-app URL is printed **before** any waiting begins; a completed run yields the assistant message; a failed run exits 1; a timeout exits 0 with the URL + `run status` hint; `worker run status` reports each lifecycle state truthfully.
- **Git ref:** ref-not-found message clean, no raw `--` advice; error `context.stderr` still holds the raw text.

### Layer ownership
- **Unit** (pure): `describeWorkerError` (Fix 3), `isLegacy/migrateLegacyMachineConfig` (Fix 2), `classifyGitFailure` (Fix 6), run-URL builder + run-state mapper (Fix 4).
- **Command-level** (clipanion `Cli` + injected `AgentsContext`/`fetch`/keychain): logout (Fix 1), one worker command routing an auth error vs a network error (Fix 3), deploy/machine-read smoke on a legacy file (Fix 2), chat + run-status against a faked run lifecycle (Fix 4).
- **Integration/E2E:** none — no live Deploy API/keychain; the repo's DI seams cover it. One manual staging smoke for Fix 4 before GATE 3 (real endpoint), recorded in the PR evidence.

### TDD sequence (ordered red → green)
1. **Fix 6** (smallest): red — `core-git-ref.test.ts` asserts a ref-not-found message has no `Use '--'`; green — trim in `classifyGitFailure`.
2. **Fix 1:** red — `commands-auth.test.ts` "logout with revoke that throws leaves no creds/keychain, exit 0"; green — reorder logout.
3. **Fix 2:** red — `core-machine-config.test.ts` "legacy file → migrated v1, scope preserved" + "read no longer throws"; green — add migration + hint fix.
4. **Fix 3:** red — new `core-worker-error.test.ts` (auth vs network strings) + `commands-worker.test.ts` "unauth → no 'Cannot reach'"; green — typed error + helper + swap 8 sites.
5. **Fix 4** (after Remy's endpoint shape): red — `commands-worker-chat.test.ts` "chat prints URL then reply on faked done-run" + "timeout exits 0 with URL"; green — wait/stream loop. Then red — `commands-worker-run.test.ts` per lifecycle state; green — `run status` command.

### Case catalog (case → intended layer → target file)
- logout: revoke-ok / revoke-4xx / revoke-network-throw / not-logged-in / legacy-creds → command → `test/commands-auth.test.ts`
- machine.json: legacy-with-scope / legacy-without-scope / already-v1 / corrupt-json / unknown-shape → unit + command → `test/core-machine-config.test.ts` (+ a deploy smoke in `test/commands-worker-deploy.test.ts`)
- worker-error: not-authenticated / expired / bad-audience / DNS-typeerror / generic → unit → `test/core-worker-error.test.ts`; routing → `test/commands-worker.test.ts`
- chat/run: done-run reply / failed-run exit 1 / timeout exit 0 + URL / `--json` raw / run-status queued/running/done/failed / unknown runId → command (faked `fetch` lifecycle, `DRWN_POLL_MS=1`) → `test/commands-worker-chat.test.ts`, `test/commands-worker-run.test.ts`
- git-ref: missing tag / bad revision / (regression: still classifies auth+network correctly) → unit → `test/core-git-ref.test.ts`

### Harness, fixtures & test data
- Runner **`bun test`**. Command tests: `clipanion` `Cli`, `CaptureStream` (Writable), `scaffoldCliFixture`/`cleanupTempRoots` (`test/helpers`), `fakeJwt()`.
- Inject deps: `LogoutCommand.testDeps` (`env`/`fetch`); worker commands fake `globalThis.fetch` (save/restore `originalFetch`); keychain via `DRWN_TEST_KEYCHAIN_DIR` (file backend, no OS prompt); temp `agentsDir` per test.
- machine.json fixtures: legacy `{version:1,optional:{},authoring:{scope:"@x"}}` and a valid v1 (reuse `createEmptyMachineConfig()`), written to a temp path.

### Commands & environment
```bash
bun test test/core-git-ref.test.ts test/commands-auth.test.ts \
         test/core-machine-config.test.ts test/core-worker-error.test.ts test/commands-worker.test.ts \
         test/commands-worker-chat.test.ts test/commands-worker-run.test.ts                              # focused
bun test ./test/                                                                                          # full suite
```
No env prereqs beyond `DRWN_TEST_KEYCHAIN_DIR` (set by the fixtures); no network. Fix 4 tests pin `DRWN_POLL_MS=1` / a short `DRWN_CHAT_TIMEOUT_MS` for determinism.

### Required CI jobs / definition of green
- The repo's `bun test` job passes on all platforms it already runs. "Green" = the five new/extended behaviors above are asserted and pass, and no existing test regresses (esp. `scripts-verify-machine-contract.test.ts`, `core-auth-*`, `commands-worker*`).

### Non-goals, manual checks & residual risk
- **Ex-Fix 5** (defaults, env-var docs, per-hub credentials) is owned by **I80** — not silently dropped; I80 depends on Fix 3's `describeWorkerError` seam.
- The staging-backend-dependent re-verification (I49 TC-D6/D7, D1) is **not** part of I65 — it depends on I64.
- **Fix 4 manual check:** one real staging chat round-trip (URL opens, reply streams) before GATE 3; CI covers only the faked lifecycle.
- Residual: chat streaming behavior depends on the endpoint semantics Remy confirms; if the API only supports polling, "stream" degrades to poll-and-print (accepted).

---

## Sequence / phasing
1. **Phase 1 (now, no deps):** Fix 6 → Fix 1 → Fix 2 → Fix 3, red→green each. One PR (stacked per-fix commits) titled `#65 …`.
2. **Phase 2 (after Remy's endpoint shape + web URL path):** Fix 4 — chat wait/stream + web link, then `worker run status`.
3. **GATE 3:** open the code-PR with the `Testing & CI evidence` section; convert Turn → Remy for final review.

## Open questions for review
1. Fix 2 — migrate-on-read acceptable, or require an explicit command? (recommend migrate-on-read; implemented as migrate-on-read)
2. ~~Fix 4 — endpoint shape + web URL path~~ **Resolved 07/22** — grounded from `studio-deployment`/`containerized-cli-harness` source (see Fix 4 section); no Remy dependency remains.
3. ~~Fix 4 — `--json` semantics~~ **Resolved 07/22** — `--json` waits and prints the final object; `--no-wait` added for scripts.
4. One PR for both phases, or split? **Both phases landed on one implementation branch** (`junggyubae/I65-impl`) since Fix 4 unblocked same-day.
