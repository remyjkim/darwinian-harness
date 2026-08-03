// ABOUTME: Shared presenter for errors caught by drwn worker commands.
// ABOUTME: Reserves the "Cannot reach Deploy API" banner for genuine connectivity failures (I65 Fix 3).

import { JwtAudienceError } from "./auth/jwt";
import { NotAuthenticatedError } from "./errors";

// Secondary substring heuristic (plan Option B) for auth-flow failures that
// surface as plain Errors — e.g. DAH refresh/token-response errors thrown
// below the typed layer (GATE 2 review note 1).
const AUTH_MESSAGE_PATTERN = /drwn login|DAH token response/;

export function describeWorkerError(error: unknown, apiBaseUrl: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof NotAuthenticatedError || error instanceof JwtAudienceError) {
    return message;
  }
  if (AUTH_MESSAGE_PATTERN.test(message)) {
    return message;
  }
  return `Cannot reach Deploy API at ${apiBaseUrl}: ${message}`;
}
