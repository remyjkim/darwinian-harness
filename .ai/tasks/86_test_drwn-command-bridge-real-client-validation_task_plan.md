# drwn-command-bridge Real-Client And Platform Validation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Tasks 5–8 are human-in-the-loop runbooks — Claude prepares the artifacts, Remy performs the interactive steps.

**Goal:** Close the validation gaps between what drwn-command-bridge's automated suite proves and what real clients (Claude Desktop, Cowork) and native platforms (Linux bwrap, Windows) actually exercise — with repeatable evidence for every closed gap.

**Architecture:** Three layers of validation. (1) CI-automatable native coverage: a Linux bwrap smoke job, the existing macOS smoke wired into CI, and a native Windows Git Bash resolution test. (2) Scripted human-in-the-loop harnesses: a consent smoke that drives real osascript dialogs through the production bundle and asserts outcomes/audit, so manual sessions produce machine-checked evidence instead of eyeball reports. (3) Runbook-driven real-client sessions: Claude Desktop (current build + npx launch shape) and a Cowork empirical probe, with results recorded in the platform matrix.

**Tech Stack:** TypeScript, bun, `@modelcontextprotocol/sdk` stdio client, GitHub Actions (ubuntu/macos/windows runners), bubblewrap, `sandbox-exec`, osascript.

---

## Task Metadata

**Status**: Draft — pending Remy review; Decision Point 1 (hot reload) blocks Task 5 scope
**Created**: 2026-07-16
**Assigned**: Claude + Remy (Tasks 5–8 need Remy at the screen)
**Priority**: High — plan 73 D2 makes native validation a release blocker for v1-complete
**Dependencies**: drwn-command-bridge@0.1.0 (published 2026-07-13); existing CI `command-bridge` tri-OS job
**References**: `.ai/tasks/73_drwn-command-bridge-implementation-plan.md`, `.ai/analyses/102_cowork_addon_cli_mcp_design.md`, `.ai/analyses/80_drwn-cowork-target-investigation.md`, `.ai/analyses/79_cowork_management_guide.md`, `.github/workflows/ci.yml`, `drwn-command-bridge/scripts/native-macos-smoke.ts`

## Verified State (Evidence Inventory, 2026-07-16 investigation)

Everything below was re-verified during this investigation, not taken from prior notes.

| Claim | Evidence | Date |
|---|---|---|
| Package gates green (94 tests / 0 fail / 0 skip, typecheck, build, pack) | `bun run verify` run locally; also runs tri-OS in CI `command-bridge` job | 2026-07-14 |
| Scripted macOS MCP-stdio smoke passes (real `sandbox-exec`, real spawn, 4-record audit chain) | `bun run smoke:macos` run locally | 2026-07-14 |
| Published npm artifact runs | `npx -y drwn-command-bridge@0.1.0 --help` | 2026-07-14 |
| Registry entry opt-in + renderers preserve policy placeholder | `test/sync-mcp.test.ts` (29 pass); placeholder is correct for the Claude Code target because `.mcp.json` expands `${VAR}` | 2026-07-14 |
| Card source healthy | `drwn card source doctor @darwinian/drwn-command-bridge --json` → `ok: true` | 2026-07-14 |
| **Claude Desktop launches the bridge and completes handshake + `tools/list`** | `~/Library/Logs/Claude/mcp-server-drwn-command-bridge.log` — clean initialize/tools-list cycle at 2026-07-15T20:09Z; Desktop resolves nvm node via its own PATH augmentation | 2026-07-15 |
| **Claude Desktop drove real executions and policy denials** | Live audit log `~/dev/ai-narratives/.agents/drwn/drwn-command-bridge.audit.jsonl`: 34 hash-chained records, 15 `completed`, 2 `policy_denied` (`drwn write --mcp-only` correctly rejected by allowlist regex), `sandbox.required: true` in force | 2026-07-08 |
| Audit file mode 600 in real use | `ls -la` on the live audit file: `-rw-------` | 2026-07-16 |

