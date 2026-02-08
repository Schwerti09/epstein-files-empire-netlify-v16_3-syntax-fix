export function escapeHtml(s="") {
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

export function page({ title, description="", urlPath="/", ogImage="", bodyHtml="", canonicalBase="" }) {
  const siteUrl = canonicalBase || process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const canonical = siteUrl ? new URL(urlPath, siteUrl).toString() : urlPath;

  const head = `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="/styles.css">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}">` : ""}
`.trim();

  return `<!doctype html>
<html lang="de">
<head>
${head}
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function html(statusCode, htmlBody, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...extraHeaders,
    },
    body: htmlBody,
  };
}
