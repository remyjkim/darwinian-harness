// ABOUTME: Verifies the CLI-side worker deploy payload contract.
// ABOUTME: Bare cards and blueprints both materialize through the portable lockfile + store-export bridge.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { seedStore } from "../cli/core/store-seed";
import {
  buildWorkerDeployPayload,
  deriveDeployRuntimeAdmission,
  WORKER_RUNTIME_ADMISSION_ENVELOPE_LIMIT_BYTES,
  type WorkerDeployPayload,
} from "../cli/core/worker-deploy";
import { RUNTIME_ADMISSION_MIN_DRWN_VERSION } from "../cli/core/mind-capability";
import type { CardLockEntry } from "../cli/core/card-lock";
import {
  canonicalizeRuntimeAdmissionJson,
  deriveRuntimeAdmissionForClosure,
  type RuntimeAdmissionClosureCard,
} from "../cli/core/runtime-admission-manifest";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";
import fixturePayload from "./contract/deploy-payload.v1.json";

const tempRoots: string[] = [];
const contractFixture = fixturePayload as unknown as {
  bareCard: WorkerDeployPayload;
  blueprint: WorkerDeployPayload;
};

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  composedFrom: string[],
  extra: Record<string, unknown> = {},
) {
  const sourceRoot = await createCatalogCardSource(fixture, name);
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  Object.assign(manifest, { kind: "blueprint", composedFrom }, extra);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
}

function normalizeForFixture(payload: WorkerDeployPayload): WorkerDeployPayload {
  const normalized = JSON.parse(JSON.stringify(payload)) as WorkerDeployPayload;
  normalized.storeExport.sha256 = "sha256-normalized";
  normalized.storeExport.byteLength = 0;
  normalized.storeExport.bytesBase64 = "base64-normalized";
  for (const card of normalized.lockfile.cards) {
    if (card.git?.commit) {
      card.git.commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    }
  }
  return normalized;
}

async function publishBlueprintFixture(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await publishCardWithSkills(fixture, {
    name: "@me/react-builder",
    skills: ["react"],
    manifestExtra: emptyDeclarations,
  });
  await publishBlueprint(fixture, "@me/frontend-eng", ["@me/react-builder@^1.0.0"], {
    evals: ["passes_tests"],
    identity: { instructions: "Blueprint identity." },
    ...emptyDeclarations,
  });
}

test("buildWorkerDeployPayload emits the v1 contract for a bare card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/plain",
    skills: ["plain"],
    manifestExtra: emptyDeclarations,
  });

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/plain@^1.0.0",
  });

  expect(normalizeForFixture(payload)).toEqual(contractFixture.bareCard);
});

test("buildWorkerDeployPayload emits the v1 contract for a blueprint", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprintFixture(fixture);

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/frontend-eng@^1.0.0",
  });

  expect(normalizeForFixture(payload)).toEqual(contractFixture.blueprint);
});

test("buildWorkerDeployPayload computes the 1.3 admission floor over the Mind floor for a direct closure", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprint(fixture, "@me/mind-worker", [], {
    memory: { observations: { format: "jsonl" } },
    ...emptyDeclarations,
  });

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/mind-worker@^1.0.0",
  });

  expect(payload.lockfile.store.minDrwnVersion).toBe(RUNTIME_ADMISSION_MIN_DRWN_VERSION);
});

test("buildWorkerDeployPayload storeExport decodes and seeds a store", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprintFixture(fixture);

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/frontend-eng@^1.0.0",
  });
  const bytes = Buffer.from(payload.storeExport.bytesBase64, "base64");

  expect(bytes.byteLength).toBe(payload.storeExport.byteLength);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(payload.storeExport.sha256);

  const seedRoot = await mkdtemp(join(tmpdir(), "drwn-deploy-seed-"));
  const tarPath = join(seedRoot, "store.tar");
  await Bun.write(tarPath, bytes);
  const agentsDir = join(seedRoot, ".agents");
  await seedStore({ agentsDir, source: { kind: "tar", path: tarPath } });

  for (const card of payload.lockfile.cards) {
    expect(await Bun.file(join(agentsDir, card.path, "card.json")).exists()).toBe(true);
  }
});

