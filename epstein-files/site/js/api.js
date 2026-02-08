export function getToken() {
  return localStorage.getItem("premium_token") || "";
}
export function setToken(t) {
  localStorage.setItem("premium_token", t);
}
export function clearToken() {
  localStorage.removeItem("premium_token");
}

export async function apiGet(path) {
  const token = getToken();
  const res = await fetch(path, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
  return await res.json();
}

export async function apiPost(path, body) {
  const token = getToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {})
  });
  return await res.json();
}

export function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("de-DE", { year:"numeric", month:"short", day:"2-digit" }); }
  catch { return ""; }
}

export function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

export function domainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function faviconUrl(url) {
  const d = domainFromUrl(url);
  if (!d) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`;
}

export function safeImg(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch { return ""; }
}


export function imgProxyUrl(url, opts = {}) {
  const u = safeImg(url);
  if (!u) return "";
  const w = opts.w || 0;
  const h = opts.h || 0;
  const q = opts.q || 82;
  const fit = opts.fit || "cover";
  const qs = new URLSearchParams({ url: u });
  if (w) qs.set("w", String(w));
  if (h) qs.set("h", String(h));
  if (q) qs.set("q", String(q));
  if (fit) qs.set("fit", String(fit));
  return `/.netlify/functions/img?${qs.toString()}`;
}
