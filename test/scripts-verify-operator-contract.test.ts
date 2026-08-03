// ABOUTME: Verifies the exact Operator profile payload and its canonical source remain release-safe.
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

  test.each([
    ["source tag", (profile: Record<string, unknown>) => { profile.source = "git+https://github.com/curation-labs/darwinian-operator.git#v2.0.0"; }],
    ["version", (profile: Record<string, unknown>) => { profile.version = "2.0.0"; }],
    ["commit", (profile: Record<string, unknown>) => { profile.commit = "f".repeat(40); }],
    ["tree", (profile: Record<string, unknown>) => { profile.treeSha = "e".repeat(40); }],
    ["integrity", (profile: Record<string, unknown>) => { profile.integrity = `sha256-${"d".repeat(64)}`; }],
    ["skill list", (profile: Record<string, unknown>) => { profile.skills = ["author-mind-content"]; }],
    ["MCP list", (profile: Record<string, unknown>) => { profile.mcpServers = ["notion"]; }],
  ] as const)("rejects profile %s mismatch", async (_label, mutate) => {
    const path = "registry/machine-profiles.json";
    const registry = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
    mutate(registry.profiles[0]);
    const result = await verifyOperatorContract(repoRoot, {
      [path]: `${JSON.stringify(registry, null, 2)}\n`,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("registry must deep-equal the centralized Operator contract");
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
