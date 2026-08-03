// ABOUTME: Reads and writes the supported namespaced project lock graph.
// ABOUTME: Keeps Worker root resolution deterministic and rejects prototype formats.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BeliefsManifest, CardManifest, MemoryManifest, PersonaManifest } from "./card-manifest";
import { assertValidCardManifest, MEMORY_KINDS } from "./card-manifest";
import { DrwnError } from "./errors";
import { writeAtomically } from "./fs";
import * as git from "./git";
import { gte, validRange } from "./semver-utils";
import { resolveCardBareRepoPath } from "./store-paths";
import { DRWN_VERSION } from "./version";
import {
  PROJECT_WORKER_MIN_DRWN_VERSION,
  WORKER_MIND_MIN_DRWN_VERSION,
  minimumDrwnVersionForManifests,
} from "./mind-capability";

export { PROJECT_WORKER_MIN_DRWN_VERSION, WORKER_MIND_MIN_DRWN_VERSION } from "./mind-capability";

export type CardOrigin = "store" | "git" | "file" | "npm";

export interface GitLockInfo {
  url?: string;
  ref?: string;
  commit: string;
}

export interface CardLockEntry {
  name: string;
  requested: string;
  version: string;
  path: string;
  integrity: string;
  treeSha?: string;
  manifest: CardManifest;
  skills: string[];
  hooks: string[];
  persona?: PersonaManifest;
  beliefs?: BeliefsManifest;
  memory?: MemoryManifest;
  hookConsent?: {
    consentedAt: string;
    consentedRange: string;
  };
  instructionConsent?: {
    consentedAt: string;
    consentedRange: string;
    contentDigest: `sha256-${string}`;
  };
  registry: null;
  origin: CardOrigin;
  git?: GitLockInfo;
}

export interface WorkerRootLockEntry {
  name: string;
  requested: string;
  kind: "card" | "blueprint";
  members: string[];
}

export interface ProjectLockV1 {
  schema: "drwn.project-lock";
  schemaVersion: 1;
  store: { minDrwnVersion: string };
  workerRoots: WorkerRootLockEntry[];
  cards: CardLockEntry[];
}

export type CardLockfile = ProjectLockV1;
export type ProjectLockGraph = Pick<ProjectLockV1, "workerRoots" | "cards">;

export const HOOKS_MIN_DRWN_VERSION = "0.3.0";

export interface VersionFloorStatus {
  required: string | null;
  running: string;
  satisfied: boolean;
}

export function evaluateVersionFloor(
  requiredVersion: string | undefined,
  runningVersion: string = DRWN_VERSION,
): VersionFloorStatus {
  const required = requiredVersion ?? null;
  return { required, running: runningVersion, satisfied: required === null || gte(runningVersion, required) };
}

export function formatVersionFloorWarning(status: VersionFloorStatus): string {
  return `This project's card.lock requires drwn >= ${status.required}, but you are running ${status.running}. Upgrade drwn to >= ${status.required} to materialize this project reliably.`;
}

export function cardLockPath(projectRoot: string) {
  return join(projectRoot, ".agents", "drwn", "card.lock");
}

export async function loadCardLock(projectRoot: string): Promise<ProjectLockV1 | null> {
  const path = cardLockPath(projectRoot);
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new DrwnError("PROJECT_LOCK_INVALID", `Invalid project lock ${path}: malformed JSON`, undefined, error);
  }
  return validateCardLockfile(parsed, path);
}

function normalizeCards(cards: CardLockEntry[]): CardLockEntry[] {
  return cards.map((card) => ({
    ...card,
    ...(card.persona ?? card.manifest.persona ? { persona: card.persona ?? card.manifest.persona } : {}),
    ...(card.beliefs ?? card.manifest.beliefs ? { beliefs: card.beliefs ?? card.manifest.beliefs } : {}),
    ...(card.memory ?? card.manifest.memory ? { memory: card.memory ?? card.manifest.memory } : {}),
  }));
}

