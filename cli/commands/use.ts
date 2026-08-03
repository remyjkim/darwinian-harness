// ABOUTME: Selects one installed Worker root or installs and selects a new root.
// ABOUTME: Commits project intent before optional one-way downstream projection.

import { Option } from "clipanion";
import { useProjectWorker } from "../core/worker-project";
import { useMachineWorker } from "../core/worker-machine";
import { registerProject } from "../core/project-registry";
import { BaseCommand } from "./base";
import {
  renderMachineWorkerMutation,
  renderWorkerMutation,
  requireProjectRoot,
  runChainedWrite,
} from "./card/project-command";

export class UseCommand extends BaseCommand {
  static override paths = [["use"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Select one project Worker, or one machine Blueprint with --root.",
    details: `
      Selects an installed Worker root by name, or installs a new root additively
      from a ref. Project intent commits before downstream projection begins.
    `,
    examples: [
      ["Select or install a Worker", "drwn use @me/backend@^1.0.0"],
      ["Clear the active Worker", "drwn use --none"],
    ],
  });

  ref = Option.String({ required: false });
  root = Option.Boolean("--root", false, { description: "Mutate machine Worker Blueprint selection." });
  none = Option.Boolean("--none", false, { description: "Clear selection without removing installed roots." });
  noWrite = Option.Boolean("--no-write", false, { description: "Commit selection without projecting downstream files." });
  dryRun = Option.Boolean("--dry-run", false, { description: "Preview without writing." });

  async execute() {
    try {
      if (this.none === Boolean(this.ref)) {
        this.context.stderr.write("Provide exactly one Worker ref or --none.\n");
        return 1;
      }
      if (this.root) {
        const mutation = await useMachineWorker(this.context.agentsDir, this.none ? null : this.ref!, {
          repoRoot: this.context.repoRoot,
          cwd: this.context.cwd,
          dryRun: this.dryRun,
        });
        this.context.stdout.write(renderMachineWorkerMutation(mutation));
        if (this.dryRun) {
          if (!this.noWrite) this.context.stdout.write("Would run drwn write --root after committing machine state.\n");
          return 0;
        }
        if (this.noWrite) return 0;
        const exitCode = await runChainedWrite(this, { machine: true });
        if (exitCode !== 0) {
          this.context.stderr.write("Machine Worker selection remains persisted; fix the projection error and run drwn write --root again.\n");
        }
        return exitCode;
      }
      const projectRoot = requireProjectRoot(this);
      const mutation = await useProjectWorker(projectRoot, this.context.agentsDir, this.none ? null : this.ref!, {
        repoRoot: this.context.repoRoot,
        cwd: this.context.cwd,
        dryRun: this.dryRun,
      });
      this.context.stdout.write(renderWorkerMutation(mutation));
      if (this.dryRun) {
        if (!this.noWrite) this.context.stdout.write("Would run drwn write after committing project state.\n");
        return 0;
      }
      await registerProject(this.context.agentsDir, projectRoot);
      if (this.noWrite) return 0;
      const exitCode = await runChainedWrite(this);
      if (exitCode !== 0) {
        this.context.stderr.write("Worker selection remains persisted; fix the projection error and run drwn write again.\n");
      }
      return exitCode;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
