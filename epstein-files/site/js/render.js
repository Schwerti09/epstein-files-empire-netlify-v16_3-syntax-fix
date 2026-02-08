import { apiGet, apiPost, fmtDate, esc, faviconUrl, safeImg, imgProxyUrl, getToken, clearToken } from "./api.js";

function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

function setActiveNav() {
  const path = location.pathname.replace(/\/$/, "");
  qsa(".nav a").forEach(a => {
    const href = a.getAttribute("href");
    if (href && (href === path || (href !== "/" && path.startsWith(href)))) a.classList.add("active");
  });
}

// v14: local continue-reading (privacy-safe, browser only)
const RECENT_KEY = "wb_recent_v1";
function getRecent() {
  try {
    const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function pushRecent(item) {
  try {
    const list = getRecent();
    const clean = [item, ...list.filter(x => x?.url !== item.url)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(clean));
  } catch {}
}
function hookContinueReading() {
  // capture clicks (also helps when SSR pages are cached)
  document.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("/a/") && !href.startsWith("/file/")) return;
    const title = (a.textContent || "").trim().slice(0, 160);
    pushRecent({ url: href, title, ts: Date.now(), type: href.startsWith("/a/") ? "article" : "file" });
  }, { passive: true });
}
function renderRecentItem(x) {
  if (!x?.url) return "";
  const label = x.type === "file" ? "Entity" : "Artikel";
  return `<div class="item compact">
    <div class="rank">${label}</div>
    <div>
      <div class="title"><a href="${esc(x.url)}">${esc(x.title || x.url)}</a></div>
      <div class="meta"><span class="muted">${new Date(x.ts||Date.now()).toLocaleString("de-DE")}</span></div>
    </div>
  </div>`;
}
function loadContinueReading() {
  const el = qs("#continueList");
  const card = qs("#continueReadingCard");
  if (!el || !card) return;
  const list = getRecent();
  if (!list.length) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";
  el.innerHTML = list.slice(0, 6).map(renderRecentItem).join("");
}

async function loadHotTopics() {
  const el = qs("#hotTopics");
  if (!el) return;
  el.innerHTML = `<div class="muted">Lade…</div>`;
  try {
    const out = await apiGet("/api/topics?limit=18&days=30");
    if (!out?.success) throw new Error(out?.error || "fail");
    const rows = out.data || [];
    if (!rows.length) {
      el.innerHTML = `<div class="muted">Noch keine Topics. Beim Ingest werden Tags vergeben.</div>`;
      return;
    }
    el.innerHTML = rows.map(r => {
      const tag = String(r.tag||"").trim();
      const c = r.count || 0;
      return `<a class="topicChip" href="/topic/${encodeURIComponent(tag)}">${esc(tag)} <span class="muted">(${c})</span></a>`;
    }).join("");
  } catch (e) {
    el.innerHTML = `<div class="muted">Topics nicht verfügbar.</div>`;
  }
}


async function loadTopSources() {
  const el = qs("#topSources");
  if (!el) return;
  el.innerHTML = `<div class="muted">Lade…</div>`;
  try {
    const out = await apiGet("/api/source-stats?limit=18&days=365");
    if (!out?.success) throw new Error(out?.error || "fail");
    const rows = out.data || [];
    if (!rows.length) {
      el.innerHTML = `<div class="muted">Noch keine Sources.</div>`;
      return;
    }
    el.innerHTML = rows.slice(0, 18).map(r => {
      const name = String(r.source_name || "").trim();
      const c = r.count || 0;
      return `<a class="topicChip" href="/source/${encodeURIComponent(name)}">${esc(name)} <span class="muted">(${c})</span></a>`;
    }).join("");
  } catch (e) {
    el.innerHTML = `<div class="muted">Sources nicht verfügbar.</div>`;
  }
}

function setTopbar() {
  const d = new Date();
  const el = qs("#today");
  if (el) el.textContent = d.toLocaleDateString("de-DE", { weekday:"long", year:"numeric", month:"long", day:"2-digit" });

  const token = getToken();
  const st = qs("#authState");
  if (st) st.textContent = token ? "Premium aktiv" : "Gast";

  const lo = qs("#logoutBtn");
  if (lo) {
    lo.style.display = token ? "inline-flex" : "none";
    lo.addEventListener("click", (e) => {
      e.preventDefault();
      clearToken();
      location.href = "/";
    });
  }

  // show sticky subscription ribbon only for guests
  const sticky = qs("#stickySub");
  if (sticky) sticky.style.display = token ? "none" : "block";
}

