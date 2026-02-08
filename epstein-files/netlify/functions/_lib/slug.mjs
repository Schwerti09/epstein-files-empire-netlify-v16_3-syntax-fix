export function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "item";
}
export function uniqueSlug(base, suffix) {
  const s = suffix ? `-${suffix}` : "";
  return `${base}${s}`.slice(0, 90);
}
