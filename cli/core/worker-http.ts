// ABOUTME: Auth-aware Deploy API fetch helpers for drwn worker commands.
// ABOUTME: Adds DAH bearer tokens and retries once after a 401 by refreshing stored credentials.

import type { AgentsContext } from "../context";
import { NotAuthenticatedError } from "./errors";
import { resolveCredentialsPath } from "./paths";
import { resolveToken, refreshStoredCredential } from "./auth/resolve-token";
import { drwnCliProfile } from "./auth/profile";

// Re-exported for existing importers; the class lives in core/errors to stay
// import-cycle-free with the auth modules (I65 Fix 3).
export { NotAuthenticatedError };

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

export async function fetchWithWorkerAuth(
  context: Pick<AgentsContext, "agentsDir">,
  input: string,
  init?: RequestInit,
  deps: { fetcher?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<Response> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? fetch;
  const profile = drwnCliProfile(env);
  const credentialsPath = resolveCredentialsPath(context.agentsDir);
  const auth = await resolveToken({ credentialsPath, env, fetcher, profile });
  if (!auth) {
    throw new NotAuthenticatedError("Not authenticated. Run `drwn login` first, or set DRWN_TOKEN for headless execution.");
  }

  const first = await fetcher(input, withBearer(init, auth.token));
  if (first.status !== 401 || auth.source === "env") return first;

  const refreshed = await refreshStoredCredential({
    credentialsPath,
    credential: auth.credential,
    profile,
    fetcher,
  });
  return fetcher(input, withBearer(init, refreshed.accessToken));
}

export async function fetchJsonWithWorkerAuth<T>(
  context: Pick<AgentsContext, "agentsDir">,
  input: string,
  init?: RequestInit,
): Promise<{ response: Response; body: T }> {
  const response = await fetchWithWorkerAuth(context, input, init);
  return { response, body: await parseJsonOrText(response) as T };
}
