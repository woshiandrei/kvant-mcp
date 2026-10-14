import { z } from "zod";
import { forOrganizations, jsonResult, kvantRequest, type KvantQueryValue } from "../client.js";
import { organizationReadShape } from "../session.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function taskProgramId(item: unknown): number | undefined {
  const rec = asRecord(item);
  if (!rec) return undefined;
  const raw = rec.program_id ?? rec.programId;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  return undefined;
}

/** Keep only rows matching program_id when the API ignores the query filter. */
export function filterReportByProgramId(payload: unknown, programId: number): unknown {
  if (Array.isArray(payload)) {
    return payload.filter((item) => taskProgramId(item) === programId);
  }
  const root = asRecord(payload);
  if (!root) return payload;

  const out: Record<string, unknown> = { ...root };
  for (const key of ["data", "tasks", "items", "rows"] as const) {
    if (Array.isArray(root[key])) {
      out[key] = (root[key] as unknown[]).filter((item) => taskProgramId(item) === programId);
    }
  }
  return out;
}

/** Open communication stages. 5 (Completed) is not accepted on state_id. */
export const OPEN_REPORT_STATE_IDS = [1, 2, 3, 4] as const;

const REPORT_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/;
const REPORT_DATE_MESSAGE =
  "must be YYYY-MM-DD or YYYY-MM-DD HH:mm:ss with no timezone";

/**
 * Sortable key for a report date, or null when the value is not a real calendar date.
 * Date-only values sort as 00:00:00 on that day.
 */
