import { ok, bad, isOptions } from "./_lib/http.mjs";

function isPrivateHost(hostname) {
  const h = (hostname || "").toLowerCase();

  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (h === "::1") return true;

  // IPv6 unique-local / link-local
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;

  // IPv4 literal private ranges
  const m = h.match(/^\d{1,3}(?:\.\d{1,3}){3}$/);
  if (m) {
    const parts = h.split(".").map(x => parseInt(x, 10));
    if (parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return true;

    const [a,b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }

  return false;
}

function clampInt(v, d, min, max) {
  const n = parseInt(v ?? d, 10);
  if (!Number.isFinite(n)) return d;
  return Math.max(min, Math.min(max, n));
}

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  try {
    const qs = event.queryStringParameters || {};
    const raw = (qs.url || "").trim();
    if (!raw) return bad({ error: "Missing url" }, 400);
    if (raw.length > 2200) return bad({ error: "URL too long" }, 400);

    let target;
    try { target = new URL(raw); }
    catch { return bad({ error: "Invalid url" }, 400); }

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return bad({ error: "Only http/https allowed" }, 400);
    }
    if (isPrivateHost(target.hostname)) {
      return bad({ error: "Blocked host" }, 400);
    }

    // Optional: if you want resizing via a public resizer,
    // set IMG_RESIZE_MODE=weserv in ENV.
    const w = clampInt(qs.w, 0, 0, 2400);
    const h = clampInt(qs.h, 0, 0, 2400);
    const q = clampInt(qs.q, 82, 30, 95);
    const fit = (qs.fit || "cover").toLowerCase();

    let fetchUrl = target.toString();
    if ((w || h) && (process.env.IMG_RESIZE_MODE || "").toLowerCase() === "weserv") {
      // images.weserv.nl supports caching + resizing.
      const inner = encodeURIComponent(fetchUrl.replace(/^https?:\/\//, ""));
      const params = [];
      params.push(`url=${inner}`);
      if (w) params.push(`w=${w}`);
      if (h) params.push(`h=${h}`);
      params.push(`fit=${encodeURIComponent(fit)}`);
      params.push(`q=${q}`);
      fetchUrl = `https://images.weserv.nl/?${params.join("&")}`;
    }

    const res = await fetch(fetchUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Wissens-Bank Image Cache/1.0",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    // Fallback to placeholder on upstream errors
    if (!res.ok) {
      return {
        statusCode: 302,
        headers: { Location: "/assets/placeholder.svg", "Cache-Control": "public, max-age=60, s-maxage=600" },
        body: "",
      };
    }

    const ct = res.headers.get("content-type") || "application/octet-stream";
    if (!ct.startsWith("image/")) {
      return {
        statusCode: 302,
        headers: { Location: "/assets/placeholder.svg", "Cache-Control": "public, max-age=60, s-maxage=600" },
        body: "",
      };
    }

    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);

    // CDN/Edge caching: long TTL + SWR.
    // (Netlify will cache per unique function URL incl. query params)
    const headers = {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "X-Img-Cache": "edge",
    };

    const etag = res.headers.get("etag");
    if (etag) headers["ETag"] = etag;

    return {
      statusCode: 200,
      headers,
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return bad({ error: err.message || "Internal error" }, 500);
  }
};
