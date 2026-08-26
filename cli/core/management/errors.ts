// ABOUTME: Admits and projects the closed public management error vocabulary.
// ABOUTME: Drops server-authored messages so results retain only reviewed safe fields.

import { DrwnError } from "../errors";
import { managementContract, managementSchemaName, managementSchemas } from "./contracts";
import { managementRoutes, type ManagementRouteKey } from "./routes";

export type ManagementErrorCode = typeof managementContract.errors.clientCodes[number];
export type ManagementWireErrorCode = typeof managementContract.errors.wireCodes[number];

export interface ManagementPublicError {
  code: ManagementErrorCode;
  retryable: boolean;
  retryAfterSeconds?: number;
}

const errorCodes = new Set<string>(managementContract.errors.clientCodes);
const retryableCodes = new Set<ManagementErrorCode>(["RATE_LIMITED", "TEMPORARILY_UNAVAILABLE"]);
const retryableWireCodes = new Set<ManagementWireErrorCode>(managementContract.errors.retryableWireCodes);

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
  routeKey: ManagementRouteKey,
): Readonly<ManagementPublicError> {
  try {
    if (status === 410) {
      const parsed = managementSchemas.MindContractRemovedFailure!.parse(candidate) as { error: ManagementWireErrorCode };
      if (parsed.error !== "mind_contract_removed") throw invalidServerResponse();
      return Object.freeze({ code: "MIND_CONTRACT_REMOVED", retryable: false });
    }
    if (status === 426) {
      const parsed = managementSchemas.ClientProtocolUnsupportedFailure!.parse(candidate) as { error: ManagementWireErrorCode };
      if (parsed.error !== "client_protocol_unsupported") throw invalidServerResponse();
      return Object.freeze({ code: "UNSUPPORTED_PROTOCOL", retryable: false });
    }

    const route = managementRoutes[routeKey];
    const parsed = managementSchemas[managementSchemaName(route.failureSchema)]!.parse(candidate) as {
      requestId: string;
      error: ManagementWireErrorCode;
      retryAfterSeconds?: number;
    };
    const code = managementContract.errors.clientCodeByWireCode[parsed.error];
    const retryable = retryableWireCodes.has(parsed.error);
    const allowedWireCodes = managementContract.errors.routeWireCodes[routeKey];
    if (
      parsed.requestId !== expectedRequestId ||
      managementContract.errors.httpStatusByWireCode[parsed.error] !== status ||
      allowedWireCodes === undefined ||
      !allowedWireCodes.includes(parsed.error) ||
      code === undefined ||
      retryable !== retryableCodes.has(code) ||
      (!retryable && parsed.retryAfterSeconds !== undefined)
    ) {
      throw invalidServerResponse();
    }
    return Object.freeze({
      code,
      retryable,
      ...(parsed.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: parsed.retryAfterSeconds }),
    });
  } catch (error) {
    if (error instanceof DrwnError && error.code === "SERVER_RESPONSE_INVALID") throw error;
    throw invalidServerResponse();
  }
}
