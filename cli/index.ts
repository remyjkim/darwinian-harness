#!/usr/bin/env bun
// ABOUTME: CLI entrypoint that creates the Clipanion application and runs it.
// ABOUTME: All command registration starts here; reusable logic lives outside the command layer.

import { Builtins, Cli } from "clipanion";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AddMcpCommand } from "./commands/add/mcp";
import { AddSkillCommand } from "./commands/add/skill";
import { AnalyzeSessionsCommand } from "./commands/analyze/sessions";
import { LoginCommand } from "./commands/auth/login";
import { LogoutCommand } from "./commands/auth/logout";
import { WhoamiCommand } from "./commands/auth/whoami";
import { CardAuditCommand } from "./commands/card/audit";
import { CardCatalogPublishCommand } from "./commands/card/catalog-publish";
import { CardDeprecateCommand } from "./commands/card/deprecate";
import { CardDiffCommand } from "./commands/card/diff";
import { CardFetchCommand } from "./commands/card/fetch";
import { CardForkCommand } from "./commands/card/fork";
import { CardLinkCommand } from "./commands/card/link";
import { CardReleaseCommand } from "./commands/card/release";
import { CardUnlinkCommand } from "./commands/card/unlink";
import { DevCommand } from "./commands/dev";
import { UpCommand } from "./commands/up";
import { UseCommand } from "./commands/use";
import { CardMetaShowCommand } from "./commands/card/meta";
import { CardListCommand } from "./commands/card/list";
import { CardCloneCommand } from "./commands/card/clone";
import { CardNewCommand } from "./commands/card/new";
import { CardOutdatedCommand } from "./commands/card/outdated";
import { CardPushCommand } from "./commands/card/push";
import { CardPublishCommand } from "./commands/card/publish";
import {
  CardRemoteAddCommand,
  CardRemoteListCommand,
  CardRemoteRemoveCommand,
  CardRemoteSetCommand,
} from "./commands/card/remote";
import { CardShowCommand } from "./commands/card/show";
import { CardSourceAddMcpCommand } from "./commands/card/source/add-mcp";
import { CardSourceAddBeliefCommand } from "./commands/card/source/add-belief";
import { CardSourceAddHookCommand } from "./commands/card/source/add-hook";
import { CardSourceAddPersonaCommand } from "./commands/card/source/add-persona";
import { CardSourceAddSkillCommand } from "./commands/card/source/add-skill";
import { CardSourceDoctorCommand } from "./commands/card/source/doctor";
import { CardSourceSyncCommand } from "./commands/card/source/sync";
import { CardSourceListCommand } from "./commands/card/source/list";
import { CardSourceRemoveMcpCommand } from "./commands/card/source/remove-mcp";
import { CardSourceRemoveBeliefCommand } from "./commands/card/source/remove-belief";
import { CardSourceRemoveHookCommand } from "./commands/card/source/remove-hook";
import { CardSourceRemovePersonaCommand } from "./commands/card/source/remove-persona";
import { CardSourceRemoveSkillCommand } from "./commands/card/source/remove-skill";
import { CardSourceSetCommand } from "./commands/card/source/set";
import { CardSourceShowCommand } from "./commands/card/source/show";
import { CardStatusCommand } from "./commands/card/status";
import { CardTrustCommand } from "./commands/card/trust";
import { ProjectAddCommand } from "./commands/project/add";
import { ProjectApplyCommand } from "./commands/project/apply";
import { ProjectRemoveCommand } from "./commands/project/remove";
import { ProjectPinCommand } from "./commands/project/pin";
import { ProjectUpdateCommand } from "./commands/project/update";
import { CardUntrustCommand } from "./commands/card/untrust";
import { CardValidateCommand } from "./commands/card/validate";
import { CatalogValidateCommand } from "./commands/catalog/validate";
import { WorkerCommand } from "./commands/worker/worker";
import { WorkerNewCommand } from "./commands/worker/new";
import { WorkerComposeCommand } from "./commands/worker/compose";
import { WorkerPublishCommand } from "./commands/worker/publish";
import { WorkerDeleteCommand } from "./commands/worker/delete";
import { WorkerDeployCommand } from "./commands/worker/deploy";
import { WorkerDeploymentsCommand } from "./commands/worker/deployments";
import { WorkerChatCommand } from "./commands/worker/chat";
import { WorkerRunStatusCommand } from "./commands/worker/run-status";
import { WorkerListCommand } from "./commands/worker/list";
import { WorkerRollbackCommand } from "./commands/worker/rollback";
import { WorkerStatusCommand } from "./commands/worker/status";
import { DoctorCommand } from "./commands/doctor";
import { HookCardUsageCommand } from "./commands/hook/card-usage";
import { HookSkillMarkerCommand } from "./commands/hook/skill-marker";
import { ProjectsListCommand, ProjectsUnregisterCommand, ProjectsUpdateCommand } from "./commands/projects";
import { InitCommand } from "./commands/init";
import { InstallCommand } from "./commands/install";
import { createAgentsContext, validateRepoRoot } from "./context";
import { ExtensionsAddCommand } from "./commands/extensions/add";
import { ExtensionsDoctorCommand } from "./commands/extensions/doctor";
import { ExtensionsListCommand } from "./commands/extensions/list";
import { ExtensionsSetupCommand } from "./commands/extensions/setup";
import { ExtensionsShowCommand } from "./commands/extensions/show";
import { ExtensionsStatusCommand } from "./commands/extensions/status";
import {
  CatalogAddCommand,
  CatalogListCommand,
  CatalogRefreshCommand,
  CatalogRemoveCommand,
} from "./commands/catalog/manage";
import { McpListCommand } from "./commands/mcp/list";
import { McpWriteCommand } from "./commands/mcp/write";
import {
  MachineSkillDisableCommand,
  MachineSkillEnableCommand,
  MachineSkillInstallCommand,
  MachineSkillListCommand,
  MachineSkillReferencesCommand,
  MachineSkillShowCommand,
  MachineSkillUninstallCommand,
  MachineSkillUpdateCommand,
} from "./commands/machine/skill";
import {
  MachineMcpAddCommand,
  MachineMcpDisableCommand,
  MachineMcpEnableCommand,
  MachineMcpListCommand,
  MachineMcpReferencesCommand,
  MachineMcpRemoveCommand,
  MachineMcpShowCommand,
  MachineMcpUpdateCommand,
} from "./commands/machine/mcp";
import {
  MachineInventoryBundleCommand,
  MachineInventoryExportCommand,
  MachineInventoryGcCommand,
  MachineInventorySyncCommand,
  MachineInventoryVerifyCommand,
} from "./commands/machine/inventory";
import { WorkerMindCommand } from "./commands/worker/mind/mind";
import { WorkerMindProvisionCommand } from "./commands/worker/mind/provision";
import { WorkerMindStatusCommand } from "./commands/worker/mind/status";
import { WorkerMindDoctorCommand } from "./commands/worker/mind/doctor";
import { WorkerMindPoolRetireCommand } from "./commands/worker/mind/pool-retire";
import { WorkerMindSyncCommand } from "./commands/worker/mind/sync";
import { WorkerMindDiffCommand } from "./commands/worker/mind/diff";
import { WorkerMindCheckpointCommand } from "./commands/worker/mind/checkpoint";
import { SearchMcpCommand } from "./commands/search/mcp";
import { SearchCardCommand } from "./commands/search/card";
import { SearchSkillCommand } from "./commands/search/skill";
import { ScanCommand } from "./commands/scan";
import { StatusCommand } from "./commands/status";
import { WriteCommand } from "./commands/write";
import { ExportSessionsCommand } from "./commands/export/sessions";

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as { version?: string };

