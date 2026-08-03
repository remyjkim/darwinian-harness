// ABOUTME: Runs a Bash workflow for aggregate Worker materialization and singular selection.
// ABOUTME: Exercises the supported shell-facing Worker contract through the public CLI.

import { afterEach, expect, test as baseTest } from "bun:test";
import { fileURLToPath } from "node:url";
const test = baseTest.skipIf(process.platform === "win32");
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("bash CLI materializes alternative roots and projects only the selected Worker", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishWorker(fixture, "@team/base", "alpha");
  await publishWorker(fixture, "@team/overlay", "beta");
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);

  const result = await runBash(
    `
set -euo pipefail
cd "$PROJECT_DIR"
"$BUN_BIN" run "$DRWN_ENTRYPOINT" apply @team/base@1.0.0 @team/overlay@1.0.0 --active @team/base --write > "$WRITE_ONE"
test -f .agents/drwn/generated/workers.json
test -d .agents/drwn/generated/workers/@team/base
test -d .agents/drwn/generated/workers/@team/overlay
test -d .claude/skills/alpha
test ! -e .claude/skills/beta
"$BUN_BIN" run "$DRWN_ENTRYPOINT" use --none > "$CLEAR_ONE"
test ! -e .claude/skills/alpha
test ! -e .claude/skills/beta
"$BUN_BIN" run "$DRWN_ENTRYPOINT" use @team/base > "$USE_ONE"
test -d .claude/skills/alpha
test ! -e .claude/skills/beta
"$BUN_BIN" run "$DRWN_ENTRYPOINT" use @team/overlay > "$USE_TWO"
test ! -e .claude/skills/alpha
test -d .claude/skills/beta
node <<'NODE'
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(process.env.PROJECT_DIR, '.agents/drwn/config.json'), 'utf8'));
if (config.activeWorker !== '@team/overlay') throw new Error('bad active Worker');
NODE
`,
    {
      ...envFor(fixture),
      PROJECT_DIR: projectDir,
      WRITE_ONE: join(fixture.root, "write-one.json"),
      CLEAR_ONE: join(fixture.root, "clear-one.json"),
      USE_ONE: join(fixture.root, "use-one.json"),
      USE_TWO: join(fixture.root, "use-two.json"),
    },
  );

  expect(result.exitCode).toBe(0);
});

async function publishWorker(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, name: string, skill: string) {
  const { createCatalogCardSource } = await import("./helpers");
  const sourceDir = await createCatalogCardSource(fixture, name);
  const manifest = JSON.parse(await Bun.file(join(sourceDir, "card.json")).text());
  manifest.skills = { include: [skill] };
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir, "skills", skill), { recursive: true });
  await writeFile(join(sourceDir, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n`);
  expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
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
