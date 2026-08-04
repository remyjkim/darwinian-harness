// ABOUTME: Machine-local acknowledgement store for cross-machine hook consent notices.
// ABOUTME: Keys notices by project, card tree, policy digest, and consented range.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import {
  consentScopesEqual,
  projectConsentScope,
  type ConsentScope,
} from "./consent-scope";
import { manifestIntegrityDigest, type ContentManifest, type ContentManifestFile } from "./content-manifest";

export interface HookConsentAckKey {
  scope: ConsentScope;
  cardName: string;
  treeSha: string;
  hookPolicyDigest: string;
  consentedRange: string;
}

interface HookConsentAckStore {
  acks: HookConsentAckKey[];
}

export function resolveHookConsentAckPath(agentsDir: string) {
  return join(agentsDir, "drwn", "state", "hook-consent-acks.json");
}

function normalizeAckKey(key: HookConsentAckKey): HookConsentAckKey {
  return {
    ...key,
    scope:
      key.scope.kind === "project"
        ? projectConsentScope(key.scope.projectRoot)
        : key.scope,
  };
}

function ackKeysEqual(left: HookConsentAckKey, right: HookConsentAckKey) {
  const normalizedLeft = normalizeAckKey(left);
  const normalizedRight = normalizeAckKey(right);
  return (
    consentScopesEqual(normalizedLeft.scope, normalizedRight.scope) &&
    normalizedLeft.cardName === normalizedRight.cardName &&
    normalizedLeft.treeSha === normalizedRight.treeSha &&
    normalizedLeft.hookPolicyDigest === normalizedRight.hookPolicyDigest &&
    normalizedLeft.consentedRange === normalizedRight.consentedRange
  );
}

export async function loadHookConsentAcks(agentsDir: string): Promise<HookConsentAckStore> {
  const path = resolveHookConsentAckPath(agentsDir);
  if (!existsSync(path)) {
    return { acks: [] };
  }
  return JSON.parse(await readFile(path, "utf8")) as HookConsentAckStore;
}

export async function hasHookConsentAck(agentsDir: string, key: HookConsentAckKey) {
  const store = await loadHookConsentAcks(agentsDir);
  return store.acks.some((entry) => ackKeysEqual(entry, key));
}

export async function recordHookConsentAck(agentsDir: string, key: HookConsentAckKey) {
  const path = resolveHookConsentAckPath(agentsDir);
  await mkdir(dirname(path), { recursive: true });
  const store = await loadHookConsentAcks(agentsDir);
  const normalized = normalizeAckKey(key);
  if (store.acks.some((entry) => ackKeysEqual(entry, normalized))) {
    return path;
  }
  store.acks.push(normalized);
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`);
  return path;
}

export async function computeHookPolicyDigest(card: CardLockEntry, contentRoot: string) {
  const files: ContentManifestFile[] = [];
  for (const policyName of [...card.hooks].sort((a, b) => a.localeCompare(b))) {
    const policyPath = join(contentRoot, "hooks", policyName, "policy.ts");
    if (!existsSync(policyPath)) {
      continue;
    }
    const content = await readFile(policyPath);
    files.push({
      path: policyName,
      exec: false,
      hash: `sha256-${createHash("sha256").update(content).digest("hex")}`,
    });
  }
  const manifest: ContentManifest = { files };
  return manifestIntegrityDigest(manifest);
}

export function buildHookConsentAckKey(options: {
  scope: ConsentScope;
  card: CardLockEntry;
  hookPolicyDigest: string;
}): HookConsentAckKey {
  if (!options.card.hookConsent) {
    throw new Error(`card ${options.card.name} is missing hookConsent`);
  }
  return {
    scope: options.scope,
    cardName: options.card.name,
    treeSha: options.card.treeSha ?? "",
    hookPolicyDigest: options.hookPolicyDigest,
    consentedRange: options.card.hookConsent.consentedRange,
  };
}
