# Epstein Files Empire (Netlify + Neon + Functions) — v13

Newsroom‑Skin + Programmatic SEO + Paywall + Analytics + Trending + Newsletter.

✅ Newsroom layout (NYT/WaPo‑Style)  
✅ RSS ingest + images (from RSS media/enclosure when available)  
✅ Article SSR (`/a/:slug`) + Name SSR (`/file/:slug`)  
✅ Paywall: Day Pass + Monats‑Abo + Pro (Stripe Checkout)  
✅ Analytics‑lite (Most Read) + Related Articles  
✅ Trending Names (real pageviews, 24h)
✅ Hot Topics (document tags, 30d)  
✅ Honest Social‑Proof („Du bist nicht allein …“) mit Privacy‑Threshold  
✅ Newsletter (Double‑Opt‑In) + Daily Briefing (Scheduled Function)  
✅ Sharded Sitemap (`/sitemap.xml` → `/sitemap-1.xml` …)

---

## Deploy (Netlify)
- Build command: `npm run build`
- Publish directory: `site`
- Functions: `netlify/functions` (auto via netlify.toml)

## Neon
Run: `database/schema.sql` in Neon SQL Editor once.

---

## Environment Variables (Netlify → Site settings → Environment variables)

### Minimum (läuft)
- `DATABASE_URL` (Neon pooled connection string, `sslmode=require`)
- `ADMIN_TOKEN` (protects Admin endpoints)
- `STRIPE_SECRET_KEY` (Stripe secret key)

**Nur Day Pass** funktioniert schon ohne Stripe Prices (weil 1‑time Preis inline erzeugt wird).

### Für Abo/Pro (empfohlen)
- `STRIPE_PRICE_ID_MONTHLY` (Stripe Price ID für €4,99/Monat)
- `STRIPE_PRICE_ID_PRO` (Stripe Price ID für Pro)

Optional:
- `STRIPE_DAYPASS_AMOUNT` (in Cent, default `199`)
- `CHECKOUT_MODE` (legacy: `payment` / `subscription`, normalerweise leer lassen)

### Newsletter / Briefing
- `RESEND_API_KEY` (wenn leer: dev‑Mode, Subscribe liefert Confirm‑Link zurück)
- `EMAIL_FROM` (verifizierte Absenderadresse in Resend)

### Anti‑Abuse
- `RATE_SALT` (random secret; hashes rate-limit buckets)

### Optional AI Enrichment (Roadmap)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

### Cron protection (optional)
- `CRON_SECRET`

---

## Avoid retyping env on every deploy
Netlify speichert Env‑Vars pro Site. Einmal setzen, fertig.

CLI‑Alternative:
```bash
npm i -g netlify-cli
netlify login
netlify env:import .env      # import local .env into the Netlify site
netlify env:export           # export existing vars
```

---

## Programmatic SEO
- Entity landing pages: `/file/:slug` (SSR via Netlify Function)
- Article pages: `/a/:slug` (SSR via Netlify Function)
- Dynamic OG images: `/.netlify/functions/og?name=...`
- Sitemap index: `/sitemap.xml` → shards `/sitemap-1.xml`, `/sitemap-2.xml`, …

---

## Image caching (Edge)
- Function: `/.netlify/functions/img?url=<remote>&w=1200&h=675`
- Used automatically on homepage + article SSR page
- Caches at the edge via `Cache-Control: s-maxage=604800` (7d) + SWR
- Optional resizing via public resizer: set `IMG_RESIZE_MODE=weserv`

---

## Admin
Open `/admin.html`, paste `ADMIN_TOKEN`, manage RSS sources and ingest/enrich.


## v15
- Continue Reading (browser local)
- Hot Topics (/api/topics)


---

## v15: Alerts / Watchlists
- Create: `POST /api/alerts` → sends confirmation email (double opt‑in)
- Confirm: `/.netlify/functions/alerts-confirm?id=...&token=...`
- Unsubscribe: `/.netlify/functions/alerts-unsubscribe?id=...&token=...`
- Cron: `alerts-scan` runs hourly and emails new matches since last check.



## Netlify Deploy Fix (wenn du nur 404/Missing build command siehst)
- Stelle sicher, dass **`netlify.toml` und `package.json` im Repo-Root** liegen.
- Wenn du aus Versehen den Projektordner in einen Repo-Ordner geschoben hast, setze in Netlify **Base directory** auf den Unterordner, in dem `netlify.toml` liegt.
- Build Command: `npm run build`
- Publish directory: `site`
