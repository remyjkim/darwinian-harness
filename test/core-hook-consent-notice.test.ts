// ABOUTME: Verifies hook-consent cross-machine notice prints once per ack key.
// ABOUTME: Ensures consenting machines record acks via card trust --hooks.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildHookConsentAckKey,
  computeHookPolicyDigest,
  hasHookConsentAck,
  recordHookConsentAck,
  resolveHookConsentAckPath,
} from "../cli/core/hook-consent-ack";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

async function scaffoldHookProject(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const resolvedDir = await publishCardWithSkills(fixture, { name: "@me/hooks", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, {
    workers: ["@me/hooks@1.0.0"],
    activeWorker: "@me/hooks",
  });
  const policyDir = join(resolvedDir, "hooks", "guard");
  await mkdir(policyDir, { recursive: true });
  await writeFile(join(policyDir, "policy.ts"), "export default { name: 'guard' };\n");
  const { resolveCard } = await import("../cli/core/card-store");
  const resolved = await resolveCard(fixture.agentsDir, "@me/hooks@1.0.0");
  await writeTestCardLock(projectDir, [
    {
      name: resolved.name,
      requested: "@me/hooks@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: ["guard"],
      registry: null,
      origin: resolved.origin,
      hookConsent: { consentedAt: "2026-01-01T00:00:00.000Z", consentedRange: "^1.0.0" },
      ...(resolved.git ? { git: resolved.git } : {}),
    },
  ]);
  return { projectDir, resolved };
}

test("write prints cross-machine hook notice once and records ack", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const { projectDir, resolved } = await scaffoldHookProject(fixture);
  const digest = await computeHookPolicyDigest(
    {
      name: resolved.name,
      requested: "@me/hooks@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: ["guard"],
      registry: null,
      origin: resolved.origin,
      hookConsent: { consentedAt: "2026-01-01T00:00:00.000Z", consentedRange: "^1.0.0" },
      ...(resolved.git ? { git: resolved.git } : {}),
    },
    resolved.dir,
  );
  const ackKey = buildHookConsentAckKey({
    scope: { kind: "project", projectRoot: projectDir },
    card: {
      name: resolved.name,
      requested: "@me/hooks@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: ["guard"],
      registry: null,
      origin: resolved.origin,
      hookConsent: { consentedAt: "2026-01-01T00:00:00.000Z", consentedRange: "^1.0.0" },
      ...(resolved.git ? { git: resolved.git } : {}),
    },
    hookPolicyDigest: digest,
  });
  expect(await hasHookConsentAck(fixture.agentsDir, ackKey)).toBe(false);

  const first = await runAgentsCli(["write"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(first.exitCode).toBe(0);
  expect(first.stderr).toMatch(/hooks present, consented by @me\/hooks/i);
  expect(await hasHookConsentAck(fixture.agentsDir, ackKey)).toBe(true);

  const second = await runAgentsCli(["write"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(second.exitCode).toBe(0);
  expect(second.stderr).not.toMatch(/hooks present, consented by @me\/hooks/i);
});

test("card trust --hooks records ack for consenting machine", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const { projectDir, resolved } = await scaffoldHookProject(fixture);
  const lockPath = join(projectDir, ".agents", "drwn", "card.lock");
  const lock = JSON.parse(await Bun.file(lockPath).text());
  delete lock.cards[0].hookConsent;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const trust = await runAgentsCli(["card", "trust", "@me/hooks", "--hooks"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(trust.exitCode).toBe(0);
  expect(await Bun.file(resolveHookConsentAckPath(fixture.agentsDir)).exists()).toBe(true);

  const write = await runAgentsCli(["write"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(write.exitCode).toBe(0);
  expect(write.stderr).not.toMatch(/hooks present, consented by @me\/hooks/i);
});
