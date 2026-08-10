// ABOUTME: Locks I221's payload validation gate: unknown contract versions and digest mismatches
// ABOUTME: reject loudly before any filesystem effect; valid payloads come back typed.

import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { materializeWorkerPayload, validateMaterializePayload } from "../cli/core/worker-materialize";
import type { WorkerDeployPayload } from "../cli/core/worker-deploy";
import { freshRoots, goldenPayload } from "./worker-materialize-fixture";

function rawPayload(storeBytes: Buffer): Record<string, unknown> {
  return {
    contractVersion: 1,
    materialization: "lockfile-store-export",
    entrypoint: { requested: "@me/bp@^1.0.0", name: "@me/bp", kind: "blueprint" },
    lockfile: {
      lockfileVersion: 5,
      store: { minDrwnVersion: "0.8.0" },
      cards: [{ name: "@me/bp", requested: "@me/bp@^1.0.0", version: "1.0.0" }],
    },
    config: { version: 1, cards: ["@me/bp"] },
    governance: null,
    storeExport: {
      kind: "drwn-store-export-tar",
      compression: "none",
      encoding: "base64",
      sha256: createHash("sha256").update(storeBytes).digest("hex"),
      byteLength: storeBytes.byteLength,
      bytesBase64: storeBytes.toString("base64"),
    },
  };
}

describe("validateMaterializePayload", () => {
  const bytes = Buffer.from("store-bytes");

  test("a valid payload comes back typed", () => {
    const payload = validateMaterializePayload(rawPayload(bytes));
    expect(payload.entrypoint.name).toBe("@me/bp");
    expect(payload.contractVersion).toBe(1);
  });

  test("an unknown contract version is a hard reject naming the version", () => {
    const raw = { ...rawPayload(bytes), contractVersion: 2 };
    expect(() => validateMaterializePayload(raw)).toThrow(/contractVersion 2/);
  });

  test("a sha256 mismatch rejects before anything else happens", () => {
    const raw = rawPayload(bytes);
    (raw.storeExport as Record<string, unknown>).sha256 = "0".repeat(64);
    expect(() => validateMaterializePayload(raw)).toThrow(/sha256/);
  });

  test("a byteLength mismatch rejects", () => {
    const raw = rawPayload(bytes);
    (raw.storeExport as Record<string, unknown>).byteLength = 999999;
    expect(() => validateMaterializePayload(raw)).toThrow(/byteLength/);
  });

  test("an unsupported materialization mode rejects", () => {
    const raw = { ...rawPayload(bytes), materialization: "something-else" };
    expect(() => validateMaterializePayload(raw)).toThrow(/materialization/);
  });

  test("an empty card closure rejects — cards[0] is the contractual entrypoint root", () => {
    const raw = rawPayload(bytes);
    (raw.lockfile as Record<string, unknown>).cards = [];
    expect(() => validateMaterializePayload(raw)).toThrow(/cards/);
  });
});

