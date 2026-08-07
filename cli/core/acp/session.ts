// ABOUTME: Owns ACP session state over deployed Worker runs: start, raw-event polling,
// ABOUTME: cursor delivery, settlement, continuation, and snapshot-backed reload.

import {
  RequestError,
  type CancelNotification,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type SessionNotification,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentsContext } from "../../context";
import { JwtAudienceError } from "../auth/jwt";
import { DrwnError, NotAuthenticatedError } from "../errors";
import { writeAtomically } from "../fs";
import { withOwnerLock } from "../owner-lock";
import { fetchJsonWithWorkerAuth } from "../worker-http";
import { renderError } from "../worker-run";
import { BuzzDeliveryTracker } from "./buzz-profile";
import { projectStreamEntry, type StreamEntry } from "./project-events";

export type AcpSessionRequest = (
  input: string,
  init?: RequestInit,
) => Promise<{ response: Response; body: unknown }>;

type NotifySessionUpdate = (notification: SessionNotification) => Promise<unknown>;

interface SessionState {
  sessionId: string;
  runId: string | null;
  cursor: number;
  active: boolean;
  continuable: boolean;
  cwd: string;
  lastUsed: number;
}

interface RawStreamEntry {
  seq: number;
  sourceId: string;
  event: StreamEntry;
}

interface StreamPollBody {
  lastSeq?: unknown;
  events?: unknown;
}

export type AcpRunStatus = "running" | "cancelling" | "yielded" | "cancelled" | "done" | "failed";

interface RunStatusBody {
  status: AcpRunStatus;
  runMetrics: {
    startedAt: number;
    finishedAt: number | null;
    totalTokens: number | null;
  };
}

interface ThreadSnapshotBody {
  projectionVersion?: unknown;
  streamCursor?: unknown;
  status?: unknown;
  items?: unknown;
}

type CancelRunResult =
  | { runId: string; outcome: "accepted" | "already_cancelling"; status: "cancelling" }
  | { runId: string; outcome: "already_cancelled"; status: "cancelled" }
  | { runId: string; outcome: "not_active"; status: "yielded" | "done" | "failed" }
  | { runId: string; outcome: "not_eligible"; status: "running" };

interface ActiveTurn {
  generation: number;
  runId: string | null;
  cancelRequested: boolean;
  cancelPost: Promise<void> | null;
  terminalStatus: "yielded" | "cancelled" | "done" | "failed" | null;
  cancelError: RequestError | null;
}

export interface AcpSessionManagerOptions {
  context: Pick<AgentsContext, "agentsDir">;
  slug: string;
  apiBaseUrl: string;
  request?: AcpSessionRequest;
  sleep?: (ms: number) => Promise<void>;
  env?: Record<string, string | undefined>;
  idFactory?: () => string;
  maxSessions?: number;
  now?: () => number;
  store?: boolean;
  isBuzzClient?: () => boolean;
  onDiagnostic?: (message: string) => void;
}

export const BUZZ_DELIVERY_CORRECTION =
  "The Buzz-bound turn settled without a confirmed Buzz delivery. Use one Buzz delivery tool now, and wait for its successful tool result before settling.";

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_POLL_IDLE_MS = 5_000;
const MIN_POLL_MS = 250;
const DEFAULT_MAX_SESSIONS = 100;
const SESSION_INDEX_VERSION = 2;
const LEGACY_SESSION_INDEX_VERSION = 1;
const SESSION_INDEX_BUSY = "ACP_SESSION_INDEX_BUSY";
const SESSION_OPERATION_BUSY = "ACP_SESSION_OPERATION_BUSY";
const SESSION_OPERATION_UNRECOVERABLE = "ACP_SESSION_OPERATION_LOCK_UNRECOVERABLE";
const sessionIndexWrites = new Map<string, Promise<unknown>>();

interface PersistedSession {
  sessionId: string;
  // Schema v1 has no Tasks API identity. Naming the current binding activeRunId
  // keeps a future {taskId, activeRunId} migration explicit rather than conflating IDs.
  activeRunId: string | null;
  cursor: number;
  continuable: boolean;
  cwd: string;
  lastUsed: number;
  slug: string;
}

