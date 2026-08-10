// ABOUTME: Manages cron-triggered Worker Routines through the authenticated Deploy API.
// ABOUTME: Provides create, list, update, enable, disable, run-history, and removal commands.

import { readFileSync } from "node:fs";
import { Option } from "clipanion";
import { z } from "zod";
import { BaseCommand } from "../base";
import { renderJson, renderTable } from "../../core/output";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchJsonWithWorkerAuth, fetchWithWorkerAuth } from "../../core/worker-http";

const routineSchema = z.object({
  id: z.string(), mindId: z.string(), deploymentSlug: z.string(), endUserId: z.string(),
  name: z.string().nullable(), triggerKind: z.literal("cron"), triggerSource: z.string().nullable(),
  cronExpr: z.string().nullable(), timezone: z.string(), payload: z.record(z.string(), z.unknown()),
  jitterEnabled: z.boolean(), enabled: z.boolean(), disabledReason: z.string().nullable(),
  nextRunAt: z.string().nullable(), lastRunAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
}).passthrough();
const runSchema = z.object({
  id: z.string(), routineId: z.string(), mindId: z.string(), deploymentSlug: z.string(),
  dedupKey: z.string(), scheduledFor: z.string(), status: z.string(), failureKind: z.string().nullable(),
  attempts: z.number(), engineRunId: z.string().nullable(), sessionId: z.string().nullable(),
  replyStatus: z.string(), createdAt: z.string(), startedAt: z.string().nullable(), completedAt: z.string().nullable(),
}).passthrough();
type Routine = z.infer<typeof routineSchema>;

class RoutineApiError extends Error {}
const enc = (value: string) => encodeURIComponent(value);

function apiError(body: unknown, status: number): RoutineApiError {
  if (body && typeof body === "object") {
    const value = body as { error?: unknown; message?: unknown };
    if (typeof value.error === "string" && typeof value.message === "string") {
      return new RoutineApiError(`${value.error}: ${value.message}`);
    }
    if (typeof value.message === "string") return new RoutineApiError(value.message);
  }
  return new RoutineApiError(`Routine API request failed (${status})`);
}

async function request<T>(command: BaseCommand, url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const { response, body } = await fetchJsonWithWorkerAuth<unknown>(command.context, url, init);
  if (!response.ok) throw apiError(body, response.status);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new RoutineApiError("Unexpected Routine API response");
  return parsed.data;
}

