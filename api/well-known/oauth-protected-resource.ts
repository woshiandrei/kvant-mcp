import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPublicBaseUrl } from "../../src/public-url.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const baseUrl = getPublicBaseUrl(req);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: [],
  });
}
