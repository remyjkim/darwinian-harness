// ABOUTME: Implements harness MCP filtering and target-specific rendering for all write surfaces.
// ABOUTME: Shared by drwn commands and the legacy sync-mcp compatibility wrapper.

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { classifyAmbientMcpCollision } from "./ambient-policy";
import { hasExplicitMcpDefaults } from "./defaults";
import {
  buildDrwnMetaBlock,
  canonicalJsonHash,
  detectManagedFieldDrift,
  hookEntryHash,
  hookEntryIdentity,
  readDrwnMetaBlock,
  type OwnedHookEntries,
} from "./managed-fields";
import type { CanonicalConfig, CanonicalRegistry, RegistryServer, TargetName } from "./types";

export interface ClaudeCommandHook {
  type: "command";
  command: string;
  args?: string[];
  timeout?: number;
  statusMessage?: string;
}

export interface ClaudeHookMatcher {
  matcher?: string;
  hooks: ClaudeCommandHook[];
}

export interface ClaudeHookGroup {
  matcher?: string;
  hooks: ClaudeCommandHook[];
}

export interface ClaudeHooksConfig {
  [event: string]: ClaudeHookGroup[] | undefined;
  UserPromptSubmit?: ClaudeHookGroup[];
  UserPromptExpansion?: ClaudeHookGroup[];
  PreToolUse?: ClaudeHookMatcher[];
  PostToolUse?: ClaudeHookMatcher[];
  PostToolUseFailure?: ClaudeHookMatcher[];
}

export function buildActiveServers(registry: CanonicalRegistry, config: CanonicalConfig) {
  if (hasExplicitMcpDefaults(config)) {
    const defaults = new Set(config.defaults?.mcpServers ?? []);
    return Object.fromEntries(
      Object.entries(registry.servers).filter(([name, server]) =>
        defaults.has(name) && server.transport !== "platform-provided"
      ),
    );
  }

  const parallelMcpEnabled = config.parallel?.mcp?.enabled === true;

  return Object.fromEntries(
    Object.entries(registry.servers).filter(([name, server]) => {
      if (server.transport === "platform-provided") {
        return false;
      }
      if ((name === "parallel-search" || name === "parallel-task") && !parallelMcpEnabled) {
        return false;
      }
      if (!server.optional) {
        return true;
      }

      return config.optional[name] === true;
    }),
  );
}

// Matches a value that is exactly an env-var reference, e.g. "${NOTION_TOKEN}".
const ENV_PASSTHROUGH = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

// Codex does not interpolate ${VAR} in config values. A whole-value passthrough is
// forwarded by name via env_vars (sourced from Codex's own environment); anything else
// is a literal value emitted into the server's env table.
function partitionCodexEnv(env: Record<string, string> | undefined) {
  const envVars: string[] = [];
  let literalEnv: Record<string, string> | undefined;
  for (const [key, value] of Object.entries(env ?? {})) {
    const passthroughName = value.match(ENV_PASSTHROUGH)?.[1];
    if (passthroughName) {
      envVars.push(passthroughName);
    } else {
      literalEnv ??= {};
      literalEnv[key] = value;
    }
  }
  return { envVars, literalEnv };
}

// Cursor expands ${env:NAME}, not bare ${NAME}. Rewrite every env-var reference accordingly.
function toCursorEnvValue(value: string) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "${env:$1}");
}

function toOpencodeEnvValue(value: string) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "{env:$1}");
}

// Matches an Authorization value of the exact form "Bearer ${VAR}", capturing VAR. Codex models
// bearer auth as an env-var name (bearer_token_env_var), not a literal header value.
const BEARER_PASSTHROUGH = /^Bearer\s+\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

function mapHeaderValues(headers: Record<string, string>, fn: (value: string) => string) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, fn(value)]));
}

