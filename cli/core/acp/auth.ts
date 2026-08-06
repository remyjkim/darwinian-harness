// ABOUTME: Adapts ACP agent-owned authentication onto the existing DAH device-flow implementation.
// ABOUTME: Validates the advertised method and persists the resulting encrypted CLI credentials.

import {
  RequestError,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type AuthMethodAgent,
} from "@agentclientprotocol/sdk";
import {
  runDeviceFlow,
  type RunDeviceFlowInput,
} from "../auth/device-flow";
import {
  writeCredentials,
  type CliDahCredentialFile,
} from "../auth/credentials";
import { drwnCliProfile } from "../auth/profile";
import { resolveCredentialsPath } from "../paths";

export const DAH_DEVICE_AUTH_METHOD_ID = "dah-device";

export const DAH_DEVICE_AUTH_METHOD: AuthMethodAgent = {
  id: DAH_DEVICE_AUTH_METHOD_ID,
  name: "Darwinian device login",
  description: "Sign in through Darwinian Auth Hub using a browser device code.",
};

export interface AcpDeviceAuthOptions {
  agentsDir: string;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  onUserAction: RunDeviceFlowInput["onUserAction"];
  runFlow?: (input: RunDeviceFlowInput) => Promise<CliDahCredentialFile>;
  persist?: (path: string, credential: CliDahCredentialFile) => Promise<void>;
}

function authAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("ACP authentication aborted");
}

function throwIfAuthAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw authAbortReason(signal);
}

async function waitForAuth(
  ms: number,
  sleep: ((ms: number) => Promise<void>) | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!signal) {
    await (sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay))))(ms);
    return;
  }
  throwIfAuthAborted(signal);
  const activeSignal = signal;
  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function finish(callback: () => void) {
      if (timer !== undefined) clearTimeout(timer);
      activeSignal.removeEventListener("abort", onAbort);
      callback();
    }
    function onAbort() {
      finish(() => reject(authAbortReason(activeSignal)));
    }
    activeSignal.addEventListener("abort", onAbort, { once: true });
    if (sleep) {
      sleep(ms).then(
        () => finish(resolve),
        (error) => finish(() => reject(error)),
      );
    } else {
      timer = setTimeout(() => finish(resolve), ms);
    }
  });
}

export async function authenticateDahDevice(
  params: AuthenticateRequest,
  options: AcpDeviceAuthOptions,
): Promise<AuthenticateResponse> {
  if (params.methodId !== DAH_DEVICE_AUTH_METHOD_ID) {
    throw RequestError.invalidParams(undefined, `Unsupported authentication method: ${params.methodId}`);
  }
  throwIfAuthAborted(options.signal);
  const fetcher = options.signal
    ? ((input: string | URL | Request, init?: RequestInit) => {
      throwIfAuthAborted(options.signal);
      return (options.fetcher ?? fetch)(input, { ...init, signal: options.signal });
    }) as typeof fetch
    : options.fetcher;
  const credential = await (options.runFlow ?? runDeviceFlow)({
    profile: drwnCliProfile(options.env),
    fetcher,
    sleep: (ms) => waitForAuth(ms, options.sleep, options.signal),
    now: options.now,
    onUserAction: options.onUserAction,
  });
  throwIfAuthAborted(options.signal);
  await (options.persist ?? writeCredentials)(resolveCredentialsPath(options.agentsDir), credential);
  return {};
}
