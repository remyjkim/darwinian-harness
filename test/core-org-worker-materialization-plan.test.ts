// ABOUTME: Proves fresh Org Worker project intent is deterministic, exact, and side-effect free.
// ABOUTME: Keeps transferred organization consent external to local Card lock consent.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseWorkerArtifactSnapshotV1,
  verifyWorkerArtifactSnapshot,
} from "../cli/core/org-worker-artifact-snapshot";
import {
  deriveFreshOrgWorkerMaterializationPlan,
} from "../cli/core/org-worker-materialization-plan";
import {
  computeOrgWorkerBundleDigest,
  parseOrgWorkerBundleV1,
} from "../cli/core/org-worker-bundle-v1";

async function readJson(relativePath: string) {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

const packetRoot = fileURLToPath(
  new URL(
    "./fixtures/org-worker-materialization-v1/packet-root/",
    import.meta.url,
  ),
);

async function verifiedInput() {
  const bundle = parseOrgWorkerBundleV1(
    await readJson("./fixtures/org-worker-bundle-v1/gtm.valid.json"),
  );
  const verifiedSnapshot = await verifyWorkerArtifactSnapshot({
    bundle,
    snapshot: parseWorkerArtifactSnapshotV1(
      await readJson(
        "./fixtures/org-worker-materialization-v1/snapshot.valid.json",
      ),
    ),
    packetRoot,
  });
  return { bundle, verifiedSnapshot };
}

describe("fresh Org Worker materialization planner", () => {
  test("derives exact deterministic config, lock, closure, consent, and changes from an empty project", async () => {
    const input = await verifiedInput();
    const first = deriveFreshOrgWorkerMaterializationPlan({
      ...input,
      existingProject: { configBytes: null, lockBytes: null },
    });
    const second = deriveFreshOrgWorkerMaterializationPlan({
      ...input,
      existingProject: { configBytes: null, lockBytes: null },
    });

    expect(second).toEqual(first);
    expect(first.configBytes).toBe(
      '{\n' +
        '  "schema": "drwn.project-config",\n' +
        '  "schemaVersion": 1,\n' +
        '  "workers": [\n' +
        '    "gtm-worker@1.0.0"\n' +
        "  ],\n" +
        '  "activeWorker": "gtm-worker"\n' +
        "}\n",
    );
    expect(JSON.parse(first.lockBytes)).toEqual({
      schema: "drwn.project-lock",
      schemaVersion: 1,
      store: { minDrwnVersion: "0.8.0" },
      workerRoots: [
        {
          name: "gtm-worker",
          requested: "gtm-worker@1.0.0",
          kind: "blueprint",
          members: [],
        },
      ],
      cards: [
        {
          name: "gtm-worker",
          requested: "gtm-worker@1.0.0",
          version: "1.0.0",
          path: join(packetRoot, "artifacts", "gtm-worker-root"),
          integrity:
            "sha256-dc71165b300a88ab4bafd0bc6a32dc82afe106ac2b40102ac08cd74985edc092",
          treeSha: "1fb0a826d6fc73bb52c0a22e6e2925e2783701a5",
          manifest: {
            name: "gtm-worker",
            version: "1.0.0",
            kind: "blueprint",
            instructions: { path: "instructions.md" },
          },
          skills: [],
          hooks: [],
          registry: null,
          origin: "git",
          git: {
            commit: "bbd7924d12a1cf8818755ea49c1858875e7bdac7",
          },
        },
      ],
    });
    expect(first.artifactClosure).toEqual([
      {
        artifactPinRef: "artifact:gtm-worker-root",
        name: "gtm-worker",
        version: "1.0.0",
        requestedRef: "gtm-worker@1.0.0",
        contentRoot: join(packetRoot, "artifacts", "gtm-worker-root"),
      },
    ]);
    expect(first.effectiveExternalConsentEvidence).toEqual([
      {
        kind: "org_worker_bundle_consent",
        bundleDigest:
          "sha256:6597b05cdad254375332d56a23f4d052c61bae6c8836b3f24e0f80c8eb4eaa48",
        sourceBlueprint: {
          ...input.bundle.sourceBlueprint,
          digest: input.bundle.sourceBlueprint
            .digest as `sha256:${string}`,
        },
        consentId: "consent:gtm-instructions",
        workerId: "worker:gtm-operator",
        artifactPinRef: "artifact:gtm-worker-root",
        consentedRange: ">=1.0.0 <2.0.0",
        contentDigest:
          "sha256-5f35dbf8972723a994b65ae1f9b2e93fd9762bfcdd4171a624b80f1620526429",
        ratifierRef: "actor:gtm-owner",
        evidenceRefs: ["evidence:gtm-instruction-consent"],
        projectionSurface: "worker_instructions",
      },
    ]);
    expect(first.intendedProjectionIdentities).toEqual([
      {
        consentId: "consent:gtm-instructions",
        artifactPinRef: "artifact:gtm-worker-root",
        contributionKind: "instructions",
        projectionSurface: "worker_instructions",
        contentDigest:
          "sha256-5f35dbf8972723a994b65ae1f9b2e93fd9762bfcdd4171a624b80f1620526429",
      },
    ]);
    expect(first.changes).toEqual([
      {
        path: ".agents/drwn/config.json",
        operation: "create",
        bytes: first.configBytes,
      },
      {
        path: ".agents/drwn/card.lock",
        operation: "create",
        bytes: first.lockBytes,
      },
    ]);
    expect(JSON.stringify(JSON.parse(first.lockBytes))).not.toContain(
      "instructionConsent",
    );
  });

  test("preserves bundle root order and maps active root by pin identity", async () => {
    const input = await verifiedInput();
    const duplicated = structuredClone(
      input.verifiedSnapshot.verifiedArtifacts[0]!,
    );
    duplicated.artifactPinRef = "artifact:second-root";
    duplicated.name = "second-root";
    duplicated.requestedRef = "second-root@1.0.0";
    duplicated.manifest = {
      name: "second-root",
      version: "1.0.0",
      kind: "blueprint",
    };
    input.verifiedSnapshot.verifiedArtifacts.push(duplicated);
    input.bundle.artifactPins.push({
      ...structuredClone(input.bundle.artifactPins[0]!),
      artifactId: "artifact:second-root",
      name: "second-root",
    });
    input.bundle.orderedWorkerRoots = [
      "artifact:second-root",
      "artifact:gtm-worker-root",
    ];
    input.bundle.activeWorkerRoot = "artifact:gtm-worker-root";
    input.verifiedSnapshot.sourceBundleDigest =
      computeOrgWorkerBundleDigest(input.bundle);

    const plan = deriveFreshOrgWorkerMaterializationPlan({
      ...input,
      existingProject: { configBytes: null, lockBytes: null },
    });

    expect(plan.config.workers).toEqual([
      "second-root@1.0.0",
      "gtm-worker@1.0.0",
    ]);
    expect(plan.lock.workerRoots.map(({ name }) => name)).toEqual([
      "second-root",
      "gtm-worker",
    ]);
    expect(plan.config.activeWorker).toBe("gtm-worker");
  });

  test("rejects unrelated existing state with a stable bounded conflict", async () => {
    const input = await verifiedInput();

    expect(() =>
      deriveFreshOrgWorkerMaterializationPlan({
        ...input,
        existingProject: {
          configBytes: '{"schema":"foreign"}\n',
          lockBytes: null,
        },
      }),
    ).toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_PROJECT_CONFLICT",
        message: "Existing project state conflicts with fresh materialization",
      }),
    );
  });

  test("rejects floating requested intent and never reads the network", async () => {
    const input = await verifiedInput();
    input.verifiedSnapshot.verifiedArtifacts[0]!.requestedRef =
      "gtm-worker@^1.0.0";
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = Object.assign(
      () => {
        calls += 1;
        throw new Error("network access is forbidden");
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    try {
      expect(() =>
        deriveFreshOrgWorkerMaterializationPlan({
          ...input,
          existingProject: { configBytes: null, lockBytes: null },
        }),
      ).toThrow(
        expect.objectContaining({
          code: "ORG_WORKER_FLOATING_INTENT_UNSUPPORTED",
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(calls).toBe(0);
  });

  test("returns unchanged deterministic changes for byte-identical prior project state", async () => {
    const input = await verifiedInput();
    const fresh = deriveFreshOrgWorkerMaterializationPlan({
      ...input,
      existingProject: { configBytes: null, lockBytes: null },
    });

    const repeated = deriveFreshOrgWorkerMaterializationPlan({
      ...input,
      existingProject: {
        configBytes: fresh.configBytes,
        lockBytes: fresh.lockBytes,
      },
    });

    expect(repeated.changes.map(({ operation }) => operation)).toEqual([
      "unchanged",
      "unchanged",
    ]);
  });
});