// Codex does not interpolate ${VAR} in config values. An "Authorization: Bearer ${VAR}" header maps
// to bearer_token_env_var; literal headers go to http_headers; a non-bearer ${VAR} header cannot be
// expressed by Codex and is reported as unsupported rather than emitted as a broken literal.
function partitionCodexHeaders(headers: Record<string, string> | undefined) {
  let bearerTokenEnvVar: string | undefined;
  let httpHeaders: Record<string, string> | undefined;
  const unsupported: string[] = [];
  for (const [key, value] of Object.entries(headers ?? {})) {
    const bearerVar = key.toLowerCase() === "authorization" ? value.match(BEARER_PASSTHROUGH)?.[1] : undefined;
    if (bearerVar) {
      bearerTokenEnvVar = bearerVar;
    } else if (ENV_PASSTHROUGH.test(value)) {
      unsupported.push(key);
    } else {
      httpHeaders ??= {};
      httpHeaders[key] = value;
    }
  }
  return { bearerTokenEnvVar, httpHeaders, unsupported };
}

// Header keys an HTTP server declares that Codex cannot express (non-bearer ${VAR} headers, which
// Codex does not interpolate). Empty for stdio servers, header-less servers, and bearer/literal headers.
export function codexUnsupportedHeaderKeys(server: RegistryServer): string[] {
  if (server.transport === "stdio") {
    return [];
  }
  return partitionCodexHeaders(server.headers).unsupported;
}

function toJsonServerConfig(server: RegistryServer) {
  if (server.transport === "stdio") {
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env ? { env: server.env } : {}),
    };
  }

  return {
    type: server.transport,
    url: server.url,
    ...(server.headers ? { headers: server.headers } : {}),
  };
}

function toCursorServerConfig(server: RegistryServer) {
  if (server.transport === "stdio") {
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env
        ? {
            env: Object.fromEntries(
              Object.entries(server.env).map(([key, value]) => [key, toCursorEnvValue(value)]),
            ),
          }
        : {}),
    };
  }

  return {
    type: server.transport,
    url: server.url,
    ...(server.headers ? { headers: mapHeaderValues(server.headers, toCursorEnvValue) } : {}),
  };
}

function toOpencodeServerConfig(server: RegistryServer) {
  const timeout = (server.startupTimeoutSec ?? 30) * 1000;
  if (server.transport === "stdio") {
    return {
      type: "local",
      command: [server.command, ...(server.args ?? [])],
      enabled: true,
      ...(server.env
        ? {
            environment: Object.fromEntries(
              Object.entries(server.env).map(([key, value]) => [key, toOpencodeEnvValue(value)]),
            ),
          }
        : {}),
      timeout,
    };
  }

  return {
    type: "remote",
    url: server.url,
    enabled: true,
    ...(server.headers ? { headers: mapHeaderValues(server.headers, toOpencodeEnvValue) } : {}),
    timeout,
  };
}

function toCodexServerConfig(server: RegistryServer) {
  if (server.transport === "stdio") {
    const { envVars, literalEnv } = partitionCodexEnv(server.env);
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      startup_timeout_sec: server.startupTimeoutSec ?? 30,
      ...(envVars.length > 0 ? { env_vars: envVars } : {}),
      ...(literalEnv ? { env: literalEnv } : {}),
    };
  }

  const { bearerTokenEnvVar, httpHeaders } = partitionCodexHeaders(server.headers);
  return {
    url: server.url,
    enabled: true,
    ...(bearerTokenEnvVar ? { bearer_token_env_var: bearerTokenEnvVar } : {}),
    ...(httpHeaders ? { http_headers: httpHeaders } : {}),
  };
}

export function renderMcpServerForTarget(target: TargetName, server: RegistryServer): Record<string, unknown> {
  if (target === "codex") return toCodexServerConfig(server);
  if (target === "cursor") return toCursorServerConfig(server);
  if (target === "opencode") return toOpencodeServerConfig(server);
  return toJsonServerConfig(server);
}

export function renderJsonMcpConfig(servers: Record<string, RegistryServer>) {
  const mcpServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
  );

  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

export function renderCursorConfig(servers: Record<string, RegistryServer>) {
  const mcpServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toCursorServerConfig(server)]),
  );

  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

