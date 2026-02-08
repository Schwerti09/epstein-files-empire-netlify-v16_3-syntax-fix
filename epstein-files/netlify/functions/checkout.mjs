import Stripe from "stripe";
import { ok, bad, isOptions } from "./_lib/http.mjs";
import { rateLimit } from "./_lib/ratelimit.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {

// Rate limit checkout creation (anti-abuse)
const rl = await rateLimit(event, { keyParts: ["checkout"], limit: 40, windowSeconds: 3600 });
if (!rl.allowed) return bad({ success: false, error: "Rate limit exceeded", rateLimit: rl }, 429);
    if (event.httpMethod !== "POST") return bad({ error: "Method not allowed" }, 405);

    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { apiVersion: "2024-06-20" });
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";

    const body = JSON.parse(event.body || "{}");
    const plan = String(body.plan || "").trim().toLowerCase() || "day";

    // Supported plans: day | monthly | pro
    // Fallback: CHECKOUT_MODE for legacy.
    const legacyMode = (process.env.CHECKOUT_MODE || body.mode || "").toLowerCase();
    const mode = (legacyMode || (plan === "day" ? "payment" : "subscription")).toLowerCase();

    let session;
    if (mode === "subscription") {
      const price = plan === "pro"
        ? requireEnv("STRIPE_PRICE_ID_PRO")
        : requireEnv("STRIPE_PRICE_ID_MONTHLY");
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        success_url: `${siteUrl}/premium.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
        cancel_url: `${siteUrl}/pricing.html?cancel=1`,
        allow_promotion_codes: true
      });
    } else {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "eur",
            unit_amount: parseInt(process.env.STRIPE_DAYPASS_AMOUNT || "199", 10) || 199,
            product_data: {
              name: "Wissens‑Bank Day Pass (24h)",
              description: "Premium Highlights + Smart‑Match (24 Stunden)"
            }
          },
          quantity: 1
        }],
        success_url: `${siteUrl}/premium.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
        cancel_url: `${siteUrl}/pricing.html?cancel=1`,
        allow_promotion_codes: true
      });
    }

    return ok({ success: true, url: session.url, mode, plan });
  } catch (err) {
    return bad({ success: false, error: err.message || "Stripe error" }, 500);
  }
};
