// ABOUTME: Reads and writes the sole supported v3 DAH credential payload.
// ABOUTME: Rejects legacy, malformed, and JWT-incoherent payloads before they enter product auth paths.

import { clear, CredentialSchemaUnsupportedError, decryptFromDisk, encryptToDisk } from "../secret-store";
import { assertJwtAudience } from "./jwt";

export interface CliDahCredentialFileV3 {
  version: 3;
  credentialId: string;
  generation: number;
  issuer: string;
  clientId: "drwn-cli";
  resource: string;
  accessToken: string;
  refreshToken: string;
  issuedAt: string;
  expiresAt: string;
  savedAt: string;
  userEmail: string;
}

const CREDENTIAL_KEYS = [
  "accessToken",
  "clientId",
  "credentialId",
  "expiresAt",
  "generation",
  "issuedAt",
  "issuer",
  "refreshToken",
  "resource",
  "savedAt",
  "userEmail",
  "version",
] as const;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function isExactCredentialRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value).sort();
  return keys.join("\0") === [...CREDENTIAL_KEYS].sort().join("\0");
}

function isCredential(value: unknown): value is CliDahCredentialFileV3 {
  if (!isExactCredentialRecord(value)) return false;
  if (
    value.version !== 3 ||
    typeof value.credentialId !== "string" ||
    !UUID_V4.test(value.credentialId) ||
    typeof value.generation !== "number" ||
    !Number.isInteger(value.generation) ||
    value.generation <= 0 ||
    typeof value.issuer !== "string" ||
    value.issuer.length === 0 ||
    value.clientId !== "drwn-cli" ||
    typeof value.resource !== "string" ||
    value.resource.length === 0 ||
    typeof value.accessToken !== "string" ||
    value.accessToken.length === 0 ||
    typeof value.refreshToken !== "string" ||
    value.refreshToken.length === 0 ||
    !isCanonicalTimestamp(value.issuedAt) ||
    !isCanonicalTimestamp(value.expiresAt) ||
    !isCanonicalTimestamp(value.savedAt) ||
    typeof value.userEmail !== "string"
  ) {
    return false;
  }

  try {
    const claims = assertJwtAudience(value.accessToken, value.resource, { issuer: value.issuer });
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return false;
    if ((claims.exp as number) <= (claims.iat as number)) return false;
    return value.issuedAt === new Date((claims.iat as number) * 1000).toISOString() &&
      value.expiresAt === new Date((claims.exp as number) * 1000).toISOString();
  } catch {
    return false;
  }
}

export function assertCredentialV3(value: unknown): asserts value is CliDahCredentialFileV3 {
  if (!isCredential(value)) throw new CredentialSchemaUnsupportedError();
}

export async function readCredentials(path: string): Promise<CliDahCredentialFileV3 | null> {
  const plaintext = await decryptFromDisk(path);
  if (plaintext === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new CredentialSchemaUnsupportedError();
  }
  assertCredentialV3(parsed);
  return parsed;
}

export async function writeCredentials(path: string, credential: CliDahCredentialFileV3): Promise<void> {
  assertCredentialV3(credential);
  await encryptToDisk(path, JSON.stringify(credential, null, 2));
}

export async function deleteCredentials(path: string): Promise<void> {
  await clear(path);
}
