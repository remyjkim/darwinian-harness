// ABOUTME: Verifies release readiness enforces the first supported machine capability contract.
// ABOUTME: Keeps prototype state, implicit activation, mutable profiles, and unsafe projection out of releases.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyMachineContract } from "../scripts/verify-release-readiness";

const repoRoot = join(import.meta.dir, "..");

describe("machine capability release gate", () => {
  test("accepts the current first-supported machine contract", () => {
    expect(verifyMachineContract(repoRoot)).toEqual({
      name: "machine capability contract",
      ok: true,
      details: undefined,
    });
  });

  test("detects prototype readers and implicit optional or curated activation", () => {
    const userConfig = readFileSync(join(repoRoot, "cli/core/user-config.ts"), "utf8");
    const defaults = readFileSync(join(repoRoot, "cli/core/defaults.ts"), "utf8");
    const result = verifyMachineContract(repoRoot, {
      "cli/core/user-config.ts": `${userConfig}\nconst prototypeMachine = input.defaults;\n`,
      "cli/core/defaults.ts": defaults.replace(
        "const machine = await readMachineConfig(options.agentsDir);",
        "const curated = await listCuratedSkills(options.agentsDir);\n  const machine = await readMachineConfig(options.agentsDir);\n  void curated;",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("prototype machine field defaults");
    expect(result.details).toContain("machine activation reads listCuratedSkills");
  });

  test("detects curation registration, mutable profile ranges, and runtime profile fetches", () => {
    const index = readFileSync(join(repoRoot, "cli/index.ts"), "utf8");
    const registry = readFileSync(join(repoRoot, "registry/machine-profiles.json"), "utf8");
    const defaults = readFileSync(join(repoRoot, "cli/core/defaults.ts"), "utf8");
    const result = verifyMachineContract(repoRoot, {
      "cli/index.ts": `${index}\ncli.register(SkillsCurateCommand);\n`,
      "registry/machine-profiles.json": registry.replaceAll("#v2.0.0", "#^2.0.0"),
      "cli/core/defaults.ts": defaults.replace(
        "const machine = await readMachineConfig(options.agentsDir);",
        "await resolveCard(options.agentsDir, '@darwinian/operator@^2.0.0');\n  const machine = await readMachineConfig(options.agentsDir);",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("retired curation command SkillsCurateCommand");
    expect(result.details).toContain("exact Operator source");
    expect(result.details).toContain("machine activation performs runtime profile resolution");
  });

  test("detects missing ownership coverage, stale Operator pins, and unsafe Store export", () => {
    const ownershipTests = readFileSync(join(repoRoot, "test/scenarios-root-scope.test.ts"), "utf8");
    const registry = readFileSync(join(repoRoot, "registry/machine-profiles.json"), "utf8");
    const index = readFileSync(join(repoRoot, "cli/index.ts"), "utf8");
    const result = verifyMachineContract(repoRoot, {
      "test/scenarios-root-scope.test.ts": ownershipTests.replace(
        'const foreignMcpTargets = ["claude", "codex", "cursor"] as const',
        "ownership case removed",
      ),
      "registry/machine-profiles.json": registry.replaceAll("2.0.0", "2.0.1"),
      "cli/index.ts": `${index}\ncli.register(StoreExportCommand);\n`,
      "cli/commands/store/export.ts": "export class StoreExportCommand {}\n",
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("foreign ownership coverage is missing");
    expect(result.details).toContain("Operator version must be 2.0.0");
    expect(result.details).toContain("public whole-Store export must remain unavailable");
  });

  test("enforces the separate strict user-preferences contract", () => {
    const preferences = readFileSync(join(repoRoot, "cli/core/user-preferences.ts"), "utf8");
    const result = verifyMachineContract(repoRoot, {
      "cli/core/user-preferences.ts": preferences
        .replace('z.literal("drwn.user-preferences")', "z.string()")
        .replace("}).strict();", "}).passthrough();"),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("cli/core/user-preferences.ts is missing");
  });

  test("release JSON includes the machine capability contract gate", async () => {
    const proc = Bun.spawn(["bun", "run", "verify:release", "--json"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, QUALITY_GATE_TEST_MODE: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const report = JSON.parse(stdout) as {
      ok: boolean;
      checks: Array<{ name: string; ok: boolean }>;
    };

    expect(await proc.exited).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual({ name: "machine capability contract", ok: true });
  }, 20_000);
});
