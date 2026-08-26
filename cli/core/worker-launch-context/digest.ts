// ABOUTME: Computes domain-separated canonical identities for Worker launch contexts.
// ABOUTME: Sorts object keys while preserving semantically ordered arrays.

import { createHash } from "node:crypto";

const CONTEXT_DOMAIN = "darwinian:worker-launch-context:v1\n";
const CLOSURE_DOMAIN = "darwinian:worker-launch-closure:v1\n";
const PROJECT_ROOT_DOMAIN = "darwinian:worker-launch-project-root:v1\n";
const CAPABILITY_DOMAIN = "darwinian:worker-launch-capability:v1\n";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  throw new Error("Worker launch identity contains a non-canonical value");
}

function domainDigest(domain: string, value: unknown): `sha256-${string}` {
  return `sha256-${createHash("sha256").update(domain).update(canonicalJson(value)).digest("hex")}`;
}

export function computeWorkerLaunchContextId(preimage: unknown): `sha256-${string}` {
  return domainDigest(CONTEXT_DOMAIN, preimage);
}

export function computeWorkerClosureDigest(preimage: unknown): `sha256-${string}` {
  return domainDigest(CLOSURE_DOMAIN, preimage);
}

export function computeProjectRootHash(projectRoot: string): `sha256-${string}` {
  return domainDigest(PROJECT_ROOT_DOMAIN, projectRoot);
}

export function computeWorkerCapabilityIdentity(value: unknown): `sha256-${string}` {
  return domainDigest(CAPABILITY_DOMAIN, value);
}
