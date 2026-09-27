import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPublicBaseUrl } from "../../src/public-url.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const baseUrl = getPublicBaseUrl(req);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [],
    service_documentation: "https://kvant.app",
    op_policy_uri: "https://kvant.app",
  });
}
