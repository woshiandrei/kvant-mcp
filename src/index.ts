import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTasksTools } from "./tools/tasks.js";
import { registerProjectsTools } from "./tools/projects.js";
import { registerProjectTemplatesTools } from "./tools/project-templates.js";
import { registerUsersTools } from "./tools/users.js";
import { registerBusinessProcessesTools } from "./tools/business-processes.js";
import { registerReportsTools } from "./tools/reports.js";
import { registerOrganizationsTools } from "./tools/organizations.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Kvant",
    version: "1.0.0",
  });

  registerOrganizationsTools(server);
  registerTasksTools(server);
  registerProjectsTools(server);
  registerProjectTemplatesTools(server);
  registerUsersTools(server);
  registerBusinessProcessesTools(server);
  registerReportsTools(server);

  return server;
}
