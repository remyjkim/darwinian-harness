// ABOUTME: Defines and strictly validates Worker-owned runtime-admission declarations.
// ABOUTME: Derives canonical closure evidence without filesystem, network, or ambient state.

import { createHash } from "node:crypto";
import { DrwnError } from "./errors";

export const RUNTIME_ADMISSION_SCHEMA_VERSION = 1 as const;
export const RUNTIME_ADMISSION_MAX_IDENTIFIER_LENGTH = 256;
export const RUNTIME_ADMISSION_MAX_ENTRIES = 128;

export type RuntimeAdmissionProbeId = "buzz-artifact-sha256-v1" | "glibc-version-v1";
export type ApplicationAuthMode = "none" | "bearer" | "oauth";
export type ApplicationCertification = "maintained" | "security-approved" | "uncertified";

export interface CardRuntimeAdmissionV1 {
  version: typeof RUNTIME_ADMISSION_SCHEMA_VERSION;
  servers: Record<string, {
    authMode: "none";
    requirementIds: string[];
  }>;
  requirements: Array<{
    requirementId: string;
    probeId: RuntimeAdmissionProbeId;
    expected:
      | { artifactSha256: string }
      | { platformCapabilities: [string] };
  }>;
}

export interface CardApplicationRequirementsV1 {
  version: typeof RUNTIME_ADMISSION_SCHEMA_VERSION;
  apps: Array<{
    app: string;
    card?: {
      server: string;
      authMode: ApplicationAuthMode;
      tokenRef?: string;
      certification: ApplicationCertification;
    };
    pipedreamApp?: string;
  }>;
}

export interface RuntimeAdmissionDeclarationCarrier {
  servers?: unknown;
  runtimeAdmission?: unknown;
  applicationRequirements?: unknown;
}

export interface RuntimeAdmissionDeclarationValidationResult {
  ok: boolean;
  errors: string[];
}

export interface EffectiveMcpActivationV1 {
  schema: "darwinian.effective-mcp-activation";
  schemaVersion: 1;
  servers: Array<{
    serverId: string;
    active: true;
    readiness: "required" | "optional";
    authMode: "none";
    requirementIds: string[];
  }>;
  activationHash: string;
}

export interface RuntimeRequirementManifestV1 {
  schema: "darwinian.runtime-requirements";
  schemaVersion: 1;
  requirements: Array<{
    requirementId: string;
    probeId: string;
    criticality: "required" | "optional";
    expected: {
      artifactSha256?: string;
      version?: string;
      platformCapabilities?: string[];
    };
  }>;
  manifestHash: string;
}

export interface WorkerRuntimeAdmissionProducerEnvelopeV1 {
  schema: "darwinian.worker-runtime-admission";
  schemaVersion: 1;
  derivationVersion: "worker-runtime-admission-v1";
  closureHash: string;
  activation: EffectiveMcpActivationV1;
  runtimeRequirements: RuntimeRequirementManifestV1;
}

export interface RuntimeAdmissionClosureCard {
  name: string;
  requested: string;
  version: string;
  integrity: string;
  treeSha?: string;
  manifest: {
    name: string;
    version: string;
    servers?: Record<string, unknown>;
    runtimeAdmission?: CardRuntimeAdmissionV1;
    applicationRequirements?: CardApplicationRequirementsV1;
    [key: string]: unknown;
  };
}

