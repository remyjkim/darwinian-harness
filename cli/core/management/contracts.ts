// ABOUTME: Admits the immutable Services-owned deployed-worker.v1 contract into the Worker package.
// ABOUTME: Fails closed on byte, shape, inventory, schema, or authority drift before management use.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { fromJSONSchema, z, type ZodType } from "zod";
import { DrwnError } from "../errors";

type JsonPrimitive = null | boolean | number | string;
export type ManagementJsonValue = JsonPrimitive | ManagementJsonValue[] | { [key: string]: ManagementJsonValue };
export type ManagementJsonObject = { [key: string]: ManagementJsonValue };

const jsonValueSchema: z.ZodType<ManagementJsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const schemaRef = z.string().regex(/^#\/schemas\/[A-Za-z][A-Za-z0-9]*$/);
const routeKeySchema = z.string().regex(/^[a-z]+(?:[_.][a-z]+)*$/);

const lockSchema = z.object({
  schema: z.literal("drwn.management-contract-lock"),
  schemaVersion: z.literal(1),
  protocol: z.literal("deployed-worker.v1"),
  servicesRepository: z.literal("curation-labs/darwinian-services"),
  sourceCommit: commitSchema,
  sha256: sha256Schema,
  routeCount: z.literal(12),
  positiveVectorCount: z.literal(12),
  negativeVectorCount: z.literal(29),
  schemaCount: z.literal(35),
  errorCodeCount: z.literal(10),
}).strict();

const idKindSchema = z.object({
  title: z.string().min(1),
  type: z.literal("string"),
  pattern: z.string().min(1),
  maxLength: z.number().int().positive().optional(),
}).strict();

const profileSchema = z.object({
  profileId: z.enum(["production", "staging"]),
  apiOrigin: z.url(),
  webOrigin: z.url(),
  authHubOrigin: z.url(),
  issuer: z.url(),
  resource: z.url(),
  clientId: z.literal("drwn-cli"),
  requestedScopes: z.tuple([
    z.literal("openid"),
    z.literal("email"),
    z.literal("offline_access"),
    z.literal("dah:management.delegate"),
  ]),
}).strict();

const authoritySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("organization") }).strict(),
  z.object({ kind: z.literal("registration") }).strict(),
  z.object({
    kind: z.literal("capability"),
    capability: z.enum(["view", "deploy", "credentials.manage", "invoke", "worker.retire"]),
  }).strict(),
]);

const routeSchema = z.object({
  routeKey: routeKeySchema,
  method: z.enum(["GET", "POST", "PUT"]),
  pathTemplate: z.string().regex(/^\/api\/[A-Za-z0-9_{}./-]+$/),
  authority: authoritySchema,
  mutation: z.boolean(),
  requestSchema: schemaRef,
  successSchema: schemaRef,
}).strict();

const positiveVectorSchema = z.object({
  routeKey: routeKeySchema,
  request: jsonObjectSchema,
  success: jsonObjectSchema,
}).strict();

const negativeVectorSchema = z.object({
  caseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  routeKey: routeKeySchema,
  surface: z.enum(["request", "response", "header", "path"]),
  candidate: jsonObjectSchema,
  expectedError: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
}).strict();

const contractSchema = z.object({
  schema: z.literal("cl.drwn.management-contract"),
  schemaVersion: z.literal(1),
  protocol: z.literal("deployed-worker.v1"),
  authority: z.object({
    i336ArchitectureCommit: commitSchema,
    i321CandidateCommit: commitSchema,
    workerArchitectureCommit: commitSchema,
  }).strict(),
  enums: z.object({
    environment: z.tuple([z.literal("development"), z.literal("staging"), z.literal("production")]),
    runStatus: z.tuple([
      z.literal("queued"),
      z.literal("running"),
      z.literal("succeeded"),
      z.literal("failed"),
      z.literal("cancelled"),
    ]),
    operationOutcome: z.tuple([
      z.literal("succeeded"),
      z.literal("refused"),
      z.literal("indeterminate"),
    ]),
  }).strict(),
  idKinds: z.object({
    OrganizationId: idKindSchema,
    WorkerId: idKindSchema,
    DeployedWorkerId: idKindSchema,
    DeploymentId: idKindSchema,
    RunId: idKindSchema,
    RequestId: idKindSchema,
  }).strict(),
  profiles: z.object({
    production: profileSchema,
    staging: profileSchema,
  }).strict(),
  headers: z.object({
    required: z.tuple([
      z.object({ name: z.literal("Authorization"), semantics: z.literal("services-bearer-only") }).strict(),
      z.object({ name: z.literal("X-Drwn-Protocol"), semantics: z.literal("exact-protocol") }).strict(),
      z.object({ name: z.literal("X-Drwn-Version"), semantics: z.literal("client-version") }).strict(),
      z.object({
        name: z.literal("X-Request-Id"),
        semantics: z.literal("lowercase-uuidv4-and-sole-mutation-idempotency-identity"),
      }).strict(),
    ]),
    mutationIdempotencyHeader: z.literal("X-Request-Id"),
  }).strict(),
  routes: z.array(routeSchema).length(12),
  schemas: z.record(z.string(), jsonObjectSchema).refine((value) => Object.keys(value).length === 35),
  errors: z.object({
    codes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]+$/)).length(10),
    httpStatusByCode: z.record(z.string(), z.number().int().min(400).max(599)),
  }).strict(),
  vectors: z.object({
    positive: z.array(positiveVectorSchema).length(12),
    negative: z.array(negativeVectorSchema).length(29),
  }).strict(),
}).strict();

