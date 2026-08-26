// ABOUTME: Pins the Services-owned deployed-worker.v1 contract as Worker package input.
// ABOUTME: Proves strict admission, schema conformance, and closed route resolution without network I/O.

import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  loadManagementContractFromPackageRoot,
  managementContract,
  managementContractLock,
  managementSchemaName,
  managementSchemas,
  parseManagementRequest,
  parseManagementSuccess,
  validateManagementHeaders,
} from "../cli/core/management/contracts";
import {
  assertManagementPathAllowed,
  MANAGEMENT_ROUTE_KEYS,
  managementRoutes,
  resolveManagementRoute,
} from "../cli/core/management/routes";

const repoRoot = join(import.meta.dir, "..");
const vendoredPath = join(repoRoot, "registry", "contracts", "deployed-worker.v1", "contract.json");
const lockPath = join(repoRoot, "cli", "generated", "drwn-management-contract-lock.json");
const servicesPath = resolve(
  repoRoot,
  "..",
  "..",
  "darwinian-services",
  ".worktrees",
  "i336-deployment-architecture-v1-3",
  "ops",
  "deploy",
  "contracts",
  "drwn-management",
  "v1",
  "contract.json",
);
const expectedDigest = "1534f85fe8d9079eb1c6c3cc9cf34477fb7cd19973247f31f4b98df0ed9bc3b2";

test("vendors the exact immutable Services artifact and pins its authority", () => {
  expect(existsSync(vendoredPath)).toBe(true);
  expect(existsSync(lockPath)).toBe(true);
  const vendoredBytes = readFileSync(vendoredPath);
  expect(createHash("sha256").update(vendoredBytes).digest("hex")).toBe(expectedDigest);
  if (existsSync(servicesPath)) {
    expect(vendoredBytes.equals(readFileSync(servicesPath))).toBe(true);
  }
  expect(managementContractLock).toEqual({
    schema: "drwn.management-contract-lock",
    schemaVersion: 1,
    protocol: "deployed-worker.v1",
    servicesRepository: "curation-labs/darwinian-services",
    sourceCommit: "bc5e32660ac711e13dfe68731caf515810cfa035",
    sha256: expectedDigest,
    routeCount: 13,
    positiveVectorCount: 13,
    negativeVectorCount: 32,
    semanticVectorCount: 3,
    schemaCount: 63,
    wireErrorCodeCount: 9,
    clientErrorCodeCount: 10,
  });
});

test("admits the closed contract and derives the exact route inventory", () => {
  expect(managementContract.protocol).toBe("deployed-worker.v1");
  expect(Object.isFrozen(managementContract)).toBe(true);
  expect(Object.isFrozen(managementContract.schemas)).toBe(true);
  expect(Object.isFrozen(managementSchemas)).toBe(true);
  expect(Object.keys(managementContract.schemas)).toHaveLength(63);
  expect(managementContract.vectors.positive).toHaveLength(13);
  expect(managementContract.vectors.negative).toHaveLength(32);
  expect(managementContract.semanticVectors).toHaveLength(3);
  expect(MANAGEMENT_ROUTE_KEYS).toEqual([
    "organizations.list",
    "organizations.read",
    "deployed_workers.register",
    "deployed_workers.list",
    "deployed_workers.read",
    "deployment_artifacts.put",
    "deployments.create",
    "deployments.list",
    "deployments.rollback",
    "secrets.set",
    "runs.create",
    "runs.read",
    "deployed_workers.retire",
  ]);
  expect(Object.isFrozen(managementRoutes)).toBe(true);
  expect(Object.keys(managementRoutes)).toEqual([...MANAGEMENT_ROUTE_KEYS]);
});

