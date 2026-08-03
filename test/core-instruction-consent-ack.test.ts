// ABOUTME: Verifies machine-local acknowledgement of instruction consent imported from another machine.
// ABOUTME: Keys acknowledgement by project, Card, consent range, and exact canonical content digest.

import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CardLockEntry } from "../cli/core/card-lock";
import {
  buildInstructionConsentAckKey,
  hasInstructionConsentAck,
  recordInstructionConsentAck,
} from "../cli/core/instruction-consent-ack";

function card(contentDigest: `sha256-${string}`): CardLockEntry {
  return {
    name: "@test/operator",
    requested: "1.0.0",
    version: "1.0.0",
    path: "/unused",
    integrity: "sha256-card",
    manifest: {
      name: "@test/operator",
      version: "1.0.0",
      instructions: { text: "reviewed" },
    },
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
    instructionConsent: {
      consentedAt: "2026-07-23T00:00:00.000Z",
      consentedRange: "^1.0.0",
      contentDigest,
    },
  };
}

test("instruction consent acknowledgement is idempotent and content-addressed", async () => {
  const root = await mkdtemp(join(tmpdir(), "instruction-consent-ack-"));
  const agentsDir = join(root, ".agents");
  const key = buildInstructionConsentAckKey({
    projectRoot: root,
    card: card(`sha256-${"1".repeat(64)}`),
  });

  expect(await hasInstructionConsentAck(agentsDir, key)).toBe(false);
  await recordInstructionConsentAck(agentsDir, key);
  await recordInstructionConsentAck(agentsDir, key);
  expect(await hasInstructionConsentAck(agentsDir, key)).toBe(true);

  const changed = buildInstructionConsentAckKey({
    projectRoot: root,
    card: card(`sha256-${"2".repeat(64)}`),
  });
  expect(await hasInstructionConsentAck(agentsDir, changed)).toBe(false);
});
