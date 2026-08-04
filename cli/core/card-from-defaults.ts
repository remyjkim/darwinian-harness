// ABOUTME: Captures the active machine Worker closure into a normal Card source.
// ABOUTME: Flattens only effective skills and MCP definitions without copying Blueprint identity.

import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeServerForCapture } from "./card-capture";
import type { CardManifest } from "./card-manifest";
import { createCardSource } from "./card-store";
import { resolveMachineCapabilities } from "./defaults";
import { writeAtomically } from "./fs";

export async function createCapabilityCardFromDefaults(options: {
  agentsDir: string;
  repoRoot: string;
  homeDir: string;
  name: string;
  sourceDir: string;
  scope?: string;
  noGit?: boolean;
}) {
  const capabilities = await resolveMachineCapabilities({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
  });
  if (capabilities.skills.length === 0 && capabilities.mcpServers.length === 0) {
    throw new Error(
      "No effective machine capabilities are configured. Select a machine Worker Blueprint with drwn apply --root <blueprint-ref>.",
    );
  }
  const source = await createCardSource({
    sourceDir: options.sourceDir,
    name: options.name,
    scope: options.scope,
    noGit: options.noGit,
  });

  try {
    for (const skill of capabilities.skills) {
      await cp(skill.path, join(source.sourceDir, "skills", skill.id), {
        recursive: true,
        verbatimSymlinks: false,
      });
    }
    const servers = Object.fromEntries(
      capabilities.mcpServers.map((entry) => [entry.id, sanitizeServerForCapture(entry.id, entry.server)]),
    );
    for (const [id, server] of Object.entries(servers)) {
      await writeAtomically(join(source.sourceDir, "mcp-servers", `${id}.json`), `${JSON.stringify(server, null, 2)}\n`);
    }
    const manifest: CardManifest = {
      name: source.name,
      version: "0.1.0",
      description: "Captured from effective machine capabilities.",
      ...(capabilities.skills.length > 0 ? { skills: { include: capabilities.skills.map((skill) => skill.id) } } : {}),
      ...(Object.keys(servers).length > 0 ? { servers } : {}),
    };
    await writeAtomically(source.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return {
      ...source,
      skillCount: capabilities.skills.length,
      serverCount: capabilities.mcpServers.length,
    };
  } catch (error) {
    await rm(source.sourceDir, { recursive: true, force: true });
    throw error;
  }
}