function parsePayload(prompt?: string, file?: string): Record<string, unknown> | undefined {
  if (prompt !== undefined && file !== undefined) throw new RoutineApiError("Use either --prompt or --payload, not both");
  if (prompt !== undefined) return { message: prompt };
  if (file === undefined) return undefined;
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new RoutineApiError(`Cannot read JSON payload: ${error instanceof Error ? error.message : String(error)}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RoutineApiError("Routine payload must be a JSON object");
  return value as Record<string, unknown>;
}

function parseAccounts(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const value of values) {
    const split = value.indexOf("=");
    if (split < 1 || split === value.length - 1) throw new RoutineApiError(`Invalid --account "${value}"; expected app=accountId`);
    result[value.slice(0, split)] = value.slice(split + 1);
  }
  return result;
}

function parseBool(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new RoutineApiError("--jitter must be true or false");
}

function writeRoutine(command: BaseCommand, routine: Routine, json: boolean): void {
  if (json) command.context.stdout.write(renderJson(routine));
  else command.context.stdout.write(`${routine.name ?? "(unnamed)"} (${routine.id}) — ${routine.enabled ? "enabled" : "disabled"}; ${routine.cronExpr ?? "no schedule"} ${routine.timezone}\n`);
}

async function guarded(command: BaseCommand, action: (apiBaseUrl: string) => Promise<void>): Promise<number> {
  const { apiBaseUrl } = resolveWorkerConfig();
  try { await action(apiBaseUrl); return 0; }
  catch (error) {
    command.context.stderr.write(`${error instanceof RoutineApiError ? error.message : describeWorkerError(error, apiBaseUrl)}\n`);
    return 1;
  }
}

const DETAILS = ["Available commands:", "  drwn worker routine create <slug>", "  drwn worker routine list <slug>", "  drwn worker routine update <slug> <routineId>", "  drwn worker routine enable <slug> <routineId>", "  drwn worker routine disable <slug> <routineId>", "  drwn worker routine runs <slug> <routineId>", "  drwn worker routine rm <slug> <routineId> --force"].join("\n");

export class WorkerRoutineCommand extends BaseCommand {
  static override paths = [["worker", "routine"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Schedule and manage recurring Worker runs.",
    details: DETAILS,
    examples: [
      ["Create a daily 9am Routine", 'drwn worker routine create harari --name digest --cron "0 9 * * *"'],
      ["List a Worker's Routines", "drwn worker routine list harari"],
    ],
  });
  async execute(): Promise<number> { this.context.stdout.write(`${DETAILS}\n`); return 0; }
}

export class WorkerRoutineCreateCommand extends BaseCommand {
  static override paths = [["worker", "routine", "create"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Create a cron Routine.",
    details: "Registers a cron-triggered Routine on the deployed Worker. --cron takes a five-field cron expression evaluated in --timezone (default UTC). The run payload comes from --prompt or --payload (a JSON file); --account selects connected accounts; --jitter (default true) spreads start times.",
    examples: [["Create a daily 9am Routine", 'drwn worker routine create harari --name digest --cron "0 9 * * *"']],
  });
  slug = Option.String();
  name = Option.String("--name", { required: true });
  cron = Option.String("--cron", { required: true });
  timezone = Option.String("--timezone", "UTC");
  prompt = Option.String("--prompt"); payloadFile = Option.String("--payload");
  accounts = Option.Array("--account", []); jitter = Option.String("--jitter", "true");
  json = Option.Boolean("--json", false);
  async execute(): Promise<number> { return guarded(this, async (base) => {
    const payload = parsePayload(this.prompt, this.payloadFile) ?? {};
    const body = { name: this.name, triggerKind: "cron", cronExpr: this.cron, timezone: this.timezone, jitterEnabled: parseBool(this.jitter), payload, accountSelections: parseAccounts(this.accounts) };
    const data = await request(this, `${base}/api/minds/${enc(this.slug)}/routines`, z.object({ routine: routineSchema }), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    writeRoutine(this, data.routine, this.json);
  }); }
}

export class WorkerRoutineListCommand extends BaseCommand {
  static override paths = [["worker", "routine", "list"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "List a Worker's Routines.",
    details: "Shows every Routine on the Worker with its state, schedule, timezone, and next run. --json emits the raw records.",
    examples: [["List Routines", "drwn worker routine list harari"]],
  });
  slug = Option.String(); json = Option.Boolean("--json", false);
  async execute(): Promise<number> { return guarded(this, async (base) => {
    const data = await request(this, `${base}/api/minds/${enc(this.slug)}/routines`, z.object({ routines: z.array(routineSchema) }));
    if (this.json) this.context.stdout.write(renderJson(data.routines));
    else if (!data.routines.length) this.context.stdout.write("No routines.\n");
    else this.context.stdout.write(renderTable(["id", "name", "state", "schedule", "timezone", "next_run"], data.routines.map((r) => [r.id, r.name ?? "", r.enabled ? "enabled" : "disabled", r.cronExpr ?? "", r.timezone, r.nextRunAt ?? "-"])));
  }); }
}

export class WorkerRoutineUpdateCommand extends BaseCommand {
  static override paths = [["worker", "routine", "update"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Update a Routine definition.",
    details: "Patches only the fields you pass (--name, --cron, --timezone, --prompt/--payload, --account, --jitter); at least one is required. Unset fields keep their current values.",
    examples: [["Move a Routine to 6pm Seoul time", 'drwn worker routine update harari rtn_123 --cron "0 18 * * *" --timezone Asia/Seoul']],
  });
  slug = Option.String(); id = Option.String();
  name = Option.String("--name"); cron = Option.String("--cron"); timezone = Option.String("--timezone");
  prompt = Option.String("--prompt"); payloadFile = Option.String("--payload"); accounts = Option.Array("--account");
  jitter = Option.String("--jitter"); json = Option.Boolean("--json", false);
  async execute(): Promise<number> { return guarded(this, async (base) => {
    const body: Record<string, unknown> = {};
    if (this.name !== undefined) body.name = this.name; if (this.cron !== undefined) body.cronExpr = this.cron;
    if (this.timezone !== undefined) body.timezone = this.timezone;
    const payload = parsePayload(this.prompt, this.payloadFile); if (payload !== undefined) body.payload = payload;
    if (this.accounts !== undefined) body.accountSelections = parseAccounts(this.accounts);
    if (this.jitter !== undefined) body.jitterEnabled = parseBool(this.jitter);
    if (!Object.keys(body).length) throw new RoutineApiError("Provide at least one field to update");
    const data = await request(this, `${base}/api/minds/${enc(this.slug)}/routines/${enc(this.id)}`, z.object({ routine: routineSchema }), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    writeRoutine(this, data.routine, this.json);
  }); }
}

abstract class ToggleCommand extends BaseCommand {
  slug = Option.String(); id = Option.String(); json = Option.Boolean("--json", false);
  abstract enabled: boolean;
  async execute(): Promise<number> { return guarded(this, async (base) => {
    const data = await request(this, `${base}/api/minds/${enc(this.slug)}/routines/${enc(this.id)}`, z.object({ routine: routineSchema }), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: this.enabled }) });
    writeRoutine(this, data.routine, this.json);
  }); }
}
export class WorkerRoutineEnableCommand extends ToggleCommand {
  static override paths = [["worker", "routine", "enable"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Enable a Routine.",
    details: "Turns the Routine's schedule back on; the next run is computed from the cron expression at enable time.",
    examples: [["Enable a Routine", "drwn worker routine enable harari rtn_123"]],
  });
  enabled = true;
}
export class WorkerRoutineDisableCommand extends ToggleCommand {
  static override paths = [["worker", "routine", "disable"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Disable a Routine.",
    details: "Pauses the schedule without deleting the Routine; run history stays readable and enable restores it.",
    examples: [["Disable a Routine", "drwn worker routine disable harari rtn_123"]],
  });
  enabled = false;
}

export class WorkerRoutineRunsCommand extends BaseCommand {
  static override paths = [["worker", "routine", "runs"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Show Routine run history.",
    details: "Pages through the Routine's runs newest-first with status, scheduled time, attempts, and the engine run id. --limit takes 1-100 (default 20); pass the printed cursor back with --cursor for the next page.",
    examples: [["Show the latest runs", "drwn worker routine runs harari rtn_123"]],
  });
  slug = Option.String(); id = Option.String(); limit = Option.String("--limit", "20"); cursor = Option.String("--cursor"); json = Option.Boolean("--json", false);
  async execute(): Promise<number> { return guarded(this, async (base) => {
    const limit = Number(this.limit); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RoutineApiError("--limit must be an integer from 1 to 100");
    const query = new URLSearchParams({ limit: String(limit) }); if (this.cursor) query.set("cursor", this.cursor);
    const page = await request(this, `${base}/api/minds/${enc(this.slug)}/routines/${enc(this.id)}/runs?${query}`, z.object({ items: z.array(runSchema), nextCursor: z.string().nullable() }));
    if (this.json) this.context.stdout.write(renderJson(page));
    else { if (!page.items.length) this.context.stdout.write("No routine runs.\n"); else this.context.stdout.write(renderTable(["id", "status", "scheduled_for", "attempts", "engine_run"], page.items.map((r) => [r.id, r.status, r.scheduledFor, String(r.attempts), r.engineRunId ?? "-"]))); if (page.nextCursor) this.context.stdout.write(`Next cursor: ${page.nextCursor}\n`); }
  }); }
}

export class WorkerRoutineRemoveCommand extends BaseCommand {
  static override paths = [["worker", "routine", "rm"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Remove a Routine definition.",
    details: "Deletes the Routine definition; refuses without --force. Run history remains readable until retention.",
    examples: [["Remove a Routine", "drwn worker routine rm harari rtn_123 --force"]],
  });
  slug = Option.String(); id = Option.String(); force = Option.Boolean("--force", false);
  async execute(): Promise<number> {
    if (!this.force) { this.context.stderr.write(`Refusing to remove Routine "${this.id}" without --force.\n`); return 1; }
    return guarded(this, async (base) => { const response = await fetchWithWorkerAuth(this.context, `${base}/api/minds/${enc(this.slug)}/routines/${enc(this.id)}`, { method: "DELETE" }); if (!response.ok) { const text = await response.text(); let body: unknown = text; try { body = JSON.parse(text); } catch { /* keep plain text */ } throw apiError(body, response.status); } this.context.stdout.write(`Removed Routine "${this.id}"; run history remains until retention.\n`); });
  }
}
