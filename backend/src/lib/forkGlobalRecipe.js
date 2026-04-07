const { query, one, uid } = require('./db')
const { normalizeMealCategory } = require('./mealCategories')
const { mapGlobalIngredient } = require('./mealsGlobalFork')
const { normalizeTagsArray } = require('./recipeTags')
const { parseJsonArr } = require('./mealsAutoVariationMeta')

/**
 * Copia uma receita global para o utilizador (mesma lógica que POST /meals/recipes/fork-global).
 * Usa `executor` (pool ou client) para poder correr dentro de transação.
 * @returns {Promise<string|null>} id da receita criada ou null se global inexistente
 */
async function forkGlobalRecipeToUser(ownerUserId, globalRecipeId, executor) {
  const g = await one(`SELECT * FROM global_recipes WHERE id = $1`, [globalRecipeId], executor)
  if (!g) return null

  const id = uid('rec')
  const now = new Date().toISOString()
  const rcat = normalizeMealCategory(g.recipe_category)
  const ingRaw = Array.isArray(g.ingredients) ? g.ingredients : []
  const stepsRaw = Array.isArray(g.steps) ? g.steps : []
  const forkTags = JSON.stringify(normalizeTagsArray(g.tags))
  const forkRoles = JSON.stringify(parseJsonArr(g.meal_roles ?? g.mealRoles))

  await query(
    `
      INSERT INTO recipes (
        id, owner_user_id, name, mode, image_url, placeholder_key, base_servings,
        grams_per_portion, ml_per_portion, spoon_soup_per_portion, spoon_tea_per_portion,
        recipe_category, servings_source, recipe_origin, global_source_id, tags, meal_roles,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, 'advanced', NULL, NULL, 1, NULL, NULL, NULL, NULL, $4, 'manual', 'global_fork', $5, $6::jsonb, $7::jsonb, $8, $9)
    `,
    [id, ownerUserId, String(g.name).trim(), rcat, globalRecipeId, forkTags, forkRoles, now, now],
    executor,
  )
  let sort = 0
  for (const raw of ingRaw) {
    const row = mapGlobalIngredient(raw)
    if (!row) continue
    await query(
      `INSERT INTO recipe_ingredients (id, recipe_id, sort_order, name, quantity, unit) VALUES ($1, $2, $3, $4, $5, $6)`,
      [uid('ring'), id, sort++, row.name, row.quantity, row.unit || null],
      executor,
    )
  }
  let st = 0
  for (const line of stepsRaw) {
    const body = String(line || '').trim()
    if (!body) continue
    await query(
      `INSERT INTO recipe_steps (id, recipe_id, sort_order, body) VALUES ($1, $2, $3, $4)`,
      [uid('rstep'), id, st++, body],
      executor,
    )
  }

  return id
}

module.exports = { forkGlobalRecipeToUser }
