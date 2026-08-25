// ABOUTME: Tests per-OS keychain backend argv/stdin and platform selection for the secret store.
// ABOUTME: Includes real round-trips on macOS security, Windows DPAPI, and Linux secret-tool when available.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, promises as fsPromises, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import * as processModule from "../cli/core/process";
import {
  DpapiBackend,
  CredentialIntegrityError,
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

async function captureFailure(operation: () => Promise<void>): Promise<unknown> {
  try {
    await operation();
    throw new Error("store unexpectedly succeeded");
  } catch (error) {
    return error;
  }
}

function expectRedactedStoreFailure(failure: unknown, sentinels: string[]): void {
  expect(failure).toBeInstanceOf(CredentialIntegrityError);
  expect(failure).toMatchObject({
    code: "CREDENTIAL_INTEGRITY",
    message: "Scoped key storage failed.",
  });
  expect((failure as Error & { cause?: unknown }).cause).toBeUndefined();
  const exposed = [
    String(failure),
    (failure as Error).message,
    JSON.stringify(failure),
    String((failure as Error & { cause?: unknown }).cause ?? ""),
  ].join("\n");
  for (const sentinel of sentinels) expect(exposed).not.toContain(sentinel);
}

describe("keychain backend selection", () => {
  test("production custody has no file-backend or environment escape", () => {
    const source = readFileSync(new URL("../cli/core/secret-store.ts", import.meta.url), "utf8");
    const bunfig = readFileSync(new URL("../bunfig.toml", import.meta.url), "utf8");
    const retiredBackend = ["File", "Keychain", "Backend"].join("");
    const retiredEnvironmentVariable = ["DRWN", "TEST", "KEYCHAIN", "DIR"].join("_");
    const retiredPreload = ["preload", "keychain"].join("-");

    expect(source).not.toContain(retiredBackend);
    expect(source).not.toContain(retiredEnvironmentVariable);
    expect(bunfig).not.toContain(retiredPreload);
    expect(bunfig).not.toMatch(/^\s*preload\s*=/m);
  });

  test("selects only the production backend for each supported platform", async () => {
    expect(defaultBackend(await deriveCredentialScope("/tmp/credentials.json", { platform: "darwin" })))
      .toBeInstanceOf(MacKeychainBackend);
    expect(defaultBackend(await deriveCredentialScope("C:\\tmp\\credentials.json", {
      cwd: "C:\\",
      platform: "win32",
      realpath: async () => "C:\\",
    }))).toBeInstanceOf(DpapiBackend);
    expect(defaultBackend(await deriveCredentialScope("/tmp/credentials.json", { platform: "linux" })))
      .toBeInstanceOf(SecretToolBackend);
  });

  test("derives scope-distinct identities for every platform backend", async () => {
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
  });

  test("places the Windows DPAPI key beside the canonical credential file", async () => {
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

  test("storeKey fails closed without retaining process, account, service, or key material", async () => {
    const stderr = "SENTINEL_MAC_STORE_STDERR_336";
    const account = "SENTINEL_MAC_STORE_ACCOUNT_336";
    const service = "SENTINEL_MAC_STORE_SERVICE_336";
    const keyText = "SENTINEL_MAC_STORE_KEY_336";
    const spy = mockRunProcess({ exitCode: 1, stderr });
    try {
      const failure = await captureFailure(
        () => new MacKeychainBackend(account, service).storeKey(Buffer.from(keyText)),
      );
      expectRedactedStoreFailure(failure, [stderr, account, service, keyText, Buffer.from(keyText).toString("base64")]);
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

  test("storeKey fails closed without retaining process, attribute, label, or key material", async () => {
    const stderr = "SENTINEL_LINUX_STORE_STDERR_336";
    const account = "SENTINEL_LINUX_STORE_ACCOUNT_336";
    const label = "SENTINEL_LINUX_STORE_LABEL_336";
    const service = "SENTINEL_LINUX_STORE_SERVICE_336";
    const keyText = "SENTINEL_LINUX_STORE_KEY_336";
    const spy = mockRunProcess({ exitCode: 1, stderr });
    try {
      const failure = await captureFailure(
        () => new SecretToolBackend(account, label, service).storeKey(Buffer.from(keyText)),
      );
      expectRedactedStoreFailure(
        failure,
        [stderr, account, label, service, keyText, Buffer.from(keyText).toString("base64")],
      );
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
  test("deleteKey sanitizes non-absence unlink failures and preserves missing-key no-op", async () => {
    const pathSentinel = "SENTINEL_DPAPI_DELETE_PATH_336";
    const errorSentinel = "SENTINEL_DPAPI_DELETE_ERROR_336";
    const unlinkFailure = Object.assign(new Error(`${errorSentinel}: ${pathSentinel}`), {
      code: "EACCES",
      path: pathSentinel,
    });
    const unlinkSpy = spyOn(fsPromises, "unlink").mockRejectedValue(unlinkFailure);
    try {
      const failure = await captureFailure(() => new DpapiBackend(pathSentinel).deleteKey());
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({ message: "CREDENTIAL_DELETE_FAILED" });
      expect((failure as Error & { cause?: unknown }).cause).toBeUndefined();
      const exposed = [
        String(failure),
        (failure as Error).message,
        JSON.stringify(failure),
        String((failure as Error & { cause?: unknown }).cause ?? ""),
      ].join("\n");
      expect(exposed).not.toContain(pathSentinel);
      expect(exposed).not.toContain(errorSentinel);

      unlinkSpy.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
      await expect(new DpapiBackend(pathSentinel).deleteKey()).resolves.toBeUndefined();
    } finally {
      unlinkSpy.mockRestore();
    }
  });

  test("storeKey fails closed without retaining process, path, or key material", async () => {
    const dir = mkdtempSync(join(tmpdir(), "drwn-dpapi-store-failure-"));
    const savedPath = process.env.PATH;
    const pathSentinel = "SENTINEL_DPAPI_STORE_PATH_336";
    const keyPath = join(dir, pathSentinel);
    const stderr = "SENTINEL_DPAPI_STORE_STDERR_336";
    const keyText = "SENTINEL_DPAPI_STORE_KEY_336";
    writeFileSync(join(dir, "pwsh"), "fixture");
    process.env.PATH = dir;
    const spy = mockRunProcess({ exitCode: 1, stderr });
    try {
      const failure = await captureFailure(
        () => new DpapiBackend(keyPath).storeKey(Buffer.from(keyText)),
      );
      expectRedactedStoreFailure(
        failure,
        [stderr, pathSentinel, keyPath, keyText, Buffer.from(keyText).toString("base64")],
      );
    } finally {
      spy.mockRestore();
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });

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
