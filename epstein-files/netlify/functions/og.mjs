import { ok, isOptions } from "./_lib/http.mjs";

function clamp(s, n){ return String(s||"").trim().slice(0,n); }
function esc(s=""){ return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

export default async (event) => {
  if (isOptions(event)) return ok({ ok: true });

  const qs = event.queryStringParameters || {};
  const name = clamp(qs.name || qs.title || "EPSTEIN FILES", 80);
  const subtitle = clamp(qs.subtitle || "RESEARCH INDEX • PUBLIC SOURCES", 70);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a4a82"/>
      <stop offset="1" stop-color="#b40000"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.22"/>
    </filter>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M0 60 L60 0" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
      <path d="M-30 60 L60 -30" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>

  <g filter="url(#shadow)">
    <rect x="90" y="120" width="1020" height="410" rx="26" fill="#f7f5f2" opacity="0.97"/>
    <rect x="90" y="120" width="520" height="90" rx="26" fill="#fff" opacity="0.95"/>
    <rect x="140" y="250" width="920" height="18" rx="9" fill="#c8c2ba"/>
    <rect x="140" y="290" width="860" height="18" rx="9" fill="#c8c2ba"/>
    <rect x="140" y="330" width="900" height="18" rx="9" fill="#c8c2ba"/>
    <rect x="140" y="370" width="760" height="18" rx="9" fill="#c8c2ba"/>
    <rect x="140" y="410" width="520" height="18" rx="9" fill="#c8c2ba"/>
  </g>

  <g transform="translate(830,170) rotate(-12)">
    <rect x="0" y="0" width="290" height="74" rx="10" fill="rgba(180,0,0,0.14)" stroke="rgba(180,0,0,0.65)" stroke-width="5"/>
    <text x="145" y="50" text-anchor="middle" font-size="34" font-weight="900" font-family="Georgia, 'Times New Roman', serif" fill="rgba(180,0,0,0.88)">CONFIDENTIAL</text>
  </g>

  <text x="140" y="190" font-size="20" font-weight="800" font-family="ui-sans-serif, system-ui" fill="#5a5a5a">${esc(subtitle)}</text>
  <text x="140" y="238" font-size="54" font-weight="900" font-family="Georgia, 'Times New Roman', serif" fill="#111">${esc(name)}</text>
  <text x="140" y="520" font-size="18" font-weight="800" font-family="ui-sans-serif, system-ui" fill="#1d2b3a">Premium: Highlights • Smart‑Match • Namen‑Index</text>
</svg>`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
    body: svg,
  };
};
