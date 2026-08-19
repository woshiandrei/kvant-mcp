import { AsyncLocalStorage } from "node:async_hooks";

const BASE_URL = "https://platform.kvant.app/openapi";

const tokenStorage = new AsyncLocalStorage<string>();

export function runWithToken<T>(token: string, fn: () => T): T {
  return tokenStorage.run(token, fn);
}

function getToken(): string {
  const token = tokenStorage.getStore()?.trim();
  if (!token) {
    throw new Error(
      "No Kvant API token found. Pass your Bearer token in the Authorization header of the MCP request."
    );
  }
  return token;
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

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    "api-key": getToken(),
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
