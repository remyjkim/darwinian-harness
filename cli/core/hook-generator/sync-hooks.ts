// ABOUTME: Materializes card hook policies into runtime-specific composer artifacts.
// ABOUTME: Wires generated composers into Claude Code, Codex, and Mastra surfaces.

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CardLockEntry } from "../card-lock";
import type { EffectiveState } from "../effective-state";
import { isHookConsentValid } from "../hook-consent";
import { expandHomePath, resolveToolPaths } from "../paths";
import {
  hashDesiredClaudeHookFields,
  type ClaudeHooksConfig,
  mergeClaudeSettingsText,
} from "../mcp";
import { writeManagedFile } from "../managed-file";
import { assertStoreWritable, resolveGeneratedHooksDir, resolveStoreGeneratedDir } from "../store-paths";
import type { SyncResult, TargetName } from "../types";
import { hashManagedContent, ownManagedPath, type ManagedPath, type ProjectionTarget } from "../write-record";
import { bundleHookComposer, type HookPolicyBundleInput } from "./bundle-composer";
import { emitMastraComposer } from "./emit-mastra-composer";
import { resolveHookRuntimes } from "./runtime-selection";
import { resolveDrwnHookCommand, signalHooksConfig } from "./sync-signals";
import { recordProjectionPath } from "../projection-path";

const COMMAND_TIMEOUT_SECONDS = 30;

function plannedHash(label: string) {
  return hashManagedContent(`planned:${label}`);
}

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

function managedPath(state: EffectiveState, absolutePath: string) {
  return recordProjectionPath(
    state.scopeRoot,
    absolutePath,
    state.scopedOptions.writeScope === "machine" ? state.scopedOptions.agentsDir : undefined,
  );
}

function targetConfigPath(state: EffectiveState, targetName: TargetName, configuredPath: string) {
  const toolPaths = resolveToolPaths(state.scopedOptions.toolRoot ?? state.scopedOptions.homeDir);
  if (state.scopedOptions.writeScope === "project") {
    if (targetName === "claude") return toolPaths.claudeSettings;
    if (targetName === "codex") return toolPaths.codexConfig;
    return toolPaths.cursorMcp;
  }
  return expandHomePath(configuredPath, state.scopedOptions.homeDir);
}

function isPolicyExcluded(cardName: string, policyName: string, exclusions: Set<string>) {
  return exclusions.has(policyName) || exclusions.has(`${cardName}:${policyName}`);
}

function hookConsentWarning(card: CardLockEntry) {
  return `Skipping hooks for ${card.name}@${card.version}: missing or out-of-range hook consent. Run drwn card trust ${card.name} --hooks to materialize them.`;
}

function collectPolicies(
  cards: CardLockEntry[],
  exclusions: Set<string>,
  result: SyncResult,
  strictHooks: boolean,
  contentRoots?: Record<string, string>,
): HookPolicyBundleInput[] {
  const policies: HookPolicyBundleInput[] = [];
  const consentWarnings: string[] = [];

  for (const card of cards) {
    const activeHooks = card.hooks.filter((policyName) => !isPolicyExcluded(card.name, policyName, exclusions));
    if (activeHooks.length === 0) {
      continue;
    }
    if (!isHookConsentValid(card)) {
      consentWarnings.push(hookConsentWarning(card));
      continue;
    }
    for (const policyName of activeHooks) {
      const root = contentRoots?.[card.name] ?? card.path;
      policies.push({
        cardName: card.name,
        policyName,
        policyTsPath: join(root, "hooks", policyName, "policy.ts"),
      });
    }
  }

  if (consentWarnings.length > 0) {
    if (strictHooks) {
      throw new Error(consentWarnings.join("\n"));
    }
    result.warnings.push(...consentWarnings);
  }

  return policies;
}

function claudeHooksConfig(composerPath: string): ClaudeHooksConfig {
  const hook = { type: "command" as const, command: "node", args: [composerPath], timeout: COMMAND_TIMEOUT_SECONDS };
  return {
    PreToolUse: [{ matcher: ".*", hooks: [hook] }],
    PostToolUse: [{ matcher: ".*", hooks: [hook] }],
  };
}

function mergeClaudeHookConfigs(...configs: ClaudeHooksConfig[]): ClaudeHooksConfig {
  const merged: ClaudeHooksConfig = {};
  for (const config of configs) {
    for (const [event, entries] of Object.entries(config)) {
      if (!entries || entries.length === 0) {
        continue;
      }
      merged[event] = [...(merged[event] ?? []), ...entries];
    }
  }
  return merged;
}

