import { query } from "./_lib/db.mjs";
import { getPremiumTokenRecord } from "./_lib/auth.mjs";
import { page, html, escapeHtml } from "./_lib/html.mjs";

function imgProxy(url, w=1200, h=675) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    const qs = new URLSearchParams({ url: u.toString() });
    if (w) qs.set("w", String(w));
    if (h) qs.set("h", String(h));
    qs.set("q", "82");
    qs.set("fit", "cover");
    return `/.netlify/functions/img?${qs.toString()}`;
  } catch { return ""; }
}


function pickSlug(event) {
  const p = (event.path || "").split("?")[0];
  const m = p.match(/\/a\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/\/+$/, "") : "";
}

function chrome({ content }) {
  const header = `
<div class="topbar">
  <div class="container">
    <div class="row">
      <div class="badge"><span class="dot"></span><strong>Live</strong> · ${escapeHtml(new Date().toLocaleDateString("de-DE", { weekday:"long", year:"numeric", month:"long", day:"2-digit" }))}</div>
      <div class="badge">Status: <span id="authState">Gast</span> · <a href="#" id="logoutBtn" style="display:none">Logout</a></div>
    </div>
  </div>
</div>

<div class="masthead">
  <div class="container">
    <div class="inner">
      <div class="logo">
        EPSTEIN FILES
        <small>Index + Leseführung für öffentlich zugängliche Quellen</small>
      </div>
      <div class="actions">
        <a class="btn" href="/">Start</a>
        <a class="btn primary" href="#" data-subscribe>Freischalten <small>ab €1,99</small></a>
      </div>
    </div>
  </div>
</div>

<div class="nav">
  <div class="container">
    <div class="row">
      <a href="/">Start</a>
      <a href="/search.html">Suche</a>
      <a href="/names.html">Namen‑Index</a>
        <a href="/topics.html">Topics</a>
        <a href="/sources.html">Sources</a>
        <a href="/timeline.html">Timeline</a>
      <a href="/about.html">Methode</a>
      <a href="/partners.html">Partner</a>
    </div>
  </div>
</div>
`;
  const footer = `
<div class="footer">
  <div class="container">
    <div class="row">
      <div>© ${new Date().getFullYear()} Wissens‑Bank.</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a href="/impressum.html">Impressum</a>
        <a href="/datenschutz.html">Datenschutz</a>
        <a href="/agb.html">AGB</a>
      </div>
    </div>
    <div style="margin-top:10px" class="p small muted">
      Hinweis: Wir hosten keine urheberrechtlich geschützten Inhalte Dritter. Wir verlinken auf Quellen und erstellen Zusammenfassungen/Leseführung.
    </div>
  </div>
</div>
<script type="module">
  import { apiPost, getToken, clearToken } from "/js/api.js";
  const t = getToken();
  const st = document.getElementById("authState");
  const lo = document.getElementById("logoutBtn");
  if (st) st.textContent = t ? "Premium aktiv" : "Gast";

// v14 continue-reading (local only)
try {
  const RECENT_KEY = "wb_recent_v1";
  const title = (document.querySelector("h1")?.textContent || document.title || "").trim().slice(0,160);
  const item = { url: location.pathname, title, ts: Date.now(), type: "article" };
  const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  const next = [item, ...(Array.isArray(list) ? list.filter(x => x?.url !== item.url) : [])].slice(0,12);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
} catch (_) {}
  if (lo) {
    lo.style.display = t ? "inline-flex" : "none";
    lo.addEventListener("click", (e)=>{ e.preventDefault(); clearToken(); location.reload(); });
  }
  document.querySelectorAll("[data-subscribe]").forEach(btn=>{
    btn.addEventListener("click", async (e)=>{
      e.preventDefault();
      const old = btn.textContent;
      btn.textContent = "Weiterleitung…";
      const out = await apiPost("/api/checkout", {});
      if (out?.url) location.href = out.url;
      else { alert(out?.error || "Checkout fehlgeschlagen"); btn.textContent = old; }
    });
  });
</script>
`;
  return header + content + footer;
}

