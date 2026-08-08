// ABOUTME: Derives one canonical, domain-separated custody identity from a credential-file path.
// ABOUTME: Keeps raw path identity internal while exposing a separately hashed qualification namespace.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { posix, win32 } from "node:path";

const SCOPE_DOMAIN = "darwinian.worker.credential-scope.v1\0";
const QUALIFICATION_NAMESPACE_DOMAIN = "darwinian.worker.qualification-namespace.v1\0";

export interface CredentialScopeV1 {
  platform: NodeJS.Platform;
  credentialsPath: string;
  normalizedPath: string;
  scopeDigest: string;
  keyRef: string;
  qualificationNamespaceDigest: string;
}

export interface CredentialScopeOptions {
  cwd?: string;
  platform?: NodeJS.Platform;
  realpath?: (path: string) => Promise<string>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissingPath(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function canonicalizeWithUnresolvedTail(
  absolutePath: string,
  platform: NodeJS.Platform,
  realpath: (path: string) => Promise<string>,
): Promise<string> {
  const pathApi = platform === "win32" ? win32 : posix;
  const tail: string[] = [];
  let candidate = absolutePath;

  while (true) {
    try {
      const ancestor = await realpath(candidate);
      return pathApi.resolve(ancestor, ...tail);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      const parent = pathApi.dirname(candidate);
      if (parent === candidate) throw error;
      tail.unshift(pathApi.basename(candidate));
      candidate = parent;
    }
  }
}

export async function deriveCredentialScope(
  requestedPath: string,
  options: CredentialScopeOptions = {},
): Promise<CredentialScopeV1> {
  const platform = options.platform ?? process.platform;
  const pathApi = platform === "win32" ? win32 : posix;
  const cwd = options.cwd ?? process.cwd();
  const absolutePath = pathApi.resolve(cwd, requestedPath);
  const credentialsPath = await canonicalizeWithUnresolvedTail(
    absolutePath,
    platform,
    options.realpath ?? fs.realpath,
  );
  const separatorNormalized = credentialsPath.normalize("NFC").replace(/\\/g, "/");
  const normalizedPath = (platform === "win32" ? separatorNormalized.toLowerCase() : separatorNormalized)
    .normalize("NFC");
  const scopeDigest = sha256(`${SCOPE_DOMAIN}${normalizedPath}`);

  return {
    platform,
    credentialsPath,
    normalizedPath,
    scopeDigest,
    keyRef: `drwn-credentials-v2:${scopeDigest}`,
    qualificationNamespaceDigest: sha256(`${QUALIFICATION_NAMESPACE_DOMAIN}${scopeDigest}`),
  };
}
