// ABOUTME: Enforces the management-only DAH delegation claim boundary on existing credentials.
// ABOUTME: Refuses old consent before refresh and never creates a second token or credential family.

import { DrwnError, NotAuthenticatedError } from "../errors";
import type { KeychainBackend } from "../secret-store";
import { readCredentials, type CliDahCredentialFileV3 } from "./credentials";
import { drwnCliProfile, type CliAuthProfile } from "./profile";
import {
  decodeJwtClaims,
  jwtScopeSetsEqual,
  parseSpaceDelimitedScopeClaim,
  tokenExpiresWithin,
  type JwtClaims,
} from "./jwt";
import type { ResolvedAuth } from "./resolve-token";

const REFRESH_SKEW_MS = 120_000;
const MAX_HUMAN_SUBJECT_LENGTH = 256;
const DELEGATION_SCOPE = "dah:management.delegate";

export interface DelegationReadinessOptions {
  requireUnexpired?: boolean;
  nowSeconds?: number;
}

export interface ResolveDelegationReadyTokenInput {
  credentialsPath: string;
  env: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  profile?: CliAuthProfile;
  keychainBackend?: KeychainBackend;
}

function invalidAuthResponse(): DrwnError {
  return new DrwnError("AUTH_RESPONSE_INVALID", "DAH returned credentials that are not delegation-ready.");
}

function consentRequired(): DrwnError {
  return new DrwnError(
    "MANAGEMENT_CONSENT_REQUIRED",
    "Deployed Worker management requires a fresh interactive `drwn login` consent.",
  );
}

function isBoundedHumanSubject(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= MAX_HUMAN_SUBJECT_LENGTH &&
    !/[\s\u0000-\u001f\u007f]/u.test(value);
}

function hasExactDelegationAudience(value: unknown, profile: CliAuthProfile): boolean {
  if (value === profile.resource) return true;
  if (!Array.isArray(value) || value.length !== 2 ||
    value.some((audience) => typeof audience !== "string")) return false;
  const audiences = new Set(value as string[]);
  return audiences.size === 2 &&
    audiences.has(profile.resource) &&
    audiences.has(`${profile.issuer}/oauth2/userinfo`);
}

export function assertDelegationReadyClaims(
  claims: JwtClaims,
  profile: CliAuthProfile,
  options: DelegationReadinessOptions = {},
): JwtClaims {
  try {
    const requiredScopes = parseSpaceDelimitedScopeClaim(profile.scope);
    const observedScopes = parseSpaceDelimitedScopeClaim(claims.scope);
    const expiry = claims.exp;
    if (
      claims.iss !== profile.issuer ||
      !hasExactDelegationAudience(claims.aud, profile) ||
      claims.azp !== profile.clientId ||
      !isBoundedHumanSubject(claims.sub) ||
      claims.scp !== undefined ||
      observedScopes === null ||
      requiredScopes === null ||
      !jwtScopeSetsEqual(claims.scope, profile.scope) ||
      !Number.isSafeInteger(expiry) ||
      ((options.requireUnexpired ?? true) &&
        (expiry as number) <= (options.nowSeconds ?? Math.floor(Date.now() / 1000)))
    ) {
      throw invalidAuthResponse();
    }
    return claims;
  } catch (error) {
    if (error instanceof DrwnError && error.code === "AUTH_RESPONSE_INVALID") throw error;
    throw invalidAuthResponse();
  }
}

function assertCredentialProfile(credential: CliDahCredentialFileV3, profile: CliAuthProfile): void {
  if (
    credential.resource !== profile.resource ||
    credential.clientId !== profile.clientId ||
    credential.issuer !== profile.issuer
  ) {
    throw new NotAuthenticatedError("Stored credentials do not match the selected cloud profile; run `drwn login` again.");
  }
}

function currentDelegationClaims(credential: CliDahCredentialFileV3, profile: CliAuthProfile): JwtClaims {
  let claims: JwtClaims;
  try {
    claims = decodeJwtClaims(credential.accessToken);
    const scopes = parseSpaceDelimitedScopeClaim(claims.scope);
    if (scopes === null || !scopes.includes(DELEGATION_SCOPE)) throw consentRequired();
    assertDelegationReadyClaims(claims, profile, { requireUnexpired: false });
    return claims;
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw invalidAuthResponse();
  }
}

export async function resolveDelegationReadyToken(
  input: ResolveDelegationReadyTokenInput,
): Promise<ResolvedAuth | null> {
  const profile = input.profile ?? drwnCliProfile(input.env);
  const envToken = input.env.DRWN_TOKEN;
  if (envToken) {
    let claims: JwtClaims;
    try {
      claims = decodeJwtClaims(envToken);
    } catch {
      throw invalidAuthResponse();
    }
    assertDelegationReadyClaims(claims, profile);
    return { token: envToken, source: "env" };
  }

  const credential = await readCredentials(input.credentialsPath, input.keychainBackend);
  if (!credential) return null;
  assertCredentialProfile(credential, profile);
  const currentClaims = currentDelegationClaims(credential, profile);

  if (!tokenExpiresWithin(credential.expiresAt, REFRESH_SKEW_MS)) {
    assertDelegationReadyClaims(currentClaims, profile);
    return { token: credential.accessToken, source: "stored", credential };
  }

  // Imported at the call boundary to keep device-flow claim validation free of an
  // auth-module initialization cycle.
  const { refreshStoredCredential } = await import("./resolve-token");
  const refreshed = await refreshStoredCredential({
    credentialsPath: input.credentialsPath,
    credential,
    profile,
    fetcher: input.fetcher,
    keychainBackend: input.keychainBackend,
    validateCandidateClaims: (claims) => assertDelegationReadyClaims(claims, profile),
  });
  return { token: refreshed.accessToken, source: "stored", credential: refreshed };
}
