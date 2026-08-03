// ABOUTME: Implements standalone skill package inventory lifecycle commands.
// ABOUTME: Rejects retired per-skill activation in favor of machine Worker Blueprints.

import { Option, UsageError } from "clipanion";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStoreInitialized } from "../../core/card-store";
import {
  assertInventoryUnreferenced,
  scanInventoryReferenceReport,
  withLockedInventoryReferenceReport,
  type InventoryReferenceReport,
} from "../../core/inventory-references";
import {
  findStandaloneSkillPackageByName,
  findStandaloneSkillPackageBySkillId,
  listStandaloneSkillPackages,
} from "../../core/inventory";
import { listLibrarySkills } from "../../core/library";
import { renderJson, renderTable } from "../../core/output";
import {
  classifySkillAddInput,
  hashSkillPackageDirectory,
  installLooseSkill,
  installSkillPackage,
  uninstallSkillPackage,
  updateLooseSkill,
  updateSkillPackage,
  type ExistingSkillRecord,
} from "../../core/skill-packages";
import type { BundleManifest, BundleSkillEntry } from "../../core/types";
import { BaseCommand } from "../base";

interface LooseSkillFlags {
  as?: string;
  scope?: BundleSkillEntry["scope"];
  packageName?: string;
  version?: string;
}

async function currentSkillRecords(command: BaseCommand, excludePackage?: string) {
  const inventory = await listLibrarySkills(command.context.repoRoot, command.context.agentsDir, command.context.homeDir);
  const filtered = excludePackage ? inventory.filter((skill) => skill.sourceId !== excludePackage) : inventory;
  return {
    names: new Set(filtered.map((skill) => skill.id)),
    records: filtered.map((skill) => ({
      name: skill.id,
      sourceType: skill.source === "npm" ? "npm" as const : "repo" as const,
      sourceId: skill.sourceId,
    } satisfies ExistingSkillRecord)),
  };
}

function validateSourceFlags(source: string, flags: LooseSkillFlags, updating: boolean) {
  const kind = classifySkillAddInput(source);
  if (kind === "package-spec" && (flags.as || flags.scope || flags.packageName || flags.version)) {
    throw new UsageError("--as, --scope, --package-name, and --version apply only to loose SKILL.md sources.");
  }
  if (updating && flags.packageName) {
    throw new UsageError("Update package identity comes from the positional package name; --package-name is install-only.");
  }
  if (updating && kind === "loose-skill" && !flags.version) {
    throw new UsageError("Updating a loose synthetic package requires an explicit --version.");
  }
  return kind;
}

