// ABOUTME: Exercises the complete consented Worker-instructions write lifecycle through the CLI.
// ABOUTME: Proves strict preflight, byte ownership, idempotence, drift safety, adapters, and cleanup.

import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  cleanupTempRoots,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";
import { resolveInstructionConsentAckPath } from "../cli/core/instruction-consent-ack";
import { loadCardLock } from "../cli/core/card-lock";
import { resolveExplicitInstructionContribution } from "../cli/core/instruction-contribution";
import { syncRepository } from "../cli/core/sync";
import { writeOrgWorkerMaterializationRecord } from "../cli/core/org-worker-materialization-record";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupInstructionProject() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect(
    (
      await runAgentsCli(
        ["card", "new", "@me/operator", "--no-git"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        [
          "card",
          "source",
          "set",
          "@me/operator",
          "--instructions-text",
          "Use the reviewed operating procedure.",
        ],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        ["card", "publish", "@me/operator"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);

  const sourcePath = join(
    fixture.agentsDir,
    "drwn",
    "sources",
    "@me",
    "operator",
    "card.json",
  );
  const manifest = JSON.parse(await readFile(sourcePath, "utf8"));
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect(
    (
      await runAgentsCli(
        ["add", `@me/operator@${manifest.version}`],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  return { fixture, projectDir };
}

async function fileSnapshot(path: string) {
  const info = await stat(path, { bigint: true });
  return {
    bytes: await readFile(path),
    mtimeNs: info.mtimeNs,
  };
}

test("write excludes unconsented instructions and strict mode fails before instruction mutation", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const agentsPath = join(projectDir, "AGENTS.md");
  const adapterPath = join(projectDir, ".claude", "CLAUDE.md");

  const normal = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(normal.exitCode).toBe(0);
  expect(`${normal.stdout}\n${normal.stderr}`).toContain(
    "@me/operator explicit instructions excluded",
  );
  expect(existsSync(agentsPath)).toBe(false);
  expect(existsSync(adapterPath)).toBe(false);

  const strict = await runAgentsCli(
    ["write", "--strict"],
    envFor(fixture),
    projectDir,
  );
  expect(strict.exitCode).toBe(1);
  expect(strict.stderr).toContain(
    "Explicit instruction consent required for: @me/operator",
  );
  expect(existsSync(agentsPath)).toBe(false);
  expect(existsSync(adapterPath)).toBe(false);
});

test("trust then write is byte and mtime idempotent and cleans only owned instruction bytes", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const agentsPath = join(projectDir, "AGENTS.md");
  const adapterPath = join(projectDir, ".claude", "CLAUDE.md");
  await writeFile(agentsPath, "# User-owned guidance\n");

  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  const first = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(first.exitCode, first.stderr).toBe(0);
  const rendered = await readFile(agentsPath, "utf8");
  expect(rendered).toContain("<!-- drwn:instructions:start -->");
  expect(rendered).toContain("Use the reviewed operating procedure.");
  expect(rendered).toEndWith("# User-owned guidance\n");
  expect(await readFile(adapterPath, "utf8")).toBe("@../AGENTS.md\n");

  const agentsBefore = await fileSnapshot(agentsPath);
  const adapterBefore = await fileSnapshot(adapterPath);
  const repeat = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(repeat.exitCode, repeat.stderr).toBe(0);
  expect(await fileSnapshot(agentsPath)).toEqual(agentsBefore);
  expect(await fileSnapshot(adapterPath)).toEqual(adapterBefore);

  expect(
    (
      await runAgentsCli(
        ["card", "untrust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  const cleanup = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(cleanup.exitCode, cleanup.stderr).toBe(0);
  expect(await readFile(agentsPath, "utf8")).toBe("# User-owned guidance\n");
  expect(existsSync(adapterPath)).toBe(false);
});

test("write fails closed on owned-block drift and force heals only the recorded block", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const agentsPath = join(projectDir, "AGENTS.md");
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode,
  ).toBe(0);

  const tampered = (await readFile(agentsPath, "utf8")).replace(
    "reviewed operating",
    "tampered operating",
  );
  await writeFile(agentsPath, tampered);
  const blocked = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(blocked.exitCode).toBe(1);
  expect(blocked.stderr).toMatch(/drift/i);
  expect(await readFile(agentsPath, "utf8")).toBe(tampered);

  const healed = await runAgentsCli(
    ["write", "--force"],
    envFor(fixture),
    projectDir,
  );
  expect(healed.exitCode, healed.stderr).toBe(0);
  expect(await readFile(agentsPath, "utf8")).toContain(
    "Use the reviewed operating procedure.",
  );
});

test("foreign Claude adapter is advisory by default and explicitly receives a managed import", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const adapterPath = join(projectDir, ".claude", "CLAUDE.md");
  await Bun.write(adapterPath, "# User Claude guidance\n");
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);

  const defaultWrite = await runAgentsCli(
    ["write"],
    envFor(fixture),
    projectDir,
  );
  expect(defaultWrite.exitCode, defaultWrite.stderr).toBe(0);
  expect(`${defaultWrite.stdout}\n${defaultWrite.stderr}`).toContain(
    "missing @../AGENTS.md",
  );
  expect(await readFile(adapterPath, "utf8")).toBe("# User Claude guidance\n");

  const applied = await runAgentsCli(
    ["write", "--apply-claude-adapter"],
    envFor(fixture),
    projectDir,
  );
  expect(applied.exitCode, applied.stderr).toBe(0);
  const bytes = await readFile(adapterPath, "utf8");
  expect(bytes).toContain("<!-- drwn:claude-adapter:start -->");
  expect(bytes).toContain("@../AGENTS.md");
  expect(bytes).toEndWith("# User Claude guidance\n");
});

test("partial writes retain instruction files and ownership unchanged", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const agentsPath = join(projectDir, "AGENTS.md");
  const adapterPath = join(projectDir, ".claude", "CLAUDE.md");
  const recordPath = join(projectDir, ".agents", "drwn", "write-record.json");
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode,
  ).toBe(0);
  const before = await Promise.all(
    [agentsPath, adapterPath].map(fileSnapshot),
  );
  const recordBefore = JSON.parse(await readFile(recordPath, "utf8"));

  expect(
    (
      await runAgentsCli(
        ["write", "--mcp-only"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect(await Promise.all([agentsPath, adapterPath].map(fileSnapshot))).toEqual(
    before,
  );
  const recordAfter = JSON.parse(await readFile(recordPath, "utf8"));
  expect(
    recordAfter.managedPaths.filter(
      (entry: { surface?: string }) => entry.surface === "instructions",
    ),
  ).toEqual(
    recordBefore.managedPaths.filter(
      (entry: { surface?: string }) => entry.surface === "instructions",
    ),
  );
});

test("write acknowledges imported instruction consent once per machine and exact content", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/operator", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  await rm(resolveInstructionConsentAckPath(fixture.agentsDir), {
    force: true,
  });

  const first = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(first.stderr).toContain(
    "instructions present, consented by @me/operator (^1.0.0) on another machine",
  );

  const second = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(second.exitCode, second.stderr).toBe(0);
  expect(second.stderr).not.toContain("on another machine");
});

test("external organization consent projects exact bytes without becoming local consent", async () => {
  const { fixture, projectDir } = await setupInstructionProject();
  const lock = await loadCardLock(projectDir);
  const locked = lock!.cards[0]!;
  const contribution = resolveExplicitInstructionContribution(
    locked,
    locked.path,
  )!;
  const organizationConsent = {
    workerId: "worker:operator",
    artifactPinRefsByCard: {
      [locked.name]: "artifact:operator",
    },
    evidence: [
      {
        kind: "org_worker_bundle_consent" as const,
        bundleDigest: `sha256:${"2".repeat(64)}` as const,
        sourceBlueprint: {
          id: "blueprint:operator:1",
          revision: 1,
          digest: `sha256:${"3".repeat(64)}` as const,
        },
        consentId: "consent:operator-instructions",
        workerId: "worker:operator",
        artifactPinRef: "artifact:operator",
        consentedRange: ">=1.0.0 <2.0.0",
        contentDigest: contribution.contentDigest,
        ratifierRef: "actor:owner",
        evidenceRefs: ["evidence:ratification"],
        projectionSurface: "worker_instructions" as const,
      },
    ],
  };
  const options = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  };

  const authorized = await syncRepository({
    ...options,
    organizationInstructionConsent: organizationConsent,
  });
  expect(authorized.warnings).not.toMatchObject([
    expect.stringContaining("consent excluded"),
  ]);
  expect(await readFile(join(projectDir, "AGENTS.md"), "utf8")).toContain(
    "Use the reviewed operating procedure.",
  );
  expect((await loadCardLock(projectDir))!.cards[0]!.instructionConsent).toBeUndefined();
  const externalBeforeLocalCommands = structuredClone(organizationConsent);
  expect(
    (
      await runAgentsCli(
        ["card", "trust", locked.name, "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect((await loadCardLock(projectDir))!.cards[0]!.instructionConsent).toBeDefined();
  expect(organizationConsent).toEqual(externalBeforeLocalCommands);
  expect(
    (
      await runAgentsCli(
        ["card", "untrust", locked.name, "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect((await loadCardLock(projectDir))!.cards[0]!.instructionConsent).toBeUndefined();
  expect(organizationConsent).toEqual(externalBeforeLocalCommands);

  const durableLock = (await loadCardLock(projectDir))!;
  const configBytes = await readFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    "utf8",
  );
  const lockBytes = await readFile(
    join(projectDir, ".agents", "drwn", "card.lock"),
    "utf8",
  );
  const sha256 = (bytes: string) =>
    `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  await writeOrgWorkerMaterializationRecord(projectDir, {
    schema: "drwn.org-worker-materialization",
    schemaVersion: 1,
    sourceBundle: {
      digest: organizationConsent.evidence[0]!.bundleDigest,
      workerId: organizationConsent.workerId,
      blueprintId:
        organizationConsent.evidence[0]!.sourceBlueprint.id,
      blueprintRevision:
        organizationConsent.evidence[0]!.sourceBlueprint.revision,
      blueprintDigest:
        organizationConsent.evidence[0]!.sourceBlueprint.digest,
    },
    projectState: {
      configDigest: sha256(configBytes),
      lockDigest: sha256(lockBytes),
      orderedRootNames: durableLock.workerRoots.map(({ name }) => name),
      activeWorker: durableLock.workerRoots[0]!.name,
    },
    artifactBindings: durableLock.cards.map((card) => ({
      artifactPinRef:
        organizationConsent.artifactPinRefsByCard[card.name]!,
      cardName: card.name,
      version: card.version,
      integrity: card.integrity,
      treeSha: card.treeSha!,
      gitCommit: card.git!.commit,
    })),
    instructionConsentEvidence:
      organizationConsent.evidence.map((evidence) => ({
        consentId: evidence.consentId,
        artifactPinRef: evidence.artifactPinRef,
        contentDigest: evidence.contentDigest,
        consentedRange: evidence.consentedRange,
        ratifierRef: evidence.ratifierRef,
        evidenceRefs: evidence.evidenceRefs,
      })),
    projection: {
      instructionId: `worker:${durableLock.workerRoots[0]!.name}`,
      contentDigest: contribution.contentDigest,
      ownershipHash: `sha256-${"4".repeat(64)}`,
      adapterState: "owned",
    },
    lastVerifiedReceiptId: "receipt:test:organization-consent",
  });
  const ordinaryWrite = await runAgentsCli(
    ["write"],
    envFor(fixture),
    projectDir,
  );
  expect(ordinaryWrite.exitCode, ordinaryWrite.stderr).toBe(0);
  expect(`${ordinaryWrite.stdout}\n${ordinaryWrite.stderr}`).not.toContain(
    "consent excluded",
  );

  const beforeStrict = await fileSnapshot(join(projectDir, "AGENTS.md"));
  await expect(
    syncRepository({
      ...options,
      strict: true,
      organizationInstructionConsent: {
        ...organizationConsent,
        evidence: [],
      },
    }),
  ).rejects.toThrow(/instruction consent required/i);
  expect(await fileSnapshot(join(projectDir, "AGENTS.md"))).toEqual(
    beforeStrict,
  );

  const missing = await syncRepository({
    ...options,
    organizationInstructionConsent: {
      ...organizationConsent,
      evidence: [],
    },
  });
  expect(missing.warnings).toContain(
    `${locked.name} organization instruction consent excluded: consent_required. Verify Org Worker materialization evidence.`,
  );
  expect((await loadCardLock(projectDir))!.cards[0]!.instructionConsent).toBeUndefined();
});
