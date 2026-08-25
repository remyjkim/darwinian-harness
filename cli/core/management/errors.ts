// ABOUTME: Admits and projects the closed public management error vocabulary.
// ABOUTME: Drops server-authored messages so results retain only reviewed safe fields.

import { DrwnError } from "../errors";
import { managementContract, managementSchemas } from "./contracts";

export type ManagementErrorCode = typeof managementContract.errors.codes[number];

export interface ManagementPublicError {
  code: ManagementErrorCode;
  retryable: boolean;
  retryAfterSeconds?: number;
}

const errorCodes = new Set<string>(managementContract.errors.codes);
const retryableCodes = new Set<ManagementErrorCode>(["RATE_LIMITED", "TEMPORARILY_UNAVAILABLE"]);

function invalidServerResponse(): DrwnError {
  return new DrwnError("SERVER_RESPONSE_INVALID", "The management server returned an invalid response.");
}

export function isManagementErrorCode(value: unknown): value is ManagementErrorCode {
  return typeof value === "string" && errorCodes.has(value);
}

export function isRetryableManagementErrorCode(code: ManagementErrorCode): boolean {
  return retryableCodes.has(code);
}

export function parseManagementPublicError(
  candidate: unknown,
  status: number,
  expectedRequestId: string,
): Readonly<ManagementPublicError> {
  try {
    const parsed = managementSchemas.PublicError!.parse(candidate) as {
      requestId: string;
      code: ManagementErrorCode;
      retryable: boolean;
      retryAfterSeconds?: number;
    };
    if (
      parsed.requestId !== expectedRequestId ||
      managementContract.errors.httpStatusByCode[parsed.code] !== status ||
      parsed.retryable !== retryableCodes.has(parsed.code) ||
      (!parsed.retryable && parsed.retryAfterSeconds !== undefined)
    ) {
      throw invalidServerResponse();
    }
    return Object.freeze({
      code: parsed.code,
      retryable: parsed.retryable,
      ...(parsed.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: parsed.retryAfterSeconds }),
    });
  } catch (error) {
    if (error instanceof DrwnError && error.code === "SERVER_RESPONSE_INVALID") throw error;
    throw invalidServerResponse();
  }
}
