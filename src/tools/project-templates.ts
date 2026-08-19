import { z } from "zod";
import { kvantRequest } from "../client.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerProjectTemplatesTools(server: McpServer) {
  server.tool(
    "kvant_project_templates_list",
    "List project templates",
    {},
    async () => {
      const result = await kvantRequest({ method: "GET", path: "/program_templates" });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_project_templates_get",
    "Get a project template with communications",
    { program_template_key: z.string().describe("Template key") },
    async ({ program_template_key }) => {
      const result = await kvantRequest({ method: "GET", path: `/program_templates/${program_template_key}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_project_templates_add_task",
    "Add a communication to a project template",
    {
      program_template_id: z.number().describe("Template ID"),
      data: z.record(z.unknown()).optional().describe("Task data"),
    },
    async ({ program_template_id, data }) => {
      const result = await kvantRequest({ method: "POST", path: `/program_templates/${program_template_id}/add_task`, body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_project_templates_delete_task",
    "Delete a communication from a project template",
    {
      program_template_id: z.number().describe("Template ID"),
      task_id: z.number().describe("Task ID to remove"),
    },
    async ({ program_template_id, task_id }) => {
      const result = await kvantRequest({ method: "DELETE", path: `/program_templates/${program_template_id}/delete_task/${task_id}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
