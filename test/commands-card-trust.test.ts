// ABOUTME: Verifies hook consent command workflows mutate card.lock safely.
// ABOUTME: Protects explicit user consent before hook materialization.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  envFor,
  installMachineBlueprint,
  publishMachineBlueprint,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";
import { applyMachineWorkerRoots } from "../cli/core/worker-machine";
import { readMachineConfigFile } from "../cli/core/machine-config";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import { resolveHookConsentAckPath } from "../cli/core/hook-consent-ack";
import { resolveInstructionConsentAckPath } from "../cli/core/instruction-consent-ack";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupProjectWithHookCard() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  manifest.instructions = { text: "Follow the reviewed operating policy." };
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);
  return { fixture, projectDir };
}

async function readLock(projectDir: string) {
  return JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
}

async function setupMachineConsentFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await installMachineBlueprint(fixture, {
    rootName: "@me/operator-worker",
    memberName: "@me/policy",
    instructions: { text: "Follow the reviewed machine policy." },
    hooks: ["guard"],
  });
  return fixture;
}

async function readMachine(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return JSON.parse(
    await readFile(resolveMachineConfigPath(fixture.agentsDir), "utf8"),
  );
}

test("card trust/untrust records machine hook and instruction consent in the active closure", async () => {
  const fixture = await setupMachineConsentFixture();
  const trusted = await runAgentsCli(
    [
      "card",
      "trust",
      "@me/policy@1.0.0",
      "--scope",
      "machine",
      "--hooks",
      "--instructions",
      "--range",
      "^1.0.0",
    ],
    envFor(fixture),
  );

  expect(trusted.exitCode, trusted.stderr).toBe(0);
  let card = (await readMachine(fixture)).capabilities.workerLock.cards.find(
    (entry: { name: string }) => entry.name === "@me/policy",
  );
  expect(card.hookConsent.consentedRange).toBe("^1.0.0");
  expect(card.instructionConsent.consentedRange).toBe("^1.0.0");
  expect(card.instructionConsent.contentDigest).toMatch(/^sha256-[a-f0-9]{64}$/);

  const untrusted = await runAgentsCli(
    ["card", "untrust", "@me/policy", "--scope=machine", "--instructions"],
    envFor(fixture),
  );
  expect(untrusted.exitCode, untrusted.stderr).toBe(0);
  card = (await readMachine(fixture)).capabilities.workerLock.cards.find(
    (entry: { name: string }) => entry.name === "@me/policy",
  );
  expect(card.instructionConsent).toBeUndefined();
  expect(card.hookConsent).toBeDefined();
});

test("machine consent refuses inactive Cards without dropping consent recorded while active", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const policyRef = await publishMachineBlueprint(fixture, {
    rootName: "@me/policy-worker",
    memberName: "@me/policy",
    instructions: { text: "Policy instructions." },
    hooks: ["guard"],
  });
  const otherRef = await publishMachineBlueprint(fixture, {
    rootName: "@me/other-worker",
    memberName: "@me/other",
  });
  await applyMachineWorkerRoots(fixture.agentsDir, [policyRef, otherRef], {
    active: "@me/policy-worker",
  });
  expect((await runAgentsCli(
    ["card", "trust", "@me/policy", "--scope=machine", "--hooks"],
    envFor(fixture),
  )).exitCode).toBe(0);
  const selected = await runAgentsCli(
    ["use", "@me/other-worker", "--root", "--no-write"],
    envFor(fixture),
  );
  expect(selected.exitCode, selected.stderr).toBe(0);
  const before = await readFile(resolveMachineConfigPath(fixture.agentsDir));

  const rejected = await runAgentsCli(
    ["card", "untrust", "@me/policy", "--scope=machine", "--hooks"],
    envFor(fixture),
  );

  expect(rejected.exitCode).toBe(1);
  expect(rejected.stderr).toContain("active machine Worker closure");
  expect(await readFile(resolveMachineConfigPath(fixture.agentsDir))).toEqual(before);
  const policy = (await readMachine(fixture)).capabilities.workerLock.cards.find(
    (entry: { name: string }) => entry.name === "@me/policy",
  );
  expect(policy.hookConsent).toBeDefined();
});

