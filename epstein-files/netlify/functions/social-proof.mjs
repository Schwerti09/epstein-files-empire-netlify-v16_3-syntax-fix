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
    const q = (qs.q || "").trim();
    const slug = (qs.slug || "").trim();
    const minutes = clampInt(qs.minutes, 60, 5, 24*60);
    const minShow = clampInt(qs.min, 8, 1, 50);

    if (!q && !slug) return bad({ success: false, error: "Missing q or slug" }, 400);

    // We only return social proof if we have enough volume (privacy + trust).
    // Count:
    // - searches with metadata.q ~= q (case-insensitive contains)
    // - name views for slug
    let count = 0;

    if (slug) {
      const { rows } = await query(
        `
        SELECT COUNT(*)::int AS c
        FROM analytics_events
        WHERE event_type IN ('name_view')
          AND created_at >= NOW() - ($1::int || ' minutes')::interval
          AND metadata->>'slug' = $2
        `,
        [minutes, slug]
      );
      count = rows?.[0]?.c || 0;
    } else {
      // q: we store exact query in metadata.q; use exact match first, fallback ILIKE
      const { rows } = await query(
        `
        SELECT COUNT(*)::int AS c
        FROM analytics_events
        WHERE event_type IN ('search')
          AND created_at >= NOW() - ($1::int || ' minutes')::interval
          AND (
            LOWER(metadata->>'q') = LOWER($2)
            OR (metadata->>'q') ILIKE $3
          )
        `,
        [minutes, q, `%${q}%`]
      );
      count = rows?.[0]?.c || 0;
    }

    const show = count >= minShow;

    return ok(
      {
        success: true,
        show,
        minutes,
        minShow,
        count,
        message: show
          ? `Du bist nicht allein: ${count} ${slug ? "Aufrufe" : "Suchen"} in den letzten ${minutes} Minuten.`
          : ""
      },
      { "Cache-Control": "public, max-age=10, s-maxage=60, stale-while-revalidate=120" }
    );
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
