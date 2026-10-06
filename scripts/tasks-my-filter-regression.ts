/**
 * type=my filter checks (no network). Run: npx tsx scripts/tasks-my-filter-regression.ts
 */
import {
  filterMyTaskList,
  MCP_MY_ROLE_FIELD,
  readOrganizationUserId,
  readOwnerUserIdFromTaskPayload,
} from "../src/tools/my-task-filter.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function itemsOf(payload: unknown): Array<Record<string, unknown>> {
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : [];
  return items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
}

function keysOf(payload: unknown): string[] {
  return itemsOf(payload).map((item) => (typeof item.key === "string" ? item.key : ""));
}

function rolesOf(payload: unknown): string {
  return itemsOf(payload)
    .map((item) => `${item.key}:${item[MCP_MY_ROLE_FIELD]}`)
    .join(",");
}

function main() {
  const performer = 11;
  const organizer = 20;

  const mixed = [
    { key: "own-task", type_id: 1, to_user_id: performer, creator_id: organizer },
    {
      key: "own-meeting",
      type_id: 13,
      to_user_id: performer,
      creator_id: organizer,
      relation_track_users: [{ id: 900, type: 1, user_id: organizer }],
    },
    {
      key: "attended-meeting",
      type_id: 13,
      to_user_id: organizer,
      creator_id: organizer,
      relation_track_users: [
        { id: 901, type: 1, user_id: organizer },
        { id: 902, type: 2, user_id: performer },
      ],
    },
  ];

  // Inferred viewer: keep performer work and going/not-going invites, marked.
  const filtered = filterMyTaskList(mixed);
  assert(
    rolesOf(filtered) ===
      "own-task:performer,own-meeting:performer,attended-meeting:meeting_invite",
    `roles: ${rolesOf(filtered)}`
  );

  // A stored membership id that does not appear as a user id must not disable inference.
  const withMembership = filterMyTaskList(mixed, { sessionUserId: 900001 });
  assert(
    rolesOf(withMembership) ===
      "own-task:performer,own-meeting:performer,attended-meeting:meeting_invite",
    `membership id changed the filter: ${rolesOf(withMembership)}`
  );

  // Session user id on an invite-only page: keep the meeting, mark meeting_invite.
  const sessionParticipant = filterMyTaskList(
    [
      {
        key: "attended-only",
        type_id: 13,
        to_user_id: organizer,
        relation_track_users: [{ id: 1, type: 2, user_id: performer }],
      },
    ],
    { sessionUserId: performer }
  );
  assert(
    rolesOf(sessionParticipant) === "attended-only:meeting_invite",
    `invite-only page: ${rolesOf(sessionParticipant)}`
  );

  // Meetings-only page, viewer unknown: keep rows so RSVP is not dropped; mark unknown.
  const meetingsOnly = filterMyTaskList([
    {
      key: "m1",
      type_id: 13,
      to_user_id: organizer,
      relation_track_users: [{ type: 2, user_id: performer }],
    },
    {
      key: "m2",
      type_id: "13",
      to_user_id: String(organizer),
      relation_track_users: [{ type: 2, user_id: String(performer) }],
    },
  ]);
  assert(rolesOf(meetingsOnly) === "m1:unknown,m2:unknown", `meetings-only: ${rolesOf(meetingsOnly)}`);

  // Known viewer: own meeting is performer; invite is meeting_invite.
  const ownMeetings = filterMyTaskList(
    [
      { key: "mine", type_id: 13, to_user_id: performer },
      {
        key: "theirs",
        type_id: 13,
        to_user_id: organizer,
        relation_track_users: [{ type: 2, user_id: performer }],
      },
    ],
    { sessionUserId: performer }
  );
  assert(
    rolesOf(ownMeetings) === "mine:performer,theirs:meeting_invite",
    `known viewer meetings: ${rolesOf(ownMeetings)}`
  );

  // Explicit to_user_ids is performer-only (no invites unless to_user_id matches).
  const explicit = filterMyTaskList(mixed, { toUserIds: [organizer] });
  assert(rolesOf(explicit) === "attended-meeting:performer", "explicit to_user_ids ignored");

  // Conflicting non-meeting performers: do not guess. Keep all, mark unknown.
  const conflict = filterMyTaskList([
    { key: "a", type_id: 1, to_user_id: performer },
    { key: "b", type_id: 1, to_user_id: organizer },
    { key: "m", type_id: 13, to_user_id: organizer, relation_track_users: [{ type: 2, user_id: performer }] },
  ]);
  assert(rolesOf(conflict) === "a:unknown,b:unknown,m:unknown", `ambiguous page: ${rolesOf(conflict)}`);

  // Relation row id is not a user id. Infer viewer from the non-meeting to_user_id.
  const rowId = filterMyTaskList(
    [
      {
        key: "task",
        type_id: 1,
        to_user_id: organizer,
        relation_track_users: [{ id: performer, type: 1, user_id: organizer }],
      },
      {
        key: "meeting",
        type_id: 13,
        to_user_id: 30,
        relation_track_users: [{ id: 7, type: 2, user_id: organizer }],
      },
    ],
    { sessionUserId: performer }
  );
  assert(
    rolesOf(rowId) === "task:performer,meeting:meeting_invite",
    `relation row id: ${rolesOf(rowId)}`
  );

  const wrapped = filterMyTaskList({ total: 3, data: mixed, tasks: mixed }, {}) as {
    total: number;
    data: unknown[];
    tasks: unknown[];
  };
  assert(wrapped.total === 3, "meta field changed");
  assert(
    rolesOf({ data: wrapped.data }) ===
      "own-task:performer,own-meeting:performer,attended-meeting:meeting_invite",
    "data list not filtered"
  );
  assert(
    rolesOf({ data: wrapped.tasks }) ===
      "own-task:performer,own-meeting:performer,attended-meeting:meeting_invite",
    "tasks list not filtered"
  );

  assert(filterMyTaskList(null) === null, "null payload changed");
  assert(Array.isArray(filterMyTaskList([])) && (filterMyTaskList([]) as unknown[]).length === 0, "empty list");

  // Someone else's non-meeting is dropped when the viewer is known.
  const leaked = filterMyTaskList(
    [
      { key: "mine", type_id: 1, to_user_id: performer },
      { key: "theirs", type_id: 1, to_user_id: organizer },
    ],
    { sessionUserId: performer }
  );
  assert(keysOf(leaked).join(",") === "mine", `leaked other task: ${keysOf(leaked).join(",")}`);

  // organization_user.id is the membership row. Only user_id matches to_user_id.
  assert(
    readOrganizationUserId({ id: 900, user_id: performer }) === performer,
    "organization_user.id was used instead of user_id"
  );
  assert(readOrganizationUserId({ id: 900 }) === undefined, "membership id returned as a user id");
  assert(
    readOwnerUserIdFromTaskPayload([{ organization_user: { id: 900, user_id: "11" } }]) === 11,
    "payload user_id not read"
  );
  assert(
    readOwnerUserIdFromTaskPayload([{ to_user_id: performer }]) === undefined,
    "index row without organization_user invented an owner"
  );
  assert(
    readOwnerUserIdFromTaskPayload({ data: [{ organization_user: { id: 1, user_id: 22 } }] }) === 22,
    "wrapped payload user_id not read"
  );

  console.log("tasks-my-filter-regression: ok");
}

main();
