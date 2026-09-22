import { z } from "zod";
import { forOrganizations, jsonResult, kvantRequest } from "../client.js";
import { organizationReadShape, organizationWriteShape } from "../session.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerProjectTemplatesTools(server: McpServer) {
  server.tool(
    "kvant_project_templates_list",
    "List project templates",
    { ...organizationReadShape },
    async ({ organization }) => {
      const result = await forOrganizations(organization, { allowAll: true }, async () =>
        kvantRequest({ method: "GET", path: "/program_templates" })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_project_templates_get",
    "Get a project template with communications",
    {
      program_template_key: z.string().describe("Template key"),
      ...organizationReadShape,
    },
    async ({ program_template_key, organization }) => {
      const result = await forOrganizations(organization, { allowAll: true }, async () =>
        kvantRequest({ method: "GET", path: `/program_templates/${program_template_key}` })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_project_templates_add_task",
    "Add a communication to a project template",
    {
      program_template_id: z.number().describe("Template ID"),
      data: z.record(z.unknown()).optional().describe("Task data"),
      ...organizationWriteShape,
    },
    async ({ program_template_id, data, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        kvantRequest({
          method: "POST",
          path: `/program_templates/${program_template_id}/add_task`,
          body: data,
        })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_project_templates_delete_task",
    "Delete a communication from a project template",
    {
      program_template_id: z.number().describe("Template ID"),
      task_id: z.number().describe("Task ID to remove"),
      ...organizationWriteShape,
    },
    async ({ program_template_id, task_id, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        kvantRequest({
          method: "DELETE",
          path: `/program_templates/${program_template_id}/delete_task/${task_id}`,
        })
      );
      return jsonResult(result);
    }
  );
}
