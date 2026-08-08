// ABOUTME: Resolves DAH services-audience bearer auth from env or stored credentials.
// ABOUTME: Env-provided tokens are validated before send and are never persisted.

import { NotAuthenticatedError } from "../errors";
import { readCredentials, writeCredentials, type CliDahCredentialFileV3 } from "./credentials";
import { AuthRemoteOperationError, refreshToken, credentialFromTokens } from "./device-flow";
import { drwnCliProfile, type CliAuthProfile } from "./profile";
import { assertJwtAudience, tokenExpiresWithin } from "./jwt";

export interface ResolveTokenInput {
  credentialsPath: string;
  env: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  profile?: CliAuthProfile;
}

export interface ResolvedAuth {
  token: string;
  source?: "env" | "stored";
  credential?: CliDahCredentialFileV3;
}

const REFRESH_SKEW_MS = 120_000;

export type RefreshFailureReason =
  | "CREDENTIAL_PROFILE_MISMATCH"
  | "AUTH_REMOTE_REJECTED"
  | "AUTH_REMOTE_INDETERMINATE"
  | "AUTH_RESPONSE_INVALID"
  | "CREDENTIAL_WRITE_FAILED";

export type RefreshTransactionResult = {
  credential: CliDahCredentialFileV3;
  remote: {
    action: "refresh";
    result: "not_applicable" | "confirmed" | "rejected" | "indeterminate";
    httpClass: "not_applicable" | "2xx" | "3xx" | "4xx" | "5xx" | "network_error";
  };
  local: {
    action: "write";
    result: "confirmed" | "not_performed" | "failed";
    afterConfirmedRemoteRevoke: false;
  };
} & (
  | { outcome: "succeeded"; reason: null }
  | { outcome: "failed"; reason: RefreshFailureReason }
);

export class CredentialAbsentError extends Error {
  readonly code = "CREDENTIAL_ABSENT";

  constructor() {
    super("CREDENTIAL_ABSENT");
    this.name = "CredentialAbsentError";
  }
}

export class RefreshCredentialError extends Error {
  readonly code: RefreshFailureReason;

  constructor(public readonly result: Extract<RefreshTransactionResult, { outcome: "failed" }>) {
    super(result.reason);
    this.name = "RefreshCredentialError";
    this.code = result.reason;
  }
}

export async function resolveToken(input: ResolveTokenInput): Promise<ResolvedAuth | null> {
  const profile = input.profile ?? drwnCliProfile(input.env);
  const envToken = input.env.DRWN_TOKEN;
  if (envToken) {
    assertJwtAudience(envToken, profile.resource, { requireUnexpired: true });
    return {
      token: envToken,
      source: "env",
    };
  }

  const creds = await readCredentials(input.credentialsPath);
  if (!creds) return null;
  if (creds.resource !== profile.resource) {
    throw new NotAuthenticatedError(
      `Stored credentials target ${creds.resource}; run \`drwn login\` again for ${profile.resource}.`,
    );
  }
  if (creds.clientId !== profile.clientId) {
    throw new NotAuthenticatedError(
      `Stored credentials target client ${creds.clientId}; run \`drwn login\` again for ${profile.clientId}.`,
    );
  }
  if (creds.issuer !== profile.issuer) {
    throw new NotAuthenticatedError(
      `Stored credentials were issued by ${creds.issuer}; run \`drwn login\` again for ${profile.issuer}.`,
    );
  }

  if (!tokenExpiresWithin(creds.expiresAt, REFRESH_SKEW_MS)) {
    assertJwtAudience(creds.accessToken, profile.resource, { issuer: creds.issuer, requireUnexpired: true });
    return { token: creds.accessToken, source: "stored", credential: creds };
  }

  const refreshed = await refreshStoredCredential({
    credentialsPath: input.credentialsPath,
    credential: creds,
    profile,
    fetcher: input.fetcher,
  });
  return {
    token: refreshed.accessToken,
    source: "stored",
    credential: refreshed,
  };
}

export async function refreshStoredCredential(input: {
  credentialsPath: string;
  credential?: CliDahCredentialFileV3;
  profile?: CliAuthProfile;
  fetcher?: typeof fetch;
  now?: () => number;
  writeCredential?: typeof writeCredentials;
}): Promise<CliDahCredentialFileV3> {
  const result = await refreshStoredCredentialTransaction(input);
  if (result.outcome === "failed") throw new RefreshCredentialError(result);
  return result.credential;
}

export async function refreshStoredCredentialTransaction(input: {
  credentialsPath: string;
  credential?: CliDahCredentialFileV3;
  profile?: CliAuthProfile;
  fetcher?: typeof fetch;
  now?: () => number;
  writeCredential?: typeof writeCredentials;
}): Promise<RefreshTransactionResult> {
  const current = input.credential ?? await readCredentials(input.credentialsPath);
  if (!current) throw new CredentialAbsentError();
  const profile = input.profile ?? drwnCliProfile();
  if (
    current.issuer !== profile.issuer ||
    current.clientId !== profile.clientId ||
    current.resource !== profile.resource
  ) {
    return {
      outcome: "failed",
      credential: current,
      remote: { action: "refresh", result: "not_applicable", httpClass: "not_applicable" },
      local: { action: "write", result: "not_performed", afterConfirmedRemoteRevoke: false },
      reason: "CREDENTIAL_PROFILE_MISMATCH",
    };
  }

  let tokens;
  try {
    tokens = await refreshToken(profile, current.refreshToken, input.fetcher ?? fetch);
  } catch (error) {
    const classified = error instanceof AuthRemoteOperationError
      ? error
      : new AuthRemoteOperationError("AUTH_RESPONSE_INVALID", "rejected", "2xx");
    return {
      outcome: "failed",
      credential: current,
      remote: { action: "refresh", result: classified.result, httpClass: classified.httpClass },
      local: { action: "write", result: "not_performed", afterConfirmedRemoteRevoke: false },
      reason: classified.reason,
    };
  }

  let candidate: CliDahCredentialFileV3;
  try {
    const refreshedAt = (input.now ?? Date.now)();
    candidate = credentialFromTokens(profile, tokens, {
      credentialId: current.credentialId,
      generation: current.generation + 1,
      now: () => refreshedAt,
    });
    if (Date.parse(candidate.expiresAt) <= refreshedAt) {
      throw new Error("expired refresh response");
    }
  } catch {
    return {
      outcome: "failed",
      credential: current,
      remote: { action: "refresh", result: "rejected", httpClass: "2xx" },
      local: { action: "write", result: "not_performed", afterConfirmedRemoteRevoke: false },
      reason: "AUTH_RESPONSE_INVALID",
    };
  }
  const refreshed = typeof tokens.claims.email === "string"
    ? candidate
    : { ...candidate, userEmail: current.userEmail };
  try {
    await (input.writeCredential ?? writeCredentials)(input.credentialsPath, refreshed);
  } catch {
    return {
      outcome: "failed",
      credential: current,
      remote: { action: "refresh", result: "confirmed", httpClass: "2xx" },
      local: { action: "write", result: "failed", afterConfirmedRemoteRevoke: false },
      reason: "CREDENTIAL_WRITE_FAILED",
    };
  }
  return {
    outcome: "succeeded",
    credential: refreshed,
    remote: { action: "refresh", result: "confirmed", httpClass: "2xx" },
    local: { action: "write", result: "confirmed", afterConfirmedRemoteRevoke: false },
    reason: null,
  };
}