So the earlier "never tested against Claude Desktop" was too broad: Desktop launch, stdio discipline, auto execution, and policy denial are field-proven. What has genuinely never run is below.

## Gap Inventory

| # | Gap | Root cause | Closable by |
|---|---|---|---|
| G1 | **Real consent dialog has never fired on any platform.** All 17 test files inject `FakeConsentGate`; the live Desktop policy allows only low-risk commands, so 34 real invocations never crossed the consent threshold. Untested: osascript Approve path, Deny path, prompt content (program/argv/cwd/risk/reason), and the implicit ~30 s executor-timeout kill of an unanswered dialog. | Consent requires a human click | Task 4 harness + Task 5 session |
| G2 | **Hot reload is not wired in production** — see Decision Point 1. `src/index.ts:60` passes `policyStore: { current: () => policy }` (one-shot load in a static closure). `FilePolicyStore.reload()` exists and is tested, but the entrypoint never constructs it. Plan 73 Decision D7 says reload is "enabled by default"; reality is policy edits require a server restart. | Implementation/decision drift; tests exercise the class, not the wiring | Remy decision → Task 5a or doc fix |
| G3 | **Cowork end-to-end never observed.** Zero bridge mentions in `coworkd.log` / `cowork_vm_node.log`. Unknowns from analysis 80 §6 remain open: does Cowork forward Desktop-config stdio servers into the VM; does the `/sessions/…` path denial fire on real VM-originated `cwd`; how does a Cowork session behave while a consent dialog blocks on the host. | Nobody has run the probe | Task 8 |
| G4 | **Linux bwrap never executed for real.** Sandbox tests inject an `exists()` callback; CI runs the suite on ubuntu but nothing spawns actual `bwrap`. | No Linux smoke script or CI step | Tasks 1–2 |
| G5 | **Windows real-filesystem shell resolution and consent untested.** CI runs unit paths natively on windows-latest, but Git Bash resolution always uses injected `exists()`; the PowerShell MessageBox has never rendered. Windows sandbox denying when required is by design (plan 73 D2) — not a gap. | Injection-only coverage | Task 3 (CI) + deferred manual |
| G6 | **npx launch shape unproven under Desktop.** The registry entry uses `npx -y drwn-command-bridge@^0.1.0`; the working Desktop entry uses a direct `node dist/index.js` path. Desktop's PATH augmentation includes nvm bins on this machine, so it should work — unverified. | Nobody switched the entry | Task 6 |
| G7 | **macOS smoke not wired into CI** — it exists, passes locally, and the `command-bridge` job already has a macos-latest leg. | One missing step in ci.yml | Task 2 |
| G8 | Minor untested paths: `--help` output has no test; 1 MiB truncation tested only at 16-byte proxy limits; 300 s timeout hard cap unasserted. | Low-risk residue | Task 3 (cheap additions) |

## Decision Point 1 (Remy) — hot reload

Plan 73 D7 locked: "Hot reload: Enabled by default after first valid startup load. Invalid reload keeps the prior valid policy." The shipped `index.ts` does not implement this — `FilePolicyStore` is dead code in production. Options:

- **(a) Implement D7**: wire `FilePolicyStore` into `main()`, add an `fs.watch`-or-poll trigger calling `reload()`, TDD it (this becomes Task 5a in Phase 1). Operator edits a policy and the running Desktop server picks it up; invalid edits keep the prior policy and log to stderr.
- **(b) Revise D7**: declare restart-required behavior intended for v0.1, update plan 73 and the README, and delete or repurpose `FilePolicyStore`. Cheaper; consistent with "smallest hole" (a policy that can change under a running agent is itself a surface).

The plan below assumes **(b) is acceptable for this validation cycle** (manual runbooks say "restart Desktop after policy edits") but does not close plan 73's D7 line — that stays open until Remy picks. **Do not implement (a) without explicit approval.**

## Target State

