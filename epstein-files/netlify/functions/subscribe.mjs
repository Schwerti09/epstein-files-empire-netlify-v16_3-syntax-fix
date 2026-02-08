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
  if (!key) {
    // Dev fallback: no sending, caller will see link in response
    return { dev: true, sent: false, provider: "none" };
  }
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

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  try {
    if (event.httpMethod !== "POST") return bad({ error: "Method not allowed" }, 405);

    const rl = await rateLimit(event, { keyParts: ["newsletter_subscribe"], limit: 20, windowSeconds: 3600 });
    if (!rl.allowed) return bad({ error: "Rate limit exceeded", rateLimit: rl }, 429);

    const body = JSON.parse(event.body || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    if (!isEmail(email)) return bad({ error: "Bitte gültige E‑Mail angeben." }, 400);

    const token = crypto.randomBytes(18).toString("hex");
    await query(
      `
      INSERT INTO newsletter_subscribers (email, status, token, created_at)
      VALUES ($1, 'pending', $2, NOW())
      ON CONFLICT (email) DO UPDATE SET
        status = CASE WHEN newsletter_subscribers.status='unsubscribed' THEN 'pending' ELSE newsletter_subscribers.status END,
        token = $2,
        created_at = NOW()
      `,
      [email, token]
    );

    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";
    const confirmUrl = `${siteUrl}/.netlify/functions/confirm?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
    const unsubUrl = `${siteUrl}/.netlify/functions/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <h2>Bestätige dein Briefing</h2>
        <p>Du bekommst künftig kurze Updates (Trending Names + neue Einträge). Bitte bestätige kurz:</p>
        <p><a href="${confirmUrl}" style="display:inline-block;padding:10px 14px;background:#111;color:#fff;text-decoration:none;border-radius:8px">✅ Briefing aktivieren</a></p>
        <p style="color:#666">Wenn du das nicht warst, ignoriere diese Mail.</p>
        <hr>
        <p style="color:#666;font-size:12px">Abmelden: <a href="${unsubUrl}">unsubscribe</a></p>
      </div>
    `;

    const send = await sendEmail({ to: email, subject: "Wissens‑Bank Briefing: Bitte bestätigen", html });

    return ok({ success: true, email, sent: !!send.sent, confirmUrl: send.dev ? confirmUrl : undefined });
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
