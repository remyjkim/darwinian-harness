// ABOUTME: Locks the I220 retirement: authoring validation rejects permissions and escalation
// ABOUTME: with errors naming the field and the issue; clean manifests are unaffected.

import { describe, expect, test } from "bun:test";
import { validateCardManifest } from "../cli/core/card-manifest";

const base = {
  name: "@test/blueprint",
  version: "1.0.0",
  kind: "blueprint",
  composedFrom: ["@test/member@^1.0.0"],
};

describe("retired governance fields (I220)", () => {
  test("permissions is rejected at authoring validation, naming the field and I220", () => {
    const result = validateCardManifest({ ...base, permissions: { anything: true } });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("permissions");
    expect(result.errors.join(" ")).toContain("I220");
  });

  test("escalation is rejected at authoring validation, naming the field and I220", () => {
    const result = validateCardManifest({ ...base, escalation: { humanOwner: "someone" } });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("escalation");
    expect(result.errors.join(" ")).toContain("I220");
  });

  test("a clean blueprint manifest still validates", () => {
    const result = validateCardManifest(base);
    expect(result.ok).toBe(true);
  });
});
