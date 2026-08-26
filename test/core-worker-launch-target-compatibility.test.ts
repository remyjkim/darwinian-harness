// ABOUTME: Verifies credential-free Claude and Codex launch-surface characterization.
// ABOUTME: Uses fake target executables so the default suite never needs target auth or installed clients.

import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fakeTarget(root: string, name: string, source: string) {
  const path = join(root, name);
  await writeFile(path, `#!/bin/sh\nset -eu\n${source}\n`);
  await chmod(path, 0o755);
  return path;
}

async function runVerifier(options: { omitCodexDelta?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-targets-"));
  roots.push(root);
  const claude = await fakeTarget(root, "claude", `
if [ "\${1:-}" = "--version" ]; then echo "2.1.212 (Claude Code)"; exit 0; fi
if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "validate" ]; then echo "Validation passed"; exit 0; fi
exit 64`);
  const codexMarkers = options.omitCodexDelta
    ? "ROOT_INSTRUCTION_MARKER base-probe-skill"
    : "ROOT_INSTRUCTION_MARKER NESTED_DELTA_INSTRUCTION_MARKER base-probe-skill nested-delta-probe";
  const codex = await fakeTarget(root, "codex", `
if [ "\${1:-}" = "--version" ]; then echo "codex-cli 0.149.0"; exit 0; fi
case " $* " in
  *" debug prompt-input "*) printf '%s\\n' '[{"type":"message","content":[{"type":"input_text","text":"${codexMarkers}"}]}]'; exit 0 ;;
  *" mcp list --json "*)
    case "$PWD" in
      */project/.agents/drwn/generated/launch-context-probe/workspace) printf '%s\\n' '[{"name":"base_probe"},{"name":"nested_probe"}]' ;;
      *) printf '%s\\n' '[]' ;;
    esac
    exit 0 ;;
esac
exit 64`);

  const proc = Bun.spawn([
    process.execPath,
    "run",
    "scripts/verify-worker-launch-targets.ts",
    "--json",
  ], {
    cwd: join(import.meta.dir, ".."),
    env: {
      ...process.env,
      DRWN_CLAUDE_BIN: claude,
      DRWN_CODEX_BIN: codex,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: await proc.exited,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

test("credential-free target verifier proves Claude plugin and Codex nested-layer contracts", async () => {
  const result = await runVerifier();

  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    schema: "drwn.worker-launch-target-compatibility",
    schemaVersion: 1,
    ok: true,
    targets: {
      claude: { version: "2.1.212", pluginValidated: true },
      codex: {
        version: "0.149.0",
        rootInstructions: true,
        deltaInstructions: true,
        rootSkills: true,
        deltaSkills: true,
        rootMcp: true,
        deltaMcp: true,
      },
    },
  });
});

test("target verifier fails closed when Codex omits the nested delta without echoing raw output", async () => {
  const result = await runVerifier({ omitCodexDelta: true });

  expect(result.exitCode).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.ok).toBe(false);
  expect(report.targets.codex.deltaInstructions).toBe(false);
  expect(report.targets.codex.deltaSkills).toBe(false);
  expect(result.stdout).not.toContain("ROOT_INSTRUCTION_MARKER");
  expect(result.stdout).not.toContain("base-probe-skill");
});
