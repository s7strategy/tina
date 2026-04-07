/**
 * Formatação de quantidades (referência da receita vs. quantidade a cozinhar para a família).
 * Usado em RecipeForm e RecipeDetailModal.
 */

export const FRAC_PAIRS = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
]

export function roundQty(n) {
  if (!Number.isFinite(n)) return ''
  const r = Math.round(n * 1000) / 1000
  if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r))
  const s = String(r)
  if (!s.includes('.')) return s
  return s.replace(/\.?0+$/, '').replace(/\.$/, '')
}

export function formatMixedPositive(v, tol = 0.07) {
  if (!Number.isFinite(v) || v < 0) return null
  let whole = Math.floor(v + 1e-9)
  let frac = v - whole
  if (frac > 0.999) {
    whole += 1
    frac = 0
  }
  if (frac < 0.001) return String(whole)
  let bestSym = null
  let bestErr = 1
  for (const [val, sym] of FRAC_PAIRS) {
    const e = Math.abs(frac - val)
    if (e < bestErr) {
      bestErr = e
      bestSym = sym
    }
  }
  if (bestErr > tol) return null
  if (whole === 0) return bestSym
  return `${whole}${bestSym}`
}

export function formatSpoonsNatural(v, isSoup) {
  const one = isSoup ? 'colher de sopa' : 'colher de chá'
  const many = isSoup ? 'colheres de sopa' : 'colheres de chá'
  const tol = 0.08
  let whole = Math.floor(v + 1e-9)
  let frac = v - whole
  if (frac > 0.999) {
    whole += 1
    frac = 0
  }

  const fracKind = () => {
    if (frac < 0.001) return null
    if (Math.abs(frac - 0.5) < tol) return 'h'
    if (Math.abs(frac - 1 / 3) < tol) return 't1'
    if (Math.abs(frac - 2 / 3) < tol) return 't2'
    if (Math.abs(frac - 0.25) < tol) return 'q1'
    if (Math.abs(frac - 0.75) < tol) return 'q3'
    return null
  }
  const fk = fracKind()

  if (whole === 0 && fk) {
    if (fk === 'h') return `Metade de uma ${one}`
    if (fk === 't1') return `Divide em 3 e usa só uma parte (${one})`
    if (fk === 't2') return `Divide em 3 e usa só duas partes (${one})`
    if (fk === 'q1') return `Divide em 4 e usa só uma parte (${one})`
    if (fk === 'q3') return `Divide em 4 e usa só três partes (${one})`
  }
  if (whole > 0 && frac < 0.001) {
    return `${whole} ${whole === 1 ? one : many}`
  }
  if (whole > 0 && fk) {
    if (fk === 'h') return `${whole} ${whole === 1 ? one : many} e metade`
    const rest =
      fk === 't1'
        ? 'mais: divide em 3 e usa só uma parte'
        : fk === 't2'
          ? 'mais: divide em 3 e usa só duas partes'
          : fk === 'q1'
            ? 'mais: divide em 4 e usa só uma parte'
            : 'mais: divide em 4 e usa só três partes'
    return `${whole} ${whole === 1 ? one : many} e ${rest}`
  }
  return null
}

