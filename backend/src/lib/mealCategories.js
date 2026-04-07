/** Categorias de refeição (receitas + itens de combinação). IDs estáveis na API e BD. */
const MEAL_CATEGORIES = [
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

/** Aceita id (carb), label PT ("Proteína") ou slug sem acento ("proteina"). */
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
  m.set('farofas', 'farofa')
  return m
})()

/** Alinhar com `MEAL_CATEGORY_WHOLE_RECIPE_IDS` no frontend. */
const WHOLE_RECIPE_YIELD_IDS = new Set(['doces', 'bebida', 'molhos'])

function isWholeRecipeYieldCategory(raw) {
  const id = normalizeMealCategory(raw)
  return id != null && WHOLE_RECIPE_YIELD_IDS.has(id)
}

function normalizeMealCategory(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim().toLowerCase()
  if (ID_SET.has(s)) return s
  const stripped = s.normalize('NFD').replace(/\p{M}/gu, '')
  return LABEL_TO_ID.get(s) || LABEL_TO_ID.get(stripped) || null
}

function labelForCategory(id) {
  return MEAL_CATEGORIES.find((c) => c.id === id)?.label || id
}

module.exports = {
  MEAL_CATEGORIES,
  normalizeMealCategory,
  labelForCategory,
  isWholeRecipeYieldCategory,
  WHOLE_RECIPE_YIELD_IDS,
}
