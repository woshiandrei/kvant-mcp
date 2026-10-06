# OAuth / deploy runbook

## Env (Vercel Production)

| Variable | Required | Notes |
|----------|----------|--------|
| `OAUTH_SECRET` | Yes | HS256 key for access/refresh/auth-code JWTs. **Do not rotate** on ordinary deploys — rotation forces every MCP client to re-auth. |
| `PUBLIC_BASE_URL` | Yes | Set to `https://mcp.kvant.app`. Keeps issuer / resource metadata stable (avoids Host / `*.vercel.app` drift). |

Preview: set the same two vars if Preview OAuth is used.

## Sessions

- Access and refresh tokens are **client-held JWTs** (no server session store). Deploys do not wipe sessions unless `OAUTH_SECRET` changes.
- Payload `v:1` + `orgs[]` (api keys inside JWT). Optional `orgs[].user_id` is additive; older tokens without it remain valid. `kvant_tasks_list` `type=my` does not depend on it.
- Legacy refresh JWTs with `kvant_key` (pre–multi-org) are accepted and upgraded to `v:1` session JWTs on refresh.

## After deploy checklist

1. Do **not** change `OAUTH_SECRET`.
2. Confirm `PUBLIC_BASE_URL=https://mcp.kvant.app`.
3. Already-connected MCP clients should stay `connected` (no re-OAuth).
4. Spot-check: tool call with an existing Bearer JWT; refresh_token grant still returns access_token.
