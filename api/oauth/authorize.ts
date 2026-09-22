import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SignJWT } from "jose";
import {
  getOauthSecret,
  newOrgId,
  normalizeSubdomain,
  type OrgConfig,
  type SessionPayload,
} from "../../src/session.js";

interface ConsentFields {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  clientId: string;
}

type OrgFormRow = {
  name: string;
  domain: string;
  api_key: string;
  is_default: boolean;
};

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
    const fields: ConsentFields = {
      redirectUri: body.redirect_uri || "",
      state: body.state || "",
      codeChallenge: body.code_challenge || "",
      codeChallengeMethod: body.code_challenge_method || "S256",
      clientId: body.client_id || "",
    };

    if (!fields.redirectUri || !fields.codeChallenge) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    let rows: OrgFormRow[];
    try {
      rows = parseOrgRows(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderConsentPage(fields, message, body.orgs_json));
      return;
    }

    const validated: OrgConfig[] = [];
    let default_org_id = "";

    for (const row of rows) {
      let subdomain: string;
      try {
        subdomain = normalizeSubdomain(row.domain);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderConsentPage(fields, `${row.name}: ${message}`, body.orgs_json));
        return;
      }

      const probeError = await validateKvantApiKey(row.api_key);
      if (probeError) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(
          renderConsentPage(fields, `${row.name}: ${probeError}`, body.orgs_json)
        );
        return;
      }

      const id = newOrgId();
      validated.push({
        id,
        name: row.name,
        subdomain,
        api_key: row.api_key,
      });
      if (row.is_default) {
        default_org_id = id;
      }
    }

    if (!default_org_id) {
      default_org_id = validated[0].id;
    }

    const session: SessionPayload = {
      v: 1,
      orgs: validated,
      default_org_id,
    };

    const code = await new SignJWT({
      ...session,
      code_challenge: fields.codeChallenge,
      code_challenge_method: fields.codeChallengeMethod,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(getOauthSecret());

    const url = new URL(fields.redirectUri);
    url.searchParams.set("code", code);
    if (fields.state) url.searchParams.set("state", fields.state);

    res.redirect(302, url.toString());
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

function parseOrgRows(body: Record<string, unknown>): OrgFormRow[] {
  const rawJson = typeof body.orgs_json === "string" ? body.orgs_json.trim() : "";
  if (!rawJson) {
    throw new Error("Добавьте хотя бы одну организацию.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Некорректные данные формы организаций.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Добавьте хотя бы одну организацию.");
  }

  const rows: OrgFormRow[] = parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Организация #${index + 1}: неверные данные.`);
    }
    const row = item as Record<string, unknown>;
    const name = String(row.name || "").trim();
    const domain = String(row.domain || "").trim();
    const api_key = String(row.api_key || "").trim();
    const is_default = Boolean(row.is_default);
    if (!name || !domain || !api_key) {
      throw new Error(
        `Организация #${index + 1}: заполните название, домен и API-ключ.`
      );
    }
    return { name, domain, api_key, is_default };
  });

  const defaultCount = rows.filter((r) => r.is_default).length;
  if (defaultCount === 0) {
    rows[0].is_default = true;
  } else if (defaultCount > 1) {
    throw new Error("Отметьте ровно одну организацию как организацию по умолчанию.");
  }

  const names = new Set<string>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (names.has(key)) {
      throw new Error(`Дублируется название организации: ${row.name}`);
    }
    names.add(key);
  }

  return rows;
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

