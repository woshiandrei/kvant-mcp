import { z } from "zod";
import { kvantRequest } from "../client.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerBusinessProcessesTools(server: McpServer) {
  server.tool(
    "kvant_business_processes_list",
    "List business processes",
    {},
    async () => {
      const result = await kvantRequest({ method: "GET", path: "/business_processes" });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_business_processes_run",
    "Run a business process",
    {
      business_process_id: z.number().describe("Business process ID"),
      data: z.record(z.unknown()).optional().describe("Run parameters"),
    },
    async ({ business_process_id, data }) => {
      const result = await kvantRequest({ method: "POST", path: `/business_processes/${business_process_id}/run`, body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
