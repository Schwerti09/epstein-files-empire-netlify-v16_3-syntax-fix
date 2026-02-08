import { query } from "./_lib/db.mjs";

function xml(s=""){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

export default async (event) => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const base = siteUrl || "";

  const qs = event.queryStringParameters || {};
  const hasPage = typeof qs.page !== "undefined" && qs.page !== null && String(qs.page).trim() !== "";

  const limit = 2000;

  const { rows: totalRows } = await query(`SELECT COUNT(*)::int AS c FROM entities`);
  const total = totalRows[0]?.c || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // If /sitemap.xml is requested with no page param, serve a sitemapindex.
  if (!hasPage) {
    const items = [];
    // First sitemap contains static pages + first entity chunk
    for (let p = 1; p <= totalPages; p++) {
      const locPath = p === 1 ? "/sitemap-1.xml" : `/sitemap-${p}.xml`;
      const loc = base ? new URL(locPath, base).toString() : locPath;
      items.push(`<sitemap><loc>${xml(loc)}</loc></sitemap>`);
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items.join("\n")}
</sitemapindex>`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=3600",
        "X-Sitemap-Mode": "index",
        "X-Sitemap-Total": String(total),
        "X-Sitemap-Pages": String(totalPages),
      },
      body
    };
  }

  const page = Math.max(1, Math.min(200, parseInt(qs.page || "1", 10) || 1));
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT slug FROM entities ORDER BY name ASC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const staticPages = ["/", "/search.html", "/names.html", "/pricing.html", "/newsletter.html", "/about.html", "/partners.html", "/impressum.html", "/datenschutz.html", "/agb.html"];

  const urls = [];
  if (page === 1) {
    for (const p of staticPages) {
      urls.push(`<url><loc>${xml(base ? new URL(p, base).toString() : p)}</loc></url>`);
    }
  }
  for (const r of rows) {
    if (!r.slug) continue;
    const p = `/file/${r.slug}`;
    urls.push(`<url><loc>${xml(base ? new URL(p, base).toString() : p)}</loc></url>`);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=3600",
      "X-Sitemap-Mode": "page",
      "X-Sitemap-Page": String(page),
      "X-Sitemap-Total": String(total),
      "X-Sitemap-Pages": String(totalPages),
    },
    body
  };
};
