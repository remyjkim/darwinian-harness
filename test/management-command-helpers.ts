// ABOUTME: Provides canonical isolated project, organization, target, auth, and stream fixtures for management commands.
// ABOUTME: Keeps command tests on real context/private-file paths without touching machine state.

import { realpath } from "node:fs/promises";
import { Writable } from "node:stream";
import type { AgentsContext } from "../cli/context";
import { selectMachineOrganization, writeProjectCloudContext } from "../cli/core/management/context-store";
import { resolveCloudProfile } from "../cli/core/management/profile";
import { scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

export class CaptureStream extends Writable {
  chunks: Buffer[] = [];
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); callback();
  }
  text(): string { return Buffer.concat(this.chunks).toString("utf8"); }
}

function b64(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }

export function managementToken(): string {
  const profile = resolveCloudProfile({}); const iat = Math.floor(Date.now() / 1000) - 1;
  return `${b64({ alg: "none" })}.${b64({
    iss: profile.issuer, aud: profile.resource, azp: "drwn-cli", sub: "user_management",
    scope: "openid email offline_access dah:management.delegate", iat, exp: iat + 900,
  })}.sig`;
}

export async function createManagementCommandFixture(stdin: NodeJS.ReadableStream = process.stdin) {
  const raw = await scaffoldCliFixture(); const root = await realpath(raw.root);
  const canonical = (path: string) => path.replace(raw.root, root);
  const fixture = { ...raw, root, repoRoot: canonical(raw.repoRoot), homeDir: canonical(raw.homeDir), agentsDir: canonical(raw.agentsDir) };
  const projectConfigPath = await writeSupportedProjectConfig(fixture.repoRoot);
  const profile = resolveCloudProfile({});
  await selectMachineOrganization(fixture.homeDir, profile.profileDigest, "org_acme", "2026-08-25T11:00:00.000Z");
  await writeProjectCloudContext(fixture.repoRoot, {
    schema: "drwn.project-cloud-context", schemaVersion: 1, profileDigest: profile.profileDigest,
    organizationId: "org_acme", deployedWorkerId: "deployed_worker_alpha", verifiedAt: "2026-08-25T11:01:00.000Z",
  });
  const stdout = new CaptureStream(); const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir, homeDir: fixture.homeDir, cwd: fixture.repoRoot,
    projectConfigPath, stdin: stdin as AgentsContext["stdin"], stdout, stderr, env: {}, colorDepth: 1,
  };
  return { fixture, context, stdout, stderr, profile };
}
