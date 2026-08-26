// ABOUTME: Plans and explicitly executes age-gated removal of verified Worker launch contexts.
// ABOUTME: Never removes drifted, corrupt, foreign, symlinked, or arbitrary paths.

import { randomBytes } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DrwnError } from "../errors";
import { syncDirectory } from "../fs";
import { listProjectWorkerLaunchContexts } from "./diagnostics";
import { verifyWorkerLaunchContext, withWorkerLaunchContextLock } from "./store";

export function parseWorkerLaunchPruneDuration(value: string): number {
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new DrwnError("LAUNCH_PRUNE_AGE_INVALID", `Invalid --older-than duration: ${value}`);
  const amount = Number(match[1]);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  const milliseconds = amount * unit;
  if (!Number.isSafeInteger(milliseconds)) throw new DrwnError("LAUNCH_PRUNE_AGE_INVALID", "--older-than duration exceeds the supported range");
  return milliseconds;
}

export async function pruneProjectWorkerLaunchContexts(input: {
  projectRoot: string;
  olderThanMs: number;
  execute: boolean;
  repoRoot?: string;
  agentsDir?: string;
  homeDir?: string;
  now?: () => Date;
  checkpoint?: (name: "locked" | "before-rename" | "after-rename") => void | Promise<void>;
}) {
  const run = async () => {
    const inventory = await listProjectWorkerLaunchContexts(input);
    const cutoff = (input.now ?? (() => new Date()))().getTime() - input.olderThanMs;
    const candidates = inventory.contexts.filter((item) =>
      (item.state === "current" || item.state === "obsolete") &&
      item.contextId && item.createdAt && Date.parse(item.createdAt) <= cutoff
    );
    const removed: string[] = [];
    if (input.execute) {
      for (const candidate of candidates) {
        await withWorkerLaunchContextLock(input.projectRoot, candidate.contextId!, async () => {
          await input.checkpoint?.("locked");
          const verified = await verifyWorkerLaunchContext(candidate.artifactDir);
          if (verified.context.contextId !== candidate.contextId || Date.parse(verified.receipt.createdAt) > cutoff) {
            throw new DrwnError("LAUNCH_CONTEXT_DRIFT", `Worker launch context changed before prune: ${candidate.artifactDir}`);
          }
          const parent = dirname(candidate.artifactDir);
          const quarantine = join(parent, `.prune-${candidate.contextId}-${randomBytes(8).toString("hex")}`);
          await input.checkpoint?.("before-rename");
          await rename(candidate.artifactDir, quarantine);
          await syncDirectory(parent);
          await input.checkpoint?.("after-rename");
          await rm(quarantine, { recursive: true, force: false });
          await syncDirectory(parent);
          removed.push(candidate.contextId!);
        });
      }
    }
    return {
      schema: "drwn.worker-launch-context-prune" as const,
      schemaVersion: 1 as const,
      execute: input.execute,
      olderThanMs: input.olderThanMs,
      candidates: candidates.length,
      candidateIds: candidates.map((item) => item.contextId!),
      removed,
      retained: inventory.contexts.length - removed.length,
      warnings: candidates.some((item) => item.state === "current")
        ? ["Current contexts may belong to live agents; Darwinian Worker does not inspect Herdr bindings."]
        : [],
    };
  };
  return run();
}
