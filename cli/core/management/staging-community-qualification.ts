// ABOUTME: Admits the exact I321 staging approval-notice contract and process-local handoff.
// ABOUTME: Retains the open-handle cleanup lease while the D52 companion owns public receipts.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { link, lstat, open, realpath, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { DrwnError } from "../errors";
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

const organizationSchema = z.object({
  organizationId: contractIdSchema,
  displayName: z.string().min(1).max(256),
  revision: z.number().int().positive().safe(),
}).strict();

const responseBodySchema = z.object({
  requestId: uuidV4Schema,
  organization: organizationSchema,
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
    qualificationIdentityContractSha256: z.literal("1dbde33ab10d12f31ee9581984cb37c88a9363da2af1518402e62546f582b0b6"),
    authorizedOrigin: z.literal("https://auth-staging-1.darwinian.dev"),
    approvalPath: z.literal("/device"),
    maximumVerificationUriBytes: z.literal(2_048),
    maximumLifetimeSeconds: z.literal(3_600),
    validationTime: z.literal("2026-08-27T17:05:00.000Z"),
    vectors: z.array(deviceApprovalVectorSchema).length(28),
  }).strict(),
  vectors: z.array(vectorSchema).length(14),
}).strict();

const lockSchema = z.object({
  schema: z.literal("dah.staging-slot-community-contract-lock"),
  schemaVersion: z.literal(1),
  servicesRepository: z.literal("curation-labs/darwinian-services"),
  sourceCommit: z.literal("d0156761c19f4e7dc5a63914a1117f298b535c37"),
  sha256: z.literal("40755caf06cc7c61bf302768eb20e8f41254d47868ee3515f4beee5af2afa8c7"),
  vectorCount: z.literal(14),
  positiveVectorCount: z.literal(1),
  hostileVectorCount: z.literal(13),
  deviceApprovalVectorCount: z.literal(28),
  deviceApprovalPositiveVectorCount: z.literal(1),
  deviceApprovalHostileVectorCount: z.literal(27),
}).strict();

export type StagingDeviceApprovalNotice = z.infer<
  typeof stagingDeviceApprovalNoticeSchema
>;

export interface StagingDeviceApprovalNoticeFileIdentity {
  path: string;
  handle: FileHandle;
  dev: bigint;
  ino: bigint;
  byteLength: number;
  sha256: string;
  closed: boolean;
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

function ownerMatches(uid: number | bigint): boolean {
  return typeof process.getuid !== "function" || BigInt(uid) === BigInt(process.getuid());
}

async function assertApprovalNoticePath(path: string, runnerTemp: string): Promise<{ path: string; parent: string }> {
  if (!isAbsolute(path) || !isAbsolute(runnerTemp)) throw approvalNoticeFileError();
  const canonicalRunner = await realpath(runnerTemp);
  if (canonicalRunner !== resolve(runnerTemp)) throw approvalNoticeFileError();
  const runnerMetadata = await lstat(canonicalRunner);
  if (
    !runnerMetadata.isDirectory() || runnerMetadata.isSymbolicLink() ||
    (runnerMetadata.mode & 0o777) !== 0o700 || !ownerMatches(runnerMetadata.uid)
  ) {
    throw approvalNoticeFileError();
  }
  const resolvedPath = resolve(path);
  const child = relative(canonicalRunner, resolvedPath);
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) throw approvalNoticeFileError();
  const parent = dirname(resolvedPath);
  if (await realpath(parent) !== resolve(parent)) throw approvalNoticeFileError();
  const parentMetadata = await lstat(parent);
  if (
    !parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() ||
    (parentMetadata.mode & 0o777) !== 0o700 || !ownerMatches(parentMetadata.uid)
  ) {
    throw approvalNoticeFileError();
  }
  return { path: resolvedPath, parent };
}

export async function preflightStagingDeviceApprovalNoticePath(
  path: string,
  options: { runnerTemp: string },
): Promise<void> {
  try {
    const safe = await assertApprovalNoticePath(path, options.runnerTemp);
    try {
      await lstat(safe.path);
      throw approvalNoticeFileError();
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof DrwnError && error.code === "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID") {
      throw error;
    }
    throw approvalNoticeFileError();
  }
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
