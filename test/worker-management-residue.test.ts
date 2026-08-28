// ABOUTME: Enforces the Deployed Worker management hard cut across active cloud command source.
// ABOUTME: Legacy paths remain only in the frozen negative contract and explicit 410 rejection boundary.

import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const removedFiles = [
  "cli/core/worker-config.ts",
  "cli/core/worker-http.ts",
  "cli/core/worker-error.ts",
  "cli/core/worker-run.ts",
  "cli/core/worker-secrets.ts",
  "cli/commands/worker/delete.ts",
];
const cloudCommands = [
  "worker.ts", "register.ts", "use.ts", "list.ts", "status.ts", "deploy.ts",
  "deployments.ts", "rollback.ts", "secret-set.ts", "chat.ts", "run-status.ts", "retire.ts",
];
const forbidden = [
  ["/api/", "minds"].join(""),
  "/api/deployments",
  ["mind", "Id"].join(""),
  ["mind", "_id"].join(""),
  "fetchWithWorkerAuth",
  "fetchJsonWithWorkerAuth",
  "resolveWorkerConfig",
  "describeWorkerError",
  "pollRunOnce",
  [".drwn", ".secrets"].join(""),
  ["DRWN_", "STU", "DIO_"].join(""),
  ["I", "MINDS_"].join(""),
];

test("active Worker management has no Mind-era adapter, selector, or transport residue", () => {
  for (const path of removedFiles) expect(existsSync(join(root, path)), path).toBe(false);
  for (const file of cloudCommands) {
    const path = join(root, "cli", "commands", "worker", file);
    const source = readFileSync(path, "utf8");
    for (const value of forbidden) expect(source.includes(value), `${file}: ${value}`).toBe(false);
  }
  const index = readFileSync(join(root, "cli", "index.ts"), "utf8");
  expect(index).not.toContain("WorkerDeleteCommand");
  expect(index).not.toContain("commands/worker/delete");
});

test("only the pinned negative contract and explicit path rejection retain the removed server path", () => {
  const allowed = new Set([
    "registry/contracts/deployed-worker.v1/contract.json",
    "cli/core/management/routes.ts",
    "test/management-contract-conformance.test.ts",
    "test/commands-worker-management-read.test.ts",
    "test/commands-worker-deploy.test.ts",
    "test/commands-worker-chat.test.ts",
    "test/worker-management-residue.test.ts",
  ]);
  const paths: string[] = [];
  const scan = (relative: string): void => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const child = join(relative, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) scan(child);
      else if (entry.isFile() && readFileSync(join(root, child)).includes(["/api/", "minds"].join(""))) paths.push(child);
    }
  };
  for (const directory of ["cli", "registry", "test"]) scan(directory);
  expect(paths.filter((path) => !allowed.has(path))).toEqual([]);
});
