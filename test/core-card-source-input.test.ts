// ABOUTME: Verifies the one source-input contract for explicit paths and catalog-resolved Card names.
// ABOUTME: Keeps manifest identity authoritative and rejects missing or ambiguous catalog matches.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCardSourceInput } from "../cli/core/card-source-input";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function card(root: string, directory: string, name: string) {
  const sourceDir = join(root, directory);
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({ name, version: "1.0.0" })}\n`);
  return sourceDir;
}

describe("resolveCardSourceInput", () => {
  test("normalizes relative, absolute, tilde, and file paths", async () => {
    const root = await createTempRoot("source-input-");
    tempRoots.push(root);
    const sourceDir = await card(root, "cards/example", "@test/example");
    const cases = [
      { input: "./cards/example", cwd: root },
      { input: sourceDir, cwd: "/" },
      { input: "~/cards/example", cwd: "/" },
      { input: `file:${sourceDir}`, cwd: "/" },
    ];

    for (const value of cases) {
      const resolved = await resolveCardSourceInput({
        ...value,
        homeDir: root,
        catalogCheckouts: [],
      });
      expect(resolved.sourceDir).toBe(await realpath(sourceDir));
      expect(resolved.manifest.name).toBe("@test/example");
      expect(resolved.resolution).toBe("explicit");
    }
  });

  test("resolves a bare scoped name through immediate catalog cards", async () => {
    const root = await createTempRoot("source-catalog-");
    tempRoots.push(root);
    const sourceDir = await card(root, "catalog/cards/repo-slug", "@test/example");

    const resolved = await resolveCardSourceInput({
      input: "@test/example",
      cwd: root,
      homeDir: root,
      catalogCheckouts: ["~/catalog"],
    });

    expect(resolved.sourceDir).toBe(await realpath(sourceDir));
    expect(resolved.resolution).toBe("catalog");
  });

  test("accepts --from with a matching positional name and rejects a mismatch", async () => {
    const root = await createTempRoot("source-from-");
    tempRoots.push(root);
    await card(root, "example", "@test/example");

    expect((await resolveCardSourceInput({
      input: "@test/example",
      from: "./example",
      cwd: root,
      homeDir: root,
      catalogCheckouts: [],
    })).manifest.name).toBe("@test/example");
    await expect(resolveCardSourceInput({
      input: "@test/other",
      from: "./example",
      cwd: root,
      homeDir: root,
      catalogCheckouts: [],
    })).rejects.toMatchObject({ code: "CARD_SOURCE_NAME_MISMATCH" });
  });

  test("reports actionable zero-match, ambiguous, and missing-input errors", async () => {
    const root = await createTempRoot("source-errors-");
    tempRoots.push(root);
    await card(root, "one/cards/a", "@test/example");
    await card(root, "two/cards/b", "@test/example");

    await expect(resolveCardSourceInput({
      input: "@test/missing", cwd: root, homeDir: root, catalogCheckouts: [join(root, "one")],
    })).rejects.toMatchObject({ code: "CARD_SOURCE_NOT_FOUND" });
    await expect(resolveCardSourceInput({
      input: "@test/example", cwd: root, homeDir: root, catalogCheckouts: [join(root, "one"), join(root, "two")],
    })).rejects.toMatchObject({ code: "CARD_SOURCE_AMBIGUOUS" });
    await expect(resolveCardSourceInput({
      cwd: root, homeDir: root, catalogCheckouts: [],
    })).rejects.toMatchObject({ code: "CARD_SOURCE_INPUT_REQUIRED" });
  });

  test("rejects absent directories, missing manifests, and invalid manifests", async () => {
    const root = await createTempRoot("source-invalid-");
    tempRoots.push(root);
    await mkdir(join(root, "missing-manifest"));
    await mkdir(join(root, "invalid"));
    await writeFile(join(root, "invalid", "card.json"), `${JSON.stringify({ name: "@test/invalid" })}\n`);

    for (const input of ["./absent", "./missing-manifest", "./invalid"]) {
      await expect(resolveCardSourceInput({ input, cwd: root, homeDir: root, catalogCheckouts: [] }))
        .rejects.toMatchObject({ code: "CARD_SOURCE_INVALID" });
    }
  });
});
