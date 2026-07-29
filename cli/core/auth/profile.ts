// ABOUTME: Central DAH profile selection for the drwn CLI.
// ABOUTME: Keeps hub, issuer, resource, client id, and scope out of command files.

import { trimTrailingSlashes } from "../url";

export interface CliAuthProfile {
  clientId: "drwn-cli";
  resource: string;
  scope: string;
  hubOrigin: string;
  issuer: string;
  redirectUri: string;
}

export const DAH_API_ORIGINS = {
  services: "https://api.darwinian.dev",
  legacyServices: "https://api.darwiniantools.com",
} as const;

const LEGACY_STUDIO_API_ORIGIN = "https://studio.darwiniantools.com";

export const DAH_CLIENT_IDS = {
  drwnCli: "drwn-cli",
} as const;

export const DAH_SCOPES = "openid email offline_access" as const;

export function dahIssuerFor(origin: string): string {
  return new URL("/api/auth", origin).href;
}

export function drwnCliProfile(
  env: Record<string, string | undefined> = process.env,
): CliAuthProfile {
  const hubOrigin = trimTrailingSlashes(env.DRWN_DAH_HUB_URL ?? "https://auth.darwiniantools.com");
  const selectedApiOrigin = env.DRWN_STUDIO_API_URL
    ? trimTrailingSlashes(env.DRWN_STUDIO_API_URL)
    : undefined;
  const defaultResource = selectedApiOrigin === LEGACY_STUDIO_API_ORIGIN
    ? DAH_API_ORIGINS.legacyServices
    : DAH_API_ORIGINS.services;
  const resource = trimTrailingSlashes(env.DRWN_DAH_RESOURCE ?? defaultResource);
  return {
    clientId: DAH_CLIENT_IDS.drwnCli,
    resource,
    scope: DAH_SCOPES,
    hubOrigin,
    issuer: dahIssuerFor(hubOrigin),
    redirectUri: "http://127.0.0.1/callback",
  };
}