export function createCardLockfile(graph: ProjectLockGraph): ProjectLockV1 {
  const cards = normalizeCards(graph.cards);
  for (const card of cards) {
    if ((card.origin === "store" || card.origin === "git") && !card.treeSha) {
      throw new DrwnError(
        "LOCK_TREE_SHA_REQUIRED",
        `card.lock entry ${card.name} is missing treeSha; resolve the Worker again before writing the lock`,
      );
    }
  }
  return validateCardLockfile({
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: minimumDrwnVersionForManifests(cards.map((card) => card.manifest)) },
    workerRoots: graph.workerRoots,
    cards,
  });
}

export function serializeCardLock(graph: ProjectLockGraph): string {
  return `${JSON.stringify(createCardLockfile(graph), null, 2)}\n`;
}

export async function writeCardLock(projectRoot: string, graph: ProjectLockGraph) {
  const path = cardLockPath(projectRoot);
  await writeAtomically(path, serializeCardLock(graph));
  return path;
}

export async function persistCardLock(projectRoot: string, agentsDir: string, graph: ProjectLockGraph) {
  const cards = await backfillLockTreeShas(agentsDir, graph.cards);
  return writeCardLock(projectRoot, { workerRoots: graph.workerRoots, cards });
}

export async function backfillLockTreeShas(agentsDir: string, cards: CardLockEntry[]): Promise<CardLockEntry[]> {
  return Promise.all(cards.map(async (card) => {
    if (card.treeSha || card.origin === "file" || card.origin === "npm") return card;
    if (!card.git?.commit) {
      throw new DrwnError(
        "LOCK_TREE_SHA_BACKFILL_FAILED",
        `card.lock entry ${card.name} is missing git.commit; resolve the Worker again before writing`,
      );
    }
    const barePath = resolveCardBareRepoPath(agentsDir, card.name);
    return { ...card, treeSha: await git.getCommitTree(barePath, card.git.commit) };
  }));
}

const LOCK_KEYS = new Set(["schema", "schemaVersion", "store", "workerRoots", "cards"]);
const ROOT_KEYS = new Set(["name", "requested", "kind", "members"]);

function invalidLock(source: string, detail: string, cause?: unknown): never {
  throw new DrwnError("PROJECT_LOCK_INVALID", `Invalid project lock ${source}: ${detail}`, undefined, cause);
}

export function validateCardLockfile(input: unknown, source = "<memory>"): ProjectLockV1 {
  try {
    return validateProjectLockValue(input, source);
  } catch (error) {
    if (error instanceof DrwnError && error.code === "PROJECT_LOCK_INVALID") throw error;
    invalidLock(source, error instanceof Error ? error.message : String(error), error);
  }
}

