import { z } from "zod";
import { kvantRequest } from "../client.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerProjectsTools(server: McpServer) {
  server.tool(
    "kvant_projects_list",
    "Get list of projects",
    {},
    async () => {
      const result = await kvantRequest({ method: "GET", path: "/program" });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_projects_create",
    "Create a project",
    { data: z.record(z.unknown()).describe("Project creation payload") },
    async ({ data }) => {
      const result = await kvantRequest({ method: "POST", path: "/program", body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_projects_add_task",
    "Add a communication to a project",
    {
      program_id: z.number().describe("Project ID"),
      data: z.record(z.unknown()).optional().describe("Task data"),
    },
    async ({ program_id, data }) => {
      const result = await kvantRequest({ method: "POST", path: `/program/${program_id}/add_task`, body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_projects_update",
    "Update a project",
    {
      program_id: z.number().describe("Project ID"),
      data: z.record(z.unknown()).describe("Fields to update"),
    },
    async ({ program_id, data }) => {
      const result = await kvantRequest({ method: "PUT", path: `/program/${program_id}`, body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_projects_delete",
    "Delete a project",
    { program_id: z.number().describe("Project ID") },
    async ({ program_id }) => {
      const result = await kvantRequest({ method: "DELETE", path: `/program/${program_id}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_projects_init_by_template",
    "Create a project from a template",
    { data: z.record(z.unknown()).describe("Template initialization payload") },
    async ({ data }) => {
      const result = await kvantRequest({ method: "POST", path: "/program/init_by_template", body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
