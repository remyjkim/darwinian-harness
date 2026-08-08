// ABOUTME: Tests per-OS keychain backend argv/stdin and platform selection for the secret store.
// ABOUTME: Includes real round-trips on macOS security, Windows DPAPI, and Linux secret-tool when available.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import * as processModule from "../cli/core/process";
import {
  DpapiBackend,
  CredentialIntegrityError,
  FileKeychainBackend,
  MacKeychainBackend,
  SecretToolBackend,
  defaultBackend,
} from "../cli/core/secret-store";
import { deriveCredentialScope } from "../cli/core/auth/credential-scope";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

function mockRunProcess(result: { exitCode: number; stdout?: string; stderr?: string }) {
  return spyOn(processModule, "runProcess").mockResolvedValue({
    exitCode: result.exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  });
}

describe("keychain backend selection", () => {
  test("selects the file backend when the test env var is set", async () => {
    const scope = await deriveCredentialScope("/tmp/credentials.json", { platform: "linux" });
    expect(defaultBackend(scope)).toBeInstanceOf(FileKeychainBackend);
  });

  test("selects the platform backend when no test env var is set", async () => {
    const saved = process.env.DRWN_TEST_KEYCHAIN_DIR;
    delete process.env.DRWN_TEST_KEYCHAIN_DIR;
    try {
      expect(defaultBackend(await deriveCredentialScope("/tmp/credentials.json", { platform: "darwin" })))
        .toBeInstanceOf(MacKeychainBackend);
      expect(defaultBackend(await deriveCredentialScope("C:\\tmp\\credentials.json", {
        cwd: "C:\\",
        platform: "win32",
        realpath: async () => "C:\\",
      }))).toBeInstanceOf(DpapiBackend);
      expect(defaultBackend(await deriveCredentialScope("/tmp/credentials.json", { platform: "linux" })))
        .toBeInstanceOf(SecretToolBackend);
    } finally {
      if (saved !== undefined) process.env.DRWN_TEST_KEYCHAIN_DIR = saved;
    }
  });

  test("derives scope-distinct identities for every platform backend", async () => {
    const saved = process.env.DRWN_TEST_KEYCHAIN_DIR;
    delete process.env.DRWN_TEST_KEYCHAIN_DIR;
    try {
      const first = await deriveCredentialScope("/tmp/first/credentials.json", { platform: "linux" });
      const second = await deriveCredentialScope("/tmp/second/credentials.json", { platform: "linux" });
      const firstMac = defaultBackend({ ...first, platform: "darwin" }) as MacKeychainBackend;
      const secondMac = defaultBackend({ ...second, platform: "darwin" }) as MacKeychainBackend;
      const firstLinux = defaultBackend(first) as SecretToolBackend;
      const secondLinux = defaultBackend(second) as SecretToolBackend;
      const firstWindows = defaultBackend({ ...first, platform: "win32" }) as DpapiBackend;
      const secondWindows = defaultBackend({ ...second, platform: "win32" }) as DpapiBackend;

      expect((firstMac as unknown as { account: string }).account).toBe(first.keyRef);
      expect((secondMac as unknown as { account: string }).account).toBe(second.keyRef);
      expect((firstLinux as unknown as { account: string }).account).toBe(first.keyRef);
      expect((secondLinux as unknown as { account: string }).account).toBe(second.keyRef);
      expect((firstLinux as unknown as { label: string }).label).not.toBe(
        (secondLinux as unknown as { label: string }).label,
      );
      expect((firstWindows as unknown as { keyPath: string }).keyPath).not.toBe(
        (secondWindows as unknown as { keyPath: string }).keyPath,
      );
    } finally {
      if (saved !== undefined) process.env.DRWN_TEST_KEYCHAIN_DIR = saved;
    }
  });

  test("places the Windows DPAPI key beside the canonical credential file", async () => {
    const saved = process.env.DRWN_TEST_KEYCHAIN_DIR;
    delete process.env.DRWN_TEST_KEYCHAIN_DIR;
    try {
      const scope = await deriveCredentialScope("C:\\Users\\Example\\.drwn\\credentials.json", {
        cwd: "C:\\Users\\Example",
        platform: "win32",
        realpath: async (path) => {
          if (path.toLowerCase() === "c:\\users\\example") return "C:\\Users\\Example";
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
      });
      const backend = defaultBackend(scope) as DpapiBackend;

      expect((backend as unknown as { keyPath: string }).keyPath).toBe(
        win32.join(win32.dirname(scope.credentialsPath), `.drwn-credentials-v2-${scope.scopeDigest}.key`),
      );
    } finally {
      if (saved !== undefined) process.env.DRWN_TEST_KEYCHAIN_DIR = saved;
    }
  });
});

describe("macOS security backend argv", () => {
  test("storeKey passes the key via -w to security add-generic-password", async () => {
    const spy = mockRunProcess({ exitCode: 0 });
    try {
      await new MacKeychainBackend("acct", "svc").storeKey(Buffer.from("key-bytes"));
      expect(spy.mock.calls[0]?.[0]).toEqual([
        "security", "add-generic-password", "-U", "-a", "acct", "-s", "svc", "-w", Buffer.from("key-bytes").toString("base64"),
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  test("loadKey returns null when security reports not-found", async () => {
    const spy = mockRunProcess({ exitCode: 44 });
    try {
      expect(await new MacKeychainBackend("acct").loadKey()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("loadKey fails closed on a non-absence security result without retaining stderr", async () => {
    const spy = mockRunProcess({ exitCode: 1, stderr: "SENTINEL_MAC_LOOKUP_239" });
    try {
      await expect(new MacKeychainBackend("acct").loadKey()).rejects.toBeInstanceOf(CredentialIntegrityError);
      try {
        await new MacKeychainBackend("acct").loadKey();
      } catch (error) {
        expect(JSON.stringify(error)).not.toContain("SENTINEL_MAC_LOOKUP_239");
      }
    } finally {
      spy.mockRestore();
    }
  });

  test("deleteKey fails closed on an unconfirmed security result without retaining stderr", async () => {
    const spy = mockRunProcess({ exitCode: 1, stderr: "SENTINEL_MAC_DELETE_239" });
    try {
      let failure: unknown;
      try {
        await new MacKeychainBackend("acct", "svc").deleteKey();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain("CREDENTIAL_DELETE_FAILED");
      expect(JSON.stringify(failure)).not.toContain("SENTINEL_MAC_DELETE_239");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("linux secret-tool backend", () => {
  test("storeKey passes the key over stdin, not argv", async () => {
    const spy = mockRunProcess({ exitCode: 0 });
    try {
      await new SecretToolBackend("acct", "label", "svc").storeKey(Buffer.from("key-bytes"));
      const [argv, options] = spy.mock.calls[0] ?? [];
      expect(argv).toEqual(["secret-tool", "store", "--label=label", "service", "svc", "account", "acct"]);
      expect((options as { stdin?: string }).stdin).toBe(Buffer.from("key-bytes").toString("base64"));
    } finally {
      spy.mockRestore();
    }
  });

  test("loadKey returns null only for a confirmed empty secret-tool lookup", async () => {
    const spy = mockRunProcess({ exitCode: 1 });
    try {
      expect(await new SecretToolBackend("acct", "label").loadKey()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("loadKey fails closed when secret-tool is unavailable or reports a lookup error", async () => {
    for (const result of [
      { exitCode: 127, stderr: "not found on PATH" },
      { exitCode: 1, stderr: "SENTINEL_LINUX_LOOKUP_239" },
    ]) {
      const spy = mockRunProcess(result);
      try {
        await expect(new SecretToolBackend("acct", "label").loadKey()).rejects.toBeInstanceOf(CredentialIntegrityError);
        try {
          await new SecretToolBackend("acct", "label").loadKey();
        } catch (error) {
          expect(JSON.stringify(error)).not.toContain(result.stderr);
        }
      } finally {
        spy.mockRestore();
      }
    }
  });

  test("deleteKey fails closed on an unconfirmed secret-tool result without retaining stderr", async () => {
    const spy = mockRunProcess({ exitCode: 1, stderr: "SENTINEL_LINUX_DELETE_239" });
    try {
      let failure: unknown;
      try {
        await new SecretToolBackend("acct", "label", "svc").deleteKey();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain("CREDENTIAL_DELETE_FAILED");
      expect(JSON.stringify(failure)).not.toContain("SENTINEL_LINUX_DELETE_239");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("real macOS keychain round-trip", () => {
  test.skipIf(process.platform !== "darwin" || process.env.DRWN_RUN_REAL_KEYCHAIN_TESTS !== "1")(
    "stores, loads, and deletes a key via the real security CLI when explicitly enabled",
    async () => {
      const backend = new MacKeychainBackend("drwn-test-key", `drwn-test-${randomBytes(6).toString("hex")}`);
      const key = randomBytes(32);
      try {
        await backend.storeKey(key);
        const loaded = await backend.loadKey();
        expect(loaded?.equals(key)).toBe(true);
      } finally {
        await backend.deleteKey();
      }
      expect(await backend.loadKey()).toBeNull();
    },
  );
});

describe("real Windows DPAPI backend", () => {
  test("fails closed when an existing protected key cannot be unprotected", async () => {
    const dir = mkdtempSync(join(tmpdir(), "drwn-dpapi-failure-"));
    const savedPath = process.env.PATH;
    const keyPath = join(dir, "credentials.json.key");
    writeFileSync(join(dir, "pwsh"), "fixture");
    writeFileSync(keyPath, "protected-key");
    process.env.PATH = dir;
    const spy = mockRunProcess({ exitCode: 1, stderr: "SENTINEL_DPAPI_LOOKUP_239" });
    try {
      await expect(new DpapiBackend(keyPath).loadKey()).rejects.toBeInstanceOf(CredentialIntegrityError);
      try {
        await new DpapiBackend(keyPath).loadKey();
      } catch (error) {
        expect(JSON.stringify(error)).not.toContain("SENTINEL_DPAPI_LOOKUP_239");
      }
    } finally {
      spy.mockRestore();
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.skipIf(process.platform !== "win32" || process.env.DRWN_RUN_REAL_KEYCHAIN_TESTS !== "1")(
    "stores, loads, and deletes a key via real DPAPI when explicitly enabled",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "drwn-dpapi-"));
      try {
        const backend = new DpapiBackend(join(dir, "credentials.json.key"));
        const key = randomBytes(32);
        await backend.storeKey(key);
        expect((await backend.loadKey())?.equals(key)).toBe(true);
        await backend.deleteKey();
        expect(await backend.loadKey()).toBeNull();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe("real Linux secret-tool backend", () => {
  test.skipIf(process.env.DRWN_RUN_REAL_KEYCHAIN_TESTS !== "1")(
    "stores, loads, and deletes a key via the Secret Service when explicitly enabled and available",
    async () => {
      const backend = new SecretToolBackend(
        "drwn-test-key",
        "drwn test credentials key",
        `drwn-test-${randomBytes(6).toString("hex")}`,
      );
      // Runtime skip: no secret-tool / D-Bus session in this environment (macOS, headless CI).
      if (!(await backend.isAvailable())) {
        return;
      }
      const key = randomBytes(32);
      try {
        await backend.storeKey(key);
        expect((await backend.loadKey())?.equals(key)).toBe(true);
      } finally {
        await backend.deleteKey();
      }
      expect(await backend.loadKey()).toBeNull();
    },
  );
});
