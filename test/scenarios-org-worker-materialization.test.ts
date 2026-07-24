// ABOUTME: Qualifies the released Worker handoff through a fresh-process lifecycle.
// ABOUTME: Pins immutable packet bytes and proves materialize, repair, removal, and diagnostics.

import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseOrgWorkerBundleV1 } from "../cli/core/org-worker-bundle-v1";
import { parseWorkerArtifactSnapshotV1 } from "../cli/core/org-worker-artifact-snapshot";
import {
  computeWorkerMaterializationReceiptDigest,
  parseWorkerMaterializationReceipt,
  resolveWorkerMaterializationReceiptsRoot,
} from "../cli/core/worker-materialization-receipt";
import { resolveProjectVendorTree } from "../cli/core/vendor";
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

const fixtureRoot = fileURLToPath(
  new URL("./fixtures/org-worker-materialization-v1/", import.meta.url),
);

type BoundaryManifest = {
  wireVersion: "worker-materialization-release-boundary@1";
  producer: "darwinian-org";
  files: Array<{
    path: string;
    sha256: string;
    role:
      | "org_worker_bundle"
      | "artifact_snapshot"
      | "artifact_content"
      | "positive_receipt"
      | "negative_manifest";
  }>;
};

async function verifyBoundary() {
  const manifest = JSON.parse(
    await readFile(
      join(fixtureRoot, "released-boundary.manifest.json"),
      "utf8",
    ),
  ) as BoundaryManifest;
  expect(manifest.wireVersion).toBe(
    "worker-materialization-release-boundary@1",
  );
  expect(manifest.producer).toBe("darwinian-org");
  expect(manifest.files.length).toBeLessThanOrEqual(16);
  expect(manifest.files.map(({ path }) => path)).toEqual(
    [...manifest.files.map(({ path }) => path)].sort(),
  );
  expect(new Set(manifest.files.map(({ path }) => path)).size).toBe(
    manifest.files.length,
  );
  for (const entry of manifest.files) {
    expect(entry.path).toMatch(
      /^(?:released|packet-root|receipts|snapshot|receipt)[A-Za-z0-9._/-]*$/,
    );
    expect(entry.path.split("/")).not.toContain("..");
    const path = join(fixtureRoot, entry.path);
    const stats = await lstat(path);
    expect(stats.isFile()).toBe(true);
    expect(stats.isSymbolicLink()).toBe(false);
    expect(stats.size).toBeLessThanOrEqual(262_144);
    expect(
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    ).toBe(entry.sha256);
  }

  const bundle = parseOrgWorkerBundleV1(
    JSON.parse(
      await readFile(
        join(fixtureRoot, "released/org-worker-bundle.json"),
        "utf8",
      ),
    ),
  );
  const snapshot = parseWorkerArtifactSnapshotV1(
    JSON.parse(
      await readFile(
        join(fixtureRoot, "snapshot.valid.json"),
        "utf8",
      ),
    ),
  );
  expect(snapshot.sourceBundleDigest).toBe(
    "sha256:6597b05cdad254375332d56a23f4d052c61bae6c8836b3f24e0f80c8eb4eaa48",
  );
  expect(bundle.workerId).toBe("worker:gtm-operator");
  return { manifest, bundle, snapshot };
}

function normalizedReceipt(receipt: unknown) {
  const parsed = parseWorkerMaterializationReceipt(receipt);
  return {
    ...parsed,
    receiptId: "<receipt-id>",
    operationId: "<operation-id>",
    observedAt: "<observed-at>",
    projectState: {
      ...parsed.projectState,
      lockDigest: "<project-lock-digest>",
    },
    ...(parsed.priorReceiptDigest
      ? { priorReceiptDigest: "<prior-receipt-digest>" }
      : {}),
  };
}

