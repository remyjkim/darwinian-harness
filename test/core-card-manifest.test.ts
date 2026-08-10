// ABOUTME: Verifies Card manifest validation and naming rules.
// ABOUTME: Protects the authoring contract before card commands consume manifests.

import { expect, test } from "bun:test";
import { validateCardManifest } from "../cli/core/card-manifest";

test("validateCardManifest accepts a minimal valid manifest", () => {
  expect(validateCardManifest({ name: "@me/backend", version: "1.0.0" })).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest delegates strict runtime-admission declarations", () => {
  expect(validateCardManifest({
    name: "@me/backend",
    version: "1.0.0",
    runtimeAdmission: { version: 1, servers: {}, requirements: [] },
    applicationRequirements: { version: 1, apps: [] },
  })).toEqual({ ok: true, errors: [] });

  const invalid = validateCardManifest({
    name: "@me/backend",
    version: "1.0.0",
    runtimeAdmission: { version: 1, servers: {}, requirements: [], fallback: true },
  });
  expect(invalid.ok).toBe(false);
  expect(invalid.errors.join("\n")).toContain("runtimeAdmission");
});

test("validateCardManifest rejects missing name or version", () => {
  const result = validateCardManifest({});
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("name is required");
  expect(result.errors).toContain("version is required");
});

test("validateCardManifest rejects invalid semver in version", () => {
  const result = validateCardManifest({ name: "@me/backend", version: "v1" });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("version must be strict semver");
});

test("validateCardManifest rejects card-level skills.exclude", () => {
  const result = validateCardManifest({ name: "@me/backend", version: "1.0.0", skills: { exclude: ["x"] } });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("skills.exclude is not allowed in card manifests");
});

test("validateCardManifest rejects non-empty skills.shared", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    skills: { include: ["alpha"], shared: ["beta"] },
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toContain("skills.shared is reserved for Wave 2");
});

test("validateCardManifest accepts skills.shared if absent or empty array", () => {
  expect(validateCardManifest({ name: "@me/x", version: "1.0.0", skills: { include: ["a"] } }).ok).toBe(true);
  expect(validateCardManifest({ name: "@me/x", version: "1.0.0", skills: { include: ["a"], shared: [] } }).ok).toBe(true);
});

test("validateCardManifest accepts hooks.include declarations", () => {
  expect(validateCardManifest({ name: "@me/x", version: "1.0.0", hooks: { include: ["audit"] } })).toEqual({
    ok: true,
    errors: [],
  });
});

test("validateCardManifest rejects card-level hooks.exclude and hooks.shared", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    hooks: { include: ["audit"], exclude: ["audit"], shared: ["remote"] },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("hooks.exclude is not allowed in card manifests");
  expect(result.errors).toContain("hooks.shared is not allowed in card manifests");
});

test("validateCardManifest rejects non-array hooks.include", () => {
  const result = validateCardManifest({ name: "@me/x", version: "1.0.0", hooks: { include: "audit" } });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("hooks.include must be an array");
});

test("validateCardManifest accepts persona/beliefs sections with visibility", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    persona: { include: ["voice"], visibility: "internal" },
    beliefs: { include: ["quality"], visibility: "private" },
  });

  expect(result).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest requires visibility when persona include is non-empty", () => {
  const result = validateCardManifest({ name: "@me/mind", version: "1.0.0", persona: { include: ["voice"] } });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("persona.visibility is required when include is non-empty");
});

test("validateCardManifest rejects persona exclude/shared and invalid visibility", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    persona: { include: ["voice"], visibility: "secret", exclude: ["x"], shared: ["y"] },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("persona.exclude is not allowed in card manifests");
  expect(result.errors).toContain("persona.shared is not allowed in card manifests");
  expect(result.errors).toContain("persona.visibility must be private, internal, or public");
});

test("validateCardManifest rejects unsafe persona include entries", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    persona: { include: ["../escape"], visibility: "private" },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("persona.include contains invalid entry: ../escape");
});

test("validateCardManifest accepts fixed semantic memory declarations", () => {
  for (const memory of [
    {},
    { observations: { format: "jsonl" } },
    { insights: { format: "md" } },
    { observations: { format: "jsonl" }, insights: { format: "md" } },
  ]) {
    expect(validateCardManifest({ name: "@me/mind", version: "1.0.0", memory })).toEqual({ ok: true, errors: [] });
  }
});

