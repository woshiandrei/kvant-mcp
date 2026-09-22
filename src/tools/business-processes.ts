import { z } from "zod";
import { forOrganizations, jsonResult, kvantRequest } from "../client.js";
import { organizationReadShape, organizationWriteShape } from "../session.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerBusinessProcessesTools(server: McpServer) {
  server.tool(
    "kvant_business_processes_list",
    "List business processes",
    { ...organizationReadShape },
    async ({ organization }) => {
      const result = await forOrganizations(organization, { allowAll: true }, async () =>
        kvantRequest({ method: "GET", path: "/business_processes" })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_business_processes_run",
    "Run a business process",
    {
      business_process_id: z.number().describe("Business process ID"),
      data: z.record(z.unknown()).optional().describe("Run parameters"),
      ...organizationWriteShape,
    },
    async ({ business_process_id, data, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        kvantRequest({
          method: "POST",
          path: `/business_processes/${business_process_id}/run`,
          body: data,
        })
      );
      return jsonResult(result);
    }
  );
}
