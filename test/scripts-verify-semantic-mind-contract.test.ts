// ABOUTME: Verifies release readiness preserves the provider-neutral Worker Mind placeholder.
// ABOUTME: Rejects restored provider adapters, ACP registration, or numbered-memory readers.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifySemanticMindContract } from "../scripts/verify-release-readiness";

const repoRoot = join(import.meta.dir, "..");

describe("provider-neutral Worker Mind release gate", () => {
  test("accepts the current placeholder and retained local content contract", () => {
    expect(verifySemanticMindContract(repoRoot)).toEqual({
      name: "semantic Worker Mind contract",
      ok: true,
      details: undefined,
    });
  });

  test("detects provider, ACP, version, and placeholder regressions", () => {
    const placeholder = readFileSync(join(repoRoot, "cli/commands/worker/mind/mind.ts"), "utf8");
    const index = readFileSync(join(repoRoot, "cli/index.ts"), "utf8");
    const result = verifySemanticMindContract(repoRoot, {
      "package.json": JSON.stringify({ version: "1.3.0", dependencies: { "@agentclientprotocol/sdk": "1.3.0" } }),
      "cli/commands/worker/mind/mind.ts": `${placeholder.replaceAll("MIND_BACKEND_UNSELECTED", "MIND_READY")}\nconst BGDB_TOKEN = true;\n`,
      "cli/index.ts": `${index}\nconst AcpCommand = true;\n`,
    });
    expect(result.ok).toBe(false);
    expect(result.details).toContain("package version must be at least 1.4.2");
    expect(result.details).toContain("ACP SDK dependency remains");
    expect(result.details).toContain("Worker Mind placeholder refusal is missing");
    expect(result.details).toContain("retired command registration remains: AcpCommand");
    expect(result.details).toContain("retired provider or numbered-memory residue");
  });

  test("release JSON includes the provider-neutral Mind gate", async () => {
    const proc = Bun.spawn(["bun", "run", "verify:release", "--json"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, QUALITY_GATE_TEST_MODE: "1" },
    });
    const report = JSON.parse(await new Response(proc.stdout).text()) as {
      ok: boolean;
      checks: Array<{ name: string; ok: boolean }>;
    };
    expect(await proc.exited).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual({ name: "semantic Worker Mind contract", ok: true });
  }, 20_000);
});
