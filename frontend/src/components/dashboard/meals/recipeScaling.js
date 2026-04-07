/** Partilhado entre RecipeForm e RecipeDetailModal — alinhado ao backend. */
const GRAMS_PER_SOUP_SPOON = 50
const GRAMS_PER_TEA_SPOON = 4

/**
 * Folga nas quantidades a cozinhar / lista de compras (comida sobrar um pouco na mesa).
 * Não aplicado a doces/bolos (receita inteira fixa).
 * Manter igual a `FAMILY_FOOD_MARGIN` em `backend/src/lib/mealsShoppingGenerate.js`.
 */
export const FAMILY_INGREDIENT_SCALE_MARGIN = 1.08

export function normalizeIngredientUnit(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
  if (!t) return ''
  if (['kg', 'g', 'ml', 'cs', 'cc'].includes(t)) return t
  if (t.includes('sopa') || t === 'col.s' || t === 'cols') return 'cs'
  if (t.includes('chá') || t.includes('cha') || t === 'col.c') return 'cc'
  if (t === 'l' || t === 'lt' || t === 'litro' || t === 'litros') return 'ml'
  if (t === 'grama' || t === 'gramas') return 'g'
  if (t === 'quilo' || t === 'kilos') return 'kg'
  if (t === 'colher_sopa' || t === 'colheres_sopa' || t === 'colsopa') return 'cs'
  if (t === 'colher_cha' || t === 'colher_chá' || t === 'colheres_cha') return 'cc'
  if (t === 'colher' || t === 'colheres') return 'cs'
  if (t === 'un' || t === 'unidade' || t === 'unidades') return 'un'
  return ''
}

export function kgPerPerson(servings, amountUnit) {
  const s = Number(String(servings).replace(',', '.'))
  if (!Number.isFinite(s) || s <= 0) return 0
  let u = String(amountUnit || 'kg').toLowerCase()
  if (u === 'portion') u = 'kg'
  if (u === 'kg' || u === '') return s
  if (u === 'g') return s / 1000
  if (u === 'ml') return s / 1000
  if (u === 'cs') return (s * GRAMS_PER_SOUP_SPOON) / 1000
  if (u === 'cc') return (s * GRAMS_PER_TEA_SPOON) / 1000
  return 0
}

export function tryParseQty(q) {
  if (q == null || String(q).trim() === '') return null
  const t = String(q).replace(',', '.').trim()
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/** Normaliza ingrediente do catálogo global (nome/quantidade/unidade) para {name, quantity, unit}. */
export function normalizeIngredientRow(ing) {
  if (!ing || typeof ing !== 'object') return null
  if (ing.name != null) {
    return {
      name: String(ing.name),
      quantity: ing.quantity != null ? String(ing.quantity) : '',
      unit: ing.unit != null ? String(ing.unit) : '',
    }
  }
  if (ing.nome != null) {
    return {
      name: String(ing.nome),
      quantity: ing.quantidade != null ? String(ing.quantidade) : '',
      unit: ing.unidade != null ? String(ing.unidade) : '',
    }
  }
  return null
}
