import { query } from "./_lib/db.mjs";
import { getPremiumTokenRecord } from "./_lib/auth.mjs";
import { page, html, escapeHtml } from "./_lib/html.mjs";

function pickSlug(event) {
  const p = (event.path || "").split("?")[0];
  const m = p.match(/\/file\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/\/+$/, "") : "";
}

function redactExcerpt(text) {
  let t = String(text || "");
  t = t.replace(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL]");
  t = t.replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, "[PHONE]");
  t = t.replace(/\b([A-Za-z]{2,})\b/g, (m) => (m.length >= 8 ? "█".repeat(Math.min(10, m.length)) : m));
  return t.slice(0, 240);
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
        <small>Index + Leseführung für öffentlich zugängliche Quellen · Premium: Highlights, Smart‑Match, Namen‑Index</small>
      </div>
      <div class="actions">
        <a class="btn" href="/admin.html">Admin</a>
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
      <div>© ${new Date().getFullYear()} Wissens‑Bank. <span class="muted">Recherche‑Index & Leseführung.</span></div>
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
  const item = { url: location.pathname, title, ts: Date.now(), type: "file" };
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

    const { rows: eRows } = await query(`SELECT id, name, slug FROM entities WHERE slug=$1 LIMIT 1`, [slug]);
    const entityName = eRows[0]?.name || slug.replace(/-/g, " ").trim();
    const entitySlug = eRows[0]?.slug || slug;

    let docs = [];
    if (eRows[0]?.id) {
      const { rows } = await query(
        `
        SELECT d.id, d.slug, d.title, d.source_name, d.source_url, d.published_at, d.image_url, d.excerpt, d.public_summary, d.premium_highlights
        FROM entity_mentions em
        JOIN documents d ON d.id = em.document_id
        WHERE em.entity_id=$1
        ORDER BY d.published_at DESC NULLS LAST, d.created_at DESC
        LIMIT 20
        `,
        [eRows[0].id]
      );
      docs = rows;
    } else {
      const like = `%${entityName}%`;
      const { rows } = await query(
        `
        SELECT id, slug, title, source_name, source_url, published_at, image_url, excerpt, public_summary, premium_highlights
        FROM documents
        WHERE title ILIKE $1 OR excerpt ILIKE $1 OR public_summary ILIKE $1
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT 20
        `,
        [like]
      );
      docs = rows;
    }



