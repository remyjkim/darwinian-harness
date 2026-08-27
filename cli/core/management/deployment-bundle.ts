// ABOUTME: Builds and validates the deterministic two-entry D45 deployment USTAR bundle.
// ABOUTME: Keeps the store export raw, canonicalizes the manifest, and derives stable artifact identity.

import { createHash } from "node:crypto";
import { DrwnError } from "../errors";
import type { WorkerDeployPayload } from "../worker-deploy";
import { managementContract, type ManagementJsonObject, type ManagementJsonValue } from "./contracts";

const BLOCK_BYTES = 512;
const bodyContract = managementContract.rawBodyContracts.DeterministicWorkerDeployBundleV1;

export interface DeterministicDeploymentBundle {
  bytes: Uint8Array;
  manifest: ManagementJsonObject;
  byteLength: number;
  artifactSha256: string;
  artifactRef: string;
  requestId: string;
}

function invalidBundle(): never {
  throw new DrwnError("VALIDATION_FAILED", "The deployment bundle does not match the deterministic USTAR contract.");
}

function bundleTooLarge(): never {
  throw new DrwnError("DEPLOYMENT_ARTIFACT_TOO_LARGE", "The portable deployment artifact exceeds the supported limit.");
}

function canonicalize(value: ManagementJsonValue): ManagementJsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      canonicalize((value as ManagementJsonObject)[key]!),
    ]));
  }
  return value;
}

function canonicalJsonBytes(value: ManagementJsonObject): Buffer {
  return Buffer.from(JSON.stringify(canonicalize(value)), "utf8");
}

function writeAscii(target: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, "ascii");
  if (bytes.byteLength > length) invalidBundle();
  bytes.copy(target, offset);
}

function octalField(value: number, digits: number): string {
  const octal = value.toString(8);
  if (octal.length > digits) invalidBundle();
  return `${octal.padStart(digits, "0")}\0`;
}

