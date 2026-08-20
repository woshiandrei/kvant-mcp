import { z } from "zod";
import { kvantRequest } from "../client.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const TASK_RESPONSE_GUIDE =
  "How to read a communication object: " +
  "title and body are usually null. Read text from inputs_values by input.translate_slug (not title/body). " +
  "type_id is the kind: 1=task, 2=appeal, 6=decision, 13=meeting (not 1-4). Slugs: " +
  "task communication_name/description/result/proof; " +
  "appeal question_title + appeal_text; " +
  "decision decision_title/situation/data/solution; " +
  "meeting meeting_name/description/location. " +
  "input.type: 2=text, 3=proof field, 5=location; other input.type values unknown. " +
  "Use numeric id with accept/done/cancel/update/delete/to_work; use string key with kvant_tasks_get and UI URLs. " +
  "state_id: 1=Incoming, 2=Accepted, 3=In Progress, 4=Approve, 5=Completed; prev_state_id is the previous stage (null if never left Incoming). " +
  "List request type (my/control/track) is the list tab, not type_id. " +
  "creator_id=sender, to_user_id=performer (equal when self-assigned), first_creator_id=original sender. " +
  "function_user_id=org function/role the performer is acting in — same user can have several functions. " +
  "due_at=deadline (null if none). required_deadline=0 or null is an ordinary deadline: the performer may postpone it with kvant_tasks_move_action (In Progress) by sending a new due_at. required_deadline=1 is the exception — a hard deadline that cannot be set later than the existing due_at; if that due_at is already past, do not take into work or reschedule, close with kvant_tasks_done (is_done=1 if the expected result was achieved, 0 if not). The performer may take into work or reschedule only their own communications (they are to_user_id; list tab my); others and track are not movable. After Accepted or In Progress, cancel/take_back/delete is not allowed — close with kvant_tasks_done (including is_done=0). Delete only communications you created (you are creator_id). Not every communication is editable by the current user (track is monitor-only; sender vs performer have different actions). " +
  "time_to_accomplish=planned minutes (default often 30); time_to_accomplish_fact=actual minutes when done (null until then). " +
  "not_need_approve=1 skips the Approve stage; null/0 = sender must approve. " +
  "repeat_task_id set when spawned from a recurring template. " +
  "proof is an object when evidence is required (else null): type 1=text (min_requirement=min chars); screenshot/image seen as type 2; other kinds include link, photo, file (remaining numeric map unknown). check_description=verification criteria. " +
  "task_actions are calendar slots (meetings: date, end_date, include_to_calendar); empty when unused. " +
  "relation_track_users.type 1=sender (creator), not the performer; type 2=additional participant/observer. user_type unknown. " +
  "Dates in responses often look like 2026-08-24 12:00:00+03. When writing date/end_date/due_at to to_work or move_action, send YYYY-MM-DD HH:mm:ss with no T and no timezone (2026-08-24 12:00:00). The calendar slot (date and end_date) cannot be later than due_at — if the user names one time for both the action and the deadline, set end_date and due_at to that time (do not add 30 minutes after the deadline). " +
  "Flags 0/1: is_canceled, is_active. is_done answers whether the expected result (communication_result) was achieved: 1=yes, 0=closed without achieving it (closing is still allowed). " +
  "program_id=project; business_process and business_process_action_queue_id link a process; mass_task_id=bulk-created group. " +
  "UI sort only: position, position_control, section_position_id. " +
  "Nested arrays programs, attentions, required_comments, task_labels, meeting_queues are empty when unused. " +
  "Unknown — do not infer: closed_overdue; due_changes; control_result; result_text; problem_status; policy_for_study_count; product; remaining proof.type and input.type numbers; relation_track_users.user_type.";

const UNSPECIFIED_PAYLOAD =
  "API body field names are not yet specified. Pass the OpenAPI/Make JSON as-is. Do not invent names from the list/get response (store/update payloads are form fields, not inputs_values).";

const KVANT_WALL_TIME =
  'Format: YYYY-MM-DD HH:mm:ss with no T and no timezone, e.g. "2026-08-24 12:00:00". Do not send +03, +03:00, or ISO 8601.';

const DEFAULT_SLOT_TITLE = "Выполнить действие";

