import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alignLastDoneAtFromLogs,
  alignTaskGetPayload,
  formatKvantDateTime,
  parseKvantDateTime,
} from "../src/last-done-at.js";

/**
 * Synthetic fixtures. Do not put real user ids, task ids, names, or organizations here.
 * The process timezone must not affect these assertions.
 */

function completionLog(createdAt: string, text = "Выполнено", slug = ":task_log_completed") {
  return {
    id: 1,
    type: 3,
    created_at: createdAt,
    updated_at: createdAt,
    body: {
      from_state_id: 3,
      to_state_id: 5,
      text,
      translate_slug: slug,
    },
  };
}

describe("parseKvantDateTime", () => {
  it("reads +03, +0300, and +03:00 as the same offset", () => {
    for (const value of [
      "2026-10-05 14:31:40+03",
      "2026-10-05 14:31:40+0300",
      "2026-10-05 14:31:40+03:00",
    ]) {
      const parsed = parseKvantDateTime(value);
      assert.ok(parsed);
      assert.equal(parsed.offsetMinutes, 180);
      assert.equal(parsed.hour, 14);
      assert.equal(parsed.day, 5);
    }
  });

  it("keeps a negative offset with minutes", () => {
    const parsed = parseKvantDateTime("2026-01-15 23:45:00-05:00");
    assert.ok(parsed);
    assert.equal(parsed.offsetMinutes, -300);
    assert.equal(parsed.hour, 23);
    assert.equal(parsed.day, 15);
  });

  it("rejects a timestamp with no offset", () => {
    assert.equal(parseKvantDateTime("2026-10-05 14:31:40"), null);
  });
});

describe("formatKvantDateTime", () => {
  it("writes whole-hour offsets as +HH", () => {
    const parsed = parseKvantDateTime("2026-10-05 00:30:00+0300");
    assert.ok(parsed);
    assert.equal(formatKvantDateTime(parsed), "2026-10-05 00:30:00+03");
  });

  it("keeps non-zero offset minutes", () => {
    const parsed = parseKvantDateTime("2026-10-05 14:31:40+05:30");
    assert.ok(parsed);
    assert.equal(formatKvantDateTime(parsed), "2026-10-05 14:31:40+05:30");
  });
});

