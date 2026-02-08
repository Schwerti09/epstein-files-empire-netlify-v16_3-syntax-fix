import { ok, isOptions } from "./_lib/http.mjs";

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  return ok({
    ok: true,
    service: "epstein-files-empire",
    now: new Date().toISOString(),
    features: ["neon", "rss-ingest", "images(rss)", "stripe-pass-or-sub", "premium-match", "openai-enrich(optional)"]
  });
};