export function reportDateSortKey(value: string): string | null {
  const match = REPORT_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${match[1]}${pad(month)}${pad(day)}${pad(hour)}${pad(minute)}${pad(second)}`;
}

const reportDateSchema = z.string().refine((value) => reportDateSortKey(value) !== null, {
  message: REPORT_DATE_MESSAGE,
});

const openStateIdSchema = z.number().int().min(1).max(4);

export const TASKS_LIST_REPORT_DESCRIPTION =
  "Get the tasks list report (GET /report/tasks_list_report). " +
  "Example: task_filter_type_id=1, program_id=<project id>, organization=<name>. " +
  "task_filter_type_id is required by the Kvant API (422 without it). " +
  "When program_id is set, the MCP also post-filters the response by program_id so the project filter is reliable even if the API ignores the query param. " +
  "offset and limit are applied by the API before that post-filter, so a page can contain fewer rows than limit. count stays the upstream total. " +
  "Pagination and filters are optional and are sent only when set: offset, limit, state_id (open states 1 Incoming, 2 Accepted, 3 In Progress, 4 Approve), to_user_id (performer), creator_id (sender), start_date_from, start_date_to, end_date_from, end_date_to. " +
  "Omit offset and limit to keep the previous request: those query params are not added, and the Open API returns its default first page. " +
  "Dates are YYYY-MM-DD or YYYY-MM-DD HH:mm:ss with no T and no timezone. " +
  "last_done_at in this report is the upstream value. The API can shift it by the completer's timezone versus +03. This tool does not load the work log, so it does not correct that field; kvant_tasks_get does, using the completion log.";

export const tasksListReportInputShape = {
  task_filter_type_id: z
    .number()
    .describe(
      "Required report filter type id. API returns 422 without it. Exact enum is not published by Kvant — use the same integer the web client sends for the desired report tab (bots commonly pass a positive integer such as 1)."
    ),
  program_id: z
    .number()
    .optional()
    .describe(
      "Project id (program_id). Sent as a query param and used to post-filter the report so only that project's tasks remain."
    ),
  program_ids: z
    .array(z.number())
    .optional()
    .describe(
      "Optional list of project ids sent as repeated program_ids query params (if the API supports multi-value filters)."
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Rows to skip, forwarded as offset. Integer >= 0. Omit to leave the Open API default: the parameter is not sent, so existing calls stay on the default first page."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Page size, forwarded as limit. Integer >= 1. Omit to leave the Open API default page size: the parameter is not sent. Pass offset and limit together to read later pages."
    ),
  state_id: z
    .union([openStateIdSchema, z.array(openStateIdSchema).min(1)])
    .optional()
    .describe(
      "Open state filter forwarded as state_id. 1=Incoming, 2=Accepted, 3=In Progress, 4=Approve. Completed (5) is rejected. A list is sent as repeated state_id query params. Omit for no extra state filter."
    ),
  to_user_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Performer user id, forwarded as to_user_id. Omit for no performer filter."
    ),
  creator_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Sender user id, forwarded as creator_id. Omit for no sender filter."),
  start_date_from: reportDateSchema
    .optional()
    .describe(
      "Inclusive lower bound forwarded as start_date_from. YYYY-MM-DD or YYYY-MM-DD HH:mm:ss with no T and no timezone. Omit for no lower bound."
    ),
  start_date_to: reportDateSchema
    .optional()
    .describe(
      "Inclusive upper bound forwarded as start_date_to. YYYY-MM-DD or YYYY-MM-DD HH:mm:ss with no T and no timezone. Must be on or after start_date_from when both are set."
    ),
  end_date_from: reportDateSchema
    .optional()
    .describe(
      "Inclusive lower bound forwarded as end_date_from. YYYY-MM-DD or YYYY-MM-DD HH:mm:ss with no T and no timezone. Omit for no lower bound."
    ),
  end_date_to: reportDateSchema
    .optional()
    .describe(
      "Inclusive upper bound forwarded as end_date_to. YYYY-MM-DD or YYYY-MM-DD HH:mm:ss with no T and no timezone. Must be on or after end_date_from when both are set."
    ),
  ...organizationReadShape,
};

export const tasksListReportInputSchema = z.object(tasksListReportInputShape);

export type TasksListReportArgs = z.infer<typeof tasksListReportInputSchema>;

function requireInt(value: number, name: string, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }
}

function requirePositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function normalizeStateId(stateId: number | number[]): number | number[] {
  const ids = Array.isArray(stateId) ? stateId : [stateId];
  if (ids.length === 0) {
    throw new Error("state_id must include at least one open state (1, 2, 3, or 4)");
  }
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 1 || id > 4) {
      throw new Error("state_id must be an open state: 1, 2, 3, or 4");
    }
  }
  return stateId;
}

function assertDateBound(value: string, name: string): void {
  if (reportDateSortKey(value) === null) {
    throw new Error(`${name} ${REPORT_DATE_MESSAGE}`);
  }
}

function assertDateOrder(
  from: string | undefined,
  to: string | undefined,
  stem: "start_date" | "end_date"
): void {
  if (from !== undefined) assertDateBound(from, `${stem}_from`);
  if (to !== undefined) assertDateBound(to, `${stem}_to`);
  if (from === undefined || to === undefined) return;
  const fromKey = reportDateSortKey(from);
  const toKey = reportDateSortKey(to);
  if (fromKey === null || toKey === null) return;
  if (fromKey > toKey) {
    throw new Error(`${stem}_from must be on or before ${stem}_to`);
  }
}

/**
 * Query for GET /report/tasks_list_report.
 * Pagination and filters are omitted when unset, so a call that only passes
 * task_filter_type_id / program_id / program_ids matches the previous request.
 */
export function buildTasksListReportParams(
  input: TasksListReportArgs
): Record<string, KvantQueryValue> {
  assertDateOrder(input.start_date_from, input.start_date_to, "start_date");
  assertDateOrder(input.end_date_from, input.end_date_to, "end_date");

  const params: Record<string, KvantQueryValue> = {
    task_filter_type_id: input.task_filter_type_id,
  };
  if (input.program_id !== undefined) {
    params.program_id = input.program_id;
  }
  if (input.program_ids !== undefined && input.program_ids.length > 0) {
    params.program_ids = input.program_ids;
  }
  if (input.offset !== undefined) {
    requireInt(input.offset, "offset", 0);
    params.offset = input.offset;
  }
  if (input.limit !== undefined) {
    requireInt(input.limit, "limit", 1);
    params.limit = input.limit;
  }
  if (input.state_id !== undefined) {
    params.state_id = normalizeStateId(input.state_id);
  }
  if (input.to_user_id !== undefined) {
    requirePositiveInt(input.to_user_id, "to_user_id");
    params.to_user_id = input.to_user_id;
  }
  if (input.creator_id !== undefined) {
    requirePositiveInt(input.creator_id, "creator_id");
    params.creator_id = input.creator_id;
  }
  if (input.start_date_from !== undefined) params.start_date_from = input.start_date_from;
  if (input.start_date_to !== undefined) params.start_date_to = input.start_date_to;
  if (input.end_date_from !== undefined) params.end_date_from = input.end_date_from;
  if (input.end_date_to !== undefined) params.end_date_to = input.end_date_to;
  return params;
}

/** GET /report/tasks_list_report for the active organization, then apply the program_id post-filter. */
export async function queryTasksListReport(input: TasksListReportArgs): Promise<unknown> {
  const params = buildTasksListReportParams(input);
  const data = await kvantRequest({
    method: "GET",
    path: "/report/tasks_list_report",
    params,
  });
  if (input.program_id !== undefined) {
    return filterReportByProgramId(data, input.program_id);
  }
  return data;
}

export function registerReportsTools(server: McpServer) {
  server.tool(
    "kvant_reports_tasks_list",
    TASKS_LIST_REPORT_DESCRIPTION,
    tasksListReportInputShape,
    async (args) => {
      const result = await forOrganizations(args.organization, { allowAll: true }, () =>
        queryTasksListReport(args)
      );
      return jsonResult(result);
    }
  );
}