async function previewSource(options: {
  command: BaseCommand;
  source: string;
  flags: LooseSkillFlags;
  updatePackage?: string;
}) {
  const temporary = await mkdtemp(join(tmpdir(), "drwn-machine-skill-preview-"));
  try {
    const agentsDir = join(temporary, ".agents");
    const current = await currentSkillRecords(options.command, options.updatePackage);
    const kind = validateSourceFlags(options.source, options.flags, Boolean(options.updatePackage));
    const installed = kind === "loose-skill"
      ? await installLooseSkill({
          agentsDir,
          sourcePath: options.source,
          existingSkillNames: current.names,
          existingSkills: current.records,
          as: options.flags.as,
          scope: options.flags.scope,
          packageName: options.updatePackage ?? options.flags.packageName,
          version: options.flags.version,
        })
      : await installSkillPackage({
          agentsDir,
          packageSpec: options.source,
          existingSkillNames: current.names,
          existingSkills: current.records,
        });
    if (options.updatePackage && installed.packageName !== options.updatePackage) {
      throw new UsageError(`Update source package is ${installed.packageName}; expected ${options.updatePackage}`);
    }
    return {
      packageName: installed.packageName,
      version: installed.activeVersion,
      manifest: installed.manifest,
      integrity: await hashSkillPackageDirectory(installed.versionRoot),
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

abstract class SkillJsonCommand extends BaseCommand {
  json = Option.Boolean("--json", false);

  protected output(payload: unknown, human: string) {
    this.context.stdout.write(this.json ? renderJson(payload) : `${human}\n`);
    return 0;
  }
}

export class MachineSkillListCommand extends SkillJsonCommand {
  static override paths = [["machine", "skill", "list"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "List repository skills and standalone skill packages.",
    details: "Lists typed package and skill inventory entries. Inventory is inactive unless a released Card providing the skill belongs to the active machine Worker closure.",
    examples: [["List as JSON", "drwn machine skill list --json"]],
  });

  async execute() {
    const packages = await listStandaloneSkillPackages(this.context.agentsDir);
    const skills = await listLibrarySkills(this.context.repoRoot, this.context.agentsDir, this.context.homeDir);
    const entries = [
      ...packages.map((entry) => ({ ...entry, owner: "standalone" as const })),
      ...skills.map((skill) => ({
        kind: "skill" as const,
        id: skill.id,
        owner: skill.source === "npm" ? "standalone" as const : "repository" as const,
        packageName: skill.sourceId,
        version: skill.sourceVersion,
        scope: skill.scope,
        activation: "inventory-only" as const,
      })),
    ];
    if (this.json) return this.output(entries, "");
    if (entries.length === 0) return this.output(entries, "No machine skills available.");
    this.context.stdout.write(renderTable(
      ["kind", "id", "owner", "scope", "activation"],
      entries.map((entry) => entry.kind === "skill-package"
        ? [entry.kind, entry.packageName, entry.owner, "-", "-"]
        : [entry.kind, entry.id, entry.owner, entry.scope, entry.activation]),
    ));
    return 0;
  }
}

abstract class SkillSelectorCommand extends SkillJsonCommand {
  skillId = Option.String({ required: false });
  packageName = Option.String("--package");

  protected requireSelector() {
    if (Boolean(this.skillId) === Boolean(this.packageName)) {
      throw new UsageError("Provide exactly one <skill-id> or --package <package-name>.");
    }
    return this.packageName
      ? { kind: "package" as const, id: this.packageName }
      : { kind: "skill" as const, id: this.skillId! };
  }
}

export class MachineSkillShowCommand extends SkillSelectorCommand {
  static override paths = [["machine", "skill", "show"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Show one exported skill or one standalone package.",
    details: "Use <skill-id> for exported skill identity or --package <package-name> for package identity. Lookup never guesses between them.",
    examples: [["Show a skill", "drwn machine skill show brainstorming"], ["Show a package", "drwn machine skill show --package @acme/toolkit"]],
  });

  async execute() {
    const selector = this.requireSelector();
    if (selector.kind === "package") {
      const record = await findStandaloneSkillPackageByName(this.context.agentsDir, selector.id);
      if (!record) throw new UsageError(`Standalone skill package is not installed: ${selector.id}`);
      return this.output(record, `${record.packageName}@${record.activeVersion}: ${record.exportedSkillIds.join(", ")}`);
    }
    const skill = (await listLibrarySkills(this.context.repoRoot, this.context.agentsDir, this.context.homeDir))
      .find((entry) => entry.id === selector.id);
    if (!skill) throw new UsageError(`Machine skill is not available: ${selector.id}`);
    const record = {
      kind: "skill" as const,
      id: skill.id,
      owner: skill.source === "npm" ? "standalone" as const : "repository" as const,
      packageName: skill.sourceId,
      version: skill.sourceVersion,
      scope: skill.scope,
      path: skill.path,
    };
    return this.output(record, `${record.id} (${record.owner}, ${record.scope})`);
  }
}

export class MachineSkillReferencesCommand extends SkillSelectorCommand {
  static override paths = [["machine", "skill", "references"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Report known project references to a standalone skill or package.",
    details: "Use <skill-id> or --package <package-name>. Repeated --project roots extend the declared known scan scope.",
    examples: [["Inspect package references", "drwn machine skill references --package @acme/toolkit --project ./consumer --json"]],
  });
  projects = Option.Array("--project", []);

  async execute() {
    const selector = this.requireSelector();
    const resource = selector.kind === "package"
      ? await findStandaloneSkillPackageByName(this.context.agentsDir, selector.id)
      : await findStandaloneSkillPackageBySkillId(this.context.agentsDir, selector.id);
    if (!resource) throw new UsageError(`Standalone skill ${selector.kind} is not installed: ${selector.id}`);
    const ids = selector.kind === "package" ? resource.exportedSkillIds : [selector.id];
    const report = await scanInventoryReferenceReport({
      agentsDir: this.context.agentsDir,
      skillIds: ids,
      projectRoots: this.projects,
    });
    const payload = {
      resource: selector.kind === "package"
        ? { kind: "skill-package", packageName: resource.packageName, exportedSkillIds: resource.exportedSkillIds }
        : { kind: "skill", id: selector.id, packageName: resource.packageName },
      ...report,
    };
    return this.output(payload, `${report.references.length} known reference(s) across ${report.scope.projectRoots.length} project root(s).`);
  }
}

abstract class SkillSourceCommand extends SkillJsonCommand {
  as = Option.String("--as");
  scope = Option.String("--scope");
  version = Option.String("--version");
  dryRun = Option.Boolean("--dry-run", false);

  protected flags(packageName?: string): LooseSkillFlags {
    return {
      as: this.as,
      scope: this.scope as BundleSkillEntry["scope"] | undefined,
      packageName,
      version: this.version,
    };
  }
}

export class MachineSkillInstallCommand extends SkillSourceCommand {
  static override paths = [["machine", "skill", "install"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Install an inactive standalone skill package.",
    details: "Installs <source>. Loose skills accept --as, --scope, --package-name, and --version. Package sources reject those flags. --dry-run leaves no managed state.",
    examples: [["Install a package", "drwn machine skill install @acme/toolkit"], ["Preview a loose skill", "drwn machine skill install ./SKILL.md --as local-tool --dry-run"]],
  });
  source = Option.String({ required: true });
  packageName = Option.String("--package-name");

  async execute() {
    const flags = this.flags(this.packageName);
    const kind = validateSourceFlags(this.source, flags, false);
    if (this.dryRun) {
      const preview = await previewSource({ command: this, source: this.source, flags });
      return this.output({ action: "would-install", ...preview, exportedSkillIds: preview.manifest.skills.map((skill) => skill.name).sort(), activation: "inventory-only" }, `Would install ${preview.packageName}@${preview.version} as inventory only.`);
    }
    await ensureStoreInitialized(this.context.agentsDir);
    const current = await currentSkillRecords(this);
    const installed = kind === "loose-skill"
      ? await installLooseSkill({
          agentsDir: this.context.agentsDir,
          sourcePath: this.source,
          existingSkillNames: current.names,
          existingSkills: current.records,
          ...flags,
        })
      : await installSkillPackage({
          agentsDir: this.context.agentsDir,
          packageSpec: this.source,
          existingSkillNames: current.names,
          existingSkills: current.records,
        });
    return this.output({
      action: "installed",
      packageName: installed.packageName,
      version: installed.activeVersion,
      exportedSkillIds: installed.manifest.skills.map((skill) => skill.name).sort(),
      activation: "inventory-only",
    }, `Installed ${installed.packageName}@${installed.activeVersion} as inventory only.`);
  }
}

export class MachineSkillUpdateCommand extends SkillSourceCommand {
  static override paths = [["machine", "skill", "update"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Update one standalone package through an immutable version.",
    details: "Updates <package-name> from --from <source>. Loose sources accept --as, --scope, and explicit --version. Repeated --project roots extend reference discovery.",
    examples: [["Update a package", "drwn machine skill update @acme/toolkit --from @acme/toolkit@2.0.0 --project ./consumer"]],
  });
  packageName = Option.String({ required: true });
  source = Option.String("--from", { required: true });
  projects = Option.Array("--project", []);

  async execute() {
    const existing = await findStandaloneSkillPackageByName(this.context.agentsDir, this.packageName);
    if (!existing) throw new UsageError(`Standalone skill package is not installed: ${this.packageName}`);
    const flags = this.flags();
    const kind = validateSourceFlags(this.source, flags, true);
    if (this.dryRun) {
      const preview = await previewSource({ command: this, source: this.source, flags, updatePackage: this.packageName });
      const nextIds = preview.manifest.skills.map((skill) => skill.name).sort();
      const removedIds = existing.exportedSkillIds.filter((id) => !nextIds.includes(id));
      const report = await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir, skillIds: existing.exportedSkillIds, projectRoots: this.projects });
      assertInventoryUnreferenced(this.packageName, removedIds, report.references.filter((reference) => removedIds.includes(reference.id)));
      if (preview.version === existing.activeVersion && preview.integrity !== existing.integrity) {
        throw new UsageError(`Skill package ${this.packageName}@${preview.version} already exists with different immutable bytes.`);
      }
      const action = preview.version === existing.activeVersion && preview.integrity === existing.integrity ? "no-op" : "would-update";
      return this.output({ action, packageName: this.packageName, fromVersion: existing.activeVersion, toVersion: preview.version, exportedSkillIds: nextIds, ...report }, `${action === "no-op" ? "No change for" : "Would update"} ${this.packageName}@${preview.version}.`);
    }

    const current = await currentSkillRecords(this);
    let report: InventoryReferenceReport | null = null;
    let noOp = false;
    const beforeCommit = async ({ manifest, integrity, previous, previousIntegrity }: {
      manifest: BundleManifest;
      integrity: `sha256-${string}`;
      previous: { activeVersion: string; manifest: BundleManifest } | null;
      previousIntegrity: `sha256-${string}` | null;
    }) => {
      const previousIds = previous?.manifest.skills.map((skill) => skill.name).sort() ?? [];
      const nextIds = manifest.skills.map((skill) => skill.name).sort();
      const removedIds = previousIds.filter((id) => !nextIds.includes(id));
      await withLockedInventoryReferenceReport({
        agentsDir: this.context.agentsDir,
        skillIds: previousIds,
        projectRoots: this.projects,
      }, async (lockedReport) => {
        report = lockedReport;
        assertInventoryUnreferenced(this.packageName, removedIds, lockedReport.references.filter((reference) => removedIds.includes(reference.id)));
      });
      noOp = previous?.activeVersion === manifest.version && previousIntegrity === integrity;
    };
    const updated = kind === "loose-skill"
      ? await updateLooseSkill({
          agentsDir: this.context.agentsDir,
          sourcePath: this.source,
          packageName: this.packageName,
          existingSkillNames: current.names,
          existingSkills: current.records,
          as: flags.as,
          scope: flags.scope,
          version: flags.version,
          beforeCommit,
        })
      : await updateSkillPackage({
          agentsDir: this.context.agentsDir,
          packageName: this.packageName,
          packageSpec: this.source,
          existingSkillNames: current.names,
          existingSkills: current.records,
          beforeCommit,
        });
    return this.output({
      action: noOp ? "no-op" : "updated",
      packageName: this.packageName,
      fromVersion: existing.activeVersion,
      toVersion: updated.activeVersion,
      exportedSkillIds: updated.manifest.skills.map((skill) => skill.name).sort(),
      ...(report ?? await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir })),
    }, `${noOp ? "No change for" : "Updated"} ${this.packageName}@${updated.activeVersion}.`);
  }
}

