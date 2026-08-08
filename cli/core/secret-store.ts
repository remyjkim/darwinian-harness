// ABOUTME: Encrypts secrets at rest with AES-256-GCM under an OS-keychain-held key.
// ABOUTME: Refuses to persist without a keychain; an env-gated file backend exists only for tests.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { dirname, join, win32 } from "node:path";
import { deriveCredentialScope, type CredentialScopeV1 } from "./auth/credential-scope";
import { runProcess } from "./process";

const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class NoKeychainError extends Error {
  readonly code = "NO_KEYCHAIN";
  constructor(message = "No OS keychain is available to protect credentials. Set DRWN_TOKEN for headless environments.") {
    super(message);
    this.name = "NoKeychainError";
  }
}

export class CredentialIntegrityError extends Error {
  readonly code = "CREDENTIAL_INTEGRITY";
  constructor(message = "Stored credentials failed integrity verification (possible tampering or key mismatch).") {
    super(message);
    this.name = "CredentialIntegrityError";
  }
}

export class CredentialSchemaUnsupportedError extends Error {
  readonly code = "CREDENTIAL_SCHEMA_UNSUPPORTED";
  constructor(message = "Stored credentials use an unsupported schema. Run `drwn login` again.") {
    super(message);
    this.name = "CredentialSchemaUnsupportedError";
  }
}

export class CredentialScopeMismatchError extends Error {
  readonly code = "CREDENTIAL_SCOPE_MISMATCH";
  constructor(message = "Stored credentials belong to another credential scope. Run `drwn login` again.") {
    super(message);
    this.name = "CredentialScopeMismatchError";
  }
}

export interface KeychainBackend {
  isAvailable(): Promise<boolean>;
  loadKey(): Promise<Buffer | null>;
  storeKey(key: Buffer): Promise<void>;
  deleteKey(): Promise<void>;
}

export interface CredentialEnvelopeV2 {
  v: 2;
  algo: typeof ALGO;
  scopeDigest: string;
  keyRef: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

const ENVELOPE_KEYS = ["algo", "ciphertext", "keyRef", "nonce", "scopeDigest", "tag", "v"] as const;

function isCanonicalBase64(value: unknown, expectedBytes?: number): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) return false;
  return expectedBytes === undefined || bytes.length === expectedBytes;
}

function isEnvelope(value: unknown): value is CredentialEnvelopeV2 {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== [...ENVELOPE_KEYS].sort().join("\0")) return false;
  return (
    record.v === 2 &&
    record.algo === ALGO &&
    typeof record.scopeDigest === "string" &&
    /^[0-9a-f]{64}$/.test(record.scopeDigest) &&
    typeof record.keyRef === "string" &&
    /^drwn-credentials-v2:[0-9a-f]{64}$/.test(record.keyRef) &&
    isCanonicalBase64(record.nonce, NONCE_BYTES) &&
    isCanonicalBase64(record.ciphertext) &&
    isCanonicalBase64(record.tag, TAG_BYTES)
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function isExecutableOnPath(command: string): boolean {
  const isWindows = process.platform === "win32";
  const exts = isWindows ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(isWindows ? ";" : ":")) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(join(dir, `${command}${ext}`))) return true;
    }
  }
  return false;
}

async function restrictFile(path: string): Promise<void> {
  if (process.platform === "win32") {
    await runProcess(["icacls", path, "/inheritance:r"]);
    const user = process.env.USERNAME;
    if (user) {
      await runProcess(["icacls", path, "/grant:r", `${user}:F`]);
    }
    return;
  }
  await fs.chmod(path, 0o600);
}

async function writeRestricted(path: string, content: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.secret.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await fs.writeFile(tmp, content, { mode: 0o600 });
    await fs.rename(tmp, path);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
  await restrictFile(path);
}

