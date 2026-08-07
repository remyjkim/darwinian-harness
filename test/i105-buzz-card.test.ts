// ABOUTME: Validates the packaged Buzz delivery Blueprint and its exact I107 selectors.
// ABOUTME: Prevents broad MCP exposure, governance carve-outs, or command drift.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { validateCardManifest } from "../cli/core/card-manifest";

const cardPath = new URL("../registry/cards/buzz-delivery-worker/card.json", import.meta.url);

describe("I105 Buzz delivery Card", () => {
  test("declares the narrow stdio wrapper and exact governed tools", async () => {
    const card = JSON.parse(await readFile(cardPath, "utf8"));
    expect(validateCardManifest(card)).toEqual({ ok: true, errors: [] });
    expect(card.kind).toBe("blueprint");
    expect(Object.keys(card.servers)).toEqual(["buzz-tools"]);
    expect(card.servers["buzz-tools"]).toEqual(expect.objectContaining({
      transport: "stdio",
      command: "drwn",
      args: ["worker", "buzz-tools"],
      optional: false,
    }));
    expect(card.tools).toEqual({
      allow: [
        "mcp:buzz-tools/buzz_messages_send",
        "mcp:buzz-tools/buzz_messages_thread",
      ],
      deny: [],
    });
    expect(card.harness.minVersion).toBe("1.2.0");
    expect(card.lastValidatedWith).toBeUndefined();
  });

  test("does not declare a broad Buzz development server or wildcard", async () => {
    const raw = await readFile(cardPath, "utf8");
    expect(raw).not.toContain("buzz-dev-mcp");
    expect(raw).not.toContain("*");
  });
});
