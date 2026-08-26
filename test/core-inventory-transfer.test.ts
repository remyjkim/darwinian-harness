// ABOUTME: Verifies deterministic standalone inventory snapshots, manifest export, and comparison.
// ABOUTME: Proves operational Store state stays outside portable transfer and conflicts fail closed.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildPortableInventoryManifest,
  canonicalJsonBytes,
  type PortableInventoryEntryInput,
} from "../cli/core/inventory-portable";
import {
  comparePortableInventory,
  exportPortableInventoryManifest,
  snapshotPortableInventory,
  syncPortableInventory,
} from "../cli/core/inventory-transfer";
import { createPortableInventoryBundle } from "../cli/core/inventory-bundle";
import { cleanupTempRoots, createInstalledSkillBundle, createTempRoot, scaffoldCliFixture } from "./helpers";
import { seedMcpInventory } from "./mcp-inventory-fixture";

const roots: string[] = [];

afterEach(async () => {
  delete process.env.DRWN_STORE_READONLY;
  delete process.env.DRWN_STORE_SEED_PATH;
  await cleanupTempRoots(roots);
});

function packageEntry(
  packageName: string,
  skillId: string,
  overrides: Partial<Extract<PortableInventoryEntryInput, { kind: "skill-package" }>> = {},
): Extract<PortableInventoryEntryInput, { kind: "skill-package" }> {
  return {
    kind: "skill-package",
    packageName,
    activeVersion: "1.0.0",
    exportedSkillIds: [skillId],
    fileCount: 2,
    directoryCount: 2,
    sizeBytes: 100,
    integrity: `sha256-${"a".repeat(64)}`,
    ...overrides,
  };
}

function mcpEntry(id: string, url = `https://${id}.example.test/mcp`): PortableInventoryEntryInput {
  return {
    kind: "mcp",
    id,
    definition: { description: id, transport: "http", url, optional: false },
  };
}

