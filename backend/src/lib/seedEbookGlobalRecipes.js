const fs = require('fs')
const path = require('path')
const { normalizeTagsArray } = require('./recipeTags')
const { normalizeEbookRecipeForSeed } = require('./ebookRecipeNormalize')

function slugifyBase(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

/**
 * Lê `backend/data/receitas_tina_completo.json` (fallback: `receitas_ebook1.json`) e
 * substitui todas as linhas `glob-ebook-*` em `global_recipes` — não faz merge parcial.
 * Desativar com `SEED_EBOOK_RECIPES=0`.
 */
function resolveEbookDataPath() {
  const dir = path.join(__dirname, '../../data')
  const preferred = path.join(dir, 'receitas_tina_completo.json')
  const legacy = path.join(dir, 'receitas_ebook1.json')
  if (fs.existsSync(preferred)) return preferred
  if (fs.existsSync(legacy)) return legacy
  return preferred
}

async function seedEbookGlobalRecipesFromFile(query) {
  if (process.env.SEED_EBOOK_RECIPES === '0') return

  const dataPath = resolveEbookDataPath()
  if (!fs.existsSync(dataPath)) {
    return
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  } catch (e) {
    console.error('seedEbookGlobalRecipes: JSON inválido em', dataPath, e.message)
    return
  }

  const receitas = data && Array.isArray(data.receitas) ? data.receitas : []
  if (receitas.length === 0) return

  await query(`DELETE FROM global_recipes WHERE id LIKE 'glob-ebook-%'`)

  const now = new Date().toISOString()
  const used = new Set()

  for (let i = 0; i < receitas.length; i++) {
    const r = receitas[i]
    const name = String(r.nome || '').trim()
    if (!name) continue

    let base = slugifyBase(name) || `receita-${i}`
    let id = `glob-ebook-${base}`
    let n = 0
    while (used.has(id)) {
      n += 1
      id = `glob-ebook-${base}-${n}`
    }
    used.add(id)

    const ingredients = Array.isArray(r.ingredientes) ? r.ingredientes : []
    const steps = Array.isArray(r.modo_preparo)
      ? r.modo_preparo.map((s) => String(s || '').trim()).filter(Boolean)
      : []
    const { recipe_category: cat, meal_roles: mealRolesArr, tags } = normalizeEbookRecipeForSeed({
      nome: name,
      categoria: r.categoria,
      tags: r.tags,
    })

    await query(
      `
        INSERT INTO global_recipes (id, name, recipe_category, ingredients, steps, tags, meal_roles, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
      `,
      [
        id,
        name,
        cat,
        JSON.stringify(ingredients),
        JSON.stringify(steps),
        JSON.stringify(tags),
        JSON.stringify(mealRolesArr),
        now,
      ],
    )
  }
}

module.exports = { seedEbookGlobalRecipesFromFile }
