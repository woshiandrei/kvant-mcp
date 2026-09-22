import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTasksTools } from "../src/tools/tasks.js";
import { registerProjectsTools } from "../src/tools/projects.js";
import { registerProjectTemplatesTools } from "../src/tools/project-templates.js";
import { registerUsersTools } from "../src/tools/users.js";
import { registerBusinessProcessesTools } from "../src/tools/business-processes.js";
import { registerReportsTools } from "../src/tools/reports.js";
import { registerOrganizationsTools } from "../src/tools/organizations.js";
import { parseBearerToken, runWithSession } from "../src/client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = (req.headers.authorization as string) || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://kvant-mcp.vercel.app";

  if (!token) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );
    res.status(401).json({
      error: "Missing Authorization header. Provide your Kvant MCP Bearer token.",
    });
    return;
  }

  let session;
  try {
    session = await parseBearerToken(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );
    res.status(401).json({ error: message });
    return;
  }

  await runWithSession(session, async () => {
    const server = new McpServer({ name: "Kvant", version: "1.0.0" });

    registerOrganizationsTools(server);
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
