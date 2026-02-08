import { ok, bad, isOptions } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

function clampInt(v, d, min, max) {
  const n = parseInt(v ?? d, 10);
  if (!Number.isFinite(n)) return d;
  return Math.max(min, Math.min(max, n));
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    const qs = event.queryStringParameters || {};
    const limit = clampInt(qs.limit, 8, 1, 30);
    const days = clampInt(qs.days, 7, 1, 90);

    const { rows } = await query(
      `
      SELECT
        d.id, d.slug, d.title, d.source_name, d.source_url, d.published_at,
        d.image_url, d.excerpt, d.public_summary, d.tags,
        COUNT(ae.id)::int AS views
      FROM analytics_events ae
      JOIN documents d ON d.id = ae.document_id
      WHERE ae.event_type='view'
        AND ae.created_at >= NOW() - ($1::int || ' days')::interval
      GROUP BY d.id
      ORDER BY views DESC, d.published_at DESC NULLS LAST, d.created_at DESC
      LIMIT $2
      `,
      [days, limit]
    );

    return ok(
      { success: true, days, data: rows },
      { "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300" }
    );
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