test("buildWorkerDeployPayload translates the selected pinned project closure without leaking local schemas", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprintFixture(fixture);
  await publishCardWithSkills(fixture, { name: "@me/independent", skills: ["plain"] });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(
    projectRoot,
    fixture.agentsDir,
    ["@me/frontend-eng@^1.0.0", "@me/independent@^1.0.0"],
    "@me/frontend-eng",
  );
  const localLock = JSON.parse(await readFile(join(projectRoot, ".agents", "drwn", "card.lock"), "utf8"));

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/frontend-eng@^1.0.0",
    projectRoot,
  });

  expect(payload.entrypoint).toEqual({
    requested: "@me/frontend-eng@^1.0.0",
    name: "@me/frontend-eng",
    kind: "blueprint",
  });
  expect(payload.config).toEqual({ version: 1, cards: ["@me/frontend-eng@^1.0.0"] });
  expect(payload.lockfile.cards.map((card) => card.name)).toEqual(["@me/frontend-eng", "@me/react-builder"]);
  for (const card of payload.lockfile.cards) {
    const pinned = localLock.cards.find((entry: { name: string }) => entry.name === card.name);
    expect(card).toMatchObject({
      requested: pinned.requested,
      version: pinned.version,
      integrity: pinned.integrity,
      treeSha: pinned.treeSha,
    });
  }
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain("drwn.project-config");
  expect(serialized).not.toContain("drwn.project-lock");
  expect(serialized).not.toContain("activeWorker");
  expect(serialized).not.toContain("workerRoots");
});

const emptyDeclarations = {
  runtimeAdmission: { version: 1, servers: {}, requirements: [] },
  applicationRequirements: { version: 1, apps: [] },
};

const fixtureServerCommand = "drwn-fixture-cmd";

const serverDeclarations = {
  servers: {
    "buzz-tools": {
      description: "Fixture Buzz tools",
      transport: "stdio",
      command: fixtureServerCommand,
      args: ["--fixture-arg"],
      optional: false,
    },
  },
  runtimeAdmission: {
    version: 1,
    servers: { "buzz-tools": { authMode: "none", requirementIds: ["glibc"] } },
    requirements: [
      {
        requirementId: "glibc",
        probeId: "glibc-version-v1",
        expected: { platformCapabilities: ["glibc>=2.31"] },
      },
    ],
  },
  applicationRequirements: { version: 1, apps: [] },
};

test("buildWorkerDeployPayload emits the required runtime-admission envelope for bare and Blueprint closures", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/admitted",
    skills: ["plain"],
    manifestExtra: emptyDeclarations,
  });

  const bare = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/admitted@^1.0.0",
  });
  expect(bare.contractVersion).toBe(1);
  expect(bare.runtimeAdmission).toMatchObject({
    schema: "darwinian.worker-runtime-admission",
    schemaVersion: 1,
    derivationVersion: "worker-runtime-admission-v1",
  });
  expect(bare.runtimeAdmission.closureHash).toMatch(/^[a-f0-9]{64}$/);
  expect(bare.runtimeAdmission.activation.servers).toEqual([]);
  expect(bare.runtimeAdmission.runtimeRequirements.requirements).toEqual([]);
  expect(bare.runtimeAdmission).toEqual(deriveDeployRuntimeAdmission(bare.lockfile.cards));
  expect(bare.lockfile.store.minDrwnVersion).toBe(RUNTIME_ADMISSION_MIN_DRWN_VERSION);

  await publishCardWithSkills(fixture, {
    name: "@me/declared-member",
    skills: ["react"],
    manifestExtra: serverDeclarations,
  });
  await publishBlueprint(fixture, "@me/declared-eng", ["@me/declared-member@^1.0.0"], {
    evals: ["passes_tests"],
    ...emptyDeclarations,
  });
  const blueprint = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/declared-eng@^1.0.0",
  });
  expect(blueprint.runtimeAdmission.activation.servers).toEqual([
    {
      serverId: "buzz-tools",
      active: true,
      readiness: "required",
      authMode: "none",
      requirementIds: ["glibc"],
    },
  ]);
  expect(blueprint.runtimeAdmission).toEqual(deriveDeployRuntimeAdmission(blueprint.lockfile.cards));
});

