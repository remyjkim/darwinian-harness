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
const prefixedSha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const schemaRef = z.string().regex(/^#\/schemas\/[A-Za-z][A-Za-z0-9]*$/);
const routeKeySchema = z.string().regex(/^[a-z]+(?:[_.][a-z]+)*$/);

const wireErrorCodeSchema = z.enum([
  "consent_required",
  "authorization_denied",
  "resource_unavailable",
  "validation_failed",
  "revision_conflict",
  "rate_limited",
  "temporarily_unavailable",
  "mind_contract_removed",
  "client_protocol_unsupported",
]);
const clientErrorCodeSchema = z.enum([
  "CONSENT_REQUIRED",
  "AUTHORIZATION_DENIED",
  "RESOURCE_UNAVAILABLE",
  "VALIDATION_FAILED",
  "REVISION_CONFLICT",
  "RATE_LIMITED",
  "TEMPORARILY_UNAVAILABLE",
  "MIND_CONTRACT_REMOVED",
  "UNSUPPORTED_PROTOCOL",
  "SERVER_RESPONSE_INVALID",
]);

const lockSchema = z.object({
  schema: z.literal("drwn.management-contract-lock"),
  schemaVersion: z.literal(1),
  protocol: z.literal("deployed-worker.v1"),
  servicesRepository: z.literal("curation-labs/darwinian-services"),
  sourceCommit: commitSchema,
  sha256: sha256Schema,
  routeCount: z.literal(13),
  positiveVectorCount: z.literal(13),
  negativeVectorCount: z.literal(47),
  semanticVectorCount: z.literal(3),
  schemaCount: z.literal(62),
  rawBodyContractCount: z.literal(1),
  wireErrorCodeCount: z.literal(9),
  clientErrorCodeCount: z.literal(10),
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
  requestTransport: z.object({
    kind: z.literal("raw-body"),
    bodyContract: z.literal("#/rawBodyContracts/DeterministicWorkerDeployBundleV1"),
    contextBindings: z.object({
      requestId: z.literal("header.X-Request-Id"),
      deployedWorkerId: z.literal("path.deployedWorkerId"),
      artifactSha256: z.literal("path.artifactSha256"),
      byteLength: z.literal("header.Content-Length"),
    }).strict(),
  }).strict().optional(),
  successSchema: schemaRef,
  failureSchema: schemaRef,
}).strict();

const positiveVectorSchema = z.object({
  routeKey: routeKeySchema,
  request: jsonObjectSchema,
  bodyFixture: z.object({
    encoding: z.literal("base64"),
    bytesBase64: z.string().min(1),
    byteLength: z.number().int().positive(),
    sha256: sha256Schema,
  }).strict().optional(),
  success: jsonObjectSchema,
}).strict();

const negativeVectorSchema = z.object({
  caseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  routeKey: routeKeySchema,
  surface: z.enum(["request", "response", "header", "path", "body", "provider"]),
  candidate: jsonObjectSchema,
  expectedClientError: clientErrorCodeSchema,
}).strict();

const semanticVectorSchema = z.object({
  caseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  routeKey: routeKeySchema,
  layer: z.enum(["authorization", "producer"]),
  candidate: jsonObjectSchema,
  constraint: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  expected: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("wire-error"), code: wireErrorCodeSchema }).strict(),
    z.object({ kind: z.literal("producer-invariant"), code: z.literal("distinct-authoritative-fields") }).strict(),
  ]),
}).strict();

