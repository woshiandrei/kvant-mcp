/**
 * type=my post-filter and role annotation.
 *
 * Upstream POST /tasks/index with type=my is the "my" tab. Non-meeting rows are
 * performer tasks (to_user_id = you). Meetings (type_id 13) also include invites
 * where you are only a calendar participant (relation_track_users type 2):
 * Kvant puts those in my because they require going/not-going — they are not
 * performer work and they are not the track tab.
 *
 * Index rows omit organization_user. When that object is present (logs),
 * organization_user.id is a membership row; user_id matches to_user_id.
 * Session user_id from older consents is often missing. This filter does not
 * require it.
 */

const MEETING_TYPE_ID = 13;
const TRACK_PARTICIPANT_TYPE = 2;

/** MCP-added. Not an upstream field. */
export const MCP_MY_ROLE_FIELD = "mcp_role";

export type MyListRole = "performer" | "meeting_invite" | "unknown";

export type MyTaskListFilterInput = {
  /** Non-empty to_user_ids from the tool call. Those performers are kept as-is. */
  toUserIds?: number[] | null;
  /**
   * Optional session org.user_id. Used only when that id appears on the page
   * as to_user_id or relation_track_users.user_id. A membership row id does not.
   */
  sessionUserId?: number;
};

type RecordLike = Record<string, unknown>;

function asId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asRecord(value: unknown): RecordLike | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as RecordLike;
}

/** User id that matches to_user_id. organization_user.id is the membership row — ignore it. */
export function readOrganizationUserId(value: unknown): number | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  return asId(rec.user_id);
}

export function listTaskLikeItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  if (!root) return [];
  if (Array.isArray(root.data)) return root.data;
  if (Array.isArray(root.tasks)) return root.tasks;
  return [];
}

/** First organization_user.user_id on a task index/get payload, if the API sent one. */
export function readOwnerUserIdFromTaskPayload(payload: unknown): number | undefined {
  for (const item of listTaskLikeItems(payload)) {
    const rec = asRecord(item);
    if (!rec) continue;
    const userId = readOrganizationUserId(rec.organization_user);
    if (userId !== undefined) return userId;
  }
  return undefined;
}

function taskToUserId(item: unknown): number | undefined {
  const rec = asRecord(item);
  if (!rec) return undefined;
  return asId(rec.to_user_id);
}

function taskTypeId(item: unknown): number | undefined {
  const rec = asRecord(item);
  if (!rec) return undefined;
  return asId(rec.type_id);
}

function trackRows(item: unknown): RecordLike[] {
  const rec = asRecord(item);
  if (!rec || !Array.isArray(rec.relation_track_users)) return [];
  return rec.relation_track_users.filter((row): row is RecordLike => asRecord(row) !== undefined);
}

/** Participant user id. The relation row's own id is not a user id. */
function trackUserId(row: RecordLike): number | undefined {
  const direct = asId(row.user_id);
  if (direct !== undefined) return direct;
  const user = asRecord(row.user);
  if (!user) return undefined;
  return asId(user.user_id) ?? asId(user.id);
}

function isMeetingInviteFor(item: unknown, userId: number): boolean {
  if (taskTypeId(item) !== MEETING_TYPE_ID) return false;
  return trackRows(item).some(
    (row) => trackUserId(row) === userId && asId(row.type) === TRACK_PARTICIPANT_TYPE
  );
}

function payloadMentionsUser(items: unknown[], userId: number): boolean {
  return items.some((item) => {
    if (taskToUserId(item) === userId) return true;
    return trackRows(item).some((row) => trackUserId(row) === userId);
  });
}

/**
 * Who the API-key owner is, without trusting a membership id.
 * Non-meeting rows in the raw my tab are performer tasks and share one to_user_id.
 * Meetings are not used for this guess: the API mixes performer meetings with
 * going/not-going invites.
 */
function inferViewerId(items: unknown[]): number | undefined {
  const performerIds = new Set<number>();
  let sawNonMeeting = false;
  for (const item of items) {
    if (taskTypeId(item) === MEETING_TYPE_ID) continue;
    sawNonMeeting = true;
    const performer = taskToUserId(item);
    if (performer !== undefined) performerIds.add(performer);
  }
  if (!sawNonMeeting || performerIds.size !== 1) return undefined;
  return [...performerIds][0];
}

function resolveViewerId(items: unknown[], sessionUserId: number | undefined): number | undefined {
  if (sessionUserId !== undefined && payloadMentionsUser(items, sessionUserId)) {
    return sessionUserId;
  }
  return inferViewerId(items);
}

function withRole(item: unknown, role: MyListRole): unknown {
  const rec = asRecord(item);
  if (!rec) return item;
  return { ...rec, [MCP_MY_ROLE_FIELD]: role };
}

function roleForViewer(item: unknown, viewer: number): MyListRole | undefined {
  if (taskToUserId(item) === viewer) return "performer";
  if (isMeetingInviteFor(item, viewer)) return "meeting_invite";
  return undefined;
}

function filterItems(items: unknown[], input: MyTaskListFilterInput): unknown[] {
  const explicit =
    Array.isArray(input.toUserIds) && input.toUserIds.length > 0 ? input.toUserIds : undefined;
  if (explicit) {
    const allowed = new Set(explicit);
    return items.flatMap((item) => {
      const id = taskToUserId(item);
      if (id === undefined || !allowed.has(id)) return [];
      return [withRole(item, "performer")];
    });
  }

  const viewer = resolveViewerId(items, input.sessionUserId);
  if (viewer === undefined) {
    // Cannot tell performer from invite. Keep the raw my tab so going/not-going
    // meetings are not dropped; callers must inspect to_user_id / relation_track_users.
    return items.map((item) => withRole(item, "unknown"));
  }

  return items.flatMap((item) => {
    const role = roleForViewer(item, viewer);
    return role !== undefined ? [withRole(item, role)] : [];
  });
}

/**
 * Keep type=my rows the current user owes an action on: performer work, plus
 * meetings that need going/not-going. Annotate mcp_role.
 */
export function filterMyTaskList(payload: unknown, input: MyTaskListFilterInput = {}): unknown {
  if (Array.isArray(payload)) return filterItems(payload, input);
  const root = asRecord(payload);
  if (!root) return payload;
  const hasList = Array.isArray(root.data) || Array.isArray(root.tasks);
  if (!hasList) return payload;
  const out: RecordLike = { ...root };
  if (Array.isArray(root.data)) out.data = filterItems(root.data, input);
  if (Array.isArray(root.tasks)) out.tasks = filterItems(root.tasks, input);
  return out;
}
