import { z } from "zod";
import { forOrganizations, jsonResult, kvantRequest } from "../client.js";
import { updateProject } from "../program-update.js";
import { organizationReadShape, organizationWriteShape } from "../session.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const PROJECT_UPDATE_DESCRIPTION =
  "Update a project. Reads GET /program/{id}, overlays only keys passed in data, and sends one PUT of the full object. Omitted fields are kept. null clears a field. " +
  "start and end are the project period. Format: YYYY-MM-DD HH:mm:ss with no T and no timezone, e.g. 2026-10-20 00:00:00. A date with no time means 00:00:00, the same as the date picker. Do not send +03 or +03:00. " +
  "due_at, bound_program_id, and deadline_start_date are not the project period.";

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
    PROJECT_UPDATE_DESCRIPTION,
    {
      program_id: z.number().describe("Project ID"),
      data: z
        .record(z.unknown())
        .describe(
          "Fields to change. Only these keys are overlaid on the current project. Omit a key to keep it. null clears it. start and end: YYYY-MM-DD HH:mm:ss, no T and no timezone; a bare date is 00:00:00."
        ),
      ...organizationWriteShape,
    },
    async ({ program_id, data, organization }) => {
      const result = await forOrganizations(organization, { allowAll: false }, async () =>
        updateProject(program_id, data)
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