const contractSchema = z.object({
  schema: z.literal("cl.drwn.management-contract"),
  schemaVersion: z.literal(1),
  protocol: z.literal("deployed-worker.v1"),
  authority: z.object({
    i336ArchitectureCommit: commitSchema,
    i321CandidateCommit: commitSchema,
    workerArchitectureCommit: commitSchema,
    i330V132Commit: commitSchema,
    i330V132Sha256: prefixedSha256Schema,
    i330V132G2Commit: commitSchema,
    route13ArchitectureSha256: prefixedSha256Schema,
    route13DecisionRequest: z.literal("i336-20260826-route13-deterministic-streamed-bundle"),
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
        semantics: z.literal("lowercase-uuidv4-request-identity"),
      }).strict(),
    ]),
    mutationIdempotencyHeader: z.literal("X-Request-Id"),
  }).strict(),
  artifactStaging: z.object({
    minBundleBytes: z.literal(3_072),
    maxBundleBytes: z.literal(29_362_176),
    maxManifestBytes: z.literal(3_145_728),
    maxStoreBytes: z.literal(26_214_400),
    artifactRefPrefix: z.literal("deployment_artifact:sha256:"),
    requestIdDerivation: z.literal("uuidv4-from-artifact-sha256-first-16-bytes"),
    storage: z.literal("target-scoped-create-if-absent-verified-bundle-match"),
    payloadContract: z.literal("deterministic-worker-deploy-bundle-v1-ustar"),
    sameAttemptExistingBeforeValidationEof: z.literal("forbidden"),
    conditionalCreateRace: z.literal("temporarily-unavailable-retry-same-request-fresh-identical-file-stream"),
    existingResult: z.literal("fresh-attempt-complete-stream-validation-and-stored-object-readback"),
  }).strict(),
  rawBodyContracts: z.object({
    DeterministicWorkerDeployBundleV1: z.object({
      mediaType: z.literal("application/vnd.darwinian.worker-deploy-bundle.v1+tar"),
      contentEncoding: z.literal("forbidden"),
      contentLength: z.object({
        required: z.literal(true),
        minimum: z.literal(3_072),
        maximum: z.literal(29_362_176),
      }).strict(),
      digestBinding: z.literal("path.artifactSha256"),
      format: z.literal("deterministic-ustar-v1"),
      entries: z.tuple([
        z.object({
          path: z.literal("manifest.json"), order: z.literal(1), type: z.literal("regular-file"),
          minimumBytes: z.literal(1), maximumBytes: z.literal(3_145_728),
          contentContract: z.literal("canonical-worker-deploy-bundle-manifest-v1-json"),
        }).strict(),
        z.object({
          path: z.literal("store.tar"), order: z.literal(2), type: z.literal("regular-file"),
          minimumBytes: z.literal(1), maximumBytes: z.literal(26_214_400),
          contentContract: z.literal("deterministic-drwn-store-export-tar"),
        }).strict(),
      ]),
      manifestContract: z.object({
        schema: z.literal("darwinian.worker-deploy-bundle-manifest.v1"),
        canonicalization: z.literal("canonical-json/v1"),
        requiredTopLevelFields: z.tuple([
          z.literal("config"), z.literal("contractVersion"), z.literal("entrypoint"),
          z.literal("governance"), z.literal("lockfile"), z.literal("materialization"),
          z.literal("schema"), z.literal("storeExport"),
        ]),
        storeExport: z.object({
          requiredFields: z.tuple([
            z.literal("byteLength"), z.literal("compression"), z.literal("encoding"),
            z.literal("entry"), z.literal("kind"), z.literal("sha256"),
          ]),
          kind: z.literal("drwn-store-export-tar"),
          compression: z.literal("none"),
          encoding: z.literal("bundle-entry"),
          entry: z.literal("store.tar"),
        }).strict(),
        forbiddenFields: z.tuple([z.literal("bytesBase64"), z.literal("payloadBase64")]),
      }).strict(),
      headerPolicy: z.object({
        uid: z.literal(0), gid: z.literal(0), mtime: z.literal(0), mode: z.literal("0644"),
        uname: z.literal(""), gname: z.literal(""), extensions: z.literal("forbidden"),
        terminalZeroBlocks: z.literal(2), extraEntries: z.literal("forbidden"),
      }).strict(),
    }).strict(),
  }).strict(),
  routes: z.array(routeSchema).length(13),
  schemas: z.record(z.string(), jsonObjectSchema).refine((value) => Object.keys(value).length === 62),
  errors: z.object({
    wireCodes: z.array(wireErrorCodeSchema).length(9),
    clientCodes: z.array(clientErrorCodeSchema).length(10),
    clientCodeByWireCode: z.record(wireErrorCodeSchema, clientErrorCodeSchema),
    httpStatusByWireCode: z.record(wireErrorCodeSchema, z.number().int().min(400).max(599)),
    retryableWireCodes: z.tuple([z.literal("rate_limited"), z.literal("temporarily_unavailable")]),
    routeWireCodes: z.record(routeKeySchema, z.array(wireErrorCodeSchema).min(1)),
  }).strict(),
  semanticVectors: z.array(semanticVectorSchema).length(3),
  vectors: z.object({
    positive: z.array(positiveVectorSchema).length(13),
    negative: z.array(negativeVectorSchema).length(47),
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

function schemaNameFromRef(reference: string): string {
  const match = /^#\/schemas\/([A-Za-z][A-Za-z0-9]*)$/.exec(reference);
  if (!match) throw invalidContract(`Invalid management schema reference: ${reference}`);
  return match[1]!;
}

const supportedSchemaKeywords = new Set([
  "$ref",
  "type",
  "title",
  "description",
  "const",
  "enum",
  "format",
  "pattern",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "oneOf",
  "anyOf",
]);
const supportedSchemaTypes = new Set(["array", "boolean", "integer", "null", "object", "string"]);
const enumSchemaKeywords = new Set(["enum", "type", "title", "description"]);
const constSchemaKeywords = new Set(["const", "type", "title", "description"]);

function isJsonObject(value: ManagementJsonValue | undefined): value is ManagementJsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertNonNegativeInteger(value: ManagementJsonValue | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw invalidContract(`Management JSON Schema keyword ${path} must be a non-negative integer`);
  }
  return value;
}

function assertFiniteNumber(value: ManagementJsonValue | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidContract(`Management JSON Schema keyword ${path} must be a finite number`);
  }
  return value;
}

