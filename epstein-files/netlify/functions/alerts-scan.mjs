import { ok, bad } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

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

function nowIso(){ return new Date().toISOString(); }

function buildDigest({ siteUrl, items, manageUrl, title }) {
  const rows = items.map(it => `
    <li style="margin:0 0 10px 0">
      <div style="font-weight:700">${escapeHtml(it.title || "Untitled")}</div>
      <div style="color:#666;font-size:12px">${escapeHtml(it.source_name||"")} · ${escapeHtml(it.published||"")}</div>
      <div><a href="${it.url}">${it.url}</a></div>
    </li>
  `).join("");

  return `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
      <h2>${escapeHtml(title)}</h2>
      <p>Neue Treffer seit dem letzten Check:</p>
      <ol>${rows}</ol>
      <hr>
      <p style="color:#666;font-size:12px">Alert verwalten: <a href="${manageUrl}">unsubscribe</a></p>
    </div>
  `;
}

function escapeHtml(s="") {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export default async (event, context) => {
  try {
    // Optional protection for manual calls
    const cronSecret = process.env.CRON_SECRET;
    const provided = event.headers?.["x-cron-secret"] || event.headers?.["X-Cron-Secret"];
    if (cronSecret && provided && provided !== cronSecret) {
      return bad({ error: "Forbidden" }, 403);
    }

    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";
    const batch = Math.max(1, Math.min(200, parseInt(process.env.ALERTS_BATCH_LIMIT || "80", 10) || 80));

    // Select active alerts
    const { rows: alerts } = await query(
      `
      SELECT id, email, kind, query, entity_slug, token, frequency, limit_per_send, last_checked_at
      FROM alerts
      WHERE status='active'
      ORDER BY last_checked_at ASC
      LIMIT $1
      `,
      [batch]
    );

    let processed = 0, triggered = 0, sent = 0;

    for (const a of alerts) {
      processed++;

      // Frequency gating
      const last = a.last_checked_at ? new Date(a.last_checked_at).getTime() : 0;
      const minMs = (a.frequency === "hourly") ? 60*60*1000 : 24*60*60*1000;
      if (Date.now() - last < minMs*0.85) continue;

      let term = (a.query || "").trim();
      let kindTitle = "Alert";
      if (a.kind === "name") {
        // resolve slug -> name (fallback to slug itself)
        const { rows: er } = await query(`SELECT name FROM entities WHERE slug=$1 LIMIT 1`, [a.entity_slug]);
        term = (er[0]?.name || a.entity_slug || "").trim();
        kindTitle = `Name Alert: ${term}`;
      } else {
        kindTitle = `Search Alert: ${term}`;
      }
      if (!term) continue;

      // Find new documents since last_checked_at
      const since = a.last_checked_at ? new Date(a.last_checked_at) : new Date(Date.now() - 7*24*60*60*1000);

      const { rows: hits } = await query(
        `
        SELECT d.id, d.slug, d.title, d.source_name, d.published_at
        FROM documents d
        WHERE (d.title ILIKE $1 OR COALESCE(d.excerpt,'') ILIKE $1 OR COALESCE(d.public_summary,'') ILIKE $1)
          AND COALESCE(d.published_at, d.created_at) > $2
        ORDER BY COALESCE(d.published_at, d.created_at) DESC
        LIMIT $3
        `,
        [`%${term}%`, since, Math.max(1, Math.min(30, a.limit_per_send || 10))]
      );

      // Filter already sent via alert_hits, insert new
      const fresh = [];
      for (const h of hits) {
        const ins = await query(
          `INSERT INTO alert_hits (alert_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [a.id, h.id]
        );
        if (ins.rowCount === 1) {
          fresh.push(h);
        }
      }

      // Update checked timestamp regardless (prevents hammering)
      await query(`UPDATE alerts SET last_checked_at=NOW() WHERE id=$1`, [a.id]);

      if (!fresh.length) continue;

      triggered++;

      const manageUrl = `${siteUrl}/.netlify/functions/alerts-unsubscribe?id=${encodeURIComponent(a.id)}&token=${encodeURIComponent(a.token)}`;
      const items = fresh.map(h => ({
        title: h.title,
        source_name: h.source_name,
        published: h.published_at ? new Date(h.published_at).toLocaleString("de-DE") : "",
        url: `${siteUrl}/a/${encodeURIComponent(h.slug)}`
      }));

      const html = buildDigest({
        siteUrl,
        items,
        manageUrl,
        title: `Wissens‑Bank: ${kindTitle} (${items.length} neu)`
      });

      const provider = await sendEmail({
        to: a.email,
        subject: `Wissens‑Bank Alert: ${term} (${items.length} neu)`,
        html
      });

      if (provider.sent) sent++;
      await query(`UPDATE alerts SET last_triggered_at=NOW() WHERE id=$1`, [a.id]);
    }

    return ok({ success: true, processed, triggered, sent, at: nowIso() });
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
