// ABOUTME: Locks I221's dual store-bytes input: external bytes take precedence over inline
// ABOUTME: base64, are digest-checked against the payload's declared sha256, and lean payloads work.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { materializeWorkerPayload, validateMaterializePayload } from "../cli/core/worker-materialize";
import { freshRoots, goldenPayload } from "./worker-materialize-fixture";

describe("materialize store-export input", () => {
  test("external bytes with a lean payload: inline base64 emptied, declared digest verified against the file bytes", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const storeExportBytes = Buffer.from(payload.storeExport.bytesBase64, "base64");

    const lean = JSON.parse(JSON.stringify(payload));
    lean.storeExport.bytesBase64 = "";
    const validated = validateMaterializePayload(lean, { storeExportBytes });

    const roots = await freshRoots();
    const result = await materializeWorkerPayload({ payload: validated, repoRoot, ...roots, storeExportBytes });
    expect(result.cards).toBe(2);
    expect(existsSync(join(roots.projectRoot, ".claude", "skills", "react"))).toBe(true);
  }, 60_000);

  test("external bytes produce results byte-identical to the inline lane", async () => {
    const { payload, repoRoot } = await goldenPayload();
    const storeExportBytes = Buffer.from(payload.storeExport.bytesBase64, "base64");

    const inlineRoots = await freshRoots();
    const externalRoots = await freshRoots();
    await materializeWorkerPayload({ payload, repoRoot, ...inlineRoots });
    await materializeWorkerPayload({ payload, repoRoot, ...externalRoots, storeExportBytes });

    for (const relative of [join(".agents", "drwn", "config.json"), join(".agents", "drwn", "card.lock")]) {
      const inline = await readFile(join(inlineRoots.projectRoot, relative), "utf8");
      const external = await readFile(join(externalRoots.projectRoot, relative), "utf8");
      // Identical up to each run's own agents-dir prefix in lock card paths.
      expect(external.replaceAll(externalRoots.agentsDir, "<agents>")).toBe(
        inline.replaceAll(inlineRoots.agentsDir, "<agents>"),
      );
    }
  }, 90_000);

  test("external bytes that do not match the declared sha256 reject before any filesystem effect", async () => {
    const { payload } = await goldenPayload();
    const lean = JSON.parse(JSON.stringify(payload));
    lean.storeExport.bytesBase64 = "";
    expect(() => validateMaterializePayload(lean, { storeExportBytes: Buffer.from("tampered") })).toThrow(/sha256|byteLength/);
  }, 60_000);
});
