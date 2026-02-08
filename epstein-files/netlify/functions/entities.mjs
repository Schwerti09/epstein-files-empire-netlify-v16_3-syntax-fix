import { ok, bad, isOptions } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    const qs = event.queryStringParameters || {};
    const q = (qs.q || "").trim();
    const limit = Math.max(1, Math.min(500, parseInt(qs.limit || "200", 10) || 200));

    const params = [];
    let where = "";
    if (q) { params.push(`%${q}%`); where = "WHERE e.name ILIKE $1"; }
    params.push(limit);

    const { rows } = await query(
      `
      SELECT e.name, e.slug, COUNT(em.document_id)::int AS docs
      FROM entities e
      LEFT JOIN entity_mentions em ON em.entity_id = e.id
      ${where}
      GROUP BY e.name, e.slug
      ORDER BY docs DESC, e.name ASC
      LIMIT $${params.length}
      `,
      params
    );

    return ok({ success: true, data: rows });
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