function ustarHeader(path: string, size: number): Buffer {
  if (!/^[A-Za-z0-9._/-]+$/.test(path) || Buffer.byteLength(path) > 100) invalidBundle();
  const header = Buffer.alloc(BLOCK_BYTES);
  writeAscii(header, 0, 100, path);
  writeAscii(header, 100, 8, octalField(0o644, 7));
  writeAscii(header, 108, 8, octalField(0, 7));
  writeAscii(header, 116, 8, octalField(0, 7));
  writeAscii(header, 124, 12, octalField(size, 11));
  writeAscii(header, 136, 12, octalField(0, 11));
  header.fill(0x20, 148, 156);
  writeAscii(header, 156, 1, "0");
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  const checksum = [...header].reduce((total, byte) => total + byte, 0);
  writeAscii(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function entryBytes(path: string, bytes: Uint8Array): Buffer {
  const body = Buffer.from(bytes);
  const padding = (BLOCK_BYTES - (body.byteLength % BLOCK_BYTES)) % BLOCK_BYTES;
  return Buffer.concat([ustarHeader(path, body.byteLength), body, Buffer.alloc(padding)]);
}

function uuidV4FromSha256(sha256: string): string {
  const bytes = Buffer.from(sha256.slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function decodeStoreExport(payload: WorkerDeployPayload): Buffer {
  const encoded = payload.storeExport.bytesBase64;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength > managementContract.artifactStaging.maxStoreBytes) bundleTooLarge();
  if (
    bytes.byteLength < 1 ||
    bytes.toString("base64") !== encoded ||
    bytes.byteLength !== payload.storeExport.byteLength ||
    createHash("sha256").update(bytes).digest("hex") !== payload.storeExport.sha256
  ) invalidBundle();
  return bytes;
}

function buildManifest(payload: WorkerDeployPayload, storeBytes: Buffer): ManagementJsonObject {
  return {
    schema: bodyContract.manifestContract.schema,
    contractVersion: payload.contractVersion,
    materialization: payload.materialization,
    entrypoint: payload.entrypoint as unknown as ManagementJsonObject,
    lockfile: payload.lockfile as unknown as ManagementJsonObject,
    config: payload.config as unknown as ManagementJsonObject,
    governance: payload.governance as unknown as ManagementJsonValue,
    storeExport: {
      kind: bodyContract.manifestContract.storeExport.kind,
      compression: bodyContract.manifestContract.storeExport.compression,
      encoding: bodyContract.manifestContract.storeExport.encoding,
      entry: bodyContract.manifestContract.storeExport.entry,
      sha256: createHash("sha256").update(storeBytes).digest("hex"),
      byteLength: storeBytes.byteLength,
    },
  };
}

export function buildDeterministicDeploymentBundle(payload: WorkerDeployPayload): Readonly<DeterministicDeploymentBundle> {
  const storeBytes = decodeStoreExport(payload);
  const manifest = buildManifest(payload, storeBytes);
  const manifestBytes = canonicalJsonBytes(manifest);
  if (manifestBytes.byteLength < 1 || manifestBytes.byteLength > managementContract.artifactStaging.maxManifestBytes) {
    bundleTooLarge();
  }
  const bytes = Buffer.concat([
    entryBytes("manifest.json", manifestBytes),
    entryBytes("store.tar", storeBytes),
    Buffer.alloc(bodyContract.headerPolicy.terminalZeroBlocks * BLOCK_BYTES),
  ]);
  assertDeploymentBundleBytes(bytes);
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    manifest: canonicalize(manifest) as ManagementJsonObject,
    byteLength: bytes.byteLength,
    artifactSha256,
    artifactRef: `${managementContract.artifactStaging.artifactRefPrefix}${artifactSha256}`,
    requestId: uuidV4FromSha256(artifactSha256),
  });
}

function text(block: Buffer, offset: number, length: number): string {
  const field = block.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

function exactOctal(block: Buffer, offset: number, expected: string): number {
  if (block.subarray(offset, offset + expected.length).toString("ascii") !== expected) invalidBundle();
  return Number.parseInt(expected.slice(0, -1), 8);
}

function allZero(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0);
}

function parseEntry(bytes: Buffer, offset: number, expected: typeof bodyContract.entries[number]) {
  const header = bytes.subarray(offset, offset + BLOCK_BYTES);
  if (header.byteLength !== BLOCK_BYTES) invalidBundle();
  const checksumText = header.subarray(148, 156).toString("ascii");
  if (!/^[0-7]{6}\0 $/.test(checksumText)) invalidBundle();
  const checksumHeader = Buffer.from(header);
  checksumHeader.fill(0x20, 148, 156);
  const checksum = [...checksumHeader].reduce((total, byte) => total + byte, 0);
  if (Number.parseInt(checksumText.slice(0, 6), 8) !== checksum) invalidBundle();
  if (
    text(header, 0, 100) !== expected.path ||
    exactOctal(header, 100, "0000644\0") !== 0o644 ||
    exactOctal(header, 108, "0000000\0") !== 0 ||
    exactOctal(header, 116, "0000000\0") !== 0 ||
    exactOctal(header, 136, "00000000000\0") !== 0 ||
    header.subarray(156, 157).toString("ascii") !== "0" ||
    header.subarray(257, 263).toString("binary") !== "ustar\0" ||
    header.subarray(263, 265).toString("ascii") !== "00" ||
    text(header, 265, 32) !== "" || text(header, 297, 32) !== "" ||
    !allZero(header.subarray(157, 257)) || !allZero(header.subarray(329))
  ) invalidBundle();
  const sizeText = header.subarray(124, 136).toString("ascii");
  if (!/^[0-7]{11}\0$/.test(sizeText)) invalidBundle();
  const size = Number.parseInt(sizeText.slice(0, 11), 8);
  if (size < expected.minimumBytes || size > expected.maximumBytes) invalidBundle();
  const dataOffset = offset + BLOCK_BYTES;
  const data = bytes.subarray(dataOffset, dataOffset + size);
  if (data.byteLength !== size) invalidBundle();
  const padding = (BLOCK_BYTES - (size % BLOCK_BYTES)) % BLOCK_BYTES;
  if (!allZero(bytes.subarray(dataOffset + size, dataOffset + size + padding))) invalidBundle();
  return { bytes: data, nextOffset: dataOffset + size + padding };
}

function hasForbiddenManifestField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenManifestField);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).some((key) => bodyContract.manifestContract.forbiddenFields.includes(key as never)) ||
    Object.values(record).some(hasForbiddenManifestField);
}