test("released boundary checksums and bounded receipt vectors are self-contained", async () => {
  await verifyBoundary();
  const positives = await Promise.all(
    ["materialize", "reconcile", "remove"].map(async (action) =>
      parseWorkerMaterializationReceipt(
        JSON.parse(
          await readFile(
            join(fixtureRoot, `receipts/${action}.valid.json`),
            "utf8",
          ),
        ),
      ),
    ),
  );
  expect(positives.map(({ action }) => action)).toEqual([
    "materialize",
    "reconcile",
    "remove",
  ]);
  expect(positives[2]!.priorReceiptDigest).toBe(
    computeWorkerMaterializationReceiptDigest(positives[1]),
  );

  const negatives = JSON.parse(
    await readFile(
      join(fixtureRoot, "receipt.negatives.json"),
      "utf8",
    ),
  ) as {
    wireVersion: string;
    fixtures: Array<{
      id: string;
      mutation: string;
      expectedCode: string;
    }>;
  };
  expect(negatives.wireVersion).toBe(
    "worker-materialization-receipt-negative-fixtures@1",
  );
  expect(negatives.fixtures.length).toBeLessThanOrEqual(16);
  expect(
    new Set(negatives.fixtures.map(({ id }) => id)).size,
  ).toBe(negatives.fixtures.length);
  const base = positives[0]!;
  for (const fixture of negatives.fixtures) {
    const candidate = structuredClone(base) as Record<string, any>;
    switch (fixture.mutation) {
      case "wrong_wire_version":
        candidate.receiptVersion = "worker-materialization-receipt@2";
        break;
      case "path_receipt_id":
        candidate.receiptId = "../receipt";
        break;
      case "cross_action_outcome":
        candidate.action = "remove";
        break;
      case "failed_success_check":
        candidate.checks[2].result = "failed";
        break;
      case "missing_required_check":
        candidate.checks = candidate.checks.slice(1);
        break;
      case "unsorted_verified_pins":
        candidate.artifactVerification.verifiedPinRefs = [
          "artifact:z",
          "artifact:a",
        ];
        break;
      case "instruction_content":
        candidate.instructionBody = "must never cross the boundary";
        break;
      default:
        throw new Error(`unsupported negative mutation: ${fixture.mutation}`);
    }
    expect(() =>
      parseWorkerMaterializationReceipt(candidate),
    ).toThrow(
      expect.objectContaining({ code: fixture.expectedCode }),
    );
  }
});