describe("materializeWorkerPayload pre-effect revalidation", () => {
  let golden: WorkerDeployPayload;
  let repoRoot: string;

  beforeAll(async () => {
    const fixture = await goldenPayload();
    golden = fixture.payload;
    repoRoot = fixture.repoRoot;
  });

  function tampered(mutate: (payload: WorkerDeployPayload) => void): WorkerDeployPayload {
    const clone = structuredClone(golden);
    // Corrupting the store digest in every case proves validation order: if store
    // decoding or digest work ran first, the sha256 mismatch would surface instead.
    clone.storeExport.sha256 = "0".repeat(64);
    mutate(clone);
    return clone;
  }

  async function expectRejectedBeforeEffects(
    payload: WorkerDeployPayload,
    code: string,
    message: RegExp,
  ) {
    const roots = await freshRoots();
    const emitProjectTar = join(roots.base, "emitted-project.tar");
    const emitStoreTar = join(roots.base, "emitted-store.tar");
    const attempt = materializeWorkerPayload({
      payload,
      projectRoot: roots.projectRoot,
      agentsDir: roots.agentsDir,
      homeDir: roots.homeDir,
      repoRoot,
      emitProjectTar,
      emitStoreTar,
    });
    await expect(attempt).rejects.toMatchObject({ code });
    await expect(attempt).rejects.toThrow(message);
    await expect(attempt).rejects.not.toThrow(/sha256 does not match/);
    expect(existsSync(roots.projectRoot)).toBe(false);
    expect(existsSync(roots.agentsDir)).toBe(false);
    expect(existsSync(emitProjectTar)).toBe(false);
    expect(existsSync(emitStoreTar)).toBe(false);
  }

  test("an absent, null, malformed, old, or unknown-key envelope rejects before every effect", async () => {
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        delete (payload as Partial<WorkerDeployPayload>).runtimeAdmission;
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /required/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        (payload as unknown as Record<string, unknown>).runtimeAdmission = null;
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /required/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        (payload as unknown as Record<string, unknown>).runtimeAdmission = "malformed";
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /match|canonical/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        (payload.runtimeAdmission as unknown as Record<string, unknown>).schemaVersion = 2;
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /match/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        (payload.runtimeAdmission as unknown as Record<string, unknown>).extraField = true;
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /match/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        (payload.runtimeAdmission as unknown as Record<string, unknown>).derivationVersion = "worker-runtime-admission-v2";
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /match/i,
    );
  });

  test("a noncanonical or oversized envelope rejects before every effect", async () => {
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        (payload.runtimeAdmission.activation as unknown as Record<string, unknown>).schemaVersion = 1.5;
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /canonical/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.runtimeAdmission.activation.servers = Array.from({ length: 2000 }, (_, index) => ({
          serverId: `oversize-${index}-${"x".repeat(64)}`,
          active: true as const,
          readiness: "required" as const,
          authMode: "none" as const,
          requirementIds: [],
        }));
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /limit|match/i,
    );
  });

  test("one-bit closure, activation, requirement, and component-hash mutations reject", async () => {
    const flips: Array<(payload: WorkerDeployPayload) => void> = [
      (payload) => {
        payload.runtimeAdmission.closureHash = `${payload.runtimeAdmission.closureHash.slice(0, 63)}${payload.runtimeAdmission.closureHash.endsWith("0") ? "1" : "0"}`;
      },
      (payload) => {
        payload.runtimeAdmission.activation.activationHash = `${payload.runtimeAdmission.activation.activationHash.slice(0, 63)}${payload.runtimeAdmission.activation.activationHash.endsWith("0") ? "1" : "0"}`;
      },
      (payload) => {
        payload.runtimeAdmission.runtimeRequirements.manifestHash = `${payload.runtimeAdmission.runtimeRequirements.manifestHash.slice(0, 63)}${payload.runtimeAdmission.runtimeRequirements.manifestHash.endsWith("0") ? "1" : "0"}`;
      },
    ];
    for (const flip of flips) {
      await expectRejectedBeforeEffects(
        tampered(flip),
        "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
        /match/i,
      );
    }
  });

  test("closure or application mutation after envelope production rejects", async () => {
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.lockfile.cards[1]!.manifest.applicationRequirements = {
          version: 1,
          apps: [{ app: "smuggled", pipedreamApp: "smuggled" }],
        };
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /match/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.lockfile.cards[1]!.integrity = "sha256-tampered";
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /match/i,
    );
  });

  test("absent, mixed, and partial lock declarations reject with the admission code", async () => {
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        delete payload.lockfile.cards[1]!.manifest.runtimeAdmission;
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /coverage|declaration/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        delete payload.lockfile.cards[1]!.manifest.applicationRequirements;
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /coverage|declaration/i,
    );
    // All-absent with a matching historical floor: the closure parses as history but
    // cannot materialize through the deploy contract.
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        for (const card of payload.lockfile.cards) {
          delete card.manifest.runtimeAdmission;
          delete card.manifest.applicationRequirements;
        }
        payload.lockfile.store.minDrwnVersion = "0.8.0";
      }),
      "WORKER_MATERIALIZE_RUNTIME_ADMISSION_INVALID",
      /coverage|declaration|required/i,
    );
  });

  test("outer payload and reconstructed-lock failures reject before store decoding and effects", async () => {
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.entrypoint.name = "@me/other";
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /entrypoint/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.entrypoint.kind = "card";
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /kind/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.lockfile.store.minDrwnVersion = "0.8.0";
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /minDrwnVersion/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.lockfile.cards.push(structuredClone(payload.lockfile.cards[1]!));
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /more than once|member/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.lockfile.cards[1]!.path = "/abs/elsewhere";
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /portable|path/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.lockfile.cards[1]!.origin = "file" as never;
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /origin/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        delete payload.lockfile.cards[1]!.treeSha;
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /treeSha/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        payload.lockfile.cards[1]!.integrity = "";
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /integrity/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        delete payload.lockfile.cards[1]!.git;
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /commit/i,
    );
    await expectRejectedBeforeEffects(
      tampered((payload) => {
        (payload as unknown as Record<string, unknown>).contractVersion = 2;
      }),
      "WORKER_MATERIALIZE_PAYLOAD_INVALID",
      /contractVersion 2/,
    );
  });

  test("the store digest gate still rejects with the outer payload code after admission passes", async () => {
    const roots = await freshRoots();
    const digestTamper = structuredClone(golden);
    digestTamper.storeExport.sha256 = "0".repeat(64);
    const attempt = materializeWorkerPayload({
      payload: digestTamper,
      projectRoot: roots.projectRoot,
      agentsDir: roots.agentsDir,
      homeDir: roots.homeDir,
      repoRoot,
    });
    await expect(attempt).rejects.toMatchObject({ code: "WORKER_MATERIALIZE_PAYLOAD_INVALID" });
    await expect(attempt).rejects.toThrow(/sha256 does not match/);
    expect(existsSync(roots.projectRoot)).toBe(false);
    expect(existsSync(roots.agentsDir)).toBe(false);
  });
});
