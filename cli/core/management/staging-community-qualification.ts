// ABOUTME: Admits the exact I321 staging Community contract and builds its public self-digested receipt.
// ABOUTME: Derives Community only from one authorized organization read while dropping all private evidence.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { link, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { DrwnError } from "../errors";
import { runDeviceFlow, type RunDeviceFlowInput } from "../auth/device-flow";
import { drwnCliProfile } from "../auth/profile";
import { DRWN_VERSION } from "../version";
import { validateManagementHeaders } from "./contracts";
import { resolveManagementRoute } from "./routes";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const uuidV4Schema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const contractIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const observedAtSchema = z.iso.datetime();
const relayOriginSchema = z.string().regex(/^wss:\/\/[A-Za-z0-9.-]+(?::[1-9][0-9]{0,4})?$/);
const httpsOriginSchema = z.string().regex(/^https:\/\/[A-Za-z0-9.-]+(?::[1-9][0-9]{0,4})?$/);

const receiptPlanSchema = z.object({
  schema: z.literal("cl.dah.staging-slot-community.v1"),
  environmentId: z.literal("staging-1"),
  sourceCommitSha: commitSchema,
  qualificationRunId: uuidV4Schema,
  cliReadinessReceiptSha256: sha256Schema,
  providerPolicyVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  relayUrl: relayOriginSchema,
  httpsBase: httpsOriginSchema,
  observedAt: observedAtSchema,
}).strict().superRefine((value, context) => {
  try {
    if (new URL(value.relayUrl).host !== new URL(value.httpsBase).host) throw new Error("origin mismatch");
  } catch {
    context.addIssue({ code: "custom", path: ["httpsBase"], message: "origin mismatch" });
  }
});

const privatePlanSchema = z.object({
  schema: z.literal("cl.drwn.staging-slot-community-plan.v1"),
  organizationId: contractIdSchema,
  receipt: receiptPlanSchema,
}).strict();

const organizationSchema = z.object({
  organizationId: contractIdSchema,
  displayName: z.string().min(1).max(256),
  revision: z.number().int().positive().safe(),
}).strict();

const responseBodySchema = z.object({
  requestId: uuidV4Schema,
  organization: organizationSchema,
}).strict();

const publicReceiptSchema = receiptPlanSchema.extend({
  organizationReadDigestSha256: sha256Schema,
  communityId: contractIdSchema,
  receiptDigestSha256: sha256Schema,
}).strict();

const headerPairSchema = z.tuple([z.string(), z.string()]);
const responseSchema = z.object({
  routeKey: z.string(),
  status: z.number().int(),
  headerPairs: z.array(headerPairSchema),
  body: z.record(z.string(), z.unknown()),
}).strict();

const responseOverrideSchema = responseSchema.partial().strict();
const vectorSchema = z.object({
  name: z.string().min(1),
  response: responseSchema.optional(),
  responseOverride: responseOverrideSchema.optional(),
  expected: z.enum(["receipt", "refuse_no_output"]),
  expectedReceipt: z.record(z.string(), z.unknown()).optional(),
}).strict();

const artifactSchema = z.object({
  schema: z.literal("cl.dah.staging-slot-community-interoperability.v1"),
  schemaVersion: z.literal(1),
  authority: z.object({
    routeKey: z.literal("organizations.read"),
    successStatus: z.literal(200),
    communityHeader: z.literal("x-dah-buzz-community-id"),
    organizationReadDigestHeader: z.literal("x-dah-organization-read-sha256"),
    canonicalization: z.literal("canonical-json/v1"),
    authorizedReadDigestSchema: z.literal("cl.dah.authorized-organization-read-digest.v1"),
    receiptDigestSchema: z.literal("cl.dah.staging-slot-community-digest.v1"),
    publicReceiptSchema: z.literal("cl.dah.staging-slot-community.v1"),
  }).strict(),
  ceremony: z.object({
    invocation: z.literal("hidden_internal_qualification_only"),
    authentication: z.literal("device_flow_process_local"),
    currentRunPlan: z.literal("mode_0600_same_run_file"),
    output: z.literal("caller_supplied_mode_0600_create_only_file"),
    stdout: z.literal("no_receipt_or_authority_material"),
    stderr: z.literal("fixed_codes_only_no_auth_or_identity_material"),
    ordinaryJsonOutput: z.literal("unchanged_header_free"),
    cloudContext: z.literal("organization_selection_only_no_authority_headers_or_receipt"),
    logs: z.literal("no_auth_headers_body_or_receipt"),
    forbiddenInputs: z.tuple([
      z.literal("operator_community_id"), z.literal("operator_relay_url"),
      z.literal("operator_https_base"), z.literal("operator_provider_policy"),
    ]),
  }).strict(),
  baseResponse: responseSchema,
  currentRunPlan: receiptPlanSchema,
  vectors: z.array(vectorSchema).length(14),
}).strict();

