// ABOUTME: Resolves Deployment endpoints for drwn worker commands.
// ABOUTME: Keeps API calls and browser handoffs on independently configurable origins.

import { trimTrailingSlashes } from "./url";

export type WorkerConfig = {
  apiBaseUrl: string;
  webBaseUrl: string;
};

export function resolveWorkerConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): WorkerConfig {
  return {
    apiBaseUrl: trimTrailingSlashes(
      env.DRWN_STUDIO_API_URL ??
      "https://api.darwinian.dev",
    ),
    webBaseUrl: trimTrailingSlashes(
      env.DRWN_STUDIO_WEB_URL ??
      "https://foundry.darwinian.dev",
    ),
  };
}
