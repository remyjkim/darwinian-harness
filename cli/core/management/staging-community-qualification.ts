// ABOUTME: Admits the exact I321 staging Community contract and builds its public self-digested receipt.
// ABOUTME: Derives Community only from one authorized organization read while dropping all private evidence.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { link, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { DrwnError } from "../errors";
import { runDeviceFlow } from "../auth/device-flow";
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

const stagingDeviceApprovalNoticeSchema = z.object({
  schema: z.string(),
  qualificationRunId: uuidV4Schema,
  verificationUriComplete: z.string().min(1),
  expiresAt: z.iso.datetime(),
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

const deviceApprovalVectorSchema = z.object({
  name: z.string().min(1),
  expected: z.enum(["notice", "refuse_no_output"]),
  candidate: z.record(z.string(), z.unknown()),
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
    approvalNotice: z.literal("create_only_mode_0600_runner_temp"),
    approvalHandoff: z.literal("live_private_github_actions_notice"),
    approvalHandoffFileCleanup: z.literal("erase_handoff_file_on_every_outcome"),
    approvalNoticeRetention: z.literal("private_run_log_normal_retention_inert_after_expiry"),
    approvalNoticePersistence: z.literal("never_artifact_cache_receipt_or_cloud_context"),
    forbiddenInputs: z.tuple([
      z.literal("operator_community_id"), z.literal("operator_relay_url"),
      z.literal("operator_https_base"), z.literal("operator_provider_policy"),
    ]),
  }).strict(),
  baseResponse: responseSchema,
  currentRunPlan: receiptPlanSchema,
  deviceApproval: z.object({
    schema: z.literal("cl.drwn.staging-device-approval-notice-contract.v1"),
    noticeSchema: z.literal("cl.drwn.staging-device-approval-notice.v1"),
    channel: z.literal("live_private_github_actions_notice"),
    fileBoundary: z.literal("create_only_mode_0600_runner_temp"),
    handoffFileCleanup: z.literal("erase_handoff_file_on_every_outcome"),
    actionsNoticeRetention: z.literal("private_run_log_normal_retention_inert_after_expiry"),
    forbiddenPersistence: z.literal("never_artifact_cache_receipt_or_cloud_context"),
    authorizedOrigin: z.literal("https://auth-staging-main.darwinian.dev"),
    approvalPath: z.literal("/device"),
    maximumVerificationUriBytes: z.literal(2_048),
    maximumLifetimeSeconds: z.literal(3_600),
    validationTime: z.literal("2026-08-27T17:05:00.000Z"),
    vectors: z.array(deviceApprovalVectorSchema).length(27),
  }).strict(),
  vectors: z.array(vectorSchema).length(14),
}).strict();

const lockSchema = z.object({
  schema: z.literal("dah.staging-slot-community-contract-lock"),
  schemaVersion: z.literal(1),
  servicesRepository: z.literal("curation-labs/darwinian-services"),
  sourceCommit: z.literal("df219967d0f11822f3f642602f59e372ad1e4d6a"),
  mergedMainCommit: z.literal("ed5a40c95947eb4def084bc88a5c4cac9805beb5"),
  sha256: z.literal("141f45e8e54e1c248558b6b41853e6f8fb4d0e9910e4d2ad5fab4069136ab83c"),
  vectorCount: z.literal(14),
  positiveVectorCount: z.literal(1),
  hostileVectorCount: z.literal(13),
  deviceApprovalVectorCount: z.literal(27),
  deviceApprovalPositiveVectorCount: z.literal(1),
  deviceApprovalHostileVectorCount: z.literal(26),
}).strict();

export type StagingCommunityPrivatePlan = z.infer<typeof privatePlanSchema>;
export type QualificationOrganizationReadResponse = z.infer<typeof responseSchema>;
export type StagingCommunityReceipt = z.infer<typeof publicReceiptSchema>;
export type StagingDeviceApprovalNotice = z.infer<typeof stagingDeviceApprovalNoticeSchema>;
export interface StagingDeviceApprovalNoticeFileIdentity {
  path: string;
  handle: FileHandle;
  dev: bigint;
  ino: bigint;
  byteLength: number;
  sha256: string;
  closed: boolean;
}