test("pins target-scoped immutable deployment artifact staging semantics", () => {
  const contract = managementContract as unknown as {
    artifactStaging: Record<string, unknown>;
    vectors: { positive: Array<{ routeKey: string; request: Record<string, unknown>; success: Record<string, unknown> }> };
  };
  expect(contract.artifactStaging).toEqual({
    maxPayloadBytes: 37_748_736,
    artifactRefPrefix: "deployment_artifact:sha256:",
    requestIdDerivation: "uuidv4-from-artifact-sha256-first-16-bytes",
    storage: "target-scoped-create-if-absent-exact-byte-match",
    payloadContract: "canonical-worker-deploy-payload-v1-json",
  });
  const vector = contract.vectors.positive.find(({ routeKey }) => routeKey === "deployment_artifacts.put")!;
  const payload = Buffer.from(String(vector.request.payloadBase64), "base64");
  expect(createHash("sha256").update(payload).digest("hex")).toBe(String(vector.request.artifactSha256));
  expect(payload.byteLength).toBe(Number(vector.request.byteLength));
  expect(vector.success).toMatchObject({
    requestId: "68672414-40ef-47a7-8a48-75c40b56afde",
    deployedWorkerId: "deployed_worker_alpha",
    artifactRef: `deployment_artifact:sha256:${vector.request.artifactSha256}`,
    artifactSha256: vector.request.artifactSha256,
    byteLength: vector.request.byteLength,
    status: "created",
  });
});

