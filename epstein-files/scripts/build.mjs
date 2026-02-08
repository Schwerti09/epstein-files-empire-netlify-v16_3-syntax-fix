import fs from "node:fs";
import path from "node:path";

const mustExist = [
  "site/index.html",
  "site/styles.css",
  "site/js/render.js",
  "netlify/functions/documents.mjs",
  "netlify/functions/file.mjs",
  "netlify/functions/article-ssr.mjs",
  "netlify/functions/og.mjs",
  "netlify/functions/sitemap.mjs",
  "netlify/functions/img.mjs",
  "netlify/functions/related.mjs",
  "netlify/functions/most-read.mjs",
  "database/schema.sql",
  "netlify/functions/trending.mjs",
  "netlify/functions/topics.mjs",
  "netlify/functions/social-proof.mjs",
  "netlify/functions/portal.mjs",
  "netlify/functions/me.mjs",
  "netlify/functions/subscribe.mjs",
  "netlify/functions/confirm.mjs",
  "netlify/functions/unsubscribe.mjs",
  "netlify/functions/briefing-daily.mjs",
  "site/pricing.html",
  "site/newsletter.html",
  "site/account.html"
];

let ok = true;
for (const file of mustExist) {
  if (!fs.existsSync(path.resolve(file))) {
    console.error("Missing file:", file);
    ok = false;
  }
}
if (!ok) process.exit(1);

console.log("✅ Build ok (static publish = /site)");