test("undeclared, partial, and mixed closures fail with the stable admission code before any store-export step", async () => {
  const cases: Array<Record<string, unknown> | null> = [
    null,
    { runtimeAdmission: emptyDeclarations.runtimeAdmission },
    { applicationRequirements: emptyDeclarations.applicationRequirements },
  ];
  for (const manifestExtra of cases) {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, {
      name: "@me/undeclared",
      skills: ["plain"],
      ...(manifestExtra ? { manifestExtra } : {}),
    });
    const projectRoot = join(fixture.root, "project");
    await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/undeclared@^1.0.0"], "@me/undeclared");
    // Removing the store proves ordering: a store-export step would fail with
    // WORKER_DEPLOY_MISSING_BARE_REPO before the admission code could surface.
    await rm(join(fixture.agentsDir, "drwn"), { recursive: true, force: true });
    await expect(buildWorkerDeployPayload({
      agentsDir: fixture.agentsDir,
      cardRef: "@me/undeclared@^1.0.0",
      projectRoot,
    })).rejects.toMatchObject({ code: "WORKER_RUNTIME_ADMISSION_INVALID" });
  }

  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/plain-member", skills: ["react"] });
  await publishBlueprint(fixture, "@me/mixed-eng", ["@me/plain-member@^1.0.0"], emptyDeclarations);
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/mixed-eng@^1.0.0"], "@me/mixed-eng");
  await rm(join(fixture.agentsDir, "drwn"), { recursive: true, force: true });
  await expect(buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/mixed-eng@^1.0.0",
    projectRoot,
  })).rejects.toMatchObject({ code: "WORKER_RUNTIME_ADMISSION_INVALID" });
});

function syntheticAdmissionEntry(pairs: number, idLength: number, adjusterLength: number): CardLockEntry {
  const servers: Record<string, unknown> = {};
  const declaredServers: Record<string, unknown> = {};
  const requirements: unknown[] = [];
  const rawServer = {
    description: "Synthetic stdio server",
    transport: "stdio",
    command: "synthetic",
    optional: false,
  };
  for (let index = 0; index < pairs; index += 1) {
    const serverId = `s${String(index).padStart(3, "0")}${"x".repeat(idLength)}`;
    const requirementId = `r${String(index).padStart(3, "0")}${"y".repeat(idLength)}`;
    servers[serverId] = rawServer;
    declaredServers[serverId] = { authMode: "none", requirementIds: [requirementId] };
    requirements.push({
      requirementId,
      probeId: "glibc-version-v1",
      expected: { platformCapabilities: ["glibc>=2.31"] },
    });
  }
  if (adjusterLength > 0) {
    const adjusterId = `z${"a".repeat(adjusterLength - 1)}`;
    servers[adjusterId] = rawServer;
    declaredServers[adjusterId] = { authMode: "none", requirementIds: [] };
  }
  return {
    name: "@me/synthetic",
    requested: "@me/synthetic@^1.0.0",
    version: "1.0.0",
    path: "drwn/extracted/synthetic",
    integrity: "sha256-synthetic",
    treeSha: "a".repeat(40),
    manifest: {
      name: "@me/synthetic",
      version: "1.0.0",
      servers,
      runtimeAdmission: { version: 1, servers: declaredServers, requirements },
      applicationRequirements: { version: 1, apps: [] },
    },
    skills: [],
    hooks: [],
    registry: null,
    origin: "store",
    git: { commit: "a".repeat(40) },
  } as unknown as CardLockEntry;
}

function canonicalEnvelopeBytes(entry: CardLockEntry): number {
  const derivation = deriveRuntimeAdmissionForClosure([
    entry as unknown as RuntimeAdmissionClosureCard,
  ] as never);
  return Buffer.byteLength(derivation.canonicalEnvelope, "utf8");
}