test("registration intent excludes client WorkerId while success returns authoritative identity", () => {
  const route = managementRoutes["deployed_workers.register"];
  const positive = managementContract.vectors.positive.find(({ routeKey }) => routeKey === route.routeKey)!;
  const requestSchema = managementContract.schemas.DeployedWorkersRegisterRequest as {
    required: string[];
    properties: Record<string, unknown>;
  };

  expect(requestSchema.required).toEqual(["requestId", "organizationId", "name", "environment"]);
  expect(Object.keys(requestSchema.properties)).toEqual(["requestId", "organizationId", "name", "environment"]);
  expect(Object.keys(positive.request)).toEqual(["requestId", "organizationId", "name", "environment"]);
  expect(positive.success).toMatchObject({ workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha" });
});

test("loads from an installed package-shaped root without a Services checkout", () => {
  const packageRoot = mkdtempSync(join(tmpdir(), "drwn-management-contract-"));
  try {
    const copiedContract = join(packageRoot, "registry", "contracts", "deployed-worker.v1", "contract.json");
    const copiedLock = join(packageRoot, "cli", "generated", "drwn-management-contract-lock.json");
    mkdirSync(dirname(copiedContract), { recursive: true });
    mkdirSync(dirname(copiedLock), { recursive: true });
    writeFileSync(copiedContract, readFileSync(vendoredPath));
    writeFileSync(copiedLock, readFileSync(lockPath));
    expect(loadManagementContractFromPackageRoot(packageRoot).contract.protocol).toBe("deployed-worker.v1");
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("resolves only declared route variables and never accepts an arbitrary route key", () => {
  expect(resolveManagementRoute("organizations.read", { organizationId: "org_acme" })).toMatchObject({
    method: "GET",
    path: "/api/organizations/org_acme",
  });
  expect(() => resolveManagementRoute("organizations.read", {})).toThrow();
  expect(() => resolveManagementRoute("organizations.read", { organizationId: "org_acme", extra: "x" })).toThrow();
  expect(() => resolveManagementRoute("organizations.read", { organizationId: "org_acme/../escape" })).toThrow();
  expect(() => resolveManagementRoute("https://example.invalid" as never, {})).toThrow();
});

test("pins strict top-level, profile, header, ID, and error inventories", () => {
  expect(Object.keys(managementContract)).toEqual([
    "schema",
    "schemaVersion",
    "protocol",
    "authority",
    "enums",
    "idKinds",
    "profiles",
    "headers",
    "artifactStaging",
    "routes",
    "schemas",
    "errors",
    "semanticVectors",
    "vectors",
  ]);
  expect(managementContract.profiles).toEqual({
    production: {
      profileId: "production",
      apiOrigin: "https://api.darwinian.dev",
      webOrigin: "https://foundry.darwinian.dev",
      authHubOrigin: "https://auth.darwinian.dev",
      issuer: "https://auth.darwinian.dev/api/auth",
      resource: "https://api.darwinian.dev",
      clientId: "drwn-cli",
      requestedScopes: ["openid", "email", "offline_access", "dah:management.delegate"],
    },
    staging: {
      profileId: "staging",
      apiOrigin: "https://api-staging-main.darwinian.dev",
      webOrigin: "https://foundry-staging-main.darwinian.dev",
      authHubOrigin: "https://auth-staging-main.darwinian.dev",
      issuer: "https://auth-staging-main.darwinian.dev/api/auth",
      resource: "https://api.darwinian.dev",
      clientId: "drwn-cli",
      requestedScopes: ["openid", "email", "offline_access", "dah:management.delegate"],
    },
  });
  expect(managementContract.headers).toEqual({
    required: [
      { name: "Authorization", semantics: "services-bearer-only" },
      { name: "X-Drwn-Protocol", semantics: "exact-protocol" },
      { name: "X-Drwn-Version", semantics: "client-version" },
      { name: "X-Request-Id", semantics: "lowercase-uuidv4-request-identity" },
    ],
    mutationIdempotencyHeader: "X-Request-Id",
  });
  expect(Object.fromEntries(Object.entries(managementContract.idKinds).map(([name, schema]) => [name, schema.pattern]))).toEqual({
    OrganizationId: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    WorkerId: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    DeployedWorkerId: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    DeploymentId: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    RunId: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    RequestId: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  });
  expect(new Set(Object.values(managementContract.idKinds).slice(0, 5).map((schema) => schema.pattern)).size).toBe(1);
  expect(managementContract.errors.wireCodes).toContain("client_protocol_unsupported");
  expect(managementContract.errors.wireCodes).not.toContain("server_response_invalid");
  expect(managementContract.errors.clientCodes).toContain("SERVER_RESPONSE_INVALID");
  expect(managementContract.errors.clientCodeByWireCode.client_protocol_unsupported).toBe("UNSUPPORTED_PROTOCOL");
  expect(managementContract.schemas.PublicError).toBeUndefined();
});

function assertObjectSchemasClosed(value: unknown, path = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertObjectSchemasClosed(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "object") expect(record.additionalProperties, path).toBe(false);
  for (const [key, child] of Object.entries(record)) assertObjectSchemasClosed(child, `${path}.${key}`);
}

test("compiles every closed schema reference and parses all thirteen positive vectors", () => {
  for (const [name, schema] of Object.entries(managementContract.schemas)) {
    assertObjectSchemasClosed(schema, `schemas.${name}`);
    expect(managementSchemas[name], name).toBeDefined();
  }
  for (const vector of managementContract.vectors.positive) {
    const route = managementRoutes[vector.routeKey as keyof typeof managementRoutes];
    expect(route, vector.routeKey).toBeDefined();
    expect(managementSchemas[managementSchemaName(route.requestSchema)]!.safeParse(vector.request).success).toBe(true);
    expect(managementSchemas[managementSchemaName(route.successSchema)]!.safeParse(vector.success).success).toBe(true);
    expect(parseManagementRequest(vector.routeKey, vector.request)).toEqual(vector.request);
    expect(parseManagementSuccess(vector.routeKey, vector.success)).toEqual(vector.success);
  }
});

function caughtCode(operation: () => unknown): string | undefined {
  try {
    operation();
    return undefined;
  } catch (error) {
    return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  }
}

test("rejects all thirty-two executable negatives on only their intended client surface", () => {
  const positives = new Map(managementContract.vectors.positive.map((vector) => [vector.routeKey, vector]));
  const baseHeaders = {
    Authorization: "Bearer services-token-fixture",
    "X-Drwn-Protocol": "deployed-worker.v1",
    "X-Drwn-Version": "1.4.2",
    "X-Request-Id": "123e4567-e89b-42d3-a456-426614174000",
  };
  for (const vector of managementContract.vectors.negative) {
    expect(managementContract.errors.clientCodes, vector.caseId).toContain(vector.expectedClientError);
    const positive = positives.get(vector.routeKey)!;
    expect(parseManagementRequest(vector.routeKey, positive.request), vector.caseId).toEqual(positive.request);
    expect(parseManagementSuccess(vector.routeKey, positive.success), vector.caseId).toEqual(positive.success);
    let code: string | undefined;
    if (vector.surface === "request") {
      code = caughtCode(() => parseManagementRequest(vector.routeKey, { ...positive.request, ...vector.candidate }));
    } else if (vector.surface === "response") {
      code = caughtCode(() => parseManagementSuccess(
        vector.routeKey,
        { ...positive.success, ...vector.candidate },
        positive.request,
      ));
    } else if (vector.surface === "header") {
      code = caughtCode(() => validateManagementHeaders({ ...baseHeaders, ...vector.candidate }));
    } else {
      code = caughtCode(() => assertManagementPathAllowed(String(vector.candidate.path)));
    }
    expect(code, vector.caseId).toBe(vector.expectedClientError);
  }
});

test("preserves opaque legacy IDs and keeps cross-kind checks in semantic server vectors", () => {
  for (const value of ["card_legacy-deployed", "worker_legacy-deployed", "dep_legacy-attempt"]) {
    expect(() => resolveManagementRoute("deployed_workers.read", { deployedWorkerId: value })).not.toThrow();
  }
  expect(managementContract.semanticVectors.map(({ caseId }) => caseId)).toEqual([
    "organization-worker-id-confusion",
    "worker-deployed-worker-id-confusion",
    "deployed-worker-deployment-id-confusion",
  ]);
  expect(managementContract.vectors.negative.some(({ caseId }) => caseId.includes("confusion"))).toBe(false);
});

function collectPropertyPaths(value: unknown, path: string, target: string[], forbidden: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectPropertyPaths(child, `${path}[${index}]`, target, forbidden));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (forbidden.has(key.toLowerCase().replace(/[_-]/g, ""))) target.push(childPath);
    collectPropertyPaths(child, childPath, target, forbidden);
  }
}

test("keeps credentials and secret values out of every response schema and vector", () => {
  const forbidden = new Set([
    "credential",
    "credentials",
    "access",
    "accesstoken",
    "refresh",
    "refreshtoken",
    "authorization",
    "cookie",
    "managementtoken",
    "keyref",
    "privatekey",
    "secretvalue",
    "value",
  ]);
  const violations: string[] = [];
  for (const route of Object.values(managementRoutes)) {
    const name = managementSchemaName(route.successSchema);
    collectPropertyPaths(managementContract.schemas[name], `schemas.${name}`, violations, forbidden);
  }
  collectPropertyPaths(managementContract.schemas.PublicError, "schemas.PublicError", violations, forbidden);
  collectPropertyPaths(managementContract.errors, "errors", violations, forbidden);
  for (const vector of managementContract.vectors.positive) {
    collectPropertyPaths(vector.success, `positive.${vector.routeKey}.success`, violations, forbidden);
  }
  expect(violations).toEqual([]);

  const requestValuePaths: string[] = [];
  for (const [name, schema] of Object.entries(managementContract.schemas)) {
    if (name.endsWith("Request")) collectPropertyPaths(schema, `schemas.${name}`, requestValuePaths, new Set(["value"]));
  }
  expect(requestValuePaths).toEqual(["schemas.SecretsSetRequest.properties.value"]);
  const vectorValuePaths: string[] = [];
  for (const vector of managementContract.vectors.positive) {
    collectPropertyPaths(vector.request, `positive.${vector.routeKey}.request`, vectorValuePaths, new Set(["value"]));
  }
  expect(vectorValuePaths).toEqual(["positive.secrets.set.request.value"]);
});

function admissionCodeForMutatedContract(mutate: (contract: Record<string, any>) => void): string | undefined {
  const packageRoot = mkdtempSync(join(tmpdir(), "drwn-management-schema-dialect-"));
  try {
    const contractPath = join(packageRoot, "registry", "contracts", "deployed-worker.v1", "contract.json");
    const packageLockPath = join(packageRoot, "cli", "generated", "drwn-management-contract-lock.json");
    mkdirSync(dirname(contractPath), { recursive: true });
    mkdirSync(dirname(packageLockPath), { recursive: true });
    const mutated = structuredClone(managementContract) as unknown as Record<string, any>;
    mutate(mutated);
    const bytes = `${JSON.stringify(mutated, null, 2)}\n`;
    writeFileSync(contractPath, bytes);
    writeFileSync(packageLockPath, `${JSON.stringify({
      ...managementContractLock,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }, null, 2)}\n`);
    return caughtCode(() => loadManagementContractFromPackageRoot(packageRoot));
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
}

test("strict admission rejects an unknown JSON Schema keyword before compilation", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.OrganizationsListRequest.xUnknownConstraint = true;
  })).toBe("MANAGEMENT_CONTRACT_INVALID");
});