function validateProjectLockValue(input: unknown, source: string): ProjectLockV1 {
  if (!isObject(input)) invalidLock(source, "expected an object");
  const unknown = Object.keys(input).filter((key) => !LOCK_KEYS.has(key));
  if (unknown.length > 0) invalidLock(source, `unsupported field(s): ${unknown.join(", ")}`);
  if (input.schema !== "drwn.project-lock") invalidLock(source, "schema must be drwn.project-lock");
  if (input.schemaVersion !== 1) invalidLock(source, "schemaVersion must be 1");
  if (!isObject(input.store) || typeof input.store.minDrwnVersion !== "string" || !input.store.minDrwnVersion) {
    invalidLock(source, "store.minDrwnVersion must be a non-empty string");
  }
  if (!Array.isArray(input.workerRoots)) invalidLock(source, "workerRoots must be an array");
  if (!Array.isArray(input.cards)) invalidLock(source, "cards must be an array");

  const cards = input.cards.map((entry, index) => validateCardLockEntry(entry, `${source} cards[${index}]`));
  const requiredVersion = minimumDrwnVersionForManifests(cards.map((card) => card.manifest));
  if (input.store.minDrwnVersion !== requiredVersion) {
    invalidLock(source, `store.minDrwnVersion must be ${requiredVersion} for this Worker graph`);
  }
  const cardsByName = new Map<string, CardLockEntry>();
  for (const card of cards) {
    if (cardsByName.has(card.name)) invalidLock(source, `Card ${card.name} appears more than once`);
    if (card.manifest.name !== card.name || card.manifest.version !== card.version) {
      invalidLock(source, `Card ${card.name} does not match its manifest identity`);
    }
    cardsByName.set(card.name, card);
  }

  const workerRoots = input.workerRoots.map((entry, index) => validateWorkerRoot(entry, `${source} workerRoots[${index}]`));
  const rootNames = new Set<string>();
  const memberNames = new Set<string>();
  for (const root of workerRoots) {
    if (rootNames.has(root.name)) invalidLock(source, `Worker root ${root.name} appears more than once`);
    rootNames.add(root.name);
    const rootCard = cardsByName.get(root.name);
    if (!rootCard) invalidLock(source, `Worker root ${root.name} is missing from cards`);
    if (root.requested !== rootCard.requested) invalidLock(source, `Worker root ${root.name} requested ref does not match its Card`);
    const manifestKind = rootCard.manifest.kind === "blueprint" ? "blueprint" : "card";
    if (root.kind !== manifestKind) invalidLock(source, `Worker root ${root.name} kind does not match its manifest`);
    const withinRoot = new Set<string>();
    for (const memberName of root.members) {
      if (withinRoot.has(memberName)) invalidLock(source, `Worker member ${memberName} appears more than once in ${root.name}`);
      withinRoot.add(memberName);
    }
    if (root.kind === "card" && root.members.length > 0) {
      invalidLock(source, `plain Card root ${root.name} cannot have members`);
    }
    if (root.kind === "blueprint" && root.members.length !== (rootCard.manifest.composedFrom ?? []).length) {
      invalidLock(source, `Blueprint root ${root.name} member count does not match its manifest`);
    }
    for (const memberName of root.members) {
      memberNames.add(memberName);
      const member = cardsByName.get(memberName);
      if (!member) invalidLock(source, `Worker member ${memberName} is missing from cards`);
      if (member.manifest.kind === "blueprint") invalidLock(source, `Worker member ${memberName} must be a plain Card`);
    }
  }

  for (const memberName of memberNames) {
    if (rootNames.has(memberName)) invalidLock(source, `Worker member ${memberName} is also listed as a root`);
  }
  for (const card of cards) {
    if (!rootNames.has(card.name) && !memberNames.has(card.name)) invalidLock(source, `orphan Card ${card.name} is not reachable from a root`);
  }

  return {
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: input.store.minDrwnVersion },
    workerRoots,
    cards,
  };
}

function validateWorkerRoot(input: unknown, source: string): WorkerRootLockEntry {
  if (!isObject(input)) throw new Error(`${source} must be an object`);
  const unknown = Object.keys(input).filter((key) => !ROOT_KEYS.has(key));
  if (unknown.length > 0) throw new Error(`${source} has unsupported field(s): ${unknown.join(", ")}`);
  assertString(input.name, `${source}.name`);
  assertString(input.requested, `${source}.requested`);
  if (input.kind !== "card" && input.kind !== "blueprint") throw new Error(`${source}.kind must be card or blueprint`);
  if (!Array.isArray(input.members) || !input.members.every((member) => typeof member === "string" && member.length > 0)) {
    throw new Error(`${source}.members must be a non-empty-string array`);
  }
  return { name: input.name, requested: input.requested, kind: input.kind, members: [...input.members] };
}

