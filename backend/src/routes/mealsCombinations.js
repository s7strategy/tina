const express = require('express')
const { many, one, query, uid, transaction } = require('../lib/db')
const { normalizeMealCategory } = require('../lib/mealCategories')

const router = express.Router()

const SLOT_TYPE = 'meal'

async function comboOwned(ownerUserId, comboId) {
  return one(`SELECT id FROM meal_combinations WHERE id = $1 AND owner_user_id = $2`, [comboId, ownerUserId])
}

router.get('/', async (req, res) => {
  const combos = await many(
    `
      SELECT id, name, created_at AS "createdAt", meal_kind AS "mealKind"
      FROM meal_combinations
      WHERE owner_user_id = $1
      ORDER BY name ASC, created_at DESC
    `,
    [req.user.id],
  )
  const out = []
  for (const c of combos) {
    const items = await many(
      `
        SELECT mci.id, mci.meal_category AS "mealCategory", mci.recipe_id AS "recipeId",
               r.name AS "recipeName", mci.sort_order AS "sortOrder"
        FROM meal_combination_items mci
        JOIN recipes r ON r.id = mci.recipe_id AND r.owner_user_id = $2
        WHERE mci.combination_id = $1
        ORDER BY mci.sort_order ASC, mci.id ASC
      `,
      [c.id, req.user.id],
    )
    out.push({ ...c, items })
  }
  res.json({ combinations: out })
})

