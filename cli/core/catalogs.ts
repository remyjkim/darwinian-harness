// ABOUTME: Implements configured online/external catalog adapters for discovery.
// ABOUTME: Keeps catalog policy separate from standalone machine inventory.

import { existsSync, readFileSync } from "node:fs";
import { npmCommand } from "./process";
import type { CanonicalConfig, RegistryServer } from "./types";

const NPM_SEARCH_TIMEOUT_MS = Number(process.env.DRWN_NPM_TIMEOUT_MS ?? 30_000);

export interface CatalogSearchResult {
  id: string;
  kind: "skill-package" | "mcp";
  title: string;
  description?: string;
  source: "npm" | "mcp-catalog";
  packageName?: string;
  version?: string;
  verified: boolean;
  server?: RegistryServer;
}

export interface CatalogSearchResponse {
  results: CatalogSearchResult[];
  warnings: string[];
}

export function isNpmSkillCatalogEnabled(config: CanonicalConfig) {
  return config.catalogs?.npmSkills?.enabled !== false;
}

export function isMcpCatalogEnabled(config: CanonicalConfig) {
  return config.catalogs?.mcp?.enabled === true;
}

export async function searchNpmSkillCatalog(
  query: string,
  config: CanonicalConfig,
  env: Record<string, string | undefined> = process.env,
): Promise<CatalogSearchResponse> {
  if (!isNpmSkillCatalogEnabled(config)) {
    return { results: [], warnings: [] };
  }

  const searchLimit = config.catalogs?.npmSkills?.searchLimit ?? 20;
  const proc = Bun.spawn([npmCommand(), "search", query, "--json", `--searchlimit=${searchLimit}`], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  // A hung registry request must degrade to a warning, never block the CLI forever.
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      // The process may have already exited.
    }
  }, NPM_SEARCH_TIMEOUT_MS);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  clearTimeout(timer);
  if (exitCode !== 0) {
    return { results: [], warnings: [`npm skill catalog search failed: ${`${stdout}${stderr}`.trim()}`] };
  }

  try {
    const parsed = JSON.parse(stdout) as Array<{ name: string; version?: string; description?: string }>;
    return {
      results: parsed.map((item) => ({
        id: item.name,
        kind: "skill-package",
        title: item.name,
        description: item.description,
        source: "npm",
        packageName: item.name,
        version: item.version,
        verified: false,
      })),
      warnings: [],
    };
  } catch (error) {
    return { results: [], warnings: [`npm skill catalog returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

function catalogEntryMatches(query: string, id: string, server: RegistryServer) {
  const normalized = query.toLowerCase();
  return id.toLowerCase().includes(normalized) || server.description.toLowerCase().includes(normalized);
}

export async function searchMcpCatalog(query: string, config: CanonicalConfig): Promise<CatalogSearchResponse> {
  if (!isMcpCatalogEnabled(config)) {
    return { results: [], warnings: [] };
  }

  const results: CatalogSearchResult[] = [];
  const warnings: string[] = [];

  for (const source of config.catalogs?.mcp?.sources ?? []) {
    if (source.type !== "file") {
      warnings.push(`unsupported MCP catalog source: ${source.type}`);
      continue;
    }
    if (!existsSync(source.path)) {
      warnings.push(`missing MCP catalog file: ${source.path}`);
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(source.path, "utf8")) as { servers?: Record<string, RegistryServer> };
      for (const [id, server] of Object.entries(parsed.servers ?? {})) {
        if (!catalogEntryMatches(query, id, server)) {
          continue;
        }
        results.push({
          id,
          kind: "mcp",
          title: id,
          description: server.description,
          source: "mcp-catalog",
          verified: true,
          server,
        });
      }
    } catch (error) {
      warnings.push(`invalid MCP catalog file ${source.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { results, warnings };
}