export class MachineSkillUninstallCommand extends SkillJsonCommand {
  static override paths = [["machine", "skill", "uninstall"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Uninstall one unreferenced standalone skill package.",
    details: "Uninstalls <package-name> only after known project references are empty. Repeated --project roots extend the scan; there is no force bypass.",
    examples: [["Preview uninstall", "drwn machine skill uninstall @acme/toolkit --project ./consumer --dry-run"]],
  });
  packageName = Option.String({ required: true });
  projects = Option.Array("--project", []);
  dryRun = Option.Boolean("--dry-run", false);

  async execute() {
    const existing = await findStandaloneSkillPackageByName(this.context.agentsDir, this.packageName);
    if (!existing) throw new UsageError(`Standalone skill package is not installed: ${this.packageName}`);
    if (this.dryRun) {
      const report = await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir, skillIds: existing.exportedSkillIds, projectRoots: this.projects });
      assertInventoryUnreferenced(this.packageName, existing.exportedSkillIds, report.references);
      return this.output({ action: "would-uninstall", packageName: this.packageName, exportedSkillIds: existing.exportedSkillIds, ...report }, `Would uninstall ${this.packageName}.`);
    }
    return withLockedInventoryReferenceReport({
      agentsDir: this.context.agentsDir,
      skillIds: existing.exportedSkillIds,
      projectRoots: this.projects,
    }, async (report) => {
      assertInventoryUnreferenced(this.packageName, existing.exportedSkillIds, report.references);
      const removed = await uninstallSkillPackage(this.context.agentsDir, this.packageName);
      return this.output({ action: "uninstalled", ...removed, ...report }, `Uninstalled ${this.packageName}.`);
    });
  }
}