router.post('/', async (req, res) => {
  const { name, items = [] } = req.body
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nome da combinação é obrigatório.' })
  }
  const rows = Array.isArray(items) ? items : []
  const normalized = []
  const seen = new Set()
  for (const it of rows) {
    const cat = normalizeMealCategory(it?.mealCategory)
    const rid = it?.recipeId && String(it.recipeId).trim()
    if (!cat || !rid) continue
    if (seen.has(cat)) {
      return res.status(400).json({ error: `Categoria duplicada: ${cat}.` })
    }
    seen.add(cat)
    const r = await one('SELECT id FROM recipes WHERE id = $1 AND owner_user_id = $2', [rid, req.user.id])
    if (!r) {
      return res.status(400).json({ error: 'Receita inválida na combinação.' })
    }
    normalized.push({ cat, rid })
  }
  if (normalized.length === 0) {
    return res.status(400).json({ error: 'Adicione pelo menos uma receita com categoria.' })
  }

  const id = uid('mco')
  const now = new Date().toISOString()
  try {
    await transaction(async (client) => {
      await query(
        `INSERT INTO meal_combinations (id, owner_user_id, name, created_at) VALUES ($1, $2, $3, $4)`,
        [id, req.user.id, String(name).trim(), now],
        client,
      )
      let sort = 0
      for (const { cat, rid } of normalized) {
        await query(
          `
            INSERT INTO meal_combination_items (id, combination_id, meal_category, recipe_id, sort_order)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [uid('mci'), id, cat, rid, sort++],
          client,
        )
      }
    })
  } catch (e) {
    console.error(e)
    return res.status(400).json({ error: 'Não foi possível guardar a combinação.' })
  }

  const created = await one(
    `SELECT id, name, created_at AS "createdAt" FROM meal_combinations WHERE id = $1`,
    [id],
  )
  const itemsOut = await many(
    `
      SELECT mci.id, mci.meal_category AS "mealCategory", mci.recipe_id AS "recipeId",
             r.name AS "recipeName", mci.sort_order AS "sortOrder"
      FROM meal_combination_items mci
      JOIN recipes r ON r.id = mci.recipe_id
      WHERE mci.combination_id = $1
      ORDER BY mci.sort_order ASC
    `,
    [id],
  )
  res.status(201).json({ combination: { ...created, items: itemsOut } })
})

router.delete('/:id', async (req, res) => {
  const c = await comboOwned(req.user.id, req.params.id)
  if (!c) return res.status(404).json({ error: 'Combinação não encontrada.' })
  await query(`DELETE FROM meal_combinations WHERE id = $1 AND owner_user_id = $2`, [req.params.id, req.user.id])
  res.status(204).send()
})

/** Substitui ou acrescenta a receita numa categoria desta combinação. */
router.patch('/:id', async (req, res) => {
  const c = await comboOwned(req.user.id, req.params.id)
  if (!c) return res.status(404).json({ error: 'Combinação não encontrada.' })

  const { mealCategory, recipeId } = req.body
  const cat = normalizeMealCategory(mealCategory)
  const rid = recipeId && String(recipeId).trim()
  if (!cat || !rid) {
    return res.status(400).json({ error: 'mealCategory e recipeId são obrigatórios.' })
  }
  const r = await one('SELECT id FROM recipes WHERE id = $1 AND owner_user_id = $2', [rid, req.user.id])
  if (!r) {
    return res.status(400).json({ error: 'Receita não encontrada.' })
  }

  try {
    await query(`DELETE FROM meal_combination_items WHERE combination_id = $1 AND meal_category = $2`, [
      req.params.id,
      cat,
    ])
    const maxRow = await one(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM meal_combination_items WHERE combination_id = $1`,
      [req.params.id],
    )
    const sortOrder = Number(maxRow?.m ?? -1) + 1
    await query(
      `
        INSERT INTO meal_combination_items (id, combination_id, meal_category, recipe_id, sort_order)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [uid('mci'), req.params.id, cat, rid, sortOrder],
    )
  } catch (e) {
    console.error(e)
    return res.status(400).json({ error: 'Não foi possível atualizar a combinação.' })
  }

  res.json({ success: true })
})

/**
 * Aplica a combinação: cria um slot por receita em cada data (mesmo cardápio).
 */
router.post('/:id/apply', async (req, res) => {
  const c = await comboOwned(req.user.id, req.params.id)
  if (!c) return res.status(404).json({ error: 'Combinação não encontrada.' })

  const { menuId, menuIds: menuIdsRaw, dates = [] } = req.body
  let menuIds = []
  if (Array.isArray(menuIdsRaw) && menuIdsRaw.length > 0) {
    menuIds = [...new Set(menuIdsRaw.map((x) => String(x).trim()).filter(Boolean))]
  } else if (menuId) {
    menuIds = [String(menuId).trim()]
  }
  if (menuIds.length === 0) {
    return res.status(400).json({ error: 'Escolha pelo menos um cardápio (menuIds ou menuId).' })
  }
  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'Escolha pelo menos um dia.' })
  }
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
      return res.status(400).json({ error: 'Datas inválidas (use YYYY-MM-DD).' })
    }
  }

  const owned = await many(
    `SELECT id FROM menus WHERE owner_user_id = $1 AND id = ANY($2::text[])`,
    [req.user.id, menuIds],
  )
  if (owned.length !== menuIds.length) {
    return res.status(404).json({ error: 'Um ou mais cardápios não foram encontrados.' })
  }

  const items = await many(
    `
      SELECT recipe_id AS "recipeId", meal_category AS "mealCategory", sort_order AS "sortOrder"
      FROM meal_combination_items
      WHERE combination_id = $1
      ORDER BY sort_order ASC
    `,
    [req.params.id],
  )
  if (items.length === 0) {
    return res.status(400).json({ error: 'Esta combinação está vazia.' })
  }

  let inserted = 0
  try {
    await transaction(async (client) => {
      for (const mid of menuIds) {
        for (const planDate of dates) {
          const maxRow = await one(
            `
              SELECT COALESCE(MAX(sort_order), -1) AS m FROM menu_slots
              WHERE menu_id = $1 AND plan_date = $2::date
            `,
            [mid, planDate],
            client,
          )
          let order = Number(maxRow?.m ?? -1) + 1
          for (const it of items) {
            const rid = it.recipeId
            const r = await one('SELECT id FROM recipes WHERE id = $1 AND owner_user_id = $2', [rid, req.user.id], client)
            if (!r) continue
            await query(
              `
                INSERT INTO menu_slots (id, owner_user_id, menu_id, plan_date, slot_type, recipe_id, custom_title, sort_order)
                VALUES ($1, $2, $3, $4::date, $5, $6, NULL, $7)
              `,
              [uid('mns'), req.user.id, mid, planDate, SLOT_TYPE, rid, order],
              client,
            )
            order += 1
            inserted += 1
          }
        }
      }
    })
  } catch (e) {
    console.error(e)
    return res.status(400).json({ error: 'Não foi possível aplicar ao cardápio.' })
  }

  res.json({ success: true, inserted, days: dates.length })
})

module.exports = router
