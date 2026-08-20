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
  "due_at=deadline (null if none). required_deadline=0 or null is an ordinary deadline: postpone by PUT (kvant_tasks_update or the first step inside kvant_tasks_move_action) then POST /actions for the calendar slot. POST /actions alone does not raise the stored due_at. PUT body must include id, creator_id, to_user_id, required_deadline, due_at, function_user_id, program_id, and relation_track_users: null — do not rebuild relation_track_users from get. required_deadline=1 is the exception — a hard deadline that cannot be set later than the existing due_at; if that due_at is already past, do not take into work or reschedule, close with kvant_tasks_done (is_done=1 if the expected result was achieved, 0 if not). The performer may take into work or reschedule only their own communications (they are to_user_id; list tab my); others and track are not movable. After Accepted or In Progress, cancel/take_back/delete is not allowed — close with kvant_tasks_done (including is_done=0). Delete only communications you created (you are creator_id). Not every communication is editable by the current user (track is monitor-only; sender vs performer have different actions). " +
  "time_to_accomplish=planned minutes (default often 30); time_to_accomplish_fact=actual minutes when done (null until then). " +
  "not_need_approve=1 skips the Approve stage; null/0 = sender must approve. " +
  "repeat_task_id set when spawned from a recurring template. " +
  "proof is an object when evidence is required (else null): type 1=text (min_requirement=min chars); screenshot/image seen as type 2; other kinds include link, photo, file (remaining numeric map unknown). check_description=verification criteria. " +
  "task_actions are calendar slots (meetings: date, end_date, include_to_calendar); empty when unused. " +
  "relation_track_users.type 1=sender (creator), not the performer; type 2=additional participant/observer. user_type unknown. " +
  "Dates in responses often look like 2026-08-24 12:00:00+03. When writing date/end_date/due_at, send YYYY-MM-DD HH:mm:ss with no T and no timezone (2026-08-24 12:00:00). Raise due_at with PUT first if the new slot is later than the stored deadline; the slot (date and end_date) cannot be later than the stored due_at. " +
  "Flags 0/1: is_canceled, is_active. is_done answers whether the expected result (communication_result) was achieved: 1=yes, 0=closed without achieving it (closing is still allowed). " +
  "program_id=project; business_process and business_process_action_queue_id link a process; mass_task_id=bulk-created group. " +
  "UI sort only: position, position_control, section_position_id. " +
  "Nested arrays programs, attentions, required_comments, task_labels, meeting_queues are empty when unused. " +
  "Unknown — do not infer: closed_overdue; due_changes; control_result; result_text; problem_status; policy_for_study_count; product; remaining proof.type and input.type numbers; relation_track_users.user_type.";

const KVANT_WALL_TIME =
  'Format: YYYY-MM-DD HH:mm:ss with no T and no timezone, e.g. "2026-08-24 12:00:00". Do not send +03, +03:00, or ISO 8601.';

const DEFAULT_SLOT_TITLE = "Выполнить действие";

type NestedRecord = Record<string, unknown>;

type CalendarSlotArgs = {
  task_id: number;
  title?: string;
  include_to_calendar?: number;
  date?: string;
  end_date?: string | null;
  due_at?: string;
  data?: NestedRecord;
  creator_id?: number;
  to_user_id?: number;
  required_deadline?: number;
  function_user_id?: number | null;
  program_id?: number | null;
};

type PostponePutBody = {
  id: number;
  due_at: string;
  creator_id: number;
  to_user_id: number;
  required_deadline: number;
  function_user_id: number | null;
  program_id: number | null;
  relation_track_users: null;
};

type PostponeIdentity = {
  creator_id: number;
  to_user_id: number;
  required_deadline: number;
  function_user_id: number | null;
  program_id: number | null;
  due_at?: string | null;
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

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function toKvantDatetime(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) return trimmed;
  return `${match[1]} ${match[2]}:${match[3] ?? "00"}`;
}

type IdentityArgs = {
  creator_id?: number;
  to_user_id?: number;
  required_deadline?: number;
  function_user_id?: number | null;
  program_id?: number | null;
  data?: NestedRecord;
};

