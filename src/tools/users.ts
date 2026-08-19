import { z } from "zod";
import { kvantRequest } from "../client.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerUsersTools(server: McpServer) {
  server.tool(
    "kvant_users_list",
    "List employees",
    {},
    async () => {
      const result = await kvantRequest({ method: "GET", path: "/users" });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_users_get_functions",
    "Get functions of an employee",
    { user_id: z.number().describe("User ID") },
    async ({ user_id }) => {
      const result = await kvantRequest({ method: "GET", path: `/users/${user_id}/functions` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
