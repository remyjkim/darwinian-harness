// ABOUTME: Lightweight JWT claim decoding and audience validation for CLI-side checks.
// ABOUTME: Signature verification remains the Deploy API's job; the CLI rejects opaque/wrong-audience tokens before send.

export interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
  email?: string;
  [claim: string]: unknown;
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
  if (opts.requireUnexpired && typeof claims.exp === "number" && claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new JwtAudienceError("Token is expired.");
  }
  return claims;
}

export function tokenExpiresWithin(expiresAt: string, skewMs: number): boolean {
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts - Date.now() <= skewMs;
}