interface PersistedSessionIndex {
  version: typeof SESSION_INDEX_VERSION;
  sessions: PersistedSession[];
}

function parseCadence(value: string | undefined, fallback: number, floor: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(floor, parsed) : fallback;
}

function promptText(params: PromptRequest): string {
  const parts = params.prompt.flatMap((block) => {
    if (block.type === "text") return [block.text];
    if (block.type === "resource_link") return [`${block.name}: ${block.uri}`];
    return [];
  });
  const message = parts.join("\n").trim();
  if (!message) throw RequestError.invalidParams(undefined, "Prompt contains no supported text content");
  return message;
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

function isInvocationPending(response: Response, body: unknown): boolean {
  return response.status === 409 && asRecord(body).error === "invocation_pending";
}

function parseRawEntries(value: unknown): RawStreamEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is RawStreamEntry => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return typeof record.seq === "number" && typeof record.sourceId === "string" &&
      !!record.event && typeof record.event === "object";
  });
}

function projectSnapshotItem(item: unknown): SessionUpdate | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  if (record.type === "user" && typeof record.text === "string") {
    return { sessionUpdate: "user_message_chunk", content: { type: "text", text: record.text } };
  }
  if ((record.type === "assistant" || record.type === "worker") && typeof record.text === "string") {
    return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: record.text } };
  }
  if (record.type === "tool" && typeof record.toolCallId === "string" && typeof record.toolName === "string") {
    return {
      sessionUpdate: "tool_call",
      toolCallId: record.toolCallId,
      title: record.toolName,
      status: record.status === "running" ? "in_progress" : "completed",
    };
  }
  return null;
}

function isTransientPollStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function parseCancelRunResult(runId: string, response: Response, body: unknown): CancelRunResult | null {
  const record = asRecord(body);
  if (record.runId !== runId || typeof record.outcome !== "string" || typeof record.status !== "string") {
    return null;
  }
  if (
    response.status === 202 &&
    (record.outcome === "accepted" || record.outcome === "already_cancelling") &&
    record.status === "cancelling"
  ) {
    return record as CancelRunResult;
  }
  if (response.status === 200 && record.outcome === "already_cancelled" && record.status === "cancelled") {
    return record as CancelRunResult;
  }
  if (
    response.status === 409 && record.outcome === "not_active" &&
    (record.status === "yielded" || record.status === "done" || record.status === "failed")
  ) {
    return record as CancelRunResult;
  }
  if (response.status === 409 && record.outcome === "not_eligible" && record.status === "running") {
    return record as CancelRunResult;
  }
  return null;
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("ACP request aborted");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

function parsePersistedSession(value: unknown, version: number): PersistedSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const activeRunId = version === LEGACY_SESSION_INDEX_VERSION ? record.runId : record.activeRunId;
  if (
    typeof record.sessionId !== "string" ||
    !(activeRunId === null || typeof activeRunId === "string") ||
    typeof record.cursor !== "number" ||
    typeof record.continuable !== "boolean" ||
    typeof record.cwd !== "string" ||
    typeof record.lastUsed !== "number" ||
    typeof record.slug !== "string"
  ) return null;
  return {
    sessionId: record.sessionId,
    activeRunId,
    cursor: Math.max(0, record.cursor),
    continuable: record.continuable,
    cwd: record.cwd,
    lastUsed: record.lastUsed,
    slug: record.slug,
  };
}

async function readPersistedIndex(path: string): Promise<Map<string, PersistedSession>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
  const parsed = JSON.parse(raw) as { version?: unknown; sessions?: unknown };
  if (
    (parsed.version !== LEGACY_SESSION_INDEX_VERSION && parsed.version !== SESSION_INDEX_VERSION) ||
    !Array.isArray(parsed.sessions)
  ) {
    throw new Error(`Unsupported ACP session index at ${path}`);
  }
  const sessions = new Map<string, PersistedSession>();
  for (const value of parsed.sessions) {
    const session = parsePersistedSession(value, parsed.version);
    if (!session) throw new Error(`Invalid ACP session index at ${path}`);
    sessions.set(session.sessionId, session);
  }
  return sessions;
}

