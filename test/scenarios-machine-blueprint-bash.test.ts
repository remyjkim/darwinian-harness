// ABOUTME: Runs the machine Worker V2 hard-cut contract through a real Bash process.
// ABOUTME: Proves isolated selection, replacement, projection, retired commands, and project separation.

import { afterEach, expect, test as baseTest } from "bun:test";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createFixtureRegistry,
  envFor,
  publishMachineBlueprint,
  scaffoldCliFixture,
} from "./helpers";

const test = baseTest.skipIf(process.platform === "win32");
const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("bash CLI enforces the isolated machine Blueprint V2 lifecycle", async () => {
  const scaffold = await scaffoldCliFixture();
  tempRoots.push(scaffold.root);
  const fixture = { ...scaffold, agentsDir: join(scaffold.root, "isolated-agents") };
  await mkdir(fixture.agentsDir, { recursive: true });
  const activeRef = await publishMachineBlueprint(fixture, {
    rootName: "@bash/active-worker",
    memberName: "@bash/active-capabilities",
    skills: ["alpha"],
    servers: { context7: createFixtureRegistry().servers.context7 },
  });
  const alternateRef = await publishMachineBlueprint(fixture, {
    rootName: "@bash/alternate-worker",
    memberName: "@bash/alternate-capabilities",
    skills: ["beta"],
  });
  const projectDir = join(fixture.root, "isolated-project");

  const result = await runBash(
    `
set -euo pipefail
mkdir -p "$PROJECT_DIR"
drwn() {
  "$BUN_BIN" run "$DRWN_ENTRYPOINT" "$@"
}

drwn apply --root "$ACTIVE_REF" "$ALTERNATE_REF" --active @bash/active-worker
node <<'NODE'
const fs = require('fs');
const machine = JSON.parse(fs.readFileSync(process.env.MACHINE_PATH, 'utf8'));
if (machine.schema !== 'drwn.machine' || machine.schemaVersion !== 2) throw new Error('machine V2 missing');
if (machine.capabilities.activeWorker !== '@bash/active-worker') throw new Error('wrong active Worker');
if (machine.capabilities.workerLock.workerRoots.length !== 2) throw new Error('missing alternative root');
for (const stale of ['profile', 'skills', 'mcpServers']) {
  if (stale in machine.capabilities) throw new Error('legacy capability survived: ' + stale);
}
NODE

drwn write --root --json > "$FIRST_WRITE"
test -d "$HOME/.claude/skills/alpha"
test ! -e "$HOME/.claude/skills/beta"
test -d "$AGENTS_DIR/drwn/generated/workers/@bash/active-worker"
test ! -e "$AGENTS_DIR/drwn/generated/workers/@bash/alternate-worker"

shasum -a 256 "$MACHINE_PATH" > "$MACHINE_BEFORE"
if drwn machine skill enable beta > "$RETIRED_OUT" 2> "$RETIRED_ERR"; then
  echo "retired machine skill activation unexpectedly succeeded" >&2
  exit 1
fi
if drwn machine mcp disable context7 >> "$RETIRED_OUT" 2>> "$RETIRED_ERR"; then
  echo "retired machine MCP activation unexpectedly succeeded" >&2
  exit 1
fi
grep -q "drwn apply --root" "$RETIRED_OUT" "$RETIRED_ERR"
shasum -a 256 -c "$MACHINE_BEFORE"

drwn use --root @bash/alternate-worker --no-write
test -d "$HOME/.claude/skills/alpha"
test ! -e "$HOME/.claude/skills/beta"
drwn write --root
test ! -e "$HOME/.claude/skills/alpha"
test -d "$HOME/.claude/skills/beta"

drwn apply --root --none --write
test ! -e "$HOME/.claude/skills/alpha"
test ! -e "$HOME/.claude/skills/beta"
node <<'NODE'
const fs = require('fs');
const machine = JSON.parse(fs.readFileSync(process.env.MACHINE_PATH, 'utf8'));
if (machine.capabilities.activeWorker !== null || machine.capabilities.workerLock !== null) {
  throw new Error('machine reset did not clear both capability fields');
}
NODE

cd "$PROJECT_DIR"
drwn init --non-interactive --no-default-catalogs
drwn write --dry-run > "$PROJECT_PREVIEW"
node <<'NODE'
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(process.env.PROJECT_DIR, '.agents/drwn/config.json'), 'utf8'));
if (config.schema !== 'drwn.project-config' || config.activeWorker !== null) throw new Error('project isolation failed');
const preview = fs.readFileSync(process.env.PROJECT_PREVIEW, 'utf8');
if (preview.includes('/skills/alpha') || preview.includes('/skills/beta')) throw new Error('machine capability leaked into project');
NODE
`,
    {
      ...envFor(fixture),
      HOME: fixture.homeDir,
      ACTIVE_REF: activeRef,
      ALTERNATE_REF: alternateRef,
      PROJECT_DIR: projectDir,
      PROJECT_PREVIEW: join(fixture.root, "project-preview.txt"),
      MACHINE_PATH: join(fixture.agentsDir, "drwn", "machine.json"),
      MACHINE_BEFORE: join(fixture.root, "machine.sha256"),
      FIRST_WRITE: join(fixture.root, "first-write.json"),
      RETIRED_OUT: join(fixture.root, "retired.out"),
      RETIRED_ERR: join(fixture.root, "retired.err"),
    },
  );

  expect(result.exitCode).toBe(0);
}, 30000);

async function runBash(script: string, env: Record<string, string>) {
  const proc = Bun.spawn(["bash", "-lc", script], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
      BUN_BIN: Bun.which("bun") ?? process.execPath,
      DRWN_ENTRYPOINT: fileURLToPath(new URL("../cli/index.ts", import.meta.url)),
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`bash workflow failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  return { stdout, stderr, exitCode: exitCode ?? -1 };
}
