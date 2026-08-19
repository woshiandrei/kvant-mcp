import { z } from "zod";
import { kvantRequest } from "../client.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerTasksTools(server: McpServer) {
  server.tool(
    "kvant_tasks_list",
    "List communications (tasks) with filters",
    {
      filters: z.record(z.unknown()).optional().describe("Filter parameters for the task list"),
      page: z.number().optional().describe("Page number"),
      per_page: z.number().optional().describe("Items per page"),
    },
    async ({ filters, page, per_page }) => {
      const result = await kvantRequest({
        method: "POST",
        path: "/tasks/index",
        body: { filters, page, per_page },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_get",
    "Get a communication by key",
    { task_key: z.string().describe("Task key") },
    async ({ task_key }) => {
      const result = await kvantRequest({ method: "GET", path: `/tasks/${task_key}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_create",
    "Create a new communication",
    { data: z.record(z.unknown()).describe("Task creation payload") },
    async ({ data }) => {
      const result = await kvantRequest({ method: "POST", path: "/tasks/store", body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_update",
    "Update a communication",
    {
      task_id: z.number().describe("Task ID"),
      data: z.record(z.unknown()).describe("Fields to update"),
    },
    async ({ task_id, data }) => {
      const result = await kvantRequest({ method: "PUT", path: `/tasks/${task_id}`, body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_delete",
    "Delete a communication",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "DELETE", path: `/tasks/${task_id}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_cancel",
    "Reject or return a closed communication for revision",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/cancel` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_accept",
    "Accept/approve a communication",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/accept` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_to_work",
    "Take a communication into work",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/to_work` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_done",
    "Mark a communication as done",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/done` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_take_back",
    "Recall a communication",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/take_back` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_cancel_to_work",
    "Return a rejected communication back to work",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/cancel_to_work` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_copy_and_create",
    "Copy and create a new communication from existing one",
    { task_id: z.number().describe("Source task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/copy_and_create` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_input_value",
    "Update communication fields",
    { data: z.record(z.unknown()).describe("Field values to update") },
    async ({ data }) => {
      const result = await kvantRequest({ method: "POST", path: "/tasks/input_value", body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_move_action",
    "Move a communication action",
    {
      task_id: z.number().describe("Task ID"),
      data: z.record(z.unknown()).optional().describe("Action move payload"),
    },
    async ({ task_id, data }) => {
      const result = await kvantRequest({ method: "POST", path: `/${task_id}/actions`, body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_get_logs",
    "Get logs for a communication",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "GET", path: `/tasks/${task_id}/logs` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_add_log",
    "Add a comment to a communication",
    {
      task_id: z.number().describe("Task ID"),
      data: z.record(z.unknown()).describe("Comment payload"),
    },
    async ({ task_id, data }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/logs`, body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_get_checklists",
    "Get checklists for a communication",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "GET", path: `/tasks/${task_id}/checklists` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_get_todo",
    "Get communications with todo list by date",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const result = await kvantRequest({ method: "GET", path: `/tasks/todo/${date}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
