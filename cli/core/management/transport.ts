// ABOUTME: Executes the closed deployed-worker.v1 route family with one delegation-ready services bearer.
// ABOUTME: Preserves request identity and body bytes across the only allowed refresh and typed retries.

import type { KeychainBackend } from "../secret-store";
import type { CliAuthProfile } from "../auth/profile";
import { drwnCliProfile } from "../auth/profile";
import {
  assertDelegationReadyClaims,
  resolveDelegationReadyToken,
  type ResolveDelegationReadyTokenInput,
} from "../auth/delegation-readiness";
import { refreshStoredCredential } from "../auth/resolve-token";
import type { ResolvedAuth } from "../auth/resolve-token";
import { DRWN_VERSION } from "../version";
import { validateManagementHeaders, type ManagementJsonObject, type ManagementJsonValue } from "./contracts";
import { parseManagementPublicError, type ManagementPublicError } from "./errors";
import {
  indeterminateManagementResult,
  refusedManagementResult,
  succeededManagementResult,
  type DrwnManagementResult,
} from "./results";
import { managementRoutes, resolveManagementRoute, type ManagementRouteKey } from "./routes";
import { parseRouteRequest, parseRouteSuccess } from "./schemas";
import { readSafeManagementJson } from "./response-safety";

const MAX_TYPED_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 5_000;

export interface ManagementRequestInput {
  routeKey: ManagementRouteKey;
  request: ManagementJsonObject;
  credentialsPath: string;
  env: Record<string, string | undefined>;
  keychainBackend?: KeychainBackend;
}

export interface ManagementRefreshInput {
  auth: ResolvedAuth;
  credentialsPath: string;
  profile: CliAuthProfile;
  fetcher: typeof fetch;
  keychainBackend?: KeychainBackend;
}

export interface ManagementTransportDependencies {
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => string;
  resolveAuth?: (input: ResolveDelegationReadyTokenInput) => Promise<ResolvedAuth | null>;
  refreshAuth?: (input: ManagementRefreshInput) => Promise<string>;
}

interface PreparedManagementRequest {
  routeKey: ManagementRouteKey;
  requestId: string;
  url: string;
  method: string;
  bodyText?: string;
}

function canonicalize(value: ManagementJsonValue): ManagementJsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      canonicalize((value as ManagementJsonObject)[key]!),
    ]));
  }
  return value;
}

function pathVariables(template: string): string[] {
  return [...template.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]!);
}

function prepareRequest(
  routeKey: ManagementRouteKey,
  candidate: ManagementJsonObject,
  profile: CliAuthProfile,
): PreparedManagementRequest {
  const request = parseRouteRequest(routeKey, candidate);
  if (typeof request.requestId !== "string") throw new Error("admitted management request has no requestId");
  const route = managementRoutes[routeKey];
  const variables = pathVariables(route.pathTemplate);
  const resolved = resolveManagementRoute(routeKey, Object.fromEntries(variables.map((name) => [
    name,
    String(request[name]),
  ])));
  const wireEntries = Object.entries(request).filter(([key]) => key !== "requestId" && !variables.includes(key));
  const url = new URL(resolved.path, profile.apiOrigin);
  let bodyText: string | undefined;
  if (route.method === "GET") {
    for (const [key, value] of wireEntries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
      if (value === null) continue;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw new Error("admitted management query value is not scalar");
      }
      url.searchParams.set(key, String(value));
    }
  } else {
    bodyText = JSON.stringify(canonicalize(Object.fromEntries(wireEntries)));
  }
  return Object.freeze({
    routeKey,
    requestId: request.requestId,
    url: url.href,
    method: route.method,
    ...(bodyText === undefined ? {} : { bodyText }),
  });
}

async function defaultRefreshAuth(input: ManagementRefreshInput): Promise<string> {
  if (input.auth.source !== "stored" || !input.auth.credential) {
    throw new Error("stored management credential required for refresh");
  }
  const credential = await refreshStoredCredential({
    credentialsPath: input.credentialsPath,
    credential: input.auth.credential,
    profile: input.profile,
    fetcher: input.fetcher,
    keychainBackend: input.keychainBackend,
    validateCandidateClaims: (claims) => assertDelegationReadyClaims(claims, input.profile),
  });
  return credential.accessToken;
}

