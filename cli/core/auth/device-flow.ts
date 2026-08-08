// ABOUTME: Runs the native DAH device flow for drwn login.
// ABOUTME: Polling yields an opaque session bearer kept in memory until exchanged for a services-audience JWT.

import type { CliAuthProfile } from "./profile";
import { assertJwtAudience, type JwtClaims } from "./jwt";
import { assertCredentialV3, type CliDahCredentialFileV3 } from "./credentials";

const DEVICE_CODE_PATH = "/api/auth/device/code";
const DEVICE_TOKEN_PATH = "/api/auth/device/token";
const AUTHORIZE_PATH = "/api/auth/oauth2/authorize";
const TOKEN_PATH = "/api/auth/oauth2/token";

export interface TokenBundle {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  claims: JwtClaims;
}

interface DeviceAuthorization {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface RunDeviceFlowInput {
  profile: CliAuthProfile;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  randomUUID?: () => string;
  onUserAction: (info: { verification_uri_complete: string; user_code: string }) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireTokenFields(tokens: TokenBundle): asserts tokens is TokenBundle & {
  refresh_token: string;
  expires_in: number;
} {
  if (typeof tokens.refresh_token !== "string" || tokens.refresh_token.length === 0) {
    throw new Error("DAH token response did not include refresh_token.");
  }
  if (typeof tokens.expires_in !== "number") {
    throw new Error("DAH token response did not include expires_in.");
  }
  if (!Number.isInteger(tokens.expires_in) || tokens.expires_in <= 0) {
    throw new Error("DAH token response included invalid expires_in.");
  }
}

async function postJson(fetcher: typeof fetch, url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function postForm(fetcher: typeof fetch, url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function startDeviceFlow(profile: CliAuthProfile, fetcher: typeof fetch): Promise<DeviceAuthorization> {
  const body = await postJson(fetcher, new URL(DEVICE_CODE_PATH, profile.hubOrigin).href, {
    client_id: profile.clientId,
    scope: profile.scope,
  });
  if (typeof body.device_code !== "string" || typeof body.user_code !== "string") {
    throw new Error("DAH device authorization response missing device_code/user_code.");
  }
  return body as unknown as DeviceAuthorization;
}

async function pollDeviceToken(
  profile: CliAuthProfile,
  fetcher: typeof fetch,
  device: DeviceAuthorization,
  sleep: (ms: number) => Promise<void>,
  now: () => number,
): Promise<string> {
  const expiresAt = now() + device.expires_in * 1000;
  let intervalMs = (device.interval ?? 5) * 1000;
  while (true) {
    await sleep(intervalMs);
    if (now() > expiresAt) throw new Error("device_code_expired");
    const body = await postJson(fetcher, new URL(DEVICE_TOKEN_PATH, profile.hubOrigin).href, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: profile.clientId,
      device_code: device.device_code,
    });
    if (typeof body.access_token === "string") return body.access_token;
    switch (body.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        intervalMs *= 2;
        break;
      case "access_denied":
        throw new Error("device_authorization_denied");
      case "expired_token":
        throw new Error("device_code_expired");
      default:
        throw new Error(`device_authorization_failed:${String(body.error ?? "unknown_error")}`);
    }
  }
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createPkcePair(): Promise<{ verifier: string; challenge: string; method: "S256" }> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)), method: "S256" };
}

function tokenBundleFromResponse(body: Record<string, unknown>, profile: CliAuthProfile): TokenBundle {
  if (typeof body.access_token !== "string") {
    throw new Error("DAH token response did not include access_token.");
  }
  const claims = assertJwtAudience(body.access_token, profile.resource, { issuer: profile.issuer });
  return {
    access_token: body.access_token,
    refresh_token: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expires_in: typeof body.expires_in === "number" ? body.expires_in : undefined,
    claims,
  };
}

