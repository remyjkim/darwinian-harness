// ABOUTME: Runs the exact I321 Phase-A executor through the composite Worker port.
// ABOUTME: Returns only the two I321-projected public objects and canonical byte streams.

import { DrwnError } from "../errors";
import { executeI321ManagementPhaseA } from "./phase-a";
import { createI321PhaseACompositePort } from "./phase-a-port-client";
import { loadI321PhaseAPortWireAuthority } from "./phase-a-port-wire";

export interface ExecuteI321PhaseAQualificationInput {
  plan: unknown;
  adapterOrigin: string;
  credential: {
    accessToken: string;
    issuedAt: string;
    expiresAt: string;
  };
  fetcher?: typeof fetch;
  now?: () => number;
  requestId?: () => string;
  receiptId?: () => string;
}

export interface I321PhaseAPublicProjection {
  readiness: Record<string, unknown>;
  community: Record<string, unknown>;
  readinessBytes: Uint8Array;
  communityBytes: Uint8Array;
}

function refusal(): never {
  throw new DrwnError(
    "STAGING_COMMUNITY_QUALIFICATION_INVALID",
    "Staging Community qualification refused.",
  );
}

function qualificationRunId(plan: unknown): string {
  if (
    plan === null ||
    typeof plan !== "object" ||
    !("qualificationRunId" in plan) ||
    typeof plan.qualificationRunId !== "string"
  ) refusal();
  return plan.qualificationRunId;
}

function parseProjection(candidate: Record<string, unknown>): I321PhaseAPublicProjection {
  if (
    candidate.readiness === null || typeof candidate.readiness !== "object" ||
    candidate.community === null || typeof candidate.community !== "object" ||
    !(candidate.readinessBytes instanceof Uint8Array) ||
    !(candidate.communityBytes instanceof Uint8Array)
  ) refusal();
  return Object.freeze({
    readiness: candidate.readiness as Record<string, unknown>,
    community: candidate.community as Record<string, unknown>,
    readinessBytes: candidate.readinessBytes,
    communityBytes: candidate.communityBytes,
  });
}

export async function executeI321PhaseAQualification(
  input: ExecuteI321PhaseAQualificationInput,
): Promise<I321PhaseAPublicProjection> {
  try {
    const port = await createI321PhaseACompositePort({
      adapterOrigin: input.adapterOrigin,
      accessToken: input.credential.accessToken,
      issuedAt: input.credential.issuedAt,
      expiresAt: input.credential.expiresAt,
      qualificationRunId: qualificationRunId(input.plan),
      fetcher: input.fetcher,
      requestId: input.requestId,
    });
    const result = await executeI321ManagementPhaseA({
      plan: input.plan,
      port,
      now: input.now,
      randomUuid: input.receiptId,
    });
    const authority = await loadI321PhaseAPortWireAuthority();
    return parseProjection(await authority.projector.projectI321PhaseAPublicReceiptsV1(result));
  } catch (error) {
    if (error instanceof DrwnError && error.code === "STAGING_COMMUNITY_QUALIFICATION_INVALID") {
      throw error;
    }
    refusal();
  }
}
