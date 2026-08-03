// ABOUTME: Verifies publish and resolution reject incomplete card hook directories.
// ABOUTME: Protects consumers from lockfiles pointing at missing policy modules.

import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { publishCard, resolveCard } from "../cli/core/card-store";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldSource(options?: { policyDir?: boolean; policyFile?: boolean }) {
  const root = await createTempRoot("card-publish-hooks-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(root, "card-sources", "policy");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "card.json"),
    JSON.stringify({ name: "@me/policy", version: "1.0.0", hooks: { include: ["audit"] } }, null, 2),
  );
  if (options?.policyDir) {
    await mkdir(join(sourceDir, "hooks", "audit"), { recursive: true });
  }
  if (options?.policyFile) {
    await writeFile(join(sourceDir, "hooks", "audit", "policy.ts"), "export default { policyKind: 'observer' };\n");
  }
  return { agentsDir, sourceDir };
}

test("publishCard succeeds when declared policy.ts exists", async () => {
  const { agentsDir, sourceDir } = await scaffoldSource({ policyDir: true, policyFile: true });

  const result = await publishCard(agentsDir, sourceDir);

  expect(result.manifest.hooks?.include).toEqual(["audit"]);
});

test("publishCard rejects missing declared hook directory", async () => {
  const { agentsDir, sourceDir } = await scaffoldSource();

  await expect(publishCard(agentsDir, sourceDir)).rejects.toThrow("missing hook directory");
});

test("publishCard rejects declared hook directory without policy.ts", async () => {
  const { agentsDir, sourceDir } = await scaffoldSource({ policyDir: true });

  await expect(publishCard(agentsDir, sourceDir)).rejects.toThrow("missing policy.ts");
});

test("resolveCard rejects extracted hook trees missing policy.ts", async () => {
  const { agentsDir, sourceDir } = await scaffoldSource({ policyDir: true, policyFile: true });
  const published = await publishCard(agentsDir, sourceDir);
  await rm(join(published.versionDir, "hooks", "audit", "policy.ts"));

  await expect(resolveCard(agentsDir, "@me/policy@1.0.0")).rejects.toThrow("missing policy.ts");
});