describe("portable inventory snapshots", () => {
  test("treats an absent Store as empty without creating managed state", async () => {
    const root = await createTempRoot("portable-empty-");
    roots.push(root);
    const agentsDir = join(root, ".agents");

    const snapshot = await snapshotPortableInventory({ agentsDir });

    expect(snapshot.manifest).toEqual({ schema: "drwn.portable-inventory", schemaVersion: 1, entries: [] });
    expect(snapshot.payloads).toEqual([]);
    expect(existsSync(agentsDir)).toBe(false);
  });

  test("reads only active typed package and MCP records with canonical metrics", async () => {
    const fixture = await scaffoldCliFixture();
    roots.push(fixture.root);
    const installed = await createInstalledSkillBundle(fixture.agentsDir, {
      packageName: "@acme/toolkit",
      version: "2.3.4",
      skillName: "toolkit-skill",
    });
    await mkdir(join(installed.packageRoot, "empty"), { recursive: true });
    await seedMcpInventory(fixture.agentsDir, {
      version: 1,
      servers: {
        portable: {
          optional: false,
          transport: "http",
          description: "Portable",
          headers: { Authorization: "${PORTABLE_TOKEN}" },
          url: "https://portable.example.test/mcp",
        },
      },
    });

    const excluded = {
      credentials: join(fixture.agentsDir, "drwn", "credentials.json"),
      machine: join(fixture.agentsDir, "drwn", "machine.json"),
      projects: join(fixture.agentsDir, "drwn", "projects.json"),
      card: join(fixture.agentsDir, "drwn", "cards", "private", "secret.txt"),
      generated: join(fixture.agentsDir, "drwn", "generated", "secret.txt"),
      inactive: join(dirname(installed.packageRoot), "9.9.9", "secret.txt"),
    };
    for (const [name, path] of Object.entries(excluded)) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `excluded-${name}-sentinel\n`);
    }

    const snapshot = await snapshotPortableInventory({ agentsDir: fixture.agentsDir });
    const skill = snapshot.manifest.entries.find((entry) => entry.kind === "skill-package")!;
    const mcp = snapshot.manifest.entries.find((entry) => entry.kind === "mcp")!;
    const serialized = new TextDecoder().decode(canonicalJsonBytes(snapshot.manifest));

    expect(skill).toMatchObject({
      packageName: "@acme/toolkit",
      activeVersion: "2.3.4",
      exportedSkillIds: ["toolkit-skill"],
      fileCount: 2,
      directoryCount: 4,
    });
    expect(skill.sizeBytes).toBeGreaterThan(0);
    expect(skill.integrity).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(mcp).toMatchObject({ id: "portable", definition: { description: "Portable" } });
    expect(snapshot.payloads.map((payload) => payload.sourcePath)).toEqual([installed.packageRoot, join(fixture.agentsDir, "drwn", "mcp-servers", "portable.json")]);
    for (const sentinel of Object.keys(excluded)) expect(serialized).not.toContain(`excluded-${sentinel}-sentinel`);
  });

  test("normalizes MCP source whitespace and key order into identical manifest bytes", async () => {
    const left = await createTempRoot("portable-mcp-left-");
    const right = await createTempRoot("portable-mcp-right-");
    roots.push(left, right);
    const definition = {
      description: "Ordered",
      transport: "stdio" as const,
      command: "ordered-server",
      env: { TOKEN: "${ORDERED_TOKEN}" },
      optional: true,
    };
    const leftPath = join(left, ".agents", "drwn", "mcp-servers", "ordered.json");
    const rightPath = join(right, ".agents", "drwn", "mcp-servers", "ordered.json");
    await mkdir(dirname(leftPath), { recursive: true });
    await mkdir(dirname(rightPath), { recursive: true });
    await writeFile(leftPath, `${JSON.stringify(definition)}\n`);
    await writeFile(rightPath, `{
      "optional": true,
      "env": { "TOKEN": "\${ORDERED_TOKEN}" },
      "command": "ordered-server",
      "transport": "stdio",
      "description": "Ordered"
    }\n`);

    const leftSnapshot = await snapshotPortableInventory({ agentsDir: join(left, ".agents") });
    const rightSnapshot = await snapshotPortableInventory({ agentsDir: join(right, ".agents") });

    expect(canonicalJsonBytes(leftSnapshot.manifest)).toEqual(canonicalJsonBytes(rightSnapshot.manifest));
  });

  test("publishes atomically, no-ops for identical bytes, and refuses overwrite or Store-contained output", async () => {
    const fixture = await scaffoldCliFixture();
    roots.push(fixture.root);
    await createInstalledSkillBundle(fixture.agentsDir);
    const outputPath = join(fixture.root, "transfer", "requirements.json");

    const first = await exportPortableInventoryManifest({ agentsDir: fixture.agentsDir, outputPath });
    const firstBytes = await readFile(outputPath);
    const second = await exportPortableInventoryManifest({ agentsDir: fixture.agentsDir, outputPath });

    expect(first.action).toBe("written");
    expect(second.action).toBe("unchanged");
    expect(await readFile(outputPath)).toEqual(firstBytes);

    await writeFile(outputPath, "different\n");
    await expect(exportPortableInventoryManifest({ agentsDir: fixture.agentsDir, outputPath })).rejects.toMatchObject({
      code: "INVENTORY_TRANSFER_OUTPUT_EXISTS",
    });
    await expect(exportPortableInventoryManifest({
      agentsDir: fixture.agentsDir,
      outputPath: join(fixture.agentsDir, "drwn", "portable.json"),
    })).rejects.toMatchObject({ code: "INVENTORY_TRANSFER_ARTIFACT_INVALID" });
  });
});

