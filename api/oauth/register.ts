import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body || {};
  const clientId = randomUUID();

  res.status(201).json({
    client_id: clientId,
    client_name: body.client_name || "Claude",
    redirect_uris: body.redirect_uris || [],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    logo_uri: "https://static.tildacdn.com/tild3363-3263-4630-a362-613830636135/152x152.png",
  });
}
