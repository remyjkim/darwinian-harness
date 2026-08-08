// ABOUTME: Verifies the presence and minimum completeness of the future Homebrew release checklist.
// ABOUTME: Ensures Homebrew readiness is documented before formula implementation begins.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("homebrew readiness", () => {
  test("homebrew checklist exists with required sections", async () => {
    const content = await readFile(new URL("../.ai/knowledges/04_homebrew-release-checklist.md", import.meta.url), "utf8");

    expect(content).toContain("package name finalization");
    expect(content).toContain("tagged release");
    expect(content).toContain("source tarball");
    expect(content).toContain("binary install strategy");
    expect(content).toContain("formula location");
    expect(content).toContain("macOS architecture");
    expect(content).toContain("post-install");
    expect(content).toContain("current npm package: `darwinian`");
    expect(content).not.toContain("`dminds`");
    expect(content).toContain("drwn");
  });
});
