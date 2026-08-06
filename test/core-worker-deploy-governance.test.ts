// ABOUTME: Locks I220's payload behavior: the deploy governance block never carries the retired
// ABOUTME: fields, even when a legacy manifest object still holds them at runtime.

import { describe, expect, test } from "bun:test";
import { governanceFromEntry } from "../cli/core/worker-deploy";
import type { CardLockEntry } from "../cli/core/card-lock";

function legacyEntry(): CardLockEntry {
  const manifest = {
    name: "@test/legacy-blueprint",
    version: "1.0.0",
    kind: "blueprint",
    composedFrom: ["@test/member@^1.0.0"],
    tools: { allow: ["a"], deny: ["b"] },
    // Legacy published bytes may still carry retired fields at runtime.
    permissions: { anything: true },
    escalation: { humanOwner: "someone" },
  } as unknown as CardLockEntry["manifest"];
  return {
    name: "@test/legacy-blueprint",
    requested: "@test/legacy-blueprint@1.0.0",
    version: "1.0.0",
    path: "/tmp/x",
    integrity: "sha256-x",
    treeSha: "abc",
    manifest,
    skills: [],
    hooks: [],
    registry: null,
    origin: "store",
    git: { commit: "deadbeef" },
  } as CardLockEntry;
}

describe("deploy governance after I220", () => {
  test("governance omits permissions and escalation even from legacy manifests", () => {
    const governance = governanceFromEntry(legacyEntry());
    expect(governance).not.toBeNull();
    expect(Object.keys(governance ?? {})).not.toContain("permissions");
    expect(Object.keys(governance ?? {})).not.toContain("escalation");
    expect((governance as { tools?: unknown }).tools).toEqual({ allow: ["a"], deny: ["b"] });
  });
});
