// ABOUTME: Verifies strict Worker runtime-admission and application declaration parsing.
// ABOUTME: Pins the hard-cut declaration contract before deploy derivation consumes it.

import { describe, expect, test } from "bun:test";
import { validateRuntimeAdmissionDeclarations } from "../cli/core/runtime-admission-manifest";

const artifactSha256 = "a".repeat(64);

function rawServer(overrides: Record<string, unknown> = {}) {
  return {
    description: "Synthetic Buzz tools",
    transport: "stdio",
    command: "drwn",
    args: ["worker", "buzz-tools"],
    optional: false,
    ...overrides,
  };
}

function completeDeclarations(overrides: Record<string, unknown> = {}) {
  return {
    servers: { "buzz-tools": rawServer() },
    runtimeAdmission: {
      version: 1,
      servers: { "buzz-tools": { authMode: "none", requirementIds: ["buzz-sha", "glibc"] } },
      requirements: [
        {
          requirementId: "buzz-sha",
          probeId: "buzz-artifact-sha256-v1",
          expected: { artifactSha256 },
        },
        {
          requirementId: "glibc",
          probeId: "glibc-version-v1",
          expected: { platformCapabilities: ["glibc>=2.31"] },
        },
      ],
    },
    applicationRequirements: {
      version: 1,
      apps: [
        {
          app: "buzz",
          card: {
            server: "buzz-tools",
            authMode: "none",
            certification: "security-approved",
          },
          pipedreamApp: "buzz",
        },
      ],
    },
    ...overrides,
  };
}

test("accepts complete strict declarations and explicit empty intent", () => {
  expect(validateRuntimeAdmissionDeclarations(completeDeclarations())).toEqual({ ok: true, errors: [] });
  expect(validateRuntimeAdmissionDeclarations({
    runtimeAdmission: { version: 1, servers: {}, requirements: [] },
    applicationRequirements: { version: 1, apps: [] },
  })).toEqual({ ok: true, errors: [] });
  expect(validateRuntimeAdmissionDeclarations({})).toEqual({ ok: true, errors: [] });
});

test("rejects null, wrong versions, and wrong top-level declaration types", () => {
  for (const [field, value] of [
    ["runtimeAdmission", null],
    ["runtimeAdmission", []],
    ["runtimeAdmission", { version: 2, servers: {}, requirements: [] }],
    ["applicationRequirements", null],
    ["applicationRequirements", []],
    ["applicationRequirements", { version: 2, apps: [] }],
  ] as const) {
    const result = validateRuntimeAdmissionDeclarations({ [field]: value });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(field);
  }
});

test("rejects unknown keys at every runtime declaration level", () => {
  const cases = [
    { runtimeAdmission: { version: 1, servers: {}, requirements: [], extra: true } },
    {
      servers: { "buzz-tools": rawServer() },
      runtimeAdmission: {
        version: 1,
        servers: { "buzz-tools": { authMode: "none", requirementIds: [], command: "drwn" } },
        requirements: [],
      },
    },
    {
      runtimeAdmission: {
        version: 1,
        servers: {},
        requirements: [{ requirementId: "x", probeId: "buzz-artifact-sha256-v1", expected: { artifactSha256 }, extra: true }],
      },
    },
    {
      runtimeAdmission: {
        version: 1,
        servers: {},
        requirements: [{ requirementId: "x", probeId: "buzz-artifact-sha256-v1", expected: { artifactSha256, extra: true } }],
      },
    },
  ];
  for (const value of cases) {
    const result = validateRuntimeAdmissionDeclarations(value);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/unsupported field/i);
  }
});

test("requires exact raw-server ownership and complete local stdio servers", () => {
  for (const input of [
    completeDeclarations({ servers: {} }),
    completeDeclarations({ servers: { other: rawServer() } }),
    completeDeclarations({ servers: { "buzz-tools": { enabled: true } } }),
    completeDeclarations({ servers: { "buzz-tools": rawServer({ transport: "http", url: "https://example.test" }) } }),
    completeDeclarations({ servers: { "buzz-tools": rawServer({ command: "" }) } }),
  ]) {
    const result = validateRuntimeAdmissionDeclarations(input);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/server|stdio|command/i);
  }
});

test("runtime declarations cannot carry executable, network, provider, or credential authority", () => {
  for (const field of ["command", "args", "argv", "env", "url", "parser", "provider", "headers", "tokenRef"]) {
    const input = completeDeclarations();
    (input.runtimeAdmission.servers["buzz-tools"] as Record<string, unknown>)[field] = field === "args" ? [] : "forbidden";
    const result = validateRuntimeAdmissionDeclarations(input);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(field);
  }
});

