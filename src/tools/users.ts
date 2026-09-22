import { z } from "zod";
import { forOrganizations, jsonResult, kvantRequest } from "../client.js";
import { organizationReadShape } from "../session.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerUsersTools(server: McpServer) {
  server.tool(
    "kvant_users_list",
    "List employees",
    { ...organizationReadShape },
    async ({ organization }) => {
      const result = await forOrganizations(organization, { allowAll: true }, async () =>
        kvantRequest({ method: "GET", path: "/users" })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_users_get_functions",
    "Get functions of an employee",
    {
      user_id: z.number().describe("User ID"),
      ...organizationReadShape,
    },
    async ({ user_id, organization }) => {
      const result = await forOrganizations(organization, { allowAll: true }, async () =>
        kvantRequest({ method: "GET", path: `/users/${user_id}/functions` })
      );
      return jsonResult(result);
    }
  );
}
