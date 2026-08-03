// ABOUTME: Defines and persists the strict machine V2 Worker-selection contract.
// ABOUTME: Rejects V1, prototypes, invalid embedded locks, and inconsistent selections without mutation.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { validateCardLockfile } from "./card-lock";
import { isCardScopeName, isCardUnscopedName } from "./card-manifest";
import { DrwnError } from "./errors";
import { writeAtomically } from "./fs";
import { withInventoryLock, withMachineLock } from "./inventory-lock";
import { resolveMachineConfigPath } from "./store-paths";
import type { MachineConfig } from "./types";

const targetOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  configPath: z.string().min(1).optional(),
  userMcpPath: z.string().min(1).optional(),
  format: z.enum(["json-merge", "toml-merge", "json-standalone"]).optional(),
  mcpKey: z.string().min(1).optional(),
}).strict();

const targetsSchema = z.object({
  claude: targetOverrideSchema.optional(),
  codex: targetOverrideSchema.optional(),
  cursor: targetOverrideSchema.optional(),
  opencode: targetOverrideSchema.optional(),
}).strict();

const catalogsSchema = z.object({
  npmSkills: z.object({
    enabled: z.boolean(),
    searchLimit: z.number().int().positive().optional(),
  }).strict().optional(),
  mcp: z.object({
    enabled: z.boolean(),
    sources: z.array(z.union([
      z.object({ type: z.literal("file"), path: z.string().min(1) }).strict(),
      z.object({ type: z.literal("url"), url: z.string().min(1) }).strict(),
    ])).optional(),
  }).strict().optional(),
}).strict();

const analyzerSchema = z.object({
  apiUrl: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  webBaseUrl: z.string().min(1).optional(),
  maxArchiveBytes: z.number().int().positive().optional(),
}).strict();

const trustedSourcesSchema = z.object({
  strict: z.boolean().optional(),
  gitHosts: z.array(z.string().min(1)).optional(),
  gitOwners: z.array(z.string().min(1)).optional(),
  catalogScopes: z.array(z.string().min(1)).optional(),
  refs: z.array(z.string().min(1)).optional(),
}).strict();

const canonicalCardName = z.string().refine(
  (value) => isCardScopeName(value) || isCardUnscopedName(value),
  "must be a canonical Card name",
);

const machineConfigSchema = z.object({
  schema: z.literal("drwn.machine"),
  schemaVersion: z.literal(2),
  policy: z.object({
    targets: targetsSchema.optional(),
    catalogs: catalogsSchema.optional(),
    analyzer: analyzerSchema.optional(),
    trustedSources: trustedSourcesSchema.optional(),
  }).strict(),
  capabilities: z.object({
    activeWorker: canonicalCardName.nullable(),
    workerLock: z.unknown().nullable(),
  }).strict(),
}).strict();

function invalidMachineConfig(message: string, cause?: unknown): DrwnError {
  return new DrwnError(
    "MACHINE_CONFIG_INVALID",
    message,
    ["Reset ~/.agents/drwn/machine.json and rerun drwn init; prototype machine formats are not supported."],
    cause,
  );
}

export function createEmptyMachineConfig(): MachineConfig {
  return {
    schema: "drwn.machine",
    schemaVersion: 2,
    policy: {},
    capabilities: { activeWorker: null, workerLock: null },
  };
}

export function parseMachineConfig(value: unknown, path = "machine.json"): MachineConfig {
  const parsed = machineConfigSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`)
      .join("; ");
    throw invalidMachineConfig(`Invalid machine config at ${path}: ${details}`, parsed.error);
  }
  let workerLock = null;
  if (parsed.data.capabilities.workerLock !== null) {
    try {
      workerLock = validateCardLockfile(parsed.data.capabilities.workerLock, `${path} capabilities.workerLock`);
    } catch (error) {
      throw invalidMachineConfig(
        `Invalid machine config at ${path}: capabilities.workerLock must be a valid drwn.project-lock V1`,
        error,
      );
    }
  }

  const activeWorker = parsed.data.capabilities.activeWorker;
  if (activeWorker !== null && !workerLock?.workerRoots.some((root) => root.name === activeWorker)) {
    throw invalidMachineConfig(
      `Invalid machine config at ${path}: capabilities.activeWorker must name an installed workerLock root`,
    );
  }

  return {
    ...parsed.data,
    capabilities: { activeWorker, workerLock },
  };
}

export async function readMachineConfigFile(path: string): Promise<MachineConfig | null> {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    return parseMachineConfig(raw, path);
  } catch (error) {
    if (error instanceof DrwnError) {
      throw error;
    }
    throw invalidMachineConfig(`Invalid JSON in machine config at ${path}`, error);
  }
}

export async function writeMachineConfigFile(path: string, config: MachineConfig): Promise<void> {
  const validated = parseMachineConfig(config, path);
  await writeAtomically(path, `${JSON.stringify(validated, null, 2)}\n`);
}

export async function initializeMachineConfig(path: string): Promise<{ config: MachineConfig; created: boolean }> {
  const existing = await readMachineConfigFile(path);
  if (existing) {
    return { config: existing, created: false };
  }
  const config = createEmptyMachineConfig();
  await writeMachineConfigFile(path, config);
  return { config, created: true };
}

export async function mutateMachineConfig<T>(
  agentsDir: string,
  prepare: (config: MachineConfig) => { config: MachineConfig; value: T } | Promise<{ config: MachineConfig; value: T }>,
  options: { dryRun?: boolean } = {},
): Promise<T> {
  const path = resolveMachineConfigPath(agentsDir);
  const run = async () => {
    const current = await readMachineConfigFile(path) ?? createEmptyMachineConfig();
    const prepared = await prepare(structuredClone(current));
    const validated = parseMachineConfig(prepared.config, path);
    if (!options.dryRun) await writeMachineConfigFile(path, validated);
    return prepared.value;
  };
  if (options.dryRun) return run();
  return withInventoryLock(agentsDir, () => withMachineLock(agentsDir, run));
}
