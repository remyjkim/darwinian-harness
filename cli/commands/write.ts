// ABOUTME: Implements the primary `drwn write` command over the materialization engine.
// ABOUTME: Provides the one-way operator vocabulary for writing effective state downstream.

import { Option, UsageError } from "clipanion";
import { AmbientMcpCollisionError } from "../core/ambient-policy";
import { evaluateVersionFloor, formatVersionFloorWarning, loadCardLock } from "../core/card-lock";
import { assertAmbientMcpPreflight, assertMachineWriteScopeAllowed, buildEffectiveState } from "../core/effective-state";
import {
  buildHookConsentAckKey,
  computeHookPolicyDigest,
  hasHookConsentAck,
  recordHookConsentAck,
} from "../core/hook-consent-ack";
import {
  buildInstructionConsentAckKey,
  hasInstructionConsentAck,
  recordInstructionConsentAck,
} from "../core/instruction-consent-ack";
import {
  isInstructionConsentValid,
  resolveExplicitInstructionContribution,
} from "../core/instruction-contribution";
import { renderJson, renderOptionalMcpReport, renderSyncResult } from "../core/output";
import { DrwnError } from "../core/errors";
import { findProjectConfig, resolveProjectRootFromConfigPath } from "../core/project";
import { syncRepository } from "../core/sync";
import { isTargetName } from "../core/targets";
import { startWriteWatch } from "../core/write-watch";
import { BaseCommand } from "./base";

function renderWriteError(error: unknown, json: boolean) {
  if (error instanceof DrwnError) {
    return json ? renderJson(error.toJSON()) : `${error.code}: ${error.message}\n`;
  }
  if (json && error instanceof AmbientMcpCollisionError) return renderJson(error.toJSON());
  return `${error instanceof Error ? error.message : String(error)}\n`;
}

