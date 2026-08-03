// ABOUTME: Defines the shared domain types used by the drwn harness CLI core and compatibility wrapper.
// ABOUTME: Centralizes registry, config, target, and sync result types to avoid drift.

import type { OptionalMcpReport } from "./mcp-report";

export type Transport = "stdio" | "http" | "sse" | "platform-provided";
export type TargetName = "claude" | "codex" | "cursor" | "opencode";

export interface RegistryServer {
  description: string;
  transport: Transport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  provider?: string;
  capabilities?: string[];
  notes?: string;
  optional: boolean;
  startupTimeoutSec?: number;
}

export interface CanonicalRegistry {
  version: number;
  servers: Record<string, RegistryServer>;
}

export interface UserMcpLibrary {
  version: number;
  servers: Record<string, RegistryServer>;
}

export interface TargetConfig {
  enabled: boolean;
  configPath: string;
  userMcpPath?: string;
  format: "json-merge" | "toml-merge" | "json-standalone";
  mcpKey: string;
}

export interface TrustedSourcesPolicy {
  strict?: boolean;
  gitHosts?: string[];
  gitOwners?: string[];
  catalogScopes?: string[];
  refs?: string[];
}

export interface CanonicalConfig {
  version: number;
  targets: Record<TargetName, TargetConfig>;
  defaults?: {
    skills?: string[];
    mcpServers?: string[];
    extensions?: Record<string, ProjectExtensionConfig>;
    communityCatalogUrl?: string | null;
  };
  catalogs?: {
    npmSkills?: {
      enabled: boolean;
      searchLimit?: number;
    };
    mcp?: {
      enabled: boolean;
      sources?: Array<
        | { type: "file"; path: string }
        | { type: "url"; url: string }
      >;
    };
  };
  parallel?: {
    cli?: {
      enabled: boolean;
    };
    mcp?: {
      enabled: boolean;
    };
  };
  analyzer?: {
    apiUrl?: string;
    clientId?: string;
    webBaseUrl?: string;
    maxArchiveBytes?: number;
  };
  trustedSources?: TrustedSourcesPolicy;
  optional: Record<string, boolean>;
}

export interface StoreMetadata {
  schemaVersion: 1;
  initAt: string;
}

export interface MachineProfilePin {
  id: "darwinian-operator";
  source: "git+https://github.com/curation-labs/darwinian-operator.git#v2.0.0";
  name: "@darwinian/operator";
  version: "2.0.0";
  commit: string;
  treeSha: string;
  integrity: `sha256-${string}`;
  skills: string[];
  mcpServers: string[];
}

export interface MachineConfig {
  schema: "drwn.machine";
  schemaVersion: 1;
  policy: {
    authoring?: { scope?: string };
    targets?: Partial<Record<TargetName, Partial<TargetConfig>>>;
    catalogs?: CanonicalConfig["catalogs"];
    analyzer?: CanonicalConfig["analyzer"];
    trustedSources?: TrustedSourcesPolicy;
  };
  capabilities: {
    profile: MachineProfilePin | null;
    skills: string[];
    mcpServers: string[];
  };
}

export type ServerOverride =
  | { enabled: boolean }
  | RegistryServer;

export type ProjectExtensionConfig = {
  enabled?: boolean;
  skills?: boolean;
  mcp?: boolean;
  targets?: string[];
  includeSkill?: boolean;
  [key: string]: unknown;
};

export interface ProjectConfig {
  schema: "drwn.project-config";
  schemaVersion: 1;
  workers: string[];
  activeWorker: string | null;
  materialization?: "vendored" | "linked";
  committedSurfaces?: boolean;
  mcpServers?: Record<string, ServerOverride>;
  skills?: {
    include?: string[];
    exclude?: string[];
  };
  hooks?: {
    exclude?: string[];
    runtimes?: {
      "claude-code"?: { enabled: boolean };
      codex?: { enabled: boolean };
      cursor?: { enabled: boolean };
      opencode?: { enabled: boolean };
      mastra?: { enabled: boolean };
    };
    signals?: {
      enabled?: boolean;
    };
  };
  extensions?: Record<string, ProjectExtensionConfig>;
  targets?: Partial<Record<TargetName, { enabled: boolean }>>;
  trustedSources?: TrustedSourcesPolicy;
}

export type SkillSourceType = "repo" | "npm";

export interface BundleSkillEntry {
  name: string;
  scope: "shared" | "claude-only" | "codex-only" | "experimental";
  path: string;
}

export interface BundleManifest {
  schemaVersion: number;
  bundleName: string;
  version: string;
  displayName?: string;
  description?: string;
  skills: BundleSkillEntry[];
}

export interface InstalledSkillBundle {
  packageName: string;
  activeVersion: string;
  packageRoot: string;
  versionRoot: string;
  manifest: BundleManifest;
}

export interface SyncOptions {
  repoRoot?: string;
  agentsDir?: string;
  homeDir?: string;
  cwd?: string;
  dryRun?: boolean;
  mcpOnly?: boolean;
  skillsOnly?: boolean;
  target?: TargetName;
  force?: boolean;
  strictHooks?: boolean;
  strict?: boolean;
  applyClaudeAdapter?: boolean;
  forceMachineScope?: boolean;
  scope?: "machine" | "project";
}

export interface CardModeReadout {
  mode: string;
  reason: string;
  lane: string;
  sourcePath?: string;
}

export interface SyncResult {
  changes: string[];
  warnings: string[];
  ambientCollisions?: import("./ambient-policy").AmbientCollision[];
  cardModes?: Record<string, CardModeReadout>;
  managedPaths?: import("./write-record").ManagedPath[];
  optionalMcpReport?: OptionalMcpReport | null;
}

export interface NormalizedSyncOptions {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  cwd?: string;
  toolRoot?: string;
  writeScope?: "machine" | "project";
  generatedDir?: string;
  dryRun: boolean;
  mcpOnly: boolean;
  skillsOnly: boolean;
  target?: TargetName;
  force?: boolean;
  strictHooks?: boolean;
  strict?: boolean;
  applyClaudeAdapter?: boolean;
  forceMachineScope?: boolean;
  scope?: "machine" | "project";
}
