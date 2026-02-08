import Stripe from "stripe";
import crypto from "node:crypto";
import { ok, bad, isOptions } from "./_lib/http.mjs";
import { query } from "./_lib/db.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function addHours(d, hours) {
  const t = new Date(d);
  t.setUTCHours(t.getUTCHours() + hours);
  return t;
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET") return bad({ error: "Method not allowed" }, 405);

    const qs = event.queryStringParameters || {};
    const session_id = (qs.session_id || "").trim() || (JSON.parse(event.body || "{}").session_id || "").trim();
    if (!session_id) return bad({ error: "Missing session_id" }, 400);

    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { apiVersion: "2024-06-20" });
    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ["subscription", "customer"] });

    let expiresAt = addHours(new Date(), 24);
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

    if (session.mode === "subscription") {
      const sub = session.subscription && typeof session.subscription !== "string" ? session.subscription : null;
      if (!sub) return bad({ error: "Subscription not expanded; retry" }, 502);
      if (sub.status !== "active" && sub.status !== "trialing") return bad({ error: "Subscription not active" }, 402);
      expiresAt = new Date(sub.current_period_end * 1000);
    } else {
      if (session.payment_status !== "paid") return bad({ error: "Payment not completed" }, 402);
    }

    const token = crypto.randomBytes(24).toString("hex");
    await query(
      `INSERT INTO premium_tokens (token, expires_at, stripe_customer_id, stripe_session_id, is_active)
       VALUES ($1, $2::timestamptz, $3, $4, TRUE)`,
      [token, expiresAt.toISOString(), customerId || null, session_id]
    );

    return ok({ success: true, token, expires_at: expiresAt.toISOString(), mode: session.mode });
  } catch (err) {
    return bad({ success: false, error: err.message || "Internal error" }, 500);
  }
};
