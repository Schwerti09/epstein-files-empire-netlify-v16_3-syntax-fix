import Stripe from "stripe";
import { ok, bad, isOptions } from "./_lib/http.mjs";
import { getBearerToken } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  try {
    if (event.httpMethod !== "POST") return bad({ error: "Method not allowed" }, 405);

    const token = getBearerToken(event);
    if (!token) return bad({ error: "Missing premium token" }, 401);

    const { rows } = await query(
      `SELECT stripe_customer_id FROM premium_tokens WHERE token=$1 AND is_active=TRUE LIMIT 1`,
      [token]
    );
    const customer = rows?.[0]?.stripe_customer_id;
    if (!customer) return bad({ error: "Kein Customer-ID gefunden (Day Pass oder nicht verknüpft)." }, 400);

    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { apiVersion: "2024-06-20" });
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";

    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${siteUrl}/account.html`
    });

    return ok({ success: true, url: session.url });
  } catch (err) {
    return bad({ success: false, error: err.message || "Stripe error" }, 500);
  }
};
