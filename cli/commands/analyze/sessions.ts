// ABOUTME: Implements `drwn analyze sessions` for uploading session-log archives.
// ABOUTME: Supports explicit archive, fresh inline export, newest archive reuse, dry-run, wait, open, and JSON output.

import { Option } from "clipanion";
import { join } from "node:path";
import { BaseCommand } from "../base";
import type { AgentsContext } from "../../context";
import { findNewestArchive } from "../../core/analyze/find-archive";
import { runInlineExport } from "../../core/analyze/inline-export";
import { resolveAnalyzeInput } from "../../core/analyze/resolve-input";
import { processingUrl, reportUrl as composeReportUrl } from "../../core/analyze/url";
import { validateArchive, type ArchiveInfo } from "../../core/analyze/validate-archive";
import { openBrowser as defaultOpenBrowser } from "../../core/auth/browser";
import { loadAnalyzerConfig } from "../../core/auth/config";
import { resolveToken } from "../../core/auth/resolve-token";
import { createAnalyzerClient, type AnalyzerClient } from "../../core/http/analyzer-client";
import { AuthExpiredError, ServerError } from "../../core/http/errors";
import type { JobInfo } from "../../core/http/schemas";
import { resolveCredentialsPath } from "../../core/paths";
import type { KeychainBackend } from "../../core/secret-store";

export interface AnalyzeSessionsCommandTestDeps {
  env?: Partial<Record<"DRWN_TOKEN" | "DRWN_ANALYZER_URL" | "DRWN_ANALYZER_WEB_URL", string | undefined>>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  openBrowser?: (url: string) => void;
  inlineExport?: (context: AgentsContext) => Promise<string>;
  findNewest?: (exportsDir: string) => Promise<string | null>;
  keychainBackend?: KeychainBackend;
}