export interface ExecuteStagingCommunityQualificationInput {
  planPath: string;
  outputPath: string;
  approvalNoticePath: string;
  runnerTemp: string;
}

export interface StagingCommunityQualificationDependencies {
  fetcher?: typeof fetch;
  runDeviceFlow?: typeof runDeviceFlow;
  requestId?: () => string;
  now?: () => number;
  readPlan?: typeof readStagingCommunityPrivatePlan;
  writeReceipt?: typeof writeStagingCommunityReceipt;
  publishApprovalNotice?: typeof publishStagingDeviceApprovalNotice;
  cleanupApprovalNotice?: typeof cleanupStagingDeviceApprovalNotice;
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
      contract.vectors.filter(({ expected }) => expected === "refuse_no_output").length !== lock.hostileVectorCount ||
      contract.deviceApproval.vectors.length !== lock.deviceApprovalVectorCount ||
      contract.deviceApproval.vectors.filter(({ expected }) => expected === "notice").length !== lock.deviceApprovalPositiveVectorCount ||
      contract.deviceApproval.vectors.filter(({ expected }) => expected === "refuse_no_output").length !== lock.deviceApprovalHostileVectorCount
    ) refusal();
    return deepFreeze(contract);
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

export const stagingCommunityContract = loadContract();

function invalidApprovalNotice(): never {
  throw new DrwnError("STAGING_DEVICE_APPROVAL_NOTICE_INVALID", "Staging device approval notice refused.");
}

export function parseStagingDeviceApprovalNotice(
  candidate: unknown,
  expected: { qualificationRunId: string; now: number },
): Readonly<StagingDeviceApprovalNotice> {
  try {
    const notice = stagingDeviceApprovalNoticeSchema.parse(candidate);
    const contract = stagingCommunityContract.deviceApproval;
    if (
      notice.schema !== contract.noticeSchema ||
      notice.qualificationRunId !== uuidV4Schema.parse(expected.qualificationRunId) ||
      !Number.isFinite(expected.now) ||
      Buffer.byteLength(notice.verificationUriComplete, "utf8") > contract.maximumVerificationUriBytes
    ) invalidApprovalNotice();
    const verification = new URL(notice.verificationUriComplete);
    const query = [...verification.searchParams.entries()];
    if (
      verification.protocol !== "https:" ||
      verification.username !== "" || verification.password !== "" || verification.hash !== "" ||
      verification.origin !== contract.authorizedOrigin || verification.pathname !== contract.approvalPath ||
      verification.href !== notice.verificationUriComplete ||
      query.length !== 1 || query[0]![0] !== "user_code" || query[0]![1].length === 0 ||
      /[\u0000-\u001f\u007f]/u.test(query[0]![1])
    ) invalidApprovalNotice();
    const expiresAt = Date.parse(notice.expiresAt);
    if (
      !Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== notice.expiresAt ||
      expiresAt <= expected.now || expiresAt - expected.now > contract.maximumLifetimeSeconds * 1_000
    ) invalidApprovalNotice();
    return deepFreeze(notice);
  } catch (error) {
    if (error instanceof DrwnError && error.code === "STAGING_DEVICE_APPROVAL_NOTICE_INVALID") throw error;
    invalidApprovalNotice();
  }
}

function approvalNoticeFileError(): DrwnError {
  return new DrwnError("STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID", "Staging device approval notice file refused.");
}

