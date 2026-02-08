import { query } from "./_lib/db.mjs";
import { json } from "./_lib/http.mjs";

export default async (event) => {
  try {
    const url = new URL(event.rawUrl || "http://local");
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "12", 10), 1), 50);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10), 1), 3650);

    const { rows } = await query(
      `SELECT tag, COUNT(*)::int AS count
       FROM (
         SELECT unnest(tags) AS tag
         FROM documents
         WHERE COALESCE(published_at, created_at) >= NOW() - ($1::int * INTERVAL '1 day')
           AND array_length(tags,1) IS NOT NULL
       ) t
       WHERE tag IS NOT NULL AND length(tag) > 0
       GROUP BY tag
       ORDER BY count DESC, tag ASC
       LIMIT $2`,
      [days, limit]
    );

    return json(200, { success: true, data: rows }, {
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400"
    });
  } catch (e) {
    console.error("topics error", e);
    return json(500, { success: false, error: "Internal error" }, { "Cache-Control": "no-store" });
  }
};
