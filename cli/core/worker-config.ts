// ABOUTME: Resolves Deployment endpoints for drwn worker commands.
// ABOUTME: Keeps one-release IMINDS env fallbacks while preferring DRWN names.

import { trimTrailingSlashes } from "./url";

export type WorkerConfig = {
  apiBaseUrl: string;
  gatewayBaseUrl: string;
};

export function resolveWorkerConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): WorkerConfig {
  return {
    apiBaseUrl: trimTrailingSlashes(
      env.DRWN_STUDIO_API_URL ??
      env.IMINDS_API_URL ??
      "https://studio.darwiniantools.com",
    ),
    gatewayBaseUrl: trimTrailingSlashes(
      env.DRWN_STUDIO_GATEWAY_URL ??
      env.IMINDS_GATEWAY_URL ??
      "https://minds.darwiniantools.com",
    ),
  };
}