// --- Lightweight name view tracking (for Trending + social proof) ---
try {
  const ua = (event.headers?.["user-agent"] || event.headers?.["User-Agent"] || "").toLowerCase();
  const isBot = /bot|spider|crawler|slurp|facebookexternalhit|preview/.test(ua);
  if (event.httpMethod === "GET" && !isBot) {
    await query(
      `INSERT INTO analytics_events (event_type, metadata) VALUES ('name_view', $1::jsonb)`,
      [JSON.stringify({ slug: entitySlug, name: entityName })]
    );
  }
} catch (_) {}
    const count = docs.length;
    const desc = `Treffer-Index zu "${entityName}". ${count} aktuelle Treffer aus öffentlich zugänglichen Quellen. Premium: Highlights, Smart‑Match, Querverweise.`;

    const siteBase = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
    const og = siteBase ? new URL(`/.netlify/functions/og?name=${encodeURIComponent(entityName)}&subtitle=${encodeURIComponent("FILE • TREFFER-INDEX")}`, siteBase).toString()
                        : `/.netlify/functions/og?name=${encodeURIComponent(entityName)}&subtitle=${encodeURIComponent("FILE • TREFFER-INDEX")}`;

    const teaserItems = docs.slice(0, 6).map(d => {
      const red = redactExcerpt(d.excerpt || d.public_summary || "");
      const href = `/a/${encodeURIComponent(d.slug)}`;
      return `
        <div class="item">
          <div class="title"><a href="${href}">${escapeHtml(d.title)}</a></div>
          <div class="meta"><span>${escapeHtml(d.source_name || "")}</span><span>·</span><span>${d.published_at ? new Date(d.published_at).toLocaleDateString("de-DE") : ""}</span></div>
          <div class="p small muted">${escapeHtml(red)}${red.length>=240?"…":""}</div>
        </div>
      `;
    }).join("");

    const locked = !premium;
    const premiumBox = locked ? `
      <div class="premiumLock">
        <h4>Premium‑Teaser (vernebelt)</h4>
        <div class="p small muted">Du siehst Kontext, aber Details bleiben hinter der Paywall.</div>
        <div style="filter: blur(7px); user-select:none; pointer-events:none; opacity:.9">
          <ul>
            <li>Querverweis: Timeline‑Widersprüche zwischen Quellen</li>
            <li>Hinweis: Welche Dokumente zusammen gelesen werden sollten</li>
            <li>Prüffrage: Welche Passage du verifizieren solltest</li>
            <li>Index: Namen‑Knoten & Beziehungs‑Spuren</li>
          </ul>
        </div>
        <a class="btn danger" href="#" data-subscribe>Freischalten ab €1,99</a>
        <div class="p small muted" style="margin-top:10px">Rechtlicher Hinweis: Wir hosten keine fremden Volltexte, nur Index & Leseführung.</div>
      </div>
    ` : `
      <div class="card pad" style="margin-top:14px;border-color:#b40000">
        <div class="kicker">Premium aktiv</div>
        <div class="h2">Highlights & Querverweise</div>
        <div class="p small muted">Premium‑Highlights erscheinen pro Artikel. Öffne einen Treffer, um alles zu sehen.</div>
      </div>
    `;

    const body = chrome({ content: `
<main class="container">
  <div class="card pad" style="margin-top:16px">
    <div class="kicker">FILE</div>
    <div class="h1">${escapeHtml(entityName)}</div>
    <div class="meta">
      <span><strong>${count}</strong> Treffer</span>
      <span>·</span>
      <span>Index‑Seite für Long‑Tail SEO („Name + Epstein Files“)</span>
    </div>
    <div class="p muted" style="margin-top:10px">${escapeHtml(desc)}</div>
    <div id="sp" class="notice" style="display:none;margin-top:10px"></div>
    <script type="module">
      import { apiGet } from "/js/api.js";
      try {
        const sp = await apiGet("/api/social-proof?slug=${encodeURIComponent(entitySlug)}&minutes=60&min=8");
        const el = document.getElementById("sp");
        if (el && sp?.show) { el.style.display="block"; el.textContent = sp.message; }
      } catch (_) {}
    </script>
    <div class="searchbar">
      <input value="${escapeHtml(entityName)}" readonly>
      <a class="btn" href="/search.html?q=${encodeURIComponent(entityName)}">In der Suche öffnen</a>
      <a class="btn primary" href="#" data-subscribe>Premium freischalten</a>
    </div>
  </div>

  <div class="grid" style="grid-template-columns:1.15fr .85fr;margin-top:18px">
    <div class="card">
      <div class="pad" style="border-bottom:1px solid var(--line)">
        <div class="kicker">Treffer</div>
        <div class="h2">Aktuelle Quellenlinks</div>
        <div class="p small muted">Auszüge sind redigiert/gekürzt. Volltext liegt bei der Quelle.</div>
      </div>
      <div class="list">${teaserItems || `<div class="pad"><div class="alert">Noch keine Treffer. Ingestiere Quellen über <a href="/admin.html">Admin</a>.</div></div>`}</div>
    </div>

    <aside>
      <div class="card pad">
        <div class="kicker">Conversion</div>
        <div class="h2">Warum Premium?</div>
        <div class="p muted">Weil Lesen ohne Leseführung Zeit verbrennt.</div>
        <ul>
          <li><strong>Smart‑Match:</strong> zeigt dir sofort, welche Artikel relevant sind</li>
          <li><strong>Highlights:</strong> was prüfen, wo hakt’s, welche Querverweise</li>
          <li><strong>Namen‑Index:</strong> schneller zu neuen Landingpages</li>
        </ul>
        <a class="btn danger" href="#" data-subscribe>Freischalten ab €1,99</a>
        <hr>
        <div class="notice"><strong>DNS‑Tipp:</strong> Eigene Domain + SSL = mehr Trust.</div>
      </div>

      ${premiumBox}
    </aside>
  </div>
</main>
`});

    const headers = {
      "Cache-Control": locked ? "public, max-age=300, s-maxage=1800" : "private, no-store",
    };

    return html(200, page({
      title: `${entityName} – Epstein Files`,
      description: desc,
      urlPath: `/file/${entitySlug}`,
      ogImage: og,
      bodyHtml: body,
      canonicalBase: siteBase
    }), headers);

  } catch (e) {
    return html(500, "Internal error", { "Cache-Control": "no-store" });
  }
};
