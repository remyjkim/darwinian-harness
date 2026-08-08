// ABOUTME: Guards that the reported drwn version stays in sync with package.json and never lags an emitted lock floor.
// ABOUTME: Prevents the version-vs-feature drift that let drwn run below its own minDrwnVersion floor.

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DRWN_VERSION, readRuntimeVersion } from "../cli/core/version";
import { PROJECT_WORKER_MIN_DRWN_VERSION, WORKER_MIND_MIN_DRWN_VERSION } from "../cli/core/card-lock";
import { gte } from "../cli/core/semver-utils";

describe("drwn version reconciliation", () => {
  test("DRWN_VERSION matches package.json version", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as { version: string };
    expect(DRWN_VERSION).toBe(pkg.version);
    expect(DRWN_VERSION).toBe("1.2.0");
  });

  test("runtime version loading fails loudly for missing, malformed, and invalid package metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "drwn-i239-version-"));
    try {
      const packagePath = join(root, "package.json");
      expect(() => readRuntimeVersion(packagePath)).toThrow("Worker package metadata is unavailable or invalid");
      await writeFile(packagePath, "{not-json");
      expect(() => readRuntimeVersion(packagePath)).toThrow("Worker package metadata is unavailable or invalid");
      for (const metadata of [{}, { version: "v1.2.0" }, { version: "1.2" }, { version: 12 }]) {
        await writeFile(packagePath, JSON.stringify(metadata));
        expect(() => readRuntimeVersion(packagePath)).toThrow("Worker package metadata is unavailable or invalid");
      }
      await writeFile(packagePath, JSON.stringify({ version: "1.2.0" }));
      expect(readRuntimeVersion(packagePath)).toBe("1.2.0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("running version is at least the highest floor drwn can emit", () => {
    expect(gte(DRWN_VERSION, PROJECT_WORKER_MIN_DRWN_VERSION)).toBe(true);
    expect(gte(DRWN_VERSION, WORKER_MIND_MIN_DRWN_VERSION)).toBe(true);
  });

  test("publishes distinct project and optional Mind floors", () => {
    expect(PROJECT_WORKER_MIN_DRWN_VERSION).toBe("0.8.0");
    expect(WORKER_MIND_MIN_DRWN_VERSION).toBe("0.9.0");
  });

  test("keeps the release hard-cut floor and Buzz delivery floor separate from current identity", () => {
    const buzz = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "registry", "cards", "buzz-delivery-worker", "card.json"), "utf8"),
    ) as { harness?: { minVersion?: string } };
    expect(gte(DRWN_VERSION, "1.1.0")).toBe(true);
    expect(buzz.harness?.minVersion).toBe("1.2.0");
  });
});