export function assertDeploymentBundleBytes(candidate: Uint8Array): void {
  try {
    const bytes = Buffer.from(candidate);
    if (
      bytes.byteLength < managementContract.artifactStaging.minBundleBytes ||
      bytes.byteLength > managementContract.artifactStaging.maxBundleBytes
    ) invalidBundle();
    const manifestEntry = parseEntry(bytes, 0, bodyContract.entries[0]);
    const storeEntry = parseEntry(bytes, manifestEntry.nextOffset, bodyContract.entries[1]);
    const terminator = bytes.subarray(storeEntry.nextOffset);
    if (terminator.byteLength !== bodyContract.headerPolicy.terminalZeroBlocks * BLOCK_BYTES || !allZero(terminator)) {
      invalidBundle();
    }
    const manifestText = manifestEntry.bytes.toString("utf8");
    const manifest = JSON.parse(manifestText) as ManagementJsonObject;
    if (
      manifestText !== JSON.stringify(canonicalize(manifest)) ||
      JSON.stringify(Object.keys(manifest)) !== JSON.stringify(bodyContract.manifestContract.requiredTopLevelFields) ||
      manifest.schema !== bodyContract.manifestContract.schema ||
      manifest.contractVersion !== 1 ||
      manifest.materialization !== "lockfile-store-export" ||
      hasForbiddenManifestField(manifest)
    ) invalidBundle();
    const storeExport = manifest.storeExport as ManagementJsonObject;
    const expectedStoreExport: ManagementJsonObject = {
      byteLength: storeEntry.bytes.byteLength,
      compression: bodyContract.manifestContract.storeExport.compression,
      encoding: bodyContract.manifestContract.storeExport.encoding,
      entry: bodyContract.manifestContract.storeExport.entry,
      kind: bodyContract.manifestContract.storeExport.kind,
      sha256: createHash("sha256").update(storeEntry.bytes).digest("hex"),
    };
    if (JSON.stringify(storeExport) !== JSON.stringify(expectedStoreExport)) invalidBundle();
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    invalidBundle();
  }
}

export function assertDeploymentProviderOutcome(candidate: Readonly<ManagementJsonObject>): never {
  if (
    candidate.conditionalCreateResult === "precondition-failed" &&
    (candidate.validationEof === "not-observed" || candidate.validationEof === "indeterminate")
  ) {
    throw new DrwnError("TEMPORARILY_UNAVAILABLE", "Deployment artifact validation is not yet authoritative.");
  }
  throw new DrwnError("VALIDATION_FAILED", "The deployment artifact provider outcome is invalid.");
}

export function assertDeploymentBundleRequestIdentity(
  request: Readonly<ManagementJsonObject>,
  body: Uint8Array,
): void {
  assertDeploymentBundleBytes(body);
  if (
    request.byteLength !== body.byteLength ||
    request.artifactSha256 !== createHash("sha256").update(body).digest("hex")
  ) invalidBundle();
}

export function validateDeploymentBundleHeaders(
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> {
  const required = ["Content-Length", "Content-Type"];
  if (
    Object.keys(candidate).length !== required.length ||
    required.some((name) => !Object.hasOwn(candidate, name)) ||
    candidate["Content-Type"] !== bodyContract.mediaType ||
    typeof candidate["Content-Length"] !== "string" ||
    !/^[1-9][0-9]*$/.test(candidate["Content-Length"] as string)
  ) invalidBundle();
  const length = Number(candidate["Content-Length"]);
  if (
    !Number.isSafeInteger(length) ||
    length < bodyContract.contentLength.minimum ||
    length > bodyContract.contentLength.maximum
  ) invalidBundle();
  return Object.freeze({
    "Content-Length": String(candidate["Content-Length"]),
    "Content-Type": String(candidate["Content-Type"]),
  });
}

export function createDeploymentBundleBody(bundle: Readonly<DeterministicDeploymentBundle>): ReadableStream<Uint8Array> {
  const bytes = new Uint8Array(bundle.bytes);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
