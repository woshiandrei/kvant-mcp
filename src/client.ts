import { AsyncLocalStorage } from "node:async_hooks";
import {
  parseBearerToken,
  publicOrgs,
  taskUiUrl,
  type OrgConfig,
  type Session,
} from "./session.js";

const BASE_URL = "https://platform.kvant.app/openapi";

type Store = {
  session: Session;
  activeOrg: OrgConfig;
};

const store = new AsyncLocalStorage<Store>();

export function runWithSession<T>(session: Session, fn: () => T): T {
  const activeOrg = getDefaultOrg(session);
  return store.run({ session, activeOrg }, fn);
}

/** @deprecated Prefer runWithSession after parseBearerToken */
export function runWithToken<T>(token: string, fn: () => T): T {
  // Sync wrapper cannot verify JWT; callers should use parseBearerToken + runWithSession.
  // Kept for compile safety: treat as legacy raw key.
  const session: Session = {
    v: 1,
    orgs: [{ id: "legacy", name: "default", subdomain: "", api_key: token.trim() }],
    default_org_id: "legacy",
  };
  return runWithSession(session, fn);
}

export { parseBearerToken, publicOrgs };

function getStore(): Store {
  const current = store.getStore();
  if (!current) {
    throw new Error(
      "No Kvant session found. Pass your Bearer token in the Authorization header of the MCP request."
    );
  }
  return current;
}

function getDefaultOrg(session: Session): OrgConfig {
  const found = session.orgs.find((o) => o.id === session.default_org_id);
  if (!found) {
    throw new Error("Default organization is missing from the session");
  }
  return found;
}

export function listOrgs(): OrgConfig[] {
  return getStore().session.orgs.slice();
}

export function getSession(): Session {
  return getStore().session;
}

export function getActiveOrg(): OrgConfig {
  return getStore().activeOrg;
}

function matchOrg(organization: string, orgs: OrgConfig[]): OrgConfig {
  const q = organization.trim().toLowerCase();
  if (!q) {
    throw new Error("organization is empty");
  }
  const matches = orgs.filter(
    (o) => o.name.toLowerCase() === q || o.subdomain.toLowerCase() === q
  );
  if (matches.length === 0) {
    const available = orgs
      .map((o) => `${o.name} (${o.subdomain || "no-subdomain"})`)
      .join(", ");
    throw new Error(
      `Organization "${organization}" not found. Connected: ${available || "(none)"}. Call kvant_organizations_list.`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Organization "${organization}" matches more than one entry. Use a more specific name or subdomain.`
    );
  }
  return matches[0];
}

/** Resolve a single organization. Rejects "all". */
export function resolveOrg(organization?: string): OrgConfig {
  const session = getStore().session;
  if (organization === undefined || organization.trim() === "") {
    return getDefaultOrg(session);
  }
  if (organization.trim().toLowerCase() === "all") {
    throw new Error(
      'organization "all" is only allowed on read/list tools. Specify one organization name or subdomain.'
    );
  }
  return matchOrg(organization, session.orgs);
}

/** Resolve one or many orgs for read tools. "all" → every connected org. */
export function resolveOrgsForRead(organization?: string): OrgConfig[] {
  const session = getStore().session;
  if (organization === undefined || organization.trim() === "") {
    return [getDefaultOrg(session)];
  }
  if (organization.trim().toLowerCase() === "all") {
    return session.orgs.slice();
  }
  return [matchOrg(organization, session.orgs)];
}

export function withOrg<T>(org: OrgConfig, fn: () => T): T {
  const current = getStore();
  return store.run({ session: current.session, activeOrg: org }, fn);
}

export type OrgScopedResult<T> = {
  organization: string;
  subdomain: string;
  data: T;
};

/**
 * Run fn for one org (default/named) or fan-out when organization is "all".
 * Single-org returns T; multi-org returns OrgScopedResult[].
 */
export async function forOrganizations<T>(
  organization: string | undefined,
  options: { allowAll: boolean },
  fn: () => Promise<T>
): Promise<T | OrgScopedResult<T>[]> {
  if (!options.allowAll && organization?.trim().toLowerCase() === "all") {
    throw new Error(
      'organization "all" is only allowed on read/list tools. Specify one organization name or subdomain.'
    );
  }

  const orgs = options.allowAll
    ? resolveOrgsForRead(organization)
    : [resolveOrg(organization)];

  if (orgs.length === 1) {
    return withOrg(orgs[0], fn);
  }

  const results: OrgScopedResult<T>[] = [];
  for (const org of orgs) {
    const data = await withOrg(org, fn);
    results.push({
      organization: org.name,
      subdomain: org.subdomain,
      data,
    });
  }
  return results;
}

export function currentTaskUiUrl(key: string): string | null {
  return taskUiUrl(getActiveOrg().subdomain, key);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function enrichOneTask(item: unknown, subdomain: string): unknown {
  const rec = asRecord(item);
  if (!rec) return item;
  const key = typeof rec.key === "string" ? rec.key : undefined;
  if (!key) return item;
  const url = taskUiUrl(subdomain, key);
  if (!url) return item;
  return { ...rec, ui_url: url };
}

/** Attach ui_url to task-like objects using the active org subdomain. */
export function enrichTasksWithUiUrl(payload: unknown): unknown {
  const subdomain = getActiveOrg().subdomain;
  if (!subdomain) return payload;

  if (Array.isArray(payload)) {
    return payload.map((item) => enrichOneTask(item, subdomain));
  }

  const root = asRecord(payload);
  if (!root) return payload;

  if (typeof root.key === "string") {
    return enrichOneTask(root, subdomain);
  }

  const out: Record<string, unknown> = { ...root };
  if (root.communication !== undefined) {
    out.communication = enrichOneTask(root.communication, subdomain);
  }
  if (Array.isArray(root.data)) {
    out.data = root.data.map((item) => enrichOneTask(item, subdomain));
  }
  return out;
}

export function jsonResult(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export interface KvantRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

export async function kvantRequest<T = unknown>(
  options: KvantRequestOptions
): Promise<T> {
  const { method, path, body, params } = options;
  const apiKey = getActiveOrg().api_key;

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    "api-key": apiKey,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kvant API error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}