function serializeSessionIndexWrite<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = sessionIndexWrites.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    let busyError: DrwnError | null = null;
    for (let attempt = 0; attempt < 500; attempt += 1) {
      try {
        return await withOwnerLock({
          path: `${path}.lock`,
          label: "ACP session index update",
          busyCode: SESSION_INDEX_BUSY,
          unrecoverableCode: "ACP_SESSION_INDEX_LOCK_UNRECOVERABLE",
        }, operation);
      } catch (error) {
        if (!(error instanceof DrwnError) || error.code !== SESSION_INDEX_BUSY) throw error;
        busyError = error;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    throw busyError ?? new Error("ACP session index lock timed out");
  });
  sessionIndexWrites.set(path, current);
  void current.finally(() => {
    if (sessionIndexWrites.get(path) === current) sessionIndexWrites.delete(path);
  }).catch(() => undefined);
  return current;
}

export function parseAcpRunStatus(value: unknown): AcpRunStatus | null {
  return (["running", "cancelling", "yielded", "cancelled", "done", "failed"] as unknown[])
      .includes(value)
    ? value as AcpRunStatus
    : null;
}

function parseRunStatus(value: unknown): RunStatusBody | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const status = parseAcpRunStatus(record.status);
  if (!status) return null;
  if (!record.runMetrics || typeof record.runMetrics !== "object") return null;
  const metrics = record.runMetrics as Record<string, unknown>;
  if (
    typeof metrics.startedAt !== "number" ||
    !(metrics.finishedAt === null || typeof metrics.finishedAt === "number") ||
    !(metrics.totalTokens === null || typeof metrics.totalTokens === "number")
  ) return null;
  return {
    status,
    runMetrics: {
      startedAt: metrics.startedAt,
      finishedAt: metrics.finishedAt,
      totalTokens: metrics.totalTokens,
    },
  };
}

export class AcpSessionManager {
  private readonly sessions = new Map<string, SessionState>();
  private readonly request: AcpSessionRequest;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly idFactory: () => string;
  private readonly pollMs: number;
  private readonly pollIdleMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;
  private readonly sessionIndexPath: string;
  private persistedSessions = new Map<string, PersistedSession>();
  private storeLoad: Promise<void> | null = null;
  private readonly activeTurns = new Map<string, ActiveTurn>();
  private nextTurnGeneration = 0;

