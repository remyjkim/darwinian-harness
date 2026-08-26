// ABOUTME: Verifies drwn auth derives from one strict deployed Worker cloud profile tuple.
// ABOUTME: Keeps the exact DAH delegation request scope centralized and non-overridable.

import { describe, expect, test } from "bun:test";
import { drwnCliProfile } from "../cli/core/auth/profile";

describe("drwnCliProfile", () => {
  test("defaults to the complete production tuple and exact delegation scope", () => {
    expect(drwnCliProfile({})).toEqual(expect.objectContaining({
      hubOrigin: "https://auth.darwinian.dev",
      issuer: "https://auth.darwinian.dev/api/auth",
      resource: "https://api.darwinian.dev",
      scope: "openid email offline_access dah:management.delegate",
      apiOrigin: "https://api.darwinian.dev",
      webOrigin: "https://foundry.darwinian.dev",
      cloudProfileId: "production",
      profileDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  test("selects staging as a whole tuple", () => {
    expect(drwnCliProfile({ DRWN_CLOUD_PROFILE: "staging" })).toEqual(expect.objectContaining({
      hubOrigin: "https://auth-staging-main.darwinian.dev",
      issuer: "https://auth-staging-main.darwinian.dev/api/auth",
      resource: "https://api.darwinian.dev",
      apiOrigin: "https://api-staging-main.darwinian.dev",
      webOrigin: "https://foundry-staging-main.darwinian.dev",
      cloudProfileId: "staging",
    }));
  });

  test("rejects retired partial Auth Hub and API overrides", () => {
    for (const key of ["DRWN_DAH_HUB_URL", "DRWN_DAH_RESOURCE"]) {
      expect(() => drwnCliProfile({ [key]: "https://partial.example" }))
        .toThrow(expect.objectContaining({ code: "CLOUD_PROFILE_INVALID" }));
    }
  });
});