test("fresh processes materialize, reconcile, repair, remove, and diagnose the released packet", async () => {
  await verifyBoundary();
  const fixture = await scaffoldCliFixture();
  roots.push(fixture.root);
  const handoffRoot = join(fixture.root, "released-handoff");
  const projectRoot = join(fixture.root, "fresh-project");
  await Promise.all([mkdir(handoffRoot), mkdir(projectRoot)]);
  await Promise.all([
    cp(
      join(fixtureRoot, "released/org-worker-bundle.json"),
      join(handoffRoot, "org-worker-bundle.json"),
    ),
    cp(
      join(fixtureRoot, "snapshot.valid.json"),
      join(handoffRoot, "snapshot.json"),
    ),
    cp(
      join(fixtureRoot, "packet-root/artifacts"),
      join(handoffRoot, "artifacts"),
      { recursive: true },
    ),
  ]);
  const env = envFor(fixture);
  const common = [
    "--frozen",
    "--org-worker-bundle",
    join(handoffRoot, "org-worker-bundle.json"),
    "--worker-artifact-snapshot",
    join(handoffRoot, "snapshot.json"),
    "--json",
  ];
  const install = async (
    action: "materialize" | "reconcile" | "remove",
    operationId: string,
  ) =>
    runAgentsCli(
      [
        "install",
        ...(action === "reconcile" ? ["--reconcile"] : []),
        ...(action === "remove" ? ["--remove"] : []),
        "--operation-id",
        operationId,
        ...common,
      ],
      env,
      projectRoot,
      { skipWriteScopeAuto: true },
    );

  const materialized = await install(
    "materialize",
    "operation:scenario:materialize",
  );
  expect(materialized.exitCode).toBe(0);
  expect(JSON.parse(materialized.stdout)).toMatchObject({
    action: "materialize",
    outcome: "verified",
    replayed: false,
  });
  const status = await runAgentsCli(
    ["status", "--json"],
    env,
    projectRoot,
  );
  expect(status.exitCode).toBe(0);
  expect(JSON.parse(status.stdout).orgWorkerMaterialization).toMatchObject({
    state: "current",
    bundleDigest:
      "sha256:6597b05cdad254375332d56a23f4d052c61bae6c8836b3f24e0f80c8eb4eaa48",
    instructionConsentSource: "organization",
    issues: [],
  });

  const noOp = await install(
    "reconcile",
    "operation:scenario:reconcile-noop",
  );
  expect(noOp.exitCode).toBe(0);
  expect(JSON.parse(noOp.stdout)).toMatchObject({
    action: "reconcile",
    outcome: "verified",
  });

  const vendorDir = resolveProjectVendorTree(
    projectRoot,
    "gtm-worker",
    "1fb0a826d6fc73bb52c0a22e6e2925e2783701a5",
  );
  await writeFile(
    join(vendorDir, "instructions.md"),
    "tampered instructions\n",
  );
  const drifted = await runAgentsCli(
    ["doctor", "--json"],
    env,
    projectRoot,
  );
  expect(drifted.exitCode).toBe(1);
  expect(JSON.parse(drifted.stdout).orgWorkerMaterialization).toMatchObject({
    state: "drifted",
    issues: [
      {
        code: "ORG_WORKER_ARTIFACT_DRIFT",
        severity: "error",
      },
    ],
  });

  const repaired = await install(
    "reconcile",
    "operation:scenario:reconcile-repair",
  );
  expect(repaired.exitCode).toBe(0);
  expect(
    await readFile(join(vendorDir, "instructions.md"), "utf8"),
  ).toBe("reviewed instructions\n");

  const removed = await install(
    "remove",
    "operation:scenario:remove",
  );
  expect(removed.exitCode).toBe(0);
  expect(JSON.parse(removed.stdout)).toMatchObject({
    action: "remove",
    outcome: "removed",
  });
  expect(existsSync(vendorDir)).toBe(false);
  const removedStatus = await runAgentsCli(
    ["doctor", "--json"],
    env,
    projectRoot,
  );
  expect(removedStatus.exitCode).toBe(0);
  expect(
    JSON.parse(removedStatus.stdout).orgWorkerMaterialization,
  ).toMatchObject({ state: "removed", issues: [] });

  const receiptRoot =
    resolveWorkerMaterializationReceiptsRoot(projectRoot);
  const actualReceipts = await Promise.all(
    (await readdir(receiptRoot))
      .sort()
      .map(async (name) =>
        parseWorkerMaterializationReceipt(
          JSON.parse(
            await readFile(join(receiptRoot, name), "utf8"),
          ),
        ),
      ),
  );
  expect(
    actualReceipts.map(({ action }) => action).sort(),
  ).toEqual(["materialize", "reconcile", "reconcile", "remove"]);
  const expectedByAction = new Map(
    await Promise.all(
      ["materialize", "reconcile", "remove"].map(async (action) => [
        action,
        JSON.parse(
          await readFile(
            join(fixtureRoot, `receipts/${action}.valid.json`),
            "utf8",
          ),
        ),
      ] as const),
    ),
  );
  for (const action of ["materialize", "remove"] as const) {
    const actual = actualReceipts.find(
      (receipt) => receipt.action === action,
    );
    expect(actual).toBeDefined();
    expect(normalizedReceipt(actual)).toEqual(
      normalizedReceipt(expectedByAction.get(action)),
    );
  }
  for (const actual of actualReceipts.filter(
    ({ action }) => action === "reconcile",
  )) {
    expect(normalizedReceipt(actual)).toEqual(
      normalizedReceipt(expectedByAction.get("reconcile")),
    );
  }
  const removedReceipt = actualReceipts.find(
    ({ action }) => action === "remove",
  )!;
  const repairReceipt = actualReceipts.find(
    ({ operationId }) =>
      operationId === "operation:scenario:reconcile-repair",
  )!;
  expect(removedReceipt.priorReceiptDigest).toBe(
    computeWorkerMaterializationReceiptDigest(repairReceipt),
  );
});
