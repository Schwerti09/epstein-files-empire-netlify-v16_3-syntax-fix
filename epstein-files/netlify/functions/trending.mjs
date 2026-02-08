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
    const limit = clampInt(qs.limit, 12, 3, 50);
    const hours = clampInt(qs.hours, 24, 1, 168);

    // Trending is based on real interactions with /file/:slug pages (event_type = 'name_view')
    // We compute a "trend_score" as current_window - previous_window (same length).
    const { rows } = await query(
      `
      WITH cur AS (
        SELECT (metadata->>'slug') AS slug, COUNT(*)::int AS c
        FROM analytics_events
        WHERE event_type='name_view'
          AND created_at >= NOW() - ($1::int || ' hours')::interval
          AND (metadata->>'slug') IS NOT NULL
        GROUP BY slug
      ),
      prev AS (
        SELECT (metadata->>'slug') AS slug, COUNT(*)::int AS p
        FROM analytics_events
        WHERE event_type='name_view'
          AND created_at < NOW() - ($1::int || ' hours')::interval
          AND created_at >= NOW() - (($1::int*2) || ' hours')::interval
          AND (metadata->>'slug') IS NOT NULL
        GROUP BY slug
      )
      SELECT
        e.name,
        e.slug,
        COALESCE(cur.c,0) AS hits,
        COALESCE(prev.p,0) AS prev_hits,
        (COALESCE(cur.c,0) - COALESCE(prev.p,0)) AS delta
      FROM cur
      LEFT JOIN prev ON prev.slug = cur.slug
      LEFT JOIN entities e ON e.slug = cur.slug
      ORDER BY (COALESCE(cur.c,0) - COALESCE(prev.p,0)) DESC, cur.c DESC
      LIMIT $2
      `,
      [hours, limit]
    );

    return ok(
      { success: true, window_hours: hours, data: rows.filter(r => r.slug) },
      { "Cache-Control": "public, max-age=20, s-maxage=120, stale-while-revalidate=300" }
    );
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
