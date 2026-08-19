import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://kvant-mcp.vercel.app";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    resource: `${BASE_URL}/api/mcp`,
    authorization_servers: [BASE_URL],
    scopes_supported: [],
  });
}
