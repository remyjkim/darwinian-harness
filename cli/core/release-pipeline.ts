// ABOUTME: Orchestrates the card release pipeline from source sync through publish and push.
// ABOUTME: Stops before publish when doctor or validation fails.

import { doctorCardSource } from "./card-source";
import { syncCardSource } from "./card-source-sync";
import { publishCard } from "./card-store";
import { isStrictSemver } from "./semver-utils";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCardSourceDir } from "./store-paths";

export interface ReleasePipelineOptions {
  bump?: "major" | "minor" | "patch";
  yes?: boolean;
}

export interface ReleasePipelineStep {
  step: string;
  ok: boolean;
  detail?: string;
}

export async function runRelease(agentsDir: string, sourceDir: string, options: ReleasePipelineOptions = {}) {
  sourceDir = existsSync(join(sourceDir, "card.json")) ? sourceDir : resolveCardSourceDir(agentsDir, sourceDir);
  const steps: ReleasePipelineStep[] = [];
  const sync = await syncCardSource(agentsDir, sourceDir, { check: true });
  steps.push({
    step: "source-sync",
    ok: sync.stale.length === 0 && sync.moved.length === 0,
    detail: `synced=${sync.synced.join(",") || "none"} stale=${sync.stale.join(",") || "none"}`,
  });
  if (sync.stale.length > 0 || sync.moved.length > 0) {
    return { ok: false, steps, proposedVersion: null };
  }

  const doctor = await doctorCardSource(sourceDir);
  steps.push({ step: "doctor", ok: doctor.ok, detail: doctor.issues.map((i) => i.message).join("; ") });
  if (!doctor.ok) {
    return { ok: false, steps, proposedVersion: null };
  }

  const source = doctor.sources[0];
  if (!source?.manifest) {
    return { ok: false, steps, proposedVersion: null };
  }
  const bump = options.bump ?? "patch";
  const proposedVersion = bumpVersion(source.manifest.version, bump);
  steps.push({ step: "propose-bump", ok: true, detail: `${source.manifest.version} -> ${proposedVersion}` });

  if (!options.yes) {
    return { ok: true, steps, proposedVersion, dryRun: true };
  }

  source.manifest.version = proposedVersion;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(source.manifestPath, `${JSON.stringify(source.manifest, null, 2)}\n`);
  await publishCard(agentsDir, sourceDir);
  steps.push({ step: "publish", ok: true });
  return { ok: true, steps, proposedVersion, dryRun: false };
}

function bumpVersion(current: string, bump: "major" | "minor" | "patch") {
  if (!isStrictSemver(current)) {
    throw new Error(`invalid current version: ${current}`);
  }
  const major = Number(current.split(".")[0]?.split("-")[0] ?? 0);
  const minor = Number(current.split(".")[1]?.split("-")[0] ?? 0);
  if (bump === "patch") {
    const patch = Number(current.split(".")[2]?.split("-")[0] ?? 0);
    return `${major}.${minor}.${patch + 1}`;
  }
  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major + 1}.0.0`;
}
