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
    const slug = (qs.slug || "").trim();
    const limit = clampInt(qs.limit, 6, 1, 20);

    if (!slug) return bad({ success: false, error: "slug required" }, 400);

    // 1) Entity-based related docs
    const { rows: entityRows } = await query(
      `
      WITH me AS (
        SELECT em.entity_id
        FROM documents d
        JOIN entity_mentions em ON em.document_id = d.id
        WHERE d.slug = $1
      ),
      rel AS (
        SELECT d2.id, d2.slug, d2.title, d2.source_name, d2.source_url, d2.published_at,
               d2.image_url, d2.excerpt, d2.public_summary, d2.tags,
               COUNT(*)::int AS score
        FROM entity_mentions em2
        JOIN documents d2 ON d2.id = em2.document_id
        WHERE em2.entity_id IN (SELECT entity_id FROM me)
          AND d2.slug <> $1
        GROUP BY d2.id
      )
      SELECT * FROM rel
      ORDER BY score DESC, published_at DESC NULLS LAST
      LIMIT $2
      `,
      [slug, limit]
    );

    if (entityRows.length) {
      return ok(
        { success: true, mode: "entities", data: entityRows },
        { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=600" }
      );
    }

    // 2) Tag overlap fallback
    const { rows: tagRows } = await query(
      `
      WITH base AS (
        SELECT tags FROM documents WHERE slug=$1 LIMIT 1
      )
      SELECT d.id, d.slug, d.title, d.source_name, d.source_url, d.published_at,
             d.image_url, d.excerpt, d.public_summary, d.tags,
             (SELECT COUNT(*) FROM unnest(d.tags) t WHERE t = ANY((SELECT tags FROM base)))::int AS score
      FROM documents d
      WHERE d.slug <> $1
        AND d.tags && (SELECT tags FROM base)
      ORDER BY score DESC, d.published_at DESC NULLS LAST
      LIMIT $2
      `,
      [slug, limit]
    );

    return ok(
      { success: true, mode: "tags", data: tagRows },
      { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=600" }
    );
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