export default async (event) => {
  try {
    const slug = pickSlug(event);
    if (!slug) return html(302, "", { Location: "/" });

    const premium = await getPremiumTokenRecord(event);
    const { rows } = await query(
      `SELECT id, slug, title, source_name, source_url, published_at, image_url, excerpt, public_summary, tags,
              ${premium ? "premium_highlights" : "'[]'::jsonb AS premium_highlights"}
       FROM documents WHERE slug=$1 LIMIT 1`,
      [slug]
    );
    if (!rows[0]) return html(404, "Not found", { "Cache-Control": "public, max-age=60" });

    const d = rows[0];
// --- Lightweight view tracking (no invasive client tracking) ---
// Counts only real GET requests, skips obvious bots.
try {
  const ua = (event.headers?.["user-agent"] || event.headers?.["User-Agent"] || "").toLowerCase();
  const isBot = /bot|spider|crawler|slurp|facebookexternalhit|preview/.test(ua);
  if (event.httpMethod === "GET" && !isBot) {
    await query(
      `INSERT INTO analytics_events (event_type, document_id, metadata)
       VALUES ('view', $1, $2::jsonb)`,
      [d.id, JSON.stringify({ slug: d.slug })]
    );
  }
} catch (_) {}

// --- Related stories (entities first, fallback tags) ---
let related = [];
try {
  const rel1 = await query(
    `
    WITH me AS (
      SELECT em.entity_id
      FROM entity_mentions em
      WHERE em.document_id = $1
    )
    SELECT d2.slug, d2.title, d2.source_name, d2.published_at, d2.image_url
    FROM entity_mentions em2
    JOIN documents d2 ON d2.id = em2.document_id
    WHERE em2.entity_id IN (SELECT entity_id FROM me)
      AND d2.id <> $1
    GROUP BY d2.slug, d2.title, d2.source_name, d2.published_at, d2.image_url
    ORDER BY COUNT(*) DESC, d2.published_at DESC NULLS LAST
    LIMIT 6
    `,
    [d.id]
  );
  related = rel1.rows || [];
  if (!related.length && Array.isArray(d.tags) && d.tags.length) {
    const rel2 = await query(
      `
      SELECT slug, title, source_name, published_at, image_url
      FROM documents
      WHERE id <> $1
        AND tags && $2::text[]
      ORDER BY published_at DESC NULLS LAST
      LIMIT 6
      `,
      [d.id, d.tags]
    );
    related = rel2.rows || [];
  }
} catch (_) {}

    const siteBase = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
    const og = siteBase ? new URL(`/.netlify/functions/og?title=${encodeURIComponent(d.title)}&subtitle=${encodeURIComponent("ARTICLE • PUBLIC SOURCES")}`, siteBase).toString()
                        : `/.netlify/functions/og?title=${encodeURIComponent(d.title)}&subtitle=${encodeURIComponent("ARTICLE • PUBLIC SOURCES")}`;

    const highlights = Array.isArray(d.premium_highlights) ? d.premium_highlights : [];
    const premiumHtml = premium ? `
      <div class="card pad" style="margin-top:14px;border-color:#b40000">
        <div class="kicker">Premium</div>
        <div class="h2">Highlights</div>
        <ul>${highlights.map(h=>`<li>${escapeHtml(h)}</li>`).join("") || "<li>Keine Highlights vorhanden.</li>"}</ul>
      </div>
    ` : `
      <div class="premiumLock">
        <h4>Premium‑Highlights (gesperrt)</h4>
        <div class="p small muted">Freischalten zeigt kuratierte Prüfpunkte und Querverweise.</div>
        <a class="btn danger" href="#" data-subscribe>Freischalten ab €1,99</a>
      </div>
    `;

    const imgUrl = imgProxy(d.image_url, 1400, 788) || d.image_url;
    const img = imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="" onerror="this.src='/assets/placeholder.svg'">`
                            : `<img src="/assets/placeholder.svg" alt="">`;

    const content = chrome({ content: `
<main class="container">
  <div class="grid" style="grid-template-columns:1.1fr .9fr;margin-top:16px">
    <div>
      <div class="card pad">
        <div class="kicker">Artikel</div>
        <div class="h1">${escapeHtml(d.title)}</div>
        <div class="meta">
          <span>${escapeHtml(d.source_name || "")}</span><span>·</span>
          <span>${d.published_at ? new Date(d.published_at).toLocaleDateString("de-DE") : ""}</span>
        </div>

        <div class="thumb" style="width:100%;height:320px;margin-top:12px">${img}</div>

        <hr>
        <div class="p">${escapeHtml(d.public_summary || "")}</div>
        <div class="p small muted">${escapeHtml(d.excerpt || "")}</div>

        
${related && related.length ? `
<div class="card pad" style="margin-top:14px">
  <div class="kicker">Related Stories</div>
  <div class="h2">Ähnliche Fundstellen</div>
  <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
    ${related.slice(0,6).map(r => {
      const rImg = imgProxy(r.image_url, 900, 506) || r.image_url || "/assets/placeholder.svg";
      return `
      <a class="card" href="/a/${encodeURIComponent(r.slug)}" style="text-decoration:none">
        <div class="thumb" style="width:100%;height:140px">${rImg ? `<img src="${escapeHtml(rImg)}" alt="" loading="lazy" decoding="async" onerror="this.src='/assets/placeholder.svg'">` : ""}</div>
        <div class="pad">
          <div class="kicker">${escapeHtml(r.source_name || "Quelle")}</div>
          <div class="h3" style="margin:0">${escapeHtml(r.title || "")}</div>
          <div class="meta" style="margin-top:6px">${r.published_at ? new Date(r.published_at).toLocaleDateString("de-DE") : ""}</div>
        </div>
      </a>
      `;
    }).join("")}
  </div>
</div>
` : ""}

<hr>
<div class="p small">

          Quelle: <a href="${escapeHtml(d.source_url)}" target="_blank" rel="noopener">${escapeHtml(d.source_url)}</a>
        </div>
      </div>
    </div>

    <aside>
      <div class="card pad">
        <div class="kicker">Aktion</div>
        <div class="h2">Premium: Leseführung</div>
        <div class="p muted">Highlights + Smart‑Match + Namen‑Index.</div>
        <a class="btn primary" href="#" data-subscribe>Freischalten ab €1,99</a>
        <hr>
        <div class="notice">Hinweis: Wir verlinken nur auf Quellen. Keine fremden Volltexte hier.</div>
      </div>
      <div class="card pad" style="margin-top:18px">
        <div class="kicker">Tags</div>
        <div class="h2">Kategorien</div>
        <div class="tags">${(d.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
      </div>
    </aside>
  </div>
</main>
`});

    const headers = { "Cache-Control": premium ? "private, no-store" : "public, max-age=300, s-maxage=1800" };

    return html(200, page({
      title: `${d.title} – Epstein Files`,
      description: (d.public_summary || d.excerpt || "").slice(0, 180),
      urlPath: `/a/${d.slug}`,
      ogImage: og,
      bodyHtml: content,
      canonicalBase: siteBase
    }), headers);

  } catch (e) {
    return html(500, "Internal error", { "Cache-Control": "no-store" });
  }
};
