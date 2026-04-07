function parseJsonArr(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

/** Receita entra no conjunto desta categoria (principal + meal_roles). */
function categoriesForRecipe(r) {
  const cats = new Set()
  const main = r.recipe_category || r.recipeCategory
  if (main) cats.add(String(main))
  const roles = parseJsonArr(r.meal_roles ?? r.mealRoles)
  for (const x of roles) {
    if (x) cats.add(String(x))
  }
  return [...cats]
}

module.exports = { parseJsonArr, categoriesForRecipe }