const cli = new Cli({
  binaryLabel: "drwn",
  binaryName: "drwn",
  binaryVersion: packageJson.version ?? "0.0.0",
});

cli.register(MachineSkillListCommand);
cli.register(MachineSkillShowCommand);
cli.register(MachineSkillReferencesCommand);
cli.register(MachineSkillInstallCommand);
cli.register(MachineSkillUpdateCommand);
cli.register(MachineSkillUninstallCommand);
cli.register(MachineSkillEnableCommand);
cli.register(MachineSkillDisableCommand);
cli.register(MachineMcpListCommand);
cli.register(MachineMcpShowCommand);
cli.register(MachineMcpReferencesCommand);
cli.register(MachineMcpAddCommand);
cli.register(MachineMcpUpdateCommand);
cli.register(MachineMcpRemoveCommand);
cli.register(MachineMcpEnableCommand);
cli.register(MachineMcpDisableCommand);
cli.register(MachineInventoryExportCommand);
cli.register(MachineInventoryVerifyCommand);
cli.register(MachineInventoryBundleCommand);
cli.register(MachineInventorySyncCommand);
cli.register(MachineInventoryGcCommand);
cli.register(AddSkillCommand);
cli.register(AddMcpCommand);
cli.register(ProjectAddCommand);
cli.register(InstallCommand);
cli.register(CardNewCommand);
cli.register(CardAuditCommand);
cli.register(CardPublishCommand);
cli.register(CardCatalogPublishCommand);
cli.register(CardShowCommand);
cli.register(CardSourceListCommand);
cli.register(CardSourceShowCommand);
cli.register(CardSourceDoctorCommand);
cli.register(CardSourceSyncCommand);
cli.register(CardSourceAddSkillCommand);
cli.register(CardSourceRemoveSkillCommand);
cli.register(CardSourceAddHookCommand);
cli.register(CardSourceRemoveHookCommand);
cli.register(CardSourceAddPersonaCommand);
cli.register(CardSourceRemovePersonaCommand);
cli.register(CardSourceAddBeliefCommand);
cli.register(CardSourceRemoveBeliefCommand);
cli.register(CardSourceSetCommand);
cli.register(CardSourceAddMcpCommand);
cli.register(CardSourceRemoveMcpCommand);
cli.register(CardListCommand);
cli.register(CardMetaShowCommand);
cli.register(CardDiffCommand);
cli.register(CardDeprecateCommand);
cli.register(CardRemoteAddCommand);
cli.register(CardRemoteListCommand);
cli.register(CardRemoteSetCommand);
cli.register(CardRemoteRemoveCommand);
cli.register(CardPushCommand);
cli.register(CardFetchCommand);
cli.register(CardCloneCommand);
cli.register(CardForkCommand);
cli.register(CardLinkCommand);
cli.register(CardUnlinkCommand);
cli.register(CardReleaseCommand);
cli.register(CardOutdatedCommand);
cli.register(CardStatusCommand);
cli.register(CardTrustCommand);
cli.register(CardUntrustCommand);
cli.register(CardValidateCommand);
cli.register(CatalogValidateCommand);
cli.register(WorkerCommand);
cli.register(WorkerNewCommand);
cli.register(WorkerComposeCommand);
cli.register(WorkerPublishCommand);
cli.register(WorkerDeployCommand);
cli.register(WorkerListCommand);
cli.register(WorkerStatusCommand);
cli.register(WorkerDeploymentsCommand);
cli.register(WorkerChatCommand);
cli.register(WorkerRunStatusCommand);
cli.register(WorkerRollbackCommand);
cli.register(WorkerDeleteCommand);
cli.register(ProjectApplyCommand);
cli.register(ProjectRemoveCommand);
cli.register(ProjectPinCommand);
cli.register(ProjectUpdateCommand);
cli.register(CatalogListCommand);
cli.register(CatalogAddCommand);
cli.register(CatalogRemoveCommand);
cli.register(CatalogRefreshCommand);
cli.register(SearchSkillCommand);
cli.register(SearchMcpCommand);
cli.register(SearchCardCommand);
cli.register(ExtensionsAddCommand);
cli.register(ExtensionsListCommand);
cli.register(ExtensionsShowCommand);
cli.register(ExtensionsStatusCommand);
cli.register(ExtensionsDoctorCommand);
cli.register(ExtensionsSetupCommand);
cli.register(McpWriteCommand);
cli.register(McpListCommand);
cli.register(WorkerMindCommand);
cli.register(WorkerMindProvisionCommand);
cli.register(WorkerMindStatusCommand);
cli.register(WorkerMindDoctorCommand);
cli.register(WorkerMindPoolRetireCommand);
cli.register(WorkerMindSyncCommand);
cli.register(WorkerMindDiffCommand);
cli.register(WorkerMindCheckpointCommand);
cli.register(WriteCommand);
cli.register(UseCommand);
cli.register(UpCommand);
cli.register(DevCommand);
cli.register(ScanCommand);
cli.register(AnalyzeSessionsCommand);
cli.register(ExportSessionsCommand);
cli.register(StatusCommand);
cli.register(DoctorCommand);
cli.register(InitCommand);
cli.register(ProjectsListCommand);
cli.register(ProjectsUnregisterCommand);
cli.register(ProjectsUpdateCommand);
cli.register(LoginCommand);
cli.register(LogoutCommand);
cli.register(WhoamiCommand);
cli.register(HookCardUsageCommand);
cli.register(HookSkillMarkerCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

const argv = process.argv.slice(2);
// Hooks run inside arbitrary projects (no drwn checkout / env) and must stay silent and
// non-fatal: skip repo-root validation and never write to stderr or set a failing exit code.
const isHookInvocation = argv[0] === "hook";
const context = createAgentsContext();

try {
  if (!isHookInvocation) {
    validateRepoRoot(context.repoRoot);
  }
  await cli.runExit(argv, context);
} catch (error) {
  if (isHookInvocation) {
    process.exitCode = 0;
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
