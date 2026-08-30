// ABOUTME: Orchestrates one hidden D52 ceremony around the exact owner executor and projector.
// ABOUTME: Keeps the grant and notice process-local, then commits only the two public files.

import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { runDeviceFlow, type RunDeviceFlowInput } from "../auth/device-flow";
import { DrwnError } from "../errors";
import {
  cleanupStagingDeviceApprovalNotice,
  preflightStagingDeviceApprovalNoticePath,
  publishStagingDeviceApprovalNotice,
  stagingCommunityContract,
} from "./staging-community-qualification";
import {
  executeI321PhaseAQualification,
  type ExecuteI321PhaseAQualificationInput,
  type I321PhaseAPublicProjection,
} from "./phase-a-qualification";
import { parseI321PhaseAAdapterOrigin } from "./phase-a-port-client";
import {
  preflightI321PhaseAPublicReceiptPaths,
  writeI321PhaseAPublicReceipts,
  type PreflightI321PhaseAPublicReceiptPathsInput,
  type WriteI321PhaseAPublicReceiptsInput,
} from "./phase-a-output";
import {
  loadStaging1QualificationIdentity,
  staging1QualificationCliProfile,
} from "./staging1-qualification-identity";

const planSchema = z.object({
  schema: z.literal("cl.dah.cli-management-phase-a-plan.v1"),
  environmentId: z.literal("staging-1"),
  sourceCommitSha: z.string().regex(/^[0-9a-f]{40}$/),
  qualificationRunId: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  ),
  contractSha256: z.literal("c7c66461c9dfc37069691f36826e1ac9e20d59412745a81941cff9de42d5a601"),
  providerPolicyVersion: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  relayUrl: z.string().regex(/^wss:\/\/[A-Za-z0-9.-]+(?::[1-9][0-9]{0,4})?$/),
  httpsBase: z.string().regex(/^https:\/\/[A-Za-z0-9.-]+(?::[1-9][0-9]{0,4})?$/),
  workflow: z.object({
    repository: z.literal("curation-labs/darwinian-services"),
    runId: z.number().int().positive().safe(),
    runAttempt: z.number().int().positive().safe(),
  }).strict(),
}).strict().superRefine((value, context) => {
  try {
    const relay = new URL(value.relayUrl);
    const https = new URL(value.httpsBase);
    if (
      relay.origin !== value.relayUrl ||
      https.origin !== value.httpsBase ||
      relay.host !== https.host
    ) throw new Error("origin mismatch");
  } catch {
    context.addIssue({ code: "custom", path: ["httpsBase"], message: "origin mismatch" });
  }
});

export type I321PhaseAPlan = z.infer<typeof planSchema>;

export interface ExecuteI321PhaseACeremonyInput {
  planPath: string;
  approvalNoticePath: string;
  adapterOrigin: string;
  readinessOutputPath: string;
  communityOutputPath: string;
  runnerTemp: string;
}

type DeviceCredential = {
  accessToken: string;
  issuedAt: string;
  expiresAt: string;
};

export interface I321PhaseACeremonyDependencies {
  fetcher?: typeof fetch;
  now?: () => number;
  requestId?: () => string;
  receiptId?: () => string;
  preflightOutputs?: (
    input: PreflightI321PhaseAPublicReceiptPathsInput,
  ) => Promise<void>;
  preflightApprovalNotice?: (
    path: string,
    options: { runnerTemp: string },
  ) => Promise<void>;
  readPlan?: (
    path: string,
    options: { runnerTemp: string },
  ) => Promise<I321PhaseAPlan>;
  loadQualificationIdentity?: () => unknown;
  runDeviceFlow?: (input: RunDeviceFlowInput) => Promise<DeviceCredential>;
  publishApprovalNotice?: (
    path: string,
    candidate: unknown,
    options: { runnerTemp: string; qualificationRunId: string; now: number },
  ) => Promise<unknown>;
  cleanupApprovalNotice?: (
    identity: unknown,
    options: { runnerTemp: string },
  ) => Promise<void>;
  executeQualification?: (
    input: ExecuteI321PhaseAQualificationInput,
  ) => Promise<I321PhaseAPublicProjection>;
  writeOutputs?: (input: WriteI321PhaseAPublicReceiptsInput) => Promise<void>;
}

function refusal(): never {
  throw new DrwnError(
    "STAGING_COMMUNITY_QUALIFICATION_INVALID",
    "Staging Community qualification refused.",
  );
}

function ownerMatches(uid: number): boolean {
  return typeof process.getuid !== "function" || uid === process.getuid();
}

