// ABOUTME: Defines and validates Card manifests.
// ABOUTME: Keeps authoring and consumer commands aligned on schema rules.

import type { ProjectExtensionConfig, ServerOverride, TargetName } from "./types";
import { isTargetName } from "./targets";
import { isStrictSemver, validRange } from "./semver-utils";
import { isSafePathPart } from "./store-paths";
import { DrwnError } from "./errors";
import { parseUpstreamRef } from "./git-ref";

export type MindContentVisibility = "private" | "internal" | "public";
export type MemoryKind = "observations" | "insights";

export interface MindContentManifest {
  include?: string[];
  visibility?: MindContentVisibility;
  exclude?: string[];
  shared?: string[];
}

export type PersonaManifest = MindContentManifest;
export type BeliefsManifest = MindContentManifest;

export interface MemoryManifest {
  observations?: { format: "jsonl" };
  insights?: { format: "md" };
}

export const MEMORY_KINDS: readonly MemoryKind[] = ["observations", "insights"];

export interface CardManifest {
  $schema?: string;
  name: string;
  version: string;
  kind?: "card" | "blueprint";
  composedFrom?: string[];
  tools?: { allow?: string[]; deny?: string[] };
  evals?: string[];
  contextMounts?: { read?: string[]; writeProposals?: string[] };
  identity?: Record<string, unknown>;
  instructions?: { text?: string; path?: string };
  description?: string;
  license?: string;
  harness?: { minVersion?: string };
  bundles?: Record<string, string>;
  skills?: { include?: string[]; exclude?: string[]; shared?: string[]; upstream?: Record<string, string> };
  hooks?: { include?: string[]; exclude?: string[]; shared?: string[] };
  persona?: PersonaManifest;
  beliefs?: BeliefsManifest;
  memory?: MemoryManifest;
  servers?: Record<string, ServerOverride>;
  extensions?: Record<string, ProjectExtensionConfig>;
  targets?: Partial<Record<TargetName, { enabled: boolean }>>;
  stability?: "experimental" | "stable" | "production";
  lastValidatedWith?: string;
  testStatusBadge?: string;
}

export interface CardManifestValidationResult {
  ok: boolean;
  errors: string[];
}

export function isCardScopeName(name: string) {
  return /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(name);
}

export function isCardUnscopedName(name: string) {
  return /^[a-z0-9-]+$/.test(name);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0);
}

function isSafeRelativeManifestPath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !normalized.split("/").includes("..")
  );
}

function validateInstructionsField(input: Record<string, unknown>, errors: string[]) {
  if (input.instructions === undefined) {
    return;
  }
  if (!isObject(input.instructions)) {
    errors.push("instructions must be an object");
    return;
  }
  const instructions = input.instructions;
  const hasText = instructions.text !== undefined;
  const hasPath = instructions.path !== undefined;
  if (hasText === hasPath) {
    errors.push("instructions must specify exactly one of text or path");
    return;
  }
  if (hasText) {
    if (typeof instructions.text !== "string" || instructions.text.trim().length === 0) {
      errors.push("instructions.text must be a non-empty string");
    }
    return;
  }
  if (typeof instructions.path !== "string" || !isSafeRelativeManifestPath(instructions.path)) {
    errors.push("instructions.path must be a relative path inside the card content root");
  }
}