describe("portable inventory comparison", () => {
  test("reports missing, identical, conflicting, extras, and immutable ownership collisions deterministically", async () => {
    const fixture = await scaffoldCliFixture();
    roots.push(fixture.root);
    const target = buildPortableInventoryManifest([
      packageEntry("identical", "same-skill"),
      packageEntry("conflict", "conflict-skill", { activeVersion: "1.0.0" }),
      packageEntry("target-owner", "claimed-skill"),
      packageEntry("extra-package", "extra-skill"),
      mcpEntry("same-mcp"),
      mcpEntry("conflict-mcp", "https://target.example.test/mcp"),
      mcpEntry("extra-mcp"),
    ]);
    const source = buildPortableInventoryManifest([
      packageEntry("identical", "same-skill"),
      packageEntry("conflict", "conflict-skill", { activeVersion: "2.0.0" }),
      packageEntry("missing", "missing-skill"),
      packageEntry("claimed", "claimed-skill"),
      packageEntry("repo-collision", "alpha"),
      mcpEntry("same-mcp"),
      mcpEntry("conflict-mcp", "https://source.example.test/mcp"),
      mcpEntry("missing-mcp"),
      mcpEntry("context7"),
    ]);

    const report = await comparePortableInventory({
      source,
      sourceKind: "manifest",
      target,
      repoRoot: fixture.repoRoot,
    });

    expect(report.entries.map(({ id, disposition, reasonCode }) => [id, disposition, reasonCode])).toEqual([
      ["claimed", "conflicting", "SKILL_ID_OWNERSHIP_CONFLICT"],
      ["conflict", "conflicting", "PACKAGE_METADATA_CONFLICT"],
      ["identical", "identical", "IDENTICAL"],
      ["missing", "missing", "MISSING"],
      ["repo-collision", "conflicting", "REPOSITORY_SKILL_CONFLICT"],
      ["conflict-mcp", "conflicting", "MCP_DEFINITION_CONFLICT"],
      ["context7", "conflicting", "BUNDLED_MCP_CONFLICT"],
      ["missing-mcp", "missing", "MISSING"],
      ["same-mcp", "identical", "IDENTICAL"],
    ]);
    expect(report.extras.map((entry) => [entry.kind, entry.id])).toEqual([
      ["skill-package", "extra-package"],
      ["skill-package", "target-owner"],
      ["mcp", "extra-mcp"],
    ]);
    expect(report.summary).toEqual({ missing: 2, identical: 2, conflicting: 5, extra: 3 });
    expect(report.exact).toBe(false);
    expect(report.source).toMatchObject({
      kind: "manifest",
      schema: "drwn.portable-inventory",
      schemaVersion: 1,
      manifestSha256: expect.stringMatching(/^sha256-[a-f0-9]{64}$/),
    });
  });

  test("is exact only when every source entry is identical and the target has no extras", async () => {
    const fixture = await scaffoldCliFixture();
    roots.push(fixture.root);
    const manifest = buildPortableInventoryManifest([
      packageEntry("only-package", "only-skill"),
      mcpEntry("only-mcp"),
    ]);

    const report = await comparePortableInventory({
      source: manifest,
      sourceKind: "bundle",
      target: structuredClone(manifest),
      repoRoot: fixture.repoRoot,
    });

    expect(report.summary).toEqual({ missing: 0, identical: 2, conflicting: 0, extra: 0 });
    expect(report.exact).toBe(true);
    expect(report.source.kind).toBe("bundle");
  });
});

async function createTransferSource() {
  const source = await scaffoldCliFixture();
  roots.push(source.root);
  await createInstalledSkillBundle(source.agentsDir, {
    packageName: "@portable/toolkit",
    version: "1.4.2",
    skillName: "portable-toolkit",
  });
  await seedMcpInventory(source.agentsDir, {
    version: 1,
    servers: {
      "portable-custom": {
        description: "Portable custom",
        transport: "stdio",
        command: "portable-custom",
        env: { API_TOKEN: "${PORTABLE_CUSTOM_TOKEN}" },
        optional: false,
      },
    },
  });
  const bundlePath = join(source.root, "portable.tar.gz");
  await createPortableInventoryBundle({ agentsDir: source.agentsDir, outputPath: bundlePath });
  return { source, bundlePath };
}