const lockSchema = z.object({
  schema: z.literal("dah.staging-slot-community-contract-lock"),
  schemaVersion: z.literal(1),
  servicesRepository: z.literal("curation-labs/darwinian-services"),
  sourceCommit: z.literal("29267384aee6a73d5bc4330e2ac81413e0cf15fb"),
  mergedMainCommit: z.literal("864c2434c441878f4542dcfbd42a21439ba970f8"),
  sha256: z.literal("89e7ad1410a28445678a812f1ec5e4a9e7cbb51e38c320ccdbc728843c7ea387"),
  vectorCount: z.literal(14),
  positiveVectorCount: z.literal(1),
  hostileVectorCount: z.literal(13),
}).strict();

export type StagingCommunityPrivatePlan = z.infer<typeof privatePlanSchema>;
export type QualificationOrganizationReadResponse = z.infer<typeof responseSchema>;
export type StagingCommunityReceipt = z.infer<typeof publicReceiptSchema>;

export interface ExecuteStagingCommunityQualificationInput {
  planPath: string;
  outputPath: string;
  onUserAction: RunDeviceFlowInput["onUserAction"];
}

export interface StagingCommunityQualificationDependencies {
  fetcher?: typeof fetch;
  runDeviceFlow?: typeof runDeviceFlow;
  requestId?: () => string;
  readPlan?: typeof readStagingCommunityPrivatePlan;
  writeReceipt?: typeof writeStagingCommunityReceipt;
}

function refusal(): never {
  throw new DrwnError("STAGING_COMMUNITY_QUALIFICATION_INVALID", "Staging Community qualification refused.");
}

