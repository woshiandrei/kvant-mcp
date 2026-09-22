import { z } from "zod";
import { forOrganizations, jsonResult, kvantRequest } from "../client.js";
import { organizationReadShape, organizationWriteShape } from "../session.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerProjectsTools(server: McpServer) {
  server.tool(
    "kvant_projects_list",
    "Get list of projects",
    { ...organizationReadShape },
    async ({ organization }) => {
      const result = await forOrganizations(organization, { allowAll: true }, async () =>
        kvantRequest({ method: "GET", path: "/program" })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_projects_create",
    "Create a project",
    {
      data: z.record(z.unknown()).describe("Project creation payload"),
      ...organizationWriteShape,
    },
    async ({ data, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        kvantRequest({ method: "POST", path: "/program", body: data })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_projects_add_task",
    "Add a communication to a project",
    {
      program_id: z.number().describe("Project ID"),
      data: z.record(z.unknown()).optional().describe("Task data"),
      ...organizationWriteShape,
    },
    async ({ program_id, data, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        kvantRequest({ method: "POST", path: `/program/${program_id}/add_task`, body: data })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_projects_update",
    "Update a project",
    {
      program_id: z.number().describe("Project ID"),
      data: z.record(z.unknown()).describe("Fields to update"),
      ...organizationWriteShape,
    },
    async ({ program_id, data, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        kvantRequest({ method: "PUT", path: `/program/${program_id}`, body: data })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_projects_delete",
    "Delete a project",
    {
      program_id: z.number().describe("Project ID"),
      ...organizationWriteShape,
    },
    async ({ program_id, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        kvantRequest({ method: "DELETE", path: `/program/${program_id}` })
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "kvant_projects_init_by_template",
    "Create a project from a template",
    {
      data: z.record(z.unknown()).describe("Template initialization payload"),
      ...organizationWriteShape,
    },
    async ({ data, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        kvantRequest({ method: "POST", path: "/program/init_by_template", body: data })
      );
      return jsonResult(result);
    }
  );
}
