// ABOUTME: Implements the exact Worker side of the I321 D52 composite loopback port.
// ABOUTME: Keeps ceremony observations local and sends only twelve requests plus normal cleanup.

import { DRWN_VERSION } from "../version";
import { DrwnError } from "../errors";
import type {
  I321ManagementPhaseAOperationRequest,
  I321ManagementPhaseAPort,
} from "./phase-a";
import { loadI321PhaseAPortWireAuthority } from "./phase-a-port-wire";

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const bearerPattern = /^[\x21-\x2B\x2D-\x7E]+$/;

export interface CreateI321PhaseACompositePortInput {
  adapterOrigin: string;
  accessToken: string;
  issuedAt: string;
  expiresAt: string;
  qualificationRunId: string;
  fetcher?: typeof fetch;
  requestId?: () => string;
}

function refusal(): never {
  throw new DrwnError(
    "STAGING_COMMUNITY_QUALIFICATION_INVALID",
    "Staging Community qualification refused.",
  );
}

export function parseI321PhaseAAdapterOrigin(candidate: string): string {
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "http:" ||
      parsed.hostname !== "127.0.0.1" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port === "" ||
      !/^[1-9][0-9]{0,4}$/.test(parsed.port) ||
      Number(parsed.port) > 65_535 ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.origin !== candidate
    ) refusal();
    return parsed.origin;
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

function requestHeaderByteLength(input: {
  authorization: string;
  qualificationRunId: string;
}): number {
  const pairs = [
    ["accept", "application/json"],
    ["authorization", input.authorization],
    ["content-type", "application/json"],
    ["x-drwn-protocol", "deployed-worker.v1"],
    ["x-drwn-version", DRWN_VERSION],
    ["x-i321-qualification-run-id", input.qualificationRunId],
    ["x-request-id", "00000000-0000-4000-8000-000000000000"],
  ];
  return pairs.reduce(
    (total, [name, value]) => total + Buffer.byteLength(`${name}: ${value}\r\n`, "utf8"),
    0,
  );
}

async function readResponseBody(response: Response, maximumBytes: number): Promise<unknown> {
  try {
    if (
      response.status !== 200 ||
      response.headers.get("content-type")?.trim().toLowerCase() !== "application/json" ||
      response.headers.get("content-encoding") !== null ||
      response.body === null
    ) refusal();
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > maximumBytes)
    ) refusal();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      byteLength += part.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        refusal();
      }
      chunks.push(part.value);
    }
    if (declared !== null && Number(declared) !== byteLength) refusal();
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (value === null || typeof value !== "object" || Array.isArray(value)) refusal();
    return value;
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

export async function createI321PhaseACompositePort(
  input: CreateI321PhaseACompositePortInput,
): Promise<I321ManagementPhaseAPort> {
  try {
    const origin = parseI321PhaseAAdapterOrigin(input.adapterOrigin);
    if (
      !uuidV4Pattern.test(input.qualificationRunId) ||
      !bearerPattern.test(input.accessToken) ||
      Buffer.byteLength(`Bearer ${input.accessToken}`, "utf8") > 16_384 ||
      requestHeaderByteLength({
        authorization: `Bearer ${input.accessToken}`,
        qualificationRunId: input.qualificationRunId,
      }) > 16_384
    ) refusal();
    const authority = await loadI321PhaseAPortWireAuthority();
    const projector = authority.projector;
    const fetcher = input.fetcher ?? fetch;
    const nextRequestId = input.requestId ?? (() => crypto.randomUUID());
    const usedRequestIds = new Set<string>();

    const remote = async (
      path: string,
      request: Record<string, unknown>,
      timeoutMs: number,
      parseResponse: (value: unknown) => Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      const requestId = nextRequestId();
      if (!uuidV4Pattern.test(requestId) || usedRequestIds.has(requestId)) refusal();
      usedRequestIds.add(requestId);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(new URL(path, origin), {
          method: "POST",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${input.accessToken}`,
            "content-type": "application/json",
            "x-drwn-protocol": "deployed-worker.v1",
            "x-drwn-version": DRWN_VERSION,
            "x-i321-qualification-run-id": input.qualificationRunId,
            "x-request-id": requestId,
          },
          body: JSON.stringify(request),
        });
        return parseResponse(await readResponseBody(
          response,
          projector.I321_PHASE_A_PORT_MAX_RESPONSE_BYTES_V1,
        ));
      } catch (error) {
        if (error instanceof DrwnError) throw error;
        refusal();
      } finally {
        clearTimeout(timer);
      }
    };

    let cleanupPromise: Promise<Record<string, unknown>> | undefined;
    return Object.freeze({
      async execute(request: I321ManagementPhaseAOperationRequest): Promise<unknown> {
        if (request.operation === "fresh_login") {
          return Object.freeze({
            operation: "fresh_login",
            outcome: "passed",
            issuedAt: input.issuedAt,
            expiresAt: input.expiresAt,
            storedCredentialUsed: false,
          });
        }
        if (request.operation === "displayed_consent") {
          return Object.freeze({
            operation: "displayed_consent",
            outcome: "passed",
            consentDisplayed: true,
            consentApproved: true,
          });
        }
        const admitted = projector.parseI321PhaseAPortExecuteRequestV1(request);
        const response = await remote(
          projector.I321_PHASE_A_PORT_EXECUTE_PATH_V1,
          admitted,
          projector.I321_PHASE_A_PORT_EXECUTE_TIMEOUT_MS_V1,
          projector.parseI321PhaseAPortExecuteResponseV1,
        );
        if (
          response.operation !== admitted.operation ||
          (admitted.operation === "version_readback" &&
            response.component !== admitted.component)
        ) refusal();
        return response;
      },
      async cleanup(): Promise<unknown> {
        return await (cleanupPromise ??= remote(
          projector.I321_PHASE_A_PORT_CLEANUP_PATH_V1,
          projector.parseI321PhaseAPortCleanupRequestV1({
            schema: "cl.dah.cli-management-phase-a-port-cleanup-request.v1",
            cleanupMode: "normal",
          }),
          projector.I321_PHASE_A_PORT_CLEANUP_TIMEOUT_MS_V1,
          projector.parseI321PhaseAPortCleanupResponseV1,
        ));
      },
    });
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}
