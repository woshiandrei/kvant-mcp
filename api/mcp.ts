import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTasksTools } from "../src/tools/tasks.js";
import { registerProjectsTools } from "../src/tools/projects.js";
import { registerProjectTemplatesTools } from "../src/tools/project-templates.js";
import { registerUsersTools } from "../src/tools/users.js";
import { registerBusinessProcessesTools } from "../src/tools/business-processes.js";
import { registerReportsTools } from "../src/tools/reports.js";
import { runWithToken } from "../src/client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = (req.headers.authorization as string) || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    res.status(401).json({ error: "Missing Authorization header. Provide your Kvant API Bearer token." });
    return;
  }

  await runWithToken(token, async () => {
    const server = new McpServer({ name: "Kvant", version: "1.0.0" });

    registerTasksTools(server);
    registerProjectsTools(server);
    registerProjectTemplatesTools(server);
    registerUsersTools(server);
    registerBusinessProcessesTools(server);
    registerReportsTools(server);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
}
