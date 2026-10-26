import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { runWithSession } from "../src/client.js";
import { buildProgramUpdateBody, updateProject } from "../src/program-update.js";
import type { Session } from "../src/session.js";

/**
 * Synthetic fixtures. Do not put real user ids, names, or organizations here.
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

const stored = {
  id: 10,
  name: "Example project",
  description: "Stored description",
  product: "Stored product",
  user_id: 7,
  visibility: 1,
  edit_type: 3,
  start: "2026-10-20 00:00:00+03",
  end: "2026-11-03 00:00:00+03",
  due_at: 1700000000,
  bound_program_id: 4,
};

const previousFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = previousFetch;
});

describe("buildProgramUpdateBody", () => {
  it("writes passed dates as YYYY-MM-DD HH:mm:ss and keeps the clock", () => {
    const fromDateOnly = buildProgramUpdateBody(stored, { start: "2026-10-20" });
    assert.equal(fromDateOnly.start, "2026-10-20 00:00:00");

    const fromOffset = buildProgramUpdateBody(stored, {
      start: "2026-10-20T00:00:00+03:00",
    });
    assert.equal(fromOffset.start, "2026-10-20 00:00:00");

    const fromShortOffset = buildProgramUpdateBody(stored, {
      start: "2026-10-20 00:00:00+03",
    });
    assert.equal(fromShortOffset.start, "2026-10-20 00:00:00");

    const keptClock = buildProgramUpdateBody(stored, { end: "2026-10-27 01:00:00" });
    assert.equal(keptClock.end, "2026-10-27 01:00:00");
    assert.equal(keptClock.start, stored.start);
  });

  it("keeps fields that were not passed, including the stored date string", () => {
    const body = buildProgramUpdateBody(stored, { name: "Renamed project" });
    assert.equal(body.name, "Renamed project");
    assert.equal(body.description, "Stored description");
    assert.equal(body.user_id, 7);
    assert.equal(body.start, "2026-10-20 00:00:00+03");
    assert.equal(body.end, "2026-11-03 00:00:00+03");
    assert.equal(body.due_at, 1700000000);
    assert.equal(body.bound_program_id, 4);
  });

  it("clears start on null and leaves end untouched", () => {
    const body = buildProgramUpdateBody(stored, { start: null });
    assert.equal(body.start, null);
    assert.equal(body.end, stored.end);
  });

  it("normalizes a due_at string and leaves a unix due_at as a number", () => {
    const asNumber = buildProgramUpdateBody(stored, { due_at: 1700000000 });
    assert.equal(asNumber.due_at, 1700000000);

    const asString = buildProgramUpdateBody(stored, {
      due_at: "2026-10-20 00:00:00+03:00",
      deadline_start_date: "2026-10-20T07:00:00+03:00",
    });
    assert.equal(asString.due_at, "2026-10-20 00:00:00");
    assert.equal(asString.deadline_start_date, "2026-10-20 07:00:00");
  });
});

describe("updateProject", () => {
  it("GETs the project and PUTs one full body with normalized dates", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request: RequestInit = init ?? {};
      calls.push({ url: String(input), init: request });
      const method = request.method ?? "GET";
      const payload = method === "GET" ? stored : { id: 10, ok: true };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await runWithSession(session, () =>
      updateProject(10, {
        name: "Renamed project",
        start: "2026-10-20T00:00:00+03:00",
        end: "2026-10-27 01:00:00",
      })
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].url, "https://platform.kvant.app/openapi/program/10");
    assert.equal(calls[0].init.body, undefined);

    assert.equal(calls[1].init.method, "PUT");
    assert.equal(calls[1].url, "https://platform.kvant.app/openapi/program/10");
    assert.equal(header(calls[1].init, "api-key"), "test-key");
    assert.equal(header(calls[1].init, "Content-Type"), "application/json");

    const body = JSON.parse(String(calls[1].init.body)) as Record<string, unknown>;
    assert.deepEqual(body, {
      ...stored,
      name: "Renamed project",
      start: "2026-10-20 00:00:00",
      end: "2026-10-27 01:00:00",
    });
    assert.equal(String(body.start).includes("+"), false);
    assert.equal(String(body.start).includes("T"), false);
    assert.equal(body.description, "Stored description");
    assert.equal(body.user_id, 7);
  });
});

function header(init: RequestInit, name: string): string | undefined {
  const headers = init.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return undefined;
  const value = (headers as Record<string, string>)[name];
  return typeof value === "string" ? value : undefined;
}
