// ABOUTME: Verifies consent-gated instruction composition and safe AGENTS.md desired-state planning.
// ABOUTME: Proves content and ownership hashes are distinct and tamper is fail-closed.

import { describe, expect, test } from "bun:test";

import type { CardLockEntry } from "../cli/core/card-lock";
import { resolveExplicitInstructionContribution } from "../cli/core/instruction-contribution";
import {
  composeConsentedInstructions,
  planClaudeInstructionAdapter,
  planInstructionProjection,
} from "../cli/core/sync-instructions";

function card(name: string, text: string, consented: boolean): CardLockEntry {
  const base: CardLockEntry = {
    name,
    requested: "1.0.0",
    version: "1.0.0",
    path: "/unused",
    integrity: `sha256-${name}`,
    manifest: { name, version: "1.0.0", instructions: { text } },
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
  };
  if (!consented) return base;
  const contribution = resolveExplicitInstructionContribution(base, "/unused")!;
  return {
    ...base,
    instructionConsent: {
      consentedAt: "2026-07-23T00:00:00.000Z",
      consentedRange: "^1.0.0",
      contentDigest: contribution.contentDigest,
    },
  };
}

describe("instruction composition and projection", () => {
  test("uses only explicit consented bytes and reports excluded Card IDs", () => {
    const composition = composeConsentedInstructions({
      cards: [
        card("@test/approved", "approved\r\n", true),
        card("@test/unapproved", "never project this", false),
      ],
      contentRootsByCard: {},
    });

    expect(new TextDecoder().decode(composition.bytes!)).toBe("approved\n");
    expect(composition.excluded).toEqual([
      { card: "@test/unapproved", reason: "consent_required" },
    ]);
    expect(composition.contentDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  test("plans an idempotent owned block and rejects independent block tamper", () => {
    const composition = composeConsentedInstructions({
      cards: [card("@test/approved", "approved", true)],
      contentRootsByCard: {},
    });
    const original = new TextEncoder().encode("# User content\n");
    const first = planInstructionProjection({
      currentBytes: original,
      composition,
      instructionId: "worker:@test/approved",
    });
    const second = planInstructionProjection({
      currentBytes: first.bytes,
      composition,
      instructionId: "worker:@test/approved",
      previousOwnershipHash: first.ownershipHash!,
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(first.contentDigest).toBe(composition.contentDigest);
    expect(first.ownershipHash).not.toBe(first.contentDigest);
    expect(new TextDecoder().decode(first.bytes)).toEndWith("# User content\n");

    const tampered = new TextEncoder().encode(
      new TextDecoder().decode(first.bytes).replace("approved", "edited"),
    );
    expect(() =>
      planInstructionProjection({
        currentBytes: tampered,
        composition,
        instructionId: "worker:@test/approved",
        previousOwnershipHash: first.ownershipHash!,
      }),
    ).toThrow(/ownership drift/i);
  });

  test("removes only an unchanged formerly owned block", () => {
    const desired = composeConsentedInstructions({
      cards: [card("@test/approved", "approved", true)],
      contentRootsByCard: {},
    });
    const original = new TextEncoder().encode("user bytes without final newline");
    const projected = planInstructionProjection({
      currentBytes: original,
      composition: desired,
      instructionId: "worker:@test/approved",
    });
    const empty = composeConsentedInstructions({
      cards: [],
      contentRootsByCard: {},
    });
    const removed = planInstructionProjection({
      currentBytes: projected.bytes,
      composition: empty,
      instructionId: "worker:@test/approved",
      previousOwnershipHash: projected.ownershipHash!,
    });

    expect(removed.bytes).toEqual(original);
    expect(removed.ownershipHash).toBeNull();
  });

  test("refuses a recognized instruction block without prior ownership, including with force", () => {
    const composition = composeConsentedInstructions({
      cards: [card("@test/approved", "approved", true)],
      contentRootsByCard: {},
    });
    const foreign = new TextEncoder().encode(
      [
        "<!-- drwn:instructions:start -->",
        "Foreign content using reserved markers.",
        "<!-- drwn:instructions:end -->",
        "",
      ].join("\n"),
    );

    expect(() =>
      planInstructionProjection({
        currentBytes: foreign,
        composition,
        instructionId: "worker:@test/approved",
      }),
    ).toThrow(/ownership/i);
    expect(() =>
      planInstructionProjection({
        currentBytes: foreign,
        composition,
        instructionId: "worker:@test/approved",
        force: true,
      }),
    ).toThrow(/ownership/i);
  });

  test("preserves valid foreign Claude adapters and gates foreign-file edits", () => {
    const validForeign = new TextEncoder().encode("# Claude\n\n@../AGENTS.md\n");
    const valid = planClaudeInstructionAdapter({
      currentBytes: validForeign,
      desired: true,
    });
    expect(valid.changed).toBe(false);
    expect(valid.ownership).toBeNull();

    const foreign = new TextEncoder().encode("# Claude local notes\n");
    const advisory = planClaudeInstructionAdapter({
      currentBytes: foreign,
      desired: true,
    });
    expect(advisory.changed).toBe(false);
    expect(advisory.warning).toMatch(/missing/i);

    const applied = planClaudeInstructionAdapter({
      currentBytes: foreign,
      desired: true,
      applyForeignAdapter: true,
    });
    expect(applied.changed).toBe(true);
    expect(applied.ownership?.kind).toBe("managed-fields");
    expect(new TextDecoder().decode(applied.bytes)).toEndWith("# Claude local notes\n");
  });

  test("creates and safely cleans the exact owned Claude adapter", () => {
    const created = planClaudeInstructionAdapter({
      currentBytes: new Uint8Array(),
      desired: true,
    });
    expect(new TextDecoder().decode(created.bytes)).toBe("@../AGENTS.md\n");
    expect(created.ownership?.kind).toBe("managed-content");

    const cleaned = planClaudeInstructionAdapter({
      currentBytes: created.bytes,
      desired: false,
      previousOwnership: created.ownership!,
    });
    expect(cleaned.bytes).toEqual(new Uint8Array());
    expect(cleaned.ownership).toBeNull();
  });
});
