import { ok, bad, isOptions } from "./_lib/http.mjs";
import { getPremiumTokenRecord } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    const premium = await getPremiumTokenRecord(event);
    const qs = event.queryStringParameters || {};
    const idOrSlug = (qs.id || qs.slug || "").trim();
    if (!idOrSlug) return bad({ error: "Missing id or slug" }, 400);

    const { rows } = await query(
      `
      SELECT
        id, slug, title, source_name, source_url, published_at, image_url,
        excerpt, public_summary, tags, created_at, updated_at,
        ${premium ? "premium_highlights" : "'[]'::jsonb AS premium_highlights"}
      FROM documents
      WHERE id::text = $1 OR slug = $1
      LIMIT 1
      `,
      [idOrSlug]
    );

    if (!rows[0]) return bad({ error: "Not found" }, 404);
    return ok({ success: true, premium: !!premium, data: rows[0] });
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, err.statusCode || 500);
  }
};
