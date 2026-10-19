/**
 * /api/runs request handling, with every dependency injected so it is testable without
 * Next.js. The route files only wire real dependencies (lib/runs/server.ts).
 *
 * POST streams NDJSON PublicRunEvents while the run executes. The run is handed to
 * `waitUntil`, so it keeps going and persists after a disconnect; the browser then
 * resumes from GET /api/runs/[id]?after=<seq>, which reads the stored events.
 */
import { z } from "zod";

import { Brief } from "@/lib/agent/brief";
import type { AgentDeps } from "@/lib/agent/orchestrator";
import { fieldKey, friendlyIssue } from "@/lib/brief/messages";
import { createRun, getRun, listEvents, requestCancel, runExists, type RunLimits } from "@/lib/db/runs";
import type { Db } from "@/lib/db/sql";

import { TERMINAL_STATUSES } from "./events";
import { executeRun } from "./execute";
import { isRunId, newRunId } from "./ids";
import { clientIp, hashIp, MAX_BODY_BYTES } from "./limits";
import { NDJSON_TYPE, ndjsonLine } from "./ndjson";

export interface RunsApiDeps {
  db: Db;
  config: { liveRuns: boolean; ipSecret: string; limits: RunLimits };
  /** Throws when Qloo or the model isn't configured. */
  agentDeps: () => AgentDeps;
  waitUntil: (p: Promise<unknown>) => void;
  log?: (entry: Record<string, unknown>) => void;
  flushMs?: number;
  cancelPollMs?: number;
}

const NO_STORE = { "cache-control": "no-store" };

function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return Response.json({ error: code, message, ...extra }, { status, headers: { ...NO_STORE, ...headers } });
}

const LIMIT_MESSAGES = {
  ip_daily: "You've reached today's limit of live runs from this network. Featured reports are still open.",
  global_daily: "Sondo has reached today's live-run limit. Featured reports are still open.",
  concurrent: "Sondo is busy with other runs. Try again in a minute or two.",
} as const;

const IdempotencyKey = z.string().regex(/^[\w-]{8,64}$/);
const Body = z.object({ brief: z.unknown() });

export async function postRunHandler(req: Request, deps: RunsApiDeps): Promise<Response> {
  const log = deps.log ?? (() => {});
  if (!deps.config.liveRuns) return error(503, "paused", "Live runs are paused right now. Explore the featured reports instead.");

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return error(413, "too_large", "That brief is too large.");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return error(413, "too_large", "That brief is too large.");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return error(400, "invalid_json", "The request body must be JSON.");
  }
  const body = Body.safeParse(json);
  const parsed = Brief.safeParse(body.success ? body.data.brief : undefined, { reportInput: true });
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), field: fieldKey(i.path), message: friendlyIssue(i) }));
    return error(400, "invalid_brief", "Some fields need attention.", { issues });
  }
  const keyHeader = req.headers.get("idempotency-key");
  const key = keyHeader && IdempotencyKey.safeParse(keyHeader).success ? keyHeader : undefined;

  let agent: AgentDeps;
  try {
    agent = deps.agentDeps();
  } catch (err) {
    log({ event: "run_unavailable", reason: err instanceof Error ? err.message : "error" });
    return error(503, "unavailable", "Live research isn't available right now. Featured reports are still open.");
  }

  const id = newRunId();
  let created;
  try {
    created = await createRun(
      deps.db,
      { id, brief: parsed.data, ipHash: hashIp(clientIp(req.headers), deps.config.ipSecret), ...(key ? { idempotencyKey: key } : {}), source: "web" },
      deps.config.limits,
    );
  } catch (err) {
    log({ event: "run_create_failed", error: err instanceof Error ? err.name : "error" });
    return error(503, "unavailable", "Sondo couldn't start a run right now. Please try again shortly.");
  }
  if (created.kind === "duplicate") return error(409, "duplicate", "This brief was already submitted.", { runId: created.id });
  if (created.kind === "limited") {
    return error(429, created.reason, LIMIT_MESSAGES[created.reason], {}, { "retry-after": created.reason === "concurrent" ? "60" : "3600" });
  }

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      open = false;
    },
  });
  const write = (value: unknown) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(ndjsonLine(value)));
    } catch {
      open = false;
    }
  };

  const run = executeRun(created.id, parsed.data, {
    db: deps.db,
    agent,
    limits: deps.config.limits,
    onEvent: (e) => write(e),
    log,
    ...(deps.flushMs !== undefined ? { flushMs: deps.flushMs } : {}),
    ...(deps.cancelPollMs !== undefined ? { cancelPollMs: deps.cancelPollMs } : {}),
  })
    .catch((err: unknown) => log({ event: "run_execute_failed", runId: created.id, error: err instanceof Error ? err.name : "error" }))
    .finally(() => {
      if (!open) return;
      open = false;
      try {
        controller.close();
      } catch {
        // already closed
      }
    });
  deps.waitUntil(run);

  return new Response(stream, { status: 200, headers: { ...NO_STORE, "content-type": NDJSON_TYPE, "x-run-id": created.id, "x-accel-buffering": "no" } });
}

export async function getRunHandler(id: string, url: URL, deps: Pick<RunsApiDeps, "db" | "config">): Promise<Response> {
  if (!isRunId(id)) return error(404, "not_found", "No run with that id.");
  const row = await getRun(deps.db, id, deps.config.limits);
  if (!row) return error(404, "not_found", "No run with that id.");
  const after = Number.parseInt(url.searchParams.get("after") ?? "-1", 10);
  const events = await listEvents(deps.db, id, Number.isFinite(after) ? after : -1);
  return Response.json({ id: row.id, status: row.status, done: TERMINAL_STATUSES.has(row.status), events }, { headers: NO_STORE });
}

export async function cancelRunHandler(id: string, deps: Pick<RunsApiDeps, "db">): Promise<Response> {
  if (!isRunId(id)) return error(404, "not_found", "No run with that id.");
  if (await requestCancel(deps.db, id)) return Response.json({ id, cancelRequested: true }, { status: 202, headers: NO_STORE });
  if (await runExists(deps.db, id)) return error(409, "not_running", "This run has already finished.");
  return error(404, "not_found", "No run with that id.");
}
