import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://kvant-mcp.vercel.app";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/api/oauth/authorize`,
    token_endpoint: `${BASE_URL}/api/oauth/token`,
    registration_endpoint: `${BASE_URL}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [],
  });
}