abstract class MachineSkillSelectionCommand extends SkillJsonCommand {
  skillId = Option.String({ required: true });
  dryRun = Option.Boolean("--dry-run", false);

  protected setEnabled(_enabled: boolean): never {
    throw new UsageError(
      "Direct machine skill activation was removed. Select a Worker Blueprint with `drwn apply --root <blueprint-ref>` or switch an installed Blueprint with `drwn use --root <blueprint-ref>`.",
    );
  }
}

export class MachineSkillEnableCommand extends MachineSkillSelectionCommand {
  static override paths = [["machine", "skill", "enable"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Explain the replacement for retired direct machine skill activation.",
    details: "Always exits nonzero. Machine skills come only from the active Worker Blueprint closure.",
    examples: [["Select a Worker Blueprint instead", "drwn apply --root <blueprint-ref>"]],
  });
  execute() { return this.setEnabled(true); }
}

export class MachineSkillDisableCommand extends MachineSkillSelectionCommand {
  static override paths = [["machine", "skill", "disable"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Explain the replacement for retired direct machine skill deactivation.",
    details: "Always exits nonzero. Change or clear the selected machine Worker Blueprint instead.",
    examples: [["Switch the active Worker Blueprint instead", "drwn use --root <blueprint-ref>"]],
  });
  execute() { return this.setEnabled(false); }
}
