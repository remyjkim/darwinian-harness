// ABOUTME: Verifies Deploy endpoint resolution for drwn worker commands.
// ABOUTME: Asserts env overrides are honored and trailing slashes are normalized.

import { describe, expect, test } from "bun:test";
import { resolveWorkerConfig } from "../cli/core/worker-config";

describe("resolveWorkerConfig", () => {
  test("defaults stay canonical without env overrides", () => {
    expect(resolveWorkerConfig({})).toEqual({
      apiBaseUrl: "https://studio.darwiniantools.com",
      gatewayBaseUrl: "https://minds.darwiniantools.com",
    });
  });

  test("trims trailing slashes from env-provided base URLs", () => {
    const config = resolveWorkerConfig({
      DRWN_STUDIO_API_URL: "https://staging.example.com/",
      DRWN_STUDIO_GATEWAY_URL: "https://gw.example.com//",
    });

    expect(config.apiBaseUrl).toBe("https://staging.example.com");
    expect(config.gatewayBaseUrl).toBe("https://gw.example.com");
  });
});
