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
} as const;

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
  const hubOrigin = trimTrailingSlashes(env.DRWN_DAH_HUB_URL ?? "https://auth.darwinian.dev");
  const resource = trimTrailingSlashes(env.DRWN_DAH_RESOURCE ?? DAH_API_ORIGINS.services);
  return {
    clientId: DAH_CLIENT_IDS.drwnCli,
    resource,
    scope: DAH_SCOPES,
    hubOrigin,
    issuer: dahIssuerFor(hubOrigin),
    redirectUri: "http://127.0.0.1/callback",
  };
}