async function assertApprovalNoticePath(path: string, runnerTemp: string): Promise<{ path: string; parent: string }> {
  if (!isAbsolute(path) || !isAbsolute(runnerTemp)) throw approvalNoticeFileError();
  const canonicalRunner = await realpath(runnerTemp);
  if (canonicalRunner !== resolve(runnerTemp)) throw approvalNoticeFileError();
  const runnerMetadata = await lstat(canonicalRunner);
  if (!runnerMetadata.isDirectory() || runnerMetadata.isSymbolicLink() || !ownerMatches(runnerMetadata.uid)) {
    throw approvalNoticeFileError();
  }
  const resolvedPath = resolve(path);
  const child = relative(canonicalRunner, resolvedPath);
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) throw approvalNoticeFileError();
  const parent = dirname(resolvedPath);
  if (await realpath(parent) !== resolve(parent)) throw approvalNoticeFileError();
  const parentMetadata = await lstat(parent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() || !ownerMatches(parentMetadata.uid)) {
    throw approvalNoticeFileError();
  }
  return { path: resolvedPath, parent };
}

export async function publishStagingDeviceApprovalNotice(
  path: string,
  candidate: unknown,
  options: { runnerTemp: string; qualificationRunId: string; now: number },
): Promise<Readonly<StagingDeviceApprovalNoticeFileIdentity>> {
  let temporaryPath: string | undefined;
  let temporaryIdentity: { dev: bigint; ino: bigint } | undefined;
  let finalPath: string | undefined;
  let handle: FileHandle | undefined;
  try {
    const notice = parseStagingDeviceApprovalNotice(candidate, options);
    const bytes = Buffer.from(`${canonicalJson(notice)}\n`, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const safe = await assertApprovalNoticePath(path, options.runnerTemp);
    finalPath = safe.path;
    try {
      await lstat(safe.path);
      throw approvalNoticeFileError();
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    temporaryPath = join(safe.parent, `.staging-device-approval.${crypto.randomUUID()}.tmp`);
    handle = await open(temporaryPath, "wx+", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      handle = undefined;
      throw error;
    }
    const temporaryMetadata = await handle.stat({ bigint: true });
    temporaryIdentity = { dev: temporaryMetadata.dev, ino: temporaryMetadata.ino };
    if (
      !temporaryMetadata.isFile() || temporaryMetadata.isSymbolicLink() || temporaryMetadata.nlink !== 1n ||
      (temporaryMetadata.mode & 0o777n) !== 0o600n || !ownerMatches(temporaryMetadata.uid) ||
      temporaryMetadata.size !== BigInt(bytes.byteLength)
    ) throw approvalNoticeFileError();
    await link(temporaryPath, safe.path);
    await unlink(temporaryPath);
    temporaryPath = undefined;
    const finalMetadata = await lstat(safe.path, { bigint: true });
    if (
      !finalMetadata.isFile() || finalMetadata.isSymbolicLink() || finalMetadata.nlink !== 1n ||
      (finalMetadata.mode & 0o777n) !== 0o600n || !ownerMatches(finalMetadata.uid) ||
      finalMetadata.dev !== temporaryIdentity.dev || finalMetadata.ino !== temporaryIdentity.ino
    ) throw approvalNoticeFileError();
    const lease: StagingDeviceApprovalNoticeFileIdentity = {
      path: safe.path,
      handle,
      dev: finalMetadata.dev,
      ino: finalMetadata.ino,
      byteLength: bytes.byteLength,
      sha256,
      closed: false,
    };
    handle = undefined;
    return Object.seal(lease);
  } catch {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    if (temporaryPath !== undefined) await unlink(temporaryPath).catch(() => undefined);
    if (finalPath !== undefined && temporaryIdentity !== undefined) {
      const current = await lstat(finalPath, { bigint: true }).catch(() => null);
      if (current?.dev === temporaryIdentity.dev && current.ino === temporaryIdentity.ino) {
        await unlink(finalPath).catch(() => undefined);
      }
    }
    throw approvalNoticeFileError();
  }
}

async function closeStagingDeviceApprovalNoticeLease(
  identity: StagingDeviceApprovalNoticeFileIdentity,
): Promise<void> {
  if (identity.closed) return;
  identity.closed = true;
  try {
    await identity.handle.close();
  } catch {
    throw approvalNoticeFileError();
  }
}

async function readStagingDeviceApprovalNoticeLeaseBytes(
  identity: Readonly<StagingDeviceApprovalNoticeFileIdentity>,
): Promise<Buffer> {
  const bytes = Buffer.alloc(identity.byteLength);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await identity.handle.read(bytes, offset, bytes.byteLength - offset, offset);
    if (result.bytesRead === 0) throw approvalNoticeFileError();
    offset += result.bytesRead;
  }
  return bytes;
}

export async function cleanupStagingDeviceApprovalNotice(
  identity: StagingDeviceApprovalNoticeFileIdentity,
  options: { runnerTemp: string },
): Promise<void> {
  try {
    const safe = await assertApprovalNoticePath(identity.path, options.runnerTemp);
    const current = await lstat(safe.path, { bigint: true }).catch((error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    });
    if (current === null) return;
    const held = await identity.handle.stat({ bigint: true });
    if (
      !current.isFile() || current.isSymbolicLink() || current.nlink !== 1n ||
      (current.mode & 0o777n) !== 0o600n || !ownerMatches(current.uid) ||
      held.dev !== identity.dev || held.ino !== identity.ino ||
      current.dev !== held.dev || current.ino !== held.ino ||
      current.size !== BigInt(identity.byteLength) || held.size !== BigInt(identity.byteLength)
    ) throw approvalNoticeFileError();
    const bytes = await readStagingDeviceApprovalNoticeLeaseBytes(identity);
    if (createHash("sha256").update(bytes).digest("hex") !== identity.sha256) throw approvalNoticeFileError();
    await unlink(safe.path);
    try {
      await lstat(safe.path);
      throw approvalNoticeFileError();
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
  } catch (error) {
    if (error instanceof DrwnError && error.code === "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID") throw error;
    throw approvalNoticeFileError();
  } finally {
    await closeStagingDeviceApprovalNoticeLease(identity);
  }
}

function privateFileError(code: "STAGING_COMMUNITY_PLAN_INVALID" | "STAGING_COMMUNITY_OUTPUT_INVALID"): DrwnError {
  return new DrwnError(code, code === "STAGING_COMMUNITY_PLAN_INVALID"
    ? "The staging qualification plan is invalid."
    : "The staging qualification output path is invalid.");
}

function ownerMatches(uid: number | bigint): boolean {
  return typeof process.getuid !== "function" || BigInt(uid) === BigInt(process.getuid());
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
    let noticeIdentity: Readonly<StagingDeviceApprovalNoticeFileIdentity> | undefined;
    let credential: Awaited<ReturnType<typeof runDeviceFlow>> | undefined;
    let flowFailed = false;
    try {
      credential = await (dependencies.runDeviceFlow ?? runDeviceFlow)({
        profile,
        fetcher: dependencies.fetcher ?? fetch,
        now: dependencies.now,
        onUserAction: async ({ verification_uri_complete, expires_at }) => {
          noticeIdentity = await (dependencies.publishApprovalNotice ?? publishStagingDeviceApprovalNotice)(
            input.approvalNoticePath,
            {
              schema: stagingCommunityContract.deviceApproval.noticeSchema,
              qualificationRunId: plan.receipt.qualificationRunId,
              verificationUriComplete: verification_uri_complete,
              expiresAt: expires_at,
            },
            {
              runnerTemp: input.runnerTemp,
              qualificationRunId: plan.receipt.qualificationRunId,
              now: (dependencies.now ?? Date.now)(),
            },
          );
        },
      });
    } catch {
      flowFailed = true;
    }
    let cleanupFailed = false;
    if (noticeIdentity !== undefined) {
      try {
        await (dependencies.cleanupApprovalNotice ?? cleanupStagingDeviceApprovalNotice)(noticeIdentity, {
          runnerTemp: input.runnerTemp,
        });
      } catch {
        cleanupFailed = true;
      }
    }
    if (flowFailed || cleanupFailed || credential === undefined || noticeIdentity === undefined) refusal();
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