export interface RuntimeAdmissionDerivation {
  envelope: WorkerRuntimeAdmissionProducerEnvelopeV1;
  applicationRequirements: CardApplicationRequirementsV1;
  canonicalEnvelope: string;
  canonicalApplicationRequirements: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${path} has unsupported field ${key}`);
  }
}

function identifier(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > RUNTIME_ADMISSION_MAX_IDENTIFIER_LENGTH) {
    errors.push(`${path} must be a non-empty string bounded to ${RUNTIME_ADMISSION_MAX_IDENTIFIER_LENGTH} characters`);
    return false;
  }
  return true;
}

function recordNfcIdentity(value: string, path: string, seen: Map<string, string>, errors: string[]) {
  const normalized = value.normalize("NFC");
  const prior = seen.get(normalized);
  if (prior !== undefined) {
    errors.push(`${path} duplicates or NFC-collides with ${prior}`);
    return;
  }
  seen.set(normalized, path);
}

function stringArray(value: unknown, path: string, errors: string[]): string[] | null {
  if (!Array.isArray(value) || value.length > RUNTIME_ADMISSION_MAX_ENTRIES) {
    errors.push(`${path} must be a string array with at most ${RUNTIME_ADMISSION_MAX_ENTRIES} entries`);
    return null;
  }
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (identifier(value[index], `${path}[${index}]`, errors)) output.push(value[index]);
  }
  return output;
}

function validateRawServer(server: unknown, path: string, errors: string[]) {
  if (!isObject(server)) {
    errors.push(`${path} must be a complete raw local stdio server`);
    return;
  }
  if (server.enabled !== undefined && server.transport === undefined) {
    errors.push(`${path} cannot be an enabled-only server override`);
  }
  if (typeof server.description !== "string" || server.description.length === 0) {
    errors.push(`${path}.description must be a non-empty string`);
  }
  if (server.transport !== "stdio") errors.push(`${path}.transport must be stdio`);
  if (typeof server.command !== "string" || server.command.length === 0) {
    errors.push(`${path}.command must be a non-empty string`);
  }
  if (typeof server.optional !== "boolean") errors.push(`${path}.optional must be boolean`);
  if (server.args !== undefined && (!Array.isArray(server.args) || !server.args.every((entry) => typeof entry === "string"))) {
    errors.push(`${path}.args must be string[]`);
  }
  if (server.url !== undefined || server.provider !== undefined) {
    errors.push(`${path} must not carry remote URL or provider authority`);
  }
}

function validateRuntimeAdmission(
  value: unknown,
  rawServersValue: unknown,
  errors: string[],
) {
  const path = "runtimeAdmission";
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  unknownKeys(value, ["version", "servers", "requirements"], path, errors);
  if (value.version !== RUNTIME_ADMISSION_SCHEMA_VERSION) errors.push(`${path}.version must be 1`);
  if (!isObject(value.servers)) {
    errors.push(`${path}.servers must be an object`);
    return;
  }
  if (!Array.isArray(value.requirements) || value.requirements.length > RUNTIME_ADMISSION_MAX_ENTRIES) {
    errors.push(`${path}.requirements must be an array with at most ${RUNTIME_ADMISSION_MAX_ENTRIES} entries`);
    return;
  }
  const rawServers = rawServersValue === undefined ? {} : rawServersValue;
  if (!isObject(rawServers)) {
    errors.push("servers must be an object when runtimeAdmission is present");
    return;
  }
  const declaredServerKeys = Object.keys(value.servers);
  const rawServerKeys = Object.keys(rawServers);
  if (declaredServerKeys.length > RUNTIME_ADMISSION_MAX_ENTRIES) {
    errors.push(`${path}.servers must have at most ${RUNTIME_ADMISSION_MAX_ENTRIES} entries`);
  }
  if (
    declaredServerKeys.length !== rawServerKeys.length
    || [...declaredServerKeys].sort().some((key, index) => key !== [...rawServerKeys].sort()[index])
  ) {
    errors.push(`${path}.servers must exactly match raw servers ownership`);
  }

  const serverIds = new Map<string, string>();
  const referencedRequirements = new Set<string>();
  for (const serverId of declaredServerKeys) {
    identifier(serverId, `${path}.servers key`, errors);
    recordNfcIdentity(serverId, `${path}.servers.${serverId}`, serverIds, errors);
    const declaration = value.servers[serverId];
    if (!isObject(declaration)) {
      errors.push(`${path}.servers.${serverId} must be an object`);
      continue;
    }
    unknownKeys(declaration, ["authMode", "requirementIds"], `${path}.servers.${serverId}`, errors);
    if (declaration.authMode !== "none") errors.push(`${path}.servers.${serverId}.authMode must be none`);
    const requirementIds = stringArray(
      declaration.requirementIds,
      `${path}.servers.${serverId}.requirementIds`,
      errors,
    );
    const withinServer = new Set<string>();
    for (const requirementId of requirementIds ?? []) {
      const normalized = requirementId.normalize("NFC");
      if (withinServer.has(normalized)) {
        errors.push(`${path}.servers.${serverId}.requirementIds has duplicate or NFC-colliding requirement ${requirementId}`);
      }
      withinServer.add(normalized);
      referencedRequirements.add(normalized);
    }
    validateRawServer(rawServers[serverId], `servers.${serverId}`, errors);
  }

  const requirementsById = new Map<string, string>();
  for (let index = 0; index < value.requirements.length; index += 1) {
    const requirement = value.requirements[index];
    const requirementPath = `${path}.requirements[${index}]`;
    if (!isObject(requirement)) {
      errors.push(`${requirementPath} must be an object`);
      continue;
    }
    unknownKeys(requirement, ["requirementId", "probeId", "expected"], requirementPath, errors);
    if (!identifier(requirement.requirementId, `${requirementPath}.requirementId`, errors)) continue;
    recordNfcIdentity(requirement.requirementId, requirementPath, requirementsById, errors);
    if (!isObject(requirement.expected)) {
      errors.push(`${requirementPath}.expected must be an object`);
      continue;
    }
    if (requirement.probeId === "buzz-artifact-sha256-v1") {
      unknownKeys(requirement.expected, ["artifactSha256"], `${requirementPath}.expected`, errors);
      if (typeof requirement.expected.artifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(requirement.expected.artifactSha256)) {
        errors.push(`${requirementPath}.expected.artifactSha256 must be lowercase 64-hex`);
      }
    } else if (requirement.probeId === "glibc-version-v1") {
      unknownKeys(requirement.expected, ["platformCapabilities"], `${requirementPath}.expected`, errors);
      const capabilities = requirement.expected.platformCapabilities;
      if (
        !Array.isArray(capabilities)
        || capabilities.length !== 1
        || typeof capabilities[0] !== "string"
        || !/^glibc>=\d+\.\d+$/.test(capabilities[0])
      ) {
        errors.push(`${requirementPath}.expected.platformCapabilities must contain one glibc>=major.minor capability`);
      }
    } else {
      errors.push(`${requirementPath}.probeId is not supported`);
    }
  }

  for (const requirementId of referencedRequirements) {
    if (!requirementsById.has(requirementId)) {
      errors.push(`${path} requirement reference ${requirementId} does not resolve`);
    }
  }
  for (const requirementId of requirementsById.keys()) {
    if (!referencedRequirements.has(requirementId)) {
      errors.push(`${path} requirement ${requirementId} is orphaned and must be referenced`);
    }
  }
}

function validateApplicationRequirements(value: unknown, errors: string[]) {
  const path = "applicationRequirements";
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  unknownKeys(value, ["version", "apps"], path, errors);
  if (value.version !== RUNTIME_ADMISSION_SCHEMA_VERSION) errors.push(`${path}.version must be 1`);
  if (!Array.isArray(value.apps) || value.apps.length > RUNTIME_ADMISSION_MAX_ENTRIES) {
    errors.push(`${path}.apps must be an array with at most ${RUNTIME_ADMISSION_MAX_ENTRIES} entries`);
    return;
  }
  const appIds = new Map<string, string>();
  for (let index = 0; index < value.apps.length; index += 1) {
    const app = value.apps[index];
    const appPath = `${path}.apps[${index}]`;
    if (!isObject(app)) {
      errors.push(`${appPath} must be an object`);
      continue;
    }
    unknownKeys(app, ["app", "card", "pipedreamApp"], appPath, errors);
    if (identifier(app.app, `${appPath}.app`, errors)) {
      recordNfcIdentity(app.app, appPath, appIds, errors);
    }
    if (app.card === undefined && app.pipedreamApp === undefined) {
      errors.push(`${appPath} must declare card, pipedreamApp, or both`);
    }
    if (app.pipedreamApp !== undefined) identifier(app.pipedreamApp, `${appPath}.pipedreamApp`, errors);
    if (app.card === undefined) continue;
    if (!isObject(app.card)) {
      errors.push(`${appPath}.card must be an object`);
      continue;
    }
    unknownKeys(app.card, ["server", "authMode", "tokenRef", "certification"], `${appPath}.card`, errors);
    identifier(app.card.server, `${appPath}.card.server`, errors);
    if (!(["none", "bearer", "oauth"] as unknown[]).includes(app.card.authMode)) {
      errors.push(`${appPath}.card.authMode must be none, bearer, or oauth`);
    }
    if (!(["maintained", "security-approved", "uncertified"] as unknown[]).includes(app.card.certification)) {
      errors.push(`${appPath}.card.certification is not supported`);
    }
    if (app.card.authMode === "bearer") {
      identifier(app.card.tokenRef, `${appPath}.card.tokenRef`, errors);
    } else if (app.card.tokenRef !== undefined) {
      errors.push(`${appPath}.card.tokenRef is allowed only for bearer authMode`);
    }
  }
}

export function validateRuntimeAdmissionDeclarations(
  input: RuntimeAdmissionDeclarationCarrier,
): RuntimeAdmissionDeclarationValidationResult {
  const errors: string[] = [];
  if (input.runtimeAdmission !== undefined) {
    validateRuntimeAdmission(input.runtimeAdmission, input.servers, errors);
  }
  if (input.applicationRequirements !== undefined) {
    validateApplicationRequirements(input.applicationRequirements, errors);
  }
  return { ok: errors.length === 0, errors };
}

export function compareRuntimeAdmissionIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalizeRuntimeAdmissionJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("runtime admission canonical JSON requires a safe integer");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeRuntimeAdmissionJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(compareRuntimeAdmissionIds)
      .map((key) => `${JSON.stringify(key)}:${canonicalizeRuntimeAdmissionJson(record[key])}`);
    return `{${members.join(",")}}`;
  }
  throw new TypeError(`unsupported canonical JSON value: ${typeof value}`);
}

function sha256CanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalizeRuntimeAdmissionJson(value), "utf8").digest("hex");
}

export function computeEffectiveMcpActivationHash(value: EffectiveMcpActivationV1): string {
  const servers = value.servers
    .map((server) => ({
      ...server,
      requirementIds: [...server.requirementIds].sort(compareRuntimeAdmissionIds),
    }))
    .sort((left, right) => compareRuntimeAdmissionIds(left.serverId, right.serverId));
  return sha256CanonicalJson({
    schema: value.schema,
    schemaVersion: value.schemaVersion,
    servers,
  });
}

export function computeRuntimeRequirementsHash(value: RuntimeRequirementManifestV1): string {
  const requirements = value.requirements
    .map((requirement) => ({
      ...requirement,
      expected: {
        ...requirement.expected,
        ...(requirement.expected.platformCapabilities
          ? { platformCapabilities: [...requirement.expected.platformCapabilities].sort(compareRuntimeAdmissionIds) }
          : {}),
      },
    }))
    .sort((left, right) => compareRuntimeAdmissionIds(left.requirementId, right.requirementId));
  return sha256CanonicalJson({
    schema: value.schema,
    schemaVersion: value.schemaVersion,
    requirements,
  });
}

function derivationInvalid(detail: string): never {
  throw new DrwnError(
    "WORKER_RUNTIME_ADMISSION_INVALID",
    `Invalid runtime admission closure: ${detail}`,
  );
}

function requireClosureIdentity(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > RUNTIME_ADMISSION_MAX_IDENTIFIER_LENGTH) {
    return derivationInvalid(`${path} must be a bounded non-empty string`);
  }
  return value;
}

function recordClosureIdentity(
  value: string,
  path: string,
  seen: Map<string, string>,
) {
  const normalized = value.normalize("NFC");
  const prior = seen.get(normalized);
  if (prior !== undefined) derivationInvalid(`${path} duplicates or NFC-collides with ${prior}`);
  seen.set(normalized, path);
}

function normalizedRuntimeDeclaration(value: CardRuntimeAdmissionV1) {
  return {
    version: value.version,
    servers: Object.fromEntries(
      Object.entries(value.servers)
        .sort(([left], [right]) => compareRuntimeAdmissionIds(left, right))
        .map(([serverId, server]) => [serverId, {
          authMode: server.authMode,
          requirementIds: [...server.requirementIds].sort(compareRuntimeAdmissionIds),
        }]),
    ),
    requirements: value.requirements
      .map((requirement) => ({
        ...requirement,
        expected: "platformCapabilities" in requirement.expected
          ? { platformCapabilities: [...requirement.expected.platformCapabilities].sort(compareRuntimeAdmissionIds) }
          : { artifactSha256: requirement.expected.artifactSha256 },
      }))
      .sort((left, right) => compareRuntimeAdmissionIds(left.requirementId, right.requirementId)),
  };
}

function normalizedApplicationDeclaration(value: CardApplicationRequirementsV1): CardApplicationRequirementsV1 {
  return {
    version: 1,
    apps: value.apps
      .map((app) => ({
        app: app.app,
        ...(app.card ? { card: { ...app.card } } : {}),
        ...(app.pipedreamApp ? { pipedreamApp: app.pipedreamApp } : {}),
      }))
      .sort((left, right) => compareRuntimeAdmissionIds(left.app, right.app)),
  };
}

function compareClosureCards(left: RuntimeAdmissionClosureCard, right: RuntimeAdmissionClosureCard): number {
  const identityParts: Array<readonly [string, string]> = [
    [left.name, right.name],
    [left.version, right.version],
    [left.treeSha ?? "", right.treeSha ?? ""],
    [left.integrity, right.integrity],
  ];
  for (const [leftPart, rightPart] of identityParts) {
    const compared = compareRuntimeAdmissionIds(leftPart, rightPart);
    if (compared !== 0) return compared;
  }
  return 0;
}

export function deriveRuntimeAdmissionForClosure(
  cards: readonly RuntimeAdmissionClosureCard[],
): RuntimeAdmissionDerivation {
  if (cards.length === 0 || cards.length > RUNTIME_ADMISSION_MAX_ENTRIES) {
    derivationInvalid(`cards must contain 1-${RUNTIME_ADMISSION_MAX_ENTRIES} entries`);
  }

  const cardIds = new Map<string, string>();
  const requestedIds = new Map<string, string>();
  const serverIds = new Map<string, string>();
  const requirementIds = new Map<string, string>();
  const activationServers: EffectiveMcpActivationV1["servers"] = [];
  const requirements = new Map<string, CardRuntimeAdmissionV1["requirements"][number]>();
  const requiredRequirementIds = new Set<string>();
  const applicationIds = new Map<string, string>();
  const applications = new Map<string, CardApplicationRequirementsV1["apps"][number]>();

  for (const [cardIndex, card] of cards.entries()) {
    const cardPath = `cards[${cardIndex}]`;
    requireClosureIdentity(card.name, `${cardPath}.name`);
    requireClosureIdentity(card.requested, `${cardPath}.requested`);
    requireClosureIdentity(card.version, `${cardPath}.version`);
    requireClosureIdentity(card.integrity, `${cardPath}.integrity`);
    if (typeof card.treeSha !== "string" || !/^[a-f0-9]{40}$/.test(card.treeSha)) {
      derivationInvalid(`${cardPath}.treeSha must be lowercase 40-hex`);
    }
    if (card.manifest.name !== card.name || card.manifest.version !== card.version) {
      derivationInvalid(`${cardPath} identity does not match its manifest`);
    }
    recordClosureIdentity(card.name, `${cardPath}.name`, cardIds);
    recordClosureIdentity(card.requested, `${cardPath}.requested`, requestedIds);

    if (card.manifest.runtimeAdmission === undefined || card.manifest.applicationRequirements === undefined) {
      derivationInvalid(`${cardPath} declaration coverage is incomplete`);
    }
    const declarationValidation = validateRuntimeAdmissionDeclarations(card.manifest);
    if (!declarationValidation.ok) {
      derivationInvalid(`${cardPath} declarations are invalid: ${declarationValidation.errors.join("; ")}`);
    }
    const runtimeAdmission = card.manifest.runtimeAdmission;
    const applicationRequirements = card.manifest.applicationRequirements;

    for (const [serverId, declaration] of Object.entries(runtimeAdmission.servers)) {
      recordClosureIdentity(serverId, `${cardPath}.runtimeAdmission.servers.${serverId}`, serverIds);
      const rawServer = card.manifest.servers?.[serverId];
      if (!isObject(rawServer)) derivationInvalid(`${cardPath}.servers.${serverId} is unavailable`);
      const readiness = rawServer.optional === true ? "optional" : "required";
      const sortedRequirementIds = [...declaration.requirementIds].sort(compareRuntimeAdmissionIds);
      activationServers.push({
        serverId,
        active: true,
        readiness,
        authMode: "none",
        requirementIds: sortedRequirementIds,
      });
      if (readiness === "required") {
        for (const requirementId of sortedRequirementIds) {
          requiredRequirementIds.add(requirementId.normalize("NFC"));
        }
      }
    }

    for (const requirement of runtimeAdmission.requirements) {
      recordClosureIdentity(
        requirement.requirementId,
        `${cardPath}.runtimeAdmission.requirements.${requirement.requirementId}`,
        requirementIds,
      );
      requirements.set(requirement.requirementId.normalize("NFC"), requirement);
    }

    for (const application of applicationRequirements.apps) {
      recordClosureIdentity(
        application.app,
        `${cardPath}.applicationRequirements.apps.${application.app}`,
        applicationIds,
      );
      applications.set(application.app.normalize("NFC"), application);
    }
  }

  const activation: EffectiveMcpActivationV1 = {
    schema: "darwinian.effective-mcp-activation",
    schemaVersion: 1,
    servers: activationServers.sort((left, right) => compareRuntimeAdmissionIds(left.serverId, right.serverId)),
    activationHash: "0".repeat(64),
  };
  activation.activationHash = computeEffectiveMcpActivationHash(activation);

  const runtimeRequirements: RuntimeRequirementManifestV1 = {
    schema: "darwinian.runtime-requirements",
    schemaVersion: 1,
    requirements: [...requirements.entries()]
      .map(([normalizedId, requirement]) => ({
        requirementId: requirement.requirementId,
        probeId: requirement.probeId,
        criticality: requiredRequirementIds.has(normalizedId) ? "required" as const : "optional" as const,
        expected: "platformCapabilities" in requirement.expected
          ? { platformCapabilities: [...requirement.expected.platformCapabilities].sort(compareRuntimeAdmissionIds) }
          : { artifactSha256: requirement.expected.artifactSha256 },
      }))
      .sort((left, right) => compareRuntimeAdmissionIds(left.requirementId, right.requirementId)),
    manifestHash: "0".repeat(64),
  };
  runtimeRequirements.manifestHash = computeRuntimeRequirementsHash(runtimeRequirements);

  const applicationRequirements: CardApplicationRequirementsV1 = {
    version: 1,
    apps: [...applications.values()]
      .map((application) => ({
        app: application.app,
        ...(application.card ? { card: { ...application.card } } : {}),
        ...(application.pipedreamApp ? { pipedreamApp: application.pipedreamApp } : {}),
      }))
      .sort((left, right) => compareRuntimeAdmissionIds(left.app, right.app)),
  };

  const closurePreimage = {
    derivationVersion: "worker-runtime-admission-v1",
    cards: [...cards].sort(compareClosureCards).map((card) => ({
      name: card.name,
      requested: card.requested,
      version: card.version,
      integrity: card.integrity,
      treeSha: card.treeSha,
      rawServers: card.manifest.servers ?? {},
      runtimeAdmission: normalizedRuntimeDeclaration(card.manifest.runtimeAdmission!),
      applicationRequirements: normalizedApplicationDeclaration(card.manifest.applicationRequirements!),
    })),
  };

  const envelope: WorkerRuntimeAdmissionProducerEnvelopeV1 = {
    schema: "darwinian.worker-runtime-admission",
    schemaVersion: 1,
    derivationVersion: "worker-runtime-admission-v1",
    closureHash: sha256CanonicalJson(closurePreimage),
    activation,
    runtimeRequirements,
  };
  return {
    envelope,
    applicationRequirements,
    canonicalEnvelope: canonicalizeRuntimeAdmissionJson(envelope),
    canonicalApplicationRequirements: canonicalizeRuntimeAdmissionJson(applicationRequirements),
  };
}