  constructor(private readonly options: AcpSessionManagerOptions) {
    this.request = options.request ?? ((input, init) =>
      fetchJsonWithWorkerAuth<unknown>(options.context, input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.idFactory = options.idFactory ?? (() => `sess_${crypto.randomUUID()}`);
    this.pollMs = parseCadence(options.env?.DRWN_ACP_POLL_MS, DEFAULT_POLL_MS, MIN_POLL_MS);
    this.pollIdleMs = parseCadence(options.env?.DRWN_ACP_POLL_IDLE_MS, DEFAULT_POLL_IDLE_MS, this.pollMs);
    this.maxSessions = Math.max(1, Math.floor(options.maxSessions ?? DEFAULT_MAX_SESSIONS));
    this.now = options.now ?? Date.now;
    this.sessionIndexPath = join(options.context.agentsDir, "drwn", "acp-sessions.json");
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    await this.ensureStoreLoaded();
    const sessionId = this.idFactory();
    const session: SessionState = {
      sessionId,
      runId: null,
      cursor: 0,
      active: false,
      continuable: true,
      cwd: params.cwd,
      lastUsed: this.now(),
    };
    this.remember(session, sessionId);
    await this.persistSession(session);
    await this.prunePersistedSessions(sessionId);
    return { sessionId };
  }

  async prompt(
    params: PromptRequest,
    notify: NotifySessionUpdate,
    signal?: AbortSignal,
  ): Promise<PromptResponse> {
    throwIfAborted(signal);
    if (this.activeTurns.has(params.sessionId)) {
      throw new RequestError(-32001, `Session ${params.sessionId} already has an active prompt`);
    }
    const turn: ActiveTurn = {
      generation: ++this.nextTurnGeneration,
      runId: null,
      cancelRequested: false,
      cancelPost: null,
      terminalStatus: null,
      cancelError: null,
    };
    this.activeTurns.set(params.sessionId, turn);
    let response: PromptResponse;
    try {
      await this.ensureStoreLoaded();
      response = await this.withSessionOwnerLock(
        params.sessionId,
        () => this.promptLocked(params, notify, turn, signal),
      );
    } finally {
      if (this.activeTurns.get(params.sessionId) === turn) this.activeTurns.delete(params.sessionId);
    }
    await this.prunePersistedSessions(params.sessionId);
    return response;
  }

  private async promptLocked(
    params: PromptRequest,
    notify: NotifySessionUpdate,
    turn: ActiveTurn,
    signal?: AbortSignal,
  ): Promise<PromptResponse> {
    const session = await this.resolveSessionAfterLock(params.sessionId);
    if (!session) throw RequestError.resourceNotFound(`session:${params.sessionId}`);
    if (session.active) throw new RequestError(-32001, `Session ${params.sessionId} already has an active prompt`);
    if (!session.continuable) throw new RequestError(-32001, `Session ${params.sessionId} is terminal`);
    session.lastUsed = this.now();
    this.remember(session, session.sessionId);
    session.active = true;
    try {
      const message = promptText(params);
      if (session.runId === null) {
        session.runId = await this.startRun(message, signal);
        turn.runId = session.runId;
        await this.persistSession(session);
      } else {
        turn.runId = session.runId;
        await this.continueRun(session.runId, message, signal);
      }
      if (turn.cancelRequested) await this.ensureCancelPosted(turn);
      return await this.pollUntilSettled(session, notify, turn, signal);
    } finally {
      session.active = false;
      session.lastUsed = this.now();
      this.remember(session);
      await this.persistSession(session);
    }
  }

  /**
   * ACP cancellation is a notification racing the active prompt. It deliberately avoids
   * the prompt's long-held owner lock. Before admission completes, the intent is latched
   * and posted as soon as the exact run id is durable.
   */
  async cancelSession(params: CancelNotification): Promise<void> {
    const turn = this.activeTurns.get(params.sessionId);
    if (!turn) return;
    turn.cancelRequested = true;
    if (turn.runId) await this.ensureCancelPosted(turn);
  }

  private async ensureCancelPosted(turn: ActiveTurn): Promise<void> {
    if (!turn.runId || turn.cancelPost) return turn.cancelPost ?? Promise.resolve();
    const runId = turn.runId;
    turn.cancelPost = this.requestCancel(runId).then((result) => {
      switch (result.outcome) {
        case "accepted":
        case "already_cancelling":
          return;
        case "already_cancelled":
          turn.terminalStatus = "cancelled";
          return;
        case "not_active":
          turn.terminalStatus = result.status;
          return;
        case "not_eligible":
          turn.cancelError = new RequestError(-32001, `Worker run ${runId} is not eligible for cancellation`);
      }
    }).catch((error) => {
      turn.cancelError = error instanceof RequestError
        ? error
        : new RequestError(-32001, `Worker cancellation failed: ${renderError(error)}`);
      this.options.onDiagnostic?.(turn.cancelError.message);
    });
    await turn.cancelPost;
  }

  private async requestCancel(runId: string): Promise<CancelRunResult> {
    const { response, body } = await this.request(
      `${this.options.apiBaseUrl}/api/chat/${encodeURIComponent(runId)}/cancel`,
      { method: "POST" },
    );
    const result = parseCancelRunResult(runId, response, body);
    if (result) return result;
    if (!response.ok) {
      throw new RequestError(-32001, `Worker cancellation failed (${response.status}): ${renderError(body)}`);
    }
    throw new RequestError(-32001, "Worker cancellation returned an invalid response");
  }

  async loadSession(
    params: LoadSessionRequest,
    notify: NotifySessionUpdate,
    signal?: AbortSignal,
  ): Promise<LoadSessionResponse> {
    throwIfAborted(signal);
    await this.ensureStoreLoaded();
    const response = await this.withSessionOwnerLock(
      params.sessionId,
      () => this.loadSessionLocked(params, notify, signal),
    );
    await this.prunePersistedSessions(params.sessionId);
    return response;
  }

  private async loadSessionLocked(
    params: LoadSessionRequest,
    notify: NotifySessionUpdate,
    signal?: AbortSignal,
  ): Promise<LoadSessionResponse> {
    const cached = await this.resolveSessionAfterLock(params.sessionId);
    if (cached?.active) {
      throw new RequestError(-32001, `Session ${params.sessionId} already has an active prompt`);
    }
    const source = cached;
    if (!source?.runId) throw RequestError.resourceNotFound(`session:${params.sessionId}`);
    if (source.cwd !== params.cwd) {
      throw RequestError.invalidParams(undefined, `Session ${params.sessionId} belongs to cwd ${source.cwd}`);
    }
    const runId = source.runId;
    const { response, body } = await this.request(
      `${this.options.apiBaseUrl}/api/chat/${encodeURIComponent(runId)}/snapshot`,
      { signal },
    );
    if (response.status === 404) throw RequestError.resourceNotFound(`run:${runId}`);
    if (!response.ok) {
      throw new RequestError(-32001, `Worker snapshot load failed (${response.status}): ${renderError(body)}`);
    }
    const snapshot = body as ThreadSnapshotBody;
    const status = parseAcpRunStatus(snapshot.status);
    if (!status) {
      throw new RequestError(-32001, `Worker snapshot load returned an invalid status`);
    }
    if (status === "running" || status === "cancelling") {
      throw new RequestError(-32001, `Session ${params.sessionId} is still ${status} and cannot be loaded`);
    }
    let cursor = 0;
    const isV2Snapshot = snapshot.projectionVersion === 2;
    if (isV2Snapshot) {
      if (!Number.isSafeInteger(snapshot.streamCursor) || Number(snapshot.streamCursor) < 0) {
        throw new RequestError(-32001, "Worker v2 snapshot load returned an invalid stream cursor");
      }
      cursor = Number(snapshot.streamCursor);
    }
    const session: SessionState = {
      sessionId: params.sessionId,
      runId,
      cursor,
      active: false,
      continuable: status === "yielded",
      cwd: params.cwd,
      lastUsed: this.now(),
    };
    this.remember(session, params.sessionId);
    for (const item of Array.isArray(snapshot.items) ? snapshot.items : []) {
      const update = projectSnapshotItem(item);
      if (update) await notify({ sessionId: params.sessionId, update });
    }

    // Projection v2 returns the raw stream boundary atomically with the snapshot. Legacy
    // snapshots have no cursor, so retain the zero-poll compatibility fallback.
    if (!isV2Snapshot) {
      const cursorPoll = await this.request(
        `${this.options.apiBaseUrl}/api/minds/${encodeURIComponent(this.options.slug)}/chat/${encodeURIComponent(runId)}/stream-poll?since=0`,
        { signal },
      );
      if (!cursorPoll.response.ok) {
        this.sessions.delete(params.sessionId);
        throw new RequestError(
          -32001,
          `Worker stream cursor load failed (${cursorPoll.response.status}): ${renderError(cursorPoll.body)}`,
        );
      }
      const lastSeq = (cursorPoll.body as StreamPollBody).lastSeq;
      if (typeof lastSeq === "number") session.cursor = Math.max(0, lastSeq);
    }
    await this.persistSession(session);
    return {};
  }

  private remember(session: SessionState, protectedId?: string): void {
    this.sessions.delete(session.sessionId);
    this.sessions.set(session.sessionId, session);
    while (this.sessions.size > this.maxSessions) {
      const evictable = [...this.sessions.values()].find(
        (candidate) => !candidate.active && candidate.sessionId !== protectedId,
      );
      if (!evictable) return;
      this.sessions.delete(evictable.sessionId);
    }
  }

  private async ensureStoreLoaded(): Promise<void> {
    if (this.options.store === false) return;
    if (!this.storeLoad) {
      this.storeLoad = (async () => {
        const sessions = await readPersistedIndex(this.sessionIndexPath);
        for (const session of sessions.values()) this.persistedSessions.set(session.sessionId, session);
      })();
    }
    await this.storeLoad;
  }

  private async refreshPersistedSessions(): Promise<void> {
    if (this.options.store === false) return;
    const latest = await serializeSessionIndexWrite(
      this.sessionIndexPath,
      () => readPersistedIndex(this.sessionIndexPath),
    );
    this.persistedSessions = latest;
  }

  private async resolveSessionAfterLock(sessionId: string): Promise<SessionState | null> {
    const cached = this.sessions.get(sessionId) ?? null;
    if (this.options.store === false) return cached;
    await this.refreshPersistedSessions();
    const persisted = this.persistedSessions.get(sessionId);
    if (!persisted) {
      this.sessions.delete(sessionId);
      return null;
    }
    if (persisted.slug !== this.options.slug) return null;
    const authoritative: SessionState = {
      sessionId: persisted.sessionId,
      runId: persisted.activeRunId,
      cursor: persisted.cursor,
      active: false,
      continuable: persisted.continuable,
      cwd: persisted.cwd,
      lastUsed: persisted.lastUsed,
    };
    this.remember(authoritative, sessionId);
    return authoritative;
  }

  private async persistSession(session: SessionState): Promise<void> {
    if (this.options.store === false) return;
    const persisted: PersistedSession = {
      sessionId: session.sessionId,
      activeRunId: session.runId,
      cursor: session.cursor,
      continuable: session.continuable,
      cwd: session.cwd,
      lastUsed: session.lastUsed,
      slug: this.options.slug,
    };
    await serializeSessionIndexWrite(this.sessionIndexPath, async () => {
      // Re-read under the owner lock: atomic rename prevents torn JSON, while this merge
      // prevents a second ACP adapter from silently erasing a peer's new session.
      const latest = await readPersistedIndex(this.sessionIndexPath);
      latest.delete(session.sessionId);
      latest.set(session.sessionId, persisted);
      // Pruning happens after the current operation releases its session lock. The GC
      // then proves a candidate inactive by taking that candidate's lock before the
      // index lock, preserving the one session -> index lock order.
      const index: PersistedSessionIndex = {
        version: SESSION_INDEX_VERSION,
        sessions: [...latest.values()],
      };
      await writeAtomically(this.sessionIndexPath, `${JSON.stringify(index, null, 2)}\n`);
      this.persistedSessions = latest;
    });
  }

  private sessionOwnerLockOptions(sessionId: string) {
    const digest = createHash("sha256").update(sessionId).digest("hex");
    return {
      path: join(this.options.context.agentsDir, "drwn", "acp-session-locks", `${digest}.lock`),
      label: `ACP session ${sessionId}`,
      busyCode: SESSION_OPERATION_BUSY,
      unrecoverableCode: SESSION_OPERATION_UNRECOVERABLE,
    };
  }

  private async prunePersistedSessions(protectedId: string): Promise<void> {
    if (this.options.store === false) return;
    const skipped = new Set<string>();
    for (;;) {
      await this.refreshPersistedSessions();
      if (this.persistedSessions.size <= this.maxSessions) return;
      const candidate = [...this.persistedSessions.values()]
        .filter((session) => session.sessionId !== protectedId && !skipped.has(session.sessionId))
        .sort((left, right) => left.lastUsed - right.lastUsed || left.sessionId.localeCompare(right.sessionId))[0];
      if (!candidate) return;

      let removed = false;
      try {
        removed = await withOwnerLock(this.sessionOwnerLockOptions(candidate.sessionId), async () =>
          serializeSessionIndexWrite(this.sessionIndexPath, async () => {
            const latest = await readPersistedIndex(this.sessionIndexPath);
            if (latest.size <= this.maxSessions) {
              this.persistedSessions = latest;
              return false;
            }
            const oldest = [...latest.values()]
              .filter((session) => session.sessionId !== protectedId && !skipped.has(session.sessionId))
              .sort((left, right) =>
                left.lastUsed - right.lastUsed || left.sessionId.localeCompare(right.sessionId)
              )[0];
            if (!oldest || oldest.sessionId !== candidate.sessionId) {
              this.persistedSessions = latest;
              return false;
            }
            latest.delete(candidate.sessionId);
            const index: PersistedSessionIndex = {
              version: SESSION_INDEX_VERSION,
              sessions: [...latest.values()],
            };
            await writeAtomically(this.sessionIndexPath, `${JSON.stringify(index, null, 2)}\n`);
            this.persistedSessions = latest;
            return true;
          })
        );
      } catch (error) {
        if (
          error instanceof DrwnError &&
          (error.code === SESSION_OPERATION_BUSY || error.code === SESSION_OPERATION_UNRECOVERABLE)
        ) {
          skipped.add(candidate.sessionId);
          continue;
        }
        throw error;
      }
      if (removed) {
        skipped.clear();
      } else {
        skipped.add(candidate.sessionId);
      }
    }
  }

  private async withSessionOwnerLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    if (this.options.store === false) return operation();
    try {
      return await withOwnerLock(this.sessionOwnerLockOptions(sessionId), operation);
    } catch (error) {
      if (error instanceof DrwnError && error.code === SESSION_OPERATION_BUSY) {
        throw new RequestError(-32001, `Session ${sessionId} already has an active prompt or load`);
      }
      throw error;
    }
  }

  private async wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) return this.sleep(ms);
    throwIfAborted(signal);
    const activeSignal = signal;
    if (!this.options.sleep) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(finish, ms);
        function finish() {
          activeSignal.removeEventListener("abort", onAbort);
          resolve();
        }
        function onAbort() {
          clearTimeout(timer);
          activeSignal.removeEventListener("abort", onAbort);
          reject(abortReason(activeSignal));
        }
        activeSignal.addEventListener("abort", onAbort, { once: true });
      });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      function finish(callback: () => void) {
        activeSignal.removeEventListener("abort", onAbort);
        callback();
      }
      function onAbort() {
        finish(() => reject(abortReason(activeSignal)));
      }
      activeSignal.addEventListener("abort", onAbort, { once: true });
      this.sleep(ms).then(
        () => finish(resolve),
        (error) => finish(() => reject(error)),
      );
    });
  }

  private async startRun(message: string, signal?: AbortSignal): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      throwIfAborted(signal);
      const { response, body } = await this.request(
        `${this.options.apiBaseUrl}/api/minds/${encodeURIComponent(this.options.slug)}/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
          signal,
        },
      );
      if (isInvocationPending(response, body) && attempt === 0) {
        await this.wait(this.pollMs, signal);
        continue;
      }
      if (!response.ok) {
        throw new RequestError(-32001, `Worker run start failed (${response.status}): ${renderError(body)}`);
      }
      const runId = asRecord(body).runId;
      if (typeof runId !== "string" || runId.length === 0) {
        throw new RequestError(-32001, "Worker run start returned no runId");
      }
      return runId;
    }
    throw new RequestError(-32001, "Worker run start retry exhausted");
  }

  private async continueRun(runId: string, message: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const { response, body } = await this.request(
      `${this.options.apiBaseUrl}/api/chat/${encodeURIComponent(runId)}/message`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
        signal,
      },
    );
    if (!response.ok) {
      throw new RequestError(-32001, `Worker continuation failed (${response.status}): ${renderError(body)}`);
    }
  }

  private async pollUntilSettled(
    session: SessionState,
    notify: NotifySessionUpdate,
    turn: ActiveTurn,
    signal?: AbortSignal,
  ): Promise<PromptResponse> {
    const runId = session.runId!;
    let buzzDelivery = this.options.isBuzzClient?.() ? new BuzzDeliveryTracker() : null;
    let buzzCorrectionIssued = false;
    let consecutiveFailures = 0;
    for (;;) {
      throwIfAborted(signal);
      if (turn.cancelError) throw turn.cancelError;
      if (turn.terminalStatus) return this.settleFromStatus(session, turn.terminalStatus);
      let response: Response;
      let body: unknown;
      try {
        ({ response, body } = await this.request(
          `${this.options.apiBaseUrl}/api/minds/${encodeURIComponent(this.options.slug)}/chat/${encodeURIComponent(runId)}/stream-poll?since=${session.cursor}`,
          { signal },
        ));
      } catch (error) {
        if (signal?.aborted) throw abortReason(signal);
        if (error instanceof DrwnError || error instanceof NotAuthenticatedError || error instanceof JwtAudienceError) {
          throw error;
        }
        consecutiveFailures += 1;
        await this.wait(Math.min(this.pollIdleMs, this.pollMs * 2 ** consecutiveFailures), signal);
        continue;
      }
      if (!response.ok) {
        if (isTransientPollStatus(response.status)) {
          consecutiveFailures += 1;
          await this.wait(Math.min(this.pollIdleMs, this.pollMs * 2 ** consecutiveFailures), signal);
          continue;
        }
        throw new RequestError(-32001, `Worker stream poll failed (${response.status}): ${renderError(body)}`);
      }
      consecutiveFailures = 0;
      const poll = body as StreamPollBody;
      const entries = parseRawEntries(poll.events);
      let observedCancellation = false;
      for (const entry of entries) {
        buzzDelivery?.observe(entry.event);
        if (entry.event.v === 1 && entry.event.type === "agent.cancelled") {
          observedCancellation = true;
        }
        for (const update of projectStreamEntry(entry.event)) {
          await notify({ sessionId: session.sessionId, update });
        }
        session.cursor = Math.max(session.cursor, entry.seq);
      }
      if (typeof poll.lastSeq === "number") session.cursor = Math.max(session.cursor, poll.lastSeq);
      if (observedCancellation) {
        session.continuable = false;
        return { stopReason: "cancelled" };
      }
      if (turn.cancelError) throw turn.cancelError;
      if (turn.terminalStatus) return this.settleFromStatus(session, turn.terminalStatus);

      // The raw stream-poll contract intentionally carries no run status. The lightweight
      // owner-gated status route is the second track, including zero-event boot failures.
      let statusResponse: Response;
      let statusResult: unknown;
      try {
        ({ response: statusResponse, body: statusResult } = await this.request(
          `${this.options.apiBaseUrl}/api/chat/${encodeURIComponent(runId)}/status`,
          { signal },
        ));
      } catch (error) {
        if (signal?.aborted) throw abortReason(signal);
        if (error instanceof DrwnError || error instanceof NotAuthenticatedError || error instanceof JwtAudienceError) {
          throw error;
        }
        consecutiveFailures += 1;
        await this.wait(Math.min(this.pollIdleMs, this.pollMs * 2 ** consecutiveFailures), signal);
        continue;
      }
      if (!statusResponse.ok) {
        if (isTransientPollStatus(statusResponse.status)) {
          consecutiveFailures += 1;
          await this.wait(Math.min(this.pollIdleMs, this.pollMs * 2 ** consecutiveFailures), signal);
          continue;
        }
        throw new RequestError(
          -32001,
          `Worker status poll failed (${statusResponse.status}): ${renderError(statusResult)}`,
        );
      }
      const statusBody = parseRunStatus(statusResult);
      if (!statusBody) {
        throw new RequestError(-32001, "Worker status poll returned an invalid response");
      }
      consecutiveFailures = 0;
      const status = statusBody.status;
      if (status !== "running" && status !== "cancelling") {
        if (buzzDelivery && status !== "cancelled" && status !== "failed" && !buzzDelivery.delivered) {
          if (!buzzCorrectionIssued && status === "yielded") {
            buzzCorrectionIssued = true;
            buzzDelivery = new BuzzDeliveryTracker();
            await this.continueRun(runId, BUZZ_DELIVERY_CORRECTION, signal);
            continue;
          }
          const error = new RequestError(
            -32001,
            "Buzz delivery was not confirmed after the bounded corrective continuation",
          );
          this.options.onDiagnostic?.(error.message);
          throw error;
        }
        return this.settleFromStatus(session, status);
      }
      await this.persistSession(session);
      await this.wait(this.pollMs, signal);
    }
  }

  private settleFromStatus(
    session: SessionState,
    status: "yielded" | "cancelled" | "done" | "failed",
  ): PromptResponse {
    if (status === "yielded") return { stopReason: "end_turn" };
    session.continuable = false;
    if (status === "cancelled") return { stopReason: "cancelled" };
    if (status === "done") return { stopReason: "end_turn" };
    throw new RequestError(-32001, "Worker run failed: unknown failure");
  }
}
