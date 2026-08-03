// ABOUTME: Resolves the sole explicit Card-instructions contribution and its content digest.
// ABOUTME: Applies one canonicalization and consent rule across Worker artifacts and project projection.

import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import type { CardLockEntry } from "./card-lock";
import type { CardManifest } from "./card-manifest";
import { satisfies } from "./semver-utils";

export const MAX_INSTRUCTION_BYTES = 65_536;

export interface ExplicitInstructionContribution {
  bytes: Uint8Array;
  contentDigest: `sha256-${string}`;
  source: "text" | "path";
}

export function canonicalInstructionBytes(input: Uint8Array): Uint8Array {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new Error("Instruction contribution must be valid UTF-8");
  }
  const canonical = `${text.replace(/\r\n?/g, "\n").replace(/\n+$/g, "")}\n`;
  const bytes = new TextEncoder().encode(canonical);
  if (bytes.byteLength > MAX_INSTRUCTION_BYTES) {
    throw new Error(`Instruction contribution exceeds ${MAX_INSTRUCTION_BYTES} bytes`);
  }
  if (canonical.trim().length === 0) {
    throw new Error("Instruction contribution must be non-empty");
  }
  return bytes;
}

function digest(bytes: Uint8Array): `sha256-${string}` {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function resolvePath(contentRoot: string, pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  if (
    normalized.length === 0 ||
    isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("instructions.path must stay inside the Card content root");
  }
  const root = realpathSync(contentRoot);
  const candidate = realpathSync(join(root, normalized));
  const relativePath = relative(root, candidate);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("instructions.path must stay inside the Card content root");
  }
  if (!statSync(candidate).isFile()) {
    throw new Error("instructions.path must resolve to a regular file");
  }
  return candidate;
}

export function resolveExplicitInstructionContribution(
  card: CardLockEntry,
  contentRoot: string,
): ExplicitInstructionContribution | null {
  return resolveManifestInstructionContribution(card.manifest, contentRoot);
}

export function resolveManifestInstructionContribution(
  manifest: CardManifest,
  contentRoot: string,
): ExplicitInstructionContribution | null {
  const instructions = manifest.instructions;
  if (!instructions) return null;
  const source = typeof instructions.text === "string" ? "text" : "path";
  const raw =
    source === "text"
      ? new TextEncoder().encode(instructions.text!)
      : readFileSync(resolvePath(contentRoot, instructions.path!));
  if (raw.byteLength > MAX_INSTRUCTION_BYTES) {
    throw new Error(`Instruction contribution exceeds ${MAX_INSTRUCTION_BYTES} bytes`);
  }
  const bytes = canonicalInstructionBytes(raw);
  return { bytes, contentDigest: digest(bytes), source };
}

export function isInstructionConsentValid(
  card: CardLockEntry,
  contribution: ExplicitInstructionContribution,
): boolean {
  return Boolean(
    card.instructionConsent &&
      satisfies(card.version, card.instructionConsent.consentedRange, {
        includePrerelease: true,
      }) &&
      card.instructionConsent.contentDigest === contribution.contentDigest,
  );
}