function literalMatchesSchemaType(value: JsonPrimitive, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

function assertJsonSchemaDialect(
  schema: ManagementJsonObject,
  path: string,
  references: ReadonlySet<string>,
): void {
  const keys = Object.keys(schema);
  for (const keyword of keys) {
    if (!supportedSchemaKeywords.has(keyword)) {
      throw invalidContract(`Unsupported management JSON Schema keyword at ${path}.${keyword}`);
    }
  }

  if (Object.hasOwn(schema, "$ref")) {
    if (typeof schema.$ref !== "string" || !references.has(schema.$ref)) {
      throw invalidContract(`Management JSON Schema reference is invalid at ${path}.$ref`);
    }
    if (keys.length !== 1) {
      throw invalidContract(`Management JSON Schema reference has ignored sibling keywords at ${path}`);
    }
    return;
  }

  const type = schema.type;
  if (type !== undefined && (typeof type !== "string" || !supportedSchemaTypes.has(type))) {
    throw invalidContract(`Management JSON Schema type is unsupported at ${path}.type`);
  }
  if (schema.title !== undefined && (typeof schema.title !== "string" || schema.title.length === 0)) {
    throw invalidContract(`Management JSON Schema title is invalid at ${path}.title`);
  }
  if (schema.description !== undefined && (typeof schema.description !== "string" || schema.description.length === 0)) {
    throw invalidContract(`Management JSON Schema description is invalid at ${path}.description`);
  }

  if (Object.hasOwn(schema, "const")) {
    if (schema.const !== null && !["boolean", "number", "string"].includes(typeof schema.const)) {
      throw invalidContract(`Management JSON Schema const is not a supported literal at ${path}.const`);
    }
    if (keys.some((keyword) => !constSchemaKeywords.has(keyword))) {
      throw invalidContract(`Management JSON Schema const has an ignored behavioral sibling at ${path}`);
    }
    if (type !== undefined && !literalMatchesSchemaType(schema.const as JsonPrimitive, type)) {
      throw invalidContract(`Management JSON Schema const contradicts its declared type at ${path}`);
    }
  }
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.some((value) =>
      value !== null && !["boolean", "number", "string"].includes(typeof value)
    )) {
      throw invalidContract(`Management JSON Schema enum is invalid at ${path}.enum`);
    }
    const identities = schema.enum.map((value) => JSON.stringify(value));
    if (new Set(identities).size !== identities.length) {
      throw invalidContract(`Management JSON Schema enum contains duplicate literals at ${path}.enum`);
    }
    if (keys.some((keyword) => !enumSchemaKeywords.has(keyword))) {
      throw invalidContract(`Management JSON Schema enum has an ignored behavioral sibling at ${path}`);
    }
    if (
      type !== undefined &&
      schema.enum.some((value) => !literalMatchesSchemaType(value as JsonPrimitive, type))
    ) {
      throw invalidContract(`Management JSON Schema enum contradicts its declared type at ${path}`);
    }
  }

  if (schema.format !== undefined && (schema.format !== "date-time" || type !== "string")) {
    throw invalidContract(`Management JSON Schema format is unsupported at ${path}.format`);
  }
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== "string" || type !== "string") {
      throw invalidContract(`Management JSON Schema pattern is invalid at ${path}.pattern`);
    }
    try {
      new RegExp(schema.pattern);
    } catch (error) {
      throw invalidContract(`Management JSON Schema pattern is invalid at ${path}.pattern`, error);
    }
  }

  const minLength = schema.minLength === undefined ? undefined : assertNonNegativeInteger(schema.minLength, `${path}.minLength`);
  const maxLength = schema.maxLength === undefined ? undefined : assertNonNegativeInteger(schema.maxLength, `${path}.maxLength`);
  if ((minLength !== undefined || maxLength !== undefined) && type !== "string") {
    throw invalidContract(`Management JSON Schema length keyword requires string type at ${path}`);
  }
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    throw invalidContract(`Management JSON Schema string bounds are inverted at ${path}`);
  }

  const minimum = schema.minimum === undefined ? undefined : assertFiniteNumber(schema.minimum, `${path}.minimum`);
  const maximum = schema.maximum === undefined ? undefined : assertFiniteNumber(schema.maximum, `${path}.maximum`);
  if ((minimum !== undefined || maximum !== undefined) && type !== "integer") {
    throw invalidContract(`Management JSON Schema numeric keyword requires integer type at ${path}`);
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw invalidContract(`Management JSON Schema numeric bounds are inverted at ${path}`);
  }

  const minItems = schema.minItems === undefined ? undefined : assertNonNegativeInteger(schema.minItems, `${path}.minItems`);
  const maxItems = schema.maxItems === undefined ? undefined : assertNonNegativeInteger(schema.maxItems, `${path}.maxItems`);
  if ((minItems !== undefined || maxItems !== undefined) && type !== "array") {
    throw invalidContract(`Management JSON Schema item-count keyword requires array type at ${path}`);
  }
  if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
    throw invalidContract(`Management JSON Schema array bounds are inverted at ${path}`);
  }

  let properties: ManagementJsonObject | undefined;
  if (schema.properties !== undefined) {
    if (!isJsonObject(schema.properties) || type !== "object") {
      throw invalidContract(`Management JSON Schema properties map is invalid at ${path}.properties`);
    }
    properties = schema.properties;
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      if (!isJsonObject(propertySchema)) {
        throw invalidContract(`Management JSON Schema property is invalid at ${path}.properties.${propertyName}`);
      }
      assertJsonSchemaDialect(propertySchema, `${path}.properties.${propertyName}`, references);
    }
  }
  if (schema.required !== undefined) {
    if (type !== "object" || !Array.isArray(schema.required) || schema.required.some((name) => typeof name !== "string")) {
      throw invalidContract(`Management JSON Schema required list is invalid at ${path}.required`);
    }
    const required = schema.required as string[];
    if (new Set(required).size !== required.length || required.some((name) => !properties || !Object.hasOwn(properties, name))) {
      throw invalidContract(`Management JSON Schema required list is not a unique properties subset at ${path}.required`);
    }
  }
  if (type === "object" && schema.additionalProperties !== false) {
    throw invalidContract(`Management object schema is not closed at ${path}`);
  }
  if (schema.additionalProperties !== undefined && (type !== "object" || schema.additionalProperties !== false)) {
    throw invalidContract(`Management JSON Schema additionalProperties is invalid at ${path}.additionalProperties`);
  }

  if (schema.items !== undefined) {
    if (!isJsonObject(schema.items) || type !== "array") {
      throw invalidContract(`Management JSON Schema items value is invalid at ${path}.items`);
    }
    assertJsonSchemaDialect(schema.items, `${path}.items`, references);
  } else if (type === "array") {
    throw invalidContract(`Management array schema has no enforced items schema at ${path}`);
  }

  for (const combinator of ["oneOf", "anyOf"] as const) {
    const branches = schema[combinator];
    if (branches === undefined) continue;
    if (!Array.isArray(branches) || branches.length < 2 || branches.some((branch) => !isJsonObject(branch))) {
      throw invalidContract(`Management JSON Schema ${combinator} is invalid at ${path}.${combinator}`);
    }
    branches.forEach((branch, index) => assertJsonSchemaDialect(
      branch as ManagementJsonObject,
      `${path}.${combinator}[${index}]`,
      references,
    ));
  }

  if (
    type === undefined && schema.enum === undefined && !Object.hasOwn(schema, "const") &&
    schema.oneOf === undefined && schema.anyOf === undefined
  ) {
    throw invalidContract(`Management JSON Schema has no enforced constraint at ${path}`);
  }
}

