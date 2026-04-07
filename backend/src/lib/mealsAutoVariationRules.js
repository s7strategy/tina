const { categoriesForRecipe } = require('./mealsAutoVariationMeta')

/** Prato que já junta carboidrato + proteína (categoria principal + papéis extra). */
function recipeSpansCarbAndProtein(meta) {
  if (!meta) return false
  if (meta.mealComboRules?.carbIncludesProtein === true) return true
  const cats = categoriesForRecipe({
    recipe_category: meta.recipe_category,
    meal_roles: meta.meal_roles,
  })
  return cats.includes('protein') && cats.includes('carb')
}

/**
 * Heurísticas simples (sem IA) para não empilhar tipos redundantes no modo automático.
 * Ajustáveis com o tempo (keywords, tags, ou campos nas receitas).
 */

const SAUCY_PROTEIN_RE =
  /strogonof|stroganoff|cream|nata\b|creme de leite|molho branco|bechamel|bec?hamel|quatro queijos|carbonara|fricass|gratin|branco com cogumelo|molho.*queijo/i

/** Proteína “seca” / churrasco / forno — combina bem com farofa como acompanhamento extra. */
const ASSADA_PROTEIN_RE =
  /\bassad[oa]s?\b|\bgrelhad[oa]s?\b|\bchurras|\bforno\b|\bna brasa\b|\bespet(o|inh)|\bcupim\b|\bpicanha\b|\blombo\b|\bac[eé]m\b|\bpernil\b|\bmaminha\b|\bcontrafil[eé]\b|\bcostel\w*\b|\blaç\w+\b/i

function parseTags(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((x) => String(x).toLowerCase()).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p.map((x) => String(x).toLowerCase()).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

function isSaucyProtein(meta) {
  if (meta?.mealComboRules?.treatAsSaucyProtein === true) return true
  if (!meta?.name) return false
  const name = String(meta.name)
  const tags = parseTags(meta.tags)
  const blob = [name, ...tags].join(' ').toLowerCase()
  return SAUCY_PROTEIN_RE.test(blob)
}

function isAssadaProtein(meta) {
  if (meta?.mealComboRules?.treatAsAssadaProtein === true) return true
  if (meta?.mealComboRules?.treatAsSaucyProtein === true) return false
  if (!meta?.name) return false
  if (isSaucyProtein(meta)) return false
  const name = String(meta.name)
  const tags = parseTags(meta.tags)
  const blob = [name, ...tags].join(' ')
  return ASSADA_PROTEIN_RE.test(blob)
}

/** @deprecated use recipeSpansCarbAndProtein — nome antigo quando o slot de carb vinha primeiro. */
function carbCoversProtein(carbMeta) {
  return recipeSpansCarbAndProtein(carbMeta)
}

/**
 * @param {string} slotCategory — id do slot a preencher (ex.: leguminosas)
 * @param {Record<string, object>} pickedMeta — categoria → { name, recipe_category, meal_roles, tags }
 */
function shouldSkipSlot(slotCategory, pickedMeta) {
  if (slotCategory === 'protein' && recipeSpansCarbAndProtein(pickedMeta.carb)) return true
  if (slotCategory === 'carb' && recipeSpansCarbAndProtein(pickedMeta.protein)) return true
  if (slotCategory === 'leguminosas' && pickedMeta.protein && isSaucyProtein(pickedMeta.protein)) return true
  return false
}

/** Ordem de escolha: proteína antes de carb — assim “prato único” tipo bolonhesa escolhe-se na proteína e omite o carb. */
const SLOT_ORDER = [
  'protein',
  'carb',
  'farofa',
  'leguminosas',
  'legumes',
  'salada',
  'bebida',
  'lanche',
  'sopa',
  'molhos',
  'doces',
  'outro',
]

function sortRequiredForAutoRules(required) {
  return [...required].sort((a, b) => {
    const ia = SLOT_ORDER.indexOf(a)
    const ib = SLOT_ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

module.exports = {
  shouldSkipSlot,
  sortRequiredForAutoRules,
  isSaucyProtein,
  isAssadaProtein,
  carbCoversProtein,
  recipeSpansCarbAndProtein,
}