export const CLAUDE_MCP_SERVER_HASH_PREFIX = "mcpServers:";
export const CLAUDE_HOOK_FIELD_PREFIX = "hooks:";

export function mcpServerHashKey(name: string) {
  return `${CLAUDE_MCP_SERVER_HASH_PREFIX}${name}`;
}

export function ownedMcpServerNames(fieldHashes: Record<string, string>) {
  return Object.keys(fieldHashes)
    .filter((key) => key.startsWith(CLAUDE_MCP_SERVER_HASH_PREFIX))
    .map((key) => key.slice(CLAUDE_MCP_SERVER_HASH_PREFIX.length));
}

function hookFieldKey(event: string, id: string) {
  return `${CLAUDE_HOOK_FIELD_PREFIX}${event}:${id}`;
}

function parseHookFieldKey(field: string) {
  if (!field.startsWith(CLAUDE_HOOK_FIELD_PREFIX)) return null;
  const payload = field.slice(CLAUDE_HOOK_FIELD_PREFIX.length);
  const separator = payload.indexOf(":");
  if (separator < 1) return null;
  return { event: payload.slice(0, separator), id: payload.slice(separator + 1) };
}

function hookOwnershipHash(entryHash: string, recordedHash: string | undefined) {
  return canonicalJsonHash({ entryHash, recordedHash: recordedHash ?? null });
}

export function hashDesiredClaudeHookFields(
  hooks: ClaudeHooksConfig,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(hooks).flatMap(([event, entries]) =>
      (entries ?? []).map((entry) => {
        const id = hookEntryIdentity(event, entry);
        const entryHash = hookEntryHash(entry);
        return [hookFieldKey(event, id), hookOwnershipHash(entryHash, entryHash)];
      }),
    ),
  );
}

function readClaudeMcpServers(parsed: Record<string, unknown>) {
  return (
    parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)
      ? parsed.mcpServers
      : {}
  ) as Record<string, unknown>;
}

export function hashClaudeManagedServers(currentText: string, names: string[]): Record<string, string> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(currentText) as Record<string, unknown>;
  } catch {
    return {};
  }
  const servers = readClaudeMcpServers(parsed);
  return Object.fromEntries(
    names.map((name) => {
      const value = servers[name];
      return [mcpServerHashKey(name), value === undefined ? "absent" : canonicalJsonHash(value)];
    }),
  );
}

export interface MergeClaudeSettingsOptions {
  force?: boolean;
  hooks?: ClaudeHooksConfig;
  inlineMeta?: boolean;
  mcpServerOwnership?: "field" | "per-server" | "none";
  priorFieldHashes?: Record<string, string>;
  preserveRemovedOwnedServers?: boolean;
}

export interface MergeClaudeSettingsResult {
  text: string;
  fieldHashes: Record<string, string>;
}

function readClaudeHooks(parsed: Record<string, unknown>) {
  return (
    parsed.hooks && typeof parsed.hooks === "object" && !Array.isArray(parsed.hooks)
      ? parsed.hooks
      : undefined
  ) as Record<string, ClaudeHookGroup[]> | undefined;
}

export function hashClaudeHookFields(
  currentText: string,
  fields: string[],
): Record<string, string> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(currentText) as Record<string, unknown>;
  } catch {
    return {};
  }
  const hooks = readClaudeHooks(parsed) ?? {};
  const owned = readDrwnMetaBlock(parsed)?.ownedHooks ?? {};
  return Object.fromEntries(
    fields.map((field) => {
      const key = parseHookFieldKey(field);
      if (!key) return [field, "absent"];
      const entry = (hooks[key.event] ?? []).find(
        (candidate) => hookEntryIdentity(key.event, candidate) === key.id,
      );
      if (!entry) return [field, "absent"];
      const entryHash = hookEntryHash(entry);
      return [
        field,
        hookOwnershipHash(entryHash, owned[key.event]?.[key.id]),
      ];
    }),
  );
}

