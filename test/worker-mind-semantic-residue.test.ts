// ABOUTME: Keeps the retained Worker Mind surface provider-neutral and local-only.
// ABOUTME: Allows Card persona/belief/memory contracts while forbidding active storage adapters.

import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

test("Worker Mind retains local content contracts and one no-provider placeholder", () => {
  expect(existsSync(join(repoRoot, "cli/core/mind-content"))).toBe(true);
  expect(existsSync(join(repoRoot, "cli/core/mind-capability.ts"))).toBe(true);
  expect(existsSync(join(repoRoot, "cli/core/mind-store"))).toBe(false);
  const placeholder = readFileSync(join(repoRoot, "cli/commands/worker/mind/mind.ts"), "utf8");
  expect(placeholder).toContain("MIND_BACKEND_UNSELECTED");
  expect(placeholder).toContain("provider-neutral");
  for (const forbidden of ["BGDB_", "fetch(", "writeFile", "readFile"]) {
    expect(placeholder).not.toContain(forbidden);
  }
});
