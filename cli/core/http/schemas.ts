// ABOUTME: Zod schemas for Darwinian analyzer HTTP responses consumed by drwn.
// ABOUTME: Keeps backend contract validation centralized across auth and analyze commands.

import { z } from "zod";

export const AnalyzeUploadResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal("queued"),
});

export const JobInfoSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable(),
  reportId: z.string().nullable(),
});

export type AnalyzeUploadResponse = z.infer<typeof AnalyzeUploadResponseSchema>;
export type JobInfo = z.infer<typeof JobInfoSchema>;
