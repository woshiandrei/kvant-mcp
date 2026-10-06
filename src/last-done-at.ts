/**
 * Upstream Kvant returns last_done_at already shifted for some users.
 * kvant_tasks_get also loads the work log, whose task_log_completed created_at
 * is the completion instant in the same +03 clock as updated_at. This module
 * copies that instant onto last_done_at. It does not guess a timezone and
 * does not invent a timestamp when the completion log is missing.
 *
 * Parsing uses the offset written on the string. Nothing is formatted in the
 * process timezone.
 */

type ParsedKvantDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Minutes east of UTC. +03 => 180. */
  offsetMinutes: number;
};

type LogRecord = Record<string, unknown>;

const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:\s*(Z|[+-]\d{2}(?::?\d{2})?))?$/;

const OFFSET_RE = /^(Z|([+-])(\d{2})(?::?(\d{2}))?)$/;

function asRecord(value: unknown): LogRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LogRecord)
    : null;
}

export function parseKvantDateTime(value: string): ParsedKvantDateTime | null {
  const match = value.trim().match(DATE_TIME_RE);
  if (!match) return null;
  const offsetToken = match[7];
  if (!offsetToken) return null;
  const offset = offsetToken.match(OFFSET_RE);
  if (!offset) return null;

  let offsetMinutes = 0;
  if (offset[1] !== "Z") {
    const sign = offset[2] === "-" ? -1 : 1;
    offsetMinutes = sign * (Number(offset[3]) * 60 + Number(offset[4] ?? "0"));
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
    offsetMinutes,
  };
}

function utcMillis(value: ParsedKvantDateTime): number {
  return (
    Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second) -
    value.offsetMinutes * 60_000
  );
}

/** Whole-hour offsets use +HH, matching last_done_at. Others keep minutes. */
export function formatKvantDateTime(value: ParsedKvantDateTime): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const sign = value.offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(value.offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const suffix =
    minutes === 0 ? `${sign}${pad(hours)}` : `${sign}${pad(hours)}:${pad(minutes)}`;
  return `${value.year}-${pad(value.month)}-${pad(value.day)} ${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}${suffix}`;
}

function logEntries(logs: unknown): unknown[] {
  if (Array.isArray(logs)) return logs;
  const root = asRecord(logs);
  if (!root) return [];
  if (Array.isArray(root.data)) return root.data;
  if (Array.isArray(root.logs)) return root.logs;
  return [];
}

function isCompletionLog(entry: unknown): entry is LogRecord {
  const rec = asRecord(entry);
  if (!rec || rec.type !== 3) return false;
  const body = asRecord(rec.body);
  if (!body) return false;
  const slug = body.translate_slug;
  if (typeof slug === "string" && slug.includes("task_log_completed")) return true;
  const text = body.text;
  return typeof text === "string" && text.startsWith("Выполнено");
}

/** Latest completion-log created_at, or null when none can be read. */
export function latestCompletionCreatedAt(logs: unknown): string | null {
  let best: { at: string; utc: number } | null = null;
  for (const entry of logEntries(logs)) {
    if (!isCompletionLog(entry)) continue;
    const createdAt = entry.created_at;
    if (typeof createdAt !== "string") continue;
    const parsed = parseKvantDateTime(createdAt);
    if (!parsed) continue;
    const utc = utcMillis(parsed);
    if (!best || utc >= best.utc) {
      best = { at: createdAt, utc };
    }
  }
  return best?.at ?? null;
}

function taskWithLastDoneAt(task: LogRecord, lastDoneAt: string): LogRecord {
  return { ...task, last_done_at: lastDoneAt };
}

/**
 * Replace a present last_done_at with the completion-log instant.
 * Leaves the original string when it already names that instant, and leaves
 * the task alone when last_done_at is null or the completion log is absent.
 */
export function alignLastDoneAtFromLogs(communication: unknown, logs: unknown): unknown {
  const root = asRecord(communication);
  if (!root) return communication;

  const nested = asRecord(root.data);
  const task = typeof root.last_done_at === "string" ? root : nested;
  const onRoot = task === root;
  if (!task || typeof task.last_done_at !== "string" || task.last_done_at.trim() === "") {
    return communication;
  }

  const createdAt = latestCompletionCreatedAt(logs);
  if (!createdAt) return communication;
  const logParsed = parseKvantDateTime(createdAt);
  if (!logParsed) return communication;

  const currentParsed = parseKvantDateTime(task.last_done_at);
  if (currentParsed && utcMillis(currentParsed) === utcMillis(logParsed)) {
    return communication;
  }

  const corrected = formatKvantDateTime(logParsed);
  if (onRoot) return taskWithLastDoneAt(root, corrected);
  return { ...root, data: taskWithLastDoneAt(nested as LogRecord, corrected) };
}

/** kvant_tasks_get payload is { communication, logs }. */
export function alignTaskGetPayload(payload: unknown): unknown {
  const root = asRecord(payload);
  if (!root || !("communication" in root)) return payload;
  return {
    ...root,
    communication: alignLastDoneAtFromLogs(root.communication, root.logs),
  };
}
