// ABOUTME: Tests ACP agent-owned authentication through the existing DAH device-flow seam.
// ABOUTME: Verifies profile selection, user-action forwarding, credential persistence, and method validation.

import { describe, expect, test } from "bun:test";
import type { CliDahCredentialFile } from "../cli/core/auth/credentials";
import {
  authenticateDahDevice,
  DAH_DEVICE_AUTH_METHOD_ID,
  type AcpDeviceAuthOptions,
} from "../cli/core/acp/auth";

const credential: CliDahCredentialFile = {
  version: 2,
  issuer: "https://hub.example.test/api/auth",
  clientId: "drwn-cli",
  resource: "https://services.example.test",
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: "2030-01-01T00:00:00.000Z",
  user_email: "user@example.test",
  saved_at: "2026-08-05T00:00:00.000Z",
};

describe("ACP device authentication", () => {
  test("runs DAH device flow, forwards terminal instructions, and saves credentials", async () => {
    const actions: Array<{ verification_uri_complete: string; user_code: string }> = [];
    const persisted: Array<{ path: string; value: CliDahCredentialFile }> = [];
    const result = await authenticateDahDevice(
      { methodId: DAH_DEVICE_AUTH_METHOD_ID },
      {
        agentsDir: "/users/test/.agents",
        env: {
          DRWN_DAH_HUB_URL: "https://hub.example.test/",
          DRWN_DAH_RESOURCE: "https://services.example.test/",
        },
        onUserAction: (info) => actions.push(info),
        runFlow: async (input) => {
          expect(input.profile).toMatchObject({
            clientId: "drwn-cli",
            hubOrigin: "https://hub.example.test",
            issuer: "https://hub.example.test/api/auth",
            resource: "https://services.example.test",
          });
          input.onUserAction({
            verification_uri_complete: "https://hub.example.test/activate?code=ABCD",
            user_code: "ABCD",
          });
          return credential;
        },
        persist: async (path, value) => { persisted.push({ path, value }); },
      },
    );

    expect(result).toEqual({});
    expect(actions).toEqual([{
      verification_uri_complete: "https://hub.example.test/activate?code=ABCD",
      user_code: "ABCD",
    }]);
    expect(persisted).toEqual([{
      path: "/users/test/.agents/drwn/credentials.json",
      value: credential,
    }]);
  });

  test("rejects an unadvertised method before starting device flow", async () => {
    let started = false;
    await expect(authenticateDahDevice(
      { methodId: "unknown" },
      {
        agentsDir: "/users/test/.agents",
        onUserAction: () => {},
        runFlow: async () => {
          started = true;
          return credential;
        },
        persist: async () => {},
      },
    )).rejects.toMatchObject({ code: -32602 });
    expect(started).toBe(false);
  });

  test("aborts device-flow polling when the ACP authenticate request closes", async () => {
    const controller = new AbortController();
    let entered!: () => void;
    const polling = new Promise<void>((resolve) => { entered = resolve; });
    const options = {
      agentsDir: "/users/test/.agents",
      signal: controller.signal,
      onUserAction: () => {},
      sleep: async () => { await new Promise(() => {}); },
      runFlow: async (input) => {
        entered();
        await input.sleep!(10_000);
        return credential;
      },
      persist: async () => {},
    } as AcpDeviceAuthOptions & { signal: AbortSignal };
    const authenticating = authenticateDahDevice(
      { methodId: DAH_DEVICE_AUTH_METHOD_ID },
      options,
    );
    await polling;
    controller.abort(new Error("ACP connection closed"));
    const outcome = await Promise.race([
      authenticating.then(() => "resolved", (error) => error instanceof Error ? error.message : String(error)),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 50)),
    ]);

    expect(outcome).toBe("ACP connection closed");
  });
});
