// ABOUTME: Verifies zod schemas for Analyzer upload and job HTTP responses.
// ABOUTME: Native DAH auth deliberately has no schema dependency on the Analyzer client.

import { describe, expect, test } from "bun:test";
import {
  AnalyzeUploadResponseSchema,
  JobInfoSchema,
} from "../cli/core/http/schemas";

describe("AnalyzeUploadResponseSchema", () => {
  test("accepts a queued upload response", () => {
    expect(AnalyzeUploadResponseSchema.parse({ jobId: "job_x", status: "queued" })).toEqual({
      jobId: "job_x",
      status: "queued",
    });
  });

  test("rejects non-queued upload status", () => {
    expect(AnalyzeUploadResponseSchema.safeParse({ jobId: "job_x", status: "processing" }).success).toBe(false);
  });
});

describe("JobInfoSchema", () => {
  test("accepts job info", () => {
    expect(
      JobInfoSchema.safeParse({
        id: "job_x",
        status: "completed",
        createdAt: "2026-06-03T00:00:00Z",
        updatedAt: "2026-06-03T00:01:00Z",
        error: null,
        reportId: "rep_x",
      }).success,
    ).toBe(true);
  });

  test("rejects unknown job status", () => {
    expect(
      JobInfoSchema.safeParse({
        id: "job_x",
        status: "done",
        createdAt: "2026-06-03T00:00:00Z",
        updatedAt: "2026-06-03T00:01:00Z",
        error: null,
        reportId: null,
      }).success,
    ).toBe(false);
  });
});