export function tryParseQty(q) {
  if (q == null || String(q).trim() === '') return null
  const t = String(q).replace(',', '.').trim()
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/** kg, g, ml, l, cs, cc ou other (unidade, maço, pitada, etc.) */
export function detectUnitKind(unitRaw) {
  const u = String(unitRaw || '').trim().toLowerCase()
  if (u === '') return 'none'
  if (u === 'kg') return 'kg'
  if (u === 'g') return 'g'
  if (u === 'ml') return 'ml'
  if (u === 'l' || u === 'lt') return 'l'
  if (u === 'cs' || u.includes('colher_sopa') || u.includes('colheres_sopa') || (u.includes('sopa') && u.includes('colher')))
    return 'cs'
  if (u === 'cc' || u.includes('colher_cha') || u.includes('colher_chá') || u.includes('colheres_cha'))
    return 'cc'
  if (u === 'colher' || u === 'colheres') return 'cs'
  if (u === 'un' || u === 'unidade' || u === 'unidades') return 'other'
  return 'other'
}

/** Referência “na receita para 1 kg de prato” */
export function formatRecipeLineAmount(value, unitRaw) {
  const v = Number(value)
  if (!Number.isFinite(v) || v < 0) return '—'
  const kind = detectUnitKind(unitRaw)
  if (kind === 'none') return null
  const uLabel = String(unitRaw || '').trim()
  const dec = (n) => `${roundQty(n).replace('.', ',')}`

  if (kind === 'g') {
    if (v >= 1000) {
      const kg = v / 1000
      const m = formatMixedPositive(kg)
      return m != null ? `${m} kg` : `${dec(kg)} kg`
    }
    const m = formatMixedPositive(v)
    return m != null ? `${m} g` : `${dec(v)} g`
  }
  if (kind === 'kg') {
    const m = formatMixedPositive(v)
    return m != null ? `${m} kg` : `${dec(v)} kg`
  }
  if (kind === 'ml') {
    if (v >= 1000) {
      const L = v / 1000
      const m = formatMixedPositive(L)
      return m != null ? `${m} L` : `${dec(L)} L`
    }
    const m = formatMixedPositive(v)
    return m != null ? `${m} ml` : `${dec(v)} ml`
  }
  if (kind === 'l') {
    const m = formatMixedPositive(v)
    return m != null ? `${m} L` : `${dec(v)} L`
  }
  if (kind === 'cs') {
    const m = formatMixedPositive(v)
    const lbl = 'col. sopa'
    return m != null ? `${m} ${lbl}` : `${dec(v)} ${lbl}`
  }
  if (kind === 'cc') {
    const m = formatMixedPositive(v)
    const lbl = 'col. chá'
    return m != null ? `${m} ${lbl}` : `${dec(v)} ${lbl}`
  }
  const m = formatMixedPositive(v)
  if (m != null && uLabel) return `${m} ${uLabel}`
  if (m != null) return m
  return uLabel ? `${dec(v)} ${uLabel}` : dec(v)
}

/** Quantidade já escalada para a família (mesma escala que q * factor). */
export function formatFamilyCookAmount(value, unitRaw) {
  const v = Number(value)
  if (!Number.isFinite(v) || v < 0) return '—'
  const kind = detectUnitKind(unitRaw)
  if (kind === 'none') return null
  const uLabel = String(unitRaw || '').trim()
  const dec = (n) => `${roundQty(n).replace('.', ',')}`

  if (kind === 'kg') {
    const g = Math.round(v * 1000)
    return `${g} g`
  }
  if (kind === 'g') {
    if (v >= 1000) {
      const kg = v / 1000
      const m = formatMixedPositive(kg)
      return m != null ? `${m} kg` : `${dec(kg)} kg`
    }
    const gRounded = Math.round(v)
    if (Math.abs(v - gRounded) < 0.001) return `${gRounded} g`
    const m = formatMixedPositive(v)
    return m != null ? `${m} g` : `${dec(v)} g`
  }
  if (kind === 'ml') {
    if (v >= 1000) {
      const L = v / 1000
      const m = formatMixedPositive(L)
      return m != null ? `${m} L` : `${dec(L)} L`
    }
    const m = formatMixedPositive(v)
    return m != null ? `${m} ml` : `${dec(v)} ml`
  }
  if (kind === 'l') {
    const m = formatMixedPositive(v)
    return m != null ? `${m} L` : `${dec(v)} L`
  }
  if (kind === 'cs') {
    const nat = formatSpoonsNatural(v, true)
    return nat != null ? nat : `${dec(v)} col. sopa`
  }
  if (kind === 'cc') {
    const nat = formatSpoonsNatural(v, false)
    return nat != null ? nat : `${dec(v)} col. chá`
  }
  const m = formatMixedPositive(v)
  if (m != null && uLabel) return `${m} ${uLabel}`
  if (m != null) return m
  return uLabel ? `${dec(v)} ${uLabel}` : dec(v)
}

export function formatFamilyTotalPlateGrams(totalKg) {
  if (!Number.isFinite(totalKg) || totalKg <= 0) return '—'
  const g = Math.round(totalKg * 1000)
  return `${g} g`
}

export { mealCategoryUsesFixedRecipeYield } from '../../../lib/mealCategories.js'
