// ABOUTME: Proves the two I321 Phase-A public byte streams publish together under RUNNER_TEMP.
// ABOUTME: Refuses collisions and unsafe paths without deleting a caller-owned preexisting file.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const runnerTemp = await realpath(await mkdtemp(join(tmpdir(), "drwn-phase-a-output-")));
  roots.push(runnerTemp);
  await chmod(runnerTemp, 0o700);
  const publicRoot = join(runnerTemp, "i336-phase-a", "public");
  await mkdir(publicRoot, { recursive: true, mode: 0o700 });
  await chmod(join(runnerTemp, "i336-phase-a"), 0o700);
  await chmod(publicRoot, 0o700);
  return {
    runnerTemp,
    readinessPath: join(publicRoot, "i321-cli-management-readiness.json"),
    communityPath: join(publicRoot, "i321-staging-slot-community.json"),
    readinessBytes: new TextEncoder().encode('{"schema":"cl.dah.cli-management-readiness.v1"}\n'),
    communityBytes: new TextEncoder().encode('{"schema":"cl.dah.staging-slot-community.v1"}\n'),
  };
}

describe("I321 Phase-A public output pair", () => {
  test("creates both exact byte streams exclusively with mode 0600", async () => {
    const input = await fixture();
    const module = await import("../cli/core/management/phase-a-output");

    await module.writeI321PhaseAPublicReceipts(input);

    expect(await readFile(input.readinessPath)).toEqual(Buffer.from(input.readinessBytes));
    expect(await readFile(input.communityPath)).toEqual(Buffer.from(input.communityBytes));
    expect((await lstat(input.readinessPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(input.communityPath)).mode & 0o777).toBe(0o600);
  });

  test("preserves a preexisting collision and leaves no newly published peer", async () => {
    const input = await fixture();
    await writeFile(input.communityPath, "caller-owned\n", { mode: 0o600 });
    const module = await import("../cli/core/management/phase-a-output");

    await expect(module.writeI321PhaseAPublicReceipts(input)).rejects.toMatchObject({
      code: "STAGING_COMMUNITY_OUTPUT_INVALID",
    });

    expect(await readFile(input.communityPath, "utf8")).toBe("caller-owned\n");
    expect(await Bun.file(input.readinessPath).exists()).toBe(false);
  });

  test("rolls back the first final file when the second create-exclusive link fails", async () => {
    const input = await fixture();
    const module = await import("../cli/core/management/phase-a-output");
    let linkCalls = 0;
    const write = module.writeI321PhaseAPublicReceipts as unknown as (
      candidate: typeof input,
      dependencies: { link: typeof link },
    ) => Promise<void>;

    await expect(write(input, {
      link: async (existingPath, newPath) => {
        linkCalls += 1;
        if (linkCalls === 2) throw new Error("SECOND_LINK_FAILURE_SENTINEL");
        await link(existingPath, newPath);
      },
    })).rejects.toMatchObject({ code: "STAGING_COMMUNITY_OUTPUT_INVALID" });

    expect(linkCalls).toBe(2);
    expect(await Bun.file(input.readinessPath).exists()).toBe(false);
    expect(await Bun.file(input.communityPath).exists()).toBe(false);
    expect(await readdir(join(input.runnerTemp, "i336-phase-a", "public"))).toEqual([]);
  });
});
