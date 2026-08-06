// ABOUTME: Locks the I220 retirement at authoring scope: the gateway rejects permissions and
// ABOUTME: escalation naming the field and issue, while the shared validator stays consume-tolerant.

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findRetiredGovernanceFields,
  retiredGovernanceFieldErrors,
  validateCardManifest,
} from "../cli/core/card-manifest";
import { resolveCardSourceInput } from "../cli/core/card-source-input";

const base = {
  name: "@test/blueprint",
  version: "1.0.0",
  kind: "blueprint",
  composedFrom: ["@test/member@^1.0.0"],
};

describe("retired governance fields (I220)", () => {
  test("the finder names exactly the declared retired fields", () => {
    expect(findRetiredGovernanceFields({ ...base, permissions: {} })).toEqual(["permissions"]);
    expect(findRetiredGovernanceFields({ ...base, escalation: {} })).toEqual(["escalation"]);
    expect(findRetiredGovernanceFields(base)).toEqual([]);
    expect(retiredGovernanceFieldErrors({ ...base, permissions: {} }).join(" ")).toContain("I220");
  });

  test("the shared validator stays tolerant — consume paths must keep accepting history", () => {
    const result = validateCardManifest({ ...base, permissions: { anything: true }, escalation: { humanOwner: "x" } });
    expect(result.ok).toBe(true);
  });

  test("the authoring gateway rejects a source declaring permissions, naming I220", async () => {
    const dir = await mkdtemp(join(tmpdir(), "drwn-i220-src-"));
    await writeFile(join(dir, "card.json"), JSON.stringify({ ...base, permissions: { anything: true } }, null, 2));
    await expect(
      resolveCardSourceInput({ input: dir, cwd: dir, catalogCheckouts: [], homeDir: dir }),
    ).rejects.toThrow(/permissions was retired \(I220\)/);
  });

  test("the authoring gateway accepts a clean source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "drwn-i220-clean-"));
    await writeFile(join(dir, "card.json"), JSON.stringify(base, null, 2));
    const resolved = await resolveCardSourceInput({ input: dir, cwd: dir, catalogCheckouts: [], homeDir: dir });
    expect(resolved.manifest.name).toBe("@test/blueprint");
  });
});
