import { query } from "./db.mjs";

export function getBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function isAdmin(event) {
  const token = getBearerToken(event);
  const admin = process.env.ADMIN_TOKEN;
  return !!admin && !!token && token === admin;
}

export async function getPremiumTokenRecord(event) {
  const token = getBearerToken(event);
  if (!token) return null;
  const { rows } = await query(
    `SELECT token, expires_at, is_active FROM premium_tokens WHERE token=$1 LIMIT 1`,
    [token]
  );
  if (!rows[0]) return null;
  if (!rows[0].is_active) return null;
  const exp = new Date(rows[0].expires_at).getTime();
  if (Number.isFinite(exp) && exp > Date.now()) return rows[0];
  return null;
}

export async function requireAdmin(event) {
  if (!isAdmin(event)) throw Object.assign(new Error("Admin required"), { statusCode: 401 });
}