test("write --root replays typed machine acknowledgements from inside a project but dry-run does not", async () => {
  const fixture = await setupMachineConsentFixture();
  expect((await runAgentsCli(
    [
      "card",
      "trust",
      "@me/policy",
      "--scope=machine",
      "--hooks",
      "--instructions",
    ],
    envFor(fixture),
  )).exitCode).toBe(0);
  const hookAckPath = resolveHookConsentAckPath(fixture.agentsDir);
  const instructionAckPath = resolveInstructionConsentAckPath(fixture.agentsDir);
  await rm(hookAckPath, { force: true });
  await rm(instructionAckPath, { force: true });
  const projectDir = join(fixture.root, "project");
  const configPath = await writeSupportedProjectConfig(projectDir);
  const projectBefore = await readFile(configPath);

  const preview = await runAgentsCli(
    ["write", "--root", "--dry-run"],
    envFor(fixture),
    projectDir,
  );
  expect(preview.exitCode, preview.stderr).toBe(0);
  expect(existsSync(hookAckPath)).toBe(false);
  expect(existsSync(instructionAckPath)).toBe(false);

  const write = await runAgentsCli(
    ["write", "--root"],
    envFor(fixture),
    projectDir,
  );
  expect(write.exitCode, write.stderr).toBe(0);
  expect(write.stderr).toContain("hooks present, consented by @me/policy");
  expect(write.stderr).toContain("instructions present, consented by @me/policy");
  expect(await readFile(configPath)).toEqual(projectBefore);
  expect(JSON.parse(await readFile(hookAckPath, "utf8")).acks[0].scope)
    .toMatchObject({ kind: "machine", activeWorker: "@me/operator-worker" });
  expect(JSON.parse(await readFile(instructionAckPath, "utf8")).acks[0].scope)
    .toMatchObject({ kind: "machine", activeWorker: "@me/operator-worker" });
});

test("machine consent rejects an unsupported lock floor without mutating machine intent", async () => {
  const fixture = await setupMachineConsentFixture();
  const machinePath = resolveMachineConfigPath(fixture.agentsDir);
  const machine = await readMachineConfigFile(machinePath);
  if (!machine?.capabilities.workerLock) throw new Error("missing machine lock");
  machine.capabilities.workerLock.cards[0]!.manifest.harness = {
    minVersion: "9.9.9",
  };
  machine.capabilities.workerLock.store.minDrwnVersion = "9.9.9";
  await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
  const before = await readFile(machinePath);

  const result = await runAgentsCli(
    ["card", "trust", "@me/policy", "--scope=machine", "--hooks"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("requires drwn >= 9.9.9");
  expect(await readFile(machinePath)).toEqual(before);
});

test("card trust --hooks records explicit consent range", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();

  const result = await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  const consent = (await readLock(projectDir)).cards[0].hookConsent;
  expect(consent.consentedRange).toBe("^1.0.0");
  expect(new Date(consent.consentedAt).toISOString()).toBe(consent.consentedAt);
});

test("card trust --instructions records exact content consent and untrust clears only that surface", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();

  const trusted = await runAgentsCli(
    ["card", "trust", "@me/policy", "--instructions", "--range", "^1.0.0"],
    envFor(fixture),
    projectDir,
  );

  expect(trusted.exitCode).toBe(0);
  let locked = (await readLock(projectDir)).cards[0];
  expect(locked.instructionConsent.consentedRange).toBe("^1.0.0");
  expect(locked.instructionConsent.contentDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(locked.hookConsent).toBeUndefined();

  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/policy", "--hooks", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  locked = (await readLock(projectDir)).cards[0];
  expect(locked.hookConsent).toBeDefined();
  expect(locked.instructionConsent).toBeDefined();

  const untrusted = await runAgentsCli(
    ["card", "untrust", "@me/policy", "--instructions"],
    envFor(fixture),
    projectDir,
  );
  expect(untrusted.exitCode).toBe(0);
  locked = (await readLock(projectDir)).cards[0];
  expect(locked.instructionConsent).toBeUndefined();
  expect(locked.hookConsent).toBeDefined();
});

test("card trust rejects instruction consent when no explicit contribution exists", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();
  const lockPath = join(projectDir, ".agents", "drwn", "card.lock");
  const lock = await readLock(projectDir);
  delete lock.cards[0].manifest.instructions;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const result = await runAgentsCli(
    ["card", "trust", "@me/policy", "--instructions"],
    envFor(fixture),
    projectDir,
  );

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("does not declare explicit instructions");
});

test("card add warns when the added card declares hooks without consent", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);

  const result = await runAgentsCli(["add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("declares hooks");
  expect(`${result.stdout}\n${result.stderr}`).toContain("drwn card trust @me/policy --hooks");
});

test("card trust --hooks defaults range from locked version and updates timestamp idempotently", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();

  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const first = (await readLock(projectDir)).cards[0].hookConsent;
  await new Promise((resolve) => setTimeout(resolve, 2));
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const second = (await readLock(projectDir)).cards[0].hookConsent;

  expect(first.consentedRange).toBe("^1.0.0");
  expect(second.consentedRange).toBe("^1.0.0");
  expect(second.consentedAt >= first.consentedAt).toBe(true);
});

