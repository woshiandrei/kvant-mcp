# kvant-mcp

MCP server for the Kvant Open API.

OAuth setup is documented in [OAUTH.md](OAUTH.md).

## kvant_reports_tasks_list

Loads `GET /report/tasks_list_report`.

`task_filter_type_id` is required. The Open API returns 422 without it. `program_id` is sent as a query parameter and the response is post-filtered by `program_id`, because the API can ignore that filter. `program_ids` is sent as repeated query parameters when the list is non-empty.

`offset` and `limit` are applied by the API before the `program_id` post-filter, so a page can contain fewer rows than `limit`. `count` stays the upstream total.

### Pagination

| Parameter | When it is sent |
|-----------|-----------------|
| `offset` | Integer ≥ 0. Omitted when unset. |
| `limit` | Integer ≥ 1. Omitted when unset. |

Calls that do not pass `offset` or `limit` do not add those query parameters. The request matches the previous tool, and the Open API keeps its own default page (the first page; 40 rows at the time of this change). Pass both to read later pages, for example `offset: 0, limit: 40`, then `offset: 40, limit: 40`.

This tool does not apply its own default page size and does not cap `limit`. The Open API may still apply its own limit.

### Filters

Each filter is forwarded only when it is set. Unset filters are not sent.

| Parameter | Meaning |
|-----------|---------|
| `state_id` | Open state. `1` Incoming, `2` Accepted, `3` In Progress, `4` Approve. Completed (`5`) is rejected. One id, or a list sent as repeated `state_id` query parameters. |
| `to_user_id` | Performer user id. |
| `creator_id` | Sender user id. |
| `start_date_from`, `start_date_to` | Inclusive `start_date` bounds. |
| `end_date_from`, `end_date_to` | Inclusive `end_date` bounds. |

Dates are `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss` with no `T` and no timezone. A date-only value is the start of that day (`00:00:00`). When both ends of a range are set, the lower bound must be on or before the upper bound.

Example: `state_id: [1, 2, 3, 4]`, `to_user_id: 11`, `creator_id: 20`, `start_date_from: "2026-01-01"`, `start_date_to: "2026-03-31"`.

### Compatibility

A call that only passes `task_filter_type_id` and optional `program_id` / `program_ids` / `organization` produces the same query as before these parameters existed.

`last_done_at` in this report is the upstream value. This tool does not load the work log, so it does not correct a timezone shift on that field. `kvant_tasks_get` does, using the completion log.

This tool does not list open communications of every employee in the organization. That needs a separate permissions decision.
