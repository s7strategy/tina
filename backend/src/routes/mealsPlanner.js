const express = require('express')
const { many, one, query, uid, transaction, value } = require('../lib/db')
const { normalizeMealCategory } = require('../lib/mealCategories')
const { ensureDefaultMenusForUser, mealKindToPlannerSlotType } = require('../lib/defaultMenus')
const {
  generateAutoVariationsForMenu,
  saveAutoVariationsForMenu,
  randomizePlannerSlotRecipe,
} = require('../lib/mealsAutoVariations')
const { refreshDefaultShoppingGeneratedForUser } = require('../lib/mealsShoppingService')

const router = express.Router()

const MENU_SELECT = `
      id, name, sort_order AS "sortOrder", created_at AS "createdAt",
      meal_kind AS "mealKind",
      COALESCE(is_system_default, FALSE) AS "isSystemDefault",
      COALESCE(auto_mode_enabled, FALSE) AS "autoModeEnabled",
      COALESCE(required_slots_json, '[]'::jsonb) AS "requiredSlots",
      default_combination_id AS "defaultCombinationId",
      COALESCE(auto_variations_json, '[]'::jsonb) AS "autoVariations"
`

const SLOT_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack', 'meal'])

function toYmd(d) {
  if (!d) return ''
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

router.get('/menus', async (req, res) => {
  try {
    await ensureDefaultMenusForUser(req.user.id)
  } catch (e) {
    console.error(e)
  }
  const menus = await many(
    `
      SELECT ${MENU_SELECT}
      FROM menus
      WHERE owner_user_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `,
    [req.user.id],
  )
  res.json({ menus })
})

router.post('/menus', async (_req, res) => {
  return res.status(400).json({
    error: 'Só existem os quatro cardápios base (Café da manhã, Almoço, Jantar, Lanche). Não é possível criar outros.',
  })
})

router.patch('/menus/:id', async (req, res) => {
  const m = await one(
    `SELECT id, COALESCE(is_system_default, FALSE) AS sys FROM menus WHERE id = $1 AND owner_user_id = $2`,
    [req.params.id, req.user.id],
  )
  if (!m) return res.status(404).json({ error: 'Cardápio não encontrado.' })
  const { name, sortOrder, autoModeEnabled, requiredSlots } = req.body
  const parts = []
  const vals = []
  if (name != null && String(name).trim()) {
    parts.push(`name = $${vals.length + 1}`)
    vals.push(String(name).trim())
  }
  if (sortOrder != null && Number.isFinite(Number(sortOrder))) {
    parts.push(`sort_order = $${vals.length + 1}`)
    vals.push(Number(sortOrder))
  }
  if (autoModeEnabled !== undefined) {
    parts.push(`auto_mode_enabled = $${vals.length + 1}`)
    vals.push(Boolean(autoModeEnabled))
  }
  if (requiredSlots !== undefined) {
    const arr = Array.isArray(requiredSlots) ? requiredSlots : []
    parts.push(`required_slots_json = $${vals.length + 1}::jsonb`)
    vals.push(JSON.stringify(arr))
  }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' })
  const idIdx = vals.length + 1
  const userIdx = vals.length + 2
  vals.push(req.params.id, req.user.id)
  await query(`UPDATE menus SET ${parts.join(', ')} WHERE id = $${idIdx} AND owner_user_id = $${userIdx}`, vals)
  const row = await one(`SELECT ${MENU_SELECT} FROM menus WHERE id = $1`, [req.params.id])
  res.json({ menu: row })
})

router.post('/menus/:menuId/auto-variations/generate', async (req, res) => {
  const menu = await one(`SELECT * FROM menus WHERE id = $1 AND owner_user_id = $2`, [
    req.params.menuId,
    req.user.id,
  ])
  if (!menu) return res.status(404).json({ error: 'Cardápio não encontrado.' })

  const count = req.body?.count ?? 30
  const result = await generateAutoVariationsForMenu(req.user.id, menu, count)
  if (result.error) {
    return res.status(400).json({ error: result.error, missingCategories: result.missingCategories })
  }

  await query(
    `UPDATE menus SET auto_variations_json = $1::jsonb, auto_mode_enabled = TRUE WHERE id = $2 AND owner_user_id = $3`,
    [JSON.stringify(result.variations), req.params.menuId, req.user.id],
  )
  try {
    await refreshDefaultShoppingGeneratedForUser(req.user.id)
  } catch (e) {
    console.error('refresh shopping after auto-variations generate:', e?.message || e)
  }
  const row = await one(`SELECT ${MENU_SELECT} FROM menus WHERE id = $1`, [req.params.menuId])
  res.json({ menu: row, variations: result.variations })
})

router.patch('/menus/:menuId/auto-variations', async (req, res) => {
  const m = await one(`SELECT id FROM menus WHERE id = $1 AND owner_user_id = $2`, [
    req.params.menuId,
    req.user.id,
  ])
  if (!m) return res.status(404).json({ error: 'Cardápio não encontrado.' })
  const { variations } = req.body
  const out = await saveAutoVariationsForMenu(req.user.id, req.params.menuId, variations)
  if (out.error) {
    return res.status(400).json({ error: out.error })
  }
  const row = await one(`SELECT ${MENU_SELECT} FROM menus WHERE id = $1`, [req.params.menuId])
  try {
    await refreshDefaultShoppingGeneratedForUser(req.user.id)
  } catch (e) {
    console.error('refresh shopping after auto-variations patch:', e?.message || e)
  }
  res.json({ menu: row, variations: out.variations })
})

router.delete('/menus/:id', async (req, res) => {
  const m = await one(
    `SELECT id, COALESCE(is_system_default, FALSE) AS sys FROM menus WHERE id = $1 AND owner_user_id = $2`,
    [req.params.id, req.user.id],
  )
  if (!m) return res.status(404).json({ error: 'Cardápio não encontrado.' })
  if (m.sys) {
    return res.status(400).json({ error: 'Os cardápios base (Café da manhã, Almoço, Jantar, Lanche) não podem ser removidos.' })
  }
  const others = await value(`SELECT COUNT(*)::int FROM menus WHERE owner_user_id = $1`, [req.user.id])
  if (Number(others) <= 1) {
    return res.status(400).json({ error: 'É necessário manter pelo menos um cardápio.' })
  }
  await query(`DELETE FROM menus WHERE id = $1 AND owner_user_id = $2`, [req.params.id, req.user.id])
  res.status(204).send()
})

router.get('/', async (req, res) => {
  const { from, to, menuId, menuIds: menuIdsRaw } = req.query
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'Informe from e to (YYYY-MM-DD).' })
  }

  let ids = []
  if (menuIdsRaw && typeof menuIdsRaw === 'string') {
    ids = menuIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  } else if (menuId && typeof menuId === 'string') {
    ids = [menuId]
  }
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Informe menuId ou menuIds (cardápios).' })
  }
  ids = [...new Set(ids)]

  const owned = await many(
    `SELECT id FROM menus WHERE owner_user_id = $1 AND id = ANY($2::text[])`,
    [req.user.id, ids],
  )
  if (owned.length !== ids.length) {
    return res.status(404).json({ error: 'Um ou mais cardápios não foram encontrados.' })
  }

  const slots = await many(
    `
      SELECT ms.id, ms.menu_id AS "menuId", m.name AS "menuName", ms.plan_date AS "planDate",
             ms.slot_type AS "slotType", ms.recipe_id AS "recipeId",
             ms.custom_title AS "customTitle", ms.sort_order AS "sortOrder"
      FROM menu_slots ms
      INNER JOIN menus m ON m.id = ms.menu_id AND m.owner_user_id = $1
      WHERE ms.owner_user_id = $1 AND ms.menu_id = ANY($2::text[])
        AND ms.plan_date >= $3::date AND ms.plan_date <= $4::date
      ORDER BY ms.plan_date ASC, m.sort_order ASC, ms.sort_order ASC, ms.id ASC
    `,
    [req.user.id, ids, from, to],
  )

  const recipeIds = [...new Set(slots.map((s) => s.recipeId).filter(Boolean))]
  let recipeById = {}
  if (recipeIds.length > 0) {
    const rrows = await many(
      `
        SELECT id, name, recipe_category AS "recipeCategory"
        FROM recipes WHERE owner_user_id = $1 AND id = ANY($2::text[])
      `,
      [req.user.id, recipeIds],
    )
    recipeById = Object.fromEntries(
      rrows.map((r) => [
        r.id,
        { name: r.name, mealCategory: normalizeMealCategory(r.recipeCategory) },
      ]),
    )
  }

  const enriched = slots.map((s) => {
    const rec = s.recipeId ? recipeById[s.recipeId] : null
    return {
      id: s.id,
      menuId: s.menuId,
      menuName: s.menuName,
      planDate: toYmd(s.planDate),
      slotType: s.slotType,
      recipeId: s.recipeId,
      recipeName: rec?.name ?? null,
      mealCategory: rec?.mealCategory ?? null,
      customTitle: s.customTitle,
      sortOrder: s.sortOrder,
    }
  })

  const byDate = new Map()
  for (const s of enriched) {
    const dk = s.planDate
    if (!byDate.has(dk)) byDate.set(dk, [])
    byDate.get(dk).push(s)
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySlots]) => ({ date, slots: daySlots }))

  res.json({ days })
})

