// ABOUTME: Runs the exact I321 Phase-A executor through the composite Worker port.
// ABOUTME: Returns only the two I321-projected public objects and canonical byte streams.

import { executeI321ManagementPhaseA } from "./phase-a";
import type { I321ManagementPhaseAPort, I321ManagementPhaseAResult } from "./phase-a";
import { createI321PhaseACompositePort } from "./phase-a-port-client";
import { loadI321PhaseAPortWireAuthority } from "./phase-a-port-wire";
import {
  classifyStagingQualificationFailure,
  stagingQualificationFailure,
} from "../qualification-stage";

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

export interface I321PhaseAQualificationDependencies {
  createPort?: typeof createI321PhaseACompositePort;
  execute?: (input: {
    plan: unknown;
    port: I321ManagementPhaseAPort;
    now?: () => number;
    randomUuid?: () => string;
  }) => Promise<I321ManagementPhaseAResult>;
  project?: (result: I321ManagementPhaseAResult) => Promise<Record<string, unknown>>;
}

function qualificationRunId(plan: unknown): string {
  if (
    plan === null ||
    typeof plan !== "object" ||
    !("qualificationRunId" in plan) ||
    typeof plan.qualificationRunId !== "string"
  ) throw stagingQualificationFailure("phase_a_execution_failed");
  return plan.qualificationRunId;
}

function parseProjection(candidate: Record<string, unknown>): I321PhaseAPublicProjection {
  if (
    candidate.readiness === null || typeof candidate.readiness !== "object" ||
    candidate.community === null || typeof candidate.community !== "object" ||
    !(candidate.readinessBytes instanceof Uint8Array) ||
    !(candidate.communityBytes instanceof Uint8Array)
  ) throw stagingQualificationFailure("receipt_projection_failed");
  return Object.freeze({
    readiness: candidate.readiness as Record<string, unknown>,
    community: candidate.community as Record<string, unknown>,
    readinessBytes: candidate.readinessBytes as Uint8Array,
    communityBytes: candidate.communityBytes as Uint8Array,
  });
}

export async function executeI321PhaseAQualification(
  input: ExecuteI321PhaseAQualificationInput,
  dependencies: I321PhaseAQualificationDependencies = {},
): Promise<I321PhaseAPublicProjection> {
  let port: I321ManagementPhaseAPort;
  try {
    port = await (dependencies.createPort ?? createI321PhaseACompositePort)({
      adapterOrigin: input.adapterOrigin,
      accessToken: input.credential.accessToken,
      issuedAt: input.credential.issuedAt,
      expiresAt: input.credential.expiresAt,
      qualificationRunId: qualificationRunId(input.plan),
      fetcher: input.fetcher,
      requestId: input.requestId,
    });
  } catch (error) {
    throw classifyStagingQualificationFailure(error, "phase_a_execution_failed");
  }
  let cleanupFailed = false;
  const classifiedPort: I321ManagementPhaseAPort = {
    execute: (request) => port.execute(request),
    cleanup: async () => {
      try {
        return await port.cleanup();
      } catch {
        cleanupFailed = true;
        throw stagingQualificationFailure("normal_cleanup_failed");
      }
    },
  };
  let result: I321ManagementPhaseAResult;
  try {
    result = await (dependencies.execute ?? executeI321ManagementPhaseA)({
      plan: input.plan,
      port: classifiedPort,
      now: input.now,
      randomUuid: input.receiptId,
    });
  } catch (error) {
    throw classifyStagingQualificationFailure(
      error,
      cleanupFailed ? "normal_cleanup_failed" : "phase_a_execution_failed",
    );
  }
  try {
    const projected = dependencies.project
      ? await dependencies.project(result)
      : await (await loadI321PhaseAPortWireAuthority())
        .projector.projectI321PhaseAPublicReceiptsV1(result);
    return parseProjection(projected);
  } catch {
    throw stagingQualificationFailure("receipt_projection_failed");
  }
}
