// ABOUTME: Verifies the exact sanitized Worker auth-operation receipt producer contract.
// ABOUTME: Exhaustively rejects states outside the 32 reviewed rows and guards secret non-disclosure.

import { describe, expect, test } from "bun:test";
import type { RuntimeBuildIdentity } from "../cli/core/build-identity";
import {
  AuthReceiptError,
  createAuthOperationReceipt,
  parseAuthOperationReceipt,
  serializeAuthOperationReceipt,
  type AuthOperationReceiptV1,
} from "../cli/core/auth/receipt";

const SOURCE_COMMIT = "a".repeat(40);
const NAMESPACE = "b".repeat(64);
const ISSUED_AT = "2026-08-08T01:00:00.000Z";
const EXPIRES_AT = "2026-08-08T02:00:00.000Z";
const ACTION_AT = "2026-08-08T01:01:00.000Z";

function baseReceipt(): AuthOperationReceiptV1 {
  return {
    schema: "darwinian.worker.auth-operation",
    schemaVersion: 1,
    worker: { version: "1.3.0", sourceCommit: SOURCE_COMMIT },
    qualificationNamespaceDigest: NAMESPACE,
    credential: {
      credentialId: "77777777-7777-4777-8777-777777777777",
      generation: 1,
      issuer: "https://auth.darwinian.dev/api/auth",
      clientId: "drwn-cli",
      resource: "https://api.darwinian.dev",
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    },
    action: "login",
    mode: "ordinary",
    actionAt: ACTION_AT,
    outcome: "succeeded",
    qualificationEligible: true,
    remote: { action: "token_exchange", result: "confirmed", httpClass: "2xx" },
    local: { action: "write", result: "confirmed", afterConfirmedRemoteRevoke: false },
    reason: null,
  };
}

function rowKey(receipt: Pick<
  AuthOperationReceiptV1,
  "action" | "mode" | "remote" | "local" | "outcome" | "reason" | "qualificationEligible"
>): string {
  return [
    receipt.action,
    receipt.mode,
    receipt.remote.action,
    receipt.remote.result,
    receipt.remote.httpClass,
    receipt.local.action,
    receipt.local.result,
    String(receipt.local.afterConfirmedRemoteRevoke),
    receipt.outcome,
    String(receipt.reason),
    String(receipt.qualificationEligible),
  ].join("|");
}