function assertContractJsonSchemaDialect(contract: ManagementContract): void {
  const references = new Set([
    ...Object.keys(contract.idKinds).map((name) => `#/idKinds/${name}`),
    ...Object.keys(contract.schemas).map((name) => `#/schemas/${name}`),
  ]);
  for (const [name, schema] of Object.entries(contract.idKinds)) {
    assertJsonSchemaDialect(schema as ManagementJsonObject, `idKinds.${name}`, references);
  }
  for (const [name, schema] of Object.entries(contract.schemas)) {
    assertJsonSchemaDialect(schema, `schemas.${name}`, references);
  }
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
    if (
      !schemaNames.has(schemaNameFromRef(route.requestSchema)) ||
      !schemaNames.has(schemaNameFromRef(route.successSchema)) ||
      !schemaNames.has(schemaNameFromRef(route.failureSchema))
    ) {
      throw invalidContract(`Management route ${route.routeKey} refers to an unknown schema`);
    }
    if ((route.routeKey === "deployment_artifacts.put") !== (route.requestTransport?.kind === "raw-body")) {
      throw invalidContract("Only deployment_artifacts.put may declare the frozen raw-body transport");
    }
  }
  if (contract.vectors.positive.some((vector) => !routeKeys.includes(vector.routeKey))) {
    throw invalidContract("A positive management vector refers to an unknown route");
  }
  if (contract.vectors.negative.some((vector) =>
    !routeKeys.includes(vector.routeKey) || !contract.errors.clientCodes.includes(vector.expectedClientError)
  )) {
    throw invalidContract("A negative management vector refers to an unknown route or error");
  }
  if (contract.semanticVectors.some((vector) => !routeKeys.includes(vector.routeKey))) {
    throw invalidContract("A semantic management vector refers to an unknown route");
  }
  const counts = {
    routeCount: contract.routes.length,
    positiveVectorCount: contract.vectors.positive.length,
    negativeVectorCount: contract.vectors.negative.length,
    semanticVectorCount: contract.semanticVectors.length,
    schemaCount: Object.keys(contract.schemas).length,
    rawBodyContractCount: Object.keys(contract.rawBodyContracts).length,
    wireErrorCodeCount: contract.errors.wireCodes.length,
    clientErrorCodeCount: contract.errors.clientCodes.length,
  };
  for (const [key, count] of Object.entries(counts)) {
    if (lock[key as keyof typeof counts] !== count) throw invalidContract(`Management contract ${key} does not match its lock`);
  }
  const wireCodes = [...contract.errors.wireCodes].sort().join("\n");
  if (
    Object.keys(contract.errors.httpStatusByWireCode).sort().join("\n") !== wireCodes ||
    Object.keys(contract.errors.clientCodeByWireCode).sort().join("\n") !== wireCodes ||
    Object.keys(contract.errors.routeWireCodes).sort().join("\n") !== [...routeKeys].sort().join("\n")
  ) {
    throw invalidContract("Management wire, projection, status, and route error inventories differ");
  }
  assertContractJsonSchemaDialect(contract);
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

