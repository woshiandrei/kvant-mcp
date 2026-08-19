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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c0c0c; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #1a1a1a; border-radius: 16px; padding: 40px; max-width: 440px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.3); border: 1px solid #2a2a2a; }
    .logo { display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .logo img { height: 32px; }
    h1 { font-size: 20px; margin-bottom: 8px; color: #fff; text-align: center; }
    p { font-size: 14px; color: #989898; margin-bottom: 24px; line-height: 1.5; text-align: center; }
    label { font-size: 13px; font-weight: 500; color: #b8b8b8; display: block; margin-bottom: 6px; }
    input[type="password"] { width: 100%; padding: 12px 14px; border: 1px solid #424242; border-radius: 10px; font-size: 14px; font-family: monospace; background: #111; color: #fff; }
    input[type="password"]:focus { outline: none; border-color: #4c3898; box-shadow: 0 0 0 3px rgba(76,56,152,0.25); }
    button { width: 100%; padding: 12px; background: #4c3898; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; margin-top: 20px; transition: background 0.15s; }
    button:hover { background: #3d2987; }
    .hint { font-size: 12px; color: #666; margin-top: 12px; text-align: center; }
  </style>
  <link rel="icon" href="https://static.tildacdn.com/tild6235-6161-4633-a232-313130396562/32x32.ico">
</head>
<body>
  <div class="card">
    <div class="logo"><img src="https://static.tildacdn.com/tild3866-3831-4362-b433-633339643533/logo_kvant.svg" alt="Квант"></div>
    <h1>Подключение к Claude</h1>
    <p>Вставьте ваш API-ключ из настроек профиля Квант.<br>Он будет использоваться для доступа Claude к вашим коммуникациям.</p>
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