function producerRows(): AuthOperationReceiptV1[] {
  const base = baseReceipt();
  const row = (
    action: AuthOperationReceiptV1["action"],
    mode: AuthOperationReceiptV1["mode"],
    remoteResult: AuthOperationReceiptV1["remote"]["result"],
    httpClass: AuthOperationReceiptV1["remote"]["httpClass"],
    localResult: AuthOperationReceiptV1["local"]["result"],
    afterConfirmedRemoteRevoke: boolean,
    outcome: AuthOperationReceiptV1["outcome"],
    reason: AuthOperationReceiptV1["reason"],
    qualificationEligible: boolean,
  ): AuthOperationReceiptV1 => ({
    ...base,
    worker: {
      ...base.worker,
      sourceCommit: reason === "BUILD_IDENTITY_UNQUALIFIED" ? "0".repeat(40) : SOURCE_COMMIT,
    },
    credential: { ...base.credential, generation: action === "login" ? 1 : 2 },
    action,
    mode,
    outcome,
    reason,
    qualificationEligible,
    remote: {
      action: { login: "token_exchange", refresh: "refresh", logout: "revoke" }[action] as AuthOperationReceiptV1["remote"]["action"],
      result: remoteResult,
      httpClass,
    },
    local: {
      action: action === "logout" ? "delete" : "write",
      result: localResult,
      afterConfirmedRemoteRevoke,
    },
  });
  const indeterminate = ["3xx", "5xx", "network_error"] as const;
  const logoutRemoteRows = [
    ["not_applicable", "not_applicable", "CREDENTIAL_PROFILE_MISMATCH"],
    ["rejected", "4xx", "AUTH_REMOTE_REJECTED"],
    ...indeterminate.map((httpClass) => ["indeterminate", httpClass, "AUTH_REMOTE_INDETERMINATE"] as const),
    ["confirmed", "2xx", null],
  ] as const;

  return [
    row("login", "ordinary", "confirmed", "2xx", "confirmed", false, "succeeded", null, true),
    row("login", "ordinary", "confirmed", "2xx", "confirmed", false, "succeeded", "BUILD_IDENTITY_UNQUALIFIED", false),
    row("login", "ordinary", "confirmed", "2xx", "failed", false, "failed", "CREDENTIAL_WRITE_FAILED", false),
    row("refresh", "ordinary", "not_applicable", "not_applicable", "not_performed", false, "failed", "CREDENTIAL_PROFILE_MISMATCH", false),
    row("refresh", "ordinary", "rejected", "4xx", "not_performed", false, "failed", "AUTH_REMOTE_REJECTED", false),
    ...indeterminate.map((httpClass) => row("refresh", "ordinary", "indeterminate", httpClass, "not_performed", false, "failed", "AUTH_REMOTE_INDETERMINATE", false)),
    row("refresh", "ordinary", "rejected", "2xx", "not_performed", false, "failed", "AUTH_RESPONSE_INVALID", false),
    row("refresh", "ordinary", "confirmed", "2xx", "confirmed", false, "succeeded", null, true),
    row("refresh", "ordinary", "confirmed", "2xx", "confirmed", false, "succeeded", "BUILD_IDENTITY_UNQUALIFIED", false),
    row("refresh", "ordinary", "confirmed", "2xx", "failed", false, "failed", "CREDENTIAL_WRITE_FAILED", false),
    ...logoutRemoteRows.flatMap(([remoteResult, httpClass, reason]) => [
      row("logout", "ordinary", remoteResult, httpClass, "confirmed", remoteResult === "confirmed", "succeeded", reason, false),
      row("logout", "ordinary", remoteResult, httpClass, "failed", remoteResult === "confirmed", "failed", "CREDENTIAL_DELETE_FAILED", false),
    ]),
    ...logoutRemoteRows.filter(([remoteResult]) => remoteResult !== "confirmed").map(([remoteResult, httpClass, reason]) =>
      row("logout", "require_remote_revoke", remoteResult, httpClass, "not_performed", false, "failed", reason, false)
    ),
    row("logout", "require_remote_revoke", "confirmed", "2xx", "failed", true, "failed", "CREDENTIAL_DELETE_FAILED", false),
    row("logout", "require_remote_revoke", "confirmed", "2xx", "confirmed", true, "succeeded", null, true),
    row("logout", "require_remote_revoke", "confirmed", "2xx", "confirmed", true, "succeeded", "BUILD_IDENTITY_UNQUALIFIED", false),
  ];
}

