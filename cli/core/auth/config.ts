// ABOUTME: Resolves analyzer API/web configuration for auth and analyze commands.
// ABOUTME: Applies env overrides while preserving the existing packaged/user config model.

import type { AgentsContext } from "../../context";
import { loadConfig } from "../config";
import { resolveMachineConfigPath } from "../store-paths";
import { loadEffectiveConfig } from "../user-config";
import { trimTrailingSlashes } from "../url";

export interface AnalyzerConfig {
  apiUrl?: string;
  clientId: string;
  webBaseUrl?: string;
  maxArchiveBytes: number;
  configPath: string;
}

type AnalyzerEnv = Partial<Record<"DRWN_ANALYZER_URL" | "DRWN_ANALYZER_WEB_URL", string | undefined>>;

const DEFAULT_CLIENT_ID = "drwn-cli";
const DEFAULT_MAX_ARCHIVE_BYTES = 104857600;

function trimOptionalTrailingSlashes(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return trimTrailingSlashes(value);
}

export async function loadAnalyzerConfig(
  context: Pick<AgentsContext, "repoRoot" | "agentsDir">,
  env: AnalyzerEnv = process.env as AnalyzerEnv,
): Promise<AnalyzerConfig> {
  const repoConfig = await loadConfig(context.repoRoot);
  const loaded = await loadEffectiveConfig(repoConfig, context.agentsDir);
  const effectiveAnalyzer = loaded.config.analyzer ?? {};
  const packagedAnalyzer = repoConfig.analyzer ?? {};

  const apiUrl = trimOptionalTrailingSlashes(
    env.DRWN_ANALYZER_URL ?? effectiveAnalyzer.apiUrl ?? packagedAnalyzer.apiUrl,
  );
  const webBaseUrl = trimOptionalTrailingSlashes(
    env.DRWN_ANALYZER_WEB_URL ?? effectiveAnalyzer.webBaseUrl ?? packagedAnalyzer.webBaseUrl,
  );

  return {
    apiUrl,
    clientId: effectiveAnalyzer.clientId ?? packagedAnalyzer.clientId ?? DEFAULT_CLIENT_ID,
    webBaseUrl,
    maxArchiveBytes: effectiveAnalyzer.maxArchiveBytes ??
      packagedAnalyzer.maxArchiveBytes ??
      DEFAULT_MAX_ARCHIVE_BYTES,
    configPath: loaded.userConfigPath ?? resolveMachineConfigPath(context.agentsDir),
  };
}
