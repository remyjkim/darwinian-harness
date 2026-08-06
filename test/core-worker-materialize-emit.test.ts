// ABOUTME: Locks I221's snapshot emission: the project tar carries exactly config + lock
// ABOUTME: (V2 invariant 8), and a restore replica from the emitted tars materializes clean.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { extract, list } from "../cli/core/archive";
import { materializeWorkerPayload } from "../cli/core/worker-materialize";
import { runAgentsCli } from "./helpers";
import { freshRoots, goldenPayload } from "./worker-materialize-fixture";

describe("materializeWorkerPayload snapshot emission", () => {
  test("the project tar contains exactly drwn/config.json and drwn/card.lock, with reported digests", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const roots = await freshRoots();
    const projectTar = join(roots.base, "project.tar");
    const result = await materializeWorkerPayload({ payload, repoRoot, ...roots, emitProjectTar: projectTar });

    expect((await list(projectTar)).sort()).toEqual(["drwn/card.lock", "drwn/config.json"]);
    const bytes = await readFile(projectTar);
    expect(result.emitted.projectTar).toEqual({
      path: projectTar,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.byteLength,
    });
  }, 60_000);

  test("the store tar re-archives the seeded store", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const roots = await freshRoots();
    const storeTar = join(roots.base, "store.tar");
    const result = await materializeWorkerPayload({ payload, repoRoot, ...roots, emitStoreTar: storeTar });

    const members = await list(storeTar);
    expect(members).toContain("drwn/store.json");
    expect(result.emitted.storeTar?.path).toBe(storeTar);
    expect(result.emitted.storeTar?.sha256).toHaveLength(64);
  }, 60_000);

  test("restore replica: the emitted tars rebuild a clean project in the same layout via the real CLI", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const roots = await freshRoots();
    const projectTar = join(roots.base, "project.tar");
    const storeTar = join(roots.base, "store.tar");
    await materializeWorkerPayload({
      payload,
      repoRoot,
      ...roots,
      emitProjectTar: projectTar,
      emitStoreTar: storeTar,
    });

    // The container reboots: same absolute layout, empty roots, only the two tars survive.
    await rm(roots.projectRoot, { recursive: true, force: true });
    await rm(roots.homeDir, { recursive: true, force: true });
    await extract(projectTar, join(roots.projectRoot, ".agents"));
    await extract(storeTar, roots.agentsDir);

    // Boot sequence: the real CLI, exactly as the container runs it.
    const env = { AGENTS_REPO_ROOT: repoRoot, AGENTS_HOME_DIR: roots.homeDir, AGENTS_DIR: roots.agentsDir };
    const install = await runAgentsCli(["install", "--frozen"], env, roots.projectRoot);
    expect(install.exitCode, install.stderr).toBe(0);
    const write = await runAgentsCli(["write"], env, roots.projectRoot);
    expect(write.exitCode, write.stderr).toBe(0);
    // The reproduced breaker surfaced as managed-content drift refusals on restore.
    expect(`${write.stdout}\n${write.stderr}`).not.toContain("drift");

    expect(existsSync(join(roots.projectRoot, ".claude", "skills", "react"))).toBe(true);
  }, 120_000);
});
