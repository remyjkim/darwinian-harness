// ABOUTME: Verifies hook consent command workflows mutate card.lock safely.
// ABOUTME: Protects explicit user consent before hook materialization.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupProjectWithHookCard() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
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
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "sources", "@me", "policy", "card.json"), "utf8"));
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
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
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

test("card update preserves instruction consent only for exact content within range", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect(
    (
      await runAgentsCli(
        ["card", "new", "@me/instructions", "--no-git"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  const sourceDir = join(
    fixture.agentsDir,
    "drwn",
    "sources",
    "@me",
    "instructions",
  );
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
  expect(changed.stdout).toContain("instruction consent dropped");
  expect((await readLock(projectDir)).cards[0].instructionConsent).toBeUndefined();
});

test("card outdated notes when hook consent will need re-granting", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
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
