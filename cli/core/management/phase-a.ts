// ABOUTME: Admits and invokes the exact dependency-closed I321 D52 Phase-A executor artifact.
// ABOUTME: Worker owns byte admission and process lifetime, never eligibility, ordering, cleanup, or receipt semantics.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { z } from "zod";
import { DrwnError } from "../errors";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const lockSchema = z.object({
  schema: z.literal("dah.cli-management-phase-a-contract-lock"),
  schemaVersion: z.literal(1),
  servicesRepository: z.literal("curation-labs/darwinian-services"),
  sourceCommit: gitShaSchema,
  mergedMainCommit: gitShaSchema,
  contractSha256: sha256Schema,
  executorSha256: sha256Schema,
  manifestSha256: sha256Schema,
  vectorCount: z.literal(38),
}).strict();
const manifestSchema = z.object({
  schema: z.literal("cl.dah.cli-management-phase-a-artifact-manifest.v1"),
  schemaVersion: z.literal(1),
  sourceAuthority: z.literal("containing_git_commit"),
  contractFile: z.literal("contract.json"),
  contractSha256: sha256Schema,
  contractBytes: z.number().int().positive(),
  executorFile: z.literal("executor.mjs"),
  executorSha256: sha256Schema,
  executorBytes: z.number().int().positive(),
  vectorCount: z.literal(38),
}).strict();

export type I321ManagementPhaseAOperationRequest =
  | { operation: "version_readback"; component: "auth_hub" | "services_web" }
  | { operation: "fresh_login" }
  | { operation: "displayed_consent" }
  | { operation: "api_management_family_separation" }
  | { operation: "organizations_list"; eligibility: "active_management" }
  | { operation: "organizations_read"; organizationId: string }
  | { operation: "cross_organization_denial" }
  | { operation: "direct_origin_denial" }
  | { operation: "changed_binding_denial" }
  | { operation: "replay_denial" }
  | { operation: "expired_denial" }
  | { operation: "legacy_route_410" }
  | { operation: "unsupported_protocol_426" };

export interface I321ManagementPhaseAPort {
  execute(request: I321ManagementPhaseAOperationRequest): Promise<unknown>;
  cleanup(): Promise<unknown>;
}

export interface I321ManagementPhaseAResult {
  organization: { organizationId: string; displayName: string; revision: number };
  authorizedOrganizationRead: Record<string, unknown>;
  readiness: { observedAt: string; [key: string]: unknown };
  communityAuthority: Record<string, unknown>;
}

export interface ExecuteI321ManagementPhaseAInput {
  plan: unknown;
  port: I321ManagementPhaseAPort;
  now?: () => number;
  randomUuid?: () => string;
}

interface OwnerExecutorModule {
  I321_CLI_MANAGEMENT_PHASE_A_CONTRACT_SHA256: string;
  I321CliManagementPhaseARefusal: new (...args: never[]) => Error;
  executeI321CliManagementPhaseAV1(input: ExecuteI321ManagementPhaseAInput): Promise<I321ManagementPhaseAResult>;
}

function refusal(): never {
  throw new DrwnError("STAGING_COMMUNITY_QUALIFICATION_INVALID", "Staging Community qualification refused.");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function loadAuthority(): { contract: unknown; executorUrl: string; contractSha256: string } {
  try {
    const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const authorityRoot = join(packageRoot, "registry", "contracts", "cli-management-phase-a.v1");
    const lock = lockSchema.parse(JSON.parse(readFileSync(join(packageRoot, "cli", "generated", "dah-cli-management-phase-a-lock.json"), "utf8")));
    const contractBytes = readFileSync(join(authorityRoot, "contract.json"));
    const executorBytes = readFileSync(join(authorityRoot, "executor.mjs"));
    const manifestBytes = readFileSync(join(authorityRoot, "manifest.json"));
    if (
      sha256(contractBytes) !== lock.contractSha256 ||
      sha256(executorBytes) !== lock.executorSha256 ||
      sha256(manifestBytes) !== lock.manifestSha256
    ) refusal();
    const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    if (
      manifest.contractSha256 !== lock.contractSha256 ||
      manifest.executorSha256 !== lock.executorSha256 ||
      manifest.contractBytes !== contractBytes.byteLength ||
      manifest.executorBytes !== executorBytes.byteLength ||
      manifest.vectorCount !== lock.vectorCount
    ) refusal();
    return {
      contract: JSON.parse(contractBytes.toString("utf8")),
      executorUrl: pathToFileURL(join(authorityRoot, "executor.mjs")).href,
      contractSha256: lock.contractSha256,
    };
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

const authority = loadAuthority();
export const i321ManagementPhaseAContract = Object.freeze(authority.contract);
let ownerModulePromise: Promise<OwnerExecutorModule> | undefined;

async function ownerModule(): Promise<OwnerExecutorModule> {
  try {
    const module = await (ownerModulePromise ??= import(authority.executorUrl) as Promise<OwnerExecutorModule>);
    if (
      Object.keys(module).sort().join("\0") !== [
        "I321CliManagementPhaseARefusal",
        "I321_CLI_MANAGEMENT_PHASE_A_CONTRACT_SHA256",
        "executeI321CliManagementPhaseAV1",
      ].sort().join("\0") ||
      module.I321_CLI_MANAGEMENT_PHASE_A_CONTRACT_SHA256 !== authority.contractSha256 ||
      typeof module.executeI321CliManagementPhaseAV1 !== "function"
    ) refusal();
    return module;
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

export async function executeI321ManagementPhaseA(
  input: ExecuteI321ManagementPhaseAInput,
): Promise<I321ManagementPhaseAResult> {
  try {
    const executor = await ownerModule();
    return await executor.executeI321CliManagementPhaseAV1({
      ...input,
      randomUuid: input.randomUuid ?? (() => crypto.randomUUID()),
    });
  } catch {
    refusal();
  }
}