- CI proves, on every PR: bridge suite tri-OS (existing) + real `bwrap` execution on ubuntu + real `sandbox-exec` MCP smoke on macos + real Git Bash resolution on windows.
- A repeatable consent smoke exists; a dated, machine-verified consent run (Approve, Deny, timeout) is recorded on macOS.
- Claude Desktop validation is recorded against the current v0.1.0 build for both launch shapes (direct node path and npx).
- The Cowork probe has answered: tools forwarded? VM-path denial fires? consent-during-Cowork behavior? — with findings recorded even if the answer is "Cowork does not forward host MCP servers."
- README platform matrix and plan 73 evidence updated; plan 73's criterion "Manual macOS end-to-end through Claude Desktop or equivalent MCP stdio client" split so a synthetic client can no longer satisfy the real-client half.

## Success Criteria

- [ ] `smoke:linux` script exists and passes in CI under real bwrap (ubuntu-latest).
- [ ] `smoke:macos` runs in CI on macos-latest.
- [ ] Native Windows test resolves a real Git Bash path on windows-latest CI (skipIf elsewhere).
- [ ] `smoke:consent` harness exists; a run with real osascript Approve/Deny/timeout is recorded with audit-chain verification output.
- [ ] Claude Desktop session against the current build recorded: auto-run, consent Approve, consent Deny, denylist denial, `~/.ssh` path denial, `/sessions/…` denial, audit records for all.
- [ ] npx launch shape verified in Desktop logs.
- [ ] Cowork probe executed and findings recorded (including negative results).
- [ ] README matrix + plan 73 evidence updated; criterion 950 split.
- [ ] Decision Point 1 resolved by Remy and reflected in plan 73.
- [ ] `cd drwn-command-bridge && bun run verify` still green after all code changes.

## Strategies Considered

### Strategy A — Manual-first sweep

Run the Desktop/Cowork/consent manual sessions immediately with ad-hoc policies, record results, and only then decide what to automate.

Pros: fastest path to answering "does it work with real clients". Cons: evidence rots (next release re-opens every question); Linux stays blocked because there's no local Linux host, so the release-blocking G4 gap survives; manual sessions without a harness produce eyeball evidence that can't be re-checked.

### Strategy B — Automate the automatable, script the manual (chosen)

Build the CI-native coverage first (Linux bwrap, macOS smoke in CI, Windows real resolution) so platform gaps close permanently, and build the consent harness so the human session is a scripted, assertion-checked run. Manual Desktop/Cowork sessions come last, against artifacts that already passed everywhere else.

Pros: G4/G5(CI half)/G7 close permanently on every PR; manual runs produce verifiable audit output; a failed manual step is immediately reproducible. Cons: ~1 day more work before the headline manual answer.

**Chosen:** Strategy B. The manual sessions are also strictly cheaper once the harness exists.

---

## Execution Plan

Phase 1 (Tasks 1–4) is code + CI: TDD applies, commit per task. Phase 2 (Tasks 5–7) is the macOS manual session. Phase 3 (Task 8) is the Cowork probe. Phase 4 (Task 9) records evidence. Every new TS file starts with two `// ABOUTME:` lines.

### Task 1: Native Linux smoke script

**Files:**
- Create: `drwn-command-bridge/scripts/native-linux-smoke.ts`
- Modify: `drwn-command-bridge/package.json` (add `"smoke:linux"` script)

**Step 1: Write the script** (mirror of `native-macos-smoke.ts`; no bun:test — it is a smoke harness, same as the macOS one)

Key differences from the macOS script, both forced by bwrap's mount namespace: the allowlisted command must live under a read-only-bound system path (`/usr`, `/bin`, `/lib`), and node's tool-cache install location on CI is NOT visible inside the sandbox — so use `uname -r`, not `node --version`.