test("card untrust --hooks clears hook consent", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const result = await runAgentsCli(["card", "untrust", "@me/policy", "--hooks"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect((await readLock(projectDir)).cards[0].hookConsent).toBeUndefined();
});

test("card update drops hook consent when the locked version exits the consent range", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["apply", "@me/policy@>=1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "2.0.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);

  const result = await runAgentsCli(["update"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("hook consent dropped");
  const lock = await readLock(projectDir);
  expect(lock.cards[0].version).toBe("2.0.0");
  expect(lock.cards[0].hookConsent).toBeUndefined();
});

test("card update carries hook consent while locked version remains in range", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const result = await runAgentsCli(["update"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect((await readLock(projectDir)).cards[0].hookConsent?.consentedRange).toBe("^1.0.0");
});

test("card update re-grants instruction consent in-range on content change and preserves for exact content", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/instructions");
  const manifestPath = join(sourceDir, "card.json");
  let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.instructions = { text: "Stable reviewed instructions." };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect(
    (
      await runAgentsCli(
        ["card", "publish", "@me/instructions"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect(
    (
      await runAgentsCli(
        ["apply", "@me/instructions@^1.0.0"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        [
          "card",
          "trust",
          "@me/instructions",
          "--instructions",
          "--range",
          "^1.0.0",
        ],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  const originalConsent = (await readLock(projectDir)).cards[0]
    .instructionConsent;

  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "1.1.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect(
    (
      await runAgentsCli(
        ["card", "publish", "@me/instructions"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  const compatible = await runAgentsCli(
    ["update"],
    envFor(fixture),
    projectDir,
  );
  expect(compatible.exitCode, compatible.stderr).toBe(0);
  expect((await readLock(projectDir)).cards[0].instructionConsent).toEqual(
    originalConsent,
  );

  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "1.2.0";
  manifest.instructions.text = "Changed instructions require new consent.";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect(
    (
      await runAgentsCli(
        ["card", "publish", "@me/instructions"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  const changed = await runAgentsCli(
    ["update"],
    envFor(fixture),
    projectDir,
  );
  expect(changed.exitCode, changed.stderr).toBe(0);
  // In-range content change: consent is re-granted with the new digest (not dropped).
  expect(changed.stdout).toContain("instruction consent re-granted");
  const regrantedConsent = (await readLock(projectDir)).cards[0].instructionConsent;
  expect(regrantedConsent).toBeDefined();
  expect(regrantedConsent.consentedRange).toBe("^1.0.0");
  expect(regrantedConsent.contentDigest).not.toBe(originalConsent.contentDigest);
});

test("card outdated notes when hook consent will need re-granting", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["apply", "@me/policy@>=1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "2.0.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);

  const human = await runAgentsCli(["card", "outdated"], envFor(fixture), projectDir);
  const json = await runAgentsCli(["card", "outdated", "--json"], envFor(fixture), projectDir);

  expect(human.stdout).toContain("hook consent will require re-grant");
  expect(JSON.parse(json.stdout).outdated[0].hookConsentRequiresRegrant).toBe(true);
});

test("card audit prints deferred feature stub", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["card", "audit"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("v1.1 feature");
});

test("card trust reports an error when the card is not locked", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();

  const result = await runAgentsCli(["card", "trust", "@me/missing", "--hooks"], envFor(fixture), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("Card is not in project lockfile");
});

test("card update re-grants hook consent in-range when hook policy content changes", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  // Apply with a range ref so `update` can re-resolve to 1.1.0 later.
  expect((await runAgentsCli(["apply", "@me/policy@>=1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  // Mutate the hook policy content and bump version (within the consented range)
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "1.1.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(sourceDir, "hooks", "guard", "policy.ts"),
    `export default { policyKind: "observer", async beforeToolCall() { return { action: "allow", additionalContext: "CHANGED CONTENT" }; } };`,
  );
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);

  const result = await runAgentsCli(["update"], envFor(fixture), projectDir);
  expect(result.exitCode, result.stderr).toBe(0);
  // In-range + hook content changed: consent should be re-granted, not dropped.
  expect(result.stdout).toContain("hook consent re-granted");
  const consent = (await readLock(projectDir)).cards[0].hookConsent;
  expect(consent).toBeDefined();
  expect(consent.consentedRange).toBe("^1.0.0");
});

test("card update drops instruction consent when new version exits the consented range", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/rangecheck");
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.instructions = { text: "Original instructions." };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/rangecheck"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["apply", "@me/rangecheck@>=1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/rangecheck", "--instructions", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  // Bump to 2.0.0 — outside the ^1.0.0 consent range
  const m2 = JSON.parse(await readFile(manifestPath, "utf8"));
  m2.version = "2.0.0";
  m2.instructions.text = "Major bump with new instructions.";
  await writeFile(manifestPath, `${JSON.stringify(m2, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/rangecheck"], envFor(fixture))).exitCode).toBe(0);

  const result = await runAgentsCli(["update"], envFor(fixture), projectDir);
  expect(result.exitCode, result.stderr).toBe(0);
  // Out-of-range: consent should be dropped with a fail-loud message.
  expect(result.stdout).toContain("instruction consent dropped");
  expect((await readLock(projectDir)).cards[0].instructionConsent).toBeUndefined();
});
