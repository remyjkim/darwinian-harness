// ABOUTME: Proves release recovery is exact-tag, policy-gated, and structurally unable to publish.
// ABOUTME: Allows only candidate registry/artifact verification and installed smokes.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(join(import.meta.dir, "..", ".github", "workflows", "release-recovery.yml"), "utf8");

describe("Worker release recovery workflow", () => {
  test("requires exact tag selection, failed canonical run, and authorization receipt", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("failed_run_id:");
    expect(workflow).toContain("authorization_receipt:");
    expect(workflow).toContain('GITHUB_REF" != "refs/tags/v1.4.2"');
    expect(workflow).toContain('git cat-file -t "refs/tags/v1.4.2"');
    expect(workflow).toContain('FAILED_RUN_ID: ${{ inputs.failed_run_id }}');
    expect(workflow).toContain('[[ "$FAILED_RUN_ID" =~ ^[1-9][0-9]*$ ]]');
    expect(workflow).toContain('actions/runs/$FAILED_RUN_ID');
    expect(workflow).not.toContain('actions/runs/${{ inputs.failed_run_id }}');
    expect(workflow).not.toContain('--arg failedRunId "${{ inputs.failed_run_id }}"');
    expect(workflow).not.toContain('--arg runId "${{ inputs.failed_run_id }}"');
    expect(workflow).toContain("release-cli.ts parse-tag-authorization");
    expect(workflow).toContain("release-cli.ts requalify-artifact");
    expect(workflow).toContain("release-cli.ts verify-recovery-provenance");
    expect(workflow).toContain("git fetch --no-tags origin main");
    expect(workflow).toContain("release-cli.ts verify-registry");
    expect(workflow).toContain("--require-git-head");
  });

  test("has policy-gated approval but no publication, token, OIDC, repack, or tag-mutation capability", () => {
    expect(workflow).toContain("name: darwinian-npm-publish");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    expect(workflow).not.toContain("NPM_TOKEN");
    expect(workflow).not.toMatch(/npm publish/);
    expect(workflow).not.toMatch(/npm pack/);
    expect(workflow).not.toMatch(/git (?:tag|push)/);
    expect(workflow).not.toContain("npm dist-tag");
    expect(workflow).not.toContain("unpublish");
  });

  test("limits recovery to candidate registry verification and installed smokes", () => {
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).toContain("release-cli.ts smoke-artifact");
    expect(workflow).toContain("i336-candidate");
    expect(workflow).not.toContain("gh release view");
    expect(workflow).not.toContain("gh release create");
    expect(workflow).not.toContain("contents: write");
  });
});