export async function readI321PhaseAPlan(
  path: string,
  options: { runnerTemp: string },
): Promise<I321PhaseAPlan> {
  try {
    if (
      !isAbsolute(path) ||
      !isAbsolute(options.runnerTemp) ||
      basename(path) !== "i321-cli-management-phase-a-plan.json"
    ) refusal();
    const runnerRoot = await realpath(options.runnerTemp);
    if (runnerRoot !== resolve(options.runnerTemp)) refusal();
    const runnerMetadata = await lstat(runnerRoot);
    if (
      !runnerMetadata.isDirectory() ||
      runnerMetadata.isSymbolicLink() ||
      (runnerMetadata.mode & 0o777) !== 0o700 ||
      !ownerMatches(runnerMetadata.uid)
    ) refusal();
    const resolvedPath = resolve(path);
    const child = relative(runnerRoot, resolvedPath);
    if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
      refusal();
    }
    const parent = dirname(resolvedPath);
    if (await realpath(parent) !== resolve(parent)) refusal();
    const parentMetadata = await lstat(parent);
    if (
      !parentMetadata.isDirectory() ||
      parentMetadata.isSymbolicLink() ||
      (parentMetadata.mode & 0o777) !== 0o700 ||
      !ownerMatches(parentMetadata.uid) ||
      await realpath(path) !== resolvedPath
    ) refusal();
    const before = await lstat(path);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      (before.mode & 0o777) !== 0o600 ||
      !ownerMatches(before.uid) ||
      before.size < 2 ||
      before.size > 65_536
    ) refusal();
    const bytes = await readFile(path);
    const after = await lstat(path);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.byteLength !== after.size
    ) refusal();
    return planSchema.parse(JSON.parse(bytes.toString("utf8")));
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

export async function executeI321PhaseACeremony(
  input: ExecuteI321PhaseACeremonyInput,
  dependencies: I321PhaseACeremonyDependencies = {},
): Promise<void> {
  try {
    const now = dependencies.now ?? Date.now;
    const rolePaths = [
      input.planPath,
      input.approvalNoticePath,
      input.readinessOutputPath,
      input.communityOutputPath,
    ].map((rolePath) => resolve(rolePath));
    if (new Set(rolePaths).size !== rolePaths.length) refusal();
    parseI321PhaseAAdapterOrigin(input.adapterOrigin);
    await (dependencies.preflightOutputs ?? preflightI321PhaseAPublicReceiptPaths)({
      runnerTemp: input.runnerTemp,
      readinessPath: input.readinessOutputPath,
      communityPath: input.communityOutputPath,
    });
    await (dependencies.preflightApprovalNotice ??
      preflightStagingDeviceApprovalNoticePath)(input.approvalNoticePath, {
        runnerTemp: input.runnerTemp,
      });
    const admittedPlan = planSchema.parse(
      await (dependencies.readPlan ?? readI321PhaseAPlan)(input.planPath, {
        runnerTemp: input.runnerTemp,
      }),
    );
    const profile = staging1QualificationCliProfile(
      (dependencies.loadQualificationIdentity ?? loadStaging1QualificationIdentity)(),
    );
    let noticeIdentity: unknown;
    let credential: DeviceCredential | undefined;
    let flowFailed = false;
    try {
      credential = await (dependencies.runDeviceFlow ?? runDeviceFlow)({
        profile,
        fetcher: dependencies.fetcher ?? fetch,
        now,
        onUserAction: async ({ verification_uri_complete, expires_at }) => {
          noticeIdentity = await (dependencies.publishApprovalNotice ??
            publishStagingDeviceApprovalNotice)(
              input.approvalNoticePath,
              {
                schema: stagingCommunityContract.deviceApproval.noticeSchema,
                qualificationRunId: admittedPlan.qualificationRunId,
                verificationUriComplete: verification_uri_complete,
                expiresAt: expires_at,
              },
              {
                runnerTemp: input.runnerTemp,
                qualificationRunId: admittedPlan.qualificationRunId,
                now: now(),
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
        await (dependencies.cleanupApprovalNotice ??
          (cleanupStagingDeviceApprovalNotice as unknown as NonNullable<
            I321PhaseACeremonyDependencies["cleanupApprovalNotice"]
          >))(noticeIdentity, { runnerTemp: input.runnerTemp });
      } catch {
        cleanupFailed = true;
      }
    }
    if (flowFailed || cleanupFailed || credential === undefined || noticeIdentity === undefined) {
      refusal();
    }

    const projection = await (dependencies.executeQualification ??
      executeI321PhaseAQualification)({
        plan: admittedPlan,
        adapterOrigin: input.adapterOrigin,
        credential,
        fetcher: dependencies.fetcher,
        now,
        requestId: dependencies.requestId,
        receiptId: dependencies.receiptId,
      });
    await (dependencies.writeOutputs ?? writeI321PhaseAPublicReceipts)({
      runnerTemp: input.runnerTemp,
      readinessPath: input.readinessOutputPath,
      communityPath: input.communityOutputPath,
      readinessBytes: projection.readinessBytes,
      communityBytes: projection.communityBytes,
    });
  } catch (error) {
    if (error instanceof DrwnError && error.code === "STAGING_COMMUNITY_QUALIFICATION_INVALID") {
      throw error;
    }
    refusal();
  }
}