export type ManagementContractLock = z.infer<typeof lockSchema>;
export type ManagementContract = z.infer<typeof contractSchema>;

export interface LoadedManagementContract {
  contract: ManagementContract;
  lock: ManagementContractLock;
  schemas: Readonly<Record<string, ZodType>>;
}

const CONTRACT_RELATIVE_PATH = join("registry", "contracts", "deployed-worker.v1", "contract.json");
const LOCK_RELATIVE_PATH = join("cli", "generated", "drwn-management-contract-lock.json");

function invalidContract(message: string, cause?: unknown): DrwnError {
  return new DrwnError("MANAGEMENT_CONTRACT_INVALID", message, undefined, cause);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function transformSchemaRefs(value: ManagementJsonValue): ManagementJsonValue {
  if (Array.isArray(value)) return value.map(transformSchemaRefs);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (key === "$ref" && typeof child === "string") {
        return [key, child.replace(/^#\/(?:schemas|idKinds)\//, "#/$defs/")];
      }
      return [key, transformSchemaRefs(child)];
    }));
  }
  return value;
}

function assertClosedObjectSchemas(value: ManagementJsonValue, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertClosedObjectSchemas(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (value.type === "object" && value.additionalProperties !== false) {
    throw invalidContract(`Management object schema is not closed at ${path}`);
  }
  for (const [key, child] of Object.entries(value)) assertClosedObjectSchemas(child, `${path}.${key}`);
}

function schemaNameFromRef(reference: string): string {
  const match = /^#\/schemas\/([A-Za-z][A-Za-z0-9]*)$/.exec(reference);
  if (!match) throw invalidContract(`Invalid management schema reference: ${reference}`);
  return match[1]!;
}

function buildSchemaDefinitions(contract: ManagementContract): Record<string, ManagementJsonValue> {
  return Object.fromEntries([
    ...Object.entries(contract.idKinds),
    ...Object.entries(contract.schemas),
  ].map(([name, schema]) => [name, transformSchemaRefs(schema as ManagementJsonValue)]));
}

function compileSchema(
  fragment: ManagementJsonObject,
  definitions: Record<string, ManagementJsonValue>,
): ZodType {
  return fromJSONSchema({
    ...transformSchemaRefs(fragment) as ManagementJsonObject,
    $defs: definitions,
  } as Parameters<typeof fromJSONSchema>[0]);
}

function compileSchemas(contract: ManagementContract): Readonly<Record<string, ZodType>> {
  const definitions = buildSchemaDefinitions(contract);
  return Object.freeze(Object.fromEntries(Object.entries(contract.schemas).map(([name, schema]) => [
    name,
    compileSchema(schema, definitions),
  ])));
}

function assertInventories(contract: ManagementContract, lock: ManagementContractLock): void {
  const routeKeys = contract.routes.map((route) => route.routeKey);
  if (new Set(routeKeys).size !== routeKeys.length) throw invalidContract("Management route keys are not unique");
  const schemaNames = new Set(Object.keys(contract.schemas));
  for (const route of contract.routes) {
    if (!schemaNames.has(schemaNameFromRef(route.requestSchema)) || !schemaNames.has(schemaNameFromRef(route.successSchema))) {
      throw invalidContract(`Management route ${route.routeKey} refers to an unknown schema`);
    }
  }
  if (contract.vectors.positive.some((vector) => !routeKeys.includes(vector.routeKey))) {
    throw invalidContract("A positive management vector refers to an unknown route");
  }
  if (contract.vectors.negative.some((vector) =>
    !routeKeys.includes(vector.routeKey) || !contract.errors.codes.includes(vector.expectedError)
  )) {
    throw invalidContract("A negative management vector refers to an unknown route or error");
  }
  const counts = {
    routeCount: contract.routes.length,
    positiveVectorCount: contract.vectors.positive.length,
    negativeVectorCount: contract.vectors.negative.length,
    schemaCount: Object.keys(contract.schemas).length,
    errorCodeCount: contract.errors.codes.length,
  };
  for (const [key, count] of Object.entries(counts)) {
    if (lock[key as keyof typeof counts] !== count) throw invalidContract(`Management contract ${key} does not match its lock`);
  }
  if (Object.keys(contract.errors.httpStatusByCode).sort().join("\n") !== [...contract.errors.codes].sort().join("\n")) {
    throw invalidContract("Management error code and HTTP status inventories differ");
  }
  for (const [name, schema] of Object.entries(contract.schemas)) assertClosedObjectSchemas(schema, `schemas.${name}`);
}

export function loadManagementContractFromPackageRoot(packageRoot: string): LoadedManagementContract {
  try {
    const canonicalRoot = resolve(packageRoot);
    const contractBytes = readFileSync(join(canonicalRoot, CONTRACT_RELATIVE_PATH));
    const lock = lockSchema.parse(JSON.parse(readFileSync(join(canonicalRoot, LOCK_RELATIVE_PATH), "utf8")));
    const observedDigest = createHash("sha256").update(contractBytes).digest("hex");
    if (observedDigest !== lock.sha256) throw invalidContract("Management contract bytes do not match the authority lock");
    const contract = contractSchema.parse(JSON.parse(contractBytes.toString("utf8")));
    if (contract.protocol !== lock.protocol) throw invalidContract("Management contract protocol does not match its lock");
    assertInventories(contract, lock);
    const schemas = compileSchemas(contract);
    return deepFreeze({ contract, lock, schemas });
  } catch (error) {
    if (error instanceof DrwnError && error.code === "MANAGEMENT_CONTRACT_INVALID") throw error;
    throw invalidContract("Management contract package input is unavailable or invalid", error);
  }
}

const runtimePackageRoot = fileURLToPath(new URL("../../../", import.meta.url));
const loaded = loadManagementContractFromPackageRoot(runtimePackageRoot);

export const managementContract = loaded.contract;
export const managementContractLock = loaded.lock;
export const managementSchemas = loaded.schemas;

export function compileManagementSchemaFragment(fragment: ManagementJsonObject): ZodType {
  return compileSchema(fragment, buildSchemaDefinitions(managementContract));
}

export function managementSchemaName(reference: string): string {
  return schemaNameFromRef(reference);
}

function managementRouteForKey(routeKey: string) {
  const route = managementContract.routes.find((candidate) => candidate.routeKey === routeKey);
  if (!route) throw new DrwnError("VALIDATION_FAILED", `Unknown management route key: ${routeKey}`);
  return route;
}

export function parseManagementRequest(routeKey: string, candidate: unknown): unknown {
  const route = managementRouteForKey(routeKey);
  const result = managementSchemas[schemaNameFromRef(route.requestSchema)]!.safeParse(candidate);
  if (!result.success) {
    throw new DrwnError("VALIDATION_FAILED", `Invalid request for management route ${routeKey}`, undefined, result.error);
  }
  return result.data;
}

export function parseManagementSuccess(routeKey: string, candidate: unknown): unknown {
  const route = managementRouteForKey(routeKey);
  const result = managementSchemas[schemaNameFromRef(route.successSchema)]!.safeParse(candidate);
  if (!result.success) {
    throw new DrwnError(
      "SERVER_RESPONSE_INVALID",
      `Invalid success response for management route ${routeKey}`,
      undefined,
      result.error,
    );
  }
  return result.data;
}

const requestIdHeaderSchema = compileManagementSchemaFragment(managementContract.idKinds.RequestId);
const clientVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const requiredHeaderNames = managementContract.headers.required.map((header) => header.name);
const requiredHeaderNameSet = new Set<string>(requiredHeaderNames);

export function validateManagementHeaders(
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> {
  const supplied = Object.keys(candidate);
  if (
    supplied.length !== requiredHeaderNames.length ||
    supplied.some((name) => !requiredHeaderNameSet.has(name)) ||
    requiredHeaderNames.some((name) => !Object.hasOwn(candidate, name))
  ) {
    throw new DrwnError("VALIDATION_FAILED", "Management headers do not match the closed required inventory");
  }
  if (candidate["X-Drwn-Protocol"] !== managementContract.protocol) {
    throw new DrwnError("UNSUPPORTED_PROTOCOL", "The server request protocol does not match deployed-worker.v1");
  }
  if (
    typeof candidate.Authorization !== "string" ||
    !/^Bearer [^\s]+$/.test(candidate.Authorization) ||
    typeof candidate["X-Drwn-Version"] !== "string" ||
    !clientVersionPattern.test(candidate["X-Drwn-Version"]) ||
    !requestIdHeaderSchema.safeParse(candidate["X-Request-Id"]).success
  ) {
    throw new DrwnError("VALIDATION_FAILED", "Management headers are malformed");
  }
  return Object.freeze(Object.fromEntries(requiredHeaderNames.map((name) => [name, candidate[name] as string])));
}