describe("AuthOperationReceiptV1", () => {
  test("accepts exactly the 32 reviewed producer rows across the complete state domain", () => {
    const expected = new Set(producerRows().map(rowKey));
    expect(expected.size).toBe(32);

    const actions = ["login", "refresh", "logout"] as const;
    const modes = ["ordinary", "require_remote_revoke"] as const;
    const remoteActions = ["not_applicable", "token_exchange", "refresh", "revoke"] as const;
    const remoteResults = ["not_applicable", "confirmed", "rejected", "indeterminate"] as const;
    const httpClasses = ["not_applicable", "2xx", "3xx", "4xx", "5xx", "network_error"] as const;
    const localActions = ["write", "delete"] as const;
    const localResults = ["confirmed", "not_performed", "failed"] as const;
    const outcomes = ["succeeded", "failed"] as const;
    const reasons = [
      null,
      "BUILD_IDENTITY_UNQUALIFIED",
      "CREDENTIAL_PROFILE_MISMATCH",
      "AUTH_REMOTE_REJECTED",
      "AUTH_REMOTE_INDETERMINATE",
      "AUTH_RESPONSE_INVALID",
      "CREDENTIAL_WRITE_FAILED",
      "CREDENTIAL_DELETE_FAILED",
    ] as const;
    const accepted = new Set<string>();

    for (const action of actions) for (const mode of modes) {
      for (const remoteAction of remoteActions) for (const remoteResult of remoteResults) {
        for (const httpClass of httpClasses) for (const localAction of localActions) {
          for (const localResult of localResults) for (const afterConfirmedRemoteRevoke of [false, true]) {
            for (const outcome of outcomes) for (const reason of reasons) {
              for (const qualificationEligible of [false, true]) {
                const candidate: AuthOperationReceiptV1 = {
                  ...baseReceipt(),
                  worker: {
                    ...baseReceipt().worker,
                    sourceCommit: reason === "BUILD_IDENTITY_UNQUALIFIED" ? "0".repeat(40) : SOURCE_COMMIT,
                  },
                  credential: { ...baseReceipt().credential, generation: action === "login" ? 1 : 2 },
                  action,
                  mode,
                  remote: { action: remoteAction, result: remoteResult, httpClass },
                  local: { action: localAction, result: localResult, afterConfirmedRemoteRevoke },
                  outcome,
                  reason,
                  qualificationEligible,
                };
                try {
                  parseAuthOperationReceipt(candidate);
                  accepted.add(rowKey(candidate));
                } catch (error) {
                  expect(error).toBeInstanceOf(AuthReceiptError);
                }
              }
            }
          }
        }
      }
    }

    expect(accepted).toEqual(expected);
  }, 30_000);

  test("enforces exact fields, canonical timing, UUID epoch, namespace, and public profile", () => {
    const valid = baseReceipt();
    expect(parseAuthOperationReceipt(valid)).toEqual(valid);

    const invalid: unknown[] = [
      { ...valid, email: "forbidden@example.test" },
      { ...valid, worker: { ...valid.worker, sourceCommit: SOURCE_COMMIT.toUpperCase() } },
      { ...valid, qualificationNamespaceDigest: "b".repeat(63) },
      { ...valid, credential: { ...valid.credential, credentialId: "not-a-uuid" } },
      { ...valid, credential: { ...valid.credential, generation: 0 } },
      { ...valid, credential: { ...valid.credential, issuedAt: "2026-08-08T01:00:00Z" } },
      { ...valid, credential: { ...valid.credential, expiresAt: ISSUED_AT } },
      { ...valid, credential: { ...valid.credential, issuer: "https://auth.example.test/api/auth?token=secret" } },
      { ...valid, credential: { ...valid.credential, resource: "https://api.example.test/path" } },
      { ...valid, actionAt: "2026-08-08T00:59:59.000Z" },
    ];
    for (const candidate of invalid) {
      expect(() => parseAuthOperationReceipt(candidate)).toThrow(AuthReceiptError);
    }
  });

  test("binds qualification eligibility to the exact packaged 1.3.0 identity", () => {
    const valid = baseReceipt();
    const development = {
      ...valid,
      worker: { version: "1.3.0", sourceCommit: "0".repeat(40) },
      qualificationEligible: false,
      reason: "BUILD_IDENTITY_UNQUALIFIED" as const,
    };

    expect(parseAuthOperationReceipt(development)).toEqual(development);
    for (const candidate of [
      { ...valid, worker: { ...valid.worker, version: "9.9.9" } },
      { ...valid, worker: { ...valid.worker, sourceCommit: "0".repeat(40) } },
      { ...development, worker: { ...development.worker, sourceCommit: SOURCE_COMMIT } },
    ]) {
      expect(() => parseAuthOperationReceipt(candidate)).toThrow(AuthReceiptError);
    }
  });

  test("derives eligibility from packaged identity and never accepts it from the caller", () => {
    const packaged: RuntimeBuildIdentity = {
      kind: "packaged",
      schema: "darwinian.worker.build-identity",
      schemaVersion: 1,
      version: "1.3.0",
      sourceCommit: SOURCE_COMMIT,
      qualificationEligible: true,
    };
    const development: RuntimeBuildIdentity = {
      ...packaged,
      kind: "development",
      sourceCommit: "0".repeat(40),
      qualificationEligible: false,
    };
    const input = {
      buildIdentity: packaged,
      qualificationNamespaceDigest: NAMESPACE,
      credential: baseReceipt().credential,
      actionAt: ACTION_AT,
      operation: {
        action: "login" as const,
        mode: "ordinary" as const,
        outcome: "succeeded" as const,
        remote: { action: "token_exchange" as const, result: "confirmed" as const, httpClass: "2xx" as const },
        local: { action: "write" as const, result: "confirmed" as const, afterConfirmedRemoteRevoke: false },
        reason: null,
      },
    };

    expect(createAuthOperationReceipt(input)).toMatchObject({
      qualificationEligible: true,
      reason: null,
      worker: { version: "1.3.0", sourceCommit: SOURCE_COMMIT },
    });
    expect(createAuthOperationReceipt({ ...input, buildIdentity: development })).toMatchObject({
      qualificationEligible: false,
      reason: "BUILD_IDENTITY_UNQUALIFIED",
      worker: { version: "1.3.0", sourceCommit: "0".repeat(40) },
    });
  });

  test("constructs and serializes only allowlisted fields from objects carrying unique secret sentinels", () => {
    const sentinels = {
      subject: "SENTINEL_SUBJECT_239",
      email: "SENTINEL_EMAIL_239",
      operator: "SENTINEL_OPERATOR_239",
      accessToken: "SENTINEL_ACCESS_TOKEN_239",
      refreshToken: "SENTINEL_REFRESH_TOKEN_239",
      deviceCode: "SENTINEL_DEVICE_CODE_239",
      authorizationCode: "SENTINEL_AUTH_CODE_239",
      responseBody: "SENTINEL_RESPONSE_BODY_239",
      credentialPath: "SENTINEL_RAW_PATH_239",
      scopeDigest: "SENTINEL_INTERNAL_SCOPE_239",
      keyRef: "SENTINEL_KEY_REF_239",
      keychainLabel: "SENTINEL_KEYCHAIN_LABEL_239",
      secret: "SENTINEL_SECRET_239",
      queryUrl: "https://example.test/path?secret=SENTINEL_QUERY_239",
    };
    const credentialWithSecrets = { ...baseReceipt().credential, ...sentinels };
    const operationWithSecrets = {
      action: "login" as const,
      mode: "ordinary" as const,
      outcome: "succeeded" as const,
      remote: { action: "token_exchange" as const, result: "confirmed" as const, httpClass: "2xx" as const },
      local: { action: "write" as const, result: "confirmed" as const, afterConfirmedRemoteRevoke: false },
      reason: null,
      ...sentinels,
    };
    const inputWithSecrets = {
      buildIdentity: {
        kind: "development" as const,
        schema: "darwinian.worker.build-identity" as const,
        schemaVersion: 1 as const,
        version: "1.3.0",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      },
      qualificationNamespaceDigest: NAMESPACE,
      credential: credentialWithSecrets,
      actionAt: ACTION_AT,
      operation: operationWithSecrets,
      ...sentinels,
    };

    const serialized = serializeAuthOperationReceipt(createAuthOperationReceipt(inputWithSecrets));

    expect(serialized.endsWith("\n")).toBe(true);
    for (const sentinel of Object.values(sentinels)) expect(serialized).not.toContain(sentinel);
    expect(JSON.parse(serialized)).toEqual(parseAuthOperationReceipt(JSON.parse(serialized)));
  });
});
