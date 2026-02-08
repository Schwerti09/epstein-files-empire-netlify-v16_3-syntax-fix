import { ok, bad, isOptions } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  try {
    const qs = event.queryStringParameters || {};
    const email = String(qs.email || "").trim().toLowerCase();
    const token = String(qs.token || "").trim();
    if (!email || !token) return bad({ error: "Missing email/token" }, 400);

    const { rowCount } = await query(
      `
      UPDATE newsletter_subscribers
      SET status='active', confirmed_at=NOW()
      WHERE email=$1 AND token=$2
      `,
      [email, token]
    );

    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";
    if (!rowCount) return { statusCode: 302, headers: { Location: `${siteUrl}/newsletter.html?status=invalid` }, body: "" };
    return { statusCode: 302, headers: { Location: `${siteUrl}/newsletter.html?status=confirmed` }, body: "" };
  } catch (err) {
    return bad({ error: err.message || "Internal error" }, 500);
  }
};
