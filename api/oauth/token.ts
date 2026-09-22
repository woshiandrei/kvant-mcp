import type { VercelRequest, VercelResponse } from "@vercel/node";
import { jwtVerify, SignJWT } from "jose";
import { createHash } from "node:crypto";
import {
  getOauthSecret,
  parseSessionPayload,
  signSessionAccessToken,
  type SessionPayload,
} from "../../src/session.js";

type CodePayload = SessionPayload & {
  code_challenge: string;
  code_challenge_method: string;
};

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
      res.status(400).json({
        error: "invalid_request",
        error_description: "Missing code or code_verifier",
      });
      return;
    }

    let payload: CodePayload;
    try {
      const result = await jwtVerify(code, getOauthSecret());
      const session = parseSessionPayload(result.payload);
      const challenge = result.payload.code_challenge;
      const method = result.payload.code_challenge_method;
      if (typeof challenge !== "string") {
        throw new Error("Missing code_challenge");
      }
      payload = {
        ...session,
        code_challenge: challenge,
        code_challenge_method: typeof method === "string" ? method : "S256",
      };
    } catch {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid or expired code",
      });
      return;
    }

    const expectedChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
    if (expectedChallenge !== payload.code_challenge) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "PKCE verification failed",
      });
      return;
    }

    const session: SessionPayload = {
      v: 1,
      orgs: payload.orgs,
      default_org_id: payload.default_org_id,
    };

    const accessToken = await signSessionAccessToken(session);
    const refreshToken = await new SignJWT({
      v: 1,
      orgs: session.orgs,
      default_org_id: session.default_org_id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("365d")
      .sign(getOauthSecret());

    res.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 31536000,
      refresh_token: refreshToken,
    });
    return;
  }

  if (grantType === "refresh_token") {
    const refreshToken = body.refresh_token;
    if (!refreshToken) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Missing refresh_token",
      });
      return;
    }

    let session: SessionPayload;
    try {
      const result = await jwtVerify(refreshToken, getOauthSecret(), {
        clockTolerance: 31536000,
      });
      session = parseSessionPayload(result.payload);
    } catch {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid refresh token",
      });
      return;
    }

    const accessToken = await signSessionAccessToken(session);

    res.json({
      access_token: accessToken,
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
