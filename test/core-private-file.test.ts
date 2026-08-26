// ABOUTME: Pins contained, owner-only, atomic private-file storage for cloud state.
// ABOUTME: Symlinks, oversize files, interrupted writes, and path escapes fail closed.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, lstat, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { readPrivateFile, writePrivateFile } from "../cli/core/private-file";

let root: string | null = null;
async function fixture(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "drwn-private-file-"));
  root = await realpath(root);
  return root;
}
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = null; });

describe("private file", () => {
  test("round-trips through a contained atomic mode-0600 file", async () => {
    const base = await fixture();
    const path = join(base, ".agents", "drwn", "cloud.local.json");
    await writePrivateFile({ root: base, path, bytes: "{\"ok\":true}\n" });
    expect(await readPrivateFile({ root: base, path })).toBe("{\"ok\":true}\n");
    if (process.platform !== "win32") expect((await lstat(path)).mode & 0o777).toBe(0o600);
  });

  test("an interrupted replacement preserves prior bytes and removes owned temp state", async () => {
    const base = await fixture();
    const path = join(base, ".agents", "drwn", "cloud.local.json");
    await writePrivateFile({ root: base, path, bytes: "before\n" });
    await expect(writePrivateFile({
      root: base,
      path,
      bytes: "after\n",
      checkpoint: (phase) => { if (phase === "before-rename") throw new Error("injected"); },
    })).rejects.toMatchObject({ code: "PRIVATE_FILE_WRITE_FAILED" });
    expect(await readFile(path, "utf8")).toBe("before\n");
    expect((await readFile(join(base, ".agents", "drwn", "cloud.local.json"), "utf8"))).toBe("before\n");
  });

  test("rejects path escapes, symlinked components, non-files, and oversized input", async () => {
    const base = await fixture();
    await expect(writePrivateFile({ root: base, path: join(base, "..", "escape"), bytes: "x" }))
      .rejects.toMatchObject({ code: "PRIVATE_FILE_INVALID" });
    const outside = await mkdtemp(join(tmpdir(), "drwn-private-outside-"));
    try {
      await symlink(outside, join(base, "linked"));
      await expect(writePrivateFile({ root: base, path: join(base, "linked", "state.json"), bytes: "x" }))
        .rejects.toMatchObject({ code: "PRIVATE_FILE_INVALID" });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
    const directory = join(base, "directory");
    await mkdir(directory);
    await expect(readPrivateFile({ root: base, path: directory }))
      .rejects.toMatchObject({ code: "PRIVATE_FILE_INVALID" });
    const large = join(base, "large");
    await writeFile(large, "x".repeat(65_537));
    await expect(readPrivateFile({ root: base, path: large, maxBytes: 65_536 }))
      .rejects.toMatchObject({ code: "PRIVATE_FILE_INVALID" });
  });

  test("invokes the platform restriction seam before and after publish without exposing paths", async () => {
    const base = await fixture();
    const path = join(base, "state.json");
    const restricted: string[] = [];
    await writePrivateFile({
      root: base,
      path,
      bytes: "{}\n",
      platform: "win32",
      restrict: async (candidate) => { restricted.push(candidate); },
    });
    expect(restricted).toHaveLength(2);
    expect(restricted[1]).toBe(path);
    await chmod(path, 0o600);
  });
});
