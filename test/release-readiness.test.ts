// ABOUTME: Verifies release readiness enforces the target-native ambient MCP collision contract.
// ABOUTME: Keeps stable reason codes, redaction, atomic preflight, and shared diagnostics in the release gate.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  verifyAmbientMcpPolicy,
  verifyRecommendedMachineWorkerContract,
} from "../scripts/verify-release-readiness";
import { MACHINE_WORKER_REGISTRY } from "../cli/core/machine-worker-contract";

const repoRoot = join(import.meta.dir, "..");

describe("ambient MCP policy release gate", () => {
  test("accepts the current target-native policy", () => {
    expect(verifyAmbientMcpPolicy(repoRoot)).toEqual({
      name: "ambient MCP policy",
      ok: true,
      details: undefined,
    });
  });

  test("detects a missing stable reason code", () => {
    const policy = readFileSync(join(repoRoot, "cli/core/ambient-policy.ts"), "utf8");
    const result = verifyAmbientMcpPolicy(repoRoot, {
      "cli/core/ambient-policy.ts": policy.replaceAll(
        "CURSOR_PROJECT_TRANSPORT_OVERRIDE",
        "CURSOR_REASON_REMOVED",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("CURSOR_PROJECT_TRANSPORT_OVERRIDE");
  });

  test("detects missing secret-redaction coverage", () => {
    const classifierTests = readFileSync(join(repoRoot, "test/core-ambient-policy.test.ts"), "utf8");
    const result = verifyAmbientMcpPolicy(repoRoot, {
      "test/core-ambient-policy.test.ts": classifierTests.replaceAll(
        "user-secret-sentinel",
        "redaction-case-removed",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("secret redaction coverage");
  });

  test("detects missing full-command atomicity coverage", () => {
    const writeTests = readFileSync(join(repoRoot, "test/commands-write.test.ts"), "utf8");
    const result = verifyAmbientMcpPolicy(repoRoot, {
      "test/commands-write.test.ts": writeTests.replace(
        "fatal selected-target MCP preflight aborts every projection mutation",
        "atomicity coverage removed",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("full-command atomicity coverage");
  });

  test("detects restoration of the old Codex skip or force-bypass path", () => {
    const sync = readFileSync(join(repoRoot, "cli/core/sync.ts"), "utf8");
    const result = verifyAmbientMcpPolicy(repoRoot, {
      "cli/core/sync.ts": `${sync}\nconst codexConflicts = detectCodexLayerConflicts(globalText, servers);\n` +
        'warnings.push("skipped the project-scope entry; rerun with --force");\n',
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("retired Codex collision path");
  });

  test("release JSON includes the ambient MCP policy gate", async () => {
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
    expect(report.checks).toContainEqual({ name: "ambient MCP policy", ok: true });
  }, 20_000);
});

describe("recommended machine Worker release gate", () => {
  test("accepts the immutable recommended Blueprint descriptor", () => {
    expect(verifyRecommendedMachineWorkerContract(repoRoot)).toEqual({
      name: "recommended machine Worker contract",
      ok: true,
      details: undefined,
    });
  });

  test("rejects a missing descriptor", () => {
    const result = verifyRecommendedMachineWorkerContract(repoRoot, {
      "registry/machine-workers.json": "",
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("registry/machine-workers.json");
  });

  test("rejects the bootstrap and incompatible personal-harness closure", () => {
    const registry = JSON.parse(JSON.stringify(MACHINE_WORKER_REGISTRY));
    registry.workers[0].source = "git+https://github.com/curation-labs/machine-defaults.git#v1.0.0";
    registry.workers[0].version = "1.0.0";
    registry.workers[0].members.push({
      name: "@remyjkim/personal-harness",
      source: "git+https://github.com/remyjkim/personal-harness-card.git#v0.1.0",
    });

    const result = verifyRecommendedMachineWorkerContract(repoRoot, {
      "registry/machine-workers.json": `${JSON.stringify(registry, null, 2)}\n`,
    });

    expect(result.ok).toBe(false);
  });
});
