import type { VercelRequest, VercelResponse } from "@vercel/node";
import { jwtVerify } from "jose";
import { createHash } from "node:crypto";

function getSecret() {
  const secret = process.env.OAUTH_SECRET;
  if (!secret) throw new Error("OAUTH_SECRET not set");
  return new TextEncoder().encode(secret);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  const contentType = req.headers["content-type"] || "";
  let body: Record<string, string>;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    body = req.body || {};
  } else if (contentType.includes("application/json")) {
    body = req.body || {};
  } else {
    res.status(415).json({ error: "unsupported_content_type" });
    return;
  }

  const grantType = body.grant_type;

  if (grantType === "authorization_code") {
    const code = body.code;
    const codeVerifier = body.code_verifier;

    if (!code || !codeVerifier) {
      res.status(400).json({ error: "invalid_request", error_description: "Missing code or code_verifier" });
      return;
    }

    let payload;
    try {
      const result = await jwtVerify(code, getSecret());
      payload = result.payload as { kvant_key: string; code_challenge: string; code_challenge_method: string };
    } catch {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired code" });
      return;
    }

    const expectedChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
    if (expectedChallenge !== payload.code_challenge) {
      res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      return;
    }

    res.json({
      access_token: payload.kvant_key,
      token_type: "bearer",
      expires_in: 31536000,
      refresh_token: code,
    });
    return;
  }

  if (grantType === "refresh_token") {
    const refreshToken = body.refresh_token;
    if (!refreshToken) {
      res.status(400).json({ error: "invalid_request", error_description: "Missing refresh_token" });
      return;
    }

    let payload;
    try {
      const result = await jwtVerify(refreshToken, getSecret(), { clockTolerance: 31536000 });
      payload = result.payload as { kvant_key: string };
    } catch {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid refresh token" });
      return;
    }

    res.json({
      access_token: payload.kvant_key,
      token_type: "bearer",
      expires_in: 31536000,
      refresh_token: refreshToken,
    });
    return;
  }

  res.status(400).json({ error: "unsupported_grant_type" });
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}
