import { ok, bad, isOptions } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    if (event.httpMethod === "GET") {
      const { rows } = await query(`SELECT id, name, feed_url, category, enabled, created_at FROM sources ORDER BY created_at DESC`);
      return ok({ success: true, data: rows });
    }

    await requireAdmin(event);

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const name = (body.name || "").trim();
      const feed_url = (body.feed_url || "").trim();
      const category = (body.category || "news").trim();
      if (!name || !feed_url) return bad({ error: "name + feed_url required" }, 400);

      const { rows } = await query(
        `INSERT INTO sources (name, feed_url, category, enabled) VALUES ($1,$2,$3,TRUE)
         ON CONFLICT (feed_url) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, enabled=TRUE
         RETURNING id, name, feed_url, category, enabled, created_at`,
        [name, feed_url, category]
      );
      return ok({ success: true, data: rows[0] });
    }

    if (event.httpMethod === "DELETE") {
      const qs = event.queryStringParameters || {};
      const id = (qs.id || "").trim();
      if (!id) return bad({ error: "id required" }, 400);
      await query(`DELETE FROM sources WHERE id=$1`, [id]);
      return ok({ success: true });
    }

    return bad({ error: "Method not allowed" }, 405);
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, err.statusCode || 500);
  }
};
