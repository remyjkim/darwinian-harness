// ABOUTME: Defines the one predicate for optional Worker Mind capability.
// ABOUTME: Computes the lock and deploy version floor from complete Card closures.

import type { CardManifest } from "./card-manifest";
import { compareVersions } from "./semver-utils";

export const PROJECT_WORKER_MIN_DRWN_VERSION = "0.8.0";
export const WORKER_MIND_MIN_DRWN_VERSION = "0.9.0";

export function cardDeclaresMind(manifest: CardManifest): boolean {
  return (
    (manifest.persona?.include?.length ?? 0) > 0
    || (manifest.beliefs?.include?.length ?? 0) > 0
    || manifest.memory?.observations !== undefined
    || manifest.memory?.insights !== undefined
  );
}

export function minimumDrwnVersionForManifests(manifests: Iterable<CardManifest>): string {
  let minimum = PROJECT_WORKER_MIN_DRWN_VERSION;
  for (const manifest of manifests) {
    if (cardDeclaresMind(manifest) && compareVersions(WORKER_MIND_MIN_DRWN_VERSION, minimum) > 0) {
      minimum = WORKER_MIND_MIN_DRWN_VERSION;
    }
    const declared = manifest.harness?.minVersion;
    if (declared && compareVersions(declared, minimum) > 0) {
      minimum = declared;
    }
  }
  return minimum;
}
