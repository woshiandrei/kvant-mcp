import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SignJWT } from "jose";

function getSecret() {
  const secret = process.env.OAUTH_SECRET;
  if (!secret) throw new Error("OAUTH_SECRET not set");
  return new TextEncoder().encode(secret);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const {
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
    client_id,
    response_type,
  } = req.query as Record<string, string>;

  if (req.method === "GET") {
    if (response_type !== "code" || !redirect_uri || !code_challenge) {
      res.status(400).json({ error: "Missing required OAuth parameters" });
      return;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kvant — Подключение к Claude</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; max-width: 440px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h1 { font-size: 20px; margin-bottom: 8px; color: #1a1a1a; }
    p { font-size: 14px; color: #666; margin-bottom: 24px; line-height: 1.5; }
    label { font-size: 13px; font-weight: 500; color: #333; display: block; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: monospace; }
    input:focus { outline: none; border-color: #0066ff; box-shadow: 0 0 0 3px rgba(0,102,255,0.1); }
    button { width: 100%; padding: 12px; background: #0066ff; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; margin-top: 20px; }
    button:hover { background: #0052cc; }
    .hint { font-size: 12px; color: #999; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Подключение Kvant к Claude</h1>
    <p>Вставьте ваш API-ключ из настроек профиля Kvant.<br>Он будет использоваться для доступа Claude к вашим коммуникациям.</p>
    <form method="POST" action="">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
      <input type="hidden" name="state" value="${escapeHtml(state || "")}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method || "S256")}">
      <input type="hidden" name="client_id" value="${escapeHtml(client_id || "")}">
      <label for="api_key">API-ключ Kvant</label>
      <input type="password" id="api_key" name="api_key" placeholder="Вставьте ключ сюда" required autocomplete="off">
      <button type="submit">Подключить</button>
      <p class="hint">Ключ генерируется в Настройки профиля → Сгенерировать API key</p>
    </form>
  </div>
</body>
</html>`);
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const apiKey = body.api_key;
    const redirectUri = body.redirect_uri;
    const postState = body.state;
    const codeChallenge = body.code_challenge;
    const codeChallengeMethod = body.code_challenge_method || "S256";

    if (!apiKey || !redirectUri || !codeChallenge) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const code = await new SignJWT({
      kvant_key: apiKey,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(getSecret());

    const url = new URL(redirectUri);
    url.searchParams.set("code", code);
    if (postState) url.searchParams.set("state", postState);

    res.redirect(302, url.toString());
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