function renderThumb(d) {
  const img = safeImg(d.image_url);
  if (img) {
    // Cache + (optional) resize at the edge via Netlify Function
    const prox = imgProxyUrl(img, { w: 1200, h: 675, q: 82, fit: "cover" });
    return `<div class="thumb"><img loading="lazy" decoding="async" src="${esc(prox)}" alt=""></div>`;
  }
  const fav = faviconUrl(d.source_url);
  return `<div class="thumb"><div class="fallback"><img loading="lazy" decoding="async" src="${esc(fav)}" alt=""></div></div>`;
}

function textSnippet(d, n=200){
  const t = (d.public_summary || d.excerpt || "").trim();
  return esc(t.slice(0, n)) + (t.length > n ? "…" : "");
}

function renderLead(d) {
  return `
  <article class="card leadCard">
    <div class="leadMedia">
      ${renderThumb(d)}
    </div>
    <div class="pad">
      <div class="kicker">Top Story</div>
      <h2 class="h1"><a href="/a/${encodeURIComponent(d.slug)}">${esc(d.title)}</a></h2>
      <div class="meta">
        <span>${esc(d.source_name || "Quelle")}</span>
        <span>·</span>
        <span>${fmtDate(d.published_at)}</span>
      </div>
      <p class="p">${textSnippet(d, 320)}</p>
      <div class="tags">${(d.tags||[]).slice(0,6).map(t=>`<span class="tag"><strong>#</strong>${esc(t)}</span>`).join("")}</div>
      <div class="leadActions">
        <a class="btn" href="/a/${encodeURIComponent(d.slug)}">Lesen</a>
        <a class="btn primary" href="#" data-subscribe>Premium Highlights</a>
      </div>
    </div>
  </article>`;
}

function renderMostRead(i, d){
  return `
  <div class="item compact">
    <div class="rank">${i+1}</div>
    <div>
      <div class="title"><a href="/a/${encodeURIComponent(d.slug)}">${esc(d.title)}</a></div>
      <div class="meta"><span>${fmtDate(d.published_at)}</span></div>
    </div>
  </div>`;
}

function renderGridCard(d){
  return `
  <article class="card gridCard">
    ${renderThumb(d)}
    <div class="pad">
      <div class="kicker">Story</div>
      <div class="h3"><a href="/a/${encodeURIComponent(d.slug)}">${esc(d.title)}</a></div>
      <div class="meta"><span>${esc(d.source_name||"")}</span><span>·</span><span>${fmtDate(d.published_at)}</span></div>
      <div class="p small muted">${textSnippet(d, 140)}</div>
    </div>
  </article>`;
}

function renderListItem(d){
  return `
  <div class="item">
    <div class="media">
      ${renderThumb(d)}
      <div>
        <div class="kicker">Neu</div>
        <div class="title"><a href="/a/${encodeURIComponent(d.slug)}">${esc(d.title)}</a></div>
        <div class="meta"><span>${esc(d.source_name||"")}</span><span>·</span><span>${fmtDate(d.published_at)}</span></div>
        <div class="p small muted">${esc((d.excerpt||d.public_summary||"").slice(0,170))}${(d.excerpt||d.public_summary||"").length>170?"…":""}</div>
        <div class="tags">${(d.tags||[]).slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>
      </div>
    </div>
  </div>`;
}

function renderSidebarItem(d){
  return `
  <div class="item">
    <div class="title"><a href="/a/${encodeURIComponent(d.slug)}">${esc(d.title)}</a></div>
    <div class="meta"><span>${esc(d.source_name||"")}</span><span>·</span><span>${fmtDate(d.published_at)}</span></div>
  </div>`;
}

function renderBreaking(docs){
  const take = docs.slice(0, 6);
  const spans = take.map(d => {
    const href = `/a/${encodeURIComponent(d.slug)}`;
    const src = esc(d.source_name || "Quelle");
    return `<span class="tick"><a href="${href}">${esc(d.title)}</a> <em>(${src})</em></span>`;
  }).join('<span class="tickSep">•</span>');

  const el = qs("#breakingTicker");
  if (!el) return;

  if (!spans) {
    el.innerHTML = `<span class="muted">Noch keine Headlines. Öffne Admin → Ingest.</span>`;
    return;
  }

  // Duplicate for smooth marquee loop
  el.innerHTML = spans + '<span class="tickSep">•</span>' + spans;
}

async function loadTopics(qHint=""){
  const out = await apiGet(`/api/entities?limit=30${qHint?`&q=${encodeURIComponent(qHint)}`:""}`);
  const el = qs("#topicRows");
  if (!el) return;

  if (!out?.success) {
    el.innerHTML = `<div class="alert">Konnte Namen‑Index nicht laden.</div>`;
    return;
  }
  const rows = out.data || [];
  const chips = rows.slice(0, 18).map(r => {
    const slug = r.slug || (r.name||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
    return `<a class="topicChip" href="/file/${encodeURIComponent(slug)}">${esc(r.name)} <span class="muted">(${r.docs||0})</span></a>`;
  }).join("");
  el.innerHTML = chips || `<div class="muted">Noch keine Entities. Nutze Enrich, um Namen zu extrahieren.</div>`;
}

function hookSearch() {
  const form = qs("#searchForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = qs("#searchInput").value.trim();
    if (!q) return;
    location.href = `/search.html?q=${encodeURIComponent(q)}`;
  });
}

function hookSubscribeButtons() {
  qsa("[data-subscribe]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const old = btn.textContent;
      btn.textContent = "Weiterleitung…";
      const plan = btn.dataset.plan || "monthly";
      const out = await apiPost("/api/checkout", { plan });
      if (out?.url) location.href = out.url;
      else {
        alert(out?.error || "Checkout fehlgeschlagen");
        btn.textContent = old || "Premium freischalten";
      }
    });
  });
}

async function loadTrending() {
  const el = qs("#trendingNames");
  if (!el) return;
  el.innerHTML = `<div class="muted">Lade…</div>`;
  try {
    const out = await apiGet("/api/trending?limit=12&hours=24");
    if (!out?.success) throw new Error(out?.error || "fail");
    const rows = out.data || [];
    if (!rows.length) {
      el.innerHTML = `<div class="muted">Noch keine Trends. Sobald echte Aufrufe reinkommen, taucht hier etwas auf.</div>`;
      return;
    }
    el.innerHTML = rows.map((r,i)=>`
      <div class="item compact">
        <div class="rank">${i+1}</div>
        <div>
          <div class="title"><a href="/file/${encodeURIComponent(r.slug)}">${esc(r.name||r.slug)}</a></div>
          <div class="meta">
            <span>${r.hits} · 24h</span>
            <span>·</span>
            <span class="${(r.delta||0)>=0?"hl":""}">${(r.delta||0)>=0?"+":""}${r.delta||0} Δ</span>
          </div>
        </div>
      </div>
    `).join("");
  } catch (e) {
    el.innerHTML = `<div class="muted">Trends nicht verfügbar.</div>`;
  }
}

async function loadHome() {
  const data = await apiGet("/api/documents?limit=28");
  if (!data.success) throw new Error(data.error || "API failed");
  const docs = data.data || [];

  // Breaking
  renderBreaking(docs);

  // lead + grids
  const lead = docs[0];
let mostRead = docs.slice(1, 9);
try {
  const mrData = await apiGet("/api/most-read?limit=8&days=7");
  if (mrData?.success && Array.isArray(mrData.data) && mrData.data.length) {
    mostRead = mrData.data;
  }
} catch (_) {}
  const topGrid = docs.slice(9, 13);
  const latest = docs.slice(13, 25);
  const sidebar = docs.slice(25, 28);

  const leadEl = qs("#lead");
  leadEl.innerHTML = lead ? renderLead(lead) : `<div class="card pad"><div class="alert">Noch keine Daten. Öffne <a href="/admin.html">Admin</a> → Quellen hinzufügen → Ingest.</div></div>`;

  const mr = qs("#mostRead");
  if (mr) mr.innerHTML = mostRead.map((d,i)=>renderMostRead(i,d)).join("");

  const tg = qs("#topGrid");
  if (tg) tg.innerHTML = topGrid.map(renderGridCard).join("");

  const ll = qs("#latestList");
  if (ll) ll.innerHTML = latest.map(renderListItem).join("");

  const sl = qs("#sidebarList");
  if (sl) sl.innerHTML = sidebar.map(renderSidebarItem).join("");

  // Premium match teaser for querystring on homepage
  const params = new URLSearchParams(location.search);
  const q = (params.get("q") || "").trim();
  if (q) {
    const si = qs("#searchInput");
    if (si) si.value = q;
    const search = await apiGet(`/api/documents?q=${encodeURIComponent(q)}&limit=8`);
    const hasPremiumMatch = (search.data || []).some(x => x.has_premium_match);
    if (hasPremiumMatch && !getToken()) {
      const pm = qs("#premiumMatch");
      if (pm) pm.style.display = "block";
      const pmq = qs("#premiumMatchQuery");
      if (pmq) pmq.textContent = q;
    }
  }

  // Topics / names chips
  await loadTopics(q || "");
}

export async function boot(page) {
  setActiveNav();
  setTopbar();
  hookSearch();
  hookContinueReading();
  hookSubscribeButtons();
  if (page === "home") await loadHome();
  loadContinueReading();
  await loadHotTopics();
  await loadTrending();
}
