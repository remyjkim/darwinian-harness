// ABOUTME: Freezes the strict Bash management journeys and blocking three-OS qualification contract.
// ABOUTME: Rejects optional custody, divergent package bytes, unsafe shell behavior, and source-only smokes.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

describe("management Bash E2E contract", () => {
  test("hermetic and live journeys are strict, bounded, isolated, and cleanup-safe", async () => {
    const [hermetic, live, assertions] = await Promise.all([
      source("test/e2e/drwn-management-cli.sh"),
      source("test/e2e/drwn-management-cli-live.sh"),
      source("test/e2e/lib/assertions.sh"),
    ]);
    for (const script of [hermetic, live, assertions]) {
      expect(script).toContain("set -Eeuo pipefail");
      expect(script).not.toContain("DRWN_TEST_KEYCHAIN_DIR");
      expect(script).not.toMatch(/\beval\b/);
    }
    expect(hermetic).toContain("mktemp -d");
    expect(hermetic).toContain("trap cleanup EXIT INT TERM");
    expect(hermetic).toContain("DRWN_E2E_BIN");
    expect(hermetic).toContain("drwn-management-e2e-server.ts");
    expect(hermetic).toContain("openssl req -x509");
    expect(hermetic).toContain("wait_for_https");
    expect(hermetic).toContain("worker register");
    expect(hermetic.match(/worker deploy/g)?.length).toBeGreaterThanOrEqual(2);
    expect(hermetic).toContain("worker rollback");
    expect(hermetic).toContain("worker secret set");
    expect(hermetic).toContain("worker chat");
    expect(hermetic).toContain("worker retire");
    expect(hermetic).toContain("--name retired-slug");
    expect(hermetic).toContain("SENTINEL_MANAGEMENT_SECRET_336");
    expect(hermetic).toContain("assert_file_absent");
    expect(live).toContain("DRWN_STAGING_IDENTITY_MANIFEST_FILE");
    expect(live).toContain("DRWN_CLOUD_PROFILE=staging");
    expect(live).toContain("DRWN_LIVE_RECEIPT_DIR");
  });

  test("fixture server checks the exact protocol tuple and records no secret", async () => {
    const fixture = await source("test/fixtures/drwn-management-e2e-server.ts");
    for (const token of [
      "X-Drwn-Protocol",
      "deployed-worker.v1",
      "X-Drwn-Version",
      "1.4.2",
      "X-Request-Id",
      "Authorization",
      "application/vnd.darwinian.worker-deploy-bundle.v1+tar",
      "Content-Length",
      "assertDeploymentBundleBytes",
      "deployment_artifacts.put",
      "deployed_workers.register",
      "runs.read",
      "deployed_workers.retire",
    ]) expect(fixture).toContain(token);
    expect(fixture).toContain("secretValueObserved");
    expect(fixture).not.toContain("candidate.payloadBase64");
    expect(fixture).not.toContain("SENTINEL_MANAGEMENT_SECRET_336");
  });

  test("package scripts and CI make one measured artifact and real custody blocking on three OSes", async () => {
    const [packageSource, workflow] = await Promise.all([
      source("package.json"),
      source(".github/workflows/ci.yml"),
    ]);
    const pkg = JSON.parse(packageSource) as { scripts: Record<string, string> };
    expect(pkg.scripts["test:e2e:management:bash"]).toBe("bash test/e2e/drwn-management-cli.sh");
    expect(pkg.scripts["test:e2e:management:live"]).toBe("bash test/e2e/drwn-management-cli-live.sh");

    expect(workflow).toContain("management-artifact");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("artifact-sha256");
    expect(workflow).toContain("download-artifact@v4");
    expect(workflow).toContain("test:e2e:management:bash");
    expect(workflow).toContain("DRWN_RUN_REAL_KEYCHAIN_TESTS: '1'");
    expect(workflow).toContain("shellcheck test/e2e/drwn-management-cli.sh");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).not.toContain("DRWN_TEST_KEYCHAIN_DIR");
    expect(workflow).not.toContain("test/core-cloud-http.test.ts");
    expect(workflow).not.toMatch(/best[- ]effort/i);
  });
});