test("strict admission rejects a recognized JSON Schema keyword that the compiler ignores", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.OrganizationsListSuccess.properties.organizations.uniqueItems = true;
  })).toBe("MANAGEMENT_CONTRACT_INVALID");
});

test("strict admission rejects a schema format that the compiler would ignore", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.Timestamp.format = "json-string";
  })).toBe("MANAGEMENT_CONTRACT_INVALID");
});

test("strict admission rejects an invalid value shape for a supported keyword", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.OrganizationsListRequest.required = "requestId";
  })).toBe("MANAGEMENT_CONTRACT_INVALID");
});

test("strict admission treats property names as data rather than schema keywords", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.OrganizationsListRequest.properties.xUnknownConstraint = { type: "boolean" };
  })).toBeUndefined();
});

test("strict admission rejects a behavioral sibling ignored by enum compilation", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.Environment = { type: "string", enum: ["ok"], minLength: 10 };
  })).toBe("MANAGEMENT_CONTRACT_INVALID");
});

test("strict admission rejects a behavioral sibling ignored by const compilation", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.RunStatus = { type: "string", const: "ok", pattern: "^never$" };
  })).toBe("MANAGEMENT_CONTRACT_INVALID");
});

test("strict admission rejects enum literals that contradict their declared type", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.Environment = { type: "string", enum: [1] };
  })).toBe("MANAGEMENT_CONTRACT_INVALID");
});

