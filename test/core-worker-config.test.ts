// ABOUTME: Verifies Deploy endpoint resolution for drwn worker commands.
// ABOUTME: Asserts env overrides are honored and trailing slashes are normalized.

import { describe, expect, test } from "bun:test";
import { resolveWorkerConfig } from "../cli/core/worker-config";

describe("resolveWorkerConfig", () => {
  test("defaults to the new API and Foundry web origins", () => {
    expect(resolveWorkerConfig({})).toEqual({
      apiBaseUrl: "https://api.darwinian.dev",
      webBaseUrl: "https://foundry.darwinian.dev",
    });
  });

  test("trims trailing slashes from env-provided base URLs", () => {
    const config = resolveWorkerConfig({
      DRWN_STUDIO_API_URL: "https://staging.example.com/",
      DRWN_STUDIO_WEB_URL: "https://web.example.com//",
    });

    expect(config.apiBaseUrl).toBe("https://staging.example.com");
    expect(config.webBaseUrl).toBe("https://web.example.com");
  });

  test("does not honor retired IMINDS endpoint names", () => {
    expect(resolveWorkerConfig({
      IMINDS_API_URL: "https://legacy-api.example",
      IMINDS_GATEWAY_URL: "https://legacy-gateway.example",
    })).toEqual({
      apiBaseUrl: "https://api.darwinian.dev",
      webBaseUrl: "https://foundry.darwinian.dev",
    });
  });
});
