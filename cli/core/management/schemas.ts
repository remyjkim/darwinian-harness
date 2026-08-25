// ABOUTME: Provides route-scoped request and success admission for management commands.
// ABOUTME: Converts schema failures into stable Worker errors without retaining server values.

import { DrwnError } from "../errors";
import {
  parseManagementRequest,
  parseManagementSuccess,
  type ManagementJsonObject,
} from "./contracts";
import type { ManagementRouteKey } from "./routes";

export function parseRouteRequest(
  routeKey: ManagementRouteKey,
  candidate: unknown,
): ManagementJsonObject {
  try {
    return parseManagementRequest(routeKey, candidate) as ManagementJsonObject;
  } catch {
    throw new DrwnError("VALIDATION_FAILED", `Invalid request for management route ${routeKey}.`);
  }
}

export function parseRouteSuccess(
  routeKey: ManagementRouteKey,
  candidate: unknown,
): ManagementJsonObject {
  try {
    return parseManagementSuccess(routeKey, candidate) as ManagementJsonObject;
  } catch {
    throw new DrwnError("SERVER_RESPONSE_INVALID", "The management server returned an invalid response.");
  }
}
