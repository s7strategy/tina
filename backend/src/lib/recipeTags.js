/** Slugs normalizados; labels no frontend (recipeTags.js). */
function normalizeTagSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function normalizeTagsArray(raw) {
  if (raw == null) return []
  const arr = Array.isArray(raw) ? raw : []
  const out = []
  const seen = new Set()
  for (const t of arr) {
    const s = normalizeTagSlug(t)
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= 24) break
  }
  return out
}

/** Ids sugeridos no filtro / formulário (labels no frontend). */
const DEFAULT_TAG_IDS = [
  'sem-gluten',
  'sem-lactose',
  'sem-acucar',
  'saudavel',
  'vegano',
  'vegetariano',
  'rapida',
  'com-carb',
]

module.exports = { normalizeTagSlug, normalizeTagsArray, DEFAULT_TAG_IDS }