export class WriteCommand extends BaseCommand {
  static override paths = [["write"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Write effective drwn config to downstream local agent tools.",
    details: `
      Reads effective machine intent or project overlays plus
      extension-derived settings, then materializes it into enabled downstream
      targets such as Claude, Codex, and Cursor.

      Use --dry-run to preview planned changes. Use --mcp-only or --skills-only
      to limit materialization to one surface. Use --target to write one target.
      Use --root to write machine intent to user-scope tool configs even when
      running from inside a drwn-managed project.
    `,
    examples: [
      ["Preview all writes", "drwn write --dry-run"],
      ["Preview user-scope writes", "drwn write --root --dry-run"],
      ["Write only MCP configuration", "drwn write --mcp-only"],
      ["Write only to Claude", "drwn write --target=claude"],
    ],
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview writes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  mcpOnly = Option.Boolean("--mcp-only", false, {
    description: "Write only MCP configuration.",
  });

  skillsOnly = Option.Boolean("--skills-only", false, {
    description: "Write only skills.",
  });

  target = Option.String("--target", {
    description: "Limit write to one target.",
  });

  force = Option.Boolean("--force", false, {
    description: "Overwrite drift in drwn-managed regions.",
  });

  root = Option.Boolean("--root", false, {
    description: "Write machine intent to user-scope tool configs and ignore project config.",
  });

  scope = Option.String("--scope", {
    description: "Explicit write scope. Use machine to confirm user-home writes outside a project.",
  });

  user = Option.Boolean("--user", false, {
    description: "Alias for --root.",
  });

  strictHooks = Option.Boolean("--strict-hooks", false, {
    description: "Fail when card hooks are present but missing valid hook consent.",
  });

  strict = Option.Boolean("--strict", false, {
    description: "Fail on Worker version-floor or explicit instruction-consent violations.",
  });

  applyClaudeAdapter = Option.Boolean("--apply-claude-adapter", false, {
    description: "Add a managed AGENTS.md import block to a foreign Claude adapter.",
  });

  watch = Option.Boolean("--watch", false, {
    description: "After writing once, rerun when config, lock, or linked sources change.",
  });

  async execute() {
    if (this.watch && (this.dryRun || this.json)) {
      throw new UsageError("--watch is incompatible with --dry-run and --json.");
    }
    if (this.mcpOnly && this.skillsOnly) {
      throw new UsageError("Use either --mcp-only or --skills-only, not both.");
    }
    if (this.root && this.user) {
      throw new UsageError("Use either --root or --user, not both.");
    }
    if (this.target && !isTargetName(this.target)) {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }
    if (this.scope && this.scope !== "machine" && this.scope !== "project") {
      throw new UsageError(`Unsupported scope: ${this.scope}. Use machine or project.`);
    }
    if (this.scope === "project" && (this.root || this.user)) {
      throw new UsageError("--scope project cannot be combined with --root/--user.");
    }

    let preflightState: Awaited<ReturnType<typeof buildEffectiveState>>;
    try {
      preflightState = await buildEffectiveState({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        cwd: this.context.cwd,
        dryRun: this.dryRun,
        mcpOnly: this.mcpOnly,
        skillsOnly: this.skillsOnly,
        target: this.target as "claude" | "codex" | "cursor" | undefined,
        force: this.force,
        strictHooks: this.strictHooks,
        strict: this.strict,
        applyClaudeAdapter: this.applyClaudeAdapter,
        forceMachineScope: this.root || this.user || this.scope === "machine",
        scope: this.scope as "machine" | "project" | undefined,
      });
      assertMachineWriteScopeAllowed({
        writeScope: preflightState.scopedOptions.writeScope,
        forceMachineScope: preflightState.normalized.forceMachineScope,
        scope: this.scope as "machine" | "project" | undefined,
      });
      assertAmbientMcpPreflight(preflightState);
    } catch (error) {
      this.context.stderr.write(renderWriteError(error, this.json));
      return 1;
    }

    if (!(this.root || this.user)) {
      const projectConfigPath = findProjectConfig(this.context.cwd);
      const projectRoot = projectConfigPath ? resolveProjectRootFromConfigPath(projectConfigPath) : null;
      if (projectRoot) {
        const lock = await loadCardLock(projectRoot);
        const floor = evaluateVersionFloor(lock?.store?.minDrwnVersion);
        if (!floor.satisfied) {
          this.context.stderr.write(`${formatVersionFloorWarning(floor)}\n`);
          if (this.strict) {
            return 1;
          }
        }
        if (!this.dryRun) {
          const consentState = preflightState;
          for (const card of consentState.activeCards) {
            if (!card.hookConsent || card.hooks.length === 0) {
              continue;
            }
            const contentRoot = consentState.contentRootsByCard[card.name] ?? card.path;
            const hookPolicyDigest = await computeHookPolicyDigest(card, contentRoot);
            const ackKey = buildHookConsentAckKey({ projectRoot, card, hookPolicyDigest });
            if (await hasHookConsentAck(this.context.agentsDir, ackKey)) {
              continue;
            }
            this.context.stderr.write(
              `hooks present, consented by ${card.name} (${card.hookConsent.consentedRange}) on another machine\n`,
            );
            await recordHookConsentAck(this.context.agentsDir, ackKey);
            break;
          }
          for (const card of consentState.activeCards) {
            if (!card.instructionConsent) continue;
            const contentRoot =
              consentState.contentRootsByCard[card.name] ?? card.path;
            const contribution = resolveExplicitInstructionContribution(
              card,
              contentRoot,
            );
            if (
              !contribution ||
              !isInstructionConsentValid(card, contribution)
            ) {
              continue;
            }
            const ackKey = buildInstructionConsentAckKey({
              projectRoot,
              card,
            });
            if (
              await hasInstructionConsentAck(this.context.agentsDir, ackKey)
            ) {
              continue;
            }
            this.context.stderr.write(
              `instructions present, consented by ${card.name} (${card.instructionConsent.consentedRange}) on another machine\n`,
            );
            await recordInstructionConsentAck(
              this.context.agentsDir,
              ackKey,
            );
          }
        }
      }
    }

    const runOnce = async () => {
      const previewState = await buildEffectiveState({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        cwd: this.context.cwd,
        forceMachineScope: this.root || this.user || this.scope === "machine",
      });
      assertMachineWriteScopeAllowed({
        writeScope: previewState.scopedOptions.writeScope,
        forceMachineScope: previewState.normalized.forceMachineScope,
        scope: this.scope as "machine" | "project" | undefined,
      });
      const result = await syncRepository({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        cwd: this.context.cwd,
        dryRun: this.dryRun,
        mcpOnly: this.mcpOnly,
        skillsOnly: this.skillsOnly,
        target: this.target as "claude" | "codex" | "cursor" | undefined,
        force: this.force,
        strictHooks: this.strictHooks,
        strict: this.strict,
        applyClaudeAdapter: this.applyClaudeAdapter,
        forceMachineScope: this.root || this.user || this.scope === "machine",
        scope: this.scope as "machine" | "project" | undefined,
      });
      this.context.stdout.write(
        this.json ? renderJson(result) : `${renderSyncResult(result)}${renderOptionalMcpReport(result.optionalMcpReport)}`,
      );
      return result;
    };

    if (this.watch) {
      const projectConfigPath = findProjectConfig(this.context.cwd);
      const projectRoot = projectConfigPath ? resolveProjectRootFromConfigPath(projectConfigPath) : null;
      if (!projectRoot) {
        throw new UsageError("--watch requires a project context.");
      }
      const stop = startWriteWatch({
        projectRoot,
        onTrigger: async () => {
          try {
            await runOnce();
          } catch (error) {
            this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
          }
        },
      });
      await new Promise<void>((resolve) => {
        process.on("SIGINT", () => {
          stop();
          resolve();
        });
      });
      return 0;
    }

    try {
      await runOnce();
    } catch (error) {
      this.context.stderr.write(renderWriteError(error, this.json));
      return 1;
    }
    return 0;
  }
}