function renderConsentPage(
  fields: ConsentFields,
  error?: string,
  orgsJsonPreset?: unknown
): string {
  const errorHtml = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : "";

  let initialOrgsJson = JSON.stringify([
    { name: "", domain: "", api_key: "", is_default: true },
  ]);
  if (typeof orgsJsonPreset === "string" && orgsJsonPreset.trim()) {
    try {
      const parsed = JSON.parse(orgsJsonPreset);
      if (Array.isArray(parsed)) {
        initialOrgsJson = JSON.stringify(parsed);
      }
    } catch {
      // keep default
    }
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kvant — Подключение к Claude</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 560px; width: 100%; box-shadow: 0 2px 16px rgba(0,0,0,0.06); border: 1px solid #e8e8e8; }
    .logo { display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .logo img { height: 32px; }
    h1 { font-size: 20px; margin-bottom: 8px; color: #1a1a1a; text-align: center; }
    .intro { font-size: 14px; color: #666; margin-bottom: 24px; line-height: 1.5; text-align: center; }
    label { font-size: 13px; font-weight: 500; color: #333; display: block; margin-bottom: 6px; }
    input[type="text"], input[type="password"] { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 10px; font-size: 14px; background: #fafafa; color: #1a1a1a; }
    input[type="password"] { font-family: monospace; }
    input:focus { outline: none; border-color: #4c3898; box-shadow: 0 0 0 3px rgba(76,56,152,0.12); }
    button.primary { width: 100%; padding: 12px; background: #4c3898; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; margin-top: 16px; transition: background 0.15s; }
    button.primary:hover { background: #3d2987; }
    button.secondary { width: 100%; padding: 10px; background: #fff; color: #4c3898; border: 1px dashed #c4b8e8; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; margin-top: 12px; }
    button.secondary:hover { background: #f7f4ff; }
    button.linkish { background: none; border: none; color: #b91c1c; font-size: 12px; cursor: pointer; padding: 0; }
    .hint { font-size: 12px; color: #999; margin-top: 12px; text-align: center; line-height: 1.4; }
    .error { background: #fef2f2; color: #b91c1c; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; line-height: 1.4; }
    .org { border: 1px solid #eee; border-radius: 12px; padding: 14px; margin-bottom: 12px; background: #fcfcfd; }
    .org-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px; }
    .org-title { font-size: 13px; font-weight: 600; color: #444; }
    .field { margin-bottom: 10px; }
    .field:last-child { margin-bottom: 0; }
    .default-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #444; margin-top: 4px; }
    .default-row input { width: auto; }
  </style>
  <link rel="icon" href="https://static.tildacdn.com/tild6235-6161-4633-a232-313130396562/32x32.ico">
</head>
<body>
  <div class="card">
    <div class="logo"><img src="https://static.tildacdn.com/tild3866-3831-4362-b433-633339643533/logo_kvant.svg" alt="Квант"></div>
    <h1>Авторизация</h1>
    <p class="intro">Подключите одну или несколько организаций Квант. Укажите название, домен (например rsuquant) и API-ключ. Отметьте организацию по умолчанию.</p>
    <form method="POST" action="" id="consent-form">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(fields.redirectUri)}">
      <input type="hidden" name="state" value="${escapeHtml(fields.state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(fields.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(fields.codeChallengeMethod)}">
      <input type="hidden" name="client_id" value="${escapeHtml(fields.clientId)}">
      <input type="hidden" name="orgs_json" id="orgs_json" value="">
      ${errorHtml}
      <div id="orgs"></div>
      <button type="button" class="secondary" id="add-org">Добавить организацию</button>
      <button type="submit" class="primary">Подключить</button>
      <p class="hint">Ключ: Настройки профиля → Сгенерировать API key. Домен — поддомен из адресной строки (rsuquant.kvant.app → rsuquant).</p>
    </form>
  </div>
  <script>
    const initialOrgs = ${initialOrgsJson};
    const orgsEl = document.getElementById('orgs');
    const orgsJsonEl = document.getElementById('orgs_json');
    const form = document.getElementById('consent-form');
    let orgs = Array.isArray(initialOrgs) && initialOrgs.length
      ? initialOrgs.map((o, i) => ({
          name: o.name || '',
          domain: o.domain || '',
          api_key: o.api_key || '',
          is_default: Boolean(o.is_default) || (i === 0 && !initialOrgs.some(x => x.is_default))
        }))
      : [{ name: '', domain: '', api_key: '', is_default: true }];

    function render() {
      orgsEl.innerHTML = orgs.map((org, index) => \`
        <div class="org" data-index="\${index}">
          <div class="org-head">
            <div class="org-title">Организация \${index + 1}</div>
            \${orgs.length > 1 ? '<button type="button" class="linkish" data-remove="'+index+'">Удалить</button>' : ''}
          </div>
          <div class="field">
            <label>Название</label>
            <input type="text" data-field="name" data-index="\${index}" value="\${escapeAttr(org.name)}" placeholder="Buddy Dinner" required>
          </div>
          <div class="field">
            <label>Домен</label>
            <input type="text" data-field="domain" data-index="\${index}" value="\${escapeAttr(org.domain)}" placeholder="ip-buddydinner или https://ip-buddydinner.kvant.app" required>
          </div>
          <div class="field">
            <label>API-ключ</label>
            <input type="password" data-field="api_key" data-index="\${index}" value="\${escapeAttr(org.api_key)}" placeholder="Вставьте ключ" required autocomplete="off">
          </div>
          <label class="default-row">
            <input type="radio" name="default_org" data-index="\${index}" \${org.is_default ? 'checked' : ''}>
            Организация по умолчанию
          </label>
        </div>
      \`).join('');
    }

    function escapeAttr(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function readFromDom() {
      orgs = orgs.map((org, index) => {
        const name = orgsEl.querySelector('input[data-field="name"][data-index="'+index+'"]');
        const domain = orgsEl.querySelector('input[data-field="domain"][data-index="'+index+'"]');
        const apiKey = orgsEl.querySelector('input[data-field="api_key"][data-index="'+index+'"]');
        const def = orgsEl.querySelector('input[name="default_org"][data-index="'+index+'"]');
        return {
          name: name ? name.value : org.name,
          domain: domain ? domain.value : org.domain,
          api_key: apiKey ? apiKey.value : org.api_key,
          is_default: def ? def.checked : org.is_default
        };
      });
    }

    orgsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      readFromDom();
      const index = Number(btn.getAttribute('data-remove'));
      const wasDefault = orgs[index]?.is_default;
      orgs.splice(index, 1);
      if (wasDefault && orgs.length) orgs[0].is_default = true;
      render();
    });

    orgsEl.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.name === 'default_org') {
        readFromDom();
        const index = Number(t.getAttribute('data-index'));
        orgs = orgs.map((org, i) => ({ ...org, is_default: i === index }));
        render();
      }
    });

    document.getElementById('add-org').addEventListener('click', () => {
      readFromDom();
      orgs.push({ name: '', domain: '', api_key: '', is_default: false });
      render();
    });

    form.addEventListener('submit', () => {
      readFromDom();
      if (!orgs.some(o => o.is_default) && orgs.length) orgs[0].is_default = true;
      orgsJsonEl.value = JSON.stringify(orgs);
    });

    render();
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