function cursorHooksConfig(composerPath: string) {
  const hook = { command: `node ${JSON.stringify(composerPath)}`, timeout: COMMAND_TIMEOUT_SECONDS };
  return {
    version: 1,
    hooks: {
      preToolUse: [hook],
      postToolUse: [hook],
    },
  };
}

function codexHooksConfig(composerPath: string) {
  const hook = {
    type: "command",
    command: `node ${JSON.stringify(composerPath)}`,
    timeout: COMMAND_TIMEOUT_SECONDS,
    statusMessage: "Checking drwn card hook policy",
  };
  return {
    hooks: {
      PreToolUse: [{ matcher: ".*", hooks: [hook] }],
      PostToolUse: [{ matcher: ".*", hooks: [{ ...hook, statusMessage: "Recording drwn card hook result" }] }],
    },
  };
}

function recordManagedContent(
  state: EffectiveState,
  pathValue: string,
  contentHash: string,
  target: ProjectionTarget,
): ManagedPath {
  return ownManagedPath(
    { path: managedPath(state, pathValue), kind: "managed-content", contentHash },
    { surface: "hook", target },
  );
}

function recordComposer(
  result: SyncResult,
  state: EffectiveState,
  composerPath: string,
  beforeContent: string | null,
  dryRun: boolean,
  target: ProjectionTarget,
) {
  if (dryRun) {
    result.changes.push(`write ${composerPath}`);
    result.managedPaths?.push(recordManagedContent(state, composerPath, "sha256-dry-run", target));
    return;
  }

  const nextContent = readFileSync(composerPath);
  if (!beforeContent || hashManagedContent(beforeContent) !== hashManagedContent(nextContent)) {
    result.changes.push(`write ${composerPath}`);
  }
  result.managedPaths?.push(recordManagedContent(state, composerPath, hashManagedContent(nextContent), target));
}

function readExistingContent(pathValue: string) {
  return existsSync(pathValue) ? readFileSync(pathValue, "utf8") : null;
}

function hasOwnedClaudeHooks(settingsText: string) {
  try {
    const parsed = JSON.parse(settingsText) as { _drwn?: { ownedHooks?: unknown } };
    return Boolean(
      parsed._drwn?.ownedHooks &&
        typeof parsed._drwn.ownedHooks === "object" &&
        Object.keys(parsed._drwn.ownedHooks as Record<string, unknown>).length > 0
    );
  } catch {
    return false;
  }
}

export function planMachineHookManagedPaths(state: EffectiveState): ManagedPath[] {
  if (
    state.scopedOptions.writeScope !== "machine" ||
    state.scopedOptions.mcpOnly ||
    state.scopedOptions.skillsOnly
  ) {
    return [];
  }
  const projectHookConfig = state.projectConfigWithCards?.hooks ?? state.projectConfig?.hooks;
  const exclusions = new Set(projectHookConfig?.exclude ?? []);
  const planningResult: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const policies = collectPolicies(
    state.activeCards,
    exclusions,
    planningResult,
    state.normalized.strictHooks ?? false,
    state.contentRootsByCard,
  );
  const hasPolicies = policies.length > 0;
  const signalsEnabled = projectHookConfig?.signals?.enabled === true;
  if (!hasPolicies && !signalsEnabled) return [];
  const generatedDir =
    state.scopedOptions.generatedDir ??
    resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const runtimes = resolveHookRuntimes({
    effectiveConfig: state.effectiveConfig,
    projectConfig: state.projectConfigWithCards ?? state.projectConfig,
    target: state.scopedOptions.target,
  });
  const paths: ManagedPath[] = [];

  for (const runtime of runtimes) {
    const outputDir = resolveGeneratedHooksDir(generatedDir, runtime);
    const target: ProjectionTarget =
      runtime === "claude-code" ? "claude" : runtime;
    if (hasPolicies) {
      const composerPath = join(
        outputDir,
        runtime === "mastra" ? "composer.ts" : "composer.mjs",
      );
      paths.push(recordManagedContent(
        state,
        composerPath,
        plannedHash(`hook:${runtime}`),
        target,
      ));
    }
    if (runtime === "claude-code") {
      const desiredHooks = mergeClaudeHookConfigs(
        hasPolicies
          ? claudeHooksConfig(join(outputDir, "composer.mjs"))
          : {},
        signalsEnabled ? signalHooksConfig(resolveDrwnHookCommand()) : {},
      );
      const fieldHashes = hashDesiredClaudeHookFields(desiredHooks);
      if (Object.keys(fieldHashes).length > 0) {
        paths.push({
          path: ".claude/settings.json",
          kind: "managed-fields",
          surface: "hook",
          target: "claude",
          fields: Object.keys(fieldHashes),
          fieldHashes,
        });
      }
      continue;
    }
    if (!hasPolicies) continue;
    const targetPath = runtime === "codex"
      ? join(state.scopeRoot, ".codex", "hooks.json")
      : runtime === "cursor"
        ? join(state.scopeRoot, ".cursor", "hooks.json")
        : runtime === "opencode"
          ? join(state.scopeRoot, ".config", "opencode", "plugins", "drwn-hooks.js")
          : null;
    if (targetPath) {
      paths.push(recordManagedContent(
        state,
        targetPath,
        plannedHash(`hook-target:${runtime}`),
        target,
      ));
    }
  }
  return paths;
}

