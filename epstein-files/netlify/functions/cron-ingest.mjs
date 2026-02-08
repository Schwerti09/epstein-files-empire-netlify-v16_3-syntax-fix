import { ok } from "./_lib/http.mjs";

export const config = { schedule: "@hourly" };

export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const cronSecret = process.env.CRON_SECRET || "";
  if (!siteUrl || !cronSecret) return ok({ ok: false, error: "Missing URL or CRON_SECRET env; cron disabled" });

  const target = new URL("/.netlify/functions/ingest-rss", siteUrl).toString();
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({ via: "cron" })
  });
  const text = await res.text();
  return ok({ ok: res.ok, status: res.status, response: text.slice(0, 2500) });
};