function pickIdentity(args: IdentityArgs): Omit<PostponeIdentity, "due_at"> | null {
  const nested = args.data && typeof args.data === "object" ? args.data : {};
  const creator_id = args.creator_id ?? asFiniteNumber(nested.creator_id);
  const to_user_id = args.to_user_id ?? asFiniteNumber(nested.to_user_id);
  const required_deadline = args.required_deadline ?? asFiniteNumber(nested.required_deadline);
  const function_user_id =
    args.function_user_id !== undefined
      ? args.function_user_id
      : asNullableNumber(nested.function_user_id);
  const program_id =
    args.program_id !== undefined ? args.program_id : asNullableNumber(nested.program_id);

  if (creator_id === undefined || to_user_id === undefined || required_deadline === undefined) {
    return null;
  }

  return {
    creator_id,
    to_user_id,
    required_deadline,
    function_user_id: function_user_id ?? null,
    program_id: program_id ?? null,
  };
}

function postponePutBody(taskId: number, identity: Omit<PostponeIdentity, "due_at">, dueAt: string): PostponePutBody {
  return {
    id: taskId,
    due_at: toKvantDatetime(dueAt),
    creator_id: identity.creator_id,
    to_user_id: identity.to_user_id,
    required_deadline: identity.required_deadline,
    function_user_id: identity.function_user_id,
    program_id: identity.program_id,
    relation_track_users: null,
  };
}

async function fetchTaskByNumericId(taskId: number): Promise<PostponeIdentity | null> {
  try {
    const result = (await kvantRequest({
      method: "GET",
      path: `/tasks/${taskId}`,
    })) as PostponeIdentity & { id?: number };
    const creator_id = asFiniteNumber(result?.creator_id);
    const to_user_id = asFiniteNumber(result?.to_user_id);
    if (creator_id === undefined || to_user_id === undefined) return null;
    return {
      creator_id,
      to_user_id,
      required_deadline: asFiniteNumber(result.required_deadline) ?? 0,
      function_user_id: asNullableNumber(result.function_user_id) ?? null,
      program_id: asNullableNumber(result.program_id) ?? null,
      due_at: typeof result.due_at === "string" ? result.due_at : null,
    };
  } catch {
    return null;
  }
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
      `New communication deadline at the TOP LEVEL. ${KVANT_WALL_TIME} Must be >= date and >= end_date. If omitted, becomes the slot end. POST /actions cannot raise the stored due_at — kvant_tasks_move_action PUTs first when identity fields are present.`
    ),
  data: z
    .record(z.unknown())
    .optional()
    .describe(
      "Do not use. Fields must be top-level. Nested title/date/end_date/due_at/include_to_calendar here are still merged."
    ),
};

const postponeIdentityShape = {
  creator_id: z
    .number()
    .optional()
    .describe("Sender id from list/get/todo. Needed so move_action can PUT due_at before the slot."),
  to_user_id: z
    .number()
    .optional()
    .describe("Performer id from list/get/todo. Copy from the communication object."),
  required_deadline: z
    .number()
    .optional()
    .describe("0/null = ordinary, may postpone. 1 = hard: cannot PUT due_at later than the stored deadline."),
  function_user_id: z
    .number()
    .nullable()
    .optional()
    .describe("Org function/role id from the communication, or null."),
  program_id: z
    .number()
    .nullable()
    .optional()
    .describe("Project id from the communication, or null."),
};

const moveActionShape = {
  ...calendarSlotShape,
  ...postponeIdentityShape,
};

