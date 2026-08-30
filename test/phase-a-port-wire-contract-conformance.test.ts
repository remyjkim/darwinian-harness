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
  "contract.json": "4a62e76ebf5f4d8ffc5f5891a0939165e1aa7bb22ad3916aff5f3ced32cbce7a",
  "projector.mjs": "157eb03e7dde2ef6f816781e173a415373657382757bfdb568dc0dab9df5622a",
  "manifest.json": "90bc380b54f277bc5179a6060609b99e76024e97b4bd871bab615e59332b0378",
  "README.md": "855ea78eb51ae7bc2d6d63a86a9e1b28c1d05f6a05ecca72c8ed0815c3283bc8",
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

  test("pins the reviewed source, hashes, and vector counts", async () => {
    expect(await Bun.file(lockPath).exists()).toBe(true);
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual({
      schema: "dah.cli-management-phase-a-port-wire-contract-lock",
      schemaVersion: 1,
      servicesRepository: "curation-labs/darwinian-services",
      sourceCommit: "d0156761c19f4e7dc5a63914a1117f298b535c37",
      contractSha256: expected["contract.json"],
      projectorSha256: expected["projector.mjs"],
      manifestSha256: expected["manifest.json"],
      readmeSha256: expected["README.md"],
      vectorCount: 67,
      positiveVectorCount: 17,
      hostileVectorCount: 50,
    });
  });

  test("requires every companion authority member in the release tar", () => {
    expect(REQUIRED_RELEASE_MEMBERS).toEqual(expect.arrayContaining([
      "cli/core/management/phase-a-port-wire.ts",
      "cli/core/management/phase-a-port-client.ts",
      "cli/core/management/phase-a-qualification.ts",
      "cli/core/management/phase-a-output.ts",
      "cli/core/management/phase-a-ceremony.ts",
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
