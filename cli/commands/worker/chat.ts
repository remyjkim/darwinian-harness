// ABOUTME: Implements drwn worker chat against the metered Deploy API chat endpoint.
// ABOUTME: Starts a run, prints the console URL, then waits for and prints the mind's reply (I65 Fix 4).

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { JwtAudienceError } from "../../core/auth/jwt";
import { DrwnError, NotAuthenticatedError } from "../../core/errors";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchJsonWithWorkerAuth } from "../../core/worker-http";
import {
  describeRunFailure,
  isSettledRunStatus,
  pollRunOnce,
  renderError,
  runWebUrl,
  transcriptEventText,
  type RunTranscriptEvent,
} from "../../core/worker-run";
import { renderJson } from "../../core/output";

const DEFAULT_POLL_MS = 1500;
const DEFAULT_CHAT_TIMEOUT_MS = 120_000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WorkerChatCommand extends BaseCommand {
  static override paths = [["worker", "chat"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Send a message to a deployed worker and wait for its reply.",
    details: `
      Calls the metered Deploy API chat endpoint for an active worker. The chat
      run is asynchronous: the command prints the run id and its console URL
      immediately, then polls the run and prints the mind's reply when it
      arrives. Use --no-wait to only start the run, and --json for machine
      output. Poll cadence and patience honor DRWN_POLL_MS and
      DRWN_CHAT_TIMEOUT_MS.
    `,
    examples: [
      ["Chat with a worker", "drwn worker chat harari --message \"hello\""],
      ["Start a run without waiting", "drwn worker chat harari --message \"hello\" --no-wait --json"],
    ],
  });

  slug = Option.String();

  message = Option.String("--message", {
    required: true,
    description: "Message text to send to the worker.",
  });

  json = Option.Boolean("--json", false, {
    description: "Print one machine-readable object instead of human output.",
  });

  noWait = Option.Boolean("--no-wait", false, {
    description: "Return the run handle immediately without waiting for the reply.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveWorkerConfig();
    try {
      const { response, body } = await fetchJsonWithWorkerAuth<unknown>(
        this.context,
        `${apiBaseUrl}/api/minds/${this.slug}/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: this.message }),
        },
      );
      if (!response.ok) {
        this.context.stderr.write(`Chat failed (${response.status}): ${renderError(body)}\n`);
        return 1;
      }
      const runId = body && typeof body === "object" ? (body as { runId?: unknown }).runId : undefined;
      if (typeof runId !== "string" || runId.length === 0) {
        // A response without a runId has no run to wait on; print the raw body.
        this.context.stdout.write(renderJson(body));
        return 0;
      }
      const url = runWebUrl(apiBaseUrl, runId);
      if (this.noWait) {
        if (this.json) {
          this.context.stdout.write(renderJson({ runId, url }));
        } else {
          this.context.stdout.write(`Run: ${runId}\nOpen in browser: ${url}\n`);
        }
        return 0;
      }
      if (!this.json) {
        this.context.stdout.write(`Run: ${runId}\nOpen in browser: ${url}\n`);
      }
      return await this.waitForReply(apiBaseUrl, runId, url);
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }
  }

  private async waitForReply(apiBaseUrl: string, runId: string, url: string): Promise<number> {
    const env = process.env;
    const pollMs = Math.max(1, Number(env.DRWN_POLL_MS ?? DEFAULT_POLL_MS) || DEFAULT_POLL_MS);
    const timeoutMs = Math.max(1, Number(env.DRWN_CHAT_TIMEOUT_MS ?? DEFAULT_CHAT_TIMEOUT_MS) || DEFAULT_CHAT_TIMEOUT_MS);
    const deadline = Date.now() + timeoutMs;
    const events: RunTranscriptEvent[] = [];
    let since = 0;

    let consecutivePollFailures = 0;
    for (;;) {
      let poll: Awaited<ReturnType<typeof pollRunOnce>> | null = null;
      let failureDetail = "";
      try {
        poll = await pollRunOnce(this.context, apiBaseUrl, runId, since);
      } catch (error) {
        // Typed errors (auth, config) are terminal; only network blips retry.
        if (error instanceof DrwnError || error instanceof NotAuthenticatedError || error instanceof JwtAudienceError) {
          throw error;
        }
        failureDetail = error instanceof Error ? error.message : String(error);
      }
      if (poll && !poll.response.ok) {
        failureDetail = `HTTP ${poll.response.status}: ${renderError(poll.body)}`;
        poll = null;
      }
      if (!poll) {
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          this.context.stderr.write(
            `Run poll failed ${consecutivePollFailures} times (last: ${failureDetail}); run status unknown.\n`,
          );
          if (this.json) {
            this.context.stdout.write(renderJson({ runId, url, status: "unknown", result: null, events }));
          } else {
            this.context.stdout.write(
              `Check later with \`drwn worker run status ${runId}\` or open ${url}\n`,
            );
          }
          return 0;
        }
      } else {
        consecutivePollFailures = 0;
        const body = poll.body;
        for (const event of body.events ?? []) {
          events.push(event);
          if (!this.json) {
            const text = transcriptEventText(event);
            if (text) this.context.stdout.write(`${text}\n`);
          }
        }
        since = body.lastSeq ?? since;
        if (isSettledRunStatus(body.status)) {
          if (this.json) {
            this.context.stdout.write(renderJson({ runId, url, status: body.status, result: body.result ?? null, events }));
          }
          if (body.status === "not_found") {
            this.context.stderr.write(`Run ${runId} not found.\n`);
            return 1;
          }
          if (body.status === "failed") {
            this.context.stderr.write(`Run failed: ${describeRunFailure(body.result)}\n`);
            return 1;
          }
          return 0;
        }
      }
      if (Date.now() >= deadline) {
        if (this.json) {
          this.context.stdout.write(renderJson({ runId, url, status: "running", result: null, events }));
        } else {
          this.context.stdout.write(
            `Run still running. Check later with \`drwn worker run status ${runId}\` or open ${url}\n`,
          );
        }
        return 0;
      }
      await sleep(pollMs);
    }
  }
}
