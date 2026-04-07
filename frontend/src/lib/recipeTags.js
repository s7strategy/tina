/** Presets sugeridos; JSON pode trazer estes ids ou outros (viram slug). */
export const RECIPE_TAG_PRESETS = [
  { id: 'sem-gluten', label: 'Sem glúten' },
  { id: 'sem-lactose', label: 'Sem lactose' },
  { id: 'sem-acucar', label: 'Sem açúcar' },
  { id: 'saudavel', label: 'Saudável' },
  { id: 'vegano', label: 'Vegano' },
  { id: 'vegetariano', label: 'Vegetariano' },
  { id: 'rapida', label: 'Rápida' },
  { id: 'com-carb', label: 'Inclui carboidrato' },
]

const presetIds = new Set(RECIPE_TAG_PRESETS.map((p) => p.id))

export function labelForRecipeTag(id) {
  const s = String(id || '').trim()
  if (!s) return ''
  const p = RECIPE_TAG_PRESETS.find((x) => x.id === s)
  if (p) return p.label
  return s.replace(/-/g, ' ')
}

export function normalizeTagSlug(s) {
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

/** Lista única para chips a partir de strings soltas ou JSON. */
export function normalizeTagsList(raw) {
  if (raw == null) return []
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
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

export function isPresetTag(id) {
  return presetIds.has(String(id || '').trim())
}
