/**
 * Local auth-safety checks (no network). Run: npx tsx scripts/auth-regression.ts
 */
import { SignJWT, jwtVerify } from "jose";
import {
  parseSessionPayload,
  sessionFromJwtPayload,
  legacySessionFromApiKey,
  type SessionPayload,
} from "../src/session.js";
import { filterReportByProgramId } from "../src/tools/reports.js";

const secret = new TextEncoder().encode("test-oauth-secret-for-regression");

async function sign(payload: Record<string, unknown>, exp = "1h"): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const baseSession: SessionPayload = {
    v: 1,
    orgs: [
      {
        id: "org-1",
        name: "Test",
        subdomain: "rsuquant",
        api_key: "key-abc",
      },
    ],
    default_org_id: "org-1",
  };

  // Existing multi-org JWT without user_id still parses
  const access = await sign({
    v: 1,
    orgs: baseSession.orgs,
    default_org_id: baseSession.default_org_id,
  });
  const { payload } = await jwtVerify(access, secret);
  const parsed = parseSessionPayload(payload);
  assert(parsed.orgs[0].api_key === "key-abc", "api_key preserved");
  assert(parsed.orgs[0].user_id === undefined, "user_id optional on old tokens");

  // Optional user_id additive
  const withUser: SessionPayload = {
    v: 1,
    orgs: [{ ...baseSession.orgs[0], user_id: 24032 }],
    default_org_id: "org-1",
  };
  const access2 = await sign({
    v: 1,
    orgs: withUser.orgs,
    default_org_id: withUser.default_org_id,
  });
  const { payload: p2 } = await jwtVerify(access2, secret);
  const parsed2 = parseSessionPayload(p2);
  assert(parsed2.orgs[0].user_id === 24032, "user_id round-trips");

  // Legacy kvant_key refresh migrates
  const legacyRefresh = await sign({ kvant_key: "old-raw-key", code_challenge: "x" });
  const { payload: leg } = await jwtVerify(legacyRefresh, secret);
  const migrated = sessionFromJwtPayload(leg);
  assert(migrated.v === 1, "legacy becomes v1");
  assert(migrated.orgs[0].api_key === "old-raw-key", "kvant_key mapped to api_key");

  // Raw API key bearer path still works
  const legacy = legacySessionFromApiKey("raw-key");
  assert(legacy.orgs[0].api_key === "raw-key", "raw key session");

  // Report post-filter
  const filtered = filterReportByProgramId(
    [
      { id: 1, program_id: 10 },
      { id: 2, program_id: 20 },
      { id: 3, program_id: 10 },
    ],
    10
  ) as Array<{ id: number }>;
  assert(filtered.length === 2 && filtered[0].id === 1 && filtered[1].id === 3, "report filter");

  console.log("auth-regression: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
