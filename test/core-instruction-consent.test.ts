// ABOUTME: Proves explicit Card instructions use one resolver and require exact content/version consent.
// ABOUTME: Rejects implicit skill fallback, unsafe paths, oversized files, and changed content.

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { CardLockEntry } from "../cli/core/card-lock";
import {
  isInstructionConsentValid,
  resolveExplicitInstructionContribution,
} from "../cli/core/instruction-contribution";

function card(
  instructions?: { text?: string; path?: string },
): CardLockEntry {
  return {
    name: "@test/card",
    requested: "1.0.0",
    version: "1.0.0",
    path: "/unused",
    integrity: "sha256-test",
    manifest: {
      name: "@test/card",
      version: "1.0.0",
      ...(instructions ? { instructions } : {}),
      skills: { include: ["only-skill"] },
    },
    skills: ["only-skill"],
    hooks: [],
    registry: null,
    origin: "file",
  };
}

describe("explicit instruction contribution", () => {
  test("canonicalizes inline and path sources through the same digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "instruction-contribution-"));
    await writeFile(join(root, "INSTRUCTIONS.md"), "hello\r\nworld\r\n");

    const inline = resolveExplicitInstructionContribution(
      card({ text: "hello\nworld\n" }),
      root,
    );
    const path = resolveExplicitInstructionContribution(
      card({ path: "INSTRUCTIONS.md" }),
      root,
    );

    expect(new TextDecoder().decode(inline?.bytes)).toBe("hello\nworld\n");
    expect(path?.bytes).toEqual(inline?.bytes);
    expect(path?.contentDigest).toBe(inline?.contentDigest);
    expect(path?.source).toBe("path");
    expect(inline?.contentDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  test("never treats bundled skills as instructions", () => {
    expect(resolveExplicitInstructionContribution(card(), "/unused")).toBeNull();
  });

  test("fails closed for traversal, symlink escape, non-UTF-8, and oversized input", async () => {
    const root = await mkdtemp(join(tmpdir(), "instruction-adversarial-"));
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "bad.bin"), new Uint8Array([0xc3, 0x28]));
    await writeFile(join(root, "large.md"), "x".repeat(65_537));
    const outside = join(root, "..", "outside-instructions.md");
    await writeFile(outside, "outside");
    await symlink(outside, join(root, "nested", "link.md"));

    expect(() =>
      resolveExplicitInstructionContribution(card({ path: "../outside.md" }), root),
    ).toThrow(/inside/i);
    expect(() =>
      resolveExplicitInstructionContribution(card({ path: "nested/link.md" }), root),
    ).toThrow(/inside/i);
    expect(() =>
      resolveExplicitInstructionContribution(card({ path: "bad.bin" }), root),
    ).toThrow(/utf-8/i);
    expect(() =>
      resolveExplicitInstructionContribution(card({ path: "large.md" }), root),
    ).toThrow(/65536/i);
  });

  test("requires both semver range and exact digest", () => {
    const contribution = resolveExplicitInstructionContribution(
      card({ text: "approved" }),
      "/unused",
    )!;
    const approved = {
      ...card({ text: "approved" }),
      instructionConsent: {
        consentedAt: "2026-07-23T00:00:00.000Z",
        consentedRange: "^1.0.0",
        contentDigest: contribution.contentDigest,
      },
    };

    expect(isInstructionConsentValid(approved, contribution)).toBe(true);
    expect(
      isInstructionConsentValid(
        { ...approved, version: "2.0.0" },
        contribution,
      ),
    ).toBe(false);
    expect(
      isInstructionConsentValid(approved, {
        ...contribution,
        contentDigest: `sha256-${"0".repeat(64)}`,
      }),
    ).toBe(false);
  });
});