export async function encryptToDisk(path: string, plaintext: string, backend?: KeychainBackend): Promise<void> {
  const scope = await deriveCredentialScope(path);
  const keychain = backend ?? defaultBackend(scope);
  if (!(await keychain.isAvailable())) {
    throw new NoKeychainError();
  }
  let key = await keychain.loadKey();
  if (!key) {
    key = randomBytes(KEY_BYTES);
    await keychain.storeKey(key);
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: CredentialEnvelopeV2 = {
    v: 2,
    algo: ALGO,
    scopeDigest: scope.scopeDigest,
    keyRef: scope.keyRef,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
  await writeRestricted(scope.credentialsPath, `${JSON.stringify(envelope, null, 2)}\n`);
}

export async function decryptFromDisk(path: string, backend?: KeychainBackend): Promise<string | null> {
  const scope = await deriveCredentialScope(path);
  let raw: string;
  try {
    raw = await fs.readFile(scope.credentialsPath, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return null;
    throw error;
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new CredentialSchemaUnsupportedError();
  }
  if (!isEnvelope(envelope)) {
    throw new CredentialSchemaUnsupportedError();
  }
  if (envelope.scopeDigest !== scope.scopeDigest || envelope.keyRef !== scope.keyRef) {
    throw new CredentialScopeMismatchError();
  }
  const keychain = backend ?? defaultBackend(scope);
  const key = await keychain.loadKey();
  if (!key) {
    throw new CredentialIntegrityError("Stored credentials are present but their scoped key is unavailable.");
  }
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(envelope.nonce, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new CredentialIntegrityError();
  }
}

export async function clear(path: string, backend?: KeychainBackend): Promise<void> {
  const scope = await deriveCredentialScope(path);
  try {
    await fs.unlink(scope.credentialsPath);
  } catch (error) {
    if (!isErrorCode(error, "ENOENT")) throw error;
  }
  const keychain = backend ?? defaultBackend(scope);
  await keychain.deleteKey();
}

// --- Backends ---

/** Key persisted as an owner-only file. Production-safe only as a test/headless escape hatch. */
export class FileKeychainBackend implements KeychainBackend {
  constructor(private readonly keyPath: string) {}
  async isAvailable(): Promise<boolean> {
    return true;
  }
  async loadKey(): Promise<Buffer | null> {
    try {
      const text = (await fs.readFile(this.keyPath, "utf8")).trim();
      return text ? Buffer.from(text, "base64") : null;
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) return null;
      throw error;
    }
  }
  async storeKey(key: Buffer): Promise<void> {
    await writeRestricted(this.keyPath, key.toString("base64"));
  }
  async deleteKey(): Promise<void> {
    try {
      await fs.unlink(this.keyPath);
    } catch (error) {
      if (!isErrorCode(error, "ENOENT")) throw error;
    }
  }
}

/** macOS Keychain via the `security` CLI. */
export class MacKeychainBackend implements KeychainBackend {
  constructor(private readonly account: string, private readonly service = "drwn") {}
  async isAvailable(): Promise<boolean> {
    return isExecutableOnPath("security");
  }
  async loadKey(): Promise<Buffer | null> {
    const result = await runProcess(["security", "find-generic-password", "-a", this.account, "-s", this.service, "-w"]);
    if (result.exitCode !== 0) return null; // 44 == not found
    const value = result.stdout.trim();
    return value ? Buffer.from(value, "base64") : null;
  }
  async storeKey(key: Buffer): Promise<void> {
    const result = await runProcess([
      "security", "add-generic-password", "-U", "-a", this.account, "-s", this.service, "-w", key.toString("base64"),
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`security add-generic-password failed: ${result.stderr.trim()}`);
    }
  }
  async deleteKey(): Promise<void> {
    await runProcess(["security", "delete-generic-password", "-a", this.account, "-s", this.service]);
  }
}

/** Linux Secret Service via `secret-tool`. */
export class SecretToolBackend implements KeychainBackend {
  constructor(
    private readonly account: string,
    private readonly label: string,
    private readonly service = "drwn",
  ) {}
  async isAvailable(): Promise<boolean> {
    if (!isExecutableOnPath("secret-tool")) return false;
    return Boolean(process.env.DBUS_SESSION_BUS_ADDRESS);
  }
  async loadKey(): Promise<Buffer | null> {
    const result = await runProcess(["secret-tool", "lookup", "service", this.service, "account", this.account]);
    if (result.exitCode !== 0) return null;
    const value = result.stdout.trim();
    return value ? Buffer.from(value, "base64") : null;
  }
  async storeKey(key: Buffer): Promise<void> {
    const result = await runProcess(
      ["secret-tool", "store", `--label=${this.label}`, "service", this.service, "account", this.account],
      { stdin: key.toString("base64") },
    );
    if (result.exitCode !== 0) {
      throw new Error(`secret-tool store failed: ${result.stderr.trim()}`);
    }
  }
  async deleteKey(): Promise<void> {
    await runProcess(["secret-tool", "clear", "service", this.service, "account", this.account]);
  }
}

function powershellExe(): string | null {
  if (isExecutableOnPath("pwsh")) return "pwsh";
  if (isExecutableOnPath("powershell")) return "powershell";
  return null;
}

function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Windows DPAPI (CurrentUser) protecting a key stored in an ACL-restricted sibling file. */
export class DpapiBackend implements KeychainBackend {
  constructor(private readonly keyPath: string) {}
  async isAvailable(): Promise<boolean> {
    return powershellExe() !== null;
  }
  async loadKey(): Promise<Buffer | null> {
    if (!existsSync(this.keyPath)) return null;
    const exe = powershellExe();
    if (!exe) return null;
    const script =
      `$b=[IO.File]::ReadAllBytes(${psLiteral(this.keyPath)});` +
      `$u=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');` +
      `[Console]::Out.Write([Convert]::ToBase64String($u))`;
    const result = await runProcess([exe, "-NoProfile", "-NonInteractive", "-Command", script]);
    if (result.exitCode !== 0) return null;
    const value = result.stdout.trim();
    return value ? Buffer.from(value, "base64") : null;
  }
  async storeKey(key: Buffer): Promise<void> {
    const exe = powershellExe();
    if (!exe) throw new NoKeychainError();
    const script =
      `$k=[Convert]::FromBase64String(${psLiteral(key.toString("base64"))});` +
      `$p=[Security.Cryptography.ProtectedData]::Protect($k,$null,'CurrentUser');` +
      `[IO.File]::WriteAllBytes(${psLiteral(this.keyPath)},$p)`;
    const result = await runProcess([exe, "-NoProfile", "-NonInteractive", "-Command", script]);
    if (result.exitCode !== 0) {
      throw new Error(`DPAPI protect failed: ${result.stderr.trim()}`);
    }
    await restrictFile(this.keyPath);
  }
  async deleteKey(): Promise<void> {
    try {
      await fs.unlink(this.keyPath);
    } catch (error) {
      if (!isErrorCode(error, "ENOENT")) throw error;
    }
  }
}

class UnavailableBackend implements KeychainBackend {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async loadKey(): Promise<Buffer | null> {
    return null;
  }
  async storeKey(): Promise<void> {
    throw new NoKeychainError();
  }
  async deleteKey(): Promise<void> {}
}

export function defaultBackend(scope: CredentialScopeV1): KeychainBackend {
  const testDir = process.env.DRWN_TEST_KEYCHAIN_DIR;
  if (testDir) {
    return new FileKeychainBackend(join(testDir, `${scope.scopeDigest}.key`));
  }
  if (scope.platform === "darwin") return new MacKeychainBackend(scope.keyRef);
  if (scope.platform === "win32") {
    return new DpapiBackend(
      win32.join(
        win32.dirname(scope.credentialsPath),
        `.drwn-credentials-v2-${scope.scopeDigest}.key`,
      ),
    );
  }
  if (scope.platform === "linux") {
    return new SecretToolBackend(scope.keyRef, `drwn credentials key ${scope.scopeDigest.slice(0, 12)}`);
  }
  return new UnavailableBackend();
}
