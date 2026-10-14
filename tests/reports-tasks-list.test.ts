import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { runWithSession, type KvantQueryValue } from "../src/client.js";
import type { Session } from "../src/session.js";
import {
  OPEN_REPORT_STATE_IDS,
  TASKS_LIST_REPORT_DESCRIPTION,
  buildTasksListReportParams,
  queryTasksListReport,
  tasksListReportInputSchema,
} from "../src/tools/reports.js";

/**
 * Synthetic fixtures. Do not put real user ids, task ids, names, or organizations here.
 */

const session: Session = {
  v: 1,
  orgs: [
    {
      id: "org-1",
      name: "Example",
      subdomain: "example",
      api_key: "test-key",
    },
  ],
  default_org_id: "org-1",
};

const previousFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = previousFetch;
});

function keysOf(params: Record<string, KvantQueryValue>): string[] {
  return Object.keys(params);
}

describe("buildTasksListReportParams", () => {
  it("omits pagination and filters when they are unset", () => {
    assert.deepEqual(buildTasksListReportParams({ task_filter_type_id: 1 }), {
      task_filter_type_id: 1,
    });
  });

  it("keeps the previous program query and drops an empty program_ids list", () => {
    assert.deepEqual(
      buildTasksListReportParams({
        task_filter_type_id: 1,
        program_id: 10,
        program_ids: [10, 11],
      }),
      {
        task_filter_type_id: 1,
        program_id: 10,
        program_ids: [10, 11],
      }
    );
    assert.deepEqual(
      buildTasksListReportParams({ task_filter_type_id: 1, program_ids: [] }),
      { task_filter_type_id: 1 }
    );
  });

  it("sends offset and limit only when set, including either one alone", () => {
    assert.deepEqual(
      buildTasksListReportParams({ task_filter_type_id: 1, offset: 40, limit: 20 }),
      { task_filter_type_id: 1, offset: 40, limit: 20 }
    );
    assert.deepEqual(buildTasksListReportParams({ task_filter_type_id: 1, offset: 0 }), {
      task_filter_type_id: 1,
      offset: 0,
    });
    assert.deepEqual(keysOf(buildTasksListReportParams({ task_filter_type_id: 1, limit: 40 })), [
      "task_filter_type_id",
      "limit",
    ]);
  });

  it("forwards state, performer, sender, and date filters", () => {
    assert.deepEqual(
      buildTasksListReportParams({
        task_filter_type_id: 1,
        state_id: [1, 2, 3, 4],
        to_user_id: 11,
        creator_id: 20,
        start_date_from: "2026-01-01",
        start_date_to: "2026-01-31 23:59:59",
        end_date_from: "2026-02-01",
        end_date_to: "2026-02-28",
      }),
      {
        task_filter_type_id: 1,
        state_id: [1, 2, 3, 4],
        to_user_id: 11,
        creator_id: 20,
        start_date_from: "2026-01-01",
        start_date_to: "2026-01-31 23:59:59",
        end_date_from: "2026-02-01",
        end_date_to: "2026-02-28",
      }
    );
    assert.equal(
      buildTasksListReportParams({ task_filter_type_id: 1, state_id: 2 }).state_id,
      2
    );
  });

  it("accepts each open state and rejects completed or empty state filters", () => {
    for (const stateId of OPEN_REPORT_STATE_IDS) {
      assert.equal(
        buildTasksListReportParams({ task_filter_type_id: 1, state_id: stateId }).state_id,
        stateId
      );
    }
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, state_id: 5 }),
      /open state/
    );
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, state_id: 0 }),
      /open state/
    );
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, state_id: [1, 5] }),
      /open state/
    );
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, state_id: [] }),
      /at least one open state/
    );
  });

  it("rejects bad pagination and user ids", () => {
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, offset: -1 }),
      /offset/
    );
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, limit: 0 }),
      /limit/
    );
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, limit: 1.5 }),
      /limit/
    );
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, to_user_id: 0 }),
      /to_user_id/
    );
    assert.throws(
      () => buildTasksListReportParams({ task_filter_type_id: 1, creator_id: -3 }),
      /creator_id/
    );
  });

  it("checks date bounds and inclusive ranges", () => {
    assert.throws(
      () =>
        buildTasksListReportParams({
          task_filter_type_id: 1,
          start_date_from: "2026-02-01",
          start_date_to: "2026-01-01",
        }),
      /start_date_from must be on or before start_date_to/
    );
    assert.throws(
      () =>
        buildTasksListReportParams({
          task_filter_type_id: 1,
          end_date_from: "2026-01-01 10:00:00",
          end_date_to: "2026-01-01 09:00:00",
        }),
      /end_date_from must be on or before end_date_to/
    );
    assert.throws(
      () =>
        buildTasksListReportParams({
          task_filter_type_id: 1,
          start_date_from: "2026-02-31",
        }),
      /start_date_from/
    );
    assert.throws(
      () =>
        buildTasksListReportParams({
          task_filter_type_id: 1,
          end_date_to: "2026-01-01T00:00:00",
        }),
      /end_date_to/
    );
    assert.deepEqual(
      buildTasksListReportParams({
        task_filter_type_id: 1,
        start_date_from: "2024-02-29",
        start_date_to: "2024-02-29 00:00:00",
      }),
      {
        task_filter_type_id: 1,
        start_date_from: "2024-02-29",
        start_date_to: "2024-02-29 00:00:00",
      }
    );
    assert.throws(
      () =>
        buildTasksListReportParams({
          task_filter_type_id: 1,
          end_date_from: "2026-02-29",
        }),
      /end_date_from/
    );
  });
});

