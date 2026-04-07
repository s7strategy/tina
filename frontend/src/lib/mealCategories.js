/** Alinhado ao backend `mealCategories.js` */
export const MEAL_CATEGORIES = [
  { id: 'carb', label: 'Carboidrato' },
  { id: 'protein', label: 'Proteína' },
  { id: 'leguminosas', label: 'Leguminosas' },
  { id: 'farofa', label: 'Farofa' },
  { id: 'legumes', label: 'Legumes' },
  { id: 'salada', label: 'Salada' },
  { id: 'lanche', label: 'Lanche' },
  { id: 'bebida', label: 'Bebida' },
  { id: 'sopa', label: 'Sopa' },
  { id: 'molhos', label: 'Molhos' },
  { id: 'doces', label: 'Doces e Sobremesas' },
  { id: 'outro', label: 'Outro' },
]

const ID_SET = new Set(MEAL_CATEGORIES.map((c) => c.id))

/** Aceita id (carb), label PT (“Proteína”) ou slug sem acento (“proteina”). */
const LABEL_TO_ID = (() => {
  const m = new Map()
  for (const c of MEAL_CATEGORIES) {
    m.set(c.id, c.id)
    m.set(c.label.trim().toLowerCase(), c.id)
    m.set(
      c.label
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase(),
      c.id,
    )
  }
  m.set('proteina', 'protein')
  m.set('carboidrato', 'carb')
  m.set('carbo', 'carb')
  m.set('doces e sobremesas', 'doces')
  m.set('bebidas', 'bebida')
  m.set('suco', 'bebida')
  m.set('sucos', 'bebida')
  m.set('molho', 'molhos')
  m.set('leguminosa', 'leguminosas')
  return m
})()

/**
 * Receitas feitas como lote inteiro (não escalar por “quanto cada um come”):
 * doces/bolos, bebidas e sucos, molhos (um pote para a família).
 * Manter alinhado com o backend `wholeRecipeYieldCategoryIds`.
 */
export const MEAL_CATEGORY_WHOLE_RECIPE_IDS = ['doces', 'bebida', 'molhos']

export function mealCategoryUsesFixedRecipeYield(mealCategory) {
  const id = normalizeMealCategory(mealCategory)
  return id != null && MEAL_CATEGORY_WHOLE_RECIPE_IDS.includes(id)
}

/** Normaliza categoria vinda da API, do JSON ou do formulário para o id estável. */
export function normalizeMealCategory(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim().toLowerCase()
  if (ID_SET.has(s)) return s
  const stripped = s.normalize('NFD').replace(/\p{M}/gu, '')
  return LABEL_TO_ID.get(s) || LABEL_TO_ID.get(stripped) || null
}

export function mealCategoryLabel(id) {
  return MEAL_CATEGORIES.find((c) => c.id === id)?.label || id || ''
}

/** Rótulo compacto para células do calendário / lista semana. */
export function mealCategoryShortLabel(raw) {
  const id = normalizeMealCategory(raw)
  if (!id) return ''
  const short = {
    carb: 'Carb.',
    protein: 'Prot.',
    leguminosas: 'Legum.',
    farofa: 'Farofa',
    legumes: 'Leg.',
    salada: 'Sal.',
    lanche: 'Lanche',
    bebida: 'Beb.',
    sopa: 'Sopa',
    molhos: 'Molho',
    doces: 'Doce',
    outro: 'Outro',
  }
  return short[id] || mealCategoryLabel(id)
}

/** Receitas Tina sem categoria ou marcadas como “geral”: aparecem em todas as secções do picker. */
export function isGlobalWildcardMealCategory(raw) {
  if (raw == null || raw === '') return true
  const s = String(raw).trim().toLowerCase()
  if (!s) return true
  return s === 'geral' || s === 'general' || s === 'todos' || s === 'todas'
}

/** Categorias em que a receita aparece no picker (principal + papéis extra, p.ex. proteína + carb). */
export function categoriesForPickerRecipe(r) {
  const cats = new Set()
  const main = normalizeMealCategory(r.mealCategory)
  if (main) cats.add(main)
  const roles = Array.isArray(r.mealRoles) ? r.mealRoles : []
  for (const role of roles) {
    const id = normalizeMealCategory(role)
    if (id) cats.add(id)
  }
  return cats
}

function pushPickerEntry(map, cat, entry) {
  if (!map.has(cat)) return
  const arr = map.get(cat)
  const key = `${entry.isGlobal ? 'g' : 'u'}:${entry.id}`
  if (arr.some((x) => `${x.isGlobal ? 'g' : 'u'}:${x.id}` === key)) return
  arr.push(entry)
}

/**
 * Agrupa receitas tuas + Tina por categoria para selects (cardápio, combinações).
 * Tina “geral” / sem categoria entra em todas as categorias; desconhecida vai para “outro”.
 */
export function recipesByCategoryForPicker(userRecipes, globalRecipes, nameFilter = '') {
  const q = nameFilter.trim().toLowerCase()
  function matchName(r) {
    return !q || String(r.name || '').toLowerCase().includes(q)
  }
  const map = new Map(MEAL_CATEGORIES.map((c) => [c.id, []]))
  for (const r of userRecipes) {
    if (!matchName(r)) continue
    const catSet = categoriesForPickerRecipe(r)
    if (catSet.size === 0) continue
    const entry = { id: r.id, name: r.name, isGlobal: false }
    for (const c of catSet) {
      pushPickerEntry(map, c, entry)
    }
  }
  for (const r of globalRecipes) {
    if (!matchName(r)) continue
    const wild = isGlobalWildcardMealCategory(r.mealCategory)
    const entry = { id: r.id, name: r.name, isGlobal: true }
    if (wild) {
      for (const c of MEAL_CATEGORIES) {
        pushPickerEntry(map, c.id, entry)
      }
      continue
    }
    const catSet = categoriesForPickerRecipe(r)
    if (catSet.size === 0) {
      if (map.has('outro')) pushPickerEntry(map, 'outro', entry)
      continue
    }
    for (const c of catSet) {
      pushPickerEntry(map, c, entry)
    }
  }
  for (const c of MEAL_CATEGORIES) {
    const arr = map.get(c.id)
    arr.sort((a, b) => {
      if (a.isGlobal !== b.isGlobal) return a.isGlobal ? 1 : -1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }
  return map
}

/** Valor do `<option>`: fork da Tina quando começa com `g:`. */
export function pickRecipePickerValue(r) {
  return r.isGlobal ? `g:${r.id}` : `u:${r.id}`
}
