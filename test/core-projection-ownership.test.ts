// ABOUTME: Verifies partial writes select ownership by declared surface and target.
// ABOUTME: Prevents path naming from controlling retention or cleanup decisions.

import { describe, expect, test } from "bun:test";
import { retainUnselectedProjectionOwnership } from "../cli/core/projection-ownership";
import type { ManagedPath } from "../cli/core/write-record";

function entry(
  path: string,
  surface: ManagedPath["surface"],
  target?: ManagedPath["target"],
): Extract<ManagedPath, { kind: "managed-content" }> {
  return {
    path,
    kind: "managed-content",
    surface,
    ...(target ? { target } : {}),
    contentHash: `sha256-${"a".repeat(64)}`,
  };
}

const prior = [
  entry("generated/workers.json", "worker"),
  entry("arbitrary/one", "mcp", "claude"),
  entry("arbitrary/two", "mcp", "cursor"),
  entry("arbitrary/three", "skill", "codex"),
  entry("arbitrary/four", "hook", "claude"),
  entry("arbitrary/five", "hook", "mastra"),
];

describe("retainUnselectedProjectionOwnership", () => {
  test.each([
    [{}, []],
    [{ mcpOnly: true }, ["arbitrary/three", "arbitrary/four", "arbitrary/five"]],
    [{ skillsOnly: true }, ["arbitrary/one", "arbitrary/two", "arbitrary/four", "arbitrary/five"]],
    [{ target: "claude" as const }, ["arbitrary/two", "arbitrary/three", "arbitrary/five"]],
    [{ target: "cursor" as const }, ["arbitrary/one", "arbitrary/three", "arbitrary/four", "arbitrary/five"]],
    [{ mcpOnly: true, target: "claude" as const }, ["arbitrary/two", "arbitrary/three", "arbitrary/four", "arbitrary/five"]],
    [{ skillsOnly: true, target: "codex" as const }, ["arbitrary/one", "arbitrary/two", "arbitrary/four", "arbitrary/five"]],
  ])("retains only ownership outside selection %j", (selection, expectedPaths) => {
    expect(retainUnselectedProjectionOwnership(prior, [], selection).map((item) => item.path))
      .toEqual([...expectedPaths].sort((left, right) => left.localeCompare(right)));
  });

  test("desired ownership wins over retained ownership for the same path", () => {
    const desired = entry("arbitrary/two", "mcp", "cursor");
    desired.contentHash = `sha256-${"b".repeat(64)}`;

    expect(retainUnselectedProjectionOwnership(prior, [desired], { target: "claude" }))
      .toContainEqual(desired);
    expect(retainUnselectedProjectionOwnership(prior, [desired], { target: "claude" })
      .filter((item) => item.path === desired.path)).toHaveLength(1);
  });

  test("splits the shared opencode.json entry by field ownership on partial writes", () => {
    const hash = `sha256-${"c".repeat(64)}`;
    const shared: ManagedPath = {
      path: "opencode.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "opencode",
      fields: ["mcpServer:context7", "skillsPaths"],
      fieldHashes: { "mcpServer:context7": hash, skillsPaths: hash },
    };

    const skillsOnly = retainUnselectedProjectionOwnership([shared], [], { skillsOnly: true });
    expect(skillsOnly).toEqual([{
      path: "opencode.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "opencode",
      fields: ["mcpServer:context7"],
      fieldHashes: { "mcpServer:context7": hash },
    }]);

    const mcpOnly = retainUnselectedProjectionOwnership([shared], [], { mcpOnly: true });
    expect(mcpOnly).toEqual([{
      path: "opencode.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "opencode",
      fields: ["skillsPaths"],
      fieldHashes: { skillsPaths: hash },
    }]);

    expect(retainUnselectedProjectionOwnership([shared], [], { target: "claude" })).toEqual([shared]);
    expect(retainUnselectedProjectionOwnership([shared], [], {})).toEqual([]);
  });

  test("merges retained fields into a desired entry for the same path", () => {
    const hash = `sha256-${"d".repeat(64)}`;
    const previous: ManagedPath = {
      path: "opencode.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "opencode",
      fields: ["mcpServer:context7", "skillsPaths"],
      fieldHashes: { "mcpServer:context7": hash, skillsPaths: hash },
    };
    const desired: ManagedPath = {
      path: "opencode.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "opencode",
      fields: ["skillsPaths"],
      fieldHashes: { skillsPaths: `sha256-${"e".repeat(64)}` },
    };

    const merged = retainUnselectedProjectionOwnership([previous], [desired], { skillsOnly: true });
    expect(merged).toEqual([{
      path: "opencode.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "opencode",
      fields: ["mcpServer:context7", "skillsPaths"],
      fieldHashes: { "mcpServer:context7": hash, skillsPaths: `sha256-${"e".repeat(64)}` },
    }]);
  });
});
