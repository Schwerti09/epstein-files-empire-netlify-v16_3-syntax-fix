import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = [
  ...walk("netlify/functions"),
  ...walk("site"),
].filter(f => f.endsWith(".mjs") || f.endsWith(".html") || f.endsWith(".css") || f.endsWith(".js"));

let issues = 0;
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  if (txt.includes("TODO-REPLACE-ME")) {
    console.warn("⚠️ Placeholder found:", f);
    issues++;
  }
}
if (issues) process.exit(2);
console.log("✅ Lint ok");
