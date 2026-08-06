// ABOUTME: End-to-end materialize from a golden payload built by the real payload builder:
// ABOUTME: store seeding, project staging, install/write composition, and path portability.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { materializeWorkerPayload } from "../cli/core/worker-materialize";
import { freshRoots, goldenPayload } from "./worker-materialize-fixture";

describe("materializeWorkerPayload", () => {
  test("single-shot on clean roots: store seeded, project staged, cards resolve, write projects", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const roots = await freshRoots();
    const result = await materializeWorkerPayload({ payload, repoRoot, ...roots });

    expect(result.cards).toBe(2);
    // Store seeded (T3): the V2 layout landed under the agents dir.
    expect(existsSync(join(roots.agentsDir, "drwn", "store.json"))).toBe(true);
    // Project staged (T1/T2): derived config + lock bytes on disk and valid.
    const config = JSON.parse(await readFile(join(roots.projectRoot, ".agents", "drwn", "config.json"), "utf8"));
    expect(config.activeWorker).toBe("@me/frontend-eng");
    const lock = JSON.parse(await readFile(join(roots.projectRoot, ".agents", "drwn", "card.lock"), "utf8"));
    expect(lock.schema).toBe("drwn.project-lock");
    expect(lock.cards[0].path.startsWith(roots.agentsDir)).toBe(true);
    // Write projected: the skill reached the project surface.
    expect(existsSync(join(roots.projectRoot, ".claude", "skills", "react"))).toBe(true);
  }, 60_000);

  test("path portability: the same payload materializes into a second, different root", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const first = await freshRoots();
    const second = await freshRoots();
    await materializeWorkerPayload({ payload, repoRoot, ...first });
    const result = await materializeWorkerPayload({ payload, repoRoot, ...second });
    expect(result.cards).toBe(2);
    expect(existsSync(join(second.projectRoot, ".claude", "skills", "react"))).toBe(true);
  }, 90_000);
});
