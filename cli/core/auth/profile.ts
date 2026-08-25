// ABOUTME: Derives DAH auth inputs from the one selected deployed Worker cloud tuple.
// ABOUTME: Keeps issuer, resource, client, and exact delegation scope non-overridable.

import { resolveCloudProfile, type CloudProfileId } from "../management/profile";

export interface CliAuthProfile {
  clientId: "drwn-cli";
  resource: string;
  scope: string;
  hubOrigin: string;
  issuer: string;
  redirectUri: string;
  apiOrigin: string;
  webOrigin: string;
  cloudProfileId: CloudProfileId;
  profileDigest: string;
}

export const DAH_API_ORIGINS = {
  services: "https://api.darwinian.dev",
} as const;

export const DAH_CLIENT_IDS = {
  drwnCli: "drwn-cli",
} as const;

export const DAH_SCOPES = "openid email offline_access dah:management.delegate" as const;

export function dahIssuerFor(origin: string): string {
  return new URL("/api/auth", origin).href;
}

export function drwnCliProfile(
  env: Record<string, string | undefined> = process.env,
): CliAuthProfile {
  const cloud = resolveCloudProfile(env);
  return {
    clientId: DAH_CLIENT_IDS.drwnCli,
    resource: cloud.resource,
    scope: cloud.requestedScopes.join(" "),
    hubOrigin: cloud.authHubOrigin,
    issuer: cloud.issuer,
    redirectUri: "http://127.0.0.1/callback",
    apiOrigin: cloud.apiOrigin,
    webOrigin: cloud.webOrigin,
    cloudProfileId: cloud.profileId,
    profileDigest: cloud.profileDigest,
  };
}
