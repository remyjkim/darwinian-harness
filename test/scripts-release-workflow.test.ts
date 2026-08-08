// ABOUTME: Proves the manual Worker release workflow is a main-only immutable dry-run with no mutation authority.
// ABOUTME: Locks one pack, one qualification, one install, and one exact artifact upload before publication is added.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(join(import.meta.dir, "..", ".github", "workflows", "release.yml"), "utf8");
const ciWorkflow = readFileSync(join(import.meta.dir, "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

function job(id: string, next?: string): string {
  const start = workflow.indexOf(`  ${id}:`);
  const end = next ? workflow.indexOf(`  ${next}:`, start + 1) : workflow.length;
  return start === -1 ? "" : workflow.slice(start, end === -1 ? undefined : end);
}

describe("Worker release dry-run workflow", () => {
  test("source CI and release qualification consume one canonical bounded full-suite gate", () => {
    const ciValidation = ciWorkflow.slice(
      ciWorkflow.indexOf("  validate:"),
      ciWorkflow.indexOf("  command-bridge:"),
    );
    const releaseValidation = job("validate", "dry_run_complete");

    expect(pkg.scripts["test:gate"]).toBe("bun test --timeout 30000 ./test/");
    expect(ciValidation.match(/run: bun run test:gate/g)).toHaveLength(1);
    expect(releaseValidation.match(/run: bun run test:gate/g)).toHaveLength(1);
    expect(ciValidation).not.toContain("run: bun test --timeout 30000 ./test/");
    expect(releaseValidation).not.toMatch(/run: bun run test\s*(?:\n|$)/);
    expect(releaseValidation).toContain(
      "      - name: Release-readiness gate\n" +
        "        env:\n" +
        "          QUALITY_GATE_TEST_MODE: '1'\n" +
        "        run: bun run verify:release",
    );
  });

  test("test-bearing validators share a sixty-minute outer bound", () => {
    const ciValidation = ciWorkflow.slice(
      ciWorkflow.indexOf("  validate:"),
      ciWorkflow.indexOf("  command-bridge:"),
    );
    const releaseValidation = job("validate", "dry_run_complete");
    const artifactQualification = job("dry_run_complete", "validate_tag");

    expect(ciValidation).toContain("timeout-minutes: 60");
    expect(releaseValidation).toContain("timeout-minutes: 60");
    expect(artifactQualification).toContain("timeout-minutes: 20");
  });

  test("manual dispatch is explicitly main-only, dry-run-only, version-bound, and fresh-main-bound", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("version:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain("default: true");
    expect(workflow).toContain('GITHUB_REF" != "refs/heads/main"');
    expect(workflow).toContain('INPUT_DRY_RUN: ${{ inputs.dry_run }}');
    expect(workflow).toContain('INPUT_VERSION: ${{ inputs.version }}');
    expect(workflow).toContain('INPUT_DRY_RUN" != "true"');
    expect(workflow).toContain('INPUT_VERSION" != "$PACKAGE_VERSION"');
    expect(workflow).not.toContain('if [ "${{ inputs.');
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
    const dryRunJobs = `${job("validate", "dry_run_complete")}\n${job("dry_run_complete", "validate_tag")}`;
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(dryRunJobs).not.toContain("id-token: write");
    expect(dryRunJobs).not.toMatch(/^\s+environment:/m);
    expect(dryRunJobs).not.toContain("NODE_AUTH_TOKEN");
    expect(dryRunJobs).not.toContain("NPM_TOKEN");
    expect(dryRunJobs).not.toContain("npm publish");
    expect(dryRunJobs).not.toContain("gh release");
    expect(dryRunJobs).not.toMatch(/git (?:tag|push)/);
    expect(dryRunJobs).not.toContain("contents: write");
  });

  test("qualifies one checked-out artifact through the complete source and installed contract", () => {
    const dryRun = job("dry_run_complete", "validate_tag");
    expect(workflow).toContain("bun run typecheck");
    expect(workflow).toContain("bun run test");
    expect(workflow).toContain("bun run verify:bridge");
    expect(workflow).toContain("bun run verify:release");
    expect(workflow).toContain("bun scripts/release/build-identity.ts");
    expect(dryRun.match(/npm pack /g)).toHaveLength(1);
    expect(dryRun.match(/release-cli\.ts qualify-artifact/g)).toHaveLength(1);
    expect(dryRun.match(/release-cli\.ts smoke-artifact/g)).toHaveLength(1);
    expect(dryRun.match(/release-cli\.ts create-receipt/g)).toHaveLength(1);
    expect(dryRun.indexOf("build-identity.ts")).toBeLessThan(dryRun.indexOf("npm pack "));
    expect(dryRun.indexOf("qualify-artifact")).toBeLessThan(dryRun.indexOf("smoke-artifact"));
    expect(dryRun.indexOf("smoke-artifact")).toBeLessThan(dryRun.indexOf("create-receipt"));
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

describe("Worker annotated-tag publication workflow", () => {
  test("accepts only the exact v1.2.0 annotated tag and validates its bound run and artifact before protection", () => {
    const validation = job("validate_tag", "publish");
    expect(workflow).toContain("push:\n    tags:\n      - 'v1.2.0'");
    expect(validation).toContain("name: Validate authorized tag");
    expect(validation).toContain("actions: read");
    expect(validation).toContain('git cat-file -t "refs/tags/$TAG"');
    expect(validation).toContain('git rev-parse "refs/tags/$TAG^{}"');
    expect(validation).toContain("release-cli.ts parse-tag-authorization");
    expect(validation).toContain("actions/runs/$RUN_ID/attempts/$RUN_ATTEMPT/jobs");
    expect(validation).toContain("actions/runs/$RUN_ID/artifacts");
    expect(validation).toContain("actions/artifacts/$ARTIFACT_ID/zip");
    expect(validation.indexOf("sha256sum")).toBeLessThan(validation.indexOf("unzip"));
    expect(validation).toContain("release-cli.ts requalify-artifact");
    expect(validation).toContain("release-cli.ts verify-provenance");
    expect(validation).toContain("git fetch --no-tags origin main");
    expect(validation).not.toContain("id-token: write");
    expect(validation).not.toMatch(/^\s+environment:/m);
  });

  test("grants OIDC only to the independently protected exact-artifact publish job", () => {
    const publish = job("publish", "smoke_macos");
    expect(workflow.match(/id-token: write/g)).toHaveLength(1);
    expect(publish).toContain("name: Publish to npm");
    expect(publish).toContain("name: darwinian-npm-publish");
    expect(publish).toContain("id-token: write");
    expect(publish).toContain("bun scripts/release-cli.ts verify-controls");
    expect(publish).toContain("bun scripts/release-cli.ts assert-unpublished");
    expect(publish).toContain("actions/artifacts/${{ needs.validate_tag.outputs.artifact_id }}/zip");
    expect(publish).toContain("bun scripts/release-cli.ts requalify-artifact");
    expect(publish).toContain('npm publish "./candidate/darwinian-1.2.0.tgz" --access public');
    expect(publish).not.toContain("npm pack --ignore-scripts");
    expect(publish).toContain('npm pack "darwinian@1.2.0"');
    expect(publish).not.toContain("NODE_AUTH_TOKEN");
    expect(publish).not.toContain("NPM_TOKEN");
  });

  test("requires registry identity before Ubuntu/macOS installed smokes and exact GitHub Release verification", () => {
    const publish = job("publish", "smoke_macos");
    const macos = job("smoke_macos", "github_release");
    const release = job("github_release");
    expect(publish).toContain("release-cli.ts verify-registry");
    expect(publish.indexOf("verify-registry")).toBeLessThan(publish.indexOf("smoke-artifact"));
    expect(macos).toContain("runs-on: macos-latest");
    expect(macos).toContain("release-cli.ts verify-registry");
    expect(macos).toContain("release-cli.ts smoke-artifact");
    expect(release).toContain("contents: write");
    expect(release).toContain("gh release view");
    expect(release).toContain("gh release create");
    expect(release).toContain("--verify-tag");
    expect(workflow).not.toContain("already_published");
  });
});
