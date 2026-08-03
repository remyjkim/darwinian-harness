// ABOUTME: Orchestrates MCP and skill syncing using the extracted core modules.
// ABOUTME: Shared by the Clipanion commands and the legacy sync-mcp compatibility wrapper.

import { existsSync, readlinkSync, rmSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expandHomePath, resolveToolPaths } from "./paths";
import {
  CLAUDE_MCP_SERVER_HASH_PREFIX,
  mcpServerHashKey,
  codexUnsupportedHeaderKeys,
  hashCodexManagedServers,
  mergeClaudeSettingsText,
  mergeCodexTomlText,
  mergeCursorConfigText,
  mergeOpencodeConfigText,
  ownedMcpServerNames,
  renderMcpServerForTarget,
  renderJsonMcpConfig,
} from "./mcp";
import { syncSkills as syncSkillsCore } from "./skills";
import { syncHooks } from "./hook-generator/sync-hooks";
import { syncWorkers } from "./worker-generator/sync-worker";
import {
  instructionCompositionForState,
  syncProjectInstructions,
} from "./sync-project-instructions";
import { ensureParentDir, lstatSafe, realpathSafe } from "./fs";
import { backupExistingPath, writeManagedFile } from "./managed-file";
import {
  dedupeManagedPathsByPath,
  diffWriteRecord,
  hashManagedContent,
  hashManagedDirectory,
  loadWriteRecord,
  saveWriteRecord,
  type ManagedPath,
} from "./write-record";
import { assertAmbientMcpPreflight, buildEffectiveState, recomputeContentRootsByCard, type EffectiveState } from "./effective-state";
import { computeOptionalMcpReport } from "./mcp-report";
import { reconcileVendorTrees } from "./vendor-reconcile";
import { DRWN_VERSION } from "./version";
import { canonicalJsonHash } from "./managed-fields";
import { DrwnError } from "./errors";
import { retainUnselectedProjectionOwnership } from "./projection-ownership";
import type {
  CanonicalConfig,
  NormalizedSyncOptions,
  RegistryServer,
  SyncOptions,
  SyncResult,
  TargetName,
} from "./types";

