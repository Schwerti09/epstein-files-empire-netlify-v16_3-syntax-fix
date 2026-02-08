import { ok, bad, isOptions } from "./_lib/http.mjs";
import { getBearerToken } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  try {
    const token = getBearerToken(event);
    if (!token) return ok({ success: true, premium: false });

    const { rows } = await query(
      `
      SELECT token, expires_at, stripe_customer_id
      FROM premium_tokens
      WHERE token=$1 AND is_active=TRUE
      LIMIT 1
      `,
      [token]
    );

    if (!rows[0]) return ok({ success: true, premium: false });

    const exp = rows[0].expires_at ? new Date(rows[0].expires_at) : null;
    const active = exp ? exp.getTime() > Date.now() : false;

    return ok({
      success: true,
      premium: active,
      expires_at: rows[0].expires_at,
      has_customer: !!rows[0].stripe_customer_id
    }, active ? { "Cache-Control": "private, no-store" } : { "Cache-Control": "public, max-age=30" });
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
