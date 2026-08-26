// ABOUTME: Verifies generated command-hook composers bundle and execute policies.
// ABOUTME: Protects card policy imports from depending on extracted node_modules.

import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bundleHookComposer, renderBundledHookComposer } from "../cli/core/hook-generator/bundle-composer";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function runComposer(path: string, payload: unknown) {
  const proc = Bun.spawn([process.execPath, path], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify(payload));
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("bundleHookComposer", () => {
  it("renders deterministic composer bytes without touching the output directory", async () => {
    const root = await createTempRoot("hook-bundle-plan-");
    tempRoots.push(root);
    const policyPath = join(root, "card", "hooks", "observe", "policy.ts");
    const outputDir = join(root, "generated", "hooks", "claude");
    await mkdir(join(root, "card", "hooks", "observe"), { recursive: true });
    await writeFile(policyPath, 'export default { policyKind: "observer" };\n');
    const options = {
      runtime: "claude-code" as const,
      outputDir,
      policies: [{ cardName: "@me/policy", policyName: "observe", policyTsPath: policyPath }],
    };

    const first = await renderBundledHookComposer(options);
    const second = await renderBundledHookComposer(options);
    expect(first).toBe(second);
    await expect(Bun.file(join(outputDir, "composer.mjs")).exists()).resolves.toBe(false);
    expect(await Bun.file(await bundleHookComposer(options)).text()).toBe(first);
  });

  it("bundles a Claude composer that runs card policy code", async () => {
    const root = await createTempRoot("hook-bundle-");
    tempRoots.push(root);
    const policyDir = join(root, "card", "hooks", "deny", "policy.ts");
    await mkdir(join(root, "card", "hooks", "deny"), { recursive: true });
    await writeFile(policyDir, `
      import { defineToolPolicy } from "darwinian/hook-policy";
      export default defineToolPolicy({
        policyKind: "enforcement",
        beforeToolCall(event) {
          return { action: "deny", reason: \`blocked \${event.runtime} \${event.toolName}\` };
        },
      });
    `);

    const composerPath = await bundleHookComposer({
      runtime: "claude-code",
      outputDir: join(root, "generated", "hooks", "claude"),
      policies: [{ cardName: "@me/policy", policyName: "deny", policyTsPath: policyDir }],
    });

    const result = await runComposer(composerPath, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "rm -rf /" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "blocked claude-code Bash",
      },
    });
  });

  it("bundles a Codex composer and preserves corrected ask degradation", async () => {
    const root = await createTempRoot("hook-bundle-");
    tempRoots.push(root);
    const policyDir = join(root, "card", "hooks", "ask", "policy.ts");
    await mkdir(join(root, "card", "hooks", "ask"), { recursive: true });
    await writeFile(policyDir, `
      import { defineToolPolicy } from "darwinian/hook-policy";
      export default defineToolPolicy({
        policyKind: "enforcement",
        beforeToolCall() {
          return { action: "ask", reason: "confirm shell" };
        },
      });
    `);

    const composerPath = await bundleHookComposer({
      runtime: "codex",
      outputDir: join(root, "generated", "hooks", "codex"),
      policies: [{ cardName: "@me/policy", policyName: "ask", policyTsPath: policyDir }],
    });

    const result = await runComposer(composerPath, {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.stdout).not.toContain('"ask"');
  });
});
