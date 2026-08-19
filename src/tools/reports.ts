import { z } from "zod";
import { kvantRequest } from "../client.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerReportsTools(server: McpServer) {
  server.tool(
    "kvant_reports_tasks_list",
    "Get the tasks list report",
    { params: z.record(z.string()).optional().describe("Query parameters for the report") },
    async ({ params }) => {
      const result = await kvantRequest({ method: "GET", path: "/report/tasks_list_report", params });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