export function parseManagementSuccess(routeKey: string, candidate: unknown, requestCandidate?: unknown): unknown {
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
  const response = result.data as ManagementJsonObject;
  if (routeKey === "deployment_artifacts.put") {
    const expectedRef = `deployment_artifact:sha256:${String(response.artifactSha256)}`;
    if (response.artifactRef !== expectedRef) {
      throw new DrwnError("SERVER_RESPONSE_INVALID", "Invalid deployment artifact response identity.");
    }
  }
  if (requestCandidate !== undefined) {
    const requestResult = managementSchemas[schemaNameFromRef(route.requestSchema)]!.safeParse(requestCandidate);
    if (!requestResult.success) {
      throw new DrwnError("SERVER_RESPONSE_INVALID", "The management server returned an invalid response.");
    }
    assertManagementSuccessMatchesRequest(routeKey, response, requestResult.data as ManagementJsonObject);
  }
  return response;
}

function invalidSuccessIdentity(): never {
  throw new DrwnError("SERVER_RESPONSE_INVALID", "The management server returned an invalid response.");
}

function objects(value: ManagementJsonValue | undefined): ManagementJsonObject[] {
  return value as ManagementJsonObject[];
}

function object(value: ManagementJsonValue | undefined): ManagementJsonObject {
  return value as ManagementJsonObject;
}

