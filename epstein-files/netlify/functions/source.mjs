import { query } from "./_lib/db.mjs";
import { getPremiumTokenRecord } from "./_lib/auth.mjs";
import { page, html, escapeHtml } from "./_lib/html.mjs";

function pickSource(event) {
  const p = (event.path || "").split("?")[0];
  const m = p.match(/\/source\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/\/+$/, "") : "";
}

function redactExcerpt(text) {
  let t = String(text || "");
  t = t.replace(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL]");
  t = t.replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, "[PHONE]");
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
        <a class="btn" href="/search.html">Suche</a>
        <a class="btn" href="/names.html">Namen‑Index</a>
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
      <a href="/alerts.html">Alerts</a>
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
    const source = pickSource(event);
    if (!source) return html(302, "", { Location: "/sources.html" });

    const premium = await getPremiumTokenRecord(event);

    const { rows } = await query(
      `
      SELECT slug, title, source_name, source_url, published_at, image_url, excerpt, public_summary
      FROM documents
      WHERE source_name IS NOT NULL AND lower(source_name)=lower($1)
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT 30
      `,
      [source]
    );

    const countRow = await query(
      `
      SELECT COUNT(*)::int AS c
      FROM documents
      WHERE source_name IS NOT NULL AND lower(source_name)=lower($1)
      `,
      [source]
    );
    const total = countRow.rows[0]?.c || rows.length;

    const desc = `Quellenseite: "${source}". ${total} Treffer im Index. Premium: Highlights, Smart‑Match, Alerts.`;

    const siteBase = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
    const og = siteBase
      ? new URL(`/.netlify/functions/og?title=${encodeURIComponent(source)}&subtitle=${encodeURIComponent("SOURCE • PUBLIC LINKS")}`, siteBase).toString()
      : `/.netlify/functions/og?title=${encodeURIComponent(source)}&subtitle=${encodeURIComponent("SOURCE • PUBLIC LINKS")}`;

    const items = rows.map(d => {
      const red = redactExcerpt(d.excerpt || d.public_summary || "");
      return `
        <div class="item">
          <div class="title"><a href="/a/${encodeURIComponent(d.slug)}">${escapeHtml(d.title)}</a></div>
          <div class="meta"><span>${escapeHtml(d.source_name || "")}</span><span>·</span><span>${d.published_at ? new Date(d.published_at).toLocaleDateString("de-DE") : ""}</span></div>
          <div class="p small muted">${escapeHtml(red)}${red.length>=240?"…":""}</div>
        </div>
      `;
    }).join("");

    const locked = !premium;

    const body = chrome({ content: `
<main class="container">
  <div class="card pad" style="margin-top:16px">
    <div class="kicker">SOURCE</div>
    <div class="h1">${escapeHtml(source)}</div>
    <div class="meta"><span><strong>${total}</strong> Treffer</span><span>·</span><span>Landingpage für Long‑Tail SEO</span></div>
    <div class="p muted" style="margin-top:10px">${escapeHtml(desc)}</div>
    <div class="searchbar">
      <input value="${escapeHtml(source)}" readonly>
      <a class="btn" href="/search.html?q=${encodeURIComponent(source)}">Suche</a>
      <a class="btn" href="/alerts.html?q=${encodeURIComponent(source)}">🔔 Alert setzen</a>
      <a class="btn primary" href="#" data-subscribe>Premium</a>
    </div>
  </div>

  <div class="grid" style="grid-template-columns:1.15fr .85fr;margin-top:18px">
    <div class="card">
      <div class="pad" style="border-bottom:1px solid var(--line)">
        <div class="kicker">Treffer</div>
        <div class="h2">Aktuelle Quellenlinks</div>
        <div class="p small muted">Auszüge sind redigiert/gekürzt. Volltext liegt bei der Quelle.</div>
      </div>
      <div class="list">${items || `<div class="pad"><div class="alert">Noch keine Treffer. Ingestiere Quellen über <a href="/admin.html">Admin</a>.</div></div>`}</div>
    </div>

    <aside>
      <div class="card pad">
        <div class="kicker">Conversion</div>
        <div class="h2">Premium beschleunigt</div>
        <div class="p muted">Highlights + Smart‑Match sparen dir Click‑Hopping.</div>
        <a class="btn danger" href="#" data-subscribe>Freischalten ab €1,99</a>
      </div>

      ${locked ? `
      <div class="premiumLock" style="margin-top:14px">
        <h4>Premium‑Teaser</h4>
        <div class="p small muted">Welche Quelle wie oft auftaucht, und welche Passagen du prüfen solltest.</div>
        <a class="btn danger" href="#" data-subscribe>Freischalten ab €1,99</a>
      </div>` : ""}
    </aside>
  </div>
</main>
`});

    const headers = {
      "Cache-Control": locked ? "public, max-age=300, s-maxage=1800" : "private, no-store",
    };

    return html(200, page({
      title: `${source} – Source`,
      description: desc,
      urlPath: `/source/${encodeURIComponent(source)}`,
      ogImage: og,
      bodyHtml: body,
      canonicalBase: siteBase
    }), headers);

  } catch (e) {
    console.error("source ssr error", e);
    return html(500, "Internal error", { "Cache-Control": "no-store" });
  }
};
