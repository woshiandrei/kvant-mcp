import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSession, jsonResult, publicOrgs } from "../client.js";

export function registerOrganizationsTools(server: McpServer) {
  server.tool(
    "kvant_organizations_list",
    "List organizations connected to this MCP session (name, subdomain, is_default). " +
      "Call first when the user names a company or asks to check all organizations. " +
      "Pass organization name or subdomain into other tools; omit organization to use the default. " +
      'Read/list tools accept organization "all". Does not return API keys.',
    {},
    async () => {
      const session = getSession();
      return jsonResult(publicOrgs(session));
    }
  );
}
