// ABOUTME: Verifies the drwn CLI Auth Hub profile during the I80 dual-accept window.
// ABOUTME: Pins the new audience while preserving the paired legacy-host grace override and explicit overrides.

import { describe, expect, test } from "bun:test";
import { drwnCliProfile } from "../cli/core/auth/profile";

describe("drwnCliProfile", () => {
  test("requests the new services audience from the existing production hub by default", () => {
    expect(drwnCliProfile({})).toMatchObject({
      hubOrigin: "https://auth.darwiniantools.com",
      issuer: "https://auth.darwiniantools.com/api/auth",
      resource: "https://api.darwinian.dev",
    });
  });

  test("honors and normalizes explicit hub and resource overrides", () => {
    expect(drwnCliProfile({
      DRWN_DAH_HUB_URL: "https://darwinian-auth-hub-staging.dev-726.workers.dev/",
      DRWN_DAH_RESOURCE: "https://api.darwiniantools.com/",
    })).toMatchObject({
      hubOrigin: "https://darwinian-auth-hub-staging.dev-726.workers.dev",
      issuer: "https://darwinian-auth-hub-staging.dev-726.workers.dev/api/auth",
      resource: "https://api.darwiniantools.com",
    });
  });

  test("pairs the exact legacy API override with its legacy resource", () => {
    expect(drwnCliProfile({
      DRWN_STUDIO_API_URL: "https://studio.darwiniantools.com/",
    })).toMatchObject({
      hubOrigin: "https://auth.darwiniantools.com",
      resource: "https://api.darwiniantools.com",
    });
  });

  test("keeps an explicit resource higher priority than the legacy API pairing", () => {
    expect(drwnCliProfile({
      DRWN_STUDIO_API_URL: "https://studio.darwiniantools.com",
      DRWN_DAH_RESOURCE: "https://custom-resource.example/",
    })).toMatchObject({
      resource: "https://custom-resource.example",
    });
  });
});
