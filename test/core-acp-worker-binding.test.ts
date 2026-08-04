// ABOUTME: Tests the acp slug contract: positional wins, DRWN_ACP_SLUG env fallback, single
// ABOUTME: mind-binding auto-select, and a loud actionable error otherwise.

import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeMindBinding } from "../cli/core/mind-store/bindings";
import { resolveAcpSlug } from "../cli/core/acp/worker-binding";

async function tempAgentsDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "drwn-acp-binding-"));
}

describe("resolveAcpSlug", () => {
  test("an explicit positional slug wins over everything", async () => {
    const agentsDir = await tempAgentsDir();
    await writeMindBinding(agentsDir, "other", { mindId: "mind_1" });
    const slug = await resolveAcpSlug({ agentsDir }, "harari", { DRWN_ACP_SLUG: "ignored" });
    expect(slug).toBe("harari");
  });

  test("DRWN_ACP_SLUG is the fallback for editor launch configs", async () => {
    const agentsDir = await tempAgentsDir();
    const slug = await resolveAcpSlug({ agentsDir }, undefined, { DRWN_ACP_SLUG: "harari" });
    expect(slug).toBe("harari");
  });

  test("a single deployed binding is auto-selected", async () => {
    const agentsDir = await tempAgentsDir();
    await writeMindBinding(agentsDir, "solo", { mindId: "mind_1" });
    const slug = await resolveAcpSlug({ agentsDir }, undefined, {});
    expect(slug).toBe("solo");
  });

  test("no slug source at all fails with actionable guidance", async () => {
    const agentsDir = await tempAgentsDir();
    await expect(resolveAcpSlug({ agentsDir }, undefined, {})).rejects.toThrow(/drwn acp serve <slug>|DRWN_ACP_SLUG/);
  });

  test("multiple bindings without an explicit slug fail and name the candidates", async () => {
    const agentsDir = await tempAgentsDir();
    await writeMindBinding(agentsDir, "alpha", { mindId: "mind_1" });
    await writeMindBinding(agentsDir, "beta", { mindId: "mind_2" });
    await expect(resolveAcpSlug({ agentsDir }, undefined, {})).rejects.toThrow(/alpha.*beta|beta.*alpha/);
  });

  test("an empty DRWN_ACP_SLUG is treated as absent", async () => {
    const agentsDir = await tempAgentsDir();
    await writeMindBinding(agentsDir, "solo", { mindId: "mind_1" });
    const slug = await resolveAcpSlug({ agentsDir }, undefined, { DRWN_ACP_SLUG: "" });
    expect(slug).toBe("solo");
  });
});
