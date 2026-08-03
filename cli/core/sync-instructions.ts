// ABOUTME: Composes consented explicit instructions and plans the root AGENTS.md managed block.
// ABOUTME: Separates canonical content identity from exact rendered-block ownership.

import type { CardLockEntry } from "./card-lock";
import {
  isInstructionConsentValid,
  resolveExplicitInstructionContribution,
} from "./instruction-contribution";
import {
  parseManagedBlock,
  removeManagedBlock,
  upsertManagedBlock,
} from "./managed-block";
import { hashManagedContent } from "./write-record";

export const INSTRUCTION_BLOCK_MARKERS = {
  start: "<!-- drwn:instructions:start -->",
  end: "<!-- drwn:instructions:end -->",
} as const;

export const CLAUDE_ADAPTER_BLOCK_MARKERS = {
  start: "<!-- drwn:claude-adapter:start -->",
  end: "<!-- drwn:claude-adapter:end -->",
} as const;

export interface InstructionComposition {
  bytes: Uint8Array | null;
  contentDigest: `sha256-${string}` | null;
  excluded: Array<{
    card: string;
    reason: "consent_required" | "consent_stale";
  }>;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, item) => total + item.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function composeConsentedInstructions(input: {
  cards: readonly CardLockEntry[];
  contentRootsByCard: Readonly<Record<string, string>>;
}): InstructionComposition {
  const contributions: Uint8Array[] = [];
  const excluded: InstructionComposition["excluded"] = [];
  for (const card of input.cards) {
    const contribution = resolveExplicitInstructionContribution(
      card,
      input.contentRootsByCard[card.name] ?? card.path,
    );
    if (!contribution) continue;
    if (!isInstructionConsentValid(card, contribution)) {
      excluded.push({
        card: card.name,
        reason: card.instructionConsent ? "consent_stale" : "consent_required",
      });
      continue;
    }
    if (contributions.length > 0) {
      contributions.push(new TextEncoder().encode("\n"));
    }
    contributions.push(contribution.bytes);
  }
  if (contributions.length === 0) {
    return { bytes: null, contentDigest: null, excluded };
  }
  const bytes = concatenate(contributions);
  return {
    bytes,
    contentDigest: hashManagedContent(bytes) as `sha256-${string}`,
    excluded,
  };
}

export interface InstructionProjectionPlan {
  bytes: Uint8Array;
  changed: boolean;
  contentDigest: `sha256-${string}` | null;
  ownershipHash: `sha256-${string}` | null;
}

export function planInstructionProjection(input: {
  currentBytes: Uint8Array;
  composition: InstructionComposition;
  instructionId: string;
  previousOwnershipHash?: string;
  force?: boolean;
}): InstructionProjectionPlan {
  const current = parseManagedBlock(input.currentBytes, INSTRUCTION_BLOCK_MARKERS);
  if (current.state === "malformed") {
    throw new Error(`Instructions block is malformed: ${current.code}`);
  }
  const currentOwnershipHash =
    current.state === "present" ? hashManagedContent(current.block) : null;
  if (current.state === "present" && !input.previousOwnershipHash) {
    throw new Error(
      "Instruction ownership cannot be proven for the existing AGENTS.md block",
    );
  }
  if (
    input.previousOwnershipHash &&
    currentOwnershipHash !== input.previousOwnershipHash &&
    !input.force
  ) {
    throw new Error("Instruction ownership drift detected in AGENTS.md");
  }

  if (!input.composition.bytes || !input.composition.contentDigest) {
    const bytes =
      current.state === "present"
        ? removeManagedBlock(input.currentBytes, INSTRUCTION_BLOCK_MARKERS)
        : input.currentBytes.slice();
    return {
      bytes,
      changed: !Buffer.from(bytes).equals(Buffer.from(input.currentBytes)),
      contentDigest: null,
      ownershipHash: null,
    };
  }

  const body = [
    `Instruction-ID: ${input.instructionId}`,
    `Content-Digest: ${input.composition.contentDigest}`,
    "",
    new TextDecoder().decode(input.composition.bytes),
  ].join("\n");
  const bytes = upsertManagedBlock(
    input.currentBytes,
    body,
    INSTRUCTION_BLOCK_MARKERS,
  );
  const desired = parseManagedBlock(bytes, INSTRUCTION_BLOCK_MARKERS);
  if (desired.state !== "present") {
    throw new Error("Unable to render managed instruction block");
  }
  return {
    bytes,
    changed: !Buffer.from(bytes).equals(Buffer.from(input.currentBytes)),
    contentDigest: input.composition.contentDigest,
    ownershipHash: hashManagedContent(desired.block) as `sha256-${string}`,
  };
}