export function removeOwnedClaudeHookFields(currentText: string, fields: string[]): string {
  const parsed = JSON.parse(currentText) as Record<string, unknown>;
  const meta = readDrwnMetaBlock(parsed);
  if (!meta?.ownedHooks) return currentText;

  const hooks = Object.fromEntries(
    Object.entries(readClaudeHooks(parsed) ?? {}).map(([event, entries]) => [event, [...entries]]),
  );
  const owned: OwnedHookEntries = Object.fromEntries(
    Object.entries(meta.ownedHooks).map(([event, entries]) => [event, { ...entries }]),
  );
  let changed = false;

  for (const field of fields) {
    const key = parseHookFieldKey(field);
    if (!key) continue;
    const recordedHash = owned[key.event]?.[key.id];
    if (!recordedHash) continue;
    const entries = hooks[key.event] ?? [];
    const index = entries.findIndex((entry) => hookEntryIdentity(key.event, entry) === key.id);
    if (index < 0 || hookEntryHash(entries[index]) !== recordedHash) {
      throw new Error(`Drift detected in drwn-owned Claude hook entry: ${key.event}/${key.id}`);
    }
    entries.splice(index, 1);
    delete owned[key.event]![key.id];
    if (entries.length === 0) delete hooks[key.event];
    if (Object.keys(owned[key.event]!).length === 0) delete owned[key.event];
    changed = true;
  }

  if (!changed) return currentText;
  if (Object.keys(hooks).length > 0) parsed.hooks = hooks;
  else delete parsed.hooks;

  const { ownedHooks: _previousOwnedHooks, ...retainedMeta } = meta;
  if ((retainedMeta.managedKeys?.length ?? 0) > 0 || Object.keys(owned).length > 0) {
    parsed._drwn = {
      ...retainedMeta,
      ...(Object.keys(owned).length > 0 ? { ownedHooks: owned } : {}),
      lastWriteAt: new Date().toISOString(),
    };
  } else {
    delete parsed._drwn;
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function mergeOwnedHooks(
  currentHooks: Record<string, ClaudeHookGroup[]> | undefined,
  recordedOwned: OwnedHookEntries,
  desired: ClaudeHooksConfig,
): { hooks: Record<string, ClaudeHookGroup[]> | undefined; owned: OwnedHookEntries; drift: string[] } {
  const events = new Set([...Object.keys(currentHooks ?? {}), ...Object.keys(recordedOwned), ...Object.keys(desired)]);
  const nextHooks: Record<string, ClaudeHookGroup[]> = {};
  const nextOwned: OwnedHookEntries = {};
  const drift: string[] = [];

  for (const event of events) {
    const recorded = recordedOwned[event] ?? {};
    const present = currentHooks?.[event] ?? [];
    const desiredEntries = desired[event] ?? [];
    const desiredIds = new Set(desiredEntries.map((entry) => hookEntryIdentity(event, entry)));
    const presentOwnedIds = new Set<string>();
    const foreign: ClaudeHookGroup[] = [];

    for (const entry of present) {
      const id = hookEntryIdentity(event, entry);
      if (!(id in recorded)) {
        foreign.push(entry);
        continue;
      }
      presentOwnedIds.add(id);
      if (hookEntryHash(entry) !== recorded[id]) {
        drift.push(`${event}/${id}`);
      }
    }

    for (const id of desiredIds) {
      if (id in recorded && !presentOwnedIds.has(id)) {
        drift.push(`${event}/${id}`);
      }
    }

    const merged = [...foreign, ...desiredEntries];
    if (merged.length > 0) {
      nextHooks[event] = merged;
    }
    if (desiredEntries.length > 0) {
      nextOwned[event] = Object.fromEntries(
        desiredEntries.map((entry) => [hookEntryIdentity(event, entry), hookEntryHash(entry)]),
      );
    }
  }

  return {
    hooks: Object.keys(nextHooks).length > 0 ? nextHooks : undefined,
    owned: nextOwned,
    drift,
  };
}

function sameHookOwnership(a: OwnedHookEntries | undefined, b: OwnedHookEntries | undefined) {
  return canonicalJsonHash(a ?? {}) === canonicalJsonHash(b ?? {});
}

export function mergeClaudeSettingsText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  options: MergeClaudeSettingsOptions = {},
): MergeClaudeSettingsResult {
  const inlineMeta = options.inlineMeta ?? true;
  const mcpServerOwnership = options.mcpServerOwnership ?? "field";
  const parsed = JSON.parse(currentText) as Record<string, unknown>;
  const meta = inlineMeta ? readDrwnMetaBlock(parsed) : null;
  const recordedHashes = inlineMeta ? (meta?.fieldHashes ?? {}) : (options.priorFieldHashes ?? {});
  const managesMcp = mcpServerOwnership !== "none";
  const shouldManageHooks = options.hooks !== undefined;
  const managedKeys = [...(managesMcp ? ["mcpServers"] : [])];
  const fieldHashes: Record<string, string> = {};

  if (mcpServerOwnership === "per-server") {
    const currentServers = readClaudeMcpServers(parsed);
    const desiredServers = Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
    );

    const driftedServers = options.force
      ? []
      : ownedMcpServerNames(recordedHashes).filter((name) => {
          if (!(name in desiredServers)) {
            return false;
          }
          const priorHash = recordedHashes[mcpServerHashKey(name)];
          const currentValue = currentServers[name];
          if (currentValue === undefined) return true;
          return Boolean(priorHash && canonicalJsonHash(currentValue) !== priorHash);
        });
    if (driftedServers.length > 0) {
      throw new Error(
        `Drift detected in Claude settings managed MCP server(s): ${driftedServers.join(", ")}. Rerun drwn write --root --force to overwrite.`,
      );
    }

    if (!options.preserveRemovedOwnedServers) {
      for (const name of ownedMcpServerNames(recordedHashes)) {
        if (name in desiredServers) continue;
        const priorHash = recordedHashes[mcpServerHashKey(name)];
        const currentValue = currentServers[name];
        if (currentValue !== undefined && priorHash && canonicalJsonHash(currentValue) === priorHash) {
          delete currentServers[name];
        }
      }
    }
    for (const [name, value] of Object.entries(desiredServers)) {
      currentServers[name] = value;
      fieldHashes[mcpServerHashKey(name)] = canonicalJsonHash(value);
    }
    parsed.mcpServers = currentServers;
  } else if (mcpServerOwnership === "field") {
    const driftedKeys = options.force ? [] : detectManagedFieldDrift(parsed, managedKeys, recordedHashes);
    if (driftedKeys.length > 0) {
      throw new Error(
        `Drift detected in Claude settings managed field(s): ${driftedKeys.join(", ")}. Move your change into .agents/drwn/config.json or rerun drwn write --force to overwrite.`,
      );
    }

    parsed.mcpServers = Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
    );
  }

  let ownedHooks = meta?.ownedHooks;
  if (shouldManageHooks) {
    const mergedHooks = mergeOwnedHooks(readClaudeHooks(parsed), meta?.ownedHooks ?? {}, options.hooks ?? {});
    if (mergedHooks.drift.length > 0 && !options.force) {
      throw new Error(
        `Drift detected in drwn-owned Claude hook entries: ${mergedHooks.drift.join(", ")}. Move your change into .agents/drwn/config.json or rerun drwn write --force to overwrite.`,
      );
    }
    if (mergedHooks.hooks) {
      parsed.hooks = mergedHooks.hooks;
    } else {
      delete parsed.hooks;
    }
    ownedHooks = Object.keys(mergedHooks.owned).length > 0 ? mergedHooks.owned : undefined;
  }

  const nextValues: Record<string, unknown> = {};
  if (managesMcp) {
    nextValues.mcpServers = parsed.mcpServers;
  }

  if (mcpServerOwnership === "field") {
    for (const key of managedKeys) {
      fieldHashes[key] = canonicalJsonHash(nextValues[key]);
    }
  }

  if (inlineMeta) {
    const nextMeta = buildDrwnMetaBlock(managedKeys, nextValues, ownedHooks);
    const hashesUnchanged = managedKeys.every((key) => meta?.fieldHashes?.[key] === nextMeta.fieldHashes?.[key]);
    const hookOwnershipUnchanged = sameHookOwnership(meta?.ownedHooks, nextMeta.ownedHooks);
    if (meta && hashesUnchanged && hookOwnershipUnchanged) {
      nextMeta.lastWriteAt = meta.lastWriteAt;
    }
    if ((nextMeta.managedKeys?.length ?? 0) > 0 || nextMeta.ownedHooks) {
      parsed._drwn = nextMeta;
    } else {
      delete parsed._drwn;
    }
  } else {
    delete parsed._drwn;
  }

  return { text: `${JSON.stringify(parsed, null, 2)}\n`, fieldHashes };
}

