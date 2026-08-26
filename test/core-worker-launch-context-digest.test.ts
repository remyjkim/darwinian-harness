// ABOUTME: Verifies domain-separated deterministic Worker launch context identity.
// ABOUTME: Protects semantic array order while ignoring object insertion order and volatile metadata.

import { expect, test } from "bun:test";

const loadDigest = async () => await import("../cli/core/worker-launch-context/digest").catch(() => ({} as any));

test("context digest is stable across object key order and excludes caller metadata outside its preimage", async () => {
  const digest = await loadDigest();
  expect(typeof digest.computeWorkerLaunchContextId).toBe("function");
  const left = { target: "codex", cards: [{ name: "a" }, { name: "b" }], overlay: { z: 1, a: 2 } };
  const right = { overlay: { a: 2, z: 1 }, cards: [{ name: "a" }, { name: "b" }], target: "codex" };

  expect(digest.computeWorkerLaunchContextId(left)).toBe(digest.computeWorkerLaunchContextId(right));
  expect(digest.computeWorkerLaunchContextId({ ...left, createdAt: undefined })).toBe(digest.computeWorkerLaunchContextId(left));
});

test("context digest preserves semantically ordered arrays and uses a path-safe identity", async () => {
  const digest = await loadDigest();
  const forward = digest.computeWorkerLaunchContextId({ cards: ["root", "member"] });
  const reverse = digest.computeWorkerLaunchContextId({ cards: ["member", "root"] });

  expect(forward).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(reverse).not.toBe(forward);
  expect(digest.computeProjectRootHash("/project")).toMatch(/^sha256-[a-f0-9]{64}$/);
});
