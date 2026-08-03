// ABOUTME: Verifies card publish command guardrails and override wiring.
// ABOUTME: Exercises publish behavior through the CLI rather than core helpers alone.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bumpOverrideConfigKey } from "../cli/core/card-publish-guardrail";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import * as git from "../cli/core/git";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function updateCardSource(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { version: string; skills: string[] },
) {
  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", "@me", "backend");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = options.version;
  manifest.skills = { include: options.skills };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const skill of options.skills) {
    const skillDir = join(sourceRoot, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n`);
  }
}

/**
 * Publish a card that declares a hook policy + explicit instructions, so a
 * subsequent re-publish can exercise the consent-impact report.
 */
async function publishCardWithHookAndInstructions(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { version: string; hookContent: string; instructionText: string },
): Promise<void> {
  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  if (!await Bun.file(join(sourceRoot, "card.json")).exists()) {
    expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  }
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.version = options.version;
  manifest.hooks = { include: ["org-conventions"] };
  manifest.instructions = { text: options.instructionText };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const hookDir = join(sourceRoot, "hooks", "org-conventions");
  await mkdir(hookDir, { recursive: true });
  await writeFile(join(hookDir, "policy.ts"), options.hookContent);

  const published = await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture));
  expect(published.exitCode).toBe(0);
}

async function mutatePolicyCardSource(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { version: string; hookContent: string; instructionText: string },
): Promise<void> {
  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.version = options.version;
  manifest.instructions = { text: options.instructionText };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(sourceRoot, "hooks", "org-conventions", "policy.ts"), options.hookContent);
}

test("card publish rejects structural major change declared as patch", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: ["alpha"] });
  await updateCardSource(fixture, { version: "1.0.1", skills: [] });

  const result = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("structural changes classify as major");
  expect(result.stderr).toContain("--force-bump-mismatch");
});

test("card publish override succeeds and records an audit marker", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: ["alpha"] });
  await updateCardSource(fixture, { version: "1.0.1", skills: [] });

  const result = await runAgentsCli(["card", "publish", "@me/backend", "--force-bump-mismatch"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain("--force-bump-mismatch used");
  const marker = await git.configGet(resolveCardBareRepoPath(fixture.agentsDir, "@me/backend"), bumpOverrideConfigKey("1.0.1"));
  expect(marker).toBe("major");
});

test("card publish can diff against an immutable version that predates the current manifest schema", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "0.1.0", skills: ["alpha"] });

  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", "@me", "backend");
  const manifestPath = join(sourceRoot, "card.json");
  const legacyManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  legacyManifest.memory = { l4: { format: "md" }, l5: { format: "jsonl" } };
  await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);

  const barePath = resolveCardBareRepoPath(fixture.agentsDir, "@me/backend");
  const legacyTree = await git.writeTreeFromDir(barePath, sourceRoot);
  const legacyCommit = await git.commitTree(barePath, legacyTree, null, "Legacy schema fixture");
  const deletedTag = await git.runGit(["--git-dir", barePath, "tag", "-d", "v0.1.0"]);
  expect(deletedTag.exitCode).toBe(0);
  await git.createAnnotatedTag(barePath, "v0.1.0", legacyCommit, "Legacy schema fixture");
  await git.updateRef(barePath, "refs/heads/main", legacyCommit);

  legacyManifest.version = "0.2.0";
  legacyManifest.memory = { observations: { format: "jsonl" }, insights: { format: "md" } };
  await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);

  const result = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Published @me/backend@0.2.0");
});

test("card publish reports consent impact when hook and instruction content change", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  await publishCardWithHookAndInstructions(fixture, {
    version: "1.0.0",
    hookContent: `export default { policyKind: "observer", async beforeToolCall() { return { action: "allow" }; } };`,
    instructionText: "Original instruction content.",
  });

  await mutatePolicyCardSource(fixture, {
    version: "1.1.0",
    hookContent: `export default { policyKind: "observer", async beforeToolCall() { return { action: "allow", additionalContext: "CHANGED" }; } };`,
    instructionText: "Updated instruction content with new conventions.",
  });

  const result = await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Published @me/policy@1.1.0");
  expect(result.stdout).toContain("Consent impact");
  expect(result.stdout).toContain("hooks:");
  expect(result.stdout.toLowerCase()).toContain("changed");
  expect(result.stdout).toContain("instructions:");
});

test("card publish --json includes consentImpact object", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  await publishCardWithHookAndInstructions(fixture, {
    version: "1.0.0",
    hookContent: `export default { policyKind: "observer", async beforeToolCall() { return { action: "allow" }; } };`,
    instructionText: "Original.",
  });

  await mutatePolicyCardSource(fixture, {
    version: "1.1.0",
    hookContent: `export default { policyKind: "observer", async beforeToolCall() { return { action: "allow", additionalContext: "X" }; } };`,
    instructionText: "Changed content.",
  });

  const result = await runAgentsCli(["card", "publish", "@me/policy", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.name).toBe("@me/policy");
  expect(parsed.version).toBe("1.1.0");
  expect(parsed.consentImpact).toBeDefined();
  expect(parsed.consentImpact.hooks.changed).toBe(true);
  expect(parsed.consentImpact.instructions.changed).toBe(true);
});

test("card publish reports no consent impact when only description changes", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  await publishCardWithHookAndInstructions(fixture, {
    version: "1.0.0",
    hookContent: `export default { policyKind: "observer", async beforeToolCall() { return { action: "allow" }; } };`,
    instructionText: "Stable instruction.",
  });

  // Same hook + instruction content, only bump version + description
  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "1.0.1";
  manifest.description = "New description only.";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runAgentsCli(["card", "publish", "@me/policy", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.consentImpact.hooks.changed).toBe(false);
  expect(parsed.consentImpact.instructions.changed).toBe(false);
});

