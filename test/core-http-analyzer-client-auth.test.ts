// ABOUTME: Proves the Analyzer client contains analysis transport only after the auth hard cut.
// ABOUTME: Device login, session lookup, and sign-out remain owned by native DAH surfaces.

import { describe, expect, test } from "bun:test";
import { createAnalyzerClient } from "../cli/core/http/analyzer-client";

describe("analyzer-client hard cut", () => {
  test("exposes only upload and job polling methods", () => {
    const client = createAnalyzerClient(
      "https://api.test",
      (async () => Response.json({})) as unknown as typeof fetch,
    );
    expect(Object.keys(client).sort()).toEqual(["getJob", "upload"]);
  });
});