describe("kvant_reports_tasks_list schema", () => {
  it("documents pagination and filters on the tool description and fields", () => {
    for (const name of [
      "offset",
      "limit",
      "state_id",
      "to_user_id",
      "creator_id",
      "start_date_from",
      "start_date_to",
      "end_date_from",
      "end_date_to",
    ]) {
      assert.match(TASKS_LIST_REPORT_DESCRIPTION, new RegExp(name));
      const field = tasksListReportInputSchema.shape[name as "offset"];
      assert.equal(field.isOptional(), true);
      assert.match(field.description ?? "", new RegExp(name));
    }
    assert.match(TASKS_LIST_REPORT_DESCRIPTION, /Omit offset and limit/);
    assert.match(TASKS_LIST_REPORT_DESCRIPTION, /last_done_at/);
    assert.match(TASKS_LIST_REPORT_DESCRIPTION, /task_filter_type_id/);
  });

  it("accepts a legacy call and a filtered page", () => {
    assert.deepEqual(tasksListReportInputSchema.parse({ task_filter_type_id: 1 }), {
      task_filter_type_id: 1,
    });
    const parsed = tasksListReportInputSchema.parse({
      task_filter_type_id: 1,
      offset: 80,
      limit: 40,
      state_id: [1, 4],
      to_user_id: 11,
      creator_id: 20,
      start_date_from: "2026-01-01",
      end_date_to: "2026-12-31 23:59:59",
    });
    assert.equal(parsed.offset, 80);
    assert.equal(parsed.limit, 40);
    assert.deepEqual(parsed.state_id, [1, 4]);
  });

  it("rejects closed states, bad pages, and timezone dates before a request", () => {
    assert.equal(
      tasksListReportInputSchema.safeParse({ task_filter_type_id: 1, state_id: 5 }).success,
      false
    );
    assert.equal(
      tasksListReportInputSchema.safeParse({ task_filter_type_id: 1, offset: -1 }).success,
      false
    );
    assert.equal(
      tasksListReportInputSchema.safeParse({ task_filter_type_id: 1, limit: 0 }).success,
      false
    );
    assert.equal(
      tasksListReportInputSchema.safeParse({
        task_filter_type_id: 1,
        start_date_from: "2026-01-01 00:00:00+03",
      }).success,
      false
    );
    assert.equal(tasksListReportInputSchema.safeParse({}).success, false);
  });
});

