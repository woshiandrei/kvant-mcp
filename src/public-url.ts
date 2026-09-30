import type { VercelRequest } from "@vercel/node";

const FALLBACK_BASE_URL = "https://mcp.kvant.app";

/**
 * Public origin for OAuth metadata and WWW-Authenticate.
 * Prefer PUBLIC_BASE_URL (set to https://mcp.kvant.app in Production — do not leave unset or issuer drifts with Host / *.vercel.app),
 * then the request Host, then mcp.kvant.app.
 * Do not use VERCEL_PROJECT_PRODUCTION_URL — that stays on *.vercel.app.
 */
export function getPublicBaseUrl(req?: VercelRequest): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  if (req) {
    const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host;
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    if (host) {
      const protoHeader = req.headers["x-forwarded-proto"];
      const protoRaw = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
      const proto = protoRaw === "http" ? "http" : "https";
      return `${proto}://${host.split(",")[0].trim()}`;
    }
  }

  return FALLBACK_BASE_URL;
}
