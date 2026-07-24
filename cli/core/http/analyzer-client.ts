// ABOUTME: Shared HTTP client for Darwinian analyzer auth and analysis endpoints.
// ABOUTME: Validates response shapes and exposes typed errors for command-layer UX.

import { basename } from "node:path";
import {
  AnalyzeUploadResponseSchema,
  DeviceCodeResponseSchema,
  DeviceTokenResponseSchema,
  JobInfoSchema,
  SessionResponseSchema,
  type AnalyzeUploadResponse,
  type DeviceCodeResponse,
  type DeviceTokenResponse,
  type JobInfo,
  type SessionResponse,
} from "./schemas";
import { AuthExpiredError, ServerError } from "./errors";
import { trimTrailingSlashes } from "../url";

export type DeviceTokenPollResult =
  | { kind: "success"; token: DeviceTokenResponse }
  | { kind: "error"; error: string };

export interface AnalyzerClient {
  requestDeviceCode(clientId: string): Promise<DeviceCodeResponse>;
  pollDeviceToken(deviceCode: string, clientId: string): Promise<DeviceTokenPollResult>;
  getSession(token: string): Promise<SessionResponse>;
  signOut(token: string): Promise<void>;
  upload(archivePath: string, token: string): Promise<AnalyzeUploadResponse>;
  getJob(jobId: string, token: string): Promise<JobInfo>;
}

function normalizeApiUrl(apiUrl: string): string {
  return trimTrailingSlashes(apiUrl);
}

async function readErrorText(response: Response): Promise<string> {
  const text = await response.text();
  return text || response.statusText;
}

export function createAnalyzerClient(apiUrl: string, fetcher: typeof fetch = fetch): AnalyzerClient {
  const baseUrl = normalizeApiUrl(apiUrl);

  return {
    async requestDeviceCode(clientId) {
      const response = await fetcher(`${baseUrl}/api/auth/device/code`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!response.ok) throw new ServerError(await readErrorText(response), response.status);
      return DeviceCodeResponseSchema.parse(await response.json());
    },

    async pollDeviceToken(deviceCode, clientId) {
      const response = await fetcher(`${baseUrl}/api/auth/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: clientId,
        }),
      });
      if (response.ok) {
        return { kind: "success", token: DeviceTokenResponseSchema.parse(await response.json()) };
      }
      let error = "unknown_error";
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) error = body.error;
      } catch {
        // non-JSON error body
      }
      return { kind: "error", error };
    },

    async getSession(token) {
      const response = await fetcher(`${baseUrl}/api/auth/session`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.status === 401) throw new AuthExpiredError();
      if (!response.ok) throw new ServerError(await readErrorText(response), response.status);
      return SessionResponseSchema.parse(await response.json());
    },

    async signOut(token) {
      try {
        await fetcher(`${baseUrl}/api/auth/sign-out`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
      } catch {
        // best-effort: local credentials are removed regardless
      }
    },

    async upload(archivePath, token) {
      const file = Bun.file(archivePath);
      const form = new FormData();
      form.append("file", file, basename(archivePath));
      const response = await fetcher(`${baseUrl}/api/analyze`, {
        method: "POST",
        body: form,
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.status === 401) throw new AuthExpiredError();
      if (!response.ok) throw new ServerError(await readErrorText(response), response.status);
      return AnalyzeUploadResponseSchema.parse(await response.json());
    },

    async getJob(jobId, token) {
      const response = await fetcher(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.status === 401) throw new AuthExpiredError();
      if (!response.ok) throw new ServerError(await readErrorText(response), response.status);
      return JobInfoSchema.parse(await response.json());
    },
  };
}
