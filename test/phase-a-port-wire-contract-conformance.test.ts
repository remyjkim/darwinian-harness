// ABOUTME: Pins the reviewed I321 D52 port-wire companion as exact Worker package bytes.
// ABOUTME: Refuses a reauthored transport contract or projector before runtime admission.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { REQUIRED_RELEASE_MEMBERS } from "../scripts/release/artifact-contract";

const root = join(import.meta.dir, "..");
const authorityRoot = join(
  root,
  "registry",
  "contracts",
  "cli-management-phase-a-port-wire.v1",
);
const lockPath = join(
  root,
  "cli",
  "generated",
  "dah-cli-management-phase-a-port-wire-lock.json",
);

const expected = {
  "contract.json": "2ac7761d30b3fa33fddf407ab55b598e284beb6def7707bb8df5e6f0b4066647",
  "projector.mjs": "157eb03e7dde2ef6f816781e173a415373657382757bfdb568dc0dab9df5622a",
  "manifest.json": "9d62e76cd8317647e833ab01197ab1eba8f5a10ec4f47662a131c3fe080b7277",
  "README.md": "c4ee5ddb786cc6b9d3cd9f8a660e0741dbe7e2d8756acd181aac57b46623aa6d",
} as const;

describe("I321 D52 Phase-A port-wire companion authority", () => {
  test("vendors the exact reviewed contract, projector, manifest, and guide bytes", async () => {
    for (const [name, sha256] of Object.entries(expected)) {
      const path = join(authorityRoot, name);
      expect(await Bun.file(path).exists(), name).toBe(true);
      const bytes = await readFile(path);
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(sha256);
    }
  });

  test("pins the reviewed source, merged main authority, hashes, and vector counts", async () => {
    expect(await Bun.file(lockPath).exists()).toBe(true);
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual({
      schema: "dah.cli-management-phase-a-port-wire-contract-lock",
      schemaVersion: 1,
      servicesRepository: "curation-labs/darwinian-services",
      sourceCommit: "79a43d5d8a4cbaa4b88794953c4e59be51dec78d",
      mergedMainCommit: "1564ceac28425d37351a6380b233e93b6e720ee4",
      contractSha256: expected["contract.json"],
      projectorSha256: expected["projector.mjs"],
      manifestSha256: expected["manifest.json"],
      readmeSha256: expected["README.md"],
      vectorCount: 66,
      positiveVectorCount: 17,
      hostileVectorCount: 49,
    });
  });

  test("requires every companion authority member in the release tar", () => {
    expect(REQUIRED_RELEASE_MEMBERS).toEqual(expect.arrayContaining([
      "cli/generated/dah-cli-management-phase-a-port-wire-lock.json",
      "registry/contracts/cli-management-phase-a-port-wire.v1/contract.json",
      "registry/contracts/cli-management-phase-a-port-wire.v1/projector.mjs",
      "registry/contracts/cli-management-phase-a-port-wire.v1/manifest.json",
      "registry/contracts/cli-management-phase-a-port-wire.v1/README.md",
    ]));
  });

  test("admits the dependency-closed projector with its exact transport surface", async () => {
    let authority: {
      contract: Record<string, unknown>;
      projector: {
        I321_PHASE_A_LOCAL_OPERATION_ORDER_V1: readonly unknown[];
        I321_PHASE_A_REMOTE_CALL_ORDER_V1: readonly unknown[];
        I321_PHASE_A_CLEANUP_STATES_V1: readonly string[];
        parseI321PhaseACleanupRpcRequestV1(value: unknown): Record<string, unknown>;
      };
    } | undefined;
    let failure: unknown;
    try {
      const module = await import("../cli/core/management/phase-a-port-wire");
      authority = await module.loadI321PhaseAPortWireAuthority();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeUndefined();
    expect(authority?.contract).toMatchObject({
      schema: "cl.dah.cli-management-phase-a-port-wire.v1",
      transport: {
        method: "POST",
        executePath: "/v1/phase-a/execute",
        cleanupPath: "/v1/phase-a/cleanup",
        executeTimeoutMs: 15_000,
        cleanupTimeoutMs: 5_000,
        maxResponseBytes: 65_536,
      },
    });
    expect(authority?.projector.I321_PHASE_A_LOCAL_OPERATION_ORDER_V1).toHaveLength(2);
    expect(authority?.projector.I321_PHASE_A_REMOTE_CALL_ORDER_V1).toHaveLength(12);
    expect(authority?.projector.I321_PHASE_A_CLEANUP_STATES_V1).toEqual([
      "pending",
      "normal_inflight",
      "fail_safe_inflight",
      "complete",
      "terminal_failure",
    ]);
    expect(authority?.projector.parseI321PhaseACleanupRpcRequestV1({
      schema: "cl.dah.cli-management-phase-a-rpc.v1",
      qualificationRunId: "11111111-1111-4111-8111-111111111111",
      sourceCommitSha: "a".repeat(40),
      requestId: "22222222-2222-4222-8222-222222222222",
      adapterProcessGeneration: "33333333-3333-4333-8333-333333333333",
      cleanupMode: "fail_safe",
    })).toMatchObject({ cleanupMode: "fail_safe" });
  });
});
