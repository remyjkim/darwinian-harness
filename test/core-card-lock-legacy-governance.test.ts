// ABOUTME: Locks I220's consume tolerance: locks whose published card manifests still carry the
// ABOUTME: retired fields validate and resolve untouched — history stays installable.

import { describe, expect, test } from "bun:test";
import { validateCardLockfile } from "../cli/core/card-lock";

const legacyLock = {
  schema: "drwn.project-lock",
  schemaVersion: 1,
  store: { minDrwnVersion: "0.8.0" },
  workerRoots: [
    { name: "@test/legacy-blueprint", requested: "@test/legacy-blueprint@1.0.0", kind: "blueprint", members: ["@test/member"] },
  ],
  cards: [
    {
      name: "@test/legacy-blueprint",
      requested: "@test/legacy-blueprint@1.0.0",
      version: "1.0.0",
      path: "/tmp/store/drwn/extracted/abc",
      integrity: "sha256-x",
      treeSha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      manifest: {
        name: "@test/legacy-blueprint",
        version: "1.0.0",
        kind: "blueprint",
        composedFrom: ["@test/member@^1.0.0"],
        // Pre-I220 published bytes: immutable history may carry the retired fields forever.
        permissions: { anything: true },
        escalation: { humanOwner: "someone", escalateWhen: ["always"] },
      },
      skills: [],
      hooks: [],
      registry: null,
      origin: "store",
      git: { commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
    },
    {
      name: "@test/member",
      requested: "@test/member@^1.0.0",
      version: "1.0.0",
      path: "/tmp/store/drwn/extracted/b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      integrity: "sha256-y",
      treeSha: "b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      manifest: { name: "@test/member", version: "1.0.0" },
      skills: [],
      hooks: [],
      registry: null,
      origin: "store",
      git: { commit: "beefdeadbeefdeadbeefdeadbeefdeadbeefdead" },
    },
  ],
};

describe("consume tolerance for retired fields (I220)", () => {
  test("a lock carrying legacy-manifest governance fields validates untouched", () => {
    const validated = validateCardLockfile(structuredClone(legacyLock), "<test>");
    expect(validated.cards[0]?.name).toBe("@test/legacy-blueprint");
    expect((validated.cards[0]?.manifest as unknown as Record<string, unknown>).permissions).toEqual({ anything: true });
  });
});