export function mergeCursorConfigText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  options: {
    force?: boolean;
    priorFieldHashes?: Record<string, string>;
    preserveRemovedOwnedServers?: boolean;
  } = {},
): MergeClaudeSettingsResult {
  const parsed = JSON.parse(currentText) as Record<string, unknown>;
  const currentServers = readClaudeMcpServers(parsed);
  const desiredServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toCursorServerConfig(server)]),
  );
  const recordedHashes = options.priorFieldHashes ?? {};
  const driftedServers = options.force
    ? []
    : ownedMcpServerNames(recordedHashes).filter((name) => {
        if (!(name in desiredServers)) return false;
        const priorHash = recordedHashes[mcpServerHashKey(name)];
        const currentValue = currentServers[name];
        return currentValue === undefined || Boolean(priorHash && canonicalJsonHash(currentValue) !== priorHash);
      });
  if (driftedServers.length > 0) {
    throw new Error(
      `Drift detected in Cursor managed MCP server(s): ${driftedServers.join(", ")}. Rerun drwn write --root --force to overwrite.`,
    );
  }

  if (!options.preserveRemovedOwnedServers) {
    for (const name of ownedMcpServerNames(recordedHashes)) {
      if (name in desiredServers) continue;
      const priorHash = recordedHashes[mcpServerHashKey(name)];
      const currentValue = currentServers[name];
      if (currentValue !== undefined && priorHash && canonicalJsonHash(currentValue) === priorHash) {
        delete currentServers[name];
      }
    }
  }
  const fieldHashes: Record<string, string> = {};
  for (const [name, value] of Object.entries(desiredServers)) {
    currentServers[name] = value;
    fieldHashes[mcpServerHashKey(name)] = canonicalJsonHash(value);
  }
  parsed.mcpServers = currentServers;
  delete parsed._drwn;
  return { text: `${JSON.stringify(parsed, null, 2)}\n`, fieldHashes };
}

