import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

export type OrgConfig = {
  id: string;
  name: string;
  subdomain: string;
  api_key: string;
  /** Optional Kvant user id of the API-key owner. Absent on older JWTs — do not require re-auth. */
  user_id?: number;
};

export type SessionPayload = {
  v: 1;
  orgs: OrgConfig[];
  default_org_id: string;
};

export type Session = SessionPayload;

export const ORGANIZATION_PARAM_DESC =
  "Organization name or subdomain from kvant_organizations_list. Omit to use the default organization. " +
  'For read/list tools only: pass "all" to query every connected organization.';

export const ORGANIZATION_WRITE_PARAM_DESC =
  "Organization name or subdomain from kvant_organizations_list. Omit to use the default organization. " +
  'Do not pass "all" — write actions require a single organization.';

export const organizationReadShape = {
  organization: z.string().optional().describe(ORGANIZATION_PARAM_DESC),
};

export const organizationWriteShape = {
  organization: z.string().optional().describe(ORGANIZATION_WRITE_PARAM_DESC),
};

/**
 * Signing secret for OAuth JWTs (access, refresh, auth codes).
 * Must be a stable Vercel env var — never rotate on ordinary deploys (rotation forces every client to re-auth).
 * Also set PUBLIC_BASE_URL=https://mcp.kvant.app so issuer/resource metadata does not drift with Host.
 */
export function getOauthSecret(): Uint8Array {
  const secret = process.env.OAUTH_SECRET;
  if (!secret) throw new Error("OAUTH_SECRET not set");
  return new TextEncoder().encode(secret);
}

/** Accept subdomain, host, or full URL → lowercase subdomain only. */
export function normalizeSubdomain(raw: string): string {
  let value = raw.trim().toLowerCase();
  if (!value) {
    throw new Error("Domain is required");
  }
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      throw new Error(`Invalid domain URL: ${raw}`);
    }
  }
  value = value.replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (value.endsWith(".kvant.app")) {
    value = value.slice(0, -".kvant.app".length);
  }
  if (!value || value.includes(".") || value === "platform" || value === "www") {
    throw new Error(
      `Invalid Kvant subdomain "${raw}". Use e.g. mycompany or https://mycompany.kvant.app`
    );
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)) {
    throw new Error(`Invalid Kvant subdomain "${raw}"`);
  }
  return value;
}

export function uiOrigin(subdomain: string): string | null {
  const s = subdomain.trim();
  if (!s) return null;
  return `https://${s}.kvant.app`;
}

export function taskUiUrl(subdomain: string, key: string): string | null {
  const origin = uiOrigin(subdomain);
  if (!origin || !key) return null;
  return `${origin}/tasks/show/${key}`;
}

export function newOrgId(): string {
  return randomUUID();
}

export function publicOrgs(session: Session): Array<{
  id: string;
  name: string;
  subdomain: string;
  is_default: boolean;
}> {
  return session.orgs.map((org) => ({
    id: org.id,
    name: org.name,
    subdomain: org.subdomain,
    is_default: org.id === session.default_org_id,
  }));
}

export function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export async function signSessionAccessToken(session: SessionPayload): Promise<string> {
  return new SignJWT({
    v: 1,
    orgs: session.orgs,
    default_org_id: session.default_org_id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(getOauthSecret());
}

export async function verifySessionAccessToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getOauthSecret());
  return parseSessionPayload(payload);
}

export function parseSessionPayload(payload: unknown): SessionPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid session token payload");
  }
  const root = payload as Record<string, unknown>;
  if (root.v !== 1) {
    throw new Error("Unsupported session token version");
  }
  if (!Array.isArray(root.orgs) || root.orgs.length === 0) {
    throw new Error("Session token has no organizations");
  }
  const orgs: OrgConfig[] = root.orgs.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Invalid organization at index ${index}`);
    }
    const org = item as Record<string, unknown>;
    const id = typeof org.id === "string" ? org.id : "";
    const name = typeof org.name === "string" ? org.name.trim() : "";
    const subdomain = typeof org.subdomain === "string" ? org.subdomain.trim() : "";
    const api_key = typeof org.api_key === "string" ? org.api_key.trim() : "";
    if (!id || !name || !api_key) {
      throw new Error(`Incomplete organization at index ${index}`);
    }
    const user_id = asOptionalUserId(org.user_id);
    return user_id !== undefined
      ? { id, name, subdomain, api_key, user_id }
      : { id, name, subdomain, api_key };
  });
  const default_org_id =
    typeof root.default_org_id === "string" ? root.default_org_id : "";
  if (!default_org_id || !orgs.some((o) => o.id === default_org_id)) {
    throw new Error("Session token default_org_id is missing or unknown");
  }
  return { v: 1, orgs, default_org_id };
}

function asOptionalUserId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

/** Build a single-org session from a legacy pre-multi-org token payload field. */
export function legacySessionFromApiKey(apiKey: string): Session {
  const id = "legacy";
  return {
    v: 1,
    orgs: [
      {
        id,
        name: "default",
        subdomain: "",
        api_key: apiKey,
      },
    ],
    default_org_id: id,
  };
}

/**
 * Parse a verified JWT payload into a session.
 * Supports current multi-org (`v:1` + orgs) and legacy `{ kvant_key }` refresh/code payloads.
 */
export function sessionFromJwtPayload(payload: unknown): SessionPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid session token payload");
  }
  const root = payload as Record<string, unknown>;
  if (root.v === 1) {
    return parseSessionPayload(payload);
  }
  const kvantKey = typeof root.kvant_key === "string" ? root.kvant_key.trim() : "";
  if (kvantKey) {
    return legacySessionFromApiKey(kvantKey);
  }
  throw new Error("Unsupported session token payload");
}

/**
 * Parse Authorization Bearer: multi-org JWT session, or legacy raw Kvant API key.
 */
export async function parseBearerToken(token: string): Promise<Session> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Empty bearer token");
  }

  if (looksLikeJwt(trimmed) && process.env.OAUTH_SECRET) {
    try {
      const { payload } = await jwtVerify(trimmed, getOauthSecret());
      return sessionFromJwtPayload(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid session token: ${message}`);
    }
  }

  return legacySessionFromApiKey(trimmed);
}
