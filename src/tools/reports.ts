import { z } from "zod";
import { forOrganizations, jsonResult, kvantRequest } from "../client.js";
import { organizationReadShape } from "../session.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerReportsTools(server: McpServer) {
  server.tool(
    "kvant_reports_tasks_list",
    "Get the tasks list report",
    {
      params: z.record(z.string()).optional().describe("Query parameters for the report"),
      ...organizationReadShape,
    },
    async ({ params, organization }) => {
      const result = await forOrganizations(organization, { allowAll: true }, async () =>
        kvantRequest({ method: "GET", path: "/report/tasks_list_report", params })
      );
      return jsonResult(result);
    }
  );
}
