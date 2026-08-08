// ABOUTME: Verifies release readiness enforces the first supported project Worker contract.
// ABOUTME: Keeps prototype surfaces, machine leakage, member-root generation, and unsafe export out of releases.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyWorkerContract } from "../scripts/verify-release-readiness";

const repoRoot = join(import.meta.dir, "..");

describe("Worker contract release gate", () => {
  test("accepts the current first-supported contract", () => {
    expect(verifyWorkerContract(repoRoot)).toEqual({
      name: "project Worker contract",
      ok: true,
      details: undefined,
    });
  });

  test("detects prototype readers, retired command registrations, and stale docs", () => {
    const projectSource = readFileSync(join(repoRoot, "cli/core/project.ts"), "utf8");
    const indexSource = readFileSync(join(repoRoot, "cli/index.ts"), "utf8");
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const result = verifyWorkerContract(repoRoot, {
      "cli/core/project.ts": `${projectSource}\nconst oldSelection = input.activeWorkers;\n`,
      "cli/index.ts": `${indexSource}\ncli.register(CardApplyCommand);\n`,
      "README.md": `${readme}\ndrwn worker stack list\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("prototype project field activeWorkers");
    expect(result.details).toContain("retired project command CardApplyCommand");
    expect(result.details).toContain("prototype documentation");
  });

  test("detects migration adapters", () => {
    const result = verifyWorkerContract(repoRoot, {
      "cli/core/migrate-vendor.ts": "export function migratePrototypeProject() {}\n",
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("prototype migration adapter");
  });

  test("requires exact 1.2.0 package identity derived by the runtime while preserving the 1.1.0 hard-cut floor", () => {
    const result = verifyWorkerContract(repoRoot, {
      "package.json": JSON.stringify({ version: "0.9.0" }),
      "cli/core/version.ts": 'export const DRWN_VERSION = "0.9.0";\n',
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("package version must be 1.2.0");
    expect(result.details).toContain("runtime version must derive from adjacent package metadata");
    expect(result.details).toContain("package version must be at least the 1.1.0 Worker hard-cut floor");
  });

  test("requires the governed Buzz Card to keep its independent 1.2.0 harness floor", () => {
    const buzz = readFileSync(join(repoRoot, "registry/cards/buzz-delivery-worker/card.json"), "utf8");
    const result = verifyWorkerContract(repoRoot, {
      "registry/cards/buzz-delivery-worker/card.json": buzz.replace('"minVersion": "1.2.0"', '"minVersion": "1.1.0"'),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("Buzz delivery Card harness.minVersion must be 1.2.0");
  });

  test("release JSON includes the Worker contract gate", async () => {
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
    expect(report.checks).toContainEqual({ name: "project Worker contract", ok: true });
  }, 20_000);
});
