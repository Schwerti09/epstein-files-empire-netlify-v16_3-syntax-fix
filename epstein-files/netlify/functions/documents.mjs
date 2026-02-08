import { ok, bad, isOptions } from "./_lib/http.mjs";
import { getPremiumTokenRecord } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";
import { rateLimit } from "./_lib/ratelimit.mjs";

function clampInt(v, d, min, max) {
  const n = parseInt(v ?? d, 10);
  if (!Number.isFinite(n)) return d;
  return Math.max(min, Math.min(max, n));
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {

    // Rate limit (public search API): stronger for anonymous, looser for premium
    const rl = await rateLimit(event, { keyParts: ["documents"], limit: 180, windowSeconds: 3600 });
    // Premium tokens still count, but practically never hit.
    if (!rl.allowed) return bad({ success: false, error: "Rate limit exceeded", rateLimit: rl }, 429);

    const premium = await getPremiumTokenRecord(event);
    const qs = event.queryStringParameters || {};
    const page = clampInt(qs.page, 1, 1, 2000);
    const limit = clampInt(qs.limit, 20, 1, 50);
    const q = (qs.q || "").trim();
    const tag = (qs.tag || "").trim();
    const entity = (qs.entity || "").trim();
    const offset = (page - 1) * limit;

    const params = [];
    let where = "WHERE 1=1";
    let join = "";

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (d.title ILIKE $${params.length} OR d.excerpt ILIKE $${params.length} OR d.public_summary ILIKE $${params.length})`;
    }
    if (tag) {
      params.push(tag);
      where += ` AND $${params.length} = ANY(d.tags)`;
    }
    if (entity) {
      join += " JOIN entity_mentions em ON em.document_id=d.id JOIN entities e ON e.id=em.entity_id ";
      params.push(entity);
      where += ` AND e.name ILIKE $${params.length}`;
    }

    let selectExtra = ", FALSE AS has_premium_match";
    if (q && !premium) {
      params.push(`%${q}%`);
      selectExtra = `, EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(d.premium_highlights) t
        WHERE t ILIKE $${params.length}
      ) AS has_premium_match`;
    }

    params.push(limit);
    params.push(offset);

    const { rows } = await query(
      `
      SELECT
        d.id, d.slug, d.title, d.source_name, d.source_url, d.published_at,
        d.image_url, d.excerpt, d.public_summary, d.tags, d.created_at
        ${premium ? ", d.premium_highlights" : ", '[]'::jsonb AS premium_highlights"}
        ${selectExtra},
        COUNT(*) OVER() AS total_count
      FROM documents d
      ${join}
      ${where}
      ORDER BY d.published_at DESC NULLS LAST, d.created_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
      `,
      params
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;

// Lightweight search tracking (for Trending + social proof). Skips bots.
try {
  if (q && q.length >= 3) {
    const ua = (event.headers?.["user-agent"] || event.headers?.["User-Agent"] || "").toLowerCase();
    const isBot = /bot|spider|crawler|slurp|facebookexternalhit|preview/.test(ua);
    if (!isBot) {
      await query(
        `INSERT INTO analytics_events (event_type, metadata) VALUES ('search', $1::jsonb)`,
        [JSON.stringify({ q, tag: tag || null, entity: entity || null })]
      );
    }
  }
} catch (_) {}


    const headers = premium
      ? { "Cache-Control": "private, no-store" }
      : { "Cache-Control": "public, max-age=60, s-maxage=600" };

    return ok({
      success: true,
      premium: !!premium,
      data: rows.map(r => { delete r.total_count; return r; }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 }
    }, headers);

  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, err.statusCode || 500);
  }
};
