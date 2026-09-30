import { z } from "zod";
import { forOrganizations, jsonResult, kvantRequest } from "../client.js";
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

export function registerReportsTools(server: McpServer) {
  server.tool(
    "kvant_reports_tasks_list",
    "Get the tasks list report (GET /report/tasks_list_report). " +
      "Example: task_filter_type_id=1, program_id=<project id>, organization=<name>. " +
      "task_filter_type_id is required by the Kvant API (422 without it). " +
      "When program_id is set, the MCP also post-filters the response by program_id so the project filter is reliable even if the API ignores the query param.",
    {
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
      ...organizationReadShape,
    },
    async ({ task_filter_type_id, program_id, program_ids, organization }) => {
      const result = await forOrganizations(organization, { allowAll: true }, async () => {
        const params: Record<string, string | number | number[] | undefined> = {
          task_filter_type_id,
        };
        if (program_id !== undefined) {
          params.program_id = program_id;
        }
        if (program_ids !== undefined && program_ids.length > 0) {
          params.program_ids = program_ids;
        }
        const data = await kvantRequest({
          method: "GET",
          path: "/report/tasks_list_report",
          params,
        });
        if (program_id !== undefined) {
          return filterReportByProgramId(data, program_id);
        }
        return data;
      });
      return jsonResult(result);
    }
  );
}