describe("queryTasksListReport", () => {
  it("requests the same URL as before when pagination and filters are omitted", async () => {
    const seen = await captureReport(() => queryTasksListReport({ task_filter_type_id: 1 }));
    assert.equal(seen.url.origin + seen.url.pathname, "https://platform.kvant.app/openapi/report/tasks_list_report");
    assert.deepEqual([...seen.url.searchParams.keys()], ["task_filter_type_id"]);
    assert.equal(seen.url.searchParams.get("task_filter_type_id"), "1");
    assert.equal(seen.init.method, "GET");
    assert.equal(seen.init.body, undefined);
    assert.equal(header(seen.init, "api-key"), "test-key");
    assert.deepEqual(seen.body, { data: [] });
  });

  it("sends offset and limit on the Open API query", async () => {
    const seen = await captureReport(() =>
      queryTasksListReport({ task_filter_type_id: 1, offset: 40, limit: 20 })
    );
    assert.equal(seen.url.searchParams.get("offset"), "40");
    assert.equal(seen.url.searchParams.get("limit"), "20");
    assert.equal(seen.url.searchParams.get("state_id"), null);
    assert.equal(seen.url.searchParams.get("to_user_id"), null);
  });

  it("sends filters, including repeated state_id values", async () => {
    const seen = await captureReport(() =>
      queryTasksListReport({
        task_filter_type_id: 1,
        state_id: [1, 3, 4],
        to_user_id: 11,
        creator_id: 20,
        start_date_from: "2026-01-01",
        start_date_to: "2026-01-31 23:59:59",
        end_date_from: "2026-02-01",
        end_date_to: "2026-02-28",
      })
    );
    assert.deepEqual(seen.url.searchParams.getAll("state_id"), ["1", "3", "4"]);
    assert.equal(seen.url.searchParams.get("to_user_id"), "11");
    assert.equal(seen.url.searchParams.get("creator_id"), "20");
    assert.equal(seen.url.searchParams.get("start_date_from"), "2026-01-01");
    assert.equal(seen.url.searchParams.get("start_date_to"), "2026-01-31 23:59:59");
    assert.equal(seen.url.searchParams.get("end_date_from"), "2026-02-01");
    assert.equal(seen.url.searchParams.get("end_date_to"), "2026-02-28");
    assert.equal(seen.url.searchParams.get("offset"), null);
    assert.equal(seen.url.searchParams.get("limit"), null);

    const oneState = await captureReport(() =>
      queryTasksListReport({ task_filter_type_id: 1, state_id: 4 })
    );
    assert.deepEqual(oneState.url.searchParams.getAll("state_id"), ["4"]);
  });

  it("post-filters program_id after the paged request and keeps count", async () => {
    const seen = await captureReport(
      () =>
        queryTasksListReport({
          task_filter_type_id: 1,
          program_id: 10,
          offset: 40,
          limit: 2,
        }),
      {
        count: 3,
        data: [
          { id: 1, program_id: 10 },
          { id: 2, program_id: 11 },
        ],
      }
    );
    assert.equal(seen.url.searchParams.get("program_id"), "10");
    assert.equal(seen.url.searchParams.get("offset"), "40");
    assert.equal(seen.url.searchParams.get("limit"), "2");
    assert.deepEqual(seen.body, {
      count: 3,
      data: [{ id: 1, program_id: 10 }],
    });
  });

  it("does not call the API when a filter is invalid", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("fetch should not run");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        runWithSession(session, () =>
          queryTasksListReport({
            task_filter_type_id: 1,
            state_id: 5,
            offset: 0,
            limit: 10,
          })
        ),
      /open state/
    );
    assert.equal(called, false);
  });
});

function header(init: RequestInit, name: string): string | undefined {
  const headers = init.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return undefined;
  const value = (headers as Record<string, string>)[name];
  return typeof value === "string" ? value : undefined;
}

async function captureReport(
  run: () => Promise<unknown>,
  payload: unknown = { data: [] }
): Promise<{ url: URL; init: RequestInit; body: unknown }> {
  let seenUrl = "";
  let seenInit: RequestInit = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = String(input);
    seenInit = init ?? {};
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const body = await runWithSession(session, run);
  assert.ok(seenUrl, "expected a report request");
  return { url: new URL(seenUrl), init: seenInit, body };
}
