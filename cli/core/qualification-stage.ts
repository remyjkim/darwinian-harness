// ABOUTME: Defines the closed, non-secret failure vocabulary for hidden staging qualification.
// ABOUTME: Commands may emit only these stages and the stable qualification failure code.

import { DrwnError } from "./errors";

export const STAGING_QUALIFICATION_FAILURE_STAGES = [
  "device_authorization_failed",
  "oauth_consent_failed",
  "access_token_validation_failed",
  "phase_a_execution_failed",
  "normal_cleanup_failed",
  "receipt_projection_failed",
  "public_output_commit_failed",
] as const;

export type StagingQualificationFailureStage =
  typeof STAGING_QUALIFICATION_FAILURE_STAGES[number];

export class StagingQualificationStageError extends DrwnError {
  constructor(public readonly stage: StagingQualificationFailureStage) {
    super(
      "STAGING_COMMUNITY_QUALIFICATION_INVALID",
      "Staging Community qualification refused.",
    );
    this.name = "StagingQualificationStageError";
  }
}

export function stagingQualificationFailure(
  stage: StagingQualificationFailureStage,
): StagingQualificationStageError {
  return new StagingQualificationStageError(stage);
}

export function classifyStagingQualificationFailure(
  error: unknown,
  fallback: StagingQualificationFailureStage,
): StagingQualificationStageError {
  return error instanceof StagingQualificationStageError
    ? error
    : stagingQualificationFailure(fallback);
}
