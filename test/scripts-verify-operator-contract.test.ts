// ABOUTME: Verifies the exact Operator Card payload and its canonical source remain release-safe.
// ABOUTME: Rejects retired commands, generated drift, unapproved MCPs, and portable-inventory mischaracterization.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyOperatorContract } from "../scripts/verify-operator-contract";

const repoRoot = join(import.meta.dir, "..");

describe("Operator release contract", () => {
  test("accepts the exact canonical Operator payload", async () => {
    expect(await verifyOperatorContract(repoRoot)).toEqual({
      name: "operator runtime contract",
      ok: true,
      details: undefined,
    });
  });

  test("rejects retired commands in canonical Operator skills", async () => {
    const path = "darwinian-worker-skills/skills/inspect-worker/SKILL.md";
    const source = readFileSync(join(repoRoot, path), "utf8");
    const result = await verifyOperatorContract(repoRoot, {
      [path]: `${source}\nRun \`drwn worker stack\`.\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("retired Operator command");
  });

  test("rejects retired direct machine activation commands in Operator guidance", async () => {
    const path = "darwinian-worker-skills/skills/manage-machine-capabilities/SKILL.md";
    const source = readFileSync(join(repoRoot, path), "utf8");
    const result = await verifyOperatorContract(repoRoot, {
      [path]: `${source}\nRun \`drwn machine skill enable alpha\`.\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("retired Operator command");
  });

  test("rejects a retired Operator skill ID restored to bundle metadata", async () => {
    const path = "darwinian-worker-skills/bundle.json";
    const bundle = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
    bundle.skills.push({ name: "manage-library", scope: "shared", path: "skills/manage-library" });
    const result = await verifyOperatorContract(repoRoot, {
      [path]: `${JSON.stringify(bundle, null, 2)}\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("retired Operator skill ID remains: manage-library");
  });

  test("rejects canonical and bundled skill drift", async () => {
    const path = "darwinian-worker-skills/cards/operator/skills/inspect-worker/SKILL.md";
    const source = readFileSync(join(repoRoot, path), "utf8");
    const result = await verifyOperatorContract(repoRoot, {
      [path]: `${source}\ndrift\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("bundled Operator skill differs from canonical source");
  });

  test("rejects coordinated canonical and bundled drift against the pinned Card integrity", async () => {
    const canonicalPath = "darwinian-worker-skills/skills/inspect-worker/SKILL.md";
    const bundledPath = "darwinian-worker-skills/cards/operator/skills/inspect-worker/SKILL.md";
    const drift = `${readFileSync(join(repoRoot, canonicalPath), "utf8")}\ndrift\n`;
    const result = await verifyOperatorContract(repoRoot, {
      [canonicalPath]: drift,
      [bundledPath]: drift,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("content integrity differs from the Operator Card contract");
  });

  test.each([
    ["version", (manifest: Record<string, any>) => { manifest.version = "2.0.1"; }],
    ["harness floor", (manifest: Record<string, any>) => { manifest.harness.minVersion = "1.0.0"; }],
    ["skill list", (manifest: Record<string, any>) => { manifest.skills.include = ["author-card"]; }],
    ["MCP list", (manifest: Record<string, any>) => { manifest.servers = { notion: { transport: "http", url: "https://example.test" } }; }],
  ] as const)("rejects Operator Card %s mismatch", async (_label, mutate) => {
    const path = "darwinian-worker-skills/cards/operator/card.json";
    const manifest = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
    mutate(manifest);
    const result = await verifyOperatorContract(repoRoot, {
      [path]: `${JSON.stringify(manifest, null, 2)}\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toMatch(/Operator|unapproved/);
  });

  test("rejects restoration of the retired machine profile registry", async () => {
    const result = await verifyOperatorContract(repoRoot, {
      "registry/machine-profiles.json": '{"schema":"drwn.machine-profiles"}\n',
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("retired machine profile registry");
  });

  test("rejects MCP exposure and backup or restore claims", async () => {
    const manifestPath = "darwinian-worker-skills/cards/operator/card.json";
    const manifest = JSON.parse(readFileSync(join(repoRoot, manifestPath), "utf8"));
    manifest.servers = { notion: { transport: "http", url: "https://example.test/mcp" } };
    const skillPath = "darwinian-worker-skills/skills/manage-machine-inventory/SKILL.md";
    const skill = readFileSync(join(repoRoot, skillPath), "utf8");
    const result = await verifyOperatorContract(repoRoot, {
      [manifestPath]: `${JSON.stringify(manifest, null, 2)}\n`,
      [skillPath]: `${skill}\nPortable inventory is a full backup and restore format.\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("unapproved Operator MCP definition");
    expect(result.details).toContain("portable inventory is not backup or restore");
  });
});
