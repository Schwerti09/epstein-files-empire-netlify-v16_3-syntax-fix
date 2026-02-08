import { ok, bad, isOptions } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    const url = new URL(event.rawUrl || "http://local");
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "60", 10), 1), 500);
    const daysRaw = parseInt(url.searchParams.get("days") || "365", 10);
    const days = Math.min(Math.max(Number.isFinite(daysRaw) ? daysRaw : 365, 1), 3650);

    const { rows } = await query(
      `
      SELECT
        COALESCE(source_name,'Unbekannt') AS source_name,
        lower(regexp_replace(COALESCE(source_name,'unbekannt'), '[^a-zA-Z0-9]+', '-', 'g')) AS slug,
        COUNT(*)::int AS count,
        MAX(COALESCE(published_at, created_at)) AS last_seen
      FROM documents
      WHERE COALESCE(published_at, created_at) >= NOW() - ($1::int * INTERVAL '1 day')
        AND COALESCE(source_name,'') <> ''
      GROUP BY source_name, slug
      ORDER BY count DESC, source_name ASC
      LIMIT $2
      `,
      [days, limit]
    );

    return ok({ success: true, days, data: rows }, {
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400"
    });
  } catch (e) {
    console.error("source-stats error", e);
    return bad({ success: false, error: "Internal error" }, 500, { "Cache-Control": "no-store" });
  }
};
