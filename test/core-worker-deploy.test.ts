// ABOUTME: Verifies the CLI-side worker deploy payload contract.
// ABOUTME: Bare cards and blueprints both materialize through the portable lockfile + store-export bridge.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { seedStore } from "../cli/core/store-seed";
import { buildWorkerDeployPayload, type WorkerDeployPayload } from "../cli/core/worker-deploy";
import { WORKER_MIND_MIN_DRWN_VERSION } from "../cli/core/card-lock";
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
  await publishCardWithSkills(fixture, { name: "@me/react-builder", skills: ["react"] });
  await publishBlueprint(fixture, "@me/frontend-eng", ["@me/react-builder@^1.0.0"], {
    evals: ["passes_tests"],
    identity: { instructions: "Blueprint identity." },
  });
}

test("buildWorkerDeployPayload emits the v1 contract for a bare card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/plain", skills: ["plain"] });

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

test("buildWorkerDeployPayload computes the semantic Mind floor for a direct closure", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprint(fixture, "@me/mind-worker", [], {
    memory: { observations: { format: "jsonl" } },
  });

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/mind-worker@^1.0.0",
  });

  expect(payload.lockfile.store.minDrwnVersion).toBe(WORKER_MIND_MIN_DRWN_VERSION);
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