export function registerTasksTools(server: McpServer) {
  server.tool(
    "kvant_tasks_list",
    "List communications. POST /tasks/index with a FLAT JSON body — do not wrap fields in filters. There is no search parameter: to find a task by name (e.g. акты) call type my (and control/track if needed) and read inputs_values. type selects the list tab: my (performer), control (sender), track (participant) — not type_id. No combined list: for all communications call three times. Defaults: states=[1,2,3,4,5], offset=0, limit=10. kvant_tasks_get_todo is today's agenda by date, not a name search. " +
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
        .optional()
        .describe(
          'Required list tab at the TOP LEVEL (not under filters). "my" = current user is performer/recipient. "control" = current user is sender. "track" = current user is a participant (monitor only). No combined list — for all communications call three times with my, control, and track. Not for today\'s agenda — use kvant_tasks_get_todo. No search field.'
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
      filters: z
        .record(z.unknown())
        .optional()
        .describe(
          'Do not use. Pass type, states, limit, etc. at the top level. Nested type/states here are still merged. There is no search field.'
        ),
    },
    async (args) => {
      const nested = args.filters && typeof args.filters === "object" ? args.filters : {};
      const typeRaw = args.type ?? nested.type;
      const type =
        typeRaw === "my" || typeRaw === "control" || typeRaw === "track" ? typeRaw : undefined;
      if (!type) {
        throw new Error(
          'Missing type. Pass type at the top level ("my" | "control" | "track"), not nested under filters. There is no search field — list with type my and read inputs_values.'
        );
      }
      const states = args.states ?? (Array.isArray(nested.states) ? (nested.states as number[]) : undefined);
      const offset = args.offset ?? asFiniteNumber(nested.offset);
      const limit = args.limit ?? asFiniteNumber(nested.limit);
      const creator_user_ids =
        args.creator_user_ids !== undefined
          ? args.creator_user_ids
          : ((nested.creator_user_ids as number[] | null | undefined) ?? null);
      const deadline_period_start =
        args.deadline_period_start !== undefined
          ? args.deadline_period_start
          : asNullableString(nested.deadline_period_start) ?? null;
      const deadline_period_end =
        args.deadline_period_end !== undefined
          ? args.deadline_period_end
          : asNullableString(nested.deadline_period_end) ?? null;
      const to_user_ids =
        args.to_user_ids !== undefined
          ? args.to_user_ids
          : ((nested.to_user_ids as number[] | null | undefined) ?? null);
      const user_labels =
        args.user_labels !== undefined
          ? args.user_labels
          : ((nested.user_labels as Array<string | number> | null | undefined) ?? null);
      const with_communication_errors =
        args.with_communication_errors ??
        (typeof nested.with_communication_errors === "boolean"
          ? nested.with_communication_errors
          : false);

      const result = await kvantRequest({
        method: "POST",
        path: "/tasks/index",
        body: {
          states: states ?? [1, 2, 3, 4, 5],
          type,
          offset: offset ?? 0,
          limit: limit ?? 10,
          creator_user_ids,
          deadline_period_start,
          deadline_period_end,
          to_user_ids,
          user_labels,
          with_communication_errors,
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
    "First step to postpone an ordinary deadline (required_deadline=0/null): PUT due_at. Copy creator_id, to_user_id, required_deadline, function_user_id, program_id from list/get/todo. Always sends id and relation_track_users: null (do not rebuild that array — it breaks the PUT). " +
      KVANT_WALL_TIME +
      " Then move the calendar slot with kvant_tasks_move_action (that tool also PUTs first when identity fields are passed). Not for work news (kvant_tasks_add_log). Not for stage changes. Hard deadline (required_deadline=1): do not set due_at later than the stored deadline.",
    {
      task_id: z.number().describe("Numeric communication id (not key). Also sent as body id."),
      creator_id: z
        .number()
        .optional()
        .describe("Sender id from the communication object. Required after merge."),
      to_user_id: z
        .number()
        .optional()
        .describe("Performer id from the communication object. Required after merge."),
      required_deadline: z
        .number()
        .optional()
        .describe("0 = ordinary (can postpone). 1 = hard. Required after merge."),
      due_at: z
        .string()
        .optional()
        .describe(`New deadline. Required. ${KVANT_WALL_TIME}`),
      function_user_id: z
        .number()
        .nullable()
        .optional()
        .describe("Org function/role id, or null."),
      program_id: z
        .number()
        .nullable()
        .optional()
        .describe("Project id, or null."),
      data: z
        .record(z.unknown())
        .optional()
        .describe(
          "Do not use. Pass creator_id, to_user_id, required_deadline, due_at, function_user_id, program_id at the top level. Nested fields here are still merged. relation_track_users is always sent as null."
        ),
    },
    async (args) => {
      const nested = args.data && typeof args.data === "object" ? args.data : {};
      const dueRaw = args.due_at ?? asString(nested.due_at);
      if (!dueRaw) {
        throw new Error(
          'Missing due_at. Pass top-level fields, not nested under "data": creator_id, to_user_id, required_deadline, due_at, function_user_id, program_id.'
        );
      }
      const identity = pickIdentity(args);
      if (!identity) {
        throw new Error(
          "Missing creator_id, to_user_id, or required_deadline. Copy them from kvant_tasks_list, kvant_tasks_get, or kvant_tasks_get_todo."
        );
      }
      if (identity.required_deadline === 1) {
        const fetched = await fetchTaskByNumericId(args.task_id);
        const currentDue = fetched?.due_at ? toKvantDatetime(fetched.due_at) : undefined;
        if (currentDue && toKvantDatetime(dueRaw) > currentDue) {
          throw new Error(
            "required_deadline=1 is a hard deadline: cannot postpone due_at later than the stored deadline. If that due_at is already past, close with kvant_tasks_done (is_done=1 or 0)."
          );
        }
      }
      const body = postponePutBody(args.task_id, identity, dueRaw);
      const result = await kvantRequest({
        method: "PUT",
        path: `/tasks/${args.task_id}`,
        body,
      });
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
    "Update one communication field (POST /tasks/input_value). Changes the value that later appears in inputs_values. Not for news/progress about the work (use kvant_tasks_add_log). Not every communication is editable by the current user. Not for due date / calendar slot (use kvant_tasks_update then kvant_tasks_move_action, or kvant_tasks_to_work to take into work). All body fields are required.",
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
    "Postpone an ordinary deadline and/or move the calendar slot of a communication already In Progress (перенести срок). This tool PUTs due_at first (same body as kvant_tasks_update: id + identity fields + relation_track_users: null), then POST /actions. POST /actions alone cannot raise the stored due_at. After list/get/todo pass creator_id, to_user_id, required_deadline, function_user_id, program_id together with the slot (or they are loaded via GET /tasks/{id} when that works). Performer only (you are to_user_id); In Progress only. " +
      KVANT_WALL_TIME +
      " If the user names one time for both action and deadline, use that time for date, end_date, AND due_at — do not add 30 minutes after due_at. Hard deadline (required_deadline=1) cannot be PUT later than the stored due_at. Not for taking into work (kvant_tasks_to_work) or content/news edits.",
    moveActionShape,
    async (args) => {
      const slot = resolveCalendarSlotBody(args);
      let identity = pickIdentity(args);
      let storedDueAt: string | null | undefined;
      let putResult: unknown;

      if (!identity) {
        const fetched = await fetchTaskByNumericId(args.task_id);
        if (fetched) {
          identity = {
            creator_id: fetched.creator_id,
            to_user_id: fetched.to_user_id,
            required_deadline: fetched.required_deadline,
            function_user_id: fetched.function_user_id,
            program_id: fetched.program_id,
          };
          storedDueAt = fetched.due_at;
        }
      } else if (identity.required_deadline === 1 && storedDueAt == null) {
        storedDueAt = (await fetchTaskByNumericId(args.task_id))?.due_at;
      }

      if (!identity) {
        throw new Error(
          "Cannot postpone: missing creator_id, to_user_id, required_deadline (and function_user_id, program_id). Copy them from kvant_tasks_list, kvant_tasks_get, or kvant_tasks_get_todo, then call this tool again. POST /actions will not raise the stored due_at by itself."
        );
      }

      if (identity.required_deadline === 1) {
        const currentDue = storedDueAt ? toKvantDatetime(storedDueAt) : undefined;
        if (currentDue && slot.due_at > currentDue) {
          throw new Error(
            "required_deadline=1 is a hard deadline: cannot postpone due_at later than the stored deadline. If that due_at is already past, close with kvant_tasks_done (is_done=1 or 0)."
          );
        }
      } else {
        putResult = await kvantRequest({
          method: "PUT",
          path: `/tasks/${args.task_id}`,
          body: postponePutBody(args.task_id, identity, slot.due_at),
        });
      }

      const actionResult = await kvantRequest({
        method: "POST",
        path: `/tasks/${args.task_id}/actions`,
        body: slot,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ due_at_put: putResult ?? null, action: actionResult }, null, 2),
          },
        ],
      };
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
    "Get communications on the todo/agenda for one date (YYYY-MM-DD). Not a name search — to find a task by title use kvant_tasks_list with type my and read inputs_values.",
    { date: z.string().describe("Date in YYYY-MM-DD format") },
    async ({ date }) => {
      const result = await kvantRequest({ method: "GET", path: `/tasks/todo/${date}` });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
