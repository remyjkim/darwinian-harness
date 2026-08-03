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

  test("detects V1 readers and ambient inventory activation", () => {
    const machineConfig = readFileSync(join(repoRoot, "cli/core/machine-config.ts"), "utf8");
    const defaults = readFileSync(join(repoRoot, "cli/core/defaults.ts"), "utf8");
    const result = verifyMachineContract(repoRoot, {
      "cli/core/machine-config.ts": `${machineConfig}\nconst retired = machine.capabilities.profile;\n`,
      "cli/core/defaults.ts": defaults.replace(
        "const machine = await readMachineConfig(options.agentsDir);",
        "const curated = await listCuratedSkills(options.agentsDir);\n  const machine = await readMachineConfig(options.agentsDir);\n  void curated;",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("retired V1 machine field");
    expect(result.details).toContain("machine activation reads listCuratedSkills");
  });

  test("detects curation registration, retired profile artifacts, and runtime resolution", () => {
    const index = readFileSync(join(repoRoot, "cli/index.ts"), "utf8");
    const defaults = readFileSync(join(repoRoot, "cli/core/defaults.ts"), "utf8");
    const result = verifyMachineContract(repoRoot, {
      "cli/index.ts": `${index}\ncli.register(SkillsCurateCommand);\n`,
      "registry/machine-profiles.json": '{"schema":"drwn.machine-profiles"}\n',
      "cli/core/defaults.ts": defaults.replace(
        "const machine = await readMachineConfig(options.agentsDir);",
        "await resolveCard(options.agentsDir, '@darwinian/operator@2.0.2');\n  const machine = await readMachineConfig(options.agentsDir);",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("retired curation command SkillsCurateCommand");
    expect(result.details).toContain("retired machine profile artifact remains");
    expect(result.details).toContain("machine activation reads resolveCard(");
  });

  test("detects missing ownership coverage, active legacy docs, and unsafe Store export", () => {
    const ownershipTests = readFileSync(join(repoRoot, "test/scenarios-root-scope.test.ts"), "utf8");
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const index = readFileSync(join(repoRoot, "cli/index.ts"), "utf8");
    const result = verifyMachineContract(repoRoot, {
      "test/scenarios-root-scope.test.ts": ownershipTests.replace(
        'const foreignMcpTargets = ["claude", "codex", "cursor"] as const',
        "ownership case removed",
      ),
      "README.md": `${readme}\ndrwn machine skill enable alpha\n`,
      "cli/index.ts": `${index}\ncli.register(StoreExportCommand);\n`,
      "cli/commands/store/export.ts": "export class StoreExportCommand {}\n",
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("foreign ownership coverage is missing");
    expect(result.details).toContain("prototype machine documentation remains");
    expect(result.details).toContain("public whole-Store export must remain unavailable");
  });

  test("rejects retired machine activation guidance anywhere in shipped documentation", () => {
    const install = readFileSync(join(repoRoot, "INSTALL.md"), "utf8");
    const machineReference = readFileSync(
      join(repoRoot, "docs-docusaurus/docs/reference/cli/machine.md"),
      "utf8",
    );
    const result = verifyMachineContract(repoRoot, {
      "INSTALL.md": `${install}\ndrwn machine skill enable alpha\n`,
      "docs-docusaurus/docs/reference/cli/machine.md": `${machineReference}\ndrwn machine mcp disable github\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("prototype machine documentation remains in INSTALL.md");
    expect(result.details).toContain(
      "prototype machine documentation remains in docs-docusaurus/docs/reference/cli/machine.md",
    );
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