describe("additive portable inventory sync", () => {
  test("dry-run reports would-install without creating Store state or a managed lock", async () => {
    const { bundlePath } = await createTransferSource();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    const storeRoot = join(target.agentsDir, "drwn");

    const result = await syncPortableInventory({
      agentsDir: target.agentsDir,
      repoRoot: target.repoRoot,
      sourcePath: bundlePath,
      dryRun: true,
    });

    expect(result.actions.map((entry) => entry.action)).toEqual(["would-install", "would-install"]);
    expect(result.summary).toEqual({ installed: 0, wouldInstall: 2, identical: 0, extra: 0 });
    expect(existsSync(storeRoot)).toBe(false);
  });

  test("sync initializes inventory only, ignores broad Store seed input, and leaves entries inactive", async () => {
    const { bundlePath } = await createTransferSource();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    const broadSeed = await createTempRoot("portable-broad-seed-");
    roots.push(broadSeed);
    await mkdir(join(broadSeed, "drwn"), { recursive: true });
    await writeFile(join(broadSeed, "drwn", "machine.json"), "seeded-machine-sentinel\n");
    process.env.DRWN_STORE_SEED_PATH = broadSeed;

    const result = await syncPortableInventory({
      agentsDir: target.agentsDir,
      repoRoot: target.repoRoot,
      sourcePath: bundlePath,
    });
    const storeRoot = join(target.agentsDir, "drwn");

    expect(result.actions.map((entry) => entry.action)).toEqual(["installed", "installed"]);
    expect(existsSync(join(storeRoot, "store.json"))).toBe(true);
    expect(existsSync(join(storeRoot, "skills", "@portable", "toolkit", "current"))).toBe(true);
    expect(existsSync(join(storeRoot, "mcp-servers", "portable-custom.json"))).toBe(true);
    expect(existsSync(join(storeRoot, "machine.json"))).toBe(false);
    expect(existsSync(join(storeRoot, "projects.json"))).toBe(false);
    expect(await readFile(join(storeRoot, "store.json"), "utf8")).not.toContain("seeded-machine-sentinel");
  });

  test("treats identical entries as no-ops and preserves target extras", async () => {
    const { bundlePath } = await createTransferSource();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    await createInstalledSkillBundle(target.agentsDir, {
      packageName: "extra-package",
      skillName: "extra-skill",
    });

    const first = await syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: bundlePath });
    const packageBytes = await readFile(join(target.agentsDir, "drwn", "skills", "@portable", "toolkit", "1.4.2", "bundle.json"));
    const second = await syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: bundlePath });

    expect(first.summary).toEqual({ installed: 2, wouldInstall: 0, identical: 0, extra: 1 });
    expect(second.actions.map((entry) => entry.action)).toEqual(["no-op", "no-op"]);
    expect(second.summary).toEqual({ installed: 0, wouldInstall: 0, identical: 2, extra: 1 });
    expect(await readFile(join(target.agentsDir, "drwn", "skills", "@portable", "toolkit", "1.4.2", "bundle.json"))).toEqual(packageBytes);
    expect(existsSync(join(target.agentsDir, "drwn", "skills", "extra-package", "current"))).toBe(true);
  });

  test("rejects manifest-only sync and read-only Store mutation before target state changes", async () => {
    const { source, bundlePath } = await createTransferSource();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    const manifestPath = join(source.root, "manifest.json");
    await exportPortableInventoryManifest({ agentsDir: source.agentsDir, outputPath: manifestPath });

    await expect(syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: manifestPath })).rejects.toMatchObject({
      code: "INVENTORY_TRANSFER_BUNDLE_REQUIRED",
    });
    process.env.DRWN_STORE_READONLY = "1";
    await expect(syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: bundlePath })).rejects.toMatchObject({
      code: "STORE_READONLY",
    });
    expect(existsSync(join(target.agentsDir, "drwn"))).toBe(false);
  });

  test("blocks package, MCP, repository-skill, and bundled-registry conflicts before any inventory write", async () => {
    const scenarios: Array<(sourceAgents: string, target: Awaited<ReturnType<typeof scaffoldCliFixture>>) => Promise<void>> = [
      async (sourceAgents, target) => {
        await createInstalledSkillBundle(sourceAgents, {
          packageName: "@portable/toolkit",
          version: "1.0.0",
          skillName: "portable-toolkit",
        });
        await createInstalledSkillBundle(target.agentsDir, {
          packageName: "@portable/toolkit",
          version: "9.0.0",
          skillName: "portable-toolkit",
        });
      },
      async (sourceAgents, target) => {
        await seedMcpInventory(sourceAgents, {
          version: 1,
          servers: {
            "portable-custom": {
              description: "Source",
              transport: "http",
              url: "https://source.example.test/mcp",
              optional: false,
            },
          },
        });
        await seedMcpInventory(target.agentsDir, {
          version: 1,
          servers: {
            "portable-custom": {
              description: "Different",
              transport: "http",
              url: "https://different.example.test/mcp",
              optional: false,
            },
          },
        });
      },
      async (sourceAgents) => {
        await createInstalledSkillBundle(sourceAgents, {
          packageName: "repo-collision-package",
          skillName: "alpha",
        });
      },
      async (sourceAgents) => {
        await seedMcpInventory(sourceAgents, {
          version: 1,
          servers: {
            context7: {
              description: "Portable context",
              transport: "stdio",
              command: "context7-portable",
              optional: false,
            },
          },
        });
      },
    ];

    for (const [index, arrange] of scenarios.entries()) {
      const source = await scaffoldCliFixture();
      const target = await scaffoldCliFixture();
      roots.push(source.root, target.root);
      await createInstalledSkillBundle(source.agentsDir, {
        packageName: `base-package-${index}`,
        skillName: `base-skill-${index}`,
      });
      await arrange(source.agentsDir, target);
      const bundlePath = join(source.root, `conflict-${index}.tar.gz`);
      await createPortableInventoryBundle({ agentsDir: source.agentsDir, outputPath: bundlePath });
      const before = existsSync(join(target.agentsDir, "drwn"))
        ? canonicalJsonBytes((await snapshotPortableInventory({ agentsDir: target.agentsDir })).manifest)
        : null;

      await expect(syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: bundlePath })).rejects.toMatchObject({
        code: "INVENTORY_TRANSFER_CONFLICT",
      });

      if (before) {
        expect(canonicalJsonBytes((await snapshotPortableInventory({ agentsDir: target.agentsDir })).manifest)).toEqual(before);
      } else {
        expect(existsSync(join(target.agentsDir, "drwn"))).toBe(false);
      }
    }
  });

  test("detects source and target changes before locked commit", async () => {
    const sourceChanged = await createTransferSource();
    const sourceTarget = await scaffoldCliFixture();
    roots.push(sourceTarget.root);
    await expect(syncPortableInventory({
      agentsDir: sourceTarget.agentsDir,
      repoRoot: sourceTarget.repoRoot,
      sourcePath: sourceChanged.bundlePath,
      checkpoint: async ({ phase }) => {
        if (phase === "before-lock") await writeFile(sourceChanged.bundlePath, "changed\n");
      },
    })).rejects.toMatchObject({ code: "INVENTORY_TRANSFER_SOURCE_CHANGED" });
    expect(existsSync(join(sourceTarget.agentsDir, "drwn"))).toBe(false);

    const targetChanged = await createTransferSource();
    const concurrentTarget = await scaffoldCliFixture();
    roots.push(concurrentTarget.root);
    await expect(syncPortableInventory({
      agentsDir: concurrentTarget.agentsDir,
      repoRoot: concurrentTarget.repoRoot,
      sourcePath: targetChanged.bundlePath,
      checkpoint: async ({ phase }) => {
        if (phase === "before-lock") {
          await createInstalledSkillBundle(concurrentTarget.agentsDir, {
            packageName: "concurrent-extra",
            skillName: "concurrent-extra-skill",
          });
        }
      },
    })).rejects.toMatchObject({ code: "INVENTORY_TRANSFER_SOURCE_CHANGED" });
    expect(existsSync(join(concurrentTarget.agentsDir, "drwn", "skills", "@portable", "toolkit", "current"))).toBe(false);
  });

  test("preserves every non-inventory byte on an existing target", async () => {
    const { bundlePath } = await createTransferSource();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    const state = {
      machine: join(target.agentsDir, "drwn", "machine.json"),
      credentials: join(target.agentsDir, "drwn", "credentials.json"),
      projects: join(target.agentsDir, "drwn", "projects.json"),
      card: join(target.agentsDir, "drwn", "cards", "sentinel.txt"),
      generated: join(target.agentsDir, "drwn", "generated", "sentinel.txt"),
    };
    for (const [name, path] of Object.entries(state)) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${name}-preserved\n`);
    }
    const before = new Map(await Promise.all(Object.entries(state).map(async ([name, path]) => [name, await readFile(path)] as const)));

    await syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: bundlePath });

    for (const [name, path] of Object.entries(state)) expect(await readFile(path)).toEqual(before.get(name)!);
  });
});
