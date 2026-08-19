import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SignJWT } from "jose";

function getSecret() {
  const secret = process.env.OAUTH_SECRET;
  if (!secret) throw new Error("OAUTH_SECRET not set");
  return new TextEncoder().encode(secret);
}

interface ConsentFields {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  clientId: string;
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
    res.send(
      renderConsentPage({
        redirectUri: redirect_uri,
        state: state || "",
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method || "S256",
        clientId: client_id || "",
      })
    );
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const apiKey = String(body.api_key || "").trim();
    const fields: ConsentFields = {
      redirectUri: body.redirect_uri || "",
      state: body.state || "",
      codeChallenge: body.code_challenge || "",
      codeChallengeMethod: body.code_challenge_method || "S256",
      clientId: body.client_id || "",
    };

    if (!apiKey || !fields.redirectUri || !fields.codeChallenge) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const probeError = await validateKvantApiKey(apiKey);
    if (probeError) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderConsentPage(fields, probeError));
      return;
    }

    const code = await new SignJWT({
      kvant_key: apiKey,
      code_challenge: fields.codeChallenge,
      code_challenge_method: fields.codeChallengeMethod,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(getSecret());

    const url = new URL(fields.redirectUri);
    url.searchParams.set("code", code);
    if (fields.state) url.searchParams.set("state", fields.state);

    res.redirect(302, url.toString());
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

async function validateKvantApiKey(apiKey: string): Promise<string | null> {
  try {
    const probe = await fetch("https://platform.kvant.app/openapi/users", {
      headers: {
        "api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (probe.ok) return null;

    try {
      const errBody = (await probe.json()) as { message?: string };
      if (errBody?.message) return String(errBody.message);
    } catch {
      // fall through to default
    }
    return "Ключ не принят API Квант.";
  } catch {
    return "Не удалось проверить ключ. Попробуйте ещё раз.";
  }
}

function renderConsentPage(fields: ConsentFields, error?: string): string {
  const errorHtml = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kvant — Подключение к Claude</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 440px; width: 100%; box-shadow: 0 2px 16px rgba(0,0,0,0.06); border: 1px solid #e8e8e8; }
    .logo { display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .logo img { height: 32px; }
    h1 { font-size: 20px; margin-bottom: 8px; color: #1a1a1a; text-align: center; }
    p { font-size: 14px; color: #666; margin-bottom: 24px; line-height: 1.5; text-align: center; }
    label { font-size: 13px; font-weight: 500; color: #333; display: block; margin-bottom: 6px; }
    input[type="password"] { width: 100%; padding: 12px 14px; border: 1px solid #ddd; border-radius: 10px; font-size: 14px; font-family: monospace; background: #fafafa; color: #1a1a1a; }
    input[type="password"]:focus { outline: none; border-color: #4c3898; box-shadow: 0 0 0 3px rgba(76,56,152,0.12); }
    button { width: 100%; padding: 12px; background: #4c3898; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; margin-top: 20px; transition: background 0.15s; }
    button:hover { background: #3d2987; }
    .hint { font-size: 12px; color: #999; margin-top: 12px; text-align: center; }
    .error { background: #fef2f2; color: #b91c1c; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; line-height: 1.4; }
  </style>
  <link rel="icon" href="https://static.tildacdn.com/tild6235-6161-4633-a232-313130396562/32x32.ico">
</head>
<body>
  <div class="card">
    <div class="logo"><img src="https://static.tildacdn.com/tild3866-3831-4362-b433-633339643533/logo_kvant.svg" alt="Квант"></div>
    <h1>Авторизация</h1>
    <p>Вставьте ваш API-ключ из настроек профиля Квант для подключения.</p>
    <form method="POST" action="">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(fields.redirectUri)}">
      <input type="hidden" name="state" value="${escapeHtml(fields.state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(fields.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(fields.codeChallengeMethod)}">
      <input type="hidden" name="client_id" value="${escapeHtml(fields.clientId)}">
      ${errorHtml}
      <label for="api_key">API-ключ Kvant</label>
      <input type="password" id="api_key" name="api_key" placeholder="Вставьте ключ сюда" required autocomplete="off">
      <button type="submit">Подключить</button>
      <p class="hint">Ключ генерируется в Настройки профиля → Сгенерировать API key</p>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