test("validateCardManifest requires the fixed format for each semantic memory kind", () => {
  for (const [memory, error] of [
    [{ observations: {} }, "memory.observations.format is required and must be jsonl"],
    [{ observations: { format: "md" } }, "memory.observations.format is required and must be jsonl"],
    [{ observations: { format: "mixed" } }, "memory.observations.format is required and must be jsonl"],
    [{ insights: {} }, "memory.insights.format is required and must be md"],
    [{ insights: { format: "jsonl" } }, "memory.insights.format is required and must be md"],
    [{ insights: { format: "mixed" } }, "memory.insights.format is required and must be md"],
  ] as const) {
    const result = validateCardManifest({ name: "@me/mind", version: "1.0.0", memory });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(error);
  }
});

test("validateCardManifest rejects numbered, reserved, and unknown memory kinds", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    memory: {
      l4: { format: "md" },
      l5: { format: "jsonl" },
      l6: { format: "mixed" },
      raw_data: { format: "jsonl" },
      summaries: { format: "md" },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("unsupported memory kind: l4");
  expect(result.errors).toContain("unsupported memory kind: l5");
  expect(result.errors).toContain("unsupported memory kind: l6");
  expect(result.errors).toContain("memory kind raw_data is reserved but unsupported");
  expect(result.errors).toContain("unsupported memory kind: summaries");
  expect(result.errors.join("\n")).not.toContain("memory layer");
});

test("validateCardManifest rejects non-objects and unknown semantic memory fields", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    memory: {
      observations: { format: "jsonl", include: ["capture"], visibility: "private", extra: true },
      insights: "md",
    },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("memory.observations.include is not allowed");
  expect(result.errors).toContain("memory.observations.visibility is not allowed");
  expect(result.errors).toContain("memory.observations.extra is not allowed");
  expect(result.errors).toContain("memory.insights must be an object");
});

test("validateCardManifest rejects format on persona and beliefs", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    persona: { include: ["voice"], visibility: "public", format: "md" },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("persona.format is not allowed in card manifests");
});

test("validateCardManifest accepts a full blueprint manifest", () => {
  expect(
    validateCardManifest({
      name: "@me/frontend-eng",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: ["@me/a@^1.0.0", "@me/b@^1.0.0"],
      tools: { allow: ["Bash"], deny: ["WebFetch"] },
      evals: ["passes_tests"],
      contextMounts: { read: ["/eng/frontend"], writeProposals: ["/eng/frontend/wm"] },
      identity: { role: "frontend-engineer" },
    }),
  ).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest accepts an empty (degenerate) blueprint", () => {
  expect(validateCardManifest({ name: "@me/bp", version: "1.0.0", kind: "blueprint" })).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest rejects composedFrom/governance on a non-blueprint card", () => {
  for (const field of ["composedFrom", "tools", "evals", "contextMounts", "identity"] as const) {
    const value = field === "composedFrom" || field === "evals" ? ["@me/x@^1.0.0"] : {};
    const result = validateCardManifest({ name: "@me/x", version: "1.0.0", [field]: value });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`${field} requires kind: "blueprint"`);
  }
});

test("validateCardManifest rejects malformed blueprint governance shapes", () => {
  const result = validateCardManifest({
    name: "@me/bp",
    version: "1.0.0",
    kind: "blueprint",
    composedFrom: ["@me/a@^1.0.0", ""],
    tools: { allow: "Bash" },
    evals: [1],
    identity: "me",
  });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("composedFrom must be an array of non-empty card refs");
  expect(result.errors).toContain("tools.allow must be an array of strings");
  expect(result.errors).toContain("evals must be an array of strings");
  expect(result.errors).toContain("identity must be an object");
});

test("validateCardManifest accepts optional quality fields", () => {
  expect(
    validateCardManifest({
      name: "@me/x",
      version: "1.0.0",
      stability: "production",
      lastValidatedWith: "0.1.0",
      testStatusBadge: "https://example.com/status.svg",
    }),
  ).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest rejects invalid quality fields", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    stability: "almost-ready",
    lastValidatedWith: "current",
    testStatusBadge: "file:///tmp/status.svg",
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("stability must be experimental, stable, or production");
  expect(result.errors).toContain("lastValidatedWith must be strict semver");
  expect(result.errors).toContain("testStatusBadge must be an http(s) URL");
});
