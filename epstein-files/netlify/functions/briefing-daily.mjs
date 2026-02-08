import { ok, bad } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Wissens‑Bank <briefing@localhost>";
  if (!key) return { sent: false, provider: "none" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html })
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`Resend error: ${res.status} ${t}`.slice(0, 300));
  }
  return { sent: true, provider: "resend" };
}

export default async () => {
  try {
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";

    const subs = await query(`SELECT email, token FROM newsletter_subscribers WHERE status='active' LIMIT 500`, []);
    if (!subs.rows.length) return ok({ success: true, sent: 0, note: "No active subscribers" });

    const docs = await query(
      `
      SELECT slug, title, source_name, published_at
      FROM documents
      WHERE published_at >= NOW() - INTERVAL '24 hours'
      ORDER BY published_at DESC NULLS LAST
      LIMIT 10
      `,
      []
    );

    const trending = await query(
      `
      SELECT e.name, e.slug, COUNT(*)::int AS hits
      FROM analytics_events ae
      JOIN entities e ON e.slug = (ae.metadata->>'slug')
      WHERE ae.event_type='name_view'
        AND ae.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY e.name, e.slug
      ORDER BY hits DESC
      LIMIT 10
      `,
      []
    );

    for (const s of subs.rows) {
      const email = s.email;
      const token = s.token;
      const unsubUrl = `${siteUrl}/.netlify/functions/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

      const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
          <h2>Wissens‑Bank Briefing (24h)</h2>
          <p style="color:#555">Kurz, faktisch, klickbar.</p>

          <h3>Trending Names</h3>
          <ol>
            ${trending.rows.map(r => `<li><a href="${siteUrl}/file/${encodeURIComponent(r.slug)}">${r.name}</a> <span style="color:#888">(${r.hits})</span></li>`).join("") || "<li>—</li>"}
          </ol>

          <h3>Neue Einträge</h3>
          <ol>
            ${docs.rows.map(d => `<li><a href="${siteUrl}/a/${encodeURIComponent(d.slug)}">${d.title}</a> <span style="color:#888">(${(d.source_name||"Quelle")})</span></li>`).join("") || "<li>—</li>"}
          </ol>

          <hr>
          <p style="color:#777;font-size:12px">Abmelden: <a href="${unsubUrl}">unsubscribe</a></p>
        </div>
      `;

      await sendEmail({ to: email, subject: "Wissens‑Bank Briefing: Trending + neue Einträge", html });
    }

    return ok({ success: true, sent: subs.rows.length });
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
