import { ok, bad, isOptions } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";
import { slugify } from "./_lib/slug.mjs";
import { openaiText, safeJsonParse } from "./_lib/openai.mjs";

function cleanArray(a) {
  return Array.isArray(a) ? a.map(x => String(x || "").trim()).filter(Boolean).slice(0, 30) : [];
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    await requireAdmin(event);
    if (event.httpMethod !== "POST") return bad({ error: "Method not allowed" }, 405);

    const body = JSON.parse(event.body || "{}");
    const id = (body.id || body.document_id || "").trim();
    if (!id) return bad({ error: "id required" }, 400);

    const { rows } = await query(
      `SELECT id, title, source_name, source_url, excerpt, public_summary, premium_highlights, tags
       FROM documents WHERE id::text=$1 OR slug=$1 LIMIT 1`,
      [id]
    );
    if (!rows[0]) return bad({ error: "Not found" }, 404);

    const doc = rows[0];
    const input = `
TITLE: ${doc.title}
SOURCE: ${doc.source_name || ""}
URL: ${doc.source_url}
EXCERPT: ${doc.excerpt || ""}

Task:
1) Write a factual public summary in German (2-3 Sätze). Avoid accusations; use neutral phrasing like "berichtete", "laut Quelle".
2) Create 5-8 premium highlights (German). These must be "reading pointers": what to look for, contradictions, what to verify. No defamatory claims.
3) Suggest up to 8 tags (prefer German).
4) Extract up to 12 entity names explicitly mentioned in title/excerpt; do NOT invent.
Return STRICT JSON with keys: public_summary, premium_highlights (array), tags (array), entities (array).
`;

    const out = await openaiText({
      instructions: "You are a careful research editor. Be neutral and factual. Output STRICT JSON only.",
      input,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      max_output_tokens: 900,
      temperature: 0.2
    });

    const parsed = safeJsonParse(out) || safeJsonParse(out.match(/\{[\s\S]*\}/)?.[0] || "");
    if (!parsed) return bad({ error: "Failed to parse AI JSON", raw: out.slice(0, 800) }, 502);

    const public_summary = String(parsed.public_summary || "").trim().slice(0, 1200);
    const premium_highlights = cleanArray(parsed.premium_highlights).slice(0, 10);
    const tags = cleanArray(parsed.tags).map(t => t.slice(0, 40)).slice(0, 10);
    const entities = cleanArray(parsed.entities).map(e => e.slice(0, 80)).slice(0, 20);

    await query(
      `UPDATE documents SET public_summary=$2, premium_highlights=$3::jsonb, tags=$4::text[] WHERE id=$1`,
      [doc.id, public_summary, JSON.stringify(premium_highlights), tags]
    );

    for (const name of entities) {
      const eRes = await query(
        `INSERT INTO entities (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`,
        [name, slugify(name)]
      );
      const entityId = eRes.rows[0].id;
      await query(
        `INSERT INTO entity_mentions (document_id, entity_id, mention_count)
         VALUES ($1,$2,1)
         ON CONFLICT (document_id, entity_id) DO UPDATE SET mention_count = entity_mentions.mention_count + 1`,
        [doc.id, entityId]
      );
    }

    return ok({ success: true, id: doc.id, public_summary, premium_highlights, tags, entities });

  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, err.statusCode || 500);
  }
};
