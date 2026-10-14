import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SignJWT, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import authorize from "../api/oauth/authorize.js";
import register from "../api/oauth/register.js";
import token from "../api/oauth/token.js";
import mcp from "../api/mcp.js";
import authorizationServer from "../api/well-known/oauth-authorization-server.js";
import protectedResource from "../api/well-known/oauth-protected-resource.js";
import { verifySessionAccessToken } from "../src/session.js";

/**
 * Contract checks for the existing OAuth endpoints.
 * These tests must keep passing without changes to routes, token handling,
 * scopes, client registration, discovery metadata, or env vars.
 * Synthetic ids only — no real organizations or people.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://mcp.example.test";
const SECRET = "test-oauth-secret-for-regression";

const prevSecret = process.env.OAUTH_SECRET;
const prevBase = process.env.PUBLIC_BASE_URL;

before(() => {
  process.env.OAUTH_SECRET = SECRET;
  process.env.PUBLIC_BASE_URL = BASE;
});

after(() => {
  restoreEnv("OAUTH_SECRET", prevSecret);
  restoreEnv("PUBLIC_BASE_URL", prevBase);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

type Captured = {
  status: number;
  body: unknown;
  headers: Record<string, string | number | readonly string[]>;
  redirectedTo?: string;
};

function mockRes(): { res: VercelResponse; captured: Captured } {
  const captured: Captured = { status: 200, body: undefined, headers: {} };
  const res = {
    setHeader(name: string, value: string | number | readonly string[]) {
      captured.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
    send(payload: unknown) {
      captured.body = payload;
      return res;
    },
    redirect(code: number, url: string) {
      captured.status = code;
      captured.redirectedTo = url;
      return res;
    },
  };
  return { res: res as unknown as VercelResponse, captured };
}

function mockReq(partial: Record<string, unknown>): VercelRequest {
  return partial as unknown as VercelRequest;
}

const exampleOrg = {
  id: "org-1",
  name: "Example",
  subdomain: "example",
  api_key: "key-1",
};

async function sign(payload: Record<string, unknown>, exp = "1h"): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(SECRET));
}

describe("OAuth discovery and routes", () => {
  it("keeps authorization-server metadata, including empty scopes", () => {
    const { res, captured } = mockRes();
    authorizationServer(mockReq({ headers: {} }), res);
    assert.deepEqual(captured.body, {
      issuer: BASE,
      authorization_endpoint: `${BASE}/api/oauth/authorize`,
      token_endpoint: `${BASE}/api/oauth/token`,
      registration_endpoint: `${BASE}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [],
      service_documentation: "https://kvant.app",
      op_policy_uri: "https://kvant.app",
    });
    assert.equal(captured.headers["access-control-allow-origin"], "*");
  });

  it("keeps protected-resource metadata pointing at /api/mcp", () => {
    const { res, captured } = mockRes();
    protectedResource(mockReq({ headers: {} }), res);
    assert.deepEqual(captured.body, {
      resource: `${BASE}/api/mcp`,
      authorization_servers: [BASE],
      scopes_supported: [],
    });
  });

  it("keeps the Vercel rewrites for mcp and OAuth discovery", () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    assert.deepEqual(vercel.rewrites, [
      { source: "/mcp", destination: "/api/mcp" },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/well-known/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/well-known/oauth-authorization-server",
      },
    ]);
  });

  it("keeps the OAuth env contract in OAUTH.md", () => {
    const doc = readFileSync(join(ROOT, "OAUTH.md"), "utf8");
    assert.match(doc, /\| `OAUTH_SECRET` \| Yes \|/);
    assert.match(doc, /\| `PUBLIC_BASE_URL` \| Yes \|/);
    assert.match(doc, /Do \*\*not\*\* change `OAUTH_SECRET`/);
    assert.match(doc, /user_id` is additive/);
  });
});

describe("OAuth client registration", () => {
  it("still registers a public client with the same grants and no scopes", () => {
    const { res, captured } = mockRes();
    register(
      mockReq({
        method: "POST",
        body: {
          client_name: "example-mcp",
          redirect_uris: ["https://example.test/callback"],
        },
      }),
      res
    );
    assert.equal(captured.status, 201);
    const body = captured.body as Record<string, unknown>;
    assert.equal(typeof body.client_id, "string");
    assert.match(String(body.client_id), /^[0-9a-f-]{36}$/);
    assert.equal(body.client_name, "example-mcp");
    assert.deepEqual(body.redirect_uris, ["https://example.test/callback"]);
    assert.deepEqual(body.grant_types, ["authorization_code", "refresh_token"]);
    assert.deepEqual(body.response_types, ["code"]);
    assert.equal(body.token_endpoint_auth_method, "none");
    assert.equal("scope" in body, false);
    assert.equal("scopes" in body, false);
  });

  it("still rejects non-POST registration", () => {
    const { res, captured } = mockRes();
    register(mockReq({ method: "GET", body: {} }), res);
    assert.equal(captured.status, 405);
    assert.deepEqual(captured.body, { error: "Method not allowed" });
  });
});

describe("OAuth authorize", () => {
  it("still returns the consent form for a code request and does not issue a token", () => {
    const { res, captured } = mockRes();
    authorize(
      mockReq({
        method: "GET",
        query: {
          response_type: "code",
          redirect_uri: "https://example.test/callback",
          code_challenge: "challenge-value",
          code_challenge_method: "S256",
          client_id: "example-client",
          state: "state-1",
        },
      }),
      res
    );
    assert.equal(captured.status, 200);
    assert.equal(captured.headers["content-type"], "text/html; charset=utf-8");
    const html = String(captured.body);
    assert.match(html, /name="redirect_uri" value="https:\/\/example\.test\/callback"/);
    assert.match(html, /name="code_challenge" value="challenge-value"/);
    assert.match(html, /name="code_challenge_method" value="S256"/);
    assert.match(html, /name="client_id" value="example-client"/);
    assert.match(html, /name="state" value="state-1"/);
    assert.equal(html.includes("access_token"), false);
    assert.equal(captured.redirectedTo, undefined);
  });

  it("still rejects an authorize request that is missing PKCE fields", () => {
    const { res, captured } = mockRes();
    authorize(mockReq({ method: "GET", query: { response_type: "token" } }), res);
    assert.equal(captured.status, 400);
    assert.deepEqual(captured.body, { error: "Missing required OAuth parameters" });
  });

  it("still rejects unsupported authorize methods", () => {
    const { res, captured } = mockRes();
    authorize(mockReq({ method: "PUT", query: {}, body: {} }), res);
    assert.equal(captured.status, 405);
    assert.deepEqual(captured.body, { error: "Method not allowed" });
  });
});

describe("OAuth token", () => {
  it("still exchanges an authorization code with PKCE for a bearer token", async () => {
    const verifier = "a".repeat(64);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const code = await sign({
      v: 1,
      orgs: [exampleOrg],
      default_org_id: "org-1",
      code_challenge: challenge,
      code_challenge_method: "S256",
    }, "5m");

    const { res, captured } = mockRes();
    await token(
      mockReq({
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
        },
      }),
      res
    );

    assert.equal(captured.status, 200);
    assert.equal(captured.headers["cache-control"], "no-store");
    const body = captured.body as Record<string, unknown>;
    assert.equal(body.token_type, "bearer");
    assert.equal(body.expires_in, 31536000);
    assert.equal(typeof body.access_token, "string");
    assert.equal(typeof body.refresh_token, "string");
    assert.notEqual(body.refresh_token, code);
    const session = await verifySessionAccessToken(String(body.access_token));
    assert.equal(session.orgs[0].api_key, "key-1");
    assert.equal(session.orgs[0].user_id, undefined);
    assert.equal(session.default_org_id, "org-1");
    assert.equal("scope" in body, false);
  });

  it("still returns the same refresh token for an existing multi-org session", async () => {
    const refresh = await sign({
      v: 1,
      orgs: [exampleOrg],
      default_org_id: "org-1",
    }, "365d");

    const { res, captured } = mockRes();
    await token(
      mockReq({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { grant_type: "refresh_token", refresh_token: refresh },
      }),
      res
    );

    const body = captured.body as Record<string, unknown>;
    assert.equal(captured.status, 200);
    assert.equal(body.token_type, "bearer");
    assert.equal(body.expires_in, 31536000);
    assert.equal(body.refresh_token, refresh);
    const session = await verifySessionAccessToken(String(body.access_token));
    assert.equal(session.v, 1);
    assert.equal(session.orgs[0].api_key, "key-1");
    assert.equal(session.orgs[0].user_id, undefined);
  });

  it("still accepts a legacy kvant_key refresh token", async () => {
    const legacy = await sign({ kvant_key: "legacy-raw-key" }, "365d");
    const { res, captured } = mockRes();
    await token(
      mockReq({
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: { grant_type: "refresh_token", refresh_token: legacy },
      }),
      res
    );
    const body = captured.body as Record<string, unknown>;
    assert.equal(captured.status, 200);
    assert.equal(body.token_type, "bearer");
    assert.equal(body.expires_in, 31536000);
    assert.notEqual(body.refresh_token, legacy);
    const session = await verifySessionAccessToken(String(body.access_token));
    assert.equal(session.orgs[0].api_key, "legacy-raw-key");
    const { payload } = await jwtVerify(
      String(body.refresh_token),
      new TextEncoder().encode(SECRET)
    );
    assert.equal(payload.v, 1);
  });

  it("still rejects a bad PKCE verifier, unknown grants, and the wrong method", async () => {
    const code = await sign({
      v: 1,
      orgs: [exampleOrg],
      default_org_id: "org-1",
      code_challenge: "not-the-verifier",
      code_challenge_method: "S256",
    }, "5m");

    const pkce = mockRes();
    await token(
      mockReq({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {
          grant_type: "authorization_code",
          code,
          code_verifier: "b".repeat(64),
        },
      }),
      pkce.res
    );
    assert.equal(pkce.captured.status, 400);
    assert.equal((pkce.captured.body as { error: string }).error, "invalid_grant");

    const grant = mockRes();
    await token(
      mockReq({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { grant_type: "client_credentials" },
      }),
      grant.res
    );
    assert.equal(grant.captured.status, 400);
    assert.deepEqual(grant.captured.body, { error: "unsupported_grant_type" });

    const method = mockRes();
    await token(mockReq({ method: "GET", headers: {}, body: {} }), method.res);
    assert.equal(method.captured.status, 405);
    assert.deepEqual(method.captured.body, { error: "Method not allowed" });

    const type = mockRes();
    await token(
      mockReq({
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: {},
      }),
      type.res
    );
    assert.equal(type.captured.status, 415);
    assert.deepEqual(type.captured.body, { error: "unsupported_content_type" });
  });
});

describe("MCP bearer gate", () => {
  it("still challenges a missing bearer token with the protected-resource metadata", async () => {
    const { res, captured } = mockRes();
    await mcp(mockReq({ method: "POST", headers: {} }), res);
    assert.equal(captured.status, 401);
    assert.equal(
      captured.headers["www-authenticate"],
      `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`
    );
    assert.deepEqual(captured.body, {
      error: "Missing Authorization header. Provide your Kvant MCP Bearer token.",
    });
  });

  it("still rejects a bearer JWT signed with a different secret", async () => {
    const foreign = await new SignJWT({
      v: 1,
      orgs: [exampleOrg],
      default_org_id: "org-1",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("different-oauth-secret"));

    const { res, captured } = mockRes();
    await mcp(
      mockReq({
        method: "POST",
        headers: { authorization: `Bearer ${foreign}` },
      }),
      res
    );
    assert.equal(captured.status, 401);
    assert.equal(
      captured.headers["www-authenticate"],
      `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`
    );
    assert.equal(
      (captured.body as { error: string }).error,
      "Session token signature failed — OAUTH_SECRET may have changed (forces re-auth)."
    );
  });
});
