// ABOUTME: Resolves DAH services-audience bearer auth from env or stored credentials.
// ABOUTME: Env-provided tokens are validated before send and are never persisted.

import { NotAuthenticatedError } from "../errors";
import { readCredentials, writeCredentials, type CliDahCredentialFileV3 } from "./credentials";
import { refreshToken, credentialFromTokens } from "./device-flow";
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
}): Promise<CliDahCredentialFileV3> {
  const current = input.credential ?? await readCredentials(input.credentialsPath);
  if (!current) throw new NotAuthenticatedError("Not authenticated. Run `drwn login` first.");
  const profile = input.profile ?? drwnCliProfile();
  const tokens = await refreshToken(profile, current.refreshToken, input.fetcher ?? fetch);
  const candidate = credentialFromTokens(profile, tokens, {
    credentialId: current.credentialId,
    generation: current.generation + 1,
    now: input.now,
  });
  const refreshed = typeof tokens.claims.email === "string"
    ? candidate
    : { ...candidate, userEmail: current.userEmail };
  await writeCredentials(input.credentialsPath, refreshed);
  return refreshed;
}
