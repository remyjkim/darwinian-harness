// ABOUTME: Locks I221's payload validation gate: unknown contract versions and digest mismatches
// ABOUTME: reject loudly before any filesystem effect; valid payloads come back typed.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { validateMaterializePayload } from "../cli/core/worker-materialize";

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