function validateCardLockEntry(input: unknown, source: string): CardLockEntry {
  if (!isObject(input)) throw new Error(`${source} must be an object`);
  const origin = input.origin;
  if (origin !== "store" && origin !== "git" && origin !== "file" && origin !== "npm") {
    throw new Error(`${source}.origin must be store, git, file, or npm`);
  }
  assertString(input.name, `${source}.name`);
  assertString(input.requested, `${source}.requested`);
  assertString(input.version, `${source}.version`);
  assertString(input.path, `${source}.path`);
  assertString(input.integrity, `${source}.integrity`);
  const treeSha = typeof input.treeSha === "string" && input.treeSha.length > 0 ? input.treeSha : undefined;
  if (treeSha && !/^[a-f0-9]{40}$/.test(treeSha)) throw new Error(`${source}.treeSha must be a 40-character SHA`);
  if ((origin === "store" || origin === "git") && !treeSha) throw new Error(`${source}.treeSha is required for ${origin} origin`);
  assertValidCardManifest(input.manifest);
  if (!Array.isArray(input.skills) || !input.skills.every((skill) => typeof skill === "string")) {
    throw new Error(`${source}.skills must be string[]`);
  }
  if (!Array.isArray(input.hooks) || !input.hooks.every((hook) => typeof hook === "string")) {
    throw new Error(`${source}.hooks must be string[]`);
  }
  const persona = validateMindContentLockSection(input.persona, `${source}.persona`);
  const beliefs = validateMindContentLockSection(input.beliefs, `${source}.beliefs`);
  const memory = validateMemoryLock(input.memory, `${source}.memory`);
  const manifestMemory = normalizeMemoryManifest(input.manifest.memory);
  if (JSON.stringify(memory) !== JSON.stringify(manifestMemory)) {
    throw new Error(`${source}.memory must match manifest.memory`);
  }
  const hookConsent = validateHookConsent(input.hookConsent, source);
  const instructionConsent = validateInstructionConsent(input.instructionConsent, source);
  if (input.registry !== null) throw new Error(`${source}.registry must be null`);
  const gitInfo = validateGitLockInfo(input.git, origin, source);
  return {
    name: input.name,
    requested: input.requested,
    version: input.version,
    path: input.path,
    integrity: input.integrity,
    ...(treeSha ? { treeSha } : {}),
    manifest: input.manifest,
    skills: [...input.skills],
    hooks: [...input.hooks],
    ...(persona ? { persona } : {}),
    ...(beliefs ? { beliefs } : {}),
    ...(memory ? { memory } : {}),
    ...(hookConsent ? { hookConsent } : {}),
    ...(instructionConsent ? { instructionConsent } : {}),
    registry: null,
    origin,
    ...(gitInfo ? { git: gitInfo } : {}),
  };
}

function validateMindContentLockSection(input: unknown, source: string): PersonaManifest | BeliefsManifest | undefined {
  if (input === undefined) return undefined;
  if (!isObject(input)) throw new Error(`${source} must be an object`);
  const include = validateLockStringArray(input.include, `${source}.include`);
  const visibility = validateLockVisibility(input.visibility, `${source}.visibility`);
  if ((include?.length ?? 0) > 0 && visibility === undefined) throw new Error(`${source}.visibility is required when include is non-empty`);
  return { ...(include ? { include } : {}), ...(visibility ? { visibility } : {}) };
}

function validateMemoryLock(input: unknown, source: string): MemoryManifest | undefined {
  if (input === undefined) return undefined;
  if (!isObject(input)) throw new Error(`${source} must be an object`);
  const memory: MemoryManifest = {};
  for (const [kind, section] of Object.entries(input)) {
    if (kind === "raw_data") throw new Error(`${source}: memory kind raw_data is reserved but unsupported`);
    if (!(MEMORY_KINDS as readonly string[]).includes(kind)) throw new Error(`${source}: unsupported memory kind ${kind}`);
    if (!isObject(section)) throw new Error(`${source}.${kind} must be an object`);
    const unknown = Object.keys(section).filter((key) => key !== "format");
    if (unknown.length > 0) throw new Error(`${source}.${kind} has unsupported field(s): ${unknown.join(", ")}`);
    const requiredFormat = kind === "observations" ? "jsonl" : "md";
    if (section.format !== requiredFormat) {
      throw new Error(`${source}.${kind}.format must be ${requiredFormat}`);
    }
    if (kind === "observations") memory.observations = { format: "jsonl" };
    else memory.insights = { format: "md" };
  }
  return normalizeMemoryManifest(memory);
}