function safeError(code: ManagementPublicError["code"], retryable: boolean): ManagementPublicError {
  return Object.freeze({ code, retryable });
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function executeManagementRequest(
  input: ManagementRequestInput,
  dependencies: ManagementTransportDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const profile = drwnCliProfile(input.env);
  const prepared = prepareRequest(input.routeKey, input.request, profile);
  const fetcher = dependencies.fetcher ?? fetch;
  const auth = await (dependencies.resolveAuth ?? resolveDelegationReadyToken)({
    credentialsPath: input.credentialsPath,
    env: input.env,
    fetcher,
    profile,
    keychainBackend: input.keychainBackend,
  });
  if (!auth) {
    return refusedManagementResult(
      input.routeKey,
      prepared.requestId,
      safeError("AUTHORIZATION_DENIED", false),
      (dependencies.now ?? (() => new Date().toISOString()))(),
    );
  }

  let bearer = auth.token;
  let refreshed = false;
  let typedRetries = 0;
  while (true) {
    const requiredHeaders = validateManagementHeaders({
      Authorization: `Bearer ${bearer}`,
      "X-Drwn-Protocol": "deployed-worker.v1",
      "X-Drwn-Version": DRWN_VERSION,
      "X-Request-Id": prepared.requestId,
    });
    const headers = new Headers(requiredHeaders);
    if (prepared.bodyText !== undefined) headers.set("content-type", "application/json");

    let response: Response;
    try {
      response = await fetcher(prepared.url, {
        method: prepared.method,
        headers,
        ...(prepared.bodyText === undefined ? {} : { body: prepared.bodyText }),
      });
    } catch {
      return indeterminateManagementResult(
        input.routeKey,
        prepared.requestId,
        (dependencies.now ?? (() => new Date().toISOString()))(),
      );
    }

    if (response.status === 401 && auth.source === "stored" && !refreshed) {
      try {
        bearer = await (dependencies.refreshAuth ?? defaultRefreshAuth)({
          auth,
          credentialsPath: input.credentialsPath,
          profile,
          fetcher,
          keychainBackend: input.keychainBackend,
        });
        refreshed = true;
        continue;
      } catch {
        return refusedManagementResult(
          input.routeKey,
          prepared.requestId,
          safeError("AUTHORIZATION_DENIED", false),
          (dependencies.now ?? (() => new Date().toISOString()))(),
        );
      }
    }

    let body: ManagementJsonObject;
    try {
      body = await readSafeManagementJson(response);
    } catch {
      return refusedManagementResult(
        input.routeKey,
        prepared.requestId,
        safeError("SERVER_RESPONSE_INVALID", false),
        (dependencies.now ?? (() => new Date().toISOString()))(),
      );
    }

    if (response.ok) {
      try {
        const data = parseRouteSuccess(input.routeKey, body);
        if (data.requestId !== prepared.requestId) throw new Error("request id mismatch");
        return succeededManagementResult(
          input.routeKey,
          prepared.requestId,
          data,
          (dependencies.now ?? (() => new Date().toISOString()))(),
        );
      } catch {
        return refusedManagementResult(
          input.routeKey,
          prepared.requestId,
          safeError("SERVER_RESPONSE_INVALID", false),
          (dependencies.now ?? (() => new Date().toISOString()))(),
        );
      }
    }

    let error: ManagementPublicError;
    try {
      error = parseManagementPublicError(body, response.status, prepared.requestId);
    } catch {
      return refusedManagementResult(
        input.routeKey,
        prepared.requestId,
        safeError("SERVER_RESPONSE_INVALID", false),
        (dependencies.now ?? (() => new Date().toISOString()))(),
      );
    }
    if (error.retryable && typedRetries < MAX_TYPED_RETRIES) {
      typedRetries += 1;
      const delay = Math.min((error.retryAfterSeconds ?? 1) * 1_000, MAX_RETRY_DELAY_MS);
      await (dependencies.sleep ?? defaultSleep)(delay);
      continue;
    }
    return refusedManagementResult(
      input.routeKey,
      prepared.requestId,
      error,
      (dependencies.now ?? (() => new Date().toISOString()))(),
    );
  }
}
