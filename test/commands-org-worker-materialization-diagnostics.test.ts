// ABOUTME: Verifies local-only Org Worker materialization status and doctor diagnostics.
// ABOUTME: Covers evidence-closed current, blocked, drifted, and removed classifications.

import { afterEach, expect, test } from "bun:test";
import {
  cp,
  mkdir,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveOrgWorkerMaterializationJournalPath,
} from "../cli/core/paths";
import {
  inspectOrgWorkerMaterialization,
} from "../cli/core/diagnostics";
import {
  resolveWorkerMaterializationReceiptsRoot,
} from "../cli/core/worker-materialization-receipt";
import {
  resolveProjectVendorTree,
} from "../cli/core/vendor";
import {
  cleanupTempRoots,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const roots: string[] = [];
afterEach(async () => {
  await cleanupTempRoots(roots);
});

test("local classifier distinguishes absent from orphaned evidence without leaking it", async () => {
  const fixture = await scaffoldCliFixture();
  roots.push(fixture.root);
  const projectRoot = join(fixture.root, "empty-project");
  await mkdir(projectRoot);
  expect(
    await inspectOrgWorkerMaterialization(projectRoot),
  ).toEqual({
    state: "absent",
    issues: [],
  });

  const receiptsRoot =
    resolveWorkerMaterializationReceiptsRoot(projectRoot);
  await mkdir(receiptsRoot, { recursive: true });
  await writeFile(
    join(receiptsRoot, "orphan.json"),
    '{"private":"must-not-be-returned"}\n',
  );
  const orphaned =
    await inspectOrgWorkerMaterialization(projectRoot);
  expect(orphaned).toEqual({
    state: "unknown",
    issues: [
      {
        code: "ORG_WORKER_EVIDENCE_ORPHANED",
        severity: "error",
      },
    ],
  });
  expect(JSON.stringify(orphaned)).not.toContain(projectRoot);
  expect(JSON.stringify(orphaned)).not.toContain("must-not-be-returned");
});

async function setup() {
  const fixture = await scaffoldCliFixture();
  roots.push(fixture.root);
  const handoffRoot = join(fixture.root, "handoff");
  const projectRoot = join(fixture.root, "project");
  await Promise.all([mkdir(handoffRoot), mkdir(projectRoot)]);
  const sourceRoot = fileURLToPath(
    new URL("./fixtures/org-worker-materialization-v1/", import.meta.url),
  );
  const snapshotPath = join(handoffRoot, "snapshot.json");
  await Promise.all([
    cp(join(sourceRoot, "snapshot.valid.json"), snapshotPath),
    cp(
      join(sourceRoot, "packet-root", "artifacts"),
      join(handoffRoot, "artifacts"),
      { recursive: true },
    ),
  ]);
  const bundlePath = fileURLToPath(
    new URL(
      "./fixtures/org-worker-bundle-v1/gtm.valid.json",
      import.meta.url,
    ),
  );
  const installArgs = [
    "install",
    "--frozen",
    "--org-worker-bundle",
    bundlePath,
    "--worker-artifact-snapshot",
    snapshotPath,
    "--operation-id",
    "operation:diagnostics:1",
    "--json",
  ];
  const env = envFor(fixture);
  const installed = await runAgentsCli(
    installArgs,
    env,
    projectRoot,
    { skipWriteScopeAuto: true },
  );
  expect(installed.exitCode).toBe(0);
  return {
    fixture,
    projectRoot,
    bundlePath,
    snapshotPath,
    env,
  };
}

test("status and doctor classify only complete local materialization evidence", async () => {
  const input = await setup();
  const status = await runAgentsCli(
    ["status", "--json"],
    input.env,
    input.projectRoot,
  );
  expect(status.exitCode).toBe(0);
  expect(JSON.parse(status.stdout).orgWorkerMaterialization).toMatchObject({
    state: "current",
    instructionConsentSource: "organization",
    issues: [],
  });
  const receiptId = JSON.parse(status.stdout)
    .orgWorkerMaterialization.lastVerifiedReceiptId;
  const receiptPath = join(
    resolveWorkerMaterializationReceiptsRoot(input.projectRoot),
    `${receiptId}.json`,
  );
  const savedReceiptPath = `${receiptPath}.saved`;
  await rename(receiptPath, savedReceiptPath);
  await symlink(savedReceiptPath, receiptPath);
  expect(
    await inspectOrgWorkerMaterialization(input.projectRoot),
  ).toMatchObject({
    state: "unknown",
    issues: [
      {
        code: "ORG_WORKER_EVIDENCE_MALFORMED",
        severity: "error",
      },
    ],
  });
  await Bun.file(receiptPath).delete();
  await rename(savedReceiptPath, receiptPath);

  const human = await runAgentsCli(
    ["status"],
    input.env,
    input.projectRoot,
  );
  expect(human.stdout).toContain("Worker materialization: current");

  const journalPath = resolveOrgWorkerMaterializationJournalPath(
    input.projectRoot,
  );
  await writeFile(
    journalPath,
    `${JSON.stringify({
      schema: "drwn.org-worker-materialization-journal",
      schemaVersion: 1,
      operationId: "operation:diagnostics:blocked",
      requestDigest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      phase: "validated",
      durability: {
        receiptPersisted: false,
        recordPersisted: false,
      },
      createdAt: "2026-07-24T00:00:00.000Z",
      updatedAt: "2026-07-24T00:00:00.000Z",
    }, null, 2)}\n`,
  );
  const blocked = await runAgentsCli(
    ["doctor", "--json"],
    input.env,
    input.projectRoot,
  );
  expect(blocked.exitCode).toBe(1);
  expect(JSON.parse(blocked.stdout).orgWorkerMaterialization).toMatchObject({
    state: "blocked",
    issues: [
      {
        code: "ORG_WORKER_OPERATION_INCOMPLETE",
        severity: "error",
      },
    ],
  });
  await Bun.file(journalPath).delete();

  const vendorPath = resolveProjectVendorTree(
    input.projectRoot,
    "gtm-worker",
    "1fb0a826d6fc73bb52c0a22e6e2925e2783701a5",
  );
  await writeFile(
    join(vendorPath, "instructions.md"),
    "locally changed instructions\n",
  );
  const drifted = await runAgentsCli(
    ["doctor"],
    input.env,
    input.projectRoot,
  );
  expect(drifted.exitCode).toBe(1);
  expect(drifted.stdout).toContain("Worker materialization: drifted");
  expect(drifted.stdout).toContain("ORG_WORKER_ARTIFACT_DRIFT");

  await writeFile(
    join(vendorPath, "instructions.md"),
    "reviewed instructions\n",
  );
  const removed = await runAgentsCli(
    [
      "install",
      "--remove",
      "--frozen",
      "--org-worker-bundle",
      input.bundlePath,
      "--worker-artifact-snapshot",
      input.snapshotPath,
      "--operation-id",
      "operation:diagnostics:remove",
      "--json",
    ],
    input.env,
    input.projectRoot,
    { skipWriteScopeAuto: true },
  );
  expect(removed.exitCode).toBe(0);
  const removedStatus = await runAgentsCli(
    ["status", "--json"],
    input.env,
    input.projectRoot,
  );
  expect(removedStatus.exitCode).toBe(0);
  expect(
    JSON.parse(removedStatus.stdout).orgWorkerMaterialization,
  ).toMatchObject({
    state: "removed",
    issues: [],
  });
});