```ts
// ABOUTME: Exercises the production Node bundle through a real MCP stdio client on Linux.
// ABOUTME: Verifies native bwrap sandbox execution, policy denial, and audit-chain integrity.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAuditLog } from "../src/audit/log";

if (process.platform !== "linux") {
  throw new Error(`native Linux smoke requires linux, received ${process.platform}`);
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(join(tmpdir(), "drwn-command-bridge-native-"));
const policyPath = join(tempRoot, "policy.yaml");
const auditPath = join(tempRoot, "audit.jsonl");
const bundlePath = join(packageRoot, "dist", "index.js");
const policy = `version: 1
default: deny
allow:
  - program: uname
    args_allow: ["-r"]
    risk: low
deny_always:
  - pattern: '\\bsudo\\b'
consent_required_above: low
roots_allow:
  - ${JSON.stringify(tempRoot)}
sandbox:
  required: true
`;

await writeFile(policyPath, policy, { mode: 0o600 });

const client = new Client({ name: "drwn-command-bridge-native-smoke", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [bundlePath, "--policy", policyPath, "--audit", auditPath],
  cwd: packageRoot,
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += String(chunk);
});

try {
  await client.connect(transport);

  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    ["execute_command", "list_allowed_commands"],
  );

  const allowed = await client.callTool({
    name: "execute_command",
    arguments: { command: "uname -r", cwd: tempRoot, reason: "native Linux release smoke" },
  });
  assert.equal(allowed.isError, undefined);
  assert.match(String((allowed.structuredContent as { stdout?: string } | undefined)?.stdout), /^\d+\./);
  assert.equal((allowed.structuredContent as { decision?: string } | undefined)?.decision, "auto");

  const denied = await client.callTool({
    name: "execute_command",
    arguments: { command: "sudo whoami", cwd: tempRoot, reason: "verify denylist precedence" },
  });
  assert.equal(denied.isError, true);

  await client.close();
  const audit = await verifyAuditLog(auditPath);
  assert.deepEqual(audit, { ok: true, records: 4 });

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      platform: process.platform,
      transport: "mcp-stdio",
      bundleRuntime: "node",
      sandbox: "bwrap",
      tools: listed.tools.map((tool) => tool.name).sort(),
      allowed: "uname -r",
      denied: "sudo whoami",
      auditRecords: 4,
    })}\n`,
  );
} catch (error) {
  await client.close().catch(() => undefined);
  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
  throw error;
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
```

`package.json` scripts addition:

```json
"smoke:linux": "bun run build && bun run scripts/native-linux-smoke.ts"
```

**Step 2: Verify the failure mode on this (macOS) host**

Run: `cd drwn-command-bridge && bun run smoke:linux`
Expected: FAIL fast with `native Linux smoke requires linux, received darwin` — proves the guard.

**Step 3: Typecheck**

Run: `cd drwn-command-bridge && bun run typecheck`
Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/scripts/native-linux-smoke.ts drwn-command-bridge/package.json
git commit -m "feat: add native linux bwrap smoke"
```

Real execution proof lands in Task 2 (CI). Optional local pre-check before pushing: none — bwrap-in-Docker needs privileged mode; CI is the honest environment.

### Task 2: CI — Linux native smoke job + macOS smoke step

**Files:**
- Modify: `.github/workflows/ci.yml` (extend the `command-bridge` job)

**Step 1: Add per-OS smoke steps to the existing `command-bridge` matrix job** (after "Verify bridge package"):

```yaml
      - name: Enable unprivileged user namespaces (bwrap)
        if: runner.os == 'Linux'
        # ubuntu-24.04 restricts unprivileged userns via AppArmor by default;
        # bubblewrap needs it to create its mount namespace.
        run: |
          sudo apt-get update && sudo apt-get install -y bubblewrap
          sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 || true

      - name: Native Linux bwrap smoke
        if: runner.os == 'Linux'
        working-directory: drwn-command-bridge
        run: bun run smoke:linux

      - name: Native macOS sandbox smoke
        if: runner.os == 'macOS'
        working-directory: drwn-command-bridge
        run: bun run smoke:macos
```

**Step 2: Push on a WIP branch and watch the run**

```bash
git checkout -b test/bridge-native-validation   # if not already on it
git add .github/workflows/ci.yml
git commit -m "ci: run native bridge smokes on linux and macos"
git push -u origin test/bridge-native-validation
gh run watch
```

Expected: `Command bridge (ubuntu-latest)` green including the bwrap smoke; `Command bridge (macos-latest)` green including the sandbox-exec smoke; windows leg unchanged.

**Step 3: If the bwrap smoke fails on userns/AppArmor**, capture the exact error before touching anything (systematic-debugging rule) — the known variants are `setting up uid map: Permission denied` (sysctl didn't apply) and `Can't find source path /lib64` (adapter binds `/lib64` unconditionally; if the runner image lacks it, that's a real adapter bug to raise with Remy, not to patch around in CI).

### Task 3: Native Windows Git Bash resolution test (+ G8 cheap wins)

**Files:**
- Modify: `drwn-command-bridge/test/shell-resolution.test.ts`
- Modify: `drwn-command-bridge/test/index.test.ts`

**Step 1: Write the failing/skipping tests**

In `shell-resolution.test.ts` — real `existsSync`, real `process.env`, no injection:

```ts
test.skipIf(process.platform !== "win32")(
  "resolves a real Git Bash installation on native Windows",
  () => {
    const shell = resolveShellForPlatform("win32", { shell: true });
    expect(shell).toBeTruthy();
    expect(shell!.toLowerCase()).toEndWith("\\git\\bin\\bash.exe");
    expect(shell!.toLowerCase()).not.toContain("system32");
  },
);
```

In `index.test.ts` — cover `--help` (G8):

```ts
test("prints usage and exits without serving when --help is passed", async () => {
  // main() with --help must return before requiring --policy
  await main(["--help"]);
});
```

(Adjust to capture stdout if `main` is refactorable without ceremony; if capturing stdout requires restructuring `main`, assert only that it resolves without throwing — the usage string is already pinned by the argv parser.)

**Step 2: Run locally**

Run: `cd drwn-command-bridge && bun test test/shell-resolution.test.ts test/index.test.ts`
Expected: Git Bash test SKIPS on darwin with visible skip output; `--help` test passes (or fails first if `main(["--help"])` currently throws — then it found a bug).

**Step 3: Verify on CI** — the windows-latest leg runs the new test for real (Git ships on GitHub Windows runners at `C:\Program Files\Git`).

**Step 4: Commit**

```bash
git add drwn-command-bridge/test/shell-resolution.test.ts drwn-command-bridge/test/index.test.ts
git commit -m "test: exercise native windows shell resolution and help flag"
```

### Task 4: Consent smoke harness (macOS)

**Files:**
- Create: `drwn-command-bridge/scripts/native-consent-smoke.ts`
- Modify: `drwn-command-bridge/package.json` (add `"smoke:consent"`)

This is the piece that turns the manual consent test from "click around and describe what you saw" into a machine-verified run. It drives the production bundle over MCP stdio with a medium-risk rule so every call crosses the consent threshold, and tells the operator (on stderr) which button to click before each call.

**Step 1: Write the harness**

```ts
// ABOUTME: Drives real macOS osascript consent dialogs through the production bundle.
// ABOUTME: Operator clicks per stderr instructions; script asserts outcomes and audit chain.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAuditLog } from "../src/audit/log";

if (process.platform !== "darwin") {
  throw new Error(`consent smoke requires darwin, received ${process.platform}`);
}

const instruct = (msg: string) => process.stderr.write(`\n=== ${msg} ===\n`);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(join(tmpdir(), "drwn-command-bridge-consent-"));
const policyPath = join(tempRoot, "policy.yaml");
const auditPath = join(tempRoot, "audit.jsonl");
const policy = `version: 1
default: deny
allow:
  - program: uname
    args_allow: ["-r"]
    risk: medium
deny_always:
  - pattern: '\\bsudo\\b'
consent_required_above: low
roots_allow:
  - ${JSON.stringify(tempRoot)}
sandbox:
  required: true
`;
await writeFile(policyPath, policy, { mode: 0o600 });

const client = new Client({ name: "drwn-command-bridge-consent-smoke", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [join(packageRoot, "dist", "index.js"), "--policy", policyPath, "--audit", auditPath],
  cwd: packageRoot,
  stderr: "pipe",
});

try {
  await client.connect(transport);

  instruct("DIALOG 1/3: click DENY. Also verify the dialog shows Program: uname, Args: -r, CWD, Risk: medium, and the reason text.");
  const denied = await client.callTool({
    name: "execute_command",
    arguments: { command: "uname -r", cwd: tempRoot, reason: "consent smoke - deny me" },
  });
  assert.equal(denied.isError, true, "denied consent must return a tool error");

  instruct("DIALOG 2/3: click APPROVE.");
  const approved = await client.callTool({
    name: "execute_command",
    arguments: { command: "uname -r", cwd: tempRoot, reason: "consent smoke - approve me" },
  });
  assert.equal(approved.isError, undefined, "approved consent must execute");
  assert.equal(
    (approved.structuredContent as { decision?: string } | undefined)?.decision,
    "consented",
  );

  instruct("DIALOG 3/3: do NOT click anything. The dialog should be killed after ~30s and the call must deny.");
  const timedOut = await client.callTool({
    name: "execute_command",
    arguments: { command: "uname -r", cwd: tempRoot, reason: "consent smoke - ignore me" },
  });
  assert.equal(timedOut.isError, true, "unanswered consent must fail closed");

  await client.close();

  const audit = await verifyAuditLog(auditPath);
  assert.equal(audit.ok, true);
  const outcomes = (await readFile(auditPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((r) => r.recordType === "outcome")
    .map((r) => r.payload.outcome);
  assert.deepEqual(outcomes, ["consent_denied", "completed", "consent_denied"]);

  process.stdout.write(`${JSON.stringify({ ok: true, outcomes, auditRecords: 6 })}\n`);
} catch (error) {
  await client.close().catch(() => undefined);
  throw error;
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
```

`package.json` scripts addition:

```json
"smoke:consent": "bun run build && bun run scripts/native-consent-smoke.ts"
```

**Step 2: Typecheck + guard check**

Run: `cd drwn-command-bridge && bun run typecheck`
Expected: PASS. (The interactive run itself is Task 5 — do not run it headless.)

**Step 3: Commit**

```bash
git add drwn-command-bridge/scripts/native-consent-smoke.ts drwn-command-bridge/package.json
git commit -m "feat: add interactive consent smoke harness"
```

### Task 5: MANUAL — macOS consent session (Remy at the screen, ~10 min)

**Prep (Claude):** everything is done by Task 4. **Run (Remy):**

```bash
cd ~/dev/darwinian-minds/drwn-command-bridge && bun run smoke:consent
```

Follow the three stderr instructions (Deny → Approve → ignore for ~35 s). Success output is a single JSON line `{"ok":true,"outcomes":["consent_denied","completed","consent_denied"],...}`.

**While Dialog 1 is up, verify prompt content** (this is the only eyeball assertion): it must show Program, full Args, CWD, Risk, and the Reason string, and the default/cancel button must be Deny.

**Record:** paste the JSON output + a note on prompt content into Task 9's evidence section. If any step fails: stop, capture the exact output, and debug root-cause first — do not re-run in a loop.

### Task 6: MANUAL — Claude Desktop session against the current build (Remy, ~20 min)

Uses a **separate test policy and separate server entry** so the live `ai-narratives` policy stays untouched.

**Step 1 (Claude prepares):** write `~/.drwn-command-bridge/desktop-test.policy.yaml`:

```yaml
version: 1
default: deny
allow:
  - program: git
    args_allow: ["status", "log", "diff"]
    risk: low
    path_args:
      all_slashy: true
  - program: uname
    args_allow: ["-r", "-a"]
    risk: medium
deny_always:
  - pattern: '\b(?:sudo|doas|runas|pkexec)\b'
  - pattern: '[;&|<>`]'
  - pattern: '(?:^|\s)(?:~|/Users/[^/\s]+)/(?:\.ssh|\.aws|\.gnupg)(?:/|\s|$)'
consent_required_above: low
consent_cache_ttl_ms: 0
env_allow: []
roots_allow:
  - "/Users/pureicis/dev/darwinian-minds"
sandbox:
  required: true
```

And add to `~/Library/Application Support/Claude/claude_desktop_config.json` under `mcpServers` (keep the existing `drwn-command-bridge` entry as-is):

```json
"drwn-command-bridge-test": {
  "command": "node",
  "args": [
    "/Users/pureicis/dev/darwinian-minds/drwn-command-bridge/dist/index.js",
    "--policy", "/Users/pureicis/.drwn-command-bridge/desktop-test.policy.yaml",
    "--audit", "/Users/pureicis/.drwn-command-bridge/desktop-test.audit.jsonl"
  ]
}
```

Rebuild first: `cd drwn-command-bridge && bun run build`.

**Step 2 (Remy):** quit Claude Desktop fully (Cmd+Q), relaunch, confirm `drwn-command-bridge-test` tools appear. Then in a chat, drive this matrix (ask Claude to use the test bridge with cwd `/Users/pureicis/dev/darwinian-minds`):

| # | Command | Expected |
|---|---|---|
| 1 | `git status` | auto-runs, no dialog, structured output |
| 2 | `uname -r` | osascript dialog → click Approve → runs, `decision: "consented"` |
| 3 | `uname -a` | dialog → click Deny → tool error, no execution |
| 4 | `sudo whoami` | denied, **no dialog** |
| 5 | `git log ~/.ssh` | denied (credential path pattern) |
| 6 | `git status` with cwd `/sessions/foo/mnt/project` | denied with VM path-translation message |

**Step 3 (Remy or Claude):** verify the audit trail:

```bash
node -e 'const {verifyAuditLog}=await import("/Users/pureicis/dev/darwinian-minds/drwn-command-bridge/src/audit/log.ts");' 2>/dev/null \
  || cd ~/dev/darwinian-minds/drwn-command-bridge && bun -e 'import {verifyAuditLog} from "./src/audit/log"; console.log(JSON.stringify(await verifyAuditLog(process.env.HOME + "/.drwn-command-bridge/desktop-test.audit.jsonl")))'
tail -12 ~/.drwn-command-bridge/desktop-test.audit.jsonl
```

Expected: `{"ok":true,...}`; outcomes include `completed`, `consent_denied`, `policy_denied`, `path_denied` variants matching the matrix.

### Task 7: MANUAL — npx launch shape under Desktop (Remy, ~5 min)

**Step 1:** in the Desktop config, change the test entry's launch to the registry shape:

```json
"command": "npx",
"args": ["-y", "drwn-command-bridge@0.1.0", "--policy", "/Users/pureicis/.drwn-command-bridge/desktop-test.policy.yaml", "--audit", "/Users/pureicis/.drwn-command-bridge/desktop-test.audit.jsonl"]
```

**Step 2:** full restart; run `git status` through it once.

**Step 3:** confirm in the log that the npx form launched and served:

```bash
grep -A3 "Initializing server" ~/Library/Logs/Claude/mcp-server-drwn-command-bridge-test.log | tail -20
```

Expected: successful initialize + tools/list; this closes G6 and validates the registry entry's real-world shape. Record pass/fail. Afterwards revert the test entry (or remove it).

### Task 8: MANUAL — Cowork empirical probe (Remy, ~20 min; Claude prepares checklist)

Per analysis 80 §6 sequencing, this is a probe — every outcome including "Cowork never forwards the server" is a valid, recordable finding.

**Prereqs:** Task 6's test entry present (node form); `/Users/pureicis/dev/darwinian-minds` added as a Cowork trusted folder.

**Checklist:**
1. Start a Cowork session on `darwinian-minds`. Ask the agent to list available tools. Record: are `execute_command` / `list_allowed_commands` visible? (Answers 80 §6 OQ: does Cowork forward Desktop-config stdio servers.)
2. If visible: run `git status` via the bridge. Record decision + output. Meanwhile `tail -f ~/Library/Logs/Claude/coworkd.log` for bridge activity.
3. Run `uname -r` (consent). Record: does the osascript dialog surface on the host while the Cowork session waits? What does the Cowork UI show during the wait? Approve once, deny once.
4. Ask the agent to run `git status` against an uploaded file/dir so it naturally passes a VM path (or explicitly request cwd `/sessions/...`). Expected: denial with the VM path-translation message. Record the exact agent-visible error.
5. Verify all of the above appeared in `desktop-test.audit.jsonl` with a valid chain.
6. Record any Cowork-specific anomalies (tool naming, timeouts during consent wait, retries — a client that auto-retries a denied call would be important to know about).

**If tools never appear in step 1:** record that Cowork does not forward this server + relevant log lines; that resolves the design doc's open question negatively and re-scopes plan 73's "Cowork" framing to Claude Desktop. Do not force it with config hacks in this task.

### Task 9: Record evidence and align docs

**Files:**
- Modify: `drwn-command-bridge/README.md` (platform validation matrix)
- Modify: `.ai/tasks/73_drwn-command-bridge-implementation-plan.md` (evidence section + split criterion at line 950 into synthetic-client and real-client entries; check/uncheck per results)
- Modify: this file (mark success criteria, paste evidence JSON/log excerpts per task)

**Step 1:** update README matrix rows: macOS (scripted smoke in CI + Desktop consent session dated), Linux (native bwrap smoke in CI dated — native desktop consent dialogs still open), Windows (native unit + real Git Bash resolution in CI; Desktop/consent manual still open).

**Step 2:** run the full gates one more time:

```bash
cd drwn-command-bridge && bun run verify && cd .. && bun test test/sync-mcp.test.ts
```

Expected: green.

**Step 3: Commit**

```bash
git add drwn-command-bridge/README.md .ai/tasks/73_drwn-command-bridge-implementation-plan.md .ai/tasks/86_test_drwn-command-bridge-real-client-validation_task_plan.md
git commit -m "docs: record bridge real-client and native platform validation"
```

## Out Of Scope (recorded, not planned)

- **Linux desktop consent dialogs** (zenity/kdialog with a human): no Linux desktop host available; unit fallback/unavailability coverage exists; remains an open matrix line.
- **Windows Desktop manual session + PowerShell MessageBox click-through**: needs a native Windows GUI host; remains a plan 73 D2 release-blocker line, unchanged by this plan.
- **Hot reload implementation** (Decision Point 1a) unless Remy approves.
- Research-grade questions from analysis 102 §11 (consent fatigue, sandbox strength comparison, egress policy, external audit collector).

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| ubuntu-24.04 AppArmor blocks unprivileged userns → bwrap fails in CI | Task 2 red | Explicit sysctl step; if it still fails, capture error and investigate root cause before altering the adapter |
| Linux adapter binds `/lib64` unconditionally; absent on some hosts | Smoke fails on such hosts | Treated as a real adapter finding to raise, not a CI workaround |
| Consent smoke asserts a ~30 s timeout via the executor's default | Flaky if timing assumptions wrong | Harness asserts outcome, not duration; instruction says "~30s" only |
| Manual session mutates Remy's live Desktop setup | Broken working bridge entry | Separate `-test` policy/entry/audit paths; live entry untouched; revert step in Task 7 |
| Cowork behavior undocumented/changes across versions | Probe results go stale | Record Desktop + Cowork version numbers with the evidence |
| `main(["--help"])` test may reveal it doesn't exit cleanly | Small fix needed | That's the point of the test; fix minimally if red |