type CalendarSlotArgs = {
  task_id: number;
  title?: string;
  include_to_calendar?: number;
  date?: string;
  end_date?: string | null;
  due_at?: string;
  data?: Record<string, unknown>;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function toKvantDatetime(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) return trimmed;
  return `${match[1]} ${match[2]}:${match[3] ?? "00"}`;
}

function resolveCalendarSlotBody(args: CalendarSlotArgs): {
  title: string;
  include_to_calendar: number;
  date: string;
  end_date: string | null;
  due_at: string;
} {
  const nested = args.data && typeof args.data === "object" ? args.data : {};
  const titleRaw = args.title ?? asString(nested.title);
  const includeRaw = args.include_to_calendar ?? asFiniteNumber(nested.include_to_calendar);
  const dateRaw = args.date ?? asString(nested.date);
  const endRaw =
    args.end_date !== undefined ? args.end_date : asNullableString(nested.end_date);
  const dueRaw = args.due_at ?? asString(nested.due_at);

  if (!dateRaw) {
    throw new Error(
      'Missing date. Pass top-level fields, not nested under "data": title, include_to_calendar, date, end_date, due_at.'
    );
  }

  const date = toKvantDatetime(dateRaw);
  const end_date =
    endRaw === undefined || endRaw === null ? (endRaw ?? null) : toKvantDatetime(endRaw);
  let due_at = dueRaw ? toKvantDatetime(dueRaw) : end_date ?? date;

  // Slot start/end cannot be later than the communication deadline.
  if (date > due_at) {
    due_at = date;
  }
  if (end_date && end_date > due_at) {
    due_at = end_date;
  }

  const title = titleRaw?.trim() ? titleRaw : DEFAULT_SLOT_TITLE;

  return {
    title,
    include_to_calendar: includeRaw ?? 1,
    date,
    end_date,
    due_at,
  };
}

const calendarSlotShape = {
  task_id: z.number().describe("Numeric communication id (not key)."),
  title: z
    .string()
    .optional()
    .describe(
      `Calendar slot title at the TOP LEVEL (not under data). Copy task_actions[].title from kvant_tasks_get, or omit for "${DEFAULT_SLOT_TITLE}".`
    ),
  include_to_calendar: z
    .number()
    .optional()
    .describe("0 = do not add the slot to calendar, 1 = add. Top level. Default 1."),
  date: z
    .string()
    .optional()
    .describe(`Required slot start at the TOP LEVEL. ${KVANT_WALL_TIME} Must not be later than due_at.`),
  end_date: z
    .string()
    .nullable()
    .optional()
    .describe(
      `Slot end at the TOP LEVEL, or null. ${KVANT_WALL_TIME} Must not be later than due_at. If the user sets the deadline and the action to the same time, use that time for end_date too — do not add 30 minutes past due_at.`
    ),
  due_at: z
    .string()
    .optional()
    .describe(
      `New communication deadline at the TOP LEVEL. ${KVANT_WALL_TIME} Must be >= date and >= end_date (the API rejects a slot that ends after due_at). For an ordinary deadline (required_deadline=0/null), send the postponed due_at here — that is how the deadline moves. If omitted, becomes the slot end. Only if required_deadline=1 can due_at not be later than the existing due_at.`
    ),
  data: z
    .record(z.unknown())
    .optional()
    .describe(
      "Do not use. Fields must be top-level. Nested title/date/end_date/due_at/include_to_calendar here are still merged."
    ),
};

