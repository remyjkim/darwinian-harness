// ABOUTME: Proves the manual Worker release workflow is a main-only immutable dry-run with no mutation authority.
// ABOUTME: Locks one pack, one qualification, one install, and one exact artifact upload before publication is added.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(join(import.meta.dir, "..", ".github", "workflows", "release.yml"), "utf8");

describe("Worker release dry-run workflow", () => {
  test("manual dispatch is explicitly main-only, dry-run-only, version-bound, and fresh-main-bound", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("version:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain("default: true");
    expect(workflow).toContain('GITHUB_REF" != "refs/heads/main"');
    expect(workflow).toContain('inputs.dry_run');
    expect(workflow).toContain('!= "true"');
    expect(workflow).toContain('inputs.version');
    expect(workflow).toContain("git fetch --no-tags origin main");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("git rev-parse origin/main");
    expect(workflow).toContain('CHECKOUT_SHA" != "$GITHUB_SHA');
    expect(workflow).toContain('MAIN_SHA" != "$GITHUB_SHA');
  });

  test("the real online unpublished probe runs before expensive qualification and fails closed", () => {
    const probe = workflow.indexOf("bun scripts/release-cli.ts assert-unpublished");
    const typecheck = workflow.indexOf("bun run typecheck");
    expect(probe).toBeGreaterThan(-1);
    expect(typecheck).toBeGreaterThan(probe);
    expect(workflow).not.toContain("already_published");
    expect(workflow).not.toContain("continuing with qualification");
    expect(workflow).not.toContain("|| true");
  });

  test("dry run has read-only authority and no environment, OIDC, token, tag, release, or publish path", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toMatch(/^\s+environment:/m);
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    expect(workflow).not.toContain("NPM_TOKEN");
    expect(workflow).not.toContain("npm publish");
    expect(workflow).not.toContain("gh release");
    expect(workflow).not.toMatch(/git (?:tag|push)/);
    expect(workflow).not.toContain("contents: write");
  });

  test("qualifies one checked-out artifact through the complete source and installed contract", () => {
    expect(workflow).toContain("bun run typecheck");
    expect(workflow).toContain("bun run test");
    expect(workflow).toContain("bun run verify:bridge");
    expect(workflow).toContain("bun run verify:release");
    expect(workflow).toContain("bun scripts/release/build-identity.ts");
    expect(workflow.match(/npm pack /g)).toHaveLength(1);
    expect(workflow.match(/release-cli\.ts qualify-artifact/g)).toHaveLength(1);
    expect(workflow.match(/release-cli\.ts smoke-artifact/g)).toHaveLength(1);
    expect(workflow.match(/release-cli\.ts create-receipt/g)).toHaveLength(1);
    expect(workflow.indexOf("build-identity.ts")).toBeLessThan(workflow.indexOf("npm pack "));
    expect(workflow.indexOf("qualify-artifact")).toBeLessThan(workflow.indexOf("smoke-artifact"));
    expect(workflow.indexOf("smoke-artifact")).toBeLessThan(workflow.indexOf("create-receipt"));
  });

  test("uploads exactly the tar and pre-upload receipt once under immutable artifact settings", () => {
    expect(workflow.match(/actions\/upload-artifact@v4/g)).toHaveLength(1);
    expect(workflow).toContain("name: darwinian-worker-release-candidate");
    expect(workflow).toContain("darwinian-1.2.0.tgz");
    expect(workflow).toContain("release-candidate.json");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("overwrite: false");
    expect(workflow).toContain("retention-days: 14");
    expect(workflow).toContain("steps.upload.outputs.artifact-id");
    expect(workflow).toContain("steps.upload.outputs.artifact-url");
    expect(workflow).toContain("steps.upload.outputs.artifact-digest");
    expect(workflow.indexOf("create-receipt")).toBeLessThan(workflow.indexOf("actions/upload-artifact@v4"));
  });
});
