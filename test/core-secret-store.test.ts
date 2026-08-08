// ABOUTME: Tests the AES-256-GCM secret store envelope and keychain-gated persistence.
// ABOUTME: Uses an injected in-memory backend so no real OS keychain is touched.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clear,
  CredentialIntegrityError,
  CredentialSchemaUnsupportedError,
  CredentialScopeMismatchError,
  decryptFromDisk,
  encryptToDisk,
  NoKeychainError,
  type KeychainBackend,
} from "../cli/core/secret-store";
import { deriveCredentialScope } from "../cli/core/auth/credential-scope";

class FakeKeychainBackend implements KeychainBackend {
  key: Buffer | null = null;
  available = true;
  failDelete = false;
  loadCalls = 0;
  async isAvailable(): Promise<boolean> {
    return this.available;
  }
  async loadKey(): Promise<Buffer | null> {
    this.loadCalls += 1;
    return this.key;
  }
  async storeKey(key: Buffer): Promise<void> {
    this.key = key;
  }
  async deleteKey(): Promise<void> {
    if (this.failDelete) throw new Error("SENTINEL_KEY_DELETE_FAILURE_239");
    this.key = null;
  }
}

let root: string;
let path: string;
let backend: FakeKeychainBackend;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "secret-store-"));
  path = join(root, "credentials.json");
  backend = new FakeKeychainBackend();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("secret store", () => {
  test("should round-trip a secret through encrypt and decrypt", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    expect(await decryptFromDisk(path, backend)).toBe("super-secret-token");
  });

  test("should write an envelope with no plaintext on disk", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    const raw = readFileSync(path, "utf8");
    expect(raw).not.toContain("super-secret-token");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "algo",
      "ciphertext",
      "keyRef",
      "nonce",
      "scopeDigest",
      "tag",
      "v",
    ]);
    expect(parsed.v).toBe(2);
    expect(parsed.algo).toBe("aes-256-gcm");
    expect(String(parsed.keyRef)).toMatch(/^drwn-credentials-v2:[0-9a-f]{64}$/);
    expect(String(parsed.scopeDigest)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(parsed.ciphertext).length).toBeGreaterThan(0);
    expect(Buffer.from(String(parsed.nonce), "base64")).toHaveLength(12);
    expect(Buffer.from(String(parsed.tag), "base64")).toHaveLength(16);
  });

  test("should throw NoKeychainError when no keychain is available", async () => {
    backend.available = false;
    await expect(encryptToDisk(path, "x", backend)).rejects.toBeInstanceOf(NoKeychainError);
  });

  test("should throw CredentialIntegrityError when the ciphertext is tampered", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    const envelope = JSON.parse(readFileSync(path, "utf8")) as { ciphertext: string };
    const bytes = Buffer.from(envelope.ciphertext, "base64");
    bytes[0] = bytes[0]! ^ 0xff;
    writeFileSync(path, JSON.stringify({ ...envelope, ciphertext: bytes.toString("base64") }));
    await expect(decryptFromDisk(path, backend)).rejects.toBeInstanceOf(CredentialIntegrityError);
  });

  test("should fail integrity when an envelope exists but its key is gone", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    backend.key = null;
    await expect(decryptFromDisk(path, backend)).rejects.toBeInstanceOf(CredentialIntegrityError);
  });

  test("should return null when the credentials file is missing", async () => {
    expect(await decryptFromDisk(path, backend)).toBeNull();
  });

  test("clear should remove both the file and the key", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    await clear(path, backend);
    expect(existsSync(path)).toBe(false);
    expect(backend.key).toBeNull();
  });

  test("clear surfaces partial deletion when the file is gone but scoped key deletion fails", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    const retainedKey = backend.key;
    backend.failDelete = true;

    await expect(clear(path, backend)).rejects.toThrow("SENTINEL_KEY_DELETE_FAILURE_239");

    expect(existsSync(path)).toBe(false);
    expect(backend.key).toEqual(retainedKey);
  });

  test("rejects malformed JSON and v1 envelopes with the stable unsupported-schema error", async () => {
    writeFileSync(path, "not-json\n");
    await expect(decryptFromDisk(path, backend)).rejects.toBeInstanceOf(CredentialSchemaUnsupportedError);

    writeFileSync(path, JSON.stringify({
      v: 1,
      algo: "aes-256-gcm",
      keyRef: "drwn-credentials",
      nonce: Buffer.alloc(12).toString("base64"),
      ciphertext: Buffer.from("ciphertext").toString("base64"),
      tag: Buffer.alloc(16).toString("base64"),
    }));
    await expect(decryptFromDisk(path, backend)).rejects.toBeInstanceOf(CredentialSchemaUnsupportedError);
  });

  test("rejects a wrong scope or key identity before backend lookup", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    const envelope = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    backend.loadCalls = 0;
    writeFileSync(path, JSON.stringify({ ...envelope, scopeDigest: "0".repeat(64) }));
    await expect(decryptFromDisk(path, backend)).rejects.toBeInstanceOf(CredentialScopeMismatchError);
    expect(backend.loadCalls).toBe(0);

    writeFileSync(path, JSON.stringify({ ...envelope, keyRef: `drwn-credentials-v2:${"f".repeat(64)}` }));
    await expect(decryptFromDisk(path, backend)).rejects.toBeInstanceOf(CredentialScopeMismatchError);
    expect(backend.loadCalls).toBe(0);
  });

  test("rejects non-canonical base64 and incorrect nonce/tag sizes as unsupported schema", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    const envelope = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    for (const mutation of [
      { nonce: "***" },
      { nonce: Buffer.alloc(11).toString("base64") },
      { tag: Buffer.alloc(15).toString("base64") },
      { unexpected: true },
    ]) {
      writeFileSync(path, JSON.stringify({ ...envelope, ...mutation }));
      await expect(decryptFromDisk(path, backend)).rejects.toBeInstanceOf(CredentialSchemaUnsupportedError);
    }
  });

  test("default test backends isolate two credential homes across write, read, and clear", async () => {
    const previous = process.env.DRWN_TEST_KEYCHAIN_DIR;
    process.env.DRWN_TEST_KEYCHAIN_DIR = join(root, "keys");
    const first = join(root, "first", "credentials.json");
    const second = join(root, "second", "credentials.json");
    try {
      await encryptToDisk(first, "first-secret");
      await encryptToDisk(second, "second-secret");
      expect(await decryptFromDisk(first)).toBe("first-secret");
      expect(await decryptFromDisk(second)).toBe("second-secret");

      await encryptToDisk(first, "first-secret-replaced");
      expect(await decryptFromDisk(first)).toBe("first-secret-replaced");
      expect(await decryptFromDisk(second)).toBe("second-secret");

      await clear(first);
      expect(existsSync(first)).toBe(false);
      expect(await decryptFromDisk(second)).toBe("second-secret");
      await clear(first);
      expect(await decryptFromDisk(second)).toBe("second-secret");

      const secondScope = await deriveCredentialScope(second);
      unlinkSync(join(root, "keys", `${secondScope.scopeDigest}.key`));
      await expect(decryptFromDisk(second)).rejects.toBeInstanceOf(CredentialIntegrityError);
      const secondEnvelope = readFileSync(second, "utf8");
      await clear(first);
      expect(readFileSync(second, "utf8")).toBe(secondEnvelope);
    } finally {
      if (previous === undefined) delete process.env.DRWN_TEST_KEYCHAIN_DIR;
      else process.env.DRWN_TEST_KEYCHAIN_DIR = previous;
    }
  });
});
