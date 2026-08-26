// ABOUTME: Admits bounded JSON responses from the public management boundary.
// ABOUTME: Rejects credential-shaped headers, keys, and values without retaining server bytes.

import { DrwnError } from "../errors";
import type { ManagementJsonObject } from "./contracts";

export const MAX_MANAGEMENT_RESPONSE_BYTES = 65_536;

const FORBIDDEN_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "set-cookie",
  "cookie",
  "x-dah-management-authorization",
  "x-management-token",
]);

const FORBIDDEN_NORMALIZED_KEYS = new Set([
  "credential",
  "credentials",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "managementtoken",
  "managementauthorization",
  "managementbearer",
  "keyref",
  "privatekey",
  "apikey",
  "providercredential",
  "providertoken",
  "secret",
  "secretvalue",
]);

const FORBIDDEN_NORMALIZED_HEADER_PARTS = [
  "authorization",
  "accesstoken",
  "refreshtoken",
  "managementtoken",
  "managementbearer",
  "keyref",
  "privatekey",
  "apikey",
  "providertoken",
  "cookie",
];

const FORBIDDEN_VALUE_PATTERNS = [
  /\bBearer\s+\S+/i,
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----/,
  /\b(?:sk|rk|ghp|github_pat)[_-][A-Za-z0-9_-]{12,}\b/i,
];

function invalidResponse(): DrwnError {
  return new DrwnError("SERVER_RESPONSE_INVALID", "The management server returned an invalid response.");
}

function assertSafeHeaders(headers: Headers): void {
  for (const [name] of headers) {
    const lower = name.toLowerCase();
    const normalized = lower.replace(/[^a-z0-9]/g, "");
    if (
      FORBIDDEN_HEADERS.has(lower) ||
      FORBIDDEN_NORMALIZED_HEADER_PARTS.some((part) => normalized.includes(part))
    ) throw invalidResponse();
  }
}

async function readBoundedBytes(response: Response): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MANAGEMENT_RESPONSE_BYTES) {
      throw invalidResponse();
    }
  }
  if (!response.body) throw invalidResponse();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_MANAGEMENT_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidResponse();
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof DrwnError && error.code === "SERVER_RESPONSE_INVALID") throw error;
    throw invalidResponse();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function assertSafeValue(value: unknown): void {
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value))) throw invalidResponse();
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertSafeValue(entry);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
      if (FORBIDDEN_NORMALIZED_KEYS.has(normalized)) throw invalidResponse();
      assertSafeValue(child);
    }
  }
}

export async function readSafeManagementJson(response: Response): Promise<ManagementJsonObject> {
  try {
    assertSafeHeaders(response.headers);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") throw invalidResponse();
    const bytes = await readBoundedBytes(response);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
    assertSafeValue(value);
    return value as ManagementJsonObject;
  } catch (error) {
    if (error instanceof DrwnError && error.code === "SERVER_RESPONSE_INVALID") throw error;
    throw invalidResponse();
  }
}