export class AnalyzeSessionsCommand extends BaseCommand {
  static override paths = [["analyze", "sessions"]];
  static testDeps: AnalyzeSessionsCommandTestDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Analyze",
    description: "Upload session logs to the analyzer and return a viewing URL.",
    details: `
      Selects an archive from --archive, --fresh, the newest local export under
      .agents/drwn/session-log-exports, or a new inline gzip export. The command
      uploads the archive to the configured analyzer API and prints a processing
      URL when analyzer.webBaseUrl or DRWN_ANALYZER_WEB_URL is configured.

      Use --dry-run to validate the selected input without writing a new archive
      or making a network request. Use --wait when scripts need the final report
      URL instead of only the processing URL.
    `,
    examples: [
      ["Upload newest local archive or build one", "drwn analyze sessions"],
      ["Build a fresh archive first", "drwn analyze sessions --fresh"],
      ["Wait for the report URL and open it", "drwn analyze sessions --wait --open"],
      ["Preview an explicit upload without network", "drwn analyze sessions --dry-run --archive /tmp/sessions.tar.gz"],
    ],
  });

  archive = Option.String("--archive", {
    description: "Path to a pre-built .tar, .tar.gz, or .tgz archive.",
  });

  fresh = Option.Boolean("--fresh", false, {
    description: "Build a new gzip archive even if an existing archive is present.",
  });

  wait = Option.Boolean("--wait", false, {
    description: "Poll until the report is ready and print the report URL.",
  });

  open = Option.Boolean("--open", false, {
    description: "Open the processing URL or report URL in the default browser.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit a single machine-readable JSON object.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Resolve and validate inputs without creating archives or uploading.",
  });

  async execute() {
    const deps = AnalyzeSessionsCommand.testDeps ?? {};
    const env: NonNullable<AnalyzeSessionsCommandTestDeps["env"]> =
      deps.env ?? process.env as NonNullable<AnalyzeSessionsCommandTestDeps["env"]>;

    try {
      const cfg = await loadAnalyzerConfig(this.context, env);
      const exportsDir = join(this.context.cwd, ".agents", "drwn", "session-log-exports");
      if (this.archive && this.fresh && !this.json) {
        this.context.stdout.write("--fresh is ignored when --archive is provided.\n");
      }

      const input = await resolveAnalyzeInput({
        archive: this.archive,
        fresh: this.fresh,
        dryRun: this.dryRun,
        exportsDir,
        inlineExport: async () => (deps.inlineExport ?? runInlineExport)(this.context),
        findNewest: deps.findNewest ?? findNewestArchive,
      });

      let archiveInfo: ArchiveInfo | null = null;
      if (input.path) {
        archiveInfo = await validateArchive(input.path, cfg.maxArchiveBytes);
      }

      if (this.dryRun) {
        this.writeDryRun(input.source, archiveInfo, cfg.apiUrl);
        return 0;
      }

      if (!input.path || !archiveInfo) {
        throw new Error("No archive resolved for upload.");
      }

      if (input.source === "existing" && !this.json) {
        this.context.stdout.write(`Using existing archive: ${input.path}\n`);
      }

      const auth = await resolveToken({
        credentialsPath: resolveCredentialsPath(this.context.agentsDir),
        env,
        keychainBackend: deps.keychainBackend,
      });
      if (!auth) {
        this.context.stderr.write("Not authenticated. Run `drwn login` first (or set DRWN_TOKEN + DRWN_ANALYZER_URL).\n");
        return 1;
      }
      if (!cfg.apiUrl) {
        this.context.stderr.write(
          `Set DRWN_ANALYZER_URL or configure analyzer.apiUrl in ${cfg.configPath} before uploading.\n`,
        );
        return 1;
      }

      const client = createAnalyzerClient(cfg.apiUrl, deps.fetch ?? fetch);
      if (!this.json) {
        this.context.stdout.write(`Uploading ${formatBytes(archiveInfo.size)}...\n`);
      }
      const upload = await client.upload(input.path, auth.token);
      const queuedProcessingUrl = cfg.webBaseUrl ? processingUrl(cfg.webBaseUrl, upload.jobId) : null;
      let finalReportUrl: string | null = null;

      if (!this.json) {
        if (queuedProcessingUrl) {
          this.context.stdout.write(`Job queued. Watch progress here:\n  ${queuedProcessingUrl}\n`);
        } else {
          this.context.stdout.write(
            `Job queued as ${upload.jobId}. Configure analyzer.webBaseUrl or DRWN_ANALYZER_WEB_URL to get a clickable URL.\n`,
          );
        }
      }

      if (this.wait) {
        const job = await waitForReport(client, upload.jobId, auth.token, {
          intervalMs: 2000,
          ceilingMs: 5 * 60 * 1000,
          sleep: deps.sleep ?? defaultSleep,
          now: deps.now ?? Date.now,
          processingUrl: queuedProcessingUrl,
        });
        finalReportUrl = cfg.webBaseUrl && job.reportId ? composeReportUrl(cfg.webBaseUrl, job.reportId) : null;
        if (!this.json) {
          this.context.stdout.write(
            finalReportUrl ? `Analysis ready:\n  ${finalReportUrl}\n` : `Analysis ready. Report id: ${job.reportId}\n`,
          );
        }
      }

      if (this.open) {
        const urlToOpen = this.wait ? finalReportUrl : queuedProcessingUrl;
        if (urlToOpen) {
          (deps.openBrowser ?? defaultOpenBrowser)(urlToOpen);
        } else {
          this.context.stderr.write("No analyzer.webBaseUrl configured; cannot open browser.\n");
        }
      }

      if (this.json) {
        this.context.stdout.write(JSON.stringify({
          jobId: upload.jobId,
          processingUrl: queuedProcessingUrl,
          reportUrl: finalReportUrl,
        }) + "\n");
      }

      return 0;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private writeDryRun(source: string, archiveInfo: ArchiveInfo | null, apiUrl: string | undefined) {
    if (this.json) {
      this.context.stdout.write(JSON.stringify({
        dryRun: true,
        source,
        archivePath: archiveInfo?.path ?? null,
        size: archiveInfo?.size ?? null,
        apiUrl: apiUrl ?? null,
      }) + "\n");
      return;
    }

    if (!archiveInfo) {
      this.context.stdout.write("Would build inline gzip archive from local session logs, then upload it.\n");
      return;
    }

    this.context.stdout.write(
      `Dry run: would upload ${archiveInfo.path} (${formatBytes(archiveInfo.size)})` +
        `${apiUrl ? ` to ${apiUrl}/api/analyze` : ""}.\n`,
    );
  }

  private handleError(error: unknown): number {
    if (error instanceof AuthExpiredError) {
      this.context.stderr.write("Session expired. Run `drwn login`.\n");
      return 1;
    }
    if (error instanceof ServerError) {
      if (error.status === 401) {
        this.context.stderr.write("Session expired. Run `drwn login`.\n");
      } else if (error.status === 413) {
        this.context.stderr.write("Archive exceeds server limit. Try `drwn export sessions --gzip` for a smaller archive.\n");
      } else if (error.status === 400) {
        this.context.stderr.write(`${error.message}\n`);
      } else if (error.status >= 500) {
        this.context.stderr.write(`Server error (${error.status}). Try again later.\n`);
      } else {
        this.context.stderr.write(`${error.message}\n`);
      }
      return 1;
    }

    this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

interface WaitOptions {
  intervalMs: number;
  ceilingMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  processingUrl: string | null;
}

async function waitForReport(
  client: Pick<AnalyzerClient, "getJob">,
  jobId: string,
  token: string,
  opts: WaitOptions,
): Promise<JobInfo> {
  const start = opts.now();
  while (true) {
    await opts.sleep(opts.intervalMs);
    if (opts.now() - start > opts.ceilingMs) {
      const destination = opts.processingUrl ?? "the processing page";
      throw new Error(`Polling timed out after ${Math.round(opts.ceilingMs / 1000)}s. Check ${destination} for live status.`);
    }
    const job = await client.getJob(jobId, token);
    if (job.status === "completed" && job.reportId) return job;
    if (job.status === "failed") {
      throw new Error(`Analysis failed: ${job.error ?? "unknown error"}`);
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
