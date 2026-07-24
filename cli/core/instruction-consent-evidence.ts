// ABOUTME: Resolves exact local or organization evidence for one explicit instruction contribution.
// ABOUTME: Keeps external ratifier provenance distinct from mutable local Card consent.

import type { CardLockEntry } from "./card-lock";
import type { ExplicitInstructionContribution } from "./instruction-contribution";
import { satisfies, validRange } from "./semver-utils";

export interface LocalCardInstructionConsentEvidence {
  kind: "local_card_consent";
  cardName: string;
  consentedRange: string;
  contentDigest: `sha256-${string}`;
  consentedAt: string;
}

export interface OrgWorkerBundleInstructionConsentEvidence {
  kind: "org_worker_bundle_consent";
  bundleDigest: `sha256:${string}`;
  sourceBlueprint: {
    id: string;
    revision: number;
    digest: `sha256:${string}`;
  };
  consentId: string;
  workerId: string;
  artifactPinRef: string;
  consentedRange: string;
  contentDigest: `sha256-${string}`;
  ratifierRef: string;
  evidenceRefs: string[];
  projectionSurface: "worker_instructions";
}

export type EffectiveInstructionConsentEvidence =
  | LocalCardInstructionConsentEvidence
  | OrgWorkerBundleInstructionConsentEvidence;

export interface OrganizationInstructionConsentContext {
  workerId: string;
  artifactPinRefsByCard: Readonly<Record<string, string>>;
  evidence: readonly OrgWorkerBundleInstructionConsentEvidence[];
}

export type InstructionConsentResolution =
  | {
      authorized: true;
      evidence: EffectiveInstructionConsentEvidence;
    }
  | {
      authorized: false;
      reason: "consent_required" | "consent_stale";
    };

const safeId = /^[^\u0000-\u001f\u007f]{1,160}$/;
const sha256Colon = /^sha256:[a-f0-9]{64}$/;
const sha256Hyphen = /^sha256-[a-f0-9]{64}$/;

function isIsoTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function localEvidence(
  card: CardLockEntry,
): LocalCardInstructionConsentEvidence | null {
  if (!card.instructionConsent) return null;
  return {
    kind: "local_card_consent",
    cardName: card.name,
    consentedAt: card.instructionConsent.consentedAt,
    consentedRange: card.instructionConsent.consentedRange,
    contentDigest: card.instructionConsent.contentDigest,
  };
}

function localEvidenceValid(input: {
  card: CardLockEntry;
  contribution: ExplicitInstructionContribution;
  evidence: LocalCardInstructionConsentEvidence;
}): boolean {
  return (
    input.evidence.cardName === input.card.name &&
    isIsoTimestamp(input.evidence.consentedAt) &&
    validRange(input.evidence.consentedRange) &&
    satisfies(input.card.version, input.evidence.consentedRange, {
      includePrerelease: true,
    }) &&
    sha256Hyphen.test(input.evidence.contentDigest) &&
    input.evidence.contentDigest === input.contribution.contentDigest
  );
}

function organizationEvidenceValid(input: {
  card: CardLockEntry;
  contribution: ExplicitInstructionContribution;
  evidence: OrgWorkerBundleInstructionConsentEvidence;
  binding:
    | {
        workerId: string;
        artifactPinRef: string;
      }
    | undefined;
}): boolean {
  const { evidence, binding } = input;
  return Boolean(
    binding &&
      safeId.test(binding.workerId) &&
      safeId.test(binding.artifactPinRef) &&
      evidence.kind === "org_worker_bundle_consent" &&
      sha256Colon.test(evidence.bundleDigest) &&
      safeId.test(evidence.sourceBlueprint.id) &&
      Number.isInteger(evidence.sourceBlueprint.revision) &&
      evidence.sourceBlueprint.revision > 0 &&
      sha256Colon.test(evidence.sourceBlueprint.digest) &&
      safeId.test(evidence.consentId) &&
      evidence.workerId === binding.workerId &&
      evidence.artifactPinRef === binding.artifactPinRef &&
      validRange(evidence.consentedRange) &&
      satisfies(input.card.version, evidence.consentedRange, {
        includePrerelease: true,
      }) &&
      sha256Hyphen.test(evidence.contentDigest) &&
      evidence.contentDigest === input.contribution.contentDigest &&
      safeId.test(evidence.ratifierRef) &&
      evidence.evidenceRefs.length > 0 &&
      evidence.evidenceRefs.length <= 32 &&
      evidence.evidenceRefs.every((ref) => safeId.test(ref)) &&
      evidence.projectionSurface === "worker_instructions",
  );
}

export function resolveEffectiveInstructionConsent(input: {
  card: CardLockEntry;
  contribution: ExplicitInstructionContribution;
  evidence: readonly OrgWorkerBundleInstructionConsentEvidence[];
  organizationBinding?: {
    workerId: string;
    artifactPinRef: string;
  };
}): InstructionConsentResolution {
  const local = localEvidence(input.card);
  if (input.organizationBinding) {
    for (const evidence of input.evidence) {
      if (
        organizationEvidenceValid({
          card: input.card,
          contribution: input.contribution,
          evidence,
          binding: input.organizationBinding,
        })
      ) {
        return { authorized: true, evidence };
      }
    }
    return {
      authorized: false,
      reason:
        input.evidence.length > 0 ? "consent_stale" : "consent_required",
    };
  }
  if (
    local &&
    localEvidenceValid({
      card: input.card,
      contribution: input.contribution,
      evidence: local,
    })
  ) {
    return { authorized: true, evidence: local };
  }
  return {
    authorized: false,
    reason: local ? "consent_stale" : "consent_required",
  };
}
