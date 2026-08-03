// ABOUTME: Proves local and organization instruction consent authorize exact bytes without provenance collapse.
// ABOUTME: Rejects mismatched Worker, pin, surface, version, and digest evidence fail-closed.

import { describe, expect, test } from "bun:test";

import type { CardLockEntry } from "../cli/core/card-lock";
import {
  resolveEffectiveInstructionConsent,
  type OrgWorkerBundleInstructionConsentEvidence,
} from "../cli/core/instruction-consent-evidence";
import {
  resolveExplicitInstructionContribution,
} from "../cli/core/instruction-contribution";
import {
  composeConsentedInstructions,
} from "../cli/core/sync-instructions";

function card(localConsent = false): CardLockEntry {
  const base: CardLockEntry = {
    name: "operator",
    requested: "operator@1.0.0",
    version: "1.0.0",
    path: "/unused",
    integrity: `sha256-${"1".repeat(64)}`,
    treeSha: "a".repeat(40),
    manifest: {
      name: "operator",
      version: "1.0.0",
      instructions: { text: "Use the reviewed procedure." },
    },
    skills: [],
    hooks: [],
    registry: null,
    origin: "git",
    git: { commit: "b".repeat(40) },
  };
  if (!localConsent) return base;
  const contribution = resolveExplicitInstructionContribution(base, "/unused")!;
  return {
    ...base,
    instructionConsent: {
      consentedAt: "2026-07-24T00:00:00.000Z",
      consentedRange: "^1.0.0",
      contentDigest: contribution.contentDigest,
    },
  };
}

function organizationEvidence(
  overrides: Partial<OrgWorkerBundleInstructionConsentEvidence> = {},
): OrgWorkerBundleInstructionConsentEvidence {
  const contribution = resolveExplicitInstructionContribution(
    card(),
    "/unused",
  )!;
  return {
    kind: "org_worker_bundle_consent",
    bundleDigest: `sha256:${"2".repeat(64)}`,
    sourceBlueprint: {
      id: "blueprint:operator:1",
      revision: 1,
      digest: `sha256:${"3".repeat(64)}`,
    },
    consentId: "consent:operator-instructions",
    workerId: "worker:operator",
    artifactPinRef: "artifact:operator",
    consentedRange: ">=1.0.0 <2.0.0",
    contentDigest: contribution.contentDigest,
    ratifierRef: "actor:owner",
    evidenceRefs: ["evidence:ratification"],
    projectionSurface: "worker_instructions",
    ...overrides,
  };
}

describe("effective instruction consent evidence", () => {
  test("one resolver preserves valid local and organization provenance variants", () => {
    const contribution = resolveExplicitInstructionContribution(
      card(),
      "/unused",
    )!;
    const organization = organizationEvidence();
    const fromOrganization = resolveEffectiveInstructionConsent({
      card: card(),
      contribution,
      evidence: [organization],
      organizationBinding: {
        workerId: "worker:operator",
        artifactPinRef: "artifact:operator",
      },
    });
    const fromLocal = resolveEffectiveInstructionConsent({
      card: card(true),
      contribution,
      evidence: [],
    });

    expect(fromOrganization).toEqual({
      authorized: true,
      evidence: organization,
    });
    expect(fromLocal).toMatchObject({
      authorized: true,
      evidence: {
        kind: "local_card_consent",
        cardName: "operator",
        consentedAt: "2026-07-24T00:00:00.000Z",
        consentedRange: "^1.0.0",
        contentDigest: contribution.contentDigest,
      },
    });
    expect(card().instructionConsent).toBeUndefined();
  });

  test("composer includes exact bytes authorized only by external organization evidence", () => {
    const organization = organizationEvidence();
    const composition = composeConsentedInstructions({
      cards: [card()],
      contentRootsByCard: {},
      organizationConsent: {
        workerId: "worker:operator",
        artifactPinRefsByCard: { operator: "artifact:operator" },
        evidence: [organization],
      },
    });

    expect(new TextDecoder().decode(composition.bytes!)).toBe(
      "Use the reviewed procedure.\n",
    );
    expect(composition.excluded).toEqual([]);
    expect(composition.included).toEqual([
      {
        card: "operator",
        evidenceKind: "org_worker_bundle_consent",
        evidenceId: "consent:operator-instructions",
      },
    ]);
    expect(card().instructionConsent).toBeUndefined();
  });

  test("another Worker, pin, surface, version, or digest never authorizes bytes", () => {
    const contribution = resolveExplicitInstructionContribution(
      card(),
      "/unused",
    )!;
    const invalid = [
      organizationEvidence({ workerId: "worker:other" }),
      organizationEvidence({ artifactPinRef: "artifact:other" }),
      organizationEvidence({
        projectionSurface: "worker_lifecycle_hooks" as "worker_instructions",
      }),
      organizationEvidence({ consentedRange: ">=2.0.0 <3.0.0" }),
      organizationEvidence({
        contentDigest: `sha256-${"0".repeat(64)}`,
      }),
    ];

    for (const evidence of invalid) {
      expect(
        resolveEffectiveInstructionConsent({
          card: card(),
          contribution,
          evidence: [evidence],
          organizationBinding: {
            workerId: "worker:operator",
            artifactPinRef: "artifact:operator",
          },
        }),
      ).toEqual({ authorized: false, reason: "consent_stale" });
    }
  });

  test("removed or invalid organization evidence immediately excludes the contribution", () => {
    for (const evidence of [
      [],
      [organizationEvidence({ contentDigest: `sha256-${"0".repeat(64)}` })],
    ]) {
      const composition = composeConsentedInstructions({
        cards: [card()],
        contentRootsByCard: {},
        organizationConsent: {
          workerId: "worker:operator",
          artifactPinRefsByCard: { operator: "artifact:operator" },
          evidence,
        },
      });

      expect(composition.bytes).toBeNull();
      expect(composition.included).toEqual([]);
      expect(composition.excluded).toEqual([
        {
          card: "operator",
          expectedEvidenceKind: "org_worker_bundle_consent",
          reason:
            evidence.length === 0
              ? "consent_required"
              : "consent_stale",
        },
      ]);
    }
  });

  test("local consent cannot substitute for explicitly required organization evidence", () => {
    const locallyConsented = card(true);
    const contribution = resolveExplicitInstructionContribution(
      locallyConsented,
      "/unused",
    )!;

    expect(
      resolveEffectiveInstructionConsent({
        card: locallyConsented,
        contribution,
        evidence: [],
        organizationBinding: {
          workerId: "worker:operator",
          artifactPinRef: "artifact:operator",
        },
      }),
    ).toEqual({ authorized: false, reason: "consent_required" });
  });
});