async function readTextIfExists(pathValue: string, fallback: string) {
  try {
    return await readFile(pathValue, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function uniqueManagedPaths(paths: ManagedPath[]) {
  const map = new Map<string, ManagedPath>();
  for (const path of paths) {
    map.set(path.path, path);
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function managedPathToAbsolute(scopeRoot: string, pathValue: string) {
  return join(scopeRoot, pathValue);
}

type ManagedFieldsPath = Extract<ManagedPath, { kind: "managed-fields" }>;

function hasClaudePerServerHashes(entry: ManagedFieldsPath) {
  return Object.keys(entry.fieldHashes).some((key) => key.startsWith(CLAUDE_MCP_SERVER_HASH_PREFIX));
}

function isCodexMcpEntry(entry: ManagedFieldsPath) {
  return entry.path.endsWith(".codex/config.toml");
}

function machineMcpRecordPath(target: TargetName) {
  if (target === "claude") return ".claude.json";
  if (target === "codex") return ".codex/config.toml";
  if (target === "opencode") return ".config/opencode/opencode.json";
  return ".cursor/mcp.json";
}

function selectedMachineTargets(state: EffectiveState) {
  return (Object.keys(state.effectiveConfig.targets) as TargetName[]).filter((target) => {
    if (state.scopedOptions.target && state.scopedOptions.target !== target) return false;
    return state.effectiveConfig.targets[target].enabled;
  });
}

function machineTargetConfigPath(state: EffectiveState, target: TargetName) {
  const targetConfig = state.effectiveConfig.targets[target];
  return expandHomePath(
    target === "claude" ? (targetConfig.userMcpPath ?? targetConfig.configPath) : targetConfig.configPath,
    state.scopedOptions.homeDir,
  );
}

export function planMachineManagedPaths(state: EffectiveState): ManagedPath[] {
  if (state.scopedOptions.writeScope !== "machine") return [];
  const planned: ManagedPath[] = [];

  if (!state.scopedOptions.skillsOnly) {
    for (const target of selectedMachineTargets(state)) {
      const fields = Object.keys(state.activeServers).sort().map((id) => target === "codex" ? id : mcpServerHashKey(id));
      if (fields.length === 0) continue;
      planned.push({
        path: machineMcpRecordPath(target),
        kind: "managed-fields",
        surface: "mcp",
        target,
        fields,
        fieldHashes: Object.fromEntries(
          Object.entries(state.activeServers).map(([id, server]) => [
            target === "codex" ? id : mcpServerHashKey(id),
            canonicalJsonHash(renderMcpServerForTarget(target, server)),
          ]),
        ),
      });
    }
  }

  if (!state.scopedOptions.mcpOnly) {
    for (const skill of state.machineCapabilities?.skills ?? []) {
      if ((!state.scopedOptions.target || state.scopedOptions.target === "claude") && (skill.scope === "shared" || skill.scope === "claude-only")) {
        planned.push({ path: `.claude/skills/${skill.id}`, kind: "managed-directory", surface: "skill", target: "claude", contentHash: "sha256-planned" });
      }
      if ((!state.scopedOptions.target || state.scopedOptions.target === "codex") && (skill.scope === "shared" || skill.scope === "codex-only")) {
        planned.push({ path: `.codex/skills/${skill.id}`, kind: "managed-directory", surface: "skill", target: "codex", contentHash: "sha256-planned" });
      }
    }
  }

  return uniqueManagedPaths(planned);
}

export interface MachineProjectionConflict {
  kind: "foreign" | "drift";
  path: string;
  field?: string;
  message: string;
}

function managedPathAbsolute(state: EffectiveState, entry: ManagedPath) {
  if (entry.path === ".claude.json") return machineTargetConfigPath(state, "claude");
  if (entry.path === ".codex/config.toml") return machineTargetConfigPath(state, "codex");
  if (entry.path === ".cursor/mcp.json") return machineTargetConfigPath(state, "cursor");
  if (entry.path === ".config/opencode/opencode.json") return machineTargetConfigPath(state, "opencode");
  return managedPathToAbsolute(state.scopeRoot, entry.path);
}

function inspectManagedFields(
  absolutePath: string,
  entry: ManagedFieldsPath,
): { invalid: boolean; values: Record<string, { present: boolean; hash: string }> } {
  const stats = lstatSafe(absolutePath);
  if (!stats) return { invalid: false, values: {} };
  if (!stats.isFile() && !stats.isSymbolicLink()) return { invalid: true, values: {} };
  if (isCodexMcpEntry(entry)) {
    const hashes = hashCodexManagedServers(readFileSync(absolutePath, "utf8"), entry.fields);
    if (entry.fields.some((field) => !(field in hashes))) return { invalid: true, values: {} };
    return {
      invalid: false,
      values: Object.fromEntries(entry.fields.map((field) => [field, { present: hashes[field] !== "absent", hash: hashes[field]! }])),
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as Record<string, unknown>;
    const serversKey = entry.path.endsWith("opencode.json") ? "mcp" : "mcpServers";
    const rawServers = parsed[serversKey];
    const servers = rawServers && typeof rawServers === "object" && !Array.isArray(rawServers)
      ? rawServers as Record<string, unknown>
      : {};
    return {
      invalid: false,
      values: Object.fromEntries(entry.fields.map((field) => {
        const id = field.startsWith(CLAUDE_MCP_SERVER_HASH_PREFIX)
          ? field.slice(CLAUDE_MCP_SERVER_HASH_PREFIX.length)
          : field;
        const value = servers[id];
        return [field, { present: value !== undefined, hash: value === undefined ? "absent" : canonicalJsonHash(value) }];
      })),
    };
  } catch {
    return { invalid: true, values: {} };
  }
}

export function collectMachineProjectionConflicts(
  state: EffectiveState,
  previousRecord: import("./write-record").WriteRecord | null,
): MachineProjectionConflict[] {
  if (state.scopedOptions.writeScope !== "machine") return [];
  const desired = planMachineManagedPaths(state);
  const { toAdd, toVerify } = diffWriteRecord(previousRecord, desired);
  const conflicts: MachineProjectionConflict[] = [];

  for (const entry of toAdd) {
    const absolutePath = managedPathAbsolute(state, entry);
    if (entry.kind === "managed-fields") {
      const current = inspectManagedFields(absolutePath, entry);
      if (current.invalid) {
        conflicts.push({ kind: "foreign", path: absolutePath, message: `foreign machine projection config cannot be inspected: ${absolutePath}` });
        continue;
      }
      for (const field of entry.fields) {
        if (current.values[field]?.present) {
          conflicts.push({
            kind: "foreign",
            path: absolutePath,
            field,
            message: `foreign machine projection destination is not recorded as drwn-owned: ${absolutePath} (${field})`,
          });
        }
      }
      continue;
    }
    if (lstatSafe(absolutePath) !== null) {
      conflicts.push({
        kind: "foreign",
        path: absolutePath,
        message: `foreign machine projection destination is not recorded as drwn-owned: ${absolutePath}`,
      });
    }
  }

  for (const entry of toVerify) {
    const absolutePath = managedPathAbsolute(state, entry);
    if (entry.kind === "managed-fields") {
      const current = inspectManagedFields(absolutePath, entry);
      for (const field of entry.fields) {
        if (current.invalid || current.values[field]?.hash !== entry.fieldHashes[field]) {
          conflicts.push({
            kind: "drift",
            path: absolutePath,
            field,
            message: `recorded machine projection drift at ${absolutePath} (${field})`,
          });
        }
      }
      continue;
    }
    if (entry.kind === "managed-directory") {
      const stats = lstatSafe(absolutePath);
      if (!stats?.isDirectory() || hashManagedDirectory(absolutePath) !== entry.contentHash) {
        conflicts.push({ kind: "drift", path: absolutePath, message: `recorded machine projection drift at ${absolutePath}` });
      }
      continue;
    }
    if (entry.kind === "managed-content") {
      if (!existsSync(absolutePath) || hashManagedContent(readFileSync(absolutePath)) !== entry.contentHash) {
        conflicts.push({ kind: "drift", path: absolutePath, message: `recorded machine projection drift at ${absolutePath}` });
      }
    }
  }

  return conflicts.filter((conflict, index) =>
    conflicts.findIndex((candidate) => candidate.kind === conflict.kind && candidate.path === conflict.path && candidate.field === conflict.field) === index
  );
}

export function assertMachineProjectionPreflight(
  state: EffectiveState,
  previousRecord: import("./write-record").WriteRecord | null,
) {
  const conflicts = collectMachineProjectionConflicts(state, previousRecord)
    .filter((conflict) => conflict.kind === "foreign" || !state.normalized.force);
  if (conflicts.length === 0) return;
  throw new DrwnError(
    "MACHINE_PROJECTION_CONFLICT",
    conflicts.map((conflict) => conflict.message).join("; "),
  );
}

export function cleanupRemovedManagedPaths(
  scopeRoot: string,
  previous: ManagedPath[],
  dryRun: boolean,
  result: SyncResult,
  resolveAbsolute?: (entry: ManagedPath) => string,
) {
  for (const entry of previous) {
    const absolutePath = resolveAbsolute?.(entry) ?? managedPathToAbsolute(scopeRoot, entry.path);
    if (!existsSync(absolutePath) && lstatSafe(absolutePath) === null) {
      continue;
    }
    if (entry.surface === "instructions") {
      continue;
    }
    if (entry.kind === "managed-content") {
      const stats = lstatSafe(absolutePath);
      if (stats?.isFile() && hashManagedContent(readFileSync(absolutePath)) === entry.contentHash) {
        result.changes.push(`remove ${absolutePath}`);
        if (!dryRun) {
          rmSync(absolutePath, { recursive: true, force: true });
        }
        continue;
      }
      result.warnings.push(`preserved user-owned path: ${absolutePath}`);
      continue;
    }
    if (entry.kind === "managed-directory") {
      const stats = lstatSafe(absolutePath);
      if (stats?.isDirectory() && hashManagedDirectory(absolutePath) === entry.contentHash) {
        result.changes.push(`remove ${absolutePath}`);
        if (!dryRun) {
          rmSync(absolutePath, { recursive: true, force: true });
        }
        continue;
      }
      result.warnings.push(`preserved user-owned path: ${absolutePath}`);
      continue;
    }
    if (entry.kind === "managed-fields" && hasClaudePerServerHashes(entry)) {
      let parsed: Record<string, unknown>;
      try {
        const stats = lstatSafe(absolutePath);
        if (!stats?.isFile()) throw new Error("managed config is not a file");
        parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as Record<string, unknown>;
      } catch {
        result.warnings.push(`preserved user-owned path: ${absolutePath}`);
        continue;
      }
      const serversKey = entry.path.endsWith("opencode.json") ? "mcp" : "mcpServers";
      const rawServers = parsed[serversKey];
      const mcpServers = (
        rawServers && typeof rawServers === "object" && !Array.isArray(rawServers)
          ? rawServers
          : {}
      ) as Record<string, unknown>;
      let changed = false;
      let drifted = false;
      for (const name of ownedMcpServerNames(entry.fieldHashes)) {
        const currentValue = mcpServers[name];
        if (currentValue === undefined) {
          continue;
        }
        const priorHash = entry.fieldHashes[`${CLAUDE_MCP_SERVER_HASH_PREFIX}${name}`];
        if (priorHash && canonicalJsonHash(currentValue) === priorHash) {
          delete mcpServers[name];
          changed = true;
        } else {
          drifted = true;
        }
      }
      if (drifted) {
        result.warnings.push(`preserved user-owned path: ${absolutePath}`);
      }
      if (changed) {
        parsed[serversKey] = mcpServers;
        writeManagedFile(absolutePath, `${JSON.stringify(parsed, null, 2)}\n`, dryRun, result);
      }
      continue;
    }
    if (entry.kind === "managed-fields" && isCodexMcpEntry(entry) && Object.keys(entry.fieldHashes).length > 0) {
      const stats = lstatSafe(absolutePath);
      if (!stats?.isFile()) {
        result.warnings.push(`preserved user-owned path: ${absolutePath}`);
        continue;
      }
      const current = readFileSync(absolutePath, "utf8");
      const currentHashes = hashCodexManagedServers(current, entry.fields);
      const removable = entry.fields.filter((name) => currentHashes[name] === entry.fieldHashes[name]);
      const drifted = entry.fields.filter((name) => currentHashes[name] !== "absent" && currentHashes[name] !== entry.fieldHashes[name]);
      if (drifted.length > 0) {
        result.warnings.push(`preserved user-owned path: ${absolutePath} (${drifted.join(", ")})`);
      }
      if (removable.length > 0) {
        const next = mergeCodexTomlText(current, {}, removable);
        writeManagedFile(absolutePath, next, dryRun, result);
      }
      continue;
    }
    if (entry.kind === "symlink" || entry.kind === "generated-symlink") {
      const stats = lstatSafe(absolutePath);
      const expectedTarget = entry.kind === "symlink" ? entry.linkTarget : entry.generatedPath;
      const linkTarget = stats?.isSymbolicLink() ? readlinkSync(absolutePath) : null;
      if (
        stats?.isSymbolicLink() &&
        (realpathSafe(absolutePath) === realpathSafe(expectedTarget) || linkTarget === expectedTarget)
      ) {
        result.changes.push(`remove ${absolutePath}`);
        if (!dryRun) {
          rmSync(absolutePath, { recursive: true, force: true });
        }
        continue;
      }
    }
    result.warnings.push(`preserved user-owned path: ${absolutePath}`);
  }
}

export function verifyManagedPaths(
  scopeRoot: string,
  previous: ManagedPath[],
  options?: { force?: boolean; lockedCards?: import("./card-lock").CardLockEntry[] },
) {
  if (options?.force) {
    return;
  }
  for (const entry of previous) {
    if (entry.surface === "instructions") {
      continue;
    }
    if (entry.kind === "managed-fields" && isCodexMcpEntry(entry) && Object.keys(entry.fieldHashes).length > 0) {
      const absolutePath = managedPathToAbsolute(scopeRoot, entry.path);
      if (!existsSync(absolutePath)) {
        continue;
      }
      const names = Object.keys(entry.fieldHashes);
      const currentHashes = hashCodexManagedServers(readFileSync(absolutePath, "utf8"), names);
      const drifted = names.filter((name) => currentHashes[name] !== entry.fieldHashes[name]);
      if (drifted.length > 0) {
        throw new Error(
          `Refusing to overwrite managed Codex MCP drift for ${drifted.join(", ")} at ${absolutePath}. Rerun drwn write --force to overwrite.`,
        );
      }
      continue;
    }
    if (entry.kind !== "managed-content") {
      if (entry.kind === "managed-directory") {
        const absolutePath = managedPathToAbsolute(scopeRoot, entry.path);
        if (!existsSync(absolutePath)) {
          continue;
        }
        const stats = lstatSafe(absolutePath);
        if (stats?.isDirectory() && hashManagedDirectory(absolutePath) !== entry.contentHash) {
          const signpost = driftSignpostForPath(entry.path, options?.lockedCards ?? []);
          throw new Error(
            `Refusing to overwrite managed directory drift at ${absolutePath}. ${signpost}`,
          );
        }
      }
      continue;
    }
    const absolutePath = managedPathToAbsolute(scopeRoot, entry.path);
    if (!existsSync(absolutePath)) {
      continue;
    }
    const currentHash = hashManagedContent(readFileSync(absolutePath));
    if (currentHash !== entry.contentHash) {
      const signpost = driftSignpostForPath(entry.path, options?.lockedCards ?? []);
      throw new Error(
        `Refusing to overwrite managed content drift at ${absolutePath}. ${signpost}`,
      );
    }
  }
}

function driftSignpostForPath(relPath: string, lockedCards: import("./card-lock").CardLockEntry[]) {
  if (relPath.includes("vendor/")) {
    return "Edit the card source, not vendor/. Run drwn card fork → edit → publish → update, or drwn card source sync when upstream is configured.";
  }
  for (const card of lockedCards) {
    for (const [skill, upstreamRef] of Object.entries(card.manifest.skills?.upstream ?? {})) {
      if (relPath.includes(skill)) {
        return `Edit upstream ${upstreamRef} (or run drwn card source sync ${card.name}), then drwn write.`;
      }
    }
  }
  const override = lockedCards.find((card) => card.origin === "file");
  if (override) {
    return `Edit linked source at ${override.path}, then drwn write.`;
  }
  return "Run drwn card fork → edit → publish → update, then drwn write — never edit vendored projection output directly.";
}

export async function syncMcp(
  options: NormalizedSyncOptions,
  config: CanonicalConfig,
  servers: Record<string, RegistryServer>,
  previousManagedPaths: ManagedPath[] = [],
): Promise<SyncResult> {
  const managedPaths: ManagedPath[] = [];
  const result: SyncResult = { changes: [], warnings: [], managedPaths };
  const toolRoot = options.toolRoot ?? options.homeDir;
  const toolPaths = resolveToolPaths(toolRoot);
  const serverCount = Object.keys(servers).length;
  const previousClaude = previousManagedPaths.find(
    (entry): entry is ManagedFieldsPath =>
      entry.kind === "managed-fields" && entry.path === ".claude.json" && hasClaudePerServerHashes(entry),
  );
  const previousClaudeHashes = previousClaude?.kind === "managed-fields" ? previousClaude.fieldHashes : {};
  const previousCursor = previousManagedPaths.find(
    (entry): entry is ManagedFieldsPath =>
      entry.kind === "managed-fields" && entry.path === ".cursor/mcp.json" && hasClaudePerServerHashes(entry),
  );
  const previousCursorHashes = previousCursor?.fieldHashes ?? {};
  const previousOpencode = previousManagedPaths.find(
    (entry): entry is ManagedFieldsPath =>
      entry.kind === "managed-fields" && entry.path.endsWith("opencode.json") && hasClaudePerServerHashes(entry),
  );
  const previousOpencodeHashes = previousOpencode?.fieldHashes ?? {};
  const hasPriorMcpOwnership = previousManagedPaths.some((entry) =>
    (entry.kind === "managed-fields" && hasClaudePerServerHashes(entry)) ||
    (entry.kind === "managed-fields" && isCodexMcpEntry(entry)) ||
    entry.kind === "generated-symlink"
  );

  if (options.writeScope === "machine" && serverCount === 0 && !hasPriorMcpOwnership) {
    result.warnings.push(
      "drwn write --root: no explicit machine MCP servers configured. Enable one with `drwn machine mcp enable <server-id>` first.",
    );
    return result;
  }

  const targetConfigPath = (targetName: TargetName, target: { configPath: string; userMcpPath?: string }) => {
    if (options.writeScope === "project") {
      if (targetName === "claude") return toolPaths.claudeMcp;
      if (targetName === "codex") return toolPaths.codexConfig;
      if (targetName === "opencode") return toolPaths.opencodeConfig;
      return toolPaths.cursorMcp;
    }
    return expandHomePath(targetName === "claude" ? (target.userMcpPath ?? target.configPath) : target.configPath, options.homeDir);
  };

  const selectedTargets = (Object.keys(config.targets) as TargetName[]).filter((name) => {
    if (options.target && options.target !== name) {
      return false;
    }
    return config.targets[name].enabled;
  });

  for (const targetName of selectedTargets) {
    const target = config.targets[targetName];
    const configPath = targetConfigPath(targetName, target);
    if (serverCount === 0) continue;

    if (targetName === "claude") {
      if (options.writeScope === "project") {
        const content = renderJsonMcpConfig(servers);
        writeManagedFile(configPath, content, options.dryRun, result);
        managedPaths.push({ path: ".mcp.json", kind: "managed-content", surface: "mcp", target: "claude", contentHash: hashManagedContent(content) });
        continue;
      }

      const current = await readTextIfExists(configPath, "{}\n");
      const merged = mergeClaudeSettingsText(current, servers, {
        inlineMeta: false,
        mcpServerOwnership: "per-server",
        priorFieldHashes: previousClaudeHashes,
        force: options.force ?? false,
        preserveRemovedOwnedServers: true,
      });
      writeManagedFile(configPath, merged.text, options.dryRun, result);
      if (Object.keys(merged.fieldHashes).length > 0) {
        managedPaths.push({
          path: ".claude.json",
          kind: "managed-fields",
          surface: "mcp",
          target: "claude",
          fields: Object.keys(merged.fieldHashes),
          fieldHashes: merged.fieldHashes,
        });
      }
      continue;
    }

    if (targetName === "codex") {
      for (const [name, server] of Object.entries(servers)) {
        const unsupported = codexUnsupportedHeaderKeys(server);
        if (unsupported.length > 0) {
          result.warnings.push(
            `Codex MCP server "${name}" declares header(s) ${unsupported.join(", ")} using \${VAR} interpolation, which Codex cannot resolve; they were omitted from .codex/config.toml. Use an "Authorization: Bearer \${VAR}" header (mapped to bearer_token_env_var) or a literal value.`,
          );
        }
      }
      const current = await readTextIfExists(configPath, "");
      const mergedCodex = mergeCodexTomlText(current, servers);
      writeManagedFile(configPath, mergedCodex, options.dryRun, result);
      const fieldHashes = hashCodexManagedServers(mergedCodex, Object.keys(servers));
      if (Object.keys(fieldHashes).length > 0) {
        managedPaths.push({ path: ".codex/config.toml", kind: "managed-fields", surface: "mcp", target: "codex", fields: Object.keys(fieldHashes), fieldHashes });
      }
      continue;
    }

    if (targetName === "opencode") {
      const jsoncSibling = configPath.replace(/opencode\.json$/, "opencode.jsonc");
      if (existsSync(jsoncSibling)) {
        result.warnings.push(
          `Skipping opencode MCP write: ${jsoncSibling} exists and drwn only manages opencode.json. Migrate the config or manage MCP manually.`,
        );
        continue;
      }
      const current = await readTextIfExists(configPath, `{\n  "$schema": "https://opencode.ai/config.json"\n}\n`);
      const merged = mergeOpencodeConfigText(current, servers, {
        priorFieldHashes: previousOpencodeHashes,
        force: options.force ?? false,
        preserveRemovedOwnedServers: true,
      });
      writeManagedFile(configPath, merged.text, options.dryRun, result);
      if (Object.keys(merged.fieldHashes).length > 0) {
        managedPaths.push({
          path: options.writeScope === "project" ? "opencode.json" : ".config/opencode/opencode.json",
          kind: "managed-fields",
          surface: "mcp",
          target: "opencode",
          fields: Object.keys(merged.fieldHashes),
          fieldHashes: merged.fieldHashes,
        });
      }
      continue;
    }

    if (targetName === "cursor") {
      const current = await readTextIfExists(configPath, "{}\n");
      const merged = mergeCursorConfigText(current, servers, {
        priorFieldHashes: previousCursorHashes,
        force: options.force ?? false,
        preserveRemovedOwnedServers: true,
      });
      writeManagedFile(configPath, merged.text, options.dryRun, result);
      if (Object.keys(merged.fieldHashes).length > 0) {
        managedPaths.push({
          path: ".cursor/mcp.json",
          kind: "managed-fields",
          surface: "mcp",
          target: "cursor",
          fields: Object.keys(merged.fieldHashes),
          fieldHashes: merged.fieldHashes,
        });
      }
    }
  }

  return result;
}

export async function syncRepository(options: SyncOptions = {}): Promise<SyncResult> {
  const state = await buildEffectiveState(options);
  const writeScope = state.scopedOptions.writeScope === "machine" ? "machine" : "project";
  const ambientCollisions = assertAmbientMcpPreflight(state);
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [], ambientCollisions };
  result.optionalMcpReport = state.normalized.skillsOnly
    ? null
    : computeOptionalMcpReport({
        lockedCards: state.lockedCards,
        activeServers: state.activeServers,
        effectiveRegistry: state.effectiveRegistry,
        projectConfigPath: state.projectConfigPath,
        projectServerOverrides: state.projectConfig?.mcpServers,
      });
  result.warnings.push(...state.overlayWarnings);
  result.warnings.push(
    ...ambientCollisions
      .filter((collision) => collision.disposition !== "identical")
      .map((collision) =>
        `${collision.reasonCode}: ${collision.target} MCP server "${collision.id}" has a ${collision.disposition} ${collision.ambient.source}-scope collision at ${collision.ambient.path}. ${collision.remediation ?? ""}`.trim()
      ),
  );
  const cardModes: NonNullable<SyncResult["cardModes"]> = {};
  for (const [name, mode] of Object.entries(state.cardModes)) {
    cardModes[name] = {
      mode: mode.mode,
      reason: mode.reason,
      lane: state.cardLanes[name] ?? "committed",
      ...(mode.sourcePath ? { sourcePath: mode.sourcePath } : {}),
    };
  }
  result.cardModes = cardModes;
  const previousRecord = loadWriteRecord(state.recordPath, writeScope);
  if (state.scopedOptions.writeScope === "machine") {
    assertMachineProjectionPreflight(state, previousRecord);
  } else {
    verifyManagedPaths(state.scopeRoot, previousRecord?.managedPaths ?? [], {
      force: state.normalized.force ?? false,
      lockedCards: state.lockedCards,
    });
  }

  if (state.projectRoot && !state.normalized.dryRun) {
    const { ensureGitignoreEntries, ensureVendorGitattributes } = await import("./git-hygiene");
    await ensureGitignoreEntries(state.projectRoot);
    await ensureVendorGitattributes(state.projectRoot);
  }

  if (state.projectRoot) {
    await reconcileVendorTrees(state, result);
    state.contentRootsByCard = recomputeContentRootsByCard(state, {
      allowPlanningFallback: Boolean(state.normalized.dryRun),
    });
    const composition = instructionCompositionForState(state);
    if (state.scopedOptions.strict && composition.excluded.length > 0) {
      throw new Error(
        `Explicit instruction consent required for: ${composition.excluded
          .map((item) => item.card)
          .join(", ")}`,
      );
    }
    const workersResult = await syncWorkers(state);
    result.changes.push(...workersResult.changes);
    result.warnings.push(...workersResult.warnings);
    result.managedPaths?.push(...(workersResult.managedPaths ?? []));
    const instructionsResult = syncProjectInstructions({
      state,
      previousManagedPaths: previousRecord?.managedPaths ?? [],
      composition,
    });
    result.changes.push(...instructionsResult.changes);
    result.warnings.push(...instructionsResult.warnings);
    result.managedPaths?.push(...(instructionsResult.managedPaths ?? []));
  }

  if (!state.normalized.skillsOnly) {
    const mcpResult = await syncMcp(
      state.scopedOptions,
      state.effectiveConfig,
      state.activeServers,
      previousRecord?.managedPaths ?? [],
    );
    result.changes.push(...mcpResult.changes);
    result.warnings.push(...mcpResult.warnings);
    result.managedPaths?.push(...(mcpResult.managedPaths ?? []));
  }

  if (!state.normalized.mcpOnly) {
    const skillsResult = await syncSkillsCore(
      state.scopedOptions,
      state.skillSelection,
      state.skillApplyOrderCards,
      state.contentRootsByCard,
      Object.fromEntries((state.machineCapabilities?.skills ?? []).map((skill) => [skill.id, skill])),
      state.effectiveConfig,
    );
    result.changes.push(...skillsResult.changes);
    result.warnings.push(...skillsResult.warnings);
    result.managedPaths?.push(...(skillsResult.managedPaths ?? []));
  }

  if (!state.normalized.mcpOnly && !state.normalized.skillsOnly) {
    const hooksResult = await syncHooks(state, previousRecord?.managedPaths ?? []);
    result.changes.push(...hooksResult.changes);
    result.warnings.push(...hooksResult.warnings);
    result.managedPaths?.push(...(hooksResult.managedPaths ?? []));
  }

  const desiredManagedPaths = retainUnselectedProjectionOwnership(
    previousRecord?.managedPaths ?? [],
    uniqueManagedPaths(result.managedPaths ?? []),
    {
      mcpOnly: state.scopedOptions.mcpOnly,
      skillsOnly: state.scopedOptions.skillsOnly,
      target: state.scopedOptions.target,
    },
  );
  const { toRemove } = diffWriteRecord(previousRecord, desiredManagedPaths);
  cleanupRemovedManagedPaths(
    state.scopeRoot,
    toRemove,
    state.normalized.dryRun,
    result,
    state.scopedOptions.writeScope === "machine" ? (entry) => managedPathAbsolute(state, entry) : undefined,
  );
  result.managedPaths = desiredManagedPaths;
  if (!state.normalized.dryRun) {
    saveWriteRecord(state.recordPath, {
      schema: "drwn.write-record",
      schemaVersion: 1,
      scope: writeScope,
      lastWriteAt: new Date().toISOString(),
      lastWriteHarnessVersion: DRWN_VERSION,
      managedPaths: desiredManagedPaths,
    });
  }

  return result;
}

export interface RepositoryProjectionPlan {
  current: boolean;
  issues: string[];
  recordPresent: boolean;
  result: SyncResult | null;
}

function projectionFailureIssue(error: unknown) {
  if (error instanceof DrwnError) {
    return `${error.code}: ${error.message}`;
  }
  return "PROJECT_PROJECTION_PLAN_FAILED: unable to compute the project projection plan";
}

export async function planRepositoryProjection(options: SyncOptions): Promise<RepositoryProjectionPlan> {
  let state: EffectiveState;
  try {
    state = await buildEffectiveState({
      ...options,
      dryRun: true,
      forceMachineScope: false,
      scope: "project",
    });
  } catch (error) {
    return { current: false, issues: [projectionFailureIssue(error)], recordPresent: false, result: null };
  }

  const recordPresent = existsSync(state.recordPath);
  let previousRecord;
  try {
    previousRecord = loadWriteRecord(state.recordPath, "project");
  } catch (error) {
    return { current: false, issues: [projectionFailureIssue(error)], recordPresent, result: null };
  }

  let result: SyncResult;
  try {
    result = await syncRepository({
      ...options,
      dryRun: true,
      forceMachineScope: false,
      scope: "project",
    });
  } catch (error) {
    return { current: false, issues: [projectionFailureIssue(error)], recordPresent, result: null };
  }

  const issues: string[] = [];
  if (!recordPresent) {
    issues.push(`PROJECT_PROJECTION_RECORD_MISSING: ${state.recordPath}`);
  }
  for (const warning of state.overlayWarnings) {
    issues.push(`PROJECT_PROJECTION_OVERLAY_ISSUE: ${warning}`);
  }
  for (const change of result.changes) {
    issues.push(`PROJECT_PROJECTION_CHANGE: ${change}`);
  }
  const difference = diffWriteRecord(previousRecord, result.managedPaths ?? []);
  const staleOwnership = dedupeManagedPathsByPath([...difference.toAdd, ...difference.toRemove]);
  for (const entry of staleOwnership) {
    issues.push(`PROJECT_PROJECTION_OWNERSHIP_STALE: ${entry.path}`);
  }

  return {
    current: issues.length === 0,
    issues: [...new Set(issues)],
    recordPresent,
    result,
  };
}
