// ABOUTME: Locks I221's pure derivations: T1 (payload entrypoint → V2 project config) and
// ABOUTME: T2 (payload lockfile → V2 project lock with agents-dir-relative path rewrite).

import { describe, expect, test } from "bun:test";
import { validateCardLockfile } from "../cli/core/card-lock";
import { validateProjectConfig } from "../cli/core/project";
import { deriveMaterializeConfig, deriveMaterializeLock } from "../cli/core/worker-materialize";
import type { WorkerDeployPayload } from "../cli/core/worker-deploy";

const TREE_ROOT = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const TREE_MEMBER = "b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const COMMIT = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

function payloadFixture(): WorkerDeployPayload {
  return {
    contractVersion: 1,
    materialization: "lockfile-store-export",
    entrypoint: {
      requested: "@me/frontend-eng@^1.0.0",
      name: "@me/frontend-eng",
      kind: "blueprint",
    },
    lockfile: {
      lockfileVersion: 5,
      store: { minDrwnVersion: "0.8.0" },
      cards: [
        {
          name: "@me/frontend-eng",
          requested: "@me/frontend-eng@^1.0.0",
          version: "1.0.0",
          path: `drwn/extracted/${TREE_ROOT}`,
          integrity: "sha256-root",
          treeSha: TREE_ROOT,
          manifest: {
            name: "@me/frontend-eng",
            version: "1.0.0",
            kind: "blueprint",
            composedFrom: ["@me/react-builder@^1.0.0"],
          },
          skills: [],
          hooks: [],
          registry: null,
          origin: "store",
          git: { commit: COMMIT },
        },
        {
          name: "@me/react-builder",
          requested: "@me/react-builder@^1.0.0",
          version: "1.0.0",
          path: `drwn/extracted/${TREE_MEMBER}`,
          integrity: "sha256-member",
          treeSha: TREE_MEMBER,
          manifest: { name: "@me/react-builder", version: "1.0.0" },
          skills: ["react"],
          hooks: [],
          registry: null,
          origin: "store",
          git: { commit: COMMIT },
        },
      ],
    },
    config: { version: 1, cards: ["@me/frontend-eng"] },
    governance: null,
    storeExport: {
      kind: "drwn-store-export-tar",
      compression: "none",
      encoding: "base64",
      sha256: "0".repeat(64),
      byteLength: 0,
      bytesBase64: "",
    },
  };
}

describe("deriveMaterializeConfig (T1)", () => {
  test("derives the V2 project config from the entrypoint and ignores the legacy config field", () => {
    const config = deriveMaterializeConfig(payloadFixture());
    expect(config).toEqual({
      schema: "drwn.project-config",
      schemaVersion: 1,
      workers: ["@me/frontend-eng@^1.0.0"],
      activeWorker: "@me/frontend-eng",
    });
    expect(() => validateProjectConfig(config, "<derived>")).not.toThrow();
  });
});

describe("deriveMaterializeLock (T2)", () => {
  test("wraps the payload lockfile into a valid V2 lock with the root entry in closure order", () => {
    const lock = deriveMaterializeLock(payloadFixture(), "/opt/cli-home/.agents");
    expect(lock.schema).toBe("drwn.project-lock");
    expect(lock.workerRoots).toEqual([
      {
        name: "@me/frontend-eng",
        requested: "@me/frontend-eng@^1.0.0",
        kind: "blueprint",
        members: ["@me/react-builder"],
      },
    ]);
    expect(() => validateCardLockfile(structuredClone(lock), "<derived>")).not.toThrow();
  });

  test("rewrites every card path under the given agents dir — nothing store-relative survives", () => {
    const lock = deriveMaterializeLock(payloadFixture(), "/opt/cli-home/.agents");
    expect(lock.cards.map((card) => card.path)).toEqual([
      `/opt/cli-home/.agents/drwn/extracted/${TREE_ROOT}`,
      `/opt/cli-home/.agents/drwn/extracted/${TREE_MEMBER}`,
    ]);
  });

  test("a different agents dir yields different absolute paths from the same payload", () => {
    const a = deriveMaterializeLock(payloadFixture(), "/opt/cli-home/.agents");
    const b = deriveMaterializeLock(payloadFixture(), "/srv/other/.agents");
    expect(a.cards[0]?.path).not.toEqual(b.cards[0]?.path);
    expect(b.cards[0]?.path).toBe(`/srv/other/.agents/drwn/extracted/${TREE_ROOT}`);
  });
});
