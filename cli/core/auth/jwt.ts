// ABOUTME: Lightweight JWT claim decoding and audience validation for CLI-side checks.
// ABOUTME: Signature verification remains the Deploy API's job; the CLI rejects opaque/wrong-audience tokens before send.

export interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  azp?: string;
  scope?: string;
  scp?: string | string[];
  iat?: number;
  exp?: number;
  email?: string;
  [claim: string]: unknown;
}

export function parseSpaceDelimitedScopeClaim(value: unknown): readonly string[] | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^[^\s]+(?: [^\s]+)*$/.test(value)) {
    throw new JwtAudienceError("Token scope claim is malformed.");
  }
  const scopes = value.split(" ");
  if (new Set(scopes).size !== scopes.length) {
    throw new JwtAudienceError("Token scope claim contains duplicates.");
  }
  return scopes;
}

export function jwtScopeSetsEqual(left: unknown, right: unknown): boolean {
  const a = parseSpaceDelimitedScopeClaim(left);
  const b = parseSpaceDelimitedScopeClaim(right);
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  const rightSet = new Set(b);
  return a.every((scope) => rightSet.has(scope));
}

export class JwtAudienceError extends Error {
  constructor(message = "Token is not a valid services-audience DAH JWT.") {
    super(message);
    this.name = "JwtAudienceError";
  }
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
}

export function decodeJwtClaims(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new JwtAudienceError("Token is not JWT-shaped.");
  }
  try {
    return decodeBase64UrlJson(parts[1]) as JwtClaims;
  } catch {
    throw new JwtAudienceError("Token payload is not valid JWT JSON.");
  }
}

export function assertJwtAudience(
  token: string,
  resource: string,
  opts: { issuer?: string; requireUnexpired?: boolean } = {},
): JwtClaims {
  const claims = decodeJwtClaims(token);
  if (opts.issuer && claims.iss !== opts.issuer) {
    throw new JwtAudienceError(`Token issuer ${String(claims.iss)} does not match ${opts.issuer}.`);
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud === undefined ? [] : [claims.aud];
  if (!audiences.includes(resource)) {
    throw new JwtAudienceError(`Token audience does not include ${resource}.`);
  }
  if (opts.requireUnexpired) {
    if (!Number.isSafeInteger(claims.exp)) {
      throw new JwtAudienceError("Token expiry is missing or invalid.");
    }
    if ((claims.exp as number) <= Math.floor(Date.now() / 1000)) {
      throw new JwtAudienceError("Token is expired.");
    }
  }
  return claims;
}

export function tokenExpiresWithin(expiresAt: string, skewMs: number): boolean {
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts - Date.now() <= skewMs;
}
