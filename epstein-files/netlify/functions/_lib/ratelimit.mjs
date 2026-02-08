import crypto from "node:crypto";
import { query } from "./db.mjs";

function requireEnv(name, fallback = "") {
  const v = process.env[name];
  return v || fallback;
}

function getIP(event) {
  const h = event.headers || {};
  const xf = h["x-forwarded-for"] || h["X-Forwarded-For"] || "";
  const ip = (h["x-nf-client-connection-ip"] || h["X-Nf-Client-Connection-Ip"] || xf.split(",")[0] || "").trim();
  return ip || "0.0.0.0";
}

function hashBucket(parts) {
  const salt = requireEnv("RATE_SALT", "dev_salt_change_me");
  const raw = parts.join("|") + "|" + salt;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 48);
}

/**
 * Fixed-window rate limiter (DB-backed).
 * - keyParts: pieces like [route, ip, apiKey]
 * - limit: max requests in windowSeconds
 */
export async function rateLimit(event, { keyParts = [], limit = 60, windowSeconds = 3600 } = {}) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  const ip = getIP(event);
  const bucket = hashBucket([ip, ...keyParts]);

  // Upsert + increment within window, else reset
  const { rows } = await query(
    `
    INSERT INTO rate_limits (bucket, count, reset_at, updated_at)
    VALUES ($1, 1, $2::timestamptz, NOW())
    ON CONFLICT (bucket) DO UPDATE SET
      count = CASE
        WHEN rate_limits.reset_at < NOW() THEN 1
        ELSE rate_limits.count + 1
      END,
      reset_at = CASE
        WHEN rate_limits.reset_at < NOW() THEN $2::timestamptz
        ELSE rate_limits.reset_at
      END,
      updated_at = NOW()
    RETURNING count, reset_at
    `,
    [bucket, resetAt.toISOString()]
  );

  const count = rows?.[0]?.count ?? 1;
  const ra = rows?.[0]?.reset_at ? new Date(rows[0].reset_at).toISOString() : resetAt.toISOString();

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    reset: ra,
    limit,
    ip
  };
}
