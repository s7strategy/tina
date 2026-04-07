/**
 * One-off: para um utilizador (email), copia uma receita Strogonoff/Stroganoff para
 * global_recipes como glob-demo-strogonoff e apaga TODAS as receitas desse utilizador
 * (ingredientes/passos em cascade; menu_slots ficam com recipe_id null).
 *
 * Uso: node scripts/once-purge-user-recipes-promote-strogonoff.js email@exemplo.com
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const { query, one, many } = require('../src/lib/db')
const { normalizeTagsArray } = require('../src/lib/recipeTags')

function mealRolesToJson(raw) {
  if (raw == null) return '[]'
  if (Array.isArray(raw)) return JSON.stringify(raw)
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return JSON.stringify(Array.isArray(p) ? p : [])
    } catch {
      return '[]'
    }
  }
  return '[]'
}

async function main() {
  const email = (process.argv[2] || '').trim()
  if (!email) {
    console.error('Usage: node once-purge-user-recipes-promote-strogonoff.js <email>')
    process.exit(1)
  }

  const u = await one(`SELECT id, email FROM users WHERE lower(trim(email)) = lower(trim($1))`, [email])
  if (!u) {
    console.log('[once-purge] User not found (skip marker):', email)
    process.exit(2)
  }
  const userId = u.id
  console.log('[once-purge] User', u.email, userId)

  const stro = await one(
    `
      SELECT * FROM recipes WHERE owner_user_id = $1 AND (
        name ILIKE '%strogonoff%' OR name ILIKE '%stroganoff%'
      )
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [userId],
  )

  if (stro) {
    const ingredients = await many(
      `
        SELECT name, quantity, unit FROM recipe_ingredients
        WHERE recipe_id = $1 ORDER BY sort_order ASC, id ASC
      `,
      [stro.id],
    )
    const ingArr = ingredients.map((r) => {
      let q = r.quantity
      if (q != null && q !== '') {
        const n = Number(String(q).replace(',', '.'))
        q = Number.isFinite(n) ? n : String(q)
      } else {
        q = 0
      }
      return {
        nome: String(r.name || '').trim(),
        quantidade: q,
        unidade: (r.unit && String(r.unit).trim()) || 'un',
      }
    })

    const stepsRows = await many(
      `SELECT body FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order ASC, id ASC`,
      [stro.id],
    )
    const stepsArr = stepsRows.map((r) => String(r.body || '').trim()).filter(Boolean)

    const tagsJson = JSON.stringify(normalizeTagsArray(stro.tags))
    const mealRolesJson = mealRolesToJson(stro.meal_roles)
    const cat = stro.recipe_category || 'protein'
    const now = new Date().toISOString()

    await query(
      `
        INSERT INTO global_recipes (id, name, recipe_category, ingredients, steps, tags, meal_roles, created_at)
        VALUES ('glob-demo-strogonoff', $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          recipe_category = EXCLUDED.recipe_category,
          ingredients = EXCLUDED.ingredients,
          steps = EXCLUDED.steps,
          tags = EXCLUDED.tags,
          meal_roles = EXCLUDED.meal_roles
      `,
      [
        String(stro.name).trim(),
        cat,
        JSON.stringify(ingArr),
        JSON.stringify(stepsArr),
        tagsJson,
        mealRolesJson,
        now,
      ],
    )
    console.log('[once-purge] glob-demo-strogonoff updated from user recipe', stro.id, stro.name)
  } else {
    console.log('[once-purge] No strogonoff-like recipe for user; skipping global update')
  }

  const del = await query(`DELETE FROM recipes WHERE owner_user_id = $1`, [userId])
  console.log('[once-purge] Deleted user recipes, rowCount=', del.rowCount)
  process.exit(0)
}

main().catch((e) => {
  console.error('[once-purge]', e)
  process.exit(1)
})