router.post('/slots', async (req, res) => {
  const { menuId, planDate, slotType, recipeId, customTitle, sortOrder } = req.body
  if (!menuId || !planDate || !slotType || !SLOT_TYPES.has(slotType)) {
    return res.status(400).json({ error: 'menuId, planDate e slotType válido são obrigatórios.' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(planDate))) {
    return res.status(400).json({ error: 'planDate inválido.' })
  }

  const menu = await one('SELECT id FROM menus WHERE id = $1 AND owner_user_id = $2', [menuId, req.user.id])
  if (!menu) return res.status(404).json({ error: 'Cardápio não encontrado.' })

  const hasRecipe = Boolean(recipeId)
  const title = customTitle != null ? String(customTitle).trim() : ''
  if (!hasRecipe && !title) {
    return res.status(400).json({ error: 'Informe recipeId ou customTitle.' })
  }
  if (hasRecipe) {
    const r = await one('SELECT id FROM recipes WHERE id = $1 AND owner_user_id = $2', [recipeId, req.user.id])
    if (!r) return res.status(400).json({ error: 'Receita não encontrada.' })
  }

  let order = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : null
  if (order == null) {
    const maxRow = await one(
      `
        SELECT COALESCE(MAX(sort_order), -1) AS m FROM menu_slots
        WHERE menu_id = $1 AND plan_date = $2::date
      `,
      [menuId, planDate],
    )
    order = Number(maxRow?.m ?? -1) + 1
  }

  const id = uid('mns')
  await query(
    `
      INSERT INTO menu_slots (id, owner_user_id, menu_id, plan_date, slot_type, recipe_id, custom_title, sort_order)
      VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)
    `,
    [id, req.user.id, menuId, planDate, slotType, hasRecipe ? recipeId : null, hasRecipe ? null : title, order],
  )
  const row = await one(
    `
      SELECT id, menu_id AS "menuId", plan_date AS "planDate", slot_type AS "slotType",
             recipe_id AS "recipeId", custom_title AS "customTitle", sort_order AS "sortOrder"
      FROM menu_slots WHERE id = $1
    `,
    [id],
  )
  if (hasRecipe) {
    try {
      await refreshDefaultShoppingGeneratedForUser(req.user.id)
    } catch (e) {
      console.error('refresh shopping after POST slot:', e?.message || e)
    }
  }
  res.status(201).json({ slot: row })
})

router.post('/slots/:id/randomize', async (req, res) => {
  const out = await randomizePlannerSlotRecipe(req.user.id, req.params.id)
  if (out.error) {
    return res.status(400).json({ error: out.error })
  }
  try {
    await refreshDefaultShoppingGeneratedForUser(req.user.id)
  } catch (e) {
    console.error('refresh shopping after slot randomize:', e?.message || e)
  }
  res.json({ ok: true, recipeId: out.recipeId, recipeName: out.recipeName })
})

router.patch('/slots/:id', async (req, res) => {
  const s = await one(
    `SELECT id FROM menu_slots WHERE id = $1 AND owner_user_id = $2`,
    [req.params.id, req.user.id],
  )
  if (!s) return res.status(404).json({ error: 'Slot não encontrado.' })

  const { slotType, recipeId, customTitle, sortOrder } = req.body
  const parts = []
  const vals = []
  if (slotType && SLOT_TYPES.has(slotType)) {
    parts.push(`slot_type = $${vals.length + 1}`)
    vals.push(slotType)
  }
  if (recipeId !== undefined) {
    if (recipeId) {
      const r = await one('SELECT id FROM recipes WHERE id = $1 AND owner_user_id = $2', [recipeId, req.user.id])
      if (!r) return res.status(400).json({ error: 'Receita não encontrada.' })
      parts.push(`recipe_id = $${vals.length + 1}`)
      vals.push(recipeId)
      parts.push('custom_title = NULL')
    } else {
      parts.push('recipe_id = NULL')
      if (customTitle !== undefined) {
        parts.push(`custom_title = $${vals.length + 1}`)
        vals.push(String(customTitle).trim() || null)
      }
    }
  } else if (customTitle !== undefined) {
    parts.push('recipe_id = NULL')
    parts.push(`custom_title = $${vals.length + 1}`)
    vals.push(String(customTitle).trim() || null)
  }
  if (sortOrder != null && Number.isFinite(Number(sortOrder))) {
    parts.push(`sort_order = $${vals.length + 1}`)
    vals.push(Number(sortOrder))
  }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' })

  const idIdx = vals.length + 1
  vals.push(req.params.id)
  await query(`UPDATE menu_slots SET ${parts.join(', ')} WHERE id = $${idIdx}`, vals)

  const row = await one(
    `
      SELECT id, menu_id AS "menuId", plan_date AS "planDate", slot_type AS "slotType",
             recipe_id AS "recipeId", custom_title AS "customTitle", sort_order AS "sortOrder"
      FROM menu_slots WHERE id = $1
    `,
    [req.params.id],
  )
  if (recipeId !== undefined || customTitle !== undefined) {
    try {
      await refreshDefaultShoppingGeneratedForUser(req.user.id)
    } catch (e) {
      console.error('refresh shopping after PATCH slot:', e?.message || e)
    }
  }
  res.json({ slot: row })
})

router.delete('/slots/:id', async (req, res) => {
  const s = await one(`SELECT id FROM menu_slots WHERE id = $1 AND owner_user_id = $2`, [req.params.id, req.user.id])
  if (!s) return res.status(404).json({ error: 'Slot não encontrado.' })
  await query(`DELETE FROM menu_slots WHERE id = $1`, [req.params.id])
  try {
    await refreshDefaultShoppingGeneratedForUser(req.user.id)
  } catch (e) {
    console.error('refresh shopping after DELETE slot:', e?.message || e)
  }
  res.status(204).send()
})

router.post('/bulk-repeat', async (req, res) => {
  const { menuId, dates = [], template } = req.body
  if (!menuId) {
    return res.status(400).json({ error: 'menuId é obrigatório.' })
  }
  const menu = await one('SELECT id FROM menus WHERE id = $1 AND owner_user_id = $2', [menuId, req.user.id])
  if (!menu) return res.status(404).json({ error: 'Cardápio não encontrado.' })

  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'Informe dates (array de YYYY-MM-DD).' })
  }
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
      return res.status(400).json({ error: 'Datas inválidas.' })
    }
  }
  const slotsTemplate = Array.isArray(template?.slots) ? template.slots : []
  if (slotsTemplate.length === 0) {
    return res.status(400).json({ error: 'template.slots é obrigatório.' })
  }

  await transaction(async (client) => {
    for (const planDate of dates) {
      const maxRow = await one(
        `
          SELECT COALESCE(MAX(sort_order), -1) AS m FROM menu_slots
          WHERE menu_id = $1 AND plan_date = $2::date
        `,
        [menuId, planDate],
        client,
      )
      let order = Number(maxRow?.m ?? -1) + 1
      for (const st of slotsTemplate) {
        if (!st?.slotType || !SLOT_TYPES.has(st.slotType)) continue
        const hasR = Boolean(st.recipeId)
        const tit = st.customTitle != null ? String(st.customTitle).trim() : ''
        if (!hasR && !tit) continue
        if (hasR) {
          const r = await one(
            'SELECT id FROM recipes WHERE id = $1 AND owner_user_id = $2',
            [st.recipeId, req.user.id],
            client,
          )
          if (!r) continue
        }
        await query(
          `
            INSERT INTO menu_slots (id, owner_user_id, menu_id, plan_date, slot_type, recipe_id, custom_title, sort_order)
            VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)
          `,
          [
            uid('mns'),
            req.user.id,
            menuId,
            planDate,
            st.slotType,
            hasR ? st.recipeId : null,
            hasR ? null : tit,
            order,
          ],
          client,
        )
        order += 1
      }
    }
  })

  try {
    await refreshDefaultShoppingGeneratedForUser(req.user.id)
  } catch (e) {
    console.error('refresh shopping after bulk-repeat:', e?.message || e)
  }
  res.json({ success: true, applied: dates.length })
})