describe("alignLastDoneAtFromLogs", () => {
  it("replaces a +1h upstream last_done_at with the completion log", () => {
    const task = {
      id: 1001,
      updated_at: "2026-10-05 14:31:40+0300",
      last_done_at: "2026-10-05 15:31:40+03",
      title: null,
    };
    const aligned = alignLastDoneAtFromLogs(task, [
      completionLog(
        "2026-10-05 14:31:40+0300",
        "Выполнено. Ожидаемый результат получен",
        ":task_log_completed. :task_log_expected_result_received"
      ),
    ]) as typeof task;

    assert.equal(aligned.last_done_at, "2026-10-05 14:31:40+03");
    assert.equal(aligned.updated_at, task.updated_at);
    assert.equal(aligned.id, 1001);
  });

  it("uses the completion log rather than a later approval", () => {
    const task = {
      id: 1002,
      updated_at: "2026-10-05 18:02:15+0300",
      last_done_at: "2026-10-05 19:01:01+03",
    };
    const aligned = alignLastDoneAtFromLogs(task, [
      {
        type: 3,
        created_at: "2026-10-05 18:02:15+0300",
        body: {
          text: "Одобрено отправителем",
          translate_slug: ":task_log_approved_sender",
          to_state_id: 5,
        },
      },
      completionLog("2026-10-05 18:01:01+0300"),
    ]) as typeof task;

    assert.equal(aligned.last_done_at, "2026-10-05 18:01:01+03");
  });

  it("keeps an already-correct last_done_at string", () => {
    const task = {
      id: 1003,
      last_done_at: "2026-09-24 15:29:47+03",
    };
    const aligned = alignLastDoneAtFromLogs(task, [
      completionLog("2026-09-24 15:29:47+0300"),
    ]);
    assert.equal(aligned, task);
  });

  it("corrects a shift that crosses midnight", () => {
    const task = { id: 1004, last_done_at: "2026-10-06 00:31:40+03" };
    const aligned = alignLastDoneAtFromLogs(task, [
      completionLog("2026-10-05 23:31:40+0300"),
    ]) as typeof task;
    assert.equal(aligned.last_done_at, "2026-10-05 23:31:40+03");
  });

  it("corrects an early-morning time without moving the calendar date", () => {
    const task = { id: 1005, last_done_at: "2026-10-05 01:30:00+03" };
    const aligned = alignLastDoneAtFromLogs(task, [
      completionLog("2026-10-05 00:30:00+0300"),
    ]) as typeof task;
    assert.equal(aligned.last_done_at, "2026-10-05 00:30:00+03");
  });

  it("corrects a negative shift and keeps the log offset", () => {
    const task = { id: 1006, last_done_at: "2026-01-16 08:45:00+03" };
    const aligned = alignLastDoneAtFromLogs(task, [
      completionLog("2026-01-15 23:45:00-05:00"),
    ]) as typeof task;
    assert.equal(aligned.last_done_at, "2026-01-15 23:45:00-05");
  });

  it("uses the latest completion when the task was completed more than once", () => {
    const task = { id: 1007, last_done_at: "2026-10-05 15:31:40+03" };
    const aligned = alignLastDoneAtFromLogs(task, [
      completionLog("2026-10-01 10:00:00+0300"),
      completionLog("2026-10-05 14:31:40+03"),
    ]) as typeof task;
    assert.equal(aligned.last_done_at, "2026-10-05 14:31:40+03");
  });

  it("reads logs wrapped in data", () => {
    const task = { id: 1008, last_done_at: "2026-10-05 15:31:40+03" };
    const aligned = alignLastDoneAtFromLogs(task, {
      data: [completionLog("2026-10-05 14:31:40+0300")],
    }) as typeof task;
    assert.equal(aligned.last_done_at, "2026-10-05 14:31:40+03");
  });

  it("leaves last_done_at when there is no completion log", () => {
    const task = { id: 1009, last_done_at: "2026-10-05 15:31:40+03" };
    const logs = [
      {
        type: 3,
        created_at: "2026-10-05 14:31:40+0300",
        body: { text: "Принято", translate_slug: ":task_log_accepted" },
      },
      {
        type: 4,
        created_at: "2026-10-05 14:31:40+0300",
        body: { text: "Выполнено" },
      },
    ];
    assert.equal(alignLastDoneAtFromLogs(task, logs), task);
    assert.equal(alignLastDoneAtFromLogs(task, null), task);
    assert.equal(alignLastDoneAtFromLogs(task, []), task);
  });

  it("does not fill a null last_done_at", () => {
    const task = { id: 1010, last_done_at: null };
    assert.equal(
      alignLastDoneAtFromLogs(task, [completionLog("2026-10-05 14:31:40+0300")]),
      task
    );
  });

  it("aligns a task nested under data", () => {
    const payload = {
      data: { id: 1011, last_done_at: "2026-10-05 15:31:40+03", note: "keep" },
    };
    const aligned = alignLastDoneAtFromLogs(payload, [
      completionLog("2026-10-05 14:31:40+0300"),
    ]) as { data: { last_done_at: string; note: string } };
    assert.equal(aligned.data.last_done_at, "2026-10-05 14:31:40+03");
    assert.equal(aligned.data.note, "keep");
  });

  it("keeps a spring-forward wall time that local formatting would move", () => {
    const task = { id: 1012, last_done_at: "2026-03-29 03:30:00+03" };
    const aligned = alignLastDoneAtFromLogs(task, [
      completionLog("2026-03-29 02:30:00+0300"),
    ]) as typeof task;
    assert.equal(aligned.last_done_at, "2026-03-29 02:30:00+03");
  });
});

describe("alignTaskGetPayload", () => {
  it("corrects communication.last_done_at and leaves sibling fields", () => {
    const payload = {
      communication: {
        id: 1013,
        last_done_at: "2026-10-05 15:31:40+03",
        updated_at: "2026-10-05 14:31:40+0300",
      },
      logs: [completionLog("2026-10-05 14:31:40+0300")],
      logs_error: undefined,
    };
    const aligned = alignTaskGetPayload(payload) as typeof payload;
    assert.equal(aligned.communication.last_done_at, "2026-10-05 14:31:40+03");
    assert.equal(aligned.logs, payload.logs);
    assert.equal(aligned.communication.updated_at, payload.communication.updated_at);
  });

  it("returns other payloads unchanged", () => {
    assert.equal(alignTaskGetPayload(null), null);
    const list = [{ id: 1, last_done_at: "2026-10-05 15:31:40+03" }];
    assert.equal(alignTaskGetPayload(list), list);
  });
});