test("the canonical envelope is bounded at exactly 65,536 UTF-8 bytes before archive work", () => {
  expect(WORKER_RUNTIME_ADMISSION_ENVELOPE_LIMIT_BYTES).toBe(65536);
  const target = WORKER_RUNTIME_ADMISSION_ENVELOPE_LIMIT_BYTES;
  const maxIdLength = 252;
  let pairs = 64;
  let base = canonicalEnvelopeBytes(syntheticAdmissionEntry(pairs, 10, 1));
  let slope = canonicalEnvelopeBytes(syntheticAdmissionEntry(pairs, 11, 1)) - base;
  while (base + slope * (maxIdLength - 10) < target && pairs < 120) {
    pairs += 8;
    base = canonicalEnvelopeBytes(syntheticAdmissionEntry(pairs, 10, 1));
    slope = canonicalEnvelopeBytes(syntheticAdmissionEntry(pairs, 11, 1)) - base;
  }
  const idLength = Math.min(10 + Math.floor((target - base) / slope), maxIdLength);
  const measured = canonicalEnvelopeBytes(syntheticAdmissionEntry(pairs, idLength, 1));
  // The adjuster server id contributes one canonical byte per character, so it
  // pads the envelope exactly onto the cap.
  const adjusterLength = 1 + (target - measured);
  expect(adjusterLength).toBeGreaterThanOrEqual(1);
  expect(adjusterLength).toBeLessThanOrEqual(255);
  const atLimit = syntheticAdmissionEntry(pairs, idLength, adjusterLength);
  expect(canonicalEnvelopeBytes(atLimit)).toBe(target);
  expect(deriveDeployRuntimeAdmission([atLimit]).schema).toBe("darwinian.worker-runtime-admission");

  const overLimit = syntheticAdmissionEntry(pairs, idLength, adjusterLength + 1);
  expect(canonicalEnvelopeBytes(overLimit)).toBe(target + 1);
  expect(() => deriveDeployRuntimeAdmission([overLimit])).toThrow(
    expect.objectContaining({ code: "WORKER_DEPLOY_RUNTIME_ADMISSION_TOO_LARGE" }),
  );
});

test("null and old declarations fail derivation with the stable admission code", () => {
  const nullDeclaration = syntheticAdmissionEntry(1, 4, 0);
  (nullDeclaration.manifest as unknown as Record<string, unknown>).runtimeAdmission = null;
  expect(() => deriveDeployRuntimeAdmission([nullDeclaration])).toThrow(
    expect.objectContaining({ code: "WORKER_RUNTIME_ADMISSION_INVALID" }),
  );

  const oldDeclaration = syntheticAdmissionEntry(1, 4, 0);
  ((oldDeclaration.manifest as unknown as Record<string, unknown>).runtimeAdmission as Record<string, unknown>).version = 2;
  expect(() => deriveDeployRuntimeAdmission([oldDeclaration])).toThrow(
    expect.objectContaining({ code: "WORKER_RUNTIME_ADMISSION_INVALID" }),
  );
});

test("the envelope excludes archive bytes, raw server configuration, and secrets", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/with-server",
    skills: ["plain"],
    manifestExtra: serverDeclarations,
  });

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/with-server@^1.0.0",
  });
  const canonical = canonicalizeRuntimeAdmissionJson(payload.runtimeAdmission);
  expect(Buffer.byteLength(canonical, "utf8")).toBeLessThanOrEqual(WORKER_RUNTIME_ADMISSION_ENVELOPE_LIMIT_BYTES);
  expect(canonical).not.toContain(fixtureServerCommand);
  expect(canonical).not.toContain("--fixture-arg");
  expect(canonical).not.toContain("bytesBase64");
  expect(canonical).not.toContain(payload.storeExport.sha256);
  expect(canonical).not.toContain("tokenRef");
  expect(canonical).not.toContain("command");
});

test("caller-supplied runtime admission cannot override the derived envelope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/derived",
    skills: ["plain"],
    manifestExtra: emptyDeclarations,
  });

  const forged = { closureHash: "f".repeat(64) };
  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/derived@^1.0.0",
    runtimeAdmission: forged,
  } as never);
  expect(payload.runtimeAdmission.closureHash).not.toBe(forged.closureHash);
  expect(payload.runtimeAdmission).toEqual(deriveDeployRuntimeAdmission(payload.lockfile.cards));
});

test("buildWorkerDeployPayload rejects a member or inactive independent root in a project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprintFixture(fixture);
  await publishCardWithSkills(fixture, { name: "@me/independent", skills: ["plain"] });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(
    projectRoot,
    fixture.agentsDir,
    ["@me/frontend-eng@^1.0.0", "@me/independent@^1.0.0"],
    "@me/frontend-eng",
  );

  await expect(buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/react-builder@^1.0.0",
    projectRoot,
  })).rejects.toMatchObject({ code: "WORKER_DEPLOY_MEMBER_NOT_ROOT" });
  await expect(buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/independent@^1.0.0",
    projectRoot,
  })).rejects.toMatchObject({ code: "WORKER_DEPLOY_ROOT_NOT_ACTIVE" });
});
