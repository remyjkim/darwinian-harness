// ABOUTME: Shared HTTP client for Darwinian analyzer upload and job endpoints.
// ABOUTME: Validates response shapes and exposes typed errors for command-layer UX.

import { basename } from "node:path";
import {
  AnalyzeUploadResponseSchema,
  JobInfoSchema,
  type AnalyzeUploadResponse,
  type JobInfo,
} from "./schemas";
import { AuthExpiredError, ServerError } from "./errors";
import { trimTrailingSlashes } from "../url";

export interface AnalyzerClient {
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