function normalizeMemoryManifest(input: MemoryManifest | undefined): MemoryManifest | undefined {
  if (!input?.observations && !input?.insights) return undefined;
  return {
    ...(input.observations ? { observations: { format: "jsonl" as const } } : {}),
    ...(input.insights ? { insights: { format: "md" as const } } : {}),
  };
}

function validateLockStringArray(input: unknown, source: string): string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || !input.every((entry) => typeof entry === "string")) throw new Error(`${source} must be string[]`);
  return [...input];
}

function validateLockVisibility(input: unknown, source: string): PersonaManifest["visibility"] | undefined {
  if (input === undefined) return undefined;
  if (input !== "private" && input !== "internal" && input !== "public") throw new Error(`${source} must be private, internal, or public`);
  return input;
}

function validateHookConsent(input: unknown, source: string): CardLockEntry["hookConsent"] | undefined {
  if (input === undefined) return undefined;
  if (!isObject(input)) throw new Error(`${source}.hookConsent must be an object`);
  assertString(input.consentedAt, `${source}.hookConsent.consentedAt`);
  assertString(input.consentedRange, `${source}.hookConsent.consentedRange`);
  if (Number.isNaN(Date.parse(input.consentedAt)) || new Date(input.consentedAt).toISOString() !== input.consentedAt) {
    throw new Error(`${source}.hookConsent.consentedAt must be an ISO timestamp`);
  }
  return { consentedAt: input.consentedAt, consentedRange: input.consentedRange };
}

function validateInstructionConsent(
  input: unknown,
  source: string,
): CardLockEntry["instructionConsent"] | undefined {
  if (input === undefined) return undefined;
  if (!isObject(input)) throw new Error(`${source}.instructionConsent must be an object`);
  const unknown = Object.keys(input).filter(
    (key) => !["consentedAt", "consentedRange", "contentDigest"].includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(`${source}.instructionConsent has unsupported field(s): ${unknown.join(", ")}`);
  }
  assertString(input.consentedAt, `${source}.instructionConsent.consentedAt`);
  assertString(input.consentedRange, `${source}.instructionConsent.consentedRange`);
  assertString(input.contentDigest, `${source}.instructionConsent.contentDigest`);
  if (Number.isNaN(Date.parse(input.consentedAt)) || new Date(input.consentedAt).toISOString() !== input.consentedAt) {
    throw new Error(`${source}.instructionConsent.consentedAt must be an ISO timestamp`);
  }
  if (!validRange(input.consentedRange)) {
    throw new Error(`${source}.instructionConsent.consentedRange must be a valid semver range`);
  }
  if (!/^sha256-[a-f0-9]{64}$/.test(input.contentDigest)) {
    throw new Error(`${source}.instructionConsent.contentDigest must be a sha256 digest`);
  }
  return {
    consentedAt: input.consentedAt,
    consentedRange: input.consentedRange,
    contentDigest: input.contentDigest as `sha256-${string}`,
  };
}

function validateGitLockInfo(input: unknown, origin: CardOrigin, source: string): GitLockInfo | undefined {
  if (origin === "file" || origin === "npm") {
    if (input !== undefined) throw new Error(`${source}: ${origin} origin must not include git metadata`);
    return undefined;
  }
  if (!isObject(input)) throw new Error(`${source}: ${origin} origin requires git metadata`);
  assertString(input.commit, `${source}.git.commit`);
  if (!/^[a-f0-9]{40}$/.test(input.commit)) throw new Error(`${source}.git.commit must be a 40-character SHA`);
  return {
    commit: input.commit,
    ...(typeof input.url === "string" ? { url: input.url } : {}),
    ...(typeof input.ref === "string" ? { ref: input.ref } : {}),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
}
