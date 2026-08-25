// ABOUTME: Derives the closed management route map from the admitted deployed-worker.v1 artifact.
// ABOUTME: Resolves approved path variables only and never accepts arbitrary URLs or performs fetches.

import { DrwnError } from "../errors";
import {
  compileManagementSchemaFragment,
  managementContract,
  managementSchemaName,
  type ManagementJsonObject,
} from "./contracts";

export const MANAGEMENT_ROUTE_KEYS = [
  "organizations.list",
  "organizations.read",
  "deployed_workers.register",
  "deployed_workers.list",
  "deployed_workers.read",
  "deployments.create",
  "deployments.list",
  "deployments.rollback",
  "secrets.set",
  "runs.create",
  "runs.read",
  "deployed_workers.retire",
] as const;

export type ManagementRouteKey = typeof MANAGEMENT_ROUTE_KEYS[number];
export type ManagementRoute = Readonly<(typeof managementContract.routes)[number]>;

const expectedRouteKeys = new Set<string>(MANAGEMENT_ROUTE_KEYS);
const artifactRouteKeys = managementContract.routes.map((route) => route.routeKey);
if (
  artifactRouteKeys.length !== MANAGEMENT_ROUTE_KEYS.length ||
  artifactRouteKeys.some((routeKey, index) => routeKey !== MANAGEMENT_ROUTE_KEYS[index]) ||
  artifactRouteKeys.some((routeKey) => !expectedRouteKeys.has(routeKey))
) {
  throw new DrwnError("MANAGEMENT_CONTRACT_INVALID", "Management route inventory differs from deployed-worker.v1");
}

export const managementRoutes = Object.freeze(Object.fromEntries(
  managementContract.routes.map((route) => [route.routeKey, Object.freeze(route)]),
) as Record<ManagementRouteKey, ManagementRoute>);

function pathVariables(pathTemplate: string): string[] {
  return [...pathTemplate.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]!);
}

function requestProperties(route: ManagementRoute): Record<string, ManagementJsonObject> {
  const schema = managementContract.schemas[managementSchemaName(route.requestSchema)] as ManagementJsonObject;
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new DrwnError("MANAGEMENT_CONTRACT_INVALID", `Route ${route.routeKey} request schema has no properties`);
  }
  return properties as Record<string, ManagementJsonObject>;
}

const pathValueSchemas = Object.freeze(Object.fromEntries(managementContract.routes.map((route) => {
  const properties = requestProperties(route);
  const schemas = Object.fromEntries(pathVariables(route.pathTemplate).map((variable) => {
    const schema = properties[variable];
    if (!schema) {
      throw new DrwnError("MANAGEMENT_CONTRACT_INVALID", `Route ${route.routeKey} has no schema for path variable ${variable}`);
    }
    return [variable, compileManagementSchemaFragment(schema)];
  }));
  return [route.routeKey, Object.freeze(schemas)];
})) as Record<ManagementRouteKey, Readonly<Record<string, ReturnType<typeof compileManagementSchemaFragment>>>>);

function validationError(message: string, cause?: unknown): DrwnError {
  return new DrwnError("VALIDATION_FAILED", message, undefined, cause);
}

export interface ResolvedManagementRoute extends ManagementRoute {
  path: string;
}

export function resolveManagementRoute(
  routeKey: ManagementRouteKey,
  values: Readonly<Record<string, string>> = {},
): ResolvedManagementRoute {
  if (!expectedRouteKeys.has(routeKey)) throw validationError(`Unknown management route key: ${String(routeKey)}`);
  const route = managementRoutes[routeKey];
  const required = pathVariables(route.pathTemplate);
  const supplied = Object.keys(values);
  if (
    supplied.length !== required.length ||
    supplied.some((key) => !required.includes(key)) ||
    required.some((key) => !Object.hasOwn(values, key))
  ) {
    throw validationError(`Route ${routeKey} requires exactly these path variables: ${required.join(", ") || "none"}`);
  }
  let path = route.pathTemplate;
  for (const variable of required) {
    const parsed = pathValueSchemas[routeKey][variable]!.safeParse(values[variable]);
    if (!parsed.success || typeof parsed.data !== "string") {
      throw validationError(`Invalid ${variable} for management route ${routeKey}`, parsed.error);
    }
    path = path.replace(`{${variable}}`, encodeURIComponent(parsed.data));
  }
  return Object.freeze({ ...route, path });
}

function templateMatcher(pathTemplate: string): RegExp {
  const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[A-Za-z][A-Za-z0-9]*\\\}/g, "([^/]+)")}$`);
}

export function assertManagementPathAllowed(path: string): ManagementRouteKey {
  if (path === "/api/minds" || path.startsWith("/api/minds/")) {
    throw new DrwnError("MIND_CONTRACT_REMOVED", "The legacy deployed Mind management path has been removed");
  }
  for (const routeKey of MANAGEMENT_ROUTE_KEYS) {
    const route = managementRoutes[routeKey];
    const match = templateMatcher(route.pathTemplate).exec(path);
    if (!match) continue;
    const variables = pathVariables(route.pathTemplate);
    const values: Record<string, string> = {};
    try {
      variables.forEach((variable, index) => {
        values[variable] = decodeURIComponent(match[index + 1]!);
      });
    } catch (error) {
      throw validationError("Management path contains invalid percent encoding", error);
    }
    resolveManagementRoute(routeKey, values);
    return routeKey;
  }
  throw validationError(`Path is not a declared management route: ${path}`);
}