function revisionAdvanced(current: ManagementJsonValue | undefined, expected: ManagementJsonValue | undefined): boolean {
  return Number(current) > Number(expected);
}

function assertManagementSuccessMatchesRequest(
  routeKey: string,
  response: ManagementJsonObject,
  request: ManagementJsonObject,
): void {
  if (response.requestId !== request.requestId) invalidSuccessIdentity();
  switch (routeKey) {
    case "organizations.list":
      return;
    case "organizations.read":
      if (object(response.organization).organizationId !== request.organizationId) invalidSuccessIdentity();
      return;
    case "deployed_workers.register":
      if (response.organizationId !== request.organizationId) invalidSuccessIdentity();
      return;
    case "deployed_workers.list":
      if (objects(response.workers).some((worker) => (
        worker.organizationId !== request.organizationId ||
        (request.environment !== undefined && worker.environment !== request.environment)
      ))) invalidSuccessIdentity();
      return;
    case "deployed_workers.read":
      if (object(response.worker).deployedWorkerId !== request.deployedWorkerId) invalidSuccessIdentity();
      return;
    case "deployment_artifacts.put":
      if (
        response.deployedWorkerId !== request.deployedWorkerId ||
        response.artifactSha256 !== request.artifactSha256 ||
        response.byteLength !== request.byteLength
      ) invalidSuccessIdentity();
      return;
    case "deployments.create":
      if (
        response.deployedWorkerId !== request.deployedWorkerId ||
        !revisionAdvanced(response.workerRevision, request.expectedWorkerRevision)
      ) invalidSuccessIdentity();
      return;
    case "deployments.list":
      if (objects(response.deployments).some((deployment) => (
        deployment.deployedWorkerId !== request.deployedWorkerId
      ))) invalidSuccessIdentity();
      return;
    case "deployments.rollback":
      if (
        response.deployedWorkerId !== request.deployedWorkerId ||
        response.deploymentId !== request.deploymentId ||
        !revisionAdvanced(response.workerRevision, request.expectedWorkerRevision)
      ) invalidSuccessIdentity();
      return;
    case "secrets.set":
      if (
        response.deployedWorkerId !== request.deployedWorkerId ||
        response.name !== request.name ||
        !revisionAdvanced(response.workerRevision, request.expectedWorkerRevision)
      ) invalidSuccessIdentity();
      return;
    case "runs.create":
      if (response.deployedWorkerId !== request.deployedWorkerId) invalidSuccessIdentity();
      return;
    case "runs.read": {
      const run = object(response.run);
      if (run.deployedWorkerId !== request.deployedWorkerId || run.runId !== request.runId) invalidSuccessIdentity();
      return;
    }
    case "deployed_workers.retire":
      if (
        response.deployedWorkerId !== request.deployedWorkerId ||
        !revisionAdvanced(response.workerRevision, request.expectedWorkerRevision) ||
        !revisionAdvanced(response.bindingRevision, request.expectedBindingRevision)
      ) invalidSuccessIdentity();
      return;
    default:
      invalidSuccessIdentity();
  }
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
