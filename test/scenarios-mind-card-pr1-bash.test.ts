// ABOUTME: Runs a real Bash workflow for PR1 mind-card authoring and publishing.
// ABOUTME: Exercises shell-facing CLI contracts for persona, beliefs, and visibility gates.

import { afterEach, expect, test as baseTest } from "bun:test";
import { fileURLToPath } from "node:url";
const test = baseTest.skipIf(process.platform === "win32");
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "../cli/core/git";
import { cleanupTempRoots, envFor, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("bash CLI authors, publishes, and visibility-gates a mind card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createEmptyBareRemote("mind-card-bash-remote-");

  const result = await runBash(
    `
set -euo pipefail
"$BUN_BIN" run "$DRWN_ENTRYPOINT" card new @team/mind --into "$CARD_COLLECTION" --no-git
"$BUN_BIN" run "$DRWN_ENTRYPOINT" card source add-persona "$CARD_SOURCE" voice --visibility internal
"$BUN_BIN" run "$DRWN_ENTRYPOINT" card source add-belief "$CARD_SOURCE" engineering --visibility public
"$BUN_BIN" run "$DRWN_ENTRYPOINT" card source doctor "$CARD_SOURCE" --json > "$DOCTOR_PATH"
node <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.DOCTOR_PATH, 'utf8'));
if (!payload.ok) throw new Error('doctor failed: ' + JSON.stringify(payload.issues));
NODE
"$BUN_BIN" run "$DRWN_ENTRYPOINT" card publish --from "$CARD_SOURCE"
"$BUN_BIN" run "$DRWN_ENTRYPOINT" card remote add @team/mind "$REMOTE_URL"
if "$BUN_BIN" run "$DRWN_ENTRYPOINT" card push @team/mind --remote-visibility public > "$PUSH_STDOUT" 2> "$PUSH_STDERR"; then
  echo "expected public visibility push to fail" >&2
  exit 1
fi
grep -q "less restrictive" "$PUSH_STDERR"
`,
    {
      ...envFor(fixture),
      CARD_COLLECTION: join(fixture.root, "cards"),
      CARD_SOURCE: join(fixture.root, "cards", "mind"),
      REMOTE_URL: remote.url,
      DOCTOR_PATH: join(fixture.root, "doctor.json"),
      PUSH_STDOUT: join(fixture.root, "push.out"),
      PUSH_STDERR: join(fixture.root, "push.err"),
    },
  );

  expect(result.exitCode).toBe(0);
});

async function createEmptyBareRemote(prefix: string) {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(tempDir);
  const path = join(tempDir, "remote.git");
  await git.initBare(path);
  return { tempDir, path, url: `file://${path}` };
}

async function runBash(script: string, env: Record<string, string>) {
  const proc = Bun.spawn(["bash", "-lc", script], {
      stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
      BUN_BIN: (Bun.which("bun") ?? process.execPath),
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
