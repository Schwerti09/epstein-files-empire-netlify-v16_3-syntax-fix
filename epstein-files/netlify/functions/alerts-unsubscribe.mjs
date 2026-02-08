import { ok, bad, isOptions } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  try {
    const qs = event.queryStringParameters || {};
    const id = String(qs.id || "").trim();
    const token = String(qs.token || "").trim();
    if (!id || !token) return bad({ error: "Missing params" }, 400);

    await query(
      `
      UPDATE alerts
      SET status='unsubscribed', last_triggered_at=NOW()
      WHERE id=$1 AND token=$2
      `,
      [id, token]
    );

    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";
    const target = `${siteUrl}/alerts.html?status=unsubscribed`;
    return { statusCode: 302, headers: { Location: target } };
  } catch (err) {
    return bad({ error: err.message || "Internal error" }, 500);
  }
};
