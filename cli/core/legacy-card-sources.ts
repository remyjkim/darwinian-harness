// ABOUTME: Inventories the retired machine-store Card source tree without modifying operator data.
// ABOUTME: Classifies legacy entries against canonical catalog repositories for deliberate migration.

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateCardManifest, type CardManifest } from "./card-manifest";
import { resolveCardSourceInput } from "./card-source-input";
import { DrwnError } from "./errors";

export interface LegacyCardSourceEntry {
  name: string | null;
  legacyPath: string;
  status: "canonical" | "unresolved" | "ambiguous" | "invalid";
  canonicalPath?: string;
  issue?: string;
}

export interface LegacyCardSourceInventory {
  root: string;
  exists: boolean;
  entries: LegacyCardSourceEntry[];
  guidance: string;
}

async function legacyDirectories(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
    const path = join(root, entry.name);
    if (entry.name.startsWith("@")) {
      for (const child of await readdir(path, { withFileTypes: true })) {
        if (!child.name.startsWith(".") && (child.isDirectory() || child.isSymbolicLink())) paths.push(join(path, child.name));
      }
    } else {
      paths.push(path);
    }
  }
  return paths.sort((a, b) => a.localeCompare(b));
}

export async function inventoryLegacyCardSources(options: {
  agentsDir: string;
  homeDir: string;
  catalogCheckouts: string[];
}): Promise<LegacyCardSourceInventory> {
  const root = join(options.agentsDir, "drwn", "sources");
  const entries: LegacyCardSourceEntry[] = [];
  for (const legacyPath of await legacyDirectories(root)) {
    let manifest: CardManifest;
    try {
      const raw: unknown = JSON.parse(await readFile(join(legacyPath, "card.json"), "utf8"));
      const validation = validateCardManifest(raw);
      if (!validation.ok) throw new Error(validation.errors.join("; "));
      manifest = raw as CardManifest;
    } catch (error) {
      entries.push({ name: null, legacyPath, status: "invalid", issue: error instanceof Error ? error.message : String(error) });
      continue;
    }
    try {
      const canonical = await resolveCardSourceInput({
        input: manifest.name,
        cwd: options.homeDir,
        homeDir: options.homeDir,
        catalogCheckouts: options.catalogCheckouts,
      });
      entries.push({ name: manifest.name, legacyPath, status: "canonical", canonicalPath: canonical.sourceDir });
    } catch (error) {
      const status = error instanceof DrwnError && error.code === "CARD_SOURCE_AMBIGUOUS" ? "ambiguous" : "unresolved";
      entries.push({ name: manifest.name, legacyPath, status, issue: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    root,
    exists: existsSync(root),
    entries,
    guidance: "This inventory is read-only and does not delete legacy sources. Confirm every entry is canonical, migrated, or intentionally retained before any separate cleanup.",
  };
}
