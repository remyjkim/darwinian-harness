// ABOUTME: Verifies strict Worker runtime-admission and application declaration parsing.
// ABOUTME: Pins the hard-cut declaration contract before deploy derivation consumes it.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  canonicalizeRuntimeAdmissionJson,
  compareRuntimeAdmissionIds,
  computeEffectiveMcpActivationHash,
  computeRuntimeRequirementsHash,
  deriveRuntimeAdmissionForClosure,
  validateRuntimeAdmissionDeclarations,
  type CardApplicationRequirementsV1,
  type RuntimeAdmissionClosureCard,
} from "../cli/core/runtime-admission-manifest";

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
        { app: "caf\u00e9", pipedreamApp: "a" },
        { app: "cafe\u0301", pipedreamApp: "b" },
      ],
    },
  });
  expect(validateRuntimeAdmissionDeclarations(collision).errors.join("\n")).toMatch(/NFC|duplicate/i);
});

test("enforces the 128-entry runtime server and requirement bounds", () => {
  const requirement = (index: number) => ({
    requirementId: `req-${index}`,
    probeId: "glibc-version-v1",
    expected: { platformCapabilities: ["glibc>=2.31"] },
  });
  const overRequirements = {
    runtimeAdmission: {
      version: 1,
      servers: {},
      requirements: Array.from({ length: 129 }, (_, index) => requirement(index)),
    },
  };
  expect(validateRuntimeAdmissionDeclarations(overRequirements).ok).toBe(false);

  const serverEntries = Array.from({ length: 129 }, (_, index) => [`server-${index}`, rawServer()]);
  const overServers = {
    servers: Object.fromEntries(serverEntries),
    runtimeAdmission: {
      version: 1,
      servers: Object.fromEntries(
        serverEntries.map(([serverId]) => [serverId, { authMode: "none", requirementIds: [] }]),
      ),
      requirements: [],
    },
  };
  const result = validateRuntimeAdmissionDeclarations(overServers);
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toContain("128");
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

function closureCard(
  name: string,
  options: {
    optional?: boolean;
    serverId?: string;
    requirementId?: string;
    apps?: CardApplicationRequirementsV1["apps"];
  } = {},
): RuntimeAdmissionClosureCard {
  const serverId = options.serverId ?? `${name}-server`;
  const requirementId = options.requirementId ?? `${name}-sha`;
  return {
    name,
    requested: `${name}@^1.0.0`,
    version: "1.0.0",
    integrity: `sha256-${name}`,
    treeSha: "a".repeat(40),
    manifest: {
      name,
      version: "1.0.0",
      servers: { [serverId]: rawServer({ optional: options.optional ?? false }) },
      runtimeAdmission: {
        version: 1,
        servers: { [serverId]: { authMode: "none", requirementIds: [requirementId] } },
        requirements: [{
          requirementId,
          probeId: "buzz-artifact-sha256-v1",
          expected: { artifactSha256 },
        }],
      },
      applicationRequirements: { version: 1, apps: options.apps ?? [] },
    },
  };
}

test("derives required and optional local stdio activation and requirement criticality", () => {
  const required = closureCard("alpha");
  const optional = closureCard("beta", { optional: true });
  const result = deriveRuntimeAdmissionForClosure([optional, required]);

  expect(result.envelope.activation.servers).toEqual([
    {
      serverId: "alpha-server",
      active: true,
      readiness: "required",
      authMode: "none",
      requirementIds: ["alpha-sha"],
    },
    {
      serverId: "beta-server",
      active: true,
      readiness: "optional",
      authMode: "none",
      requirementIds: ["beta-sha"],
    },
  ]);
  expect(result.envelope.runtimeRequirements.requirements.map(({ requirementId, criticality }) => ({
    requirementId,
    criticality,
  }))).toEqual([
    { requirementId: "alpha-sha", criticality: "required" },
    { requirementId: "beta-sha", criticality: "optional" },
  ]);
});

test("escalates shared local requirement criticality when any referencing server is required", () => {
  const card = closureCard("alpha");
  card.manifest.servers = {
    optional: rawServer({ optional: true }),
    required: rawServer({ optional: false }),
  };
  card.manifest.runtimeAdmission = {
    version: 1,
    servers: {
      optional: { authMode: "none", requirementIds: ["alpha-sha"] },
      required: { authMode: "none", requirementIds: ["alpha-sha"] },
    },
    requirements: card.manifest.runtimeAdmission!.requirements,
  };

  expect(
    deriveRuntimeAdmissionForClosure([card]).envelope.runtimeRequirements.requirements[0]?.criticality,
  ).toBe("required");
});

test("derives the valid explicit-empty closure", () => {
  const empty = closureCard("empty");
  empty.manifest.servers = {};
  empty.manifest.runtimeAdmission = { version: 1, servers: {}, requirements: [] };
  const result = deriveRuntimeAdmissionForClosure([empty]);
  expect(result.envelope.activation.servers).toEqual([]);
  expect(result.envelope.runtimeRequirements.requirements).toEqual([]);
  expect(result.applicationRequirements).toEqual({ version: 1, apps: [] });
});

test("matches exact I259 activation and requirement hash vectors", () => {
  const server = (serverId: string, requirementIds: string[]) => ({
    serverId,
    active: true as const,
    readiness: "required" as const,
    authMode: "none" as const,
    requirementIds,
  });
  expect(computeEffectiveMcpActivationHash({
    schema: "darwinian.effective-mcp-activation",
    schemaVersion: 1,
    servers: [server("zeta", ["z", "a"]), server("alpha", [])],
    activationHash: "0".repeat(64),
  })).toBe("82c85a31aec5a253457635198d26c2e75da2b33e411af087aedc2e1fa23f4fc3");

  const requirement = (requirementId: string, platformCapabilities: string[]) => ({
    requirementId,
    probeId: `${requirementId}-probe`,
    criticality: "required" as const,
    expected: { platformCapabilities },
  });
  expect(computeRuntimeRequirementsHash({
    schema: "darwinian.runtime-requirements",
    schemaVersion: 1,
    requirements: [requirement("zeta", ["z", "a"]), requirement("alpha", [])],
    manifestHash: "0".repeat(64),
  })).toBe("4e0cb3a66b8182b262585e3c72817845dcea51a210d6773e3d891ba0a6612337");
});

test("canonical JSON rejects unsupported values and non-safe integers", () => {
  expect(canonicalizeRuntimeAdmissionJson({ b: 1, a: 2, omitted: undefined })).toBe('{"a":2,"b":1}');
  expect(() => canonicalizeRuntimeAdmissionJson({ value: 1.5 })).toThrow(/safe integer/i);
  expect(() => canonicalizeRuntimeAdmissionJson({ value: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/safe integer/i);
  expect(() => canonicalizeRuntimeAdmissionJson({ value: BigInt(1) })).toThrow(/unsupported/i);
  expect(() => canonicalizeRuntimeAdmissionJson([undefined])).toThrow(/unsupported/i);
});

test("set-equivalent Card and declaration reordering preserves every derived identity", () => {
  const alpha = closureCard("alpha", { apps: [{ app: "a", pipedreamApp: "a" }] });
  const beta = closureCard("beta", { apps: [{ app: "B", pipedreamApp: "b" }] });
  const first = deriveRuntimeAdmissionForClosure([beta, alpha]);

  alpha.manifest.runtimeAdmission!.requirements.reverse();
  alpha.manifest.runtimeAdmission!.servers["alpha-server"]!.requirementIds.reverse();
  alpha.manifest.applicationRequirements!.apps.reverse();
  const second = deriveRuntimeAdmissionForClosure([alpha, beta]);

  expect(second).toEqual(first);
});

test("meaningful closure preimage mutations change closureHash", () => {
  const base = closureCard("alpha");
  const baseHash = deriveRuntimeAdmissionForClosure([base]).envelope.closureHash;
  const mutations: Array<(card: RuntimeAdmissionClosureCard) => void> = [
    (card) => { (card.manifest.servers!["alpha-server"] as Record<string, unknown>).command = "other"; },
    (card) => { card.manifest.runtimeAdmission!.requirements[0]!.expected = { artifactSha256: "b".repeat(64) }; },
    (card) => { card.requested = "alpha@1.0.0"; },
    (card) => { card.treeSha = "b".repeat(40); },
    (card) => { card.integrity = "sha256-other"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(base);
    mutate(changed);
    expect(deriveRuntimeAdmissionForClosure([changed]).envelope.closureHash).not.toBe(baseHash);
  }
});

test("activation and requirement mutations change only their component hashes as applicable", () => {
  const activation = deriveRuntimeAdmissionForClosure([closureCard("alpha")]).envelope.activation;
  expect(computeEffectiveMcpActivationHash({
    ...activation,
    servers: [{ ...activation.servers[0]!, readiness: "optional" }],
  })).not.toBe(activation.activationHash);

  const manifest = deriveRuntimeAdmissionForClosure([closureCard("alpha")]).envelope.runtimeRequirements;
  expect(computeRuntimeRequirementsHash({
    ...manifest,
    requirements: [{ ...manifest.requirements[0]!, criticality: "optional" }],
  })).not.toBe(manifest.manifestHash);
});

test("all-absent, either-field absent, null, old, mixed, and partial closures fail", () => {
  const valid = closureCard("valid");
  const cases: RuntimeAdmissionClosureCard[][] = [];
  const absent = structuredClone(valid);
  delete absent.manifest.runtimeAdmission;
  delete absent.manifest.applicationRequirements;
  cases.push([absent]);
  const runtimeOnly = structuredClone(valid);
  delete runtimeOnly.manifest.applicationRequirements;
  cases.push([runtimeOnly]);
  const applicationsOnly = structuredClone(valid);
  delete applicationsOnly.manifest.runtimeAdmission;
  cases.push([applicationsOnly]);
  const nullRuntime = structuredClone(valid);
  nullRuntime.manifest.runtimeAdmission = null as never;
  cases.push([nullRuntime]);
  const old = structuredClone(valid);
  old.manifest.runtimeAdmission = { ...old.manifest.runtimeAdmission!, version: 2 as never };
  cases.push([old]);
  cases.push([valid, absent]);
  cases.push([valid, runtimeOnly]);

  for (const cards of cases) {
    expect(() => deriveRuntimeAdmissionForClosure(cards)).toThrow(/runtime admission|declaration|coverage/i);
  }
});

test("rejects exact/NFC Card, server, and requirement collisions across the closure", () => {
  const exactCard = closureCard("same");
  expect(() => deriveRuntimeAdmissionForClosure([exactCard, structuredClone(exactCard)])).toThrow(/duplicate|collision/i);

  const nfcA = closureCard("café");
  const nfcB = closureCard("cafe\u0301");
  expect(() => deriveRuntimeAdmissionForClosure([nfcA, nfcB])).toThrow(/NFC|collision/i);

  const referenceA = closureCard("alpha");
  const referenceB = closureCard("beta");
  referenceA.requested = "café";
  referenceB.requested = "cafe\u0301";
  expect(() => deriveRuntimeAdmissionForClosure([referenceA, referenceB])).toThrow(/requested.*NFC|requested.*collision/i);

  expect(() => deriveRuntimeAdmissionForClosure([
    closureCard("alpha", { serverId: "shared" }),
    closureCard("beta", { serverId: "shared" }),
  ])).toThrow(/server.*collision|duplicate.*server/i);

  expect(() => deriveRuntimeAdmissionForClosure([
    closureCard("alpha", { requirementId: "shared" }),
    closureCard("beta", { requirementId: "shared" }),
  ])).toThrow(/requirement.*collision|duplicate.*requirement/i);
});

test("aggregates an application two Cards agree on, rejects one they disagree on", () => {
  // An application is a shared external resource, so two Cards needing the same one is
  // ordinary. Card, server, and requirement ids are identity keys and keep rejecting a
  // repeat outright; the case above holds that line.
  const result = deriveRuntimeAdmissionForClosure([
    closureCard("alpha", { apps: [{ app: "a", pipedreamApp: "lower" }] }),
    closureCard("beta", { apps: [{ app: "B", pipedreamApp: "upper" }] }),
  ]);
  expect(result.applicationRequirements.apps.map(({ app }) => app)).toEqual(["B", "a"]);
  expect(compareRuntimeAdmissionIds("B", "a")).toBe(-1);
  expect("B".localeCompare("a")).not.toBe(compareRuntimeAdmissionIds("B", "a"));
  expect(JSON.stringify(result.envelope)).not.toContain("pipedreamApp");

  const shared = { app: "a", pipedreamApp: "shared" };
  const agreed = deriveRuntimeAdmissionForClosure([
    closureCard("alpha", { apps: [shared] }),
    closureCard("beta", { apps: [{ ...shared }] }),
  ]);
  expect(agreed.applicationRequirements.apps).toEqual([shared]);

  expect(() => deriveRuntimeAdmissionForClosure([
    closureCard("alpha", { apps: [shared] }),
    closureCard("beta", { apps: [{ app: "a", pipedreamApp: "different" }] }),
  ])).toThrow(/conflicting/i);

  // Two spellings of one NFC-equivalent id are refused even where the declarations
  // otherwise agree. Aggregating them would require choosing which spelling the single
  // entry carries, and the first-seen spelling makes the derived hash depend on the
  // order the closure was passed in — which the Card sort in the closure preimage
  // exists to keep it from doing.
  expect(() => deriveRuntimeAdmissionForClosure([
    closureCard("alpha", { apps: [{ app: "caf\u00e9", pipedreamApp: "a" }] }),
    closureCard("beta", { apps: [{ app: "cafe\u0301", pipedreamApp: "a" }] }),
  ])).toThrow(/NFC-collides/i);
});

test("agreement between Cards is canonical equality, not key insertion order", () => {
  // Two declarations of the same application differ in the order their keys were
  // written. Comparing their serializations directly would call that a conflict.
  const card = { server: "s", authMode: "none" as const, certification: "maintained" as const };
  const written = { app: "a", card, pipedreamApp: "p" };
  const reordered = { pipedreamApp: "p", card: { certification: card.certification, authMode: card.authMode, server: card.server }, app: "a" };
  expect(JSON.stringify(written)).not.toBe(JSON.stringify(reordered));
  expect(canonicalizeRuntimeAdmissionJson(written)).toBe(canonicalizeRuntimeAdmissionJson(reordered));

  const result = deriveRuntimeAdmissionForClosure([
    closureCard("alpha", { apps: [written] }),
    closureCard("beta", { apps: [reordered as typeof written] }),
  ]);
  expect(result.applicationRequirements.apps).toEqual([written]);
});

test("the synthetic non-publishable Finch fixture is closed, deterministic, and externally bound", async () => {
  const fixtureDir = `${import.meta.dir}/fixtures/runtime-admission`;
  const fixturePath = `${fixtureDir}/finch-runtime-admission.synthetic.v1.json`;
  const sidecarPath = `${fixtureDir}/finch-runtime-admission.synthetic.v1.source.json`;
  const fixtureBytes = Buffer.from(await Bun.file(fixturePath).arrayBuffer());
  const sidecarBytes = Buffer.from(await Bun.file(sidecarPath).arrayBuffer());

  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  // Canonical serialization plus one trailing LF makes the frozen bytes deterministic.
  expect(fixtureBytes.toString("utf8")).toBe(`${canonicalizeRuntimeAdmissionJson(fixture)}\n`);
  expect(Object.keys(fixture).sort()).toEqual(["closure", "expected", "i107Selectors", "syntheticNonpublishable"]);
  expect(fixture.syntheticNonpublishable).toBe(true);

  // One synthetic tools Card; the marker stays outside canonical Card bytes.
  expect(fixture.closure).toHaveLength(1);
  const card = fixture.closure[0];
  expect(JSON.stringify(card)).not.toContain("syntheticNonpublishable");
  expect(card.manifest.servers["buzz-tools"].optional).toBe(false);
  expect(Object.keys(card.manifest.servers)).toEqual(["buzz-tools"]);

  // Only the two approved probes; the artifact digest is valid hex but unmistakably synthetic.
  const requirements = card.manifest.runtimeAdmission.requirements;
  expect(requirements.map((entry: { probeId: string }) => entry.probeId).sort()).toEqual([
    "buzz-artifact-sha256-v1",
    "glibc-version-v1",
  ]);
  const artifact = requirements.find((entry: { probeId: string }) => entry.probeId === "buzz-artifact-sha256-v1");
  expect(artifact.expected.artifactSha256).toMatch(/^(0123456789abcdef){4}$/);
  const glibc = requirements.find((entry: { probeId: string }) => entry.probeId === "glibc-version-v1");
  expect(glibc.expected.platformCapabilities).toEqual(["glibc>=2.31"]);

  // Explicit empty apps and the exact adjacent I107 selectors, outside the envelope.
  expect(card.manifest.applicationRequirements).toEqual({ version: 1, apps: [] });
  expect(fixture.i107Selectors).toEqual({
    allow: ["mcp:buzz-tools/buzz_messages_send", "mcp:buzz-tools/buzz_messages_thread"],
    deny: [],
  });
  expect(card.manifest.tools).toEqual(fixture.i107Selectors);

  // The expected envelope regenerates byte-exactly from the pure producer; one
  // required buzz-tools activation; selectors and archive bytes never leak into it.
  const derivation = deriveRuntimeAdmissionForClosure(fixture.closure);
  expect(fixture.expected.envelope).toEqual(derivation.envelope);
  expect(fixture.expected.applicationRequirements).toEqual(derivation.applicationRequirements);
  expect(derivation.envelope.activation.servers).toEqual([
    {
      serverId: "buzz-tools",
      active: true,
      readiness: "required",
      authMode: "none",
      requirementIds: ["buzz-artifact", "glibc-floor"],
    },
  ]);
  expect(derivation.canonicalEnvelope).not.toContain("i107");
  expect(derivation.canonicalEnvelope).not.toContain("buzz_messages_send");
  expect(derivation.canonicalEnvelope).not.toContain("syntheticNonpublishable");
  expect(derivation.canonicalEnvelope).not.toContain("bytesBase64");
  expect(fixtureBytes.toString("utf8")).not.toContain("bytesBase64");

  // Sidecar: the exact closed field set, canonical bytes, fixture identity, and
  // no self-hash or embedded commit.
  const sidecar = JSON.parse(sidecarBytes.toString("utf8"));
  expect(sidecarBytes.toString("utf8")).toBe(`${canonicalizeRuntimeAdmissionJson(sidecar)}\n`);
  expect(Object.keys(sidecar).sort()).toEqual([
    "derivationVersion",
    "fixtureByteLength",
    "fixtureFile",
    "fixtureSha256",
    "schema",
    "sourcePaths",
    "syntheticNonpublishable",
  ]);
  expect(sidecar.schema).toBe("cl.i265.runtime-admission-fixture-source.v1");
  expect(sidecar.fixtureFile).toBe("finch-runtime-admission.synthetic.v1.json");
  expect(sidecar.derivationVersion).toBe("worker-runtime-admission-v1");
  expect(sidecar.syntheticNonpublishable).toBe(true);
  expect(sidecar.sourcePaths).toEqual(["cli/core/runtime-admission-manifest.ts"]);
  expect(sidecar.fixtureByteLength).toBe(fixtureBytes.byteLength);
  expect(sidecar.fixtureSha256).toBe(
    createHash("sha256").update(fixtureBytes).digest("hex"),
  );
  expect(sidecarBytes.toString("utf8")).not.toMatch(/\b[a-f0-9]{40}\b/);
});

test("applications are outside the envelope but bind closureHash", () => {
  const withoutApp = closureCard("alpha");
  const withApp = closureCard("alpha", { apps: [{ app: "buzz", pipedreamApp: "buzz" }] });
  const first = deriveRuntimeAdmissionForClosure([withoutApp]);
  const second = deriveRuntimeAdmissionForClosure([withApp]);
  expect(first.envelope.closureHash).not.toBe(second.envelope.closureHash);
  expect(Object.keys(second.envelope)).not.toContain("applicationRequirements");
});
