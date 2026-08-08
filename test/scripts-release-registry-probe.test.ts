// ABOUTME: Proves npm version freshness is tri-state and only a structured exact-query E404 advances.
// ABOUTME: Keeps release tests network-independent through an injected registry command runner.

import { describe, expect, test } from "bun:test";
import {
  probeRegistryVersion,
  type RegistryCommandResult,
} from "../scripts/release/registry-probe";

const input = { packageName: "darwinian", version: "1.2.0" };

async function classify(result: RegistryCommandResult) {
  const calls: string[][] = [];
  const classification = await probeRegistryVersion(input, {
    run: async (args) => {
      calls.push(args);
      return result;
    },
  });
  expect(calls).toEqual([[
    "view",
    "darwinian@1.2.0",
    "version",
    "--json",
    "--prefer-online",
    "--registry=https://registry.npmjs.org/",
  ]]);
  return classification;
}

describe("release registry probe", () => {
  test("classifies only the exact successful version as published", async () => {
    expect(await classify({ exitCode: 0, stdout: '"1.2.0"\n', stderr: "" })).toEqual({ state: "published" });
    expect(await classify({ exitCode: 0, stdout: "1.2.0\n", stderr: "" })).toEqual({ state: "indeterminate" });
    expect(await classify({ exitCode: 0, stdout: '"1.2.1"\n', stderr: "" })).toEqual({ state: "indeterminate" });
    expect(await classify({ exitCode: 0, stdout: "", stderr: "" })).toEqual({ state: "indeterminate" });
    expect(await classify({ exitCode: 0, stdout: "not-json", stderr: "" })).toEqual({ state: "indeterminate" });
  });

  test("classifies a structured npm E404 from the exact query as unpublished", async () => {
    expect(await classify({
      exitCode: 1,
      stdout: JSON.stringify({
        error: {
          code: "E404",
          summary: "No match found for version 1.2.0",
          detail: "darwinian@1.2.0 is not in this registry.",
        },
      }),
      stderr: "",
    })).toEqual({ state: "unpublished" });
  });

  test.each([
    ["timeout", { exitCode: null, stdout: "", stderr: "", failure: "timeout" as const }],
    ["DNS", { exitCode: 1, stdout: "", stderr: "getaddrinfo ENOTFOUND registry.npmjs.org" }],
    ["TLS", { exitCode: 1, stdout: "", stderr: "CERT_HAS_EXPIRED" }],
    ["E401", { exitCode: 1, stdout: JSON.stringify({ error: { code: "E401" } }), stderr: "" }],
    ["E403", { exitCode: 1, stdout: JSON.stringify({ error: { code: "E403" } }), stderr: "" }],
    ["E429", { exitCode: 1, stdout: JSON.stringify({ error: { code: "E429" } }), stderr: "" }],
    ["npm 5xx", { exitCode: 1, stdout: JSON.stringify({ error: { code: "E500" } }), stderr: "" }],
    ["unstructured E404 text", { exitCode: 1, stdout: "", stderr: "npm ERR! code E404" }],
    ["malformed structured error", { exitCode: 1, stdout: '{"error":', stderr: "" }],
    ["unstructured nonzero", { exitCode: 2, stdout: "", stderr: "command failed" }],
  ])("fails closed on %s", async (_label, result) => {
    expect(await classify(result)).toEqual({ state: "indeterminate" });
  });

  test("does not disclose registry output in its public result", async () => {
    const secret = "SECRET_REGISTRY_RESPONSE";
    const result = await classify({ exitCode: 1, stdout: "", stderr: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