export type ClaudeAdapterOwnership =
  | { kind: "managed-content"; hash: `sha256-${string}` }
  | { kind: "managed-fields"; hash: `sha256-${string}` };

export interface ClaudeAdapterPlan {
  bytes: Uint8Array;
  changed: boolean;
  ownership: ClaudeAdapterOwnership | null;
  warning?: string;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

export function planClaudeInstructionAdapter(input: {
  currentBytes: Uint8Array;
  desired: boolean;
  previousOwnership?: ClaudeAdapterOwnership;
  applyForeignAdapter?: boolean;
  force?: boolean;
}): ClaudeAdapterPlan {
  const exact = new TextEncoder().encode("@../AGENTS.md\n");
  const parsed = parseManagedBlock(
    input.currentBytes,
    CLAUDE_ADAPTER_BLOCK_MARKERS,
  );
  if (parsed.state === "malformed") {
    throw new Error(`Claude adapter block is malformed: ${parsed.code}`);
  }
  const currentWholeHash = hashManagedContent(input.currentBytes) as `sha256-${string}`;
  const currentBlockHash =
    parsed.state === "present"
      ? (hashManagedContent(parsed.block) as `sha256-${string}`)
      : null;
  const priorMatches =
    !input.previousOwnership ||
    (input.previousOwnership.kind === "managed-content"
      ? currentWholeHash === input.previousOwnership.hash
      : currentBlockHash === input.previousOwnership.hash);

  if (!input.desired) {
    if (!input.previousOwnership) {
      return { bytes: input.currentBytes.slice(), changed: false, ownership: null };
    }
    if (!priorMatches) {
      return {
        bytes: input.currentBytes.slice(),
        changed: false,
        ownership: null,
        warning: "Claude adapter ownership drift; preserved foreign bytes",
      };
    }
    const bytes =
      input.previousOwnership.kind === "managed-content"
        ? new Uint8Array()
        : removeManagedBlock(input.currentBytes, CLAUDE_ADAPTER_BLOCK_MARKERS);
    return {
      bytes,
      changed: !sameBytes(bytes, input.currentBytes),
      ownership: null,
    };
  }

  if (input.previousOwnership && !priorMatches) {
    return {
      bytes: input.currentBytes.slice(),
      changed: false,
      ownership: null,
      warning: "Claude adapter ownership drift; preserved foreign bytes",
    };
  }
  if (input.currentBytes.byteLength === 0) {
    return {
      bytes: exact,
      changed: true,
      ownership: {
        kind: "managed-content",
        hash: hashManagedContent(exact) as `sha256-${string}`,
      },
    };
  }
  if (input.previousOwnership?.kind === "managed-content") {
    return {
      bytes: input.currentBytes.slice(),
      changed: false,
      ownership: input.previousOwnership,
    };
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(input.currentBytes);
  if (/^\s*@\.\.\/AGENTS\.md\s*$/m.test(text)) {
    return {
      bytes: input.currentBytes.slice(),
      changed: false,
      ownership:
        input.previousOwnership?.kind === "managed-fields"
          ? input.previousOwnership
          : null,
    };
  }
  if (!input.applyForeignAdapter) {
    return {
      bytes: input.currentBytes.slice(),
      changed: false,
      ownership: null,
      warning: "Foreign .claude/CLAUDE.md is missing @../AGENTS.md",
    };
  }
  const bytes = upsertManagedBlock(
    input.currentBytes,
    "@../AGENTS.md\n",
    CLAUDE_ADAPTER_BLOCK_MARKERS,
  );
  const desiredBlock = parseManagedBlock(bytes, CLAUDE_ADAPTER_BLOCK_MARKERS);
  if (desiredBlock.state !== "present") {
    throw new Error("Unable to render Claude adapter block");
  }
  return {
    bytes,
    changed: !sameBytes(bytes, input.currentBytes),
    ownership: {
      kind: "managed-fields",
      hash: hashManagedContent(desiredBlock.block) as `sha256-${string}`,
    },
  };
}