// Governance fields are forward-declared: shape-validated here, enforced by the deployment runtime, not the CLI.
function validateBlueprintFields(input: Record<string, unknown>, isBlueprint: boolean, errors: string[]) {
  const blueprintOnly = ["composedFrom", "tools", "evals", "contextMounts", "identity"] as const;
  // permissions and escalation were retired (I220): no shape, no consumer. Authoring rejects
  // them; consume paths never run this validator, so published history stays installable.
  for (const retired of ["permissions", "escalation"] as const) {
    if (input[retired] !== undefined) {
      errors.push(`${retired} was retired (I220); remove it from card.json`);
    }
  }
  for (const field of blueprintOnly) {
    if (input[field] !== undefined && !isBlueprint) {
      errors.push(`${field} requires kind: "blueprint"`);
    }
  }
  if (input.composedFrom !== undefined && !isNonEmptyStringArray(input.composedFrom)) {
    errors.push("composedFrom must be an array of non-empty card refs");
  }
  if (input.tools !== undefined) {
    const tools = input.tools;
    if (!isObject(tools)) {
      errors.push("tools must be an object");
    } else {
      if (tools.allow !== undefined && !isStringArray(tools.allow)) errors.push("tools.allow must be an array of strings");
      if (tools.deny !== undefined && !isStringArray(tools.deny)) errors.push("tools.deny must be an array of strings");
    }
  }
  if (input.evals !== undefined && !isStringArray(input.evals)) {
    errors.push("evals must be an array of strings");
  }
  if (input.contextMounts !== undefined) {
    const mounts = input.contextMounts;
    if (!isObject(mounts)) {
      errors.push("contextMounts must be an object");
    } else {
      if (mounts.read !== undefined && !isStringArray(mounts.read)) errors.push("contextMounts.read must be an array of strings");
      if (mounts.writeProposals !== undefined && !isStringArray(mounts.writeProposals)) {
        errors.push("contextMounts.writeProposals must be an array of strings");
      }
    }
  }
  if (input.identity !== undefined && !isObject(input.identity)) {
    errors.push("identity must be an object");
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateMindContentSection(
  label: string,
  input: unknown,
  errors: string[],
) {
  if (input === undefined) {
    return;
  }
  if (!isObject(input)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (input.exclude !== undefined) {
    errors.push(`${label}.exclude is not allowed in card manifests`);
  }
  if (input.shared !== undefined) {
    errors.push(`${label}.shared is not allowed in card manifests`);
  }
  const include = input.include;
  if (include !== undefined && !Array.isArray(include)) {
    errors.push(`${label}.include must be an array`);
  }
  if (Array.isArray(include)) {
    for (const entry of include) {
      if (typeof entry !== "string" || !isSafePathPart(entry)) {
        errors.push(`${label}.include contains invalid entry: ${String(entry)}`);
      }
    }
    if (include.length > 0 && input.visibility === undefined) {
      errors.push(`${label}.visibility is required when include is non-empty`);
    }
  }
  if (
    input.visibility !== undefined &&
    (typeof input.visibility !== "string" || !["private", "internal", "public"].includes(input.visibility))
  ) {
    errors.push(`${label}.visibility must be private, internal, or public`);
  }
  if (input.format !== undefined) {
    errors.push(`${label}.format is not allowed in card manifests`);
  }
}

function validateMemorySection(input: unknown, errors: string[]) {
  if (input === undefined) {
    return;
  }
  if (!isObject(input)) {
    errors.push("memory must be an object");
    return;
  }
  for (const [kind, section] of Object.entries(input)) {
    if (kind === "raw_data") {
      errors.push("memory kind raw_data is reserved but unsupported");
      continue;
    }
    if (!(MEMORY_KINDS as readonly string[]).includes(kind)) {
      errors.push(`unsupported memory kind: ${kind}`);
      continue;
    }
    if (!isObject(section)) {
      errors.push(`memory.${kind} must be an object`);
      continue;
    }
    for (const field of Object.keys(section)) {
      if (field !== "format") {
        errors.push(`memory.${kind}.${field} is not allowed`);
      }
    }
    const requiredFormat = kind === "observations" ? "jsonl" : "md";
    if (section.format !== requiredFormat) {
      errors.push(`memory.${kind}.format is required and must be ${requiredFormat}`);
    }
  }
}

export function validateCardManifest(input: unknown): CardManifestValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const manifest = input as Partial<CardManifest>;
  if (!manifest.name || typeof manifest.name !== "string") {
    errors.push("name is required");
  } else if (!isCardScopeName(manifest.name) && !isCardUnscopedName(manifest.name)) {
    errors.push("name must be @scope/name or name");
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    errors.push("version is required");
  } else if (!isStrictSemver(manifest.version)) {
    errors.push("version must be strict semver");
  }
  if (manifest.harness?.minVersion && !isStrictSemver(manifest.harness.minVersion)) {
    errors.push("harness.minVersion must be strict semver");
  }
  if (
    manifest.stability !== undefined &&
    (typeof manifest.stability !== "string" || !["experimental", "stable", "production"].includes(manifest.stability))
  ) {
    errors.push("stability must be experimental, stable, or production");
  }
  if (manifest.lastValidatedWith !== undefined) {
    if (typeof manifest.lastValidatedWith !== "string" || !isStrictSemver(manifest.lastValidatedWith)) {
      errors.push("lastValidatedWith must be strict semver");
    }
  }
  if (manifest.testStatusBadge !== undefined) {
    if (typeof manifest.testStatusBadge !== "string" || !isHttpUrl(manifest.testStatusBadge)) {
      errors.push("testStatusBadge must be an http(s) URL");
    }
  }
  if (manifest.skills?.exclude) {
    errors.push("skills.exclude is not allowed in card manifests");
  }
  if (manifest.skills?.include && !Array.isArray(manifest.skills.include)) {
    errors.push("skills.include must be an array");
  }
  if (manifest.skills?.shared !== undefined) {
    if (!Array.isArray(manifest.skills.shared)) {
      errors.push("skills.shared must be an array");
    } else if (manifest.skills.shared.length > 0) {
      errors.push("skills.shared is reserved for Wave 2 (registry references). Wave 1 supports only bundled skills.");
    }
  }
  const upstream = manifest.skills?.upstream;
  if (upstream !== undefined) {
    if (!isObject(upstream)) {
      errors.push("skills.upstream must be an object");
    } else {
      const include = new Set(manifest.skills?.include ?? []);
      for (const [key, value] of Object.entries(upstream)) {
        if (!include.has(key)) {
          errors.push(`skills.upstream key ${key} is not listed in skills.include`);
        }
        if (typeof value !== "string" || value.length === 0) {
          errors.push(`skills.upstream.${key} must be a non-empty string`);
          continue;
        }
        try {
          parseUpstreamRef(value);
        } catch (error) {
          const message = error instanceof DrwnError ? error.message : String(error);
          if (error instanceof DrwnError && error.code === "UPSTREAM_LOCAL_PATH_REJECTED") {
            errors.push(`skills.upstream.${key} cannot be a local path`);
          } else {
            errors.push(`skills.upstream.${key} is invalid: ${message}`);
          }
        }
      }
    }
  }
  if (manifest.hooks?.exclude) {
    errors.push("hooks.exclude is not allowed in card manifests");
  }
  if (manifest.hooks?.shared) {
    errors.push("hooks.shared is not allowed in card manifests");
  }
  if (manifest.hooks?.include && !Array.isArray(manifest.hooks.include)) {
    errors.push("hooks.include must be an array");
  }
  if (manifest.kind !== undefined && manifest.kind !== "card" && manifest.kind !== "blueprint") {
    errors.push("kind must be card or blueprint");
  }
  const record = input as Record<string, unknown>;
  validateMindContentSection("persona", record.persona, errors);
  validateMindContentSection("beliefs", record.beliefs, errors);
  validateMemorySection(record.memory, errors);
  validateBlueprintFields(record, manifest.kind === "blueprint", errors);
  validateInstructionsField(record, errors);
  for (const [bundle, range] of Object.entries(manifest.bundles ?? {})) {
    if (!bundle || typeof range !== "string" || !validRange(range)) {
      errors.push(`invalid bundle range for ${bundle}`);
    }
  }
  for (const target of Object.keys(manifest.targets ?? {})) {
    if (!isTargetName(target)) {
      errors.push(`unsupported target: ${target}`);
    }
  }
  for (const [name, server] of Object.entries(manifest.servers ?? {})) {
    const headers = isObject(server) ? (server as Record<string, unknown>).headers : undefined;
    if (headers !== undefined && !isStringRecord(headers)) {
      errors.push(`servers.${name}.headers must be a string-to-string map`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertValidCardManifest(input: unknown): asserts input is CardManifest {
  const result = validateCardManifest(input);
  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }
}