// Merges managed servers into opencode.json under the `mcp` key. Every other key in the
// file is user-owned configuration and passes through untouched.
export function mergeOpencodeConfigText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  options: {
    force?: boolean;
    priorFieldHashes?: Record<string, string>;
    preserveRemovedOwnedServers?: boolean;
  } = {},
): MergeClaudeSettingsResult {
  const parsed = JSON.parse(currentText) as Record<string, unknown>;
  const currentServers = (
    parsed.mcp && typeof parsed.mcp === "object" && !Array.isArray(parsed.mcp) ? parsed.mcp : {}
  ) as Record<string, unknown>;
  const desiredServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toOpencodeServerConfig(server)]),
  );
  const recordedHashes = options.priorFieldHashes ?? {};
  const driftedServers = options.force
    ? []
    : ownedMcpServerNames(recordedHashes).filter((name) => {
        if (!(name in desiredServers)) return false;
        const priorHash = recordedHashes[mcpServerHashKey(name)];
        const currentValue = currentServers[name];
        return currentValue === undefined || Boolean(priorHash && canonicalJsonHash(currentValue) !== priorHash);
      });
  if (driftedServers.length > 0) {
    throw new Error(
      `Drift detected in OpenCode managed MCP server(s): ${driftedServers.join(", ")}. Rerun drwn write --root --force to overwrite.`,
    );
  }

  if (!options.preserveRemovedOwnedServers) {
    for (const name of ownedMcpServerNames(recordedHashes)) {
      if (name in desiredServers) continue;
      const priorHash = recordedHashes[mcpServerHashKey(name)];
      const currentValue = currentServers[name];
      if (currentValue !== undefined && priorHash && canonicalJsonHash(currentValue) === priorHash) {
        delete currentServers[name];
      }
    }
  }
  const fieldHashes: Record<string, string> = {};
  for (const [name, value] of Object.entries(desiredServers)) {
    currentServers[name] = value;
    fieldHashes[mcpServerHashKey(name)] = canonicalJsonHash(value);
  }
  parsed.mcp = currentServers;
  return { text: `${JSON.stringify(parsed, null, 2)}\n`, fieldHashes };
}

