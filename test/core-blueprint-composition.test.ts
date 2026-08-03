// ABOUTME: Verifies Worker Blueprint (kind:blueprint) composedFrom expansion at card resolution.
// ABOUTME: A blueprint resolves to itself plus its member cards; recursion is refused; members dedupe first-wins.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { resolveProjectCards } from "../cli/core/card-project";
import type { CardLockEntry } from "../cli/core/card-lock";
import { cleanupTempRoots, createCatalogCardSource, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { name: string; composedFrom: string[]; version?: string },
) {
  const version = options.version ?? "1.0.0";
  const match = options.name.match(/^(@[^/]+)\/(.+)$/);
  if (!match) throw new Error(`Use a scoped card name in tests: ${options.name}`);
  const sourceRoot = await createCatalogCardSource(fixture, options.name, { kind: "blueprint" });
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.version = version;
  manifest.kind = "blueprint";
  manifest.composedFrom = options.composedFrom;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", options.name], envFor(fixture))).exitCode).toBe(0);
}

const memberSkills = (cards: CardLockEntry[]) =>
  cards.filter((c) => c.manifest.kind !== "blueprint").flatMap((c) => c.skills).sort();

test("blueprint composedFrom expands into member cards after the blueprint entry", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/a", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/b", skills: ["beta"] });
  await publishBlueprint(fixture, { name: "@me/fe", composedFrom: ["@me/a@^1.0.0", "@me/b@^1.0.0"] });

  const locked = await resolveProjectCards(fixture.agentsDir, ["@me/fe@^1.0.0"]);

  expect(locked.map((c) => c.name)).toEqual(["@me/fe", "@me/a", "@me/b"]);
  expect(locked[0]!.manifest.kind).toBe("blueprint");
  expect(locked[0]!.manifest.composedFrom).toEqual(["@me/a@^1.0.0", "@me/b@^1.0.0"]);
  expect(locked.find((c) => c.name === "@me/a")?.skills).toEqual(["alpha"]);
});

test("applying a blueprint yields the same member capabilities as applying them directly", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/a", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/b", skills: ["beta"] });
  await publishBlueprint(fixture, { name: "@me/fe", composedFrom: ["@me/a@^1.0.0", "@me/b@^1.0.0"] });

  const viaBlueprint = await resolveProjectCards(fixture.agentsDir, ["@me/fe@^1.0.0"]);
  const direct = await resolveProjectCards(fixture.agentsDir, ["@me/a@^1.0.0", "@me/b@^1.0.0"]);

  expect(memberSkills(viaBlueprint)).toEqual(memberSkills(direct));
});

test("a blueprint composing another blueprint is refused", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/a", skills: ["alpha"] });
  await publishBlueprint(fixture, { name: "@me/inner", composedFrom: ["@me/a@^1.0.0"] });
  await publishBlueprint(fixture, { name: "@me/outer", composedFrom: ["@me/inner@^1.0.0"] });

  await expect(resolveProjectCards(fixture.agentsDir, ["@me/outer@^1.0.0"])).rejects.toMatchObject({
    code: "BLUEPRINT_MEMBER_IS_BLUEPRINT",
  });
});

test("a member shared by a direct spec and a blueprint appears once (first wins)", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/a", skills: ["alpha"] });
  await publishBlueprint(fixture, { name: "@me/fe", composedFrom: ["@me/a@^1.0.0"] });

  const locked = await resolveProjectCards(fixture.agentsDir, ["@me/a@^1.0.0", "@me/fe@^1.0.0"]);

  expect(locked.map((c) => c.name)).toEqual(["@me/a", "@me/fe"]);
  expect(locked.filter((c) => c.name === "@me/a").length).toBe(1);
});
