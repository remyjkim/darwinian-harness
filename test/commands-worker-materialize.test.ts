// ABOUTME: Locks the drwn worker materialize command surface: registration, flag parsing,
// ABOUTME: --json result shape, stderr-only diagnostics, and hard rejection exit codes.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runAgentsCli } from "./helpers";
import { freshRoots, goldenPayload } from "./worker-materialize-fixture";

function envFor(repoRoot: string, roots: { homeDir: string; agentsDir: string }) {
  return { AGENTS_REPO_ROOT: repoRoot, AGENTS_HOME_DIR: roots.homeDir, AGENTS_DIR: roots.agentsDir };
}

describe("drwn worker materialize", () => {
  test("--payload + --json: materializes and reports a machine-readable result on stdout only", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const roots = await freshRoots();
    const payloadPath = join(roots.base, "payload.json");
    await writeFile(payloadPath, JSON.stringify(payload));
    const projectTar = join(roots.base, "project.tar");

    const result = await runAgentsCli(
      [
        "worker", "materialize",
        "--payload", payloadPath,
        "--project-root", roots.projectRoot,
        "--emit-project-tar", projectTar,
        "--json",
      ],
      envFor(repoRoot, roots),
      roots.base,
    );

    expect(result.exitCode, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.cards).toBe(2);
    expect(parsed.staged.config).toBe(join(roots.projectRoot, ".agents", "drwn", "config.json"));
    expect(parsed.staged.lock).toBe(join(roots.projectRoot, ".agents", "drwn", "card.lock"));
    expect(parsed.emitted.projectTar.sha256).toHaveLength(64);
    expect(existsSync(projectTar)).toBe(true);
    expect(existsSync(join(roots.projectRoot, ".claude", "skills", "react"))).toBe(true);
  }, 90_000);

  test("--store-export: a lean payload materializes from external bytes", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const roots = await freshRoots();
    const storePath = join(roots.base, "store-export.tar");
    await writeFile(storePath, Buffer.from(payload.storeExport.bytesBase64, "base64"));
    const lean = JSON.parse(JSON.stringify(payload));
    lean.storeExport.bytesBase64 = "";
    const payloadPath = join(roots.base, "payload.json");
    await writeFile(payloadPath, JSON.stringify(lean));

    const result = await runAgentsCli(
      [
        "worker", "materialize",
        "--payload", payloadPath,
        "--project-root", roots.projectRoot,
        "--store-export", storePath,
        "--json",
      ],
      envFor(repoRoot, roots),
      roots.base,
    );

    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).cards).toBe(2);
    expect(existsSync(join(roots.projectRoot, ".claude", "skills", "react"))).toBe(true);
  }, 90_000);

  test("an unsupported contract version exits 1 with the reason on stderr and stdout silent", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const roots = await freshRoots();
    const forward = JSON.parse(JSON.stringify(payload));
    forward.contractVersion = 2;
    const payloadPath = join(roots.base, "payload.json");
    await writeFile(payloadPath, JSON.stringify(forward));

    const result = await runAgentsCli(
      ["worker", "materialize", "--payload", payloadPath, "--project-root", roots.projectRoot, "--json"],
      envFor(repoRoot, roots),
      roots.base,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("contractVersion 2");
    expect(result.stdout.trim()).toBe("");
    expect(existsSync(join(roots.projectRoot, ".agents"))).toBe(false);
  }, 90_000);
});