export async function exchangeDeviceSession(
  profile: CliAuthProfile,
  deviceSessionBearer: string,
  fetcher: typeof fetch = fetch,
): Promise<TokenBundle> {
  const pkce = await createPkcePair();
  const authorizeUrl = new URL(AUTHORIZE_PATH, profile.hubOrigin);
  authorizeUrl.searchParams.set("client_id", profile.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", profile.redirectUri);
  authorizeUrl.searchParams.set("scope", profile.scope);
  authorizeUrl.searchParams.set("resource", profile.resource);
  authorizeUrl.searchParams.set("code_challenge", pkce.challenge);
  authorizeUrl.searchParams.set("code_challenge_method", pkce.method);

  const authorize = await fetcher(authorizeUrl.href, {
    method: "GET",
    headers: { authorization: `Bearer ${deviceSessionBearer}`, accept: "application/json" },
  });
  const authorizeBody = (await authorize.json()) as Record<string, unknown>;
  const code = typeof authorizeBody.code === "string"
    ? authorizeBody.code
    : typeof authorizeBody.url === "string"
      ? new URL(authorizeBody.url).searchParams.get("code")
      : null;
  if (!code) throw new Error("DAH authorize response did not include code.");

  const tokenBody = await postForm(fetcher, new URL(TOKEN_PATH, profile.hubOrigin).href, {
    grant_type: "authorization_code",
    code,
    code_verifier: pkce.verifier,
    redirect_uri: profile.redirectUri,
    client_id: profile.clientId,
    resource: profile.resource,
  });
  return tokenBundleFromResponse(tokenBody, profile);
}

export async function refreshToken(
  profile: CliAuthProfile,
  refreshTokenValue: string,
  fetcher: typeof fetch = fetch,
): Promise<TokenBundle> {
  const tokenBody = await postForm(fetcher, new URL(TOKEN_PATH, profile.hubOrigin).href, {
    grant_type: "refresh_token",
    client_id: profile.clientId,
    refresh_token: refreshTokenValue,
    resource: profile.resource,
  });
  return tokenBundleFromResponse(tokenBody, profile);
}

export async function revokeToken(
  profile: CliAuthProfile,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const res = await fetcher(new URL("/api/auth/oauth2/revoke", profile.hubOrigin).href, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      token,
      client_id: profile.clientId,
      token_type_hint: "refresh_token",
    }).toString(),
  });
  if (!res.ok) throw new Error(`DAH refresh-token revoke failed (${res.status}).`);
}

export function credentialFromTokens(
  profile: CliAuthProfile,
  tokens: TokenBundle,
  epoch: { credentialId: string; generation: number; now?: () => number },
): CliDahCredentialFileV3 {
  requireTokenFields(tokens);
  if (!Number.isSafeInteger(tokens.claims.iat) ||
    !Number.isSafeInteger(tokens.claims.exp) ||
    (tokens.claims.exp as number) <= (tokens.claims.iat as number)) {
    throw new Error("DAH access token is missing coherent iat/exp claims.");
  }
  const userEmail = typeof tokens.claims.email === "string" ? tokens.claims.email : "";
  const credential: CliDahCredentialFileV3 = {
    version: 3,
    credentialId: epoch.credentialId,
    generation: epoch.generation,
    issuer: profile.issuer,
    clientId: profile.clientId,
    resource: profile.resource,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    issuedAt: new Date((tokens.claims.iat as number) * 1000).toISOString(),
    expiresAt: new Date((tokens.claims.exp as number) * 1000).toISOString(),
    savedAt: new Date((epoch.now ?? Date.now)()).toISOString(),
    userEmail,
  };
  assertCredentialV3(credential);
  return credential;
}

export async function runDeviceFlow(input: RunDeviceFlowInput): Promise<CliDahCredentialFileV3> {
  const fetcher = input.fetcher ?? fetch;
  const sleep = input.sleep ?? defaultSleep;
  const now = input.now ?? Date.now;
  const device = await startDeviceFlow(input.profile, fetcher);
  input.onUserAction({
    verification_uri_complete: device.verification_uri_complete ?? device.verification_uri,
    user_code: device.user_code,
  });
  const opaque = await pollDeviceToken(input.profile, fetcher, device, sleep, now);
  const tokens = await exchangeDeviceSession(input.profile, opaque, fetcher);
  return credentialFromTokens(input.profile, tokens, {
    credentialId: (input.randomUUID ?? (() => crypto.randomUUID()))(),
    generation: 1,
    now,
  });
}