/** Gera combinações para cada dia do mês e grava slots (tuas receitas + Tina já resolvidas pelo motor). */
router.post('/auto-fill-month', async (req, res) => {
  try {
  const { menuIds, month, replace = true } = req.body || {}
  const ids = Array.isArray(menuIds) ? [...new Set(menuIds.map((x) => String(x).trim()).filter(Boolean))] : []
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Escolhe pelo menos um cardápio.' })
  }
  const monthStr = String(month || '')
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return res.status(400).json({ error: 'Indica o mês no formato YYYY-MM.' })
  }

  const [yStr, moStr] = monthStr.split('-')
  const y = Number(yStr)
  const mo = Number(moStr)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
    return res.status(400).json({ error: 'Mês inválido.' })
  }

  const lastDay = new Date(y, mo, 0).getDate()
  const dates = []
  for (let d = 1; d <= lastDay; d += 1) {
    dates.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  const owned = await many(
    `SELECT id FROM menus WHERE owner_user_id = $1 AND id = ANY($2::text[])`,
    [req.user.id, ids],
  )
  if (owned.length !== ids.length) {
    return res.status(404).json({ error: 'Um ou mais cardápios não foram encontrados.' })
  }

  const doReplace = Boolean(replace)
  const results = []

  for (const menuId of ids) {
    const menu = await one(`SELECT * FROM menus WHERE id = $1 AND owner_user_id = $2`, [menuId, req.user.id])
    if (!menu) {
      results.push({ menuId, error: 'Cardápio não encontrado.' })
      continue
    }

    const gen = await generateAutoVariationsForMenu(req.user.id, menu, dates.length)
    if (gen.error) {
      results.push({
        menuId,
        error: gen.error,
        missingCategories: gen.missingCategories,
      })
      continue
    }

    await query(
      `
        UPDATE menus SET auto_variations_json = $1::jsonb, auto_mode_enabled = TRUE
        WHERE id = $2 AND owner_user_id = $3
      `,
      [JSON.stringify(gen.variations), menuId, req.user.id],
    )

    const slotType = mealKindToPlannerSlotType(menu.meal_kind ?? menu.mealKind)

    try {
      await transaction(async (client) => {
        if (doReplace) {
          await query(
            `
              DELETE FROM menu_slots
              WHERE owner_user_id = $1 AND menu_id = $2
                AND plan_date >= $3::date AND plan_date <= $4::date
            `,
            [req.user.id, menuId, dates[0], dates[dates.length - 1]],
            client,
          )
        }

        for (let i = 0; i < dates.length; i += 1) {
          const planDate = dates[i]
          const variation = gen.variations[i]
          if (!variation) continue

          const maxRow = await one(
            `
              SELECT COALESCE(MAX(sort_order), -1) AS m FROM menu_slots
              WHERE menu_id = $1 AND plan_date = $2::date
            `,
            [menuId, planDate],
            client,
          )
          let order = Number(maxRow?.m ?? -1) + 1

          const vslots = Array.isArray(variation.slots) ? variation.slots : []
          for (const s of vslots) {
            const rid = s.recipeId ? String(s.recipeId) : ''
            if (!rid) continue
            const okRec = await one(
              `SELECT id FROM recipes WHERE id = $1 AND owner_user_id = $2`,
              [rid, req.user.id],
              client,
            )
            if (!okRec) continue

            await query(
              `
                INSERT INTO menu_slots (id, owner_user_id, menu_id, plan_date, slot_type, recipe_id, custom_title, sort_order)
                VALUES ($1, $2, $3, $4::date, $5, $6, NULL, $7)
              `,
              [uid('mns'), req.user.id, menuId, planDate, slotType, rid, order],
              client,
            )
            order += 1
          }
        }
      })
    } catch (e) {
      console.error('auto-fill-month transaction', e)
      results.push({ menuId, error: 'Erro ao gravar o calendário.' })
      continue
    }

    results.push({ menuId, ok: true, days: dates.length })
  }

  const anyOk = results.some((r) => r.ok)
  if (anyOk) {
    try {
      await refreshDefaultShoppingGeneratedForUser(req.user.id)
    } catch (e) {
      console.error('refresh shopping after auto-fill-month:', e?.message || e)
    }
  }
  return res.status(anyOk ? 200 : 400).json({ results, month: monthStr })
  } catch (e) {
    console.error('auto-fill-month', e)
    return res.status(500).json({ error: 'Erro interno ao gerar o mês.' })
  }
})

module.exports = router