test("strict admission rejects a const literal that contradicts its declared type", () => {
  expect(admissionCodeForMutatedContract((contract) => {
    contract.schemas.RunStatus = { type: "string", const: false };
  })).toBe("MANAGEMENT_CONTRACT_INVALID");
});

test("fails closed with a stable error when packaged bytes pass the lock but violate strict admission", () => {
  const packageRoot = mkdtempSync(join(tmpdir(), "drwn-management-invalid-"));
  try {
    const contractPath = join(packageRoot, "registry", "contracts", "deployed-worker.v1", "contract.json");
    const packageLockPath = join(packageRoot, "cli", "generated", "drwn-management-contract-lock.json");
    mkdirSync(dirname(contractPath), { recursive: true });
    mkdirSync(dirname(packageLockPath), { recursive: true });
    const mutated = { ...managementContract, unknownTopLevel: true };
    const bytes = `${JSON.stringify(mutated, null, 2)}\n`;
    writeFileSync(contractPath, bytes);
    writeFileSync(packageLockPath, `${JSON.stringify({
      ...managementContractLock,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }, null, 2)}\n`);
    expect(caughtCode(() => loadManagementContractFromPackageRoot(packageRoot))).toBe("MANAGEMENT_CONTRACT_INVALID");
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("route resolution is pure and validates every declared path-variable schema", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    throw new Error("route resolution must not fetch");
  }) as unknown as typeof fetch;
  try {
    expect(resolveManagementRoute("deployments.rollback", {
      deployedWorkerId: "deployed_worker_alpha",
      deploymentId: "deployment_attempt_0001",
    }).path).toBe("/api/deployed-workers/deployed_worker_alpha/deployments/deployment_attempt_0001/rollback");
    expect(resolveManagementRoute("secrets.set", {
      deployedWorkerId: "deployed_worker_alpha",
      name: "PROVIDER_API_KEY",
    }).path).toBe("/api/deployed-workers/deployed_worker_alpha/secrets/PROVIDER_API_KEY");
    expect(() => resolveManagementRoute("secrets.set", {
      deployedWorkerId: "deployed_worker_alpha",
      name: "../escape",
    })).toThrow();
    expect(fetchCalled).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
