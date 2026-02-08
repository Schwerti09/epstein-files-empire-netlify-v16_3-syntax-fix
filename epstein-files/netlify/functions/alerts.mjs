import crypto from "node:crypto";
import { ok, bad, isOptions } from "./_lib/http.mjs";
import { rateLimit } from "./_lib/ratelimit.mjs";
import { query } from "./_lib/db.mjs";

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||"").trim());
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Wissens‑Bank <briefing@localhost>";
  if (!key) return { dev: true, sent: false, provider: "none" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to, subject, html })
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`Resend error: ${res.status} ${t}`.slice(0, 300));
  }
  return { sent: true, provider: "resend" };
}

function cleanQuery(q) {
  q = String(q||"").trim();
  if (q.length > 140) q = q.slice(0, 140);
  // strip weird control chars
  q = q.replace(/[\u0000-\u001f\u007f]/g, " ");
  return q;
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    if (event.httpMethod !== "POST") return bad({ error: "Method not allowed" }, 405);

    const rl = await rateLimit(event, { keyParts: ["alerts_create"], limit: 12, windowSeconds: 3600 });
    if (!rl.allowed) return bad({ error: "Rate limit exceeded", rateLimit: rl }, 429);

    const body = JSON.parse(event.body || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    if (!isEmail(email)) return bad({ error: "Bitte gültige E‑Mail angeben." }, 400);

    const kind = (String(body.kind || "").toLowerCase() === "name") ? "name" : "search";
    const frequency = (String(body.frequency || "daily").toLowerCase() === "hourly") ? "hourly" : "daily";

    const queryText = cleanQuery(body.q || body.query || "");
    const entitySlug = cleanQuery(body.slug || body.entity_slug || "");

    if (kind === "search" && queryText.length < 2) return bad({ error: "Bitte Suchbegriff angeben." }, 400);
    if (kind === "name" && entitySlug.length < 2) return bad({ error: "Bitte Namen/Slug angeben." }, 400);

    const token = crypto.randomBytes(18).toString("hex");

    const { rows } = await query(
      `
      INSERT INTO alerts (email, kind, query, entity_slug, status, token, frequency, created_at)
      VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW())
      RETURNING id
      `,
      [email, kind, queryText || null, entitySlug || null, token, frequency]
    );

    const alertId = rows[0]?.id;

    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";
    const confirmUrl = `${siteUrl}/.netlify/functions/alerts-confirm?id=${encodeURIComponent(alertId)}&token=${encodeURIComponent(token)}`;
    const unsubUrl = `${siteUrl}/.netlify/functions/alerts-unsubscribe?id=${encodeURIComponent(alertId)}&token=${encodeURIComponent(token)}`;

    const what = kind === "name" ? `Name: <strong>${entitySlug}</strong>` : `Suche: <strong>${queryText}</strong>`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <h2>Bestätige deinen Alert</h2>
        <p>Du hast einen Alert angelegt. Bitte kurz bestätigen:</p>
        <p>${what}</p>
        <p><a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;background:#111;color:#fff;text-decoration:none;border-radius:8px">✅ Alert aktivieren</a></p>
        <p style="color:#666">Wenn du das nicht warst, ignoriere diese Mail.</p>
        <hr>
        <p style="color:#666;font-size:12px">Abmelden: <a href="${unsubUrl}">Alert löschen</a></p>
      </div>
    `;

    const send = await sendEmail({ to: email, subject: "Wissens‑Bank Alert: Bitte bestätigen", html });

    return ok({
      success: true,
      alertId,
      email,
      kind,
      frequency,
      sent: !!send.sent,
      confirmUrl: send.dev ? confirmUrl : undefined
    });

  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