// Strips only the [mcp_servers.<name>] tables (and their subtables) for the given server
// names, leaving non-MCP sections and user-authored servers untouched.
function stripCodexServerSections(currentText: string, names: Iterable<string>) {
  const managed = new Set(names);
  const lines = currentText.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const match = line.trim().match(/^\[([^\]]+)\]$/);
    if (match) {
      const sectionName = match[1] ?? "";
      const serverName = sectionName.startsWith("mcp_servers.")
        ? sectionName.slice("mcp_servers.".length).split(".")[0]
        : undefined;
      skipping = serverName !== undefined && managed.has(serverName);
      if (!skipping) {
        kept.push(line);
      }
      continue;
    }

    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function mergeCodexTomlText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  previousManagedNames: string[] = [],
) {
  parseToml(currentText);

  const namesToStrip = new Set([...previousManagedNames, ...Object.keys(servers)]);
  const stripped = stripCodexServerSections(currentText, namesToStrip);
  const mcpBlock = stringifyToml({
    mcp_servers: Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toCodexServerConfig(server)]),
    ),
  }).trimEnd();

  const hasManaged = Object.keys(servers).length > 0;
  const merged = stripped.length > 0
    ? hasManaged
      ? `${stripped}\n\n${mcpBlock}\n`
      : `${stripped}\n`
    : `${mcpBlock}\n`;
  parseToml(merged);

  return merged;
}

// Hashes each managed Codex server's effective value as written, so drift on a drwn-owned
// server can be detected later without flagging user-authored servers.
export function hashCodexManagedServers(mergedText: string, names: string[]): Record<string, string> {
  let parsed: { mcp_servers?: Record<string, unknown> };
  try {
    parsed = parseToml(mergedText) as { mcp_servers?: Record<string, unknown> };
  } catch {
    return {};
  }
  const servers = parsed.mcp_servers ?? {};
  return Object.fromEntries(
    names.map((name) => {
      const value = servers[name];
      return [name, value === undefined ? "absent" : canonicalJsonHash(value)];
    }),
  );
}

// Compatibility helper retained for callers that need only fatal Codex IDs. The target-native
// classifier remains the sole authority for field-merge and transport semantics.
export function detectCodexLayerConflicts(
  globalText: string,
  servers: Record<string, RegistryServer>,
): string[] {
  if (!globalText.trim()) {
    return [];
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(globalText) as Record<string, unknown>;
  } catch {
    return [];
  }

  const globalServers = (parsed.mcp_servers ?? {}) as Record<string, unknown>;
  const conflicts: string[] = [];
  for (const [name, server] of Object.entries(servers)) {
    const globalEntry = globalServers[name];
    if (!globalEntry) {
      continue;
    }
    const classified = classifyAmbientMcpCollision({
      declared: {
        target: "codex",
        id: name,
        source: "project",
        path: ".codex/config.toml",
        value: toCodexServerConfig(server),
      },
      ambient: {
        target: "codex",
        id: name,
        source: "user",
        path: "~/.codex/config.toml",
        value: globalEntry,
      },
    });
    if (classified?.reasonCode === "CODEX_INCOMPATIBLE_TRANSPORTS") {
      conflicts.push(name);
    }
  }
  return conflicts;
}
