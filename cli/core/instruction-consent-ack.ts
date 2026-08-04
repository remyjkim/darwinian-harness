// ABOUTME: Stores machine-local acknowledgements for consented Card instruction content.
// ABOUTME: Prevents repeated cross-machine notices without weakening project-lock consent.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { CardLockEntry } from "./card-lock";
import {
  consentScopesEqual,
  projectConsentScope,
  type ConsentScope,
} from "./consent-scope";

export interface InstructionConsentAckKey {
  scope: ConsentScope;
  cardName: string;
  contentDigest: `sha256-${string}`;
  consentedRange: string;
}

interface InstructionConsentAckStore {
  acks: InstructionConsentAckKey[];
}

export function resolveInstructionConsentAckPath(agentsDir: string) {
  return join(agentsDir, "drwn", "state", "instruction-consent-acks.json");
}

function normalizeAckKey(
  key: InstructionConsentAckKey,
): InstructionConsentAckKey {
  return {
    ...key,
    scope:
      key.scope.kind === "project"
        ? projectConsentScope(key.scope.projectRoot)
        : key.scope,
  };
}

function ackKeysEqual(
  left: InstructionConsentAckKey,
  right: InstructionConsentAckKey,
) {
  const normalizedLeft = normalizeAckKey(left);
  const normalizedRight = normalizeAckKey(right);
  return (
    consentScopesEqual(normalizedLeft.scope, normalizedRight.scope) &&
    normalizedLeft.cardName === normalizedRight.cardName &&
    normalizedLeft.contentDigest === normalizedRight.contentDigest &&
    normalizedLeft.consentedRange === normalizedRight.consentedRange
  );
}

export async function loadInstructionConsentAcks(
  agentsDir: string,
): Promise<InstructionConsentAckStore> {
  const path = resolveInstructionConsentAckPath(agentsDir);
  if (!existsSync(path)) return { acks: [] };
  return JSON.parse(await readFile(path, "utf8")) as InstructionConsentAckStore;
}

export async function hasInstructionConsentAck(
  agentsDir: string,
  key: InstructionConsentAckKey,
) {
  const store = await loadInstructionConsentAcks(agentsDir);
  return store.acks.some((entry) => ackKeysEqual(entry, key));
}

export async function recordInstructionConsentAck(
  agentsDir: string,
  key: InstructionConsentAckKey,
) {
  const path = resolveInstructionConsentAckPath(agentsDir);
  await mkdir(dirname(path), { recursive: true });
  const store = await loadInstructionConsentAcks(agentsDir);
  const normalized = normalizeAckKey(key);
  if (!store.acks.some((entry) => ackKeysEqual(entry, normalized))) {
    store.acks.push(normalized);
    await writeFile(path, `${JSON.stringify(store, null, 2)}\n`);
  }
  return path;
}

export function buildInstructionConsentAckKey(options: {
  scope: ConsentScope;
  card: CardLockEntry;
}): InstructionConsentAckKey {
  if (!options.card.instructionConsent) {
    throw new Error(`card ${options.card.name} is missing instructionConsent`);
  }
  return {
    scope: options.scope,
    cardName: options.card.name,
    contentDigest: options.card.instructionConsent.contentDigest,
    consentedRange: options.card.instructionConsent.consentedRange,
  };
}
