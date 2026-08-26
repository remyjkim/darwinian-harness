// ABOUTME: Shared fixture for the worker-materialize suites: a golden deploy payload built
// ABOUTME: by the real payload builder over a published closure, plus fresh target roots.

import { expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWorkerDeployPayload } from "../cli/core/worker-deploy";
import { validateMaterializePayload } from "../cli/core/worker-materialize";
import { createCatalogCardSource, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  composedFrom: string[],
  extra: Record<string, unknown> = {},
) {
  const sourceRoot = await createCatalogCardSource(fixture, name);
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  Object.assign(manifest, { kind: "blueprint", composedFrom }, extra);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
}

export async function goldenPayload() {
  const fixture = await scaffoldCliFixture();
  await publishCardWithSkills(fixture, { name: "@me/react-builder", skills: ["react"] });
  await publishBlueprint(fixture, "@me/frontend-eng", ["@me/react-builder@^1.0.0"], {
    evals: ["passes_tests"],
  });
  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/frontend-eng@^1.0.0",
  });
  // Round-trip through the validation gate exactly as the command will.
  return {
    payload: validateMaterializePayload(JSON.parse(JSON.stringify(payload))),
    repoRoot: fixture.repoRoot,
  };
}

export async function freshRoots() {
  const base = await mkdtemp(join(tmpdir(), "drwn-i221-e2e-"));
  return {
    base,
    projectRoot: join(base, "mind"),
    agentsDir: join(base, "cli-home", ".agents"),
    homeDir: join(base, "cli-home"),
  };
}
