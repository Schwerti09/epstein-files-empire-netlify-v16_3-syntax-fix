import Parser from "rss-parser";
import { ok, bad, isOptions } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";
import { slugify, uniqueSlug } from "./_lib/slug.mjs";

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
    ]
  }
});

function pickPublished(item) {
  return item.isoDate || item.pubDate || item.published || null;
}

function pickExcerpt(item) {
  return (item.contentSnippet || item.summary || item.content || "")
    .toString()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function pickImage(item) {
  if (item?.enclosure?.url) return String(item.enclosure.url).trim();

  const thumb = item?.mediaThumbnail?.[0]?.$?.url || item?.mediaThumbnail?.[0]?.url;
  if (thumb) return String(thumb).trim();

  const mc = item?.mediaContent?.[0]?.$?.url || item?.mediaContent?.[0]?.url;
  if (mc) return String(mc).trim();

  if (item?.image?.url) return String(item.image.url).trim();
  if (typeof item?.image === "string") return item.image.trim();
  return null;
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    // Cron support
    const cronSecret = process.env.CRON_SECRET;
    const providedCron = (event.headers?.["x-cron-secret"] || event.headers?.["X-Cron-Secret"] || "").trim();
    const cronOk = cronSecret && providedCron && providedCron === cronSecret;

    if (!cronOk && event.httpMethod !== "GET") await requireAdmin(event);

    if (event.httpMethod === "GET") {
      const { rows } = await query(`SELECT COUNT(*)::int AS sources, (SELECT COUNT(*)::int FROM documents) AS documents FROM sources WHERE enabled=TRUE`);
      return ok({ success: true, stats: rows[0] });
    }

    const { rows: sources } = await query(`SELECT id, name, feed_url, category FROM sources WHERE enabled=TRUE ORDER BY created_at DESC LIMIT 80`);
    if (!sources.length) return ok({ success: true, ingested: 0, message: "No enabled sources" });

    let inserted = 0, updated = 0;
    const errors = [];

    for (const s of sources) {
      try {
        const feed = await parser.parseURL(s.feed_url);
        const items = (feed.items || []).slice(0, 30);

        for (const item of items) {
          const link = (item.link || item.guid || "").trim();
          const title = (item.title || "").trim();
          if (!link || !title) continue;

          const base = slugify(title);
          const slug = uniqueSlug(base, slugify(link).slice(0, 10));

          const published_at = pickPublished(item);
          const excerpt = pickExcerpt(item);
          const image_url = pickImage(item);
          const tags = Array.from(new Set([s.category].filter(Boolean)));

          const res = await query(
            `
            INSERT INTO documents (slug, title, source_name, source_url, published_at, image_url, excerpt, tags)
            VALUES ($1,$2,$3,$4, $5::timestamptz, $6, $7, $8::text[])
            ON CONFLICT (source_url) DO UPDATE SET
              title=EXCLUDED.title,
              source_name=EXCLUDED.source_name,
              published_at=COALESCE(EXCLUDED.published_at, documents.published_at),
              image_url=COALESCE(NULLIF(EXCLUDED.image_url,''), documents.image_url),
              excerpt=COALESCE(NULLIF(EXCLUDED.excerpt,''), documents.excerpt),
              tags=(SELECT ARRAY(SELECT DISTINCT unnest(documents.tags || EXCLUDED.tags)))
            RETURNING (xmax = 0) AS inserted
            `,
            [slug, title, s.name, link, published_at, image_url, excerpt, tags]
          );
          if (res.rows[0]?.inserted) inserted++;
          else updated++;
        }
      } catch (e) {
        errors.push({ source: s.feed_url, error: String(e.message || e).slice(0, 240) });
      }
    }

    return ok({ success: true, inserted, updated, errors });
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, err.statusCode || 500);
  }
};
