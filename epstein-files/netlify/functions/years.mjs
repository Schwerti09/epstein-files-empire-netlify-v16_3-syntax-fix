import { ok, bad, isOptions } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    const { rows } = await query(
      `
      SELECT
        EXTRACT(YEAR FROM COALESCE(published_at, created_at))::int AS year,
        COUNT(*)::int AS count,
        MAX(COALESCE(published_at, created_at)) AS last_seen
      FROM documents
      GROUP BY year
      ORDER BY year DESC
      `
    );

    return ok({ success: true, data: rows }, {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
    });
  } catch (e) {
    console.error("years error", e);
    return bad({ success: false, error: "Internal error" }, 500, { "Cache-Control": "no-store" });
  }
};
