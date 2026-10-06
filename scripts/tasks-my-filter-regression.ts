/**
 * type=my filter checks (no network). Run: npx tsx scripts/tasks-my-filter-regression.ts
 */
import {
  filterMyTaskList,
  readOrganizationUserId,
  readOwnerUserIdFromTaskPayload,
} from "../src/tools/my-task-filter.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function keysOf(payload: unknown): string[] {
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : [];
  return items.map((item) => {
    const key = item && typeof item === "object" ? (item as { key?: unknown }).key : undefined;
    return typeof key === "string" ? key : "";
  });
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

  // No session user id: still drop the meeting where the user is only a participant.
  const filtered = filterMyTaskList(mixed);
  assert(
    keysOf(filtered).join(",") === "own-task,own-meeting",
    `participant meeting leaked: ${keysOf(filtered).join(",")}`
  );

  // A stored membership id that does not appear as a user id must not disable the filter
  // and must not wipe the performer's own rows.
  const withMembership = filterMyTaskList(mixed, { sessionUserId: 900001 });
  assert(
    keysOf(withMembership).join(",") === "own-task,own-meeting",
    `membership id changed the filter: ${keysOf(withMembership).join(",")}`
  );

  // Session user id is trusted when it appears on the page (here, only as a participant).
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
  assert(keysOf(sessionParticipant).length === 0, "session user kept a meeting they do not perform");

  // Meetings-only page, viewer unknown: omit meetings (cannot tell performer from participant).
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
  assert(keysOf(meetingsOnly).length === 0, "meetings-only page was not dropped");

  // Same page with a known performer id keeps meetings they perform.
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
  assert(keysOf(ownMeetings).join(",") === "mine", "known performer lost their meeting");

  // Explicit to_user_ids wins, including when it selects someone other than the inferred viewer.
  const explicit = filterMyTaskList(mixed, { toUserIds: [organizer] });
  assert(keysOf(explicit).join(",") === "attended-meeting", "explicit to_user_ids ignored");

  // Conflicting non-meeting performers: do not guess. Drop meetings, keep the other rows.
  const conflict = filterMyTaskList([
    { key: "a", type_id: 1, to_user_id: performer },
    { key: "b", type_id: 1, to_user_id: organizer },
    { key: "m", type_id: 13, to_user_id: organizer, relation_track_users: [{ type: 2, user_id: performer }] },
  ]);
  assert(keysOf(conflict).join(",") === "a,b", `ambiguous page: ${keysOf(conflict).join(",")}`);

  // Relation row id is not a user id, so it must not select the viewer.
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
  assert(keysOf(rowId).join(",") === "task", `relation row id was treated as a user: ${keysOf(rowId).join(",")}`);

  const wrapped = filterMyTaskList(
    { total: 3, data: mixed, tasks: mixed },
    {}
  ) as { total: number; data: unknown[]; tasks: unknown[] };
  assert(wrapped.total === 3, "meta field changed");
  assert(keysOf({ data: wrapped.data }).join(",") === "own-task,own-meeting", "data list not filtered");
  assert(keysOf({ data: wrapped.tasks }).join(",") === "own-task,own-meeting", "tasks list not filtered");

  assert(filterMyTaskList(null) === null, "null payload changed");
  assert(Array.isArray(filterMyTaskList([])) && (filterMyTaskList([]) as unknown[]).length === 0, "empty list");

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
