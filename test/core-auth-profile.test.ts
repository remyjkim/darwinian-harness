// ABOUTME: Verifies the drwn CLI Auth Hub profile during the I80 migration.
// ABOUTME: Keeps API routing independent from explicit Auth Hub resource selection.

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
      DRWN_DAH_RESOURCE: "https://api-staging-main.darwinian.dev/",
    })).toMatchObject({
      hubOrigin: "https://darwinian-auth-hub-staging.dev-726.workers.dev",
      issuer: "https://darwinian-auth-hub-staging.dev-726.workers.dev/api/auth",
      resource: "https://api-staging-main.darwinian.dev",
    });
  });

  test("does not infer a token resource from the API routing override", () => {
    expect(drwnCliProfile({
      DRWN_STUDIO_API_URL: "https://studio.darwiniantools.com/",
    })).toMatchObject({
      hubOrigin: "https://auth.darwiniantools.com",
      resource: "https://api.darwinian.dev",
    });
  });

  test("honors an explicit resource independently of the API routing override", () => {
    expect(drwnCliProfile({
      DRWN_STUDIO_API_URL: "https://api-staging-main.darwinian.dev",
      DRWN_DAH_RESOURCE: "https://custom-resource.example/",
    })).toMatchObject({
      resource: "https://custom-resource.example",
    });
  });
});
