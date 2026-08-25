// ABOUTME: Proves management responses are bounded, JSON-only, and free of credential-shaped material.
// ABOUTME: Rejected server bytes never appear in retained errors or causes.

import { describe, expect, test } from "bun:test";
import {
  MAX_MANAGEMENT_RESPONSE_BYTES,
  readSafeManagementJson,
} from "../cli/core/management/response-safety";

function response(
  body: string | Uint8Array | null,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

async function expectInvalid(candidate: Response, sentinel?: string): Promise<void> {
  try {
    await readSafeManagementJson(candidate);
    throw new Error("unsafe management response unexpectedly passed");
  } catch (error) {
    expect(error).toMatchObject({ code: "SERVER_RESPONSE_INVALID" });
    if (sentinel) {
      expect(String(error)).not.toContain(sentinel);
      expect(JSON.stringify(error)).not.toContain(sentinel);
      expect((error as Error).cause).toBeUndefined();
    }
  }
}

describe("readSafeManagementJson", () => {
  test("accepts one bounded strict JSON object", async () => {
    await expect(readSafeManagementJson(response(JSON.stringify({ requestId: "safe" }))))
      .resolves.toEqual({ requestId: "safe" });
  });

  test("rejects non-JSON, malformed JSON, arrays, invalid UTF-8, and oversized bodies", async () => {
    await expectInvalid(new Response("text", { headers: { "content-type": "text/plain" } }));
    await expectInvalid(response("{"));
    await expectInvalid(response("[]"));
    await expectInvalid(response(new Uint8Array([0xff])));
    await expectInvalid(response("{}", { headers: { "content-length": String(MAX_MANAGEMENT_RESPONSE_BYTES + 1) } }));
    await expectInvalid(response(JSON.stringify({ value: "x".repeat(MAX_MANAGEMENT_RESPONSE_BYTES) })));
  });

  test("rejects credential-shaped headers, nested keys, and values without reflection", async () => {
    const sentinel = "SENTINEL_MANAGEMENT_RESPONSE_SECRET";
    await expectInvalid(response("{}", { headers: { authorization: `Bearer ${sentinel}` } }), sentinel);
    await expectInvalid(response("{}", { headers: { "set-cookie": `session=${sentinel}` } }), sentinel);
    await expectInvalid(response("{}", { headers: { "x-access-token": sentinel } }), sentinel);
    await expectInvalid(response("{}", { headers: { "x-key-ref": sentinel } }), sentinel);
    for (const body of [
      { accessToken: sentinel },
      { nested: { refresh_token: sentinel } },
      { nested: { managementAuthorization: sentinel } },
      { nested: { managementBearer: sentinel } },
      { nested: { providerToken: sentinel } },
      { nested: { apiKey: sentinel } },
      { keyRef: sentinel },
      { privateKey: sentinel },
      { output: `Bearer ${sentinel}` },
      { output: `eyJhbGciOiJub25lIn0.eyJ${sentinel}.sig` },
      { output: `-----BEGIN PRIVATE KEY-----${sentinel}` },
      { output: `sk_live_${sentinel}` },
    ]) {
      await expectInvalid(response(JSON.stringify(body)), sentinel);
    }
  });

  test("permits safe secret metadata but never a secret value field", async () => {
    await expect(readSafeManagementJson(response(JSON.stringify({
      name: "PROVIDER_API_KEY",
      secretRevision: 1,
      workerRevision: 2,
    })))).resolves.toMatchObject({ secretRevision: 1 });
    await expectInvalid(response(JSON.stringify({ secretValue: "not-safe" })));
  });
});
