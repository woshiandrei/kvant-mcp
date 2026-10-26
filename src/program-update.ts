import { kvantRequest } from "./client.js";

/**
 * Project update is not a patch. The app PUTs the whole project.
 * Dates the caller passes are wall time YYYY-MM-DD HH:mm:ss with no timezone.
 * Dates the caller omits are copied from GET unchanged.
 */

const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

/** Period fields. due_at is separate and is normalized only when it is a string. */
const PERIOD_DATE_KEYS = new Set(["start", "end", "deadline_start_date"]);

/**
 * Keep the clock digits and drop T, Z, +03, and +03:00.
 * A date with no time is midnight, the same as the date picker.
 */
export function normalizeProgramWallTime(value: string): string {
  const trimmed = value.trim();
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) return `${dateOnly[1]} 00:00:00`;
  const dateTime = DATE_TIME.exec(trimmed);
  if (!dateTime) return trimmed;
  const seconds = dateTime[4] ?? "00";
  return `${dateTime[1]} ${dateTime[2]}:${dateTime[3]}:${seconds}`;
}

function overlayValue(key: string, value: unknown): unknown {
  if (value === null) return null;
  if (PERIOD_DATE_KEYS.has(key) && typeof value === "string") {
    return normalizeProgramWallTime(value);
  }
  if (key === "due_at" && typeof value === "string") {
    return normalizeProgramWallTime(value);
  }
  return value;
}

/** Overlay patch keys onto the stored project. Absent keys stay as GET returned them. */
export function buildProgramUpdateBody(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    body[key] = overlayValue(key, value);
  }
  return body;
}

function asProject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("GET /program/{id} did not return a project object");
  }
  return { ...(payload as Record<string, unknown>) };
}

/** GET the project, overlay data, PUT the full object once. */
export async function updateProject(
  programId: number,
  patch: Record<string, unknown>
): Promise<unknown> {
  const existing = await kvantRequest({
    method: "GET",
    path: `/program/${programId}`,
  });
  const body = buildProgramUpdateBody(asProject(existing), patch);
  return kvantRequest({
    method: "PUT",
    path: `/program/${programId}`,
    body,
  });
}
