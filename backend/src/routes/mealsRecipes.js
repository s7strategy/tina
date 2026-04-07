const express = require('express')
const { many, one, query, uid, transaction } = require('../lib/db')
const { recipeUpload } = require('../lib/uploadMulter')
const { safeUnlink } = require('../lib/uploadFiles')
const { MEAL_CATEGORIES, normalizeMealCategory } = require('../lib/mealCategories')
const { forkGlobalRecipeToUser } = require('../lib/forkGlobalRecipe')
const { buildMemberServingsFromFamily } = require('../lib/mealsFamilyPortions')
const { mapGlobalIngredient } = require('../lib/mealsGlobalFork')
const { normalizeTagsArray, normalizeTagSlug, DEFAULT_TAG_IDS } = require('../lib/recipeTags')

const router = express.Router()

/** Vários `mealCategory` ou `mealCategories` separados por vírgula. */
function mealCategoriesFromQuery(req) {
  const raw = req.query.mealCategory ?? req.query.mealCategories
  if (raw == null || raw === '') return []
  const list = Array.isArray(raw) ? raw : String(raw).split(',')
  const out = []
  const seen = new Set()
  for (const t of list) {
    const c = normalizeMealCategory(typeof t === 'string' ? t.trim() : t)
    if (c && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

/** Vários `tag` ou `tags` separados por vírgula. Com vários: receita com pelo menos uma etiqueta escolhida (OR). */
function tagsFromQuery(req) {
  const raw = req.query.tag ?? req.query.tags
  if (raw == null || raw === '') return []
  const list = Array.isArray(raw) ? raw : String(raw).split(',')
  const out = []
  const seen = new Set()
  for (const t of list) {
    const s = normalizeTagSlug(typeof t === 'string' ? t.trim() : t)
    if (s && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

async function memberOwned(ownerUserId, memberId) {
  const m = await one('SELECT id FROM members WHERE id = $1 AND owner_user_id = $2', [memberId, ownerUserId])
  return Boolean(m)
}

function optPositiveNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function normAmountUnit(u) {
  const s = String(u || 'kg').toLowerCase()
  if (s === 'portion') return 'kg'
  if (['kg', 'g', 'ml', 'cs', 'cc'].includes(s)) return s
  return 'kg'
}

const MEAL_CAT_IDS = new Set(MEAL_CATEGORIES.map((c) => c.id))

function normalizeMealRoles(raw) {
  if (raw == null) return []
  const arr = Array.isArray(raw) ? raw : []
  const out = []
  for (const x of arr) {
    const id = normalizeMealCategory(typeof x === 'string' ? x : x?.id ?? x)
    if (id && MEAL_CAT_IDS.has(id) && !out.includes(id)) out.push(id)
  }
  return out
}

/** Regras opcionais para o gerador de pratos automáticos (sem IA). */
function normalizeMealComboRules(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  return {
    treatAsSaucyProtein: Boolean(o.treatAsSaucyProtein),
    carbIncludesProtein: Boolean(o.carbIncludesProtein),
  }
}

async function loadPreparationSteps(recipeId) {
  const rows = await many(
    `SELECT body FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order ASC, id ASC`,
    [recipeId],
  )
  return rows.map((r) => r.body || '')
}

async function savePreparationSteps(client, recipeId, steps) {
  await query(`DELETE FROM recipe_steps WHERE recipe_id = $1`, [recipeId], client)
  if (!Array.isArray(steps)) return
  let sort = 0
  for (const s of steps) {
    const body = String(s || '').trim()
    if (!body) continue
    await query(
      `INSERT INTO recipe_steps (id, recipe_id, sort_order, body) VALUES ($1, $2, $3, $4)`,
      [uid('rstep'), recipeId, sort++, body],
      client,
    )
  }
}

const RECIPE_SELECT = `
  id, name, mode, image_url AS "imageUrl", placeholder_key AS "placeholderKey",
  base_servings AS "baseServings",
  grams_per_portion AS "gramsPerPortion",
  ml_per_portion AS "mlPerPortion",
  spoon_soup_per_portion AS "spoonSoupPerPortion",
  spoon_tea_per_portion AS "spoonTeaPerPortion",
  recipe_category AS "mealCategory",
  servings_source AS "servingsSource",
  recipe_origin AS "recipeOrigin",
  global_source_id AS "globalSourceId",
  tags,
  COALESCE(meal_roles, '[]'::jsonb) AS "mealRoles",
  COALESCE(meal_combo_rules, '{}'::jsonb) AS "mealComboRules",
  created_at AS "createdAt", updated_at AS "updatedAt"
`

async function buildRecipePayload(recipeId, ownerUserId, recipeRow) {
  const ingredients = await many(
    `
      SELECT id, name, quantity, unit, sort_order AS "sortOrder"
      FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order ASC, id ASC
    `,
    [recipeId],
  )
  const preparationSteps = await loadPreparationSteps(recipeId)
  let memberServings
  if (recipeRow.servingsSource === 'family') {
    memberServings = (await buildMemberServingsFromFamily(ownerUserId)) || []
  } else {
    memberServings = await many(
      `
        SELECT rms.id, rms.member_id AS "memberId", rms.servings,
               rms.amount_unit AS "amountUnit", m.name AS "memberName"
        FROM recipe_member_servings rms
        JOIN members m ON m.id = rms.member_id AND m.owner_user_id = $2
        WHERE rms.recipe_id = $1
        ORDER BY m.sort_order ASC
      `,
      [recipeId, ownerUserId],
    )
  }
  return {
    ...recipeRow,
    tags: normalizeTagsArray(recipeRow.tags),
    mealRoles: normalizeMealRoles(recipeRow.mealRoles),
    mealComboRules: normalizeMealComboRules(recipeRow.mealComboRules),
    ingredients,
    memberServings,
    preparationSteps,
  }
}

router.get('/categories', (_req, res) => {
  res.json({ categories: MEAL_CATEGORIES })
})

router.get('/tag-options', async (req, res) => {
  try {
    const userRows = await many(
      `SELECT tags FROM recipes WHERE owner_user_id = $1 AND recipe_origin IS DISTINCT FROM 'global_fork'`,
      [req.user.id],
    )
    const globRows = await many(`SELECT tags FROM global_recipes`)
    const set = new Set(DEFAULT_TAG_IDS)
    for (const r of [...userRows, ...globRows]) {
      for (const t of normalizeTagsArray(r.tags)) {
        set.add(t)
      }
    }
    res.json({ tags: [...set].sort((a, b) => a.localeCompare(b)) })
  } catch (e) {
    console.error(e)
    res.json({ tags: [...DEFAULT_TAG_IDS].sort() })
  }
})

router.get('/catalog', async (req, res) => {
  const cats = mealCategoriesFromQuery(req)
  const tagList = tagsFromQuery(req)
  const q = (req.query.q || '').trim()
  const params = []
  let where = '1=1'
  if (cats.length > 0) {
    params.push(cats)
    where += ` AND recipe_category = ANY($${params.length}::text[])`
  }
  if (tagList.length > 0) {
    params.push(tagList)
    where += ` AND ARRAY(SELECT jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb))) && $${params.length}::text[]`
  }
  if (q) {
    params.push(`%${q}%`)
    where += ` AND name ILIKE $${params.length}`
  }
  const recipes = await many(
    `
      SELECT id, name, recipe_category AS "mealCategory", tags,
        COALESCE(meal_roles, '[]'::jsonb) AS "mealRoles"
      FROM global_recipes WHERE ${where} ORDER BY name ASC
    `,
    params,
  )
  res.json({
    recipes: recipes.map((r) => ({
      ...r,
      tags: normalizeTagsArray(r.tags),
      mealRoles: Array.isArray(r.mealRoles) ? r.mealRoles : [],
    })),
  })
})

router.get('/catalog/:id', async (req, res) => {
  const g = await one(
    `
      SELECT id, name, recipe_category AS "mealCategory", ingredients, steps AS "preparationSteps",
             tags, COALESCE(meal_roles, '[]'::jsonb) AS "mealRoles", created_at AS "createdAt"
      FROM global_recipes WHERE id = $1
    `,
    [req.params.id],
  )
  if (!g) {
    return res.status(404).json({ error: 'Receita não encontrada.' })
  }
  res.json({
    recipe: {
      ...g,
      tags: normalizeTagsArray(g.tags),
      mealRoles: Array.isArray(g.mealRoles) ? g.mealRoles : [],
      origin: 'global',
    },
  })
})

router.post('/fork-global', async (req, res) => {
  const globalRecipeId = req.body?.globalRecipeId
  if (!globalRecipeId) {
    return res.status(400).json({ error: 'globalRecipeId é obrigatório.' })
  }
  let id
  try {
    await transaction(async (client) => {
      id = await forkGlobalRecipeToUser(req.user.id, globalRecipeId, client)
    })
  } catch (e) {
    console.error(e)
    return res.status(400).json({ error: 'Não foi possível copiar a receita.' })
  }
  if (!id) {
    return res.status(404).json({ error: 'Receita não encontrada.' })
  }

  const recipe = await one(`SELECT ${RECIPE_SELECT} FROM recipes WHERE id = $1 AND owner_user_id = $2`, [id, req.user.id])
  const payload = await buildRecipePayload(id, req.user.id, recipe)
  res.status(201).json({ recipe: payload })
})

router.get('/ingredient-names', async (req, res) => {
  const q = (req.query.q || '').trim()
  const params = [req.user.id]
  let sql = `
    SELECT DISTINCT trim(name) AS name FROM recipe_ingredients
    WHERE recipe_id IN (
      SELECT id FROM recipes WHERE owner_user_id = $1 AND recipe_origin IS DISTINCT FROM 'global_fork'
    )
  `
  if (q) {
    params.push(`%${q}%`)
    sql += ` AND name ILIKE $${params.length}`
  }
  sql += ` ORDER BY name ASC LIMIT 80`
  const rows = await many(sql, params)
  res.json({ names: rows.map((r) => r.name).filter(Boolean) })
})

router.get('/', async (req, res) => {
  const cats = mealCategoriesFromQuery(req)
  const tagList = tagsFromQuery(req)
  const q = (req.query.q || '').trim()
  const params = [req.user.id]
  /** Só “tuas” receitas criadas à mão; forks da Tina não aparecem em Receitas pessoais. */
  let whereSql = `WHERE owner_user_id = $1 AND recipe_origin IS DISTINCT FROM 'global_fork'`
  if (cats.length > 0) {
    params.push(cats)
    whereSql += ` AND recipe_category = ANY($${params.length}::text[])`
  }
  if (tagList.length > 0) {
    params.push(tagList)
    whereSql += ` AND ARRAY(SELECT jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb))) && $${params.length}::text[]`
  }
  if (q) {
    params.push(`%${q}%`)
    whereSql += ` AND name ILIKE $${params.length}`
  }
  const recipes = await many(
    `
      SELECT id, name, mode, image_url AS "imageUrl", placeholder_key AS "placeholderKey",
             base_servings AS "baseServings", recipe_category AS "mealCategory",
             servings_source AS "servingsSource", recipe_origin AS "recipeOrigin",
             tags,
             COALESCE(meal_roles, '[]'::jsonb) AS "mealRoles",
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM recipes
      ${whereSql}
      ORDER BY updated_at DESC, name ASC
    `,
    params,
  )
  res.json({
    recipes: recipes.map((r) => ({
      ...r,
      tags: normalizeTagsArray(r.tags),
      mealRoles: normalizeMealRoles(r.mealRoles),
    })),
  })
})

router.get('/:id', async (req, res) => {
  const recipe = await one(
    `SELECT ${RECIPE_SELECT} FROM recipes WHERE id = $1 AND owner_user_id = $2`,
    [req.params.id, req.user.id],
  )
  if (!recipe) {
    return res.status(404).json({ error: 'Receita não encontrada.' })
  }
  const payload = await buildRecipePayload(req.params.id, req.user.id, recipe)
  res.json({ recipe: payload })
})

router.post('/', async (req, res) => {
  const {
    name,
    mode = 'simple',
    baseServings = 4,
    placeholderKey = null,
    ingredients = [],
    memberServings = [],
    preparationSteps = [],
    gramsPerPortion,
    mlPerPortion,
    spoonSoupPerPortion,
    spoonTeaPerPortion,
    mealCategory,
    servingsSource,
    tags: tagsBody,
    mealRoles: mealRolesBody,
    mealComboRules: mealComboRulesBody,
  } = req.body
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nome é obrigatório.' })
  }
  const modeVal = mode === 'advanced' ? 'advanced' : 'simple'
  const id = uid('rec')
  const now = new Date().toISOString()
  const base = Number(baseServings) > 0 ? Number(baseServings) : 1
  const gpp = optPositiveNum(gramsPerPortion)
  const mpp = optPositiveNum(mlPerPortion)
  const spp = optPositiveNum(spoonSoupPerPortion)
  const tpp = optPositiveNum(spoonTeaPerPortion)
  const rcat = normalizeMealCategory(mealCategory)
  const src = servingsSource === 'family' ? 'family' : 'manual'
  const tagsJson = JSON.stringify(normalizeTagsArray(tagsBody))
  const mealRolesJson = JSON.stringify(normalizeMealRoles(mealRolesBody))
  const mealComboRulesJson = JSON.stringify(normalizeMealComboRules(mealComboRulesBody))

  try {
    await transaction(async (client) => {
      await query(
        `
          INSERT INTO recipes (
            id, owner_user_id, name, mode, image_url, placeholder_key, base_servings,
            grams_per_portion, ml_per_portion, spoon_soup_per_portion, spoon_tea_per_portion,
            recipe_category, servings_source, recipe_origin, tags, meal_roles, meal_combo_rules,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, 'user', $13::jsonb, $14::jsonb, $15::jsonb, $16, $17)
        `,
        [
          id,
          req.user.id,
          String(name).trim(),
          modeVal,
          placeholderKey || null,
          base,
          gpp,
          mpp,
          spp,
          tpp,
          rcat,
          src,
          tagsJson,
          mealRolesJson,
          mealComboRulesJson,
          now,
          now,
        ],
        client,
      )
      let sort = 0
      for (const ing of ingredients) {
        if (!ing?.name || !String(ing.name).trim()) continue
        await query(
          `
            INSERT INTO recipe_ingredients (id, recipe_id, sort_order, name, quantity, unit)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            uid('ring'),
            id,
            sort++,
            String(ing.name).trim(),
            ing.quantity != null ? String(ing.quantity) : '',
            ing.unit != null ? String(ing.unit) : null,
          ],
          client,
        )
      }
      if (src === 'manual') {
        for (const ms of memberServings) {
          if (!ms?.memberId) continue
          if (!(await memberOwned(req.user.id, ms.memberId))) continue
          const srv = Number(ms.servings)
          if (!Number.isFinite(srv) || srv <= 0) continue
          const au = normAmountUnit(ms.amountUnit)
          await query(
            `
              INSERT INTO recipe_member_servings (id, recipe_id, member_id, servings, amount_unit)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (recipe_id, member_id) DO UPDATE SET
                servings = EXCLUDED.servings,
                amount_unit = EXCLUDED.amount_unit
            `,
            [uid('rms'), id, ms.memberId, srv, au],
            client,
          )
        }
      }
      await savePreparationSteps(client, id, preparationSteps)
    })
  } catch (e) {
    console.error(e)
    return res.status(400).json({ error: 'Não foi possível criar a receita.' })
  }

  const created = await one(`SELECT ${RECIPE_SELECT} FROM recipes WHERE id = $1`, [id])
  const payload = await buildRecipePayload(id, req.user.id, created)
  res.status(201).json({ recipe: payload })
})

router.patch('/:id', async (req, res) => {
  const existing = await one('SELECT id, image_url FROM recipes WHERE id = $1 AND owner_user_id = $2', [
    req.params.id,
    req.user.id,
  ])
  if (!existing) {
    return res.status(404).json({ error: 'Receita não encontrada.' })
  }
  const {
    name,
    mode,
    baseServings,
    placeholderKey,
    ingredients,
    memberServings,
    preparationSteps,
    clearImage,
    gramsPerPortion,
    mlPerPortion,
    spoonSoupPerPortion,
    spoonTeaPerPortion,
    mealCategory,
    servingsSource,
    tags: tagsBody,
    mealRoles: mealRolesBody,
    mealComboRules: mealComboRulesBody,
  } = req.body
  const now = new Date().toISOString()

  try {
    await transaction(async (client) => {
      const parts = []
      const vals = []
      if (name != null && String(name).trim()) {
        parts.push(`name = $${vals.length + 1}`)
        vals.push(String(name).trim())
      }
      if (mode === 'simple' || mode === 'advanced') {
        parts.push(`mode = $${vals.length + 1}`)
        vals.push(mode)
      }
      if (baseServings != null && Number(baseServings) > 0) {
        parts.push(`base_servings = $${vals.length + 1}`)
        vals.push(Number(baseServings))
      }
      if (placeholderKey !== undefined) {
        parts.push(`placeholder_key = $${vals.length + 1}`)
        vals.push(placeholderKey || null)
      }
      if (gramsPerPortion !== undefined) {
        parts.push(`grams_per_portion = $${vals.length + 1}`)
        vals.push(optPositiveNum(gramsPerPortion))
      }
      if (mlPerPortion !== undefined) {
        parts.push(`ml_per_portion = $${vals.length + 1}`)
        vals.push(optPositiveNum(mlPerPortion))
      }
      if (spoonSoupPerPortion !== undefined) {
        parts.push(`spoon_soup_per_portion = $${vals.length + 1}`)
        vals.push(optPositiveNum(spoonSoupPerPortion))
      }
      if (spoonTeaPerPortion !== undefined) {
        parts.push(`spoon_tea_per_portion = $${vals.length + 1}`)
        vals.push(optPositiveNum(spoonTeaPerPortion))
      }
      if (mealCategory !== undefined) {
        parts.push(`recipe_category = $${vals.length + 1}`)
        vals.push(normalizeMealCategory(mealCategory))
      }
      if (servingsSource === 'family' || servingsSource === 'manual') {
        parts.push(`servings_source = $${vals.length + 1}`)
        vals.push(servingsSource)
      }
      if (tagsBody !== undefined) {
        parts.push(`tags = $${vals.length + 1}`)
        vals.push(JSON.stringify(normalizeTagsArray(tagsBody)))
      }
      if (mealRolesBody !== undefined) {
        parts.push(`meal_roles = $${vals.length + 1}::jsonb`)
        vals.push(JSON.stringify(normalizeMealRoles(mealRolesBody)))
      }
      if (mealComboRulesBody !== undefined) {
        parts.push(`meal_combo_rules = $${vals.length + 1}::jsonb`)
        vals.push(JSON.stringify(normalizeMealComboRules(mealComboRulesBody)))
      }
      if (clearImage === true) {
        parts.push('image_url = NULL')
        if (existing.image_url) {
          safeUnlink(req.user.id, existing.image_url)
        }
      }
      if (parts.length > 0) {
        parts.push(`updated_at = $${vals.length + 1}`)
        vals.push(now)
        const idIdx = vals.length + 1
        const userIdx = vals.length + 2
        vals.push(req.params.id, req.user.id)
        await query(
          `UPDATE recipes SET ${parts.join(', ')} WHERE id = $${idIdx} AND owner_user_id = $${userIdx}`,
          vals,
          client,
        )
      }

      if (servingsSource === 'family') {
        await query(`DELETE FROM recipe_member_servings WHERE recipe_id = $1`, [req.params.id], client)
      }

      if (Array.isArray(ingredients)) {
        await query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [req.params.id], client)
        let sort = 0
        for (const ing of ingredients) {
          if (!ing?.name || !String(ing.name).trim()) continue
          await query(
            `
              INSERT INTO recipe_ingredients (id, recipe_id, sort_order, name, quantity, unit)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              uid('ring'),
              req.params.id,
              sort++,
              String(ing.name).trim(),
              ing.quantity != null ? String(ing.quantity) : '',
              ing.unit != null ? String(ing.unit) : null,
            ],
            client,
          )
        }
      }

      const eff = await one(`SELECT servings_source FROM recipes WHERE id = $1`, [req.params.id], client)
      const effSrc = eff?.servings_source

      if (Array.isArray(memberServings) && effSrc !== 'family') {
        await query(`DELETE FROM recipe_member_servings WHERE recipe_id = $1`, [req.params.id], client)
        for (const ms of memberServings) {
          if (!ms?.memberId) continue
          if (!(await memberOwned(req.user.id, ms.memberId))) continue
          const srv = Number(ms.servings)
          if (!Number.isFinite(srv) || srv <= 0) continue
          const au = normAmountUnit(ms.amountUnit)
          await query(
            `
              INSERT INTO recipe_member_servings (id, recipe_id, member_id, servings, amount_unit)
              VALUES ($1, $2, $3, $4, $5)
            `,
            [uid('rms'), req.params.id, ms.memberId, srv, au],
            client,
          )
        }
      }

      if (Array.isArray(preparationSteps)) {
        await savePreparationSteps(client, req.params.id, preparationSteps)
      }
    })
  } catch (e) {
    console.error(e)
    return res.status(400).json({ error: 'Não foi possível atualizar a receita.' })
  }

  const updated = await one(`SELECT ${RECIPE_SELECT} FROM recipes WHERE id = $1 AND owner_user_id = $2`, [
    req.params.id,
    req.user.id,
  ])
  const payload = await buildRecipePayload(req.params.id, req.user.id, updated)
  res.json({ recipe: payload })
})

router.delete('/:id', async (req, res) => {
  const existing = await one('SELECT image_url FROM recipes WHERE id = $1 AND owner_user_id = $2', [
    req.params.id,
    req.user.id,
  ])
  if (!existing) {
    return res.status(404).json({ error: 'Receita não encontrada.' })
  }
  if (existing.image_url) {
    safeUnlink(req.user.id, existing.image_url)
  }
  await query(`DELETE FROM recipes WHERE id = $1 AND owner_user_id = $2`, [req.params.id, req.user.id])
  res.status(204).send()
})

router.post('/:id/image', (req, res, next) => {
  const upload = recipeUpload(req.user.id, req.params.id)
  upload(req, res, next)
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem (campo image).' })
    }
    const existing = await one('SELECT id, image_url FROM recipes WHERE id = $1 AND owner_user_id = $2', [
      req.params.id,
      req.user.id,
    ])
    if (!existing) {
      safeUnlink(req.user.id, req.file.filename)
      return res.status(404).json({ error: 'Receita não encontrada.' })
    }
    if (existing.image_url) {
      safeUnlink(req.user.id, existing.image_url)
    }
    const filename = req.file.filename
    const now = new Date().toISOString()
    await query(`UPDATE recipes SET image_url = $1, updated_at = $2, placeholder_key = NULL WHERE id = $3 AND owner_user_id = $4`, [
      filename,
      now,
      req.params.id,
      req.user.id,
    ])
    res.json({ success: true, imageUrl: filename })
  } catch (err) {
    console.error(err)
    if (req.file?.filename) safeUnlink(req.user.id, req.file.filename)
    res.status(400).json({ error: err.message || 'Erro ao enviar imagem.' })
  }
})

module.exports = router