export function registerTasksTools(server: McpServer) {
  server.tool(
    "kvant_tasks_list",
    "Search/list communications. POST /tasks/index with a flat JSON body (not wrapped in filters). type is required and selects the list tab: my (performer), control (sender), track (participant) — not the communication kind (that is type_id). There is no combined list: to see all communications, call this tool three times (my, control, track). Defaults: states=[1,2,3,4,5], offset=0, limit=10. For today's agenda use kvant_tasks_get_todo, not type. " +
      TASK_RESPONSE_GUIDE,
    {
      states: z
        .array(z.number())
        .optional()
        .describe(
          "Stage IDs to include. 1=Incoming, 2=Accepted, 3=In Progress, 4=Approve, 5=Completed. Default [1,2,3,4,5]."
        ),
      type: z
        .enum(["my", "control", "track"])
        .describe(
          'Required list tab. "my" = current user is performer/recipient. "control" = current user is sender. "track" = current user is a participant (monitor only). No combined list — for all communications call three times with my, control, and track. Not for today\'s agenda — use kvant_tasks_get_todo.'
        ),
      offset: z.number().optional().describe("Pagination offset. Default 0."),
      limit: z.number().optional().describe("Page size. Default 10."),
      creator_user_ids: z
        .array(z.number())
        .nullable()
        .optional()
        .describe("Filter by sender/creator user IDs. Useful with type my or track. null = no filter."),
      deadline_period_start: z
        .string()
        .nullable()
        .optional()
        .describe("Deadline range start (date string). null = no filter."),
      deadline_period_end: z
        .string()
        .nullable()
        .optional()
        .describe("Deadline range end (date string). null = no filter."),
      to_user_ids: z
        .array(z.number())
        .nullable()
        .optional()
        .describe("Filter by recipient/performer user IDs. Useful with type control or track. null = no filter."),
      user_labels: z
        .array(z.union([z.string(), z.number()]))
        .nullable()
        .optional()
        .describe("Filter by user labels. null = no filter."),
      with_communication_errors: z
        .boolean()
        .optional()
        .describe("If true, only communications with violations/errors. Default false. How this maps to problem_status is unknown — do not infer."),
    },
    async (args) => {
      const result = await kvantRequest({
        method: "POST",
        path: "/tasks/index",
        body: {
          states: args.states ?? [1, 2, 3, 4, 5],
          type: args.type,
          offset: args.offset ?? 0,
          limit: args.limit ?? 10,
          creator_user_ids: args.creator_user_ids ?? null,
          deadline_period_start: args.deadline_period_start ?? null,
          deadline_period_end: args.deadline_period_end ?? null,
          to_user_ids: args.to_user_ids ?? null,
          user_labels: args.user_labels ?? null,
          with_communication_errors: args.with_communication_errors ?? false,
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_get",
    "Get a communication by string key (not numeric id). " + TASK_RESPONSE_GUIDE,
    { task_key: z.string().describe("Communication key from the list/get response (field key), not numeric id.") },
    async ({ task_key }) => {
      const result = await kvantRequest({ method: "GET", path: `/tasks/${task_key}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_create",
    "Create a new communication (POST /tasks/store). Sender is the current user. Appears as Incoming to the performer. type_id: 1=task, 2=appeal, 6=decision, 13=meeting. Text goes in inputs_values as {value, task_input_id}, not title/body. Meeting calendar slots (task_actions) and proof object are not in this create example — do not invent those field names.",
    {
      to_user_id: z.number().describe("Performer/recipient user ID."),
      type_id: z
        .number()
        .describe("Communication kind. 1=task, 2=appeal, 6=decision, 13=meeting."),
      due_at: z
        .string()
        .nullable()
        .optional()
        .describe("Deadline datetime string. null = no deadline. Default null."),
      required_deadline: z
        .number()
        .optional()
        .describe(
          "1 = hard deadline: cannot later postpone past this due_at; if due_at is already past the performer cannot take it into work and must close with kvant_tasks_done (is_done 0 or 1). 0 = can be moved. Default 0."
        ),
      inputs_values: z
        .array(
          z.object({
            value: z.string().describe("Field text."),
            task_input_id: z
              .number()
              .describe(
                "Field id for this type_id. task(1): 1=name (required), 2=description, 3=expected result, 26=proof. appeal(2): 33=title (required), 4=text (required). decision(6): 34=title, 13=situation, 14=data, 15=solution (all required). meeting(13): 35=name (required), 36=description, 40=location."
              ),
          })
        )
        .describe("Form fields. At minimum the required name/title for the type_id."),
      function_user_id: z
        .number()
        .nullable()
        .optional()
        .describe("Performer's org function/role ID. null = default. Same user can have several functions."),
      task_labels: z
        .array(z.union([z.string(), z.number()]))
        .nullable()
        .optional()
        .describe("Labels. null = none."),
      relation_track_users: z
        .array(
          z.object({
            id: z.number().describe("User ID to attach as a relation (not the same as list response type)."),
            user_type: z
              .number()
              .describe("Seen as 1 in the create example. Meaning of other values unknown — do not infer."),
          })
        )
        .optional()
        .describe("Users to attach. Create example: [{id, user_type: 1}]. Empty/omit if none beyond defaults."),
      program_id: z
        .number()
        .nullable()
        .optional()
        .describe("Project ID. null = none."),
    },
    async (args) => {
      const result = await kvantRequest({
        method: "POST",
        path: "/tasks/store",
        body: {
          to_user_id: args.to_user_id,
          due_at: args.due_at ?? null,
          required_deadline: args.required_deadline ?? 0,
          type_id: args.type_id,
          inputs_values: args.inputs_values,
          function_user_id: args.function_user_id ?? null,
          task_labels: args.task_labels ?? null,
          relation_track_users: args.relation_track_users ?? [],
          program_id: args.program_id ?? null,
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_update",
    "Rare. Mainly a sender (creator) method to rewrite the communication description itself. The performer almost never needs this. Do NOT use this to post work progress, news, or any update about work — that belongs in kvant_tasks_add_log. Not every communication is editable by the current user. Do NOT use this to change due date, deadline, or calendar slot (kvant_tasks_move_action if In Progress, kvant_tasks_to_work to take into work) and not for stage changes (accept/done/cancel). " +
      UNSPECIFIED_PAYLOAD,
    {
      task_id: z.number().describe("Numeric communication id (not key)."),
      data: z.record(z.unknown()).describe(UNSPECIFIED_PAYLOAD),
    },
    async ({ task_id, data }) => {
      const result = await kvantRequest({ method: "PUT", path: `/tasks/${task_id}`, body: data });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_delete",
    "Delete only a communication you created (you are creator_id). Do not use this to cancel one already Accepted or In Progress — close it with kvant_tasks_done (is_done=0 if the expected result was not achieved).",
    { task_id: z.number().describe("Numeric communication id (not key).") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "DELETE", path: `/tasks/${task_id}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_cancel",
    "Sender rejects a communication that is on Approve (from others) and returns it to the performer for revision. Not a way to cancel after Accepted or In Progress — those stages close with kvant_tasks_done (including is_done=0). All body fields are required.",
    {
      task_id: z.number().describe("Numeric communication id (not key)."),
      text: z.string().describe("Revision comment for the performer, e.g. what to redo."),
      required_deadline: z
        .number()
        .describe(
          "1 = hard deadline (cannot later postpone past due_at; if due_at is already past, performer cannot take into work and must close with kvant_tasks_done), 0 = can be moved."
        ),
      due_at: z
        .string()
        .nullable()
        .describe("New deadline datetime, or null to leave/clear. Required (may be null)."),
    },
    async ({ task_id, text, required_deadline, due_at }) => {
      const result = await kvantRequest({
        method: "POST",
        path: `/tasks/${task_id}/cancel`,
        body: { text, required_deadline, due_at },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_accept",
    "Accept an incoming communication (Incoming -> Accepted) or approve a completed one (Approve -> Completed). The action depends on the current stage.",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "POST", path: `/tasks/${task_id}/accept` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_to_work",
    "Take your own communication into work (Accepted -> In Progress) and set the calendar slot / deadline. Performer only (you are to_user_id); do not call for others or track. This is a stage change, not a later reschedule (that is kvant_tasks_move_action). Call kvant_tasks_get first. Pass title, include_to_calendar, date, end_date, due_at at the TOP LEVEL — never nested under data. " +
      KVANT_WALL_TIME +
      " date and end_date cannot be later than due_at. Ordinary deadline (required_deadline=0/null): due_at may be any new time as long as the slot is not after it. Hard deadline (required_deadline=1) is the exception: due_at cannot be later than the existing deadline; if that due_at is already past, close with kvant_tasks_done (is_done=1 or 0) instead of this tool.",
    calendarSlotShape,
    async (args) => {
      const body = resolveCalendarSlotBody(args);
      const result = await kvantRequest({
        method: "POST",
        path: `/tasks/${args.task_id}/to_work`,
        body,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_done",
    "Close the communication as performer (moves it to Approve for the sender). This is NOT the final completed state. After Accepted or In Progress, cancel is not allowed — this is the way out, including is_done=0 when the expected result was not achieved. If required_deadline=1 and due_at is already past, close immediately here (is_done=1 or 0); do not call kvant_tasks_to_work or kvant_tasks_move_action. is_done is whether the expected result was achieved, not whether the task is being closed. All body fields are required.",
    {
      task_id: z.number().describe("Numeric communication id (not key)."),
      comment: z.string().describe("Comment sent with the completion."),
      is_done: z
        .number()
        .describe(
          "Was the expected final result (communication_result) achieved? 1=yes, 0=no. The communication can be closed either way."
        ),
    },
    async ({ task_id, comment, is_done }) => {
      const result = await kvantRequest({
        method: "POST",
        path: `/tasks/${task_id}/done`,
        body: { comment, is_done },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_take_back",
    "Withdraw/revoke a communication (sender action) before the performer has Accepted or taken it into work. After Accepted or In Progress this is not a cancel path — the performer closes with kvant_tasks_done (including is_done=0).",
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
    "Copy an existing communication and create a new one for a performer. All body fields are required.",
    {
      task_id: z.number().describe("Source numeric communication id (not key)."),
      to_user_id: z.number().describe("Performer/recipient of the copy."),
      function_user_id: z
        .number()
        .nullable()
        .describe("Performer's org function/role ID, or null for default. Required (may be null)."),
    },
    async ({ task_id, to_user_id, function_user_id }) => {
      const result = await kvantRequest({
        method: "POST",
        path: `/tasks/${task_id}/copy_and_create`,
        body: { to_user_id, function_user_id },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_input_value",
    "Update one communication field (POST /tasks/input_value). Changes the value that later appears in inputs_values. Not for news/progress about the work (use kvant_tasks_add_log). Not every communication is editable by the current user. Not for due date / calendar slot (use kvant_tasks_to_work or kvant_tasks_move_action). All body fields are required.",
    {
      task_id: z.number().describe("Numeric communication id (not key). Sent in the body, not the URL."),
      value: z.string().describe("New field value."),
      task_input_id: z
        .number()
        .describe(
          "Field id. task(1): 1=name, 2=description, 3=expected result, 26=proof. appeal(2): 33=title, 4=text. decision(6): 34=title, 13=situation, 14=data, 15=solution. meeting(13): 35=name, 36=description, 40=location."
        ),
      proof: z
        .unknown()
        .nullable()
        .describe("Proof payload, or null if not updating proof. Required (may be null). Shape beyond null unknown — do not invent."),
    },
    async ({ task_id, value, task_input_id, proof }) => {
      const result = await kvantRequest({
        method: "POST",
        path: "/tasks/input_value",
        body: { task_id, value, task_input_id, proof },
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_move_action",
    "Postpone an ordinary deadline or move the calendar slot of a communication already In Progress (перенести срок). For required_deadline=0/null this is allowed: send the NEW due_at together with the new slot. Performer only (you are to_user_id); In Progress only. Call kvant_tasks_get first and copy title from task_actions. Pass title, include_to_calendar, date, end_date, due_at at the TOP LEVEL — never nested under data. " +
      KVANT_WALL_TIME +
      " The slot cannot end after due_at (API 400 otherwise). If the user names one time for both action and deadline, use that time for date, end_date, AND due_at — do not add 30 minutes after due_at. If they want a 30-minute slot starting at that time, set due_at to the slot end. Hard deadline (required_deadline=1) is the only case you must not postpone past the existing due_at. Not for taking into work (kvant_tasks_to_work) or content edits.",
    calendarSlotShape,
    async (args) => {
      const body = resolveCalendarSlotBody(args);
      const result = await kvantRequest({
        method: "POST",
        path: `/tasks/${args.task_id}/actions`,
        body,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_get_logs",
    "Get comments/work log for a communication. Progress and news about the work live here, not in the description.",
    { task_id: z.number().describe("Task ID") },
    async ({ task_id }) => {
      const result = await kvantRequest({ method: "GET", path: `/tasks/${task_id}/logs` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "kvant_tasks_add_log",
    "Add a comment to a communication. Default way to record news, progress, or any update about work on this communication — use this instead of kvant_tasks_update. All body fields are required.",
    {
      task_id: z.number().describe("Numeric communication id (not key)."),
      text: z.string().describe("Comment text: news, progress, or a work update on this communication."),
      required: z
        .number()
        .describe("Required. Example 0. Meaning of 1 unknown — do not infer."),
      accept_comment: z
        .number()
        .describe("Required. Example 0. Meaning of 1 unknown — do not infer."),
      type: z
        .number()
        .describe("Comment type. Required. Example 0. Other values unknown — do not infer."),
      to_user_ids: z
        .array(z.number())
        .nullable()
        .describe("Notify these user IDs, or null. Required (may be null)."),
    },
    async ({ task_id, text, required, accept_comment, type, to_user_ids }) => {
      const result = await kvantRequest({
        method: "POST",
        path: `/tasks/${task_id}/logs`,
        body: { text, required, accept_comment, type, to_user_ids },
      });
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