test("allows only authMode none and the two exact probes", () => {
  const badAuth = completeDeclarations();
  badAuth.runtimeAdmission.servers["buzz-tools"].authMode = "bearer";
  expect(validateRuntimeAdmissionDeclarations(badAuth).errors.join("\n")).toContain("authMode");

  for (const requirement of [
    { requirementId: "x", probeId: "version-v1", expected: { artifactSha256 } },
    { requirementId: "x", probeId: "buzz-artifact-sha256-v1", expected: { artifactSha256: "A".repeat(64) } },
    { requirementId: "x", probeId: "glibc-version-v1", expected: { platformCapabilities: ["glibc 2.31"] } },
    { requirementId: "x", probeId: "glibc-version-v1", expected: { platformCapabilities: ["glibc>=2.31", "glibc>=2.32"] } },
  ]) {
    const result = validateRuntimeAdmissionDeclarations({
      runtimeAdmission: { version: 1, servers: {}, requirements: [requirement] },
    });
    expect(result.ok).toBe(false);
  }
});

test("rejects missing, duplicate, and orphan requirement references", () => {
  const missing = completeDeclarations();
  missing.runtimeAdmission.servers["buzz-tools"].requirementIds = ["missing"];
  expect(validateRuntimeAdmissionDeclarations(missing).errors.join("\n")).toMatch(/missing|resolve/i);

  const duplicate = completeDeclarations();
  duplicate.runtimeAdmission.servers["buzz-tools"].requirementIds = ["buzz-sha", "buzz-sha", "glibc"];
  expect(validateRuntimeAdmissionDeclarations(duplicate).errors.join("\n")).toMatch(/duplicate/i);

  const orphan = completeDeclarations();
  orphan.runtimeAdmission.servers["buzz-tools"].requirementIds = ["buzz-sha"];
  expect(validateRuntimeAdmissionDeclarations(orphan).errors.join("\n")).toMatch(/orphan|referenced/i);
});

test("rejects oversized and exact/NFC-colliding identifiers", () => {
  const oversized = completeDeclarations();
  oversized.applicationRequirements.apps[0]!.app = "x".repeat(257);
  expect(validateRuntimeAdmissionDeclarations(oversized).errors.join("\n")).toMatch(/256|bounded/i);

  const collision = completeDeclarations({
    applicationRequirements: {
      version: 1,
      apps: [
        { app: "café", pipedreamApp: "a" },
        { app: "cafe\u0301", pipedreamApp: "b" },
      ],
    },
  });
  expect(validateRuntimeAdmissionDeclarations(collision).errors.join("\n")).toMatch(/NFC|duplicate/i);
});

test("enforces the 128-entry application bound", () => {
  const app = { app: "a", pipedreamApp: "a" };
  const atBound = { applicationRequirements: { version: 1, apps: Array.from({ length: 128 }, (_, i) => ({ ...app, app: `a-${i}` })) } };
  expect(validateRuntimeAdmissionDeclarations(atBound).ok).toBe(true);
  const overBound = { applicationRequirements: { version: 1, apps: Array.from({ length: 129 }, (_, i) => ({ ...app, app: `a-${i}` })) } };
  expect(validateRuntimeAdmissionDeclarations(overBound).ok).toBe(false);
});

describe("application card authentication", () => {
  test.each([
    ["none", undefined, true],
    ["oauth", undefined, true],
    ["bearer", "secret-ref", true],
    ["bearer", undefined, false],
    ["none", "secret-ref", false],
    ["oauth", "secret-ref", false],
  ] as const)("authMode %s with tokenRef %s", (authMode, tokenRef, ok) => {
    const value = {
      applicationRequirements: {
        version: 1,
        apps: [{
          app: "buzz",
          card: {
            server: "buzz-tools",
            authMode,
            ...(tokenRef ? { tokenRef } : {}),
            certification: "maintained",
          },
        }],
      },
    };
    expect(validateRuntimeAdmissionDeclarations(value).ok).toBe(ok);
  });
});

test("application entries require card, pipedreamApp, or both and reject unknown keys", () => {
  for (const app of [
    { app: "buzz" },
    { app: "buzz", unknown: true, pipedreamApp: "buzz" },
    { app: "buzz", card: { server: "buzz-tools", authMode: "none", certification: "maintained", extra: true } },
  ]) {
    expect(validateRuntimeAdmissionDeclarations({ applicationRequirements: { version: 1, apps: [app] } }).ok).toBe(false);
  }
});