function canonicalJson(value: unknown): string {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  refusal();
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function loadContract() {
  try {
    const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const contractBytes = readFileSync(join(packageRoot, "registry", "contracts", "staging-slot-community.v1", "contract.json"));
    const lock = lockSchema.parse(JSON.parse(readFileSync(join(packageRoot, "cli", "generated", "dah-staging-slot-community-contract-lock.json"), "utf8")));
    if (createHash("sha256").update(contractBytes).digest("hex") !== lock.sha256) refusal();
    const contract = artifactSchema.parse(JSON.parse(contractBytes.toString("utf8")));
    if (
      contract.vectors.filter(({ expected }) => expected === "receipt").length !== lock.positiveVectorCount ||
      contract.vectors.filter(({ expected }) => expected === "refuse_no_output").length !== lock.hostileVectorCount
    ) refusal();
    return deepFreeze(contract);
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

export const stagingCommunityContract = loadContract();

function privateFileError(code: "STAGING_COMMUNITY_PLAN_INVALID" | "STAGING_COMMUNITY_OUTPUT_INVALID"): DrwnError {
  return new DrwnError(code, code === "STAGING_COMMUNITY_PLAN_INVALID"
    ? "The staging qualification plan is invalid."
    : "The staging qualification output path is invalid.");
}

function ownerMatches(uid: number): boolean {
  return typeof process.getuid !== "function" || uid === process.getuid();
}

export async function readStagingCommunityPrivatePlan(path: string): Promise<Readonly<StagingCommunityPrivatePlan>> {
  try {
    if (!isAbsolute(path) || await realpath(path) !== resolve(path)) throw new Error("unsafe path");
    const before = await lstat(path);
    if (
      !before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
      (before.mode & 0o777) !== 0o600 || !ownerMatches(before.uid) ||
      before.size < 2 || before.size > 65_536
    ) throw new Error("unsafe metadata");
    const bytes = await readFile(path);
    const after = await lstat(path);
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs || bytes.byteLength !== after.size
    ) throw new Error("changed plan");
    return deepFreeze(privatePlanSchema.parse(JSON.parse(bytes.toString("utf8"))));
  } catch {
    throw privateFileError("STAGING_COMMUNITY_PLAN_INVALID");
  }
}

export async function writeStagingCommunityReceipt(path: string, candidate: unknown): Promise<void> {
  let temporaryPath: string | undefined;
  try {
    if (!isAbsolute(path) || basename(path) !== "i321-staging-slot-community.json") throw new Error("unsafe name");
    const parent = dirname(path);
    if (await realpath(parent) !== resolve(parent)) throw new Error("unsafe parent");
    const parentMetadata = await lstat(parent);
    if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() || !ownerMatches(parentMetadata.uid)) {
      throw new Error("unsafe parent metadata");
    }
    try {
      await lstat(path);
      throw new Error("output exists");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    const receipt = publicReceiptSchema.parse(candidate);
    const bytes = Buffer.from(`${canonicalJson(receipt)}\n`, "utf8");
    temporaryPath = join(parent, `.i321-staging-slot-community.${crypto.randomUUID()}.tmp`);
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const temporaryMetadata = await lstat(temporaryPath);
    if (
      !temporaryMetadata.isFile() || temporaryMetadata.isSymbolicLink() || temporaryMetadata.nlink !== 1 ||
      (temporaryMetadata.mode & 0o777) !== 0o600 || temporaryMetadata.size !== bytes.byteLength ||
      !ownerMatches(temporaryMetadata.uid)
    ) throw new Error("unsafe temporary output");
    await link(temporaryPath, path);
    await unlink(temporaryPath).catch(() => undefined);
    temporaryPath = undefined;
  } catch {
    if (temporaryPath !== undefined) await unlink(temporaryPath).catch(() => undefined);
    throw privateFileError("STAGING_COMMUNITY_OUTPUT_INVALID");
  }
}

function oneAuthorityHeader(pairs: ReadonlyArray<readonly [string, string]>, expectedName: string): string {
  const values = pairs.filter(([name]) => name.toLowerCase() === expectedName).map(([, value]) => value);
  if (values.length !== 1 || values[0]!.length === 0 || values[0]!.includes(",")) refusal();
  return values[0]!;
}

export function buildStagingCommunityReceipt(
  planCandidate: unknown,
  responseCandidate: unknown,
): Readonly<StagingCommunityReceipt> {
  try {
    const plan = privatePlanSchema.parse(planCandidate);
    const response = responseSchema.parse(responseCandidate);
    if (response.routeKey !== stagingCommunityContract.authority.routeKey || response.status !== 200) refusal();
    for (const [name] of response.headerPairs) {
      const normalized = name.toLowerCase();
      if (normalized.startsWith("x-dah-") && ![
        stagingCommunityContract.authority.communityHeader,
        stagingCommunityContract.authority.organizationReadDigestHeader,
      ].includes(normalized as never)) refusal();
    }
    const body = responseBodySchema.parse(response.body);
    if (body.organization.organizationId !== plan.organizationId) refusal();
    const communityId = contractIdSchema.parse(oneAuthorityHeader(
      response.headerPairs,
      stagingCommunityContract.authority.communityHeader,
    ));
    const evidenceDigestSha256 = sha256Schema.parse(oneAuthorityHeader(
      response.headerPairs,
      stagingCommunityContract.authority.organizationReadDigestHeader,
    ));
    const evidence = {
      schema: "cl.dah.authorized-organization-read.v1",
      requestId: body.requestId,
      organization: body.organization,
      communityId,
    };
    const expectedReadDigest = digest({
      schema: stagingCommunityContract.authority.authorizedReadDigestSchema,
      evidence,
    });
    if (evidenceDigestSha256 !== expectedReadDigest) refusal();
    const receipt = {
      ...plan.receipt,
      organizationReadDigestSha256: evidenceDigestSha256,
      communityId,
    };
    return deepFreeze(publicReceiptSchema.parse({
      ...receipt,
      receiptDigestSha256: digest({
        schema: stagingCommunityContract.authority.receiptDigestSchema,
        receipt,
      }),
    }));
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

async function readBoundedQualificationBody(response: Response): Promise<JsonObject> {
  try {
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") refusal();
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > 65_536)) refusal();
    if (!response.body) refusal();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65_536) {
        await reader.cancel().catch(() => undefined);
        refusal();
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) refusal();
    return value as JsonObject;
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

export async function executeStagingCommunityQualification(
  input: ExecuteStagingCommunityQualificationInput,
  dependencies: StagingCommunityQualificationDependencies = {},
): Promise<void> {
  try {
    const plan = await (dependencies.readPlan ?? readStagingCommunityPrivatePlan)(input.planPath);
    const profile = drwnCliProfile({ DRWN_CLOUD_PROFILE: "staging" });
    const credential = await (dependencies.runDeviceFlow ?? runDeviceFlow)({
      profile,
      fetcher: dependencies.fetcher ?? fetch,
      onUserAction: input.onUserAction,
    });
    const requestId = (dependencies.requestId ?? crypto.randomUUID)();
    const requiredHeaders = validateManagementHeaders({
      Authorization: `Bearer ${credential.accessToken}`,
      "X-Drwn-Protocol": "deployed-worker.v1",
      "X-Drwn-Version": DRWN_VERSION,
      "X-Request-Id": requestId,
    });
    const route = resolveManagementRoute("organizations.read", { organizationId: plan.organizationId });
    const response = await (dependencies.fetcher ?? fetch)(new URL(route.path, profile.apiOrigin), {
      method: route.method,
      headers: { ...requiredHeaders, accept: "application/json" },
      redirect: "manual",
    });
    const body = await readBoundedQualificationBody(response);
    if (body.requestId !== requestId) refusal();
    const receipt = buildStagingCommunityReceipt(plan, {
      routeKey: "organizations.read",
      status: response.status,
      headerPairs: [...response.headers.entries()],
      body,
    });
    await (dependencies.writeReceipt ?? writeStagingCommunityReceipt)(input.outputPath, receipt);
  } catch (error) {
    if (error instanceof DrwnError && error.code === "STAGING_COMMUNITY_QUALIFICATION_INVALID") throw error;
    refusal();
  }
}