export async function syncHooks(state: EffectiveState, previousManagedPaths: ManagedPath[] = []): Promise<SyncResult> {
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const projectHookConfig = state.projectConfigWithCards?.hooks ?? state.projectConfig?.hooks;
  const exclusions = new Set(projectHookConfig?.exclude ?? []);
  const signalsEnabled = projectHookConfig?.signals?.enabled === true;
  const policies = collectPolicies(
    state.activeCards,
    exclusions,
    result,
    state.normalized.strictHooks ?? false,
    state.contentRootsByCard,
  );
  const hasPolicies = policies.length > 0;

  if (!state.scopedOptions.dryRun && hasPolicies) {
    assertStoreWritable();
  }

  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const runtimes = resolveHookRuntimes({
    effectiveConfig: state.effectiveConfig,
    projectConfig: state.projectConfigWithCards ?? state.projectConfig,
    target: state.scopedOptions.target,
  });

  for (const runtime of runtimes) {
    const outputDir = resolveGeneratedHooksDir(generatedDir, runtime);

    if (runtime === "claude-code") {
      const composerPath = join(outputDir, "composer.mjs");
      if (hasPolicies) {
        const beforeContent = readExistingContent(composerPath);
        if (!state.scopedOptions.dryRun) {
          await bundleHookComposer({ runtime, outputDir, policies });
        } else {
          result.changes.push(`write ${composerPath}`);
          result.managedPaths?.push(recordManagedContent(state, composerPath, "sha256-dry-run", "claude"));
        }
        if (!state.scopedOptions.dryRun) {
          recordComposer(result, state, composerPath, beforeContent, state.scopedOptions.dryRun, "claude");
        }
      }

      const settingsPath = targetConfigPath(state, "claude", state.effectiveConfig.targets.claude.configPath);
      const current = await readTextIfExists(settingsPath, hasPolicies || signalsEnabled ? "{}\n" : "");
      if (!hasPolicies && !signalsEnabled && !hasOwnedClaudeHooks(current)) {
        continue;
      }
      const desiredHooks = mergeClaudeHookConfigs(
        hasPolicies ? claudeHooksConfig(composerPath) : {},
        signalsEnabled ? signalHooksConfig(resolveDrwnHookCommand()) : {},
      );
      const next = mergeClaudeSettingsText(current, state.activeServers, {
        force: state.scopedOptions.force ?? false,
        hooks: desiredHooks,
        ...(state.scopedOptions.writeScope === "machine" ? { mcpServerOwnership: "none" as const } : {}),
      });
      writeManagedFile(settingsPath, next.text, state.scopedOptions.dryRun, result);
      const hookFieldHashes = hashDesiredClaudeHookFields(desiredHooks);
      if (Object.keys(hookFieldHashes).length > 0) {
        result.managedPaths?.push({
          path: ".claude/settings.json",
          kind: "managed-fields",
          surface: "hook",
          target: "claude",
          fields: Object.keys(hookFieldHashes),
          fieldHashes: hookFieldHashes,
        });
      }
      continue;
    }

    if (!hasPolicies) {
      continue;
    }

    if (runtime === "codex") {
      const composerPath = join(outputDir, "composer.mjs");
      const beforeContent = readExistingContent(composerPath);
      if (!state.scopedOptions.dryRun) {
        await bundleHookComposer({ runtime, outputDir, policies });
      } else {
        result.changes.push(`write ${composerPath}`);
        result.managedPaths?.push(recordManagedContent(state, composerPath, "sha256-dry-run", "codex"));
      }
      if (!state.scopedOptions.dryRun) {
        recordComposer(result, state, composerPath, beforeContent, state.scopedOptions.dryRun, "codex");
      }

      const codexHooksPath = join(state.scopeRoot, ".codex", "hooks.json");
      const content = `${JSON.stringify(codexHooksConfig(composerPath), null, 2)}\n`;
      writeManagedFile(codexHooksPath, content, state.scopedOptions.dryRun, result);
      result.managedPaths?.push(recordManagedContent(state, codexHooksPath, hashManagedContent(content), "codex"));
      if (state.scopedOptions.writeScope === "project") {
        result.warnings.push(
          "Codex project-local hooks may require Codex /hooks review/trust before generated drwn hooks run.",
        );
      }
      continue;
    }

    if (runtime === "cursor") {
      const composerPath = join(outputDir, "composer.mjs");
      const beforeContent = readExistingContent(composerPath);

      const cursorHooksPath = join(state.scopeRoot, ".cursor", "hooks.json");
      const cursorHooksRelPath = managedPath(state, cursorHooksPath);
      const priorOwned = previousManagedPaths.some(
        (entry) => entry.kind === "managed-content" && entry.surface === "hook" && entry.target === "cursor" &&
          entry.path === cursorHooksRelPath,
      );
      if (existsSync(cursorHooksPath) && !priorOwned && !state.scopedOptions.force) {
        result.warnings.push(
          `Skipping cursor hooks: ${cursorHooksPath} exists and is not drwn-owned. Merge manually or rerun with --force.`,
        );
        continue;
      }

      if (!state.scopedOptions.dryRun) {
        await bundleHookComposer({ runtime, outputDir, policies });
      } else {
        result.changes.push(`write ${composerPath}`);
        result.managedPaths?.push(recordManagedContent(state, composerPath, "sha256-dry-run", "cursor"));
      }
      if (!state.scopedOptions.dryRun) {
        recordComposer(result, state, composerPath, beforeContent, state.scopedOptions.dryRun, "cursor");
      }

      const content = `${JSON.stringify(cursorHooksConfig(composerPath), null, 2)}\n`;
      writeManagedFile(cursorHooksPath, content, state.scopedOptions.dryRun, result);
      result.managedPaths?.push(recordManagedContent(state, cursorHooksPath, hashManagedContent(content), "cursor"));
      continue;
    }

    if (runtime === "opencode") {
      const composerPath = join(outputDir, "composer.mjs");
      const beforeContent = readExistingContent(composerPath);
      if (!state.scopedOptions.dryRun) {
        await bundleHookComposer({ runtime, outputDir, policies });
      } else {
        result.changes.push(`write ${composerPath}`);
        result.managedPaths?.push(recordManagedContent(state, composerPath, "sha256-dry-run", "opencode"));
      }
      if (!state.scopedOptions.dryRun) {
        recordComposer(result, state, composerPath, beforeContent, state.scopedOptions.dryRun, "opencode");
      }

      const pluginPath = state.scopedOptions.writeScope === "machine"
        ? join(state.scopeRoot, ".config", "opencode", "plugins", "drwn-hooks.js")
        : join(state.scopeRoot, ".opencode", "plugins", "drwn-hooks.js");
      const content = `// Generated by drwn; do not edit.\nexport { DrwnHooks } from ${JSON.stringify(composerPath)};\n`;
      writeManagedFile(pluginPath, content, state.scopedOptions.dryRun, result);
      result.managedPaths?.push(recordManagedContent(state, pluginPath, hashManagedContent(content), "opencode"));
      continue;
    }

    if (runtime === "mastra") {
      const composerPath = join(outputDir, "composer.ts");
      const beforeContent = readExistingContent(composerPath);
      if (!state.scopedOptions.dryRun) {
        await emitMastraComposer({ outputDir, policies });
      } else {
        result.changes.push(`write ${composerPath}`);
        result.managedPaths?.push(recordManagedContent(state, composerPath, "sha256-dry-run", "mastra"));
      }
      if (!state.scopedOptions.dryRun) {
        recordComposer(result, state, composerPath, beforeContent, state.scopedOptions.dryRun, "mastra");
      }
    }
  }

  return result;
}
