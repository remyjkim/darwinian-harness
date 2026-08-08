// ABOUTME: Specifies deterministic credential-path normalization and domain-separated custody identities.
// ABOUTME: Uses injected path boundaries so POSIX and Windows aliases are proven without touching real credentials.

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveCredentialScope } from "../cli/core/auth/credential-scope";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function enoent(path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`missing: ${path}`), { code: "ENOENT" });
}

describe("credential scope derivation", () => {
  test("relative, absolute, and symlink aliases resolve to one existing target plus unresolved tail", async () => {
    const root = mkdtempSync(join(tmpdir(), "credential-scope-"));
    roots.push(root);
    const target = join(root, "target");
    const alias = join(root, "alias");
    mkdirSync(target);
    symlinkSync(target, alias, "dir");

    const relative = await deriveCredentialScope("alias/missing/credentials.json", { cwd: root, platform: "darwin" });
    const absolute = await deriveCredentialScope(join(target, "missing", "credentials.json"), {
      cwd: "/",
      platform: "darwin",
    });

    expect(relative.credentialsPath).toBe(absolute.credentialsPath);
    expect(relative.normalizedPath).toBe(absolute.normalizedPath);
    expect(relative.scopeDigest).toBe(absolute.scopeDigest);
    expect(relative.keyRef).toBe(absolute.keyRef);
    expect(relative.qualificationNamespaceDigest).toBe(absolute.qualificationNamespaceDigest);
  });

  test("uses the exact domain-separated scope, key, and qualification namespace formulas", async () => {
    const scope = await deriveCredentialScope("credentials.json", {
      cwd: "/var/lib/darwinian",
      platform: "linux",
      realpath: async (path) => {
        if (path === "/var/lib") return path;
        throw enoent(path);
      },
    });

    expect(scope.normalizedPath).toBe("/var/lib/darwinian/credentials.json");
    const expectedScope = sha256(`darwinian.worker.credential-scope.v1\0${scope.normalizedPath}`);
    expect(scope.scopeDigest).toBe(expectedScope);
    expect(scope.keyRef).toBe(`drwn-credentials-v2:${expectedScope}`);
    expect(scope.qualificationNamespaceDigest).toBe(
      sha256(`darwinian.worker.qualification-namespace.v1\0${expectedScope}`),
    );
    expect(scope.qualificationNamespaceDigest).not.toBe(scope.scopeDigest);
  });

  test("normalizes Unicode to NFC while preserving POSIX case", async () => {
    const decomposed = "/tmp/Cafe\u0301";
    const scope = await deriveCredentialScope(`${decomposed}/credentials.json`, {
      cwd: "/",
      platform: "darwin",
      realpath: async (path) => {
        if (path === decomposed) return decomposed;
        throw enoent(path);
      },
    });

    expect(scope.credentialsPath).toBe(`${decomposed}/credentials.json`);
    expect(scope.normalizedPath).toBe("/tmp/Café/credentials.json");
  });

  test("normalizes Windows separators, drive letter, and path case consistently", async () => {
    const realpath = async (path: string) => {
      const normalized = path.replace(/\//g, "\\").toLowerCase();
      if (normalized === "c:\\users\\example\\vault") return "C:\\Users\\Example\\Vault";
      throw enoent(path);
    };
    const upper = await deriveCredentialScope("C:\\USERS\\EXAMPLE\\VAULT\\Missing\\Credentials.json", {
      cwd: "C:\\Users\\Example",
      platform: "win32",
      realpath,
    });
    const lower = await deriveCredentialScope("c:/users/example/vault/missing/credentials.json", {
      cwd: "c:\\users\\example",
      platform: "win32",
      realpath,
    });

    expect(upper.normalizedPath).toBe("c:/users/example/vault/missing/credentials.json");
    expect(lower.normalizedPath).toBe(upper.normalizedPath);
    expect(lower.scopeDigest).toBe(upper.scopeDigest);
    expect(lower.credentialsPath.toLowerCase()).toBe(upper.credentialsPath.toLowerCase());
  });

  test("distinct credential targets derive distinct custody and public namespace identities", async () => {
    const root = mkdtempSync(join(tmpdir(), "credential-scope-distinct-"));
    roots.push(root);
    const first = await deriveCredentialScope(join(root, "one", "credentials.json"), { platform: "linux" });
    const second = await deriveCredentialScope(join(root, "two", "credentials.json"), { platform: "linux" });

    expect(first.scopeDigest).not.toBe(second.scopeDigest);
    expect(first.keyRef).not.toBe(second.keyRef);
    expect(first.qualificationNamespaceDigest).not.toBe(second.qualificationNamespaceDigest);
  });
});
