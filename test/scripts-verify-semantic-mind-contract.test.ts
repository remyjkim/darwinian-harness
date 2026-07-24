// ABOUTME: Verifies release readiness preserves the semantic Worker Mind contract in the current drwn release.
// ABOUTME: Rejects numbered-memory readers, weak indexes, and version-floor regression.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifySemanticMindContract } from "../scripts/verify-release-readiness";

const repoRoot = join(import.meta.dir, "..");

describe("semantic Worker Mind release gate", () => {
  test("accepts the current hard-cut contract", () => {
    expect(verifySemanticMindContract(repoRoot)).toEqual({
      name: "semantic Worker Mind contract",
      ok: true,
      details: undefined,
    });
  });

  test("detects version, numbered-reader, and strict-index regressions", () => {
    const manifest = readFileSync(join(repoRoot, "cli/core/card-manifest.ts"), "utf8");
    const index = readFileSync(join(repoRoot, "cli/core/mind-store/mind-index.ts"), "utf8");
    const result = verifySemanticMindContract(repoRoot, {
      "package.json": JSON.stringify({ version: "0.8.0" }),
      "cli/core/card-manifest.ts": `${manifest}\nexport type MemoryLayerName = "legacy";\n`,
      "cli/core/mind-store/mind-index.ts": index.replace("drwn.mind-index", "prototype.mind-index"),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("package version must be 1.0.0");
    expect(result.details).toContain("numbered-memory reader");
    expect(result.details).toContain("strict mind index schema");
  });

  test("release JSON includes the semantic Mind gate", async () => {
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
