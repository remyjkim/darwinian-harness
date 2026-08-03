// ABOUTME: Defines the one exact recommended machine Worker Blueprint descriptor.
// ABOUTME: Validates immutable root coordinates and the resolved plain-Card closure.

import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { CardLockEntry, WorkerRootLockEntry } from "./card-lock";
import { DrwnError } from "./errors";
import { resolveMachineWorkersRegistryPath } from "./paths";

export const RECOMMENDED_MACHINE_WORKER = {
  id: "machine-defaults",
  displayName: "Recommended Machine Defaults",
  source: "git+https://github.com/curation-labs/machine-defaults.git#v1.0.0",
  name: "@curation-labs/machine-defaults",
  version: "1.0.0",
  minDrwnVersion: "1.1.0",
  commit: "43b264499c9d9ec568b87d0230a7a7a6791f5966",
  treeSha: "4a66b442e8b32561513adfc3c7413b758b156ff5",
  integrity: "sha256-f5052855aff4d75579c88600cd0c319fd0c46d48d847f961ed8357f64bad7e50",
  members: [
    {
      name: "@darwinian/operator",
      source: "git+https://github.com/curation-labs/darwinian-operator.git#v2.0.1",
    },
    {
      name: "@curation-labs/workflow-skills",
      source: "git+https://github.com/curation-labs/cl-workflow-card.git#v1.0.1",
    },
    {
      name: "@remyjkim/knowledge-docs",
      source: "git+https://github.com/remyjkim/knowledge-docs-card.git#v1.0.0",
    },
    {
      name: "@remyjkim/personal-harness",
      source: "git+https://github.com/remyjkim/personal-harness-card.git#v0.1.0",
    },
  ],
} as const;

export const MACHINE_WORKER_REGISTRY = {
  schema: "drwn.machine-workers",
  schemaVersion: 1,
  workers: [RECOMMENDED_MACHINE_WORKER],
} as const;

const immutableGitReleaseRef = z.string().regex(
  /^git\+https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git#v\d+\.\d+\.\d+$/,
  "must be an exact HTTPS Git semver tag",
);

const memberSchema = z.object({
  name: z.string().min(1),
  source: immutableGitReleaseRef,
}).strict();

const descriptorSchema = z.object({
  id: z.literal(RECOMMENDED_MACHINE_WORKER.id),
  displayName: z.literal(RECOMMENDED_MACHINE_WORKER.displayName),
  source: immutableGitReleaseRef,
  name: z.literal(RECOMMENDED_MACHINE_WORKER.name),
  version: z.literal(RECOMMENDED_MACHINE_WORKER.version),
  minDrwnVersion: z.literal(RECOMMENDED_MACHINE_WORKER.minDrwnVersion),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  treeSha: z.string().regex(/^[a-f0-9]{40}$/),
  integrity: z.string().regex(/^sha256-[a-f0-9]{64}$/),
  members: z.array(memberSchema).length(RECOMMENDED_MACHINE_WORKER.members.length),
}).strict();

const registrySchema = z.object({
  schema: z.literal("drwn.machine-workers"),
  schemaVersion: z.literal(1),
  workers: z.array(descriptorSchema).length(1),
}).strict();

export type MachineWorkerDescriptor = z.infer<typeof descriptorSchema>;
export type MachineWorkerRegistry = z.infer<typeof registrySchema>;

function invalid(message: string, cause?: unknown): never {
  throw new DrwnError("MACHINE_WORKER_INVALID", message, undefined, cause);
}

export function parseMachineWorkerRegistry(value: unknown): MachineWorkerRegistry {
  const parsed = registrySchema.safeParse(value);
  if (!parsed.success) {
    invalid(
      `Invalid machine Worker registry: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
      parsed.error,
    );
  }
  if (!isDeepStrictEqual(parsed.data, MACHINE_WORKER_REGISTRY)) {
    invalid("Machine Worker registry must deep-equal the released recommended Blueprint contract");
  }
  return parsed.data;
}

export async function loadMachineWorkerRegistry(repoRoot: string): Promise<MachineWorkerRegistry> {
  const path = resolveMachineWorkersRegistryPath(repoRoot);
  try {
    return parseMachineWorkerRegistry(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    invalid(`Cannot read machine Worker registry at ${path}`, error);
  }
}

type ContractRoot = Pick<WorkerRootLockEntry, "name" | "requested" | "kind" | "members">;
type ContractCard = Pick<
  CardLockEntry,
  "name" | "requested" | "version" | "integrity" | "treeSha" | "manifest" | "git"
>;

export function assertRecommendedMachineWorkerGraph(graph: {
  roots: ContractRoot[];
  cards: ContractCard[];
}): void {
  const descriptor = RECOMMENDED_MACHINE_WORKER;
  const expectedMembers = descriptor.members.map((member) => member.name);
  const root = graph.roots[0];
  if (graph.roots.length !== 1 || !root || !isDeepStrictEqual(root, {
    name: descriptor.name,
    requested: descriptor.source,
    kind: "blueprint",
    members: expectedMembers,
  })) {
    invalid("Recommended machine Worker must resolve as the exact single Blueprint root");
  }

  const expectedNames = [descriptor.name, ...expectedMembers];
  if (!isDeepStrictEqual(graph.cards.map((card) => card.name), expectedNames)) {
    invalid("Recommended machine Worker closure does not contain the exact ordered Card set");
  }

  const rootCard = graph.cards[0]!;
  if (
    rootCard.requested !== descriptor.source ||
    rootCard.version !== descriptor.version ||
    rootCard.integrity !== descriptor.integrity ||
    rootCard.treeSha !== descriptor.treeSha ||
    rootCard.git?.commit !== descriptor.commit ||
    rootCard.git?.ref !== `v${descriptor.version}` ||
    rootCard.manifest.kind !== "blueprint" ||
    !isDeepStrictEqual(rootCard.manifest.composedFrom, descriptor.members.map((member) => member.source)) ||
    rootCard.manifest.harness?.minVersion !== descriptor.minDrwnVersion
  ) {
    invalid("Recommended machine Worker root coordinates or manifest changed");
  }

  descriptor.members.forEach((member, index) => {
    const card = graph.cards[index + 1];
    const tag = member.source.split("#v")[1]!;
    const [url] = member.source.slice(4).split("#");
    if (
      !card ||
      card.name !== member.name ||
      card.requested !== member.source ||
      card.version !== tag ||
      card.manifest.kind === "blueprint" ||
      card.git?.url !== url ||
      card.git?.ref !== `v${tag}`
    ) {
      invalid(`Recommended machine Worker member ${member.name} was substituted or is not a plain released Card`);
    }
  });
}
