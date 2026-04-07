const express = require('express')
const { many, one, query, uid, transaction } = require('../lib/db')
const { generateShoppingItemsFromPlanner } = require('../lib/mealsShoppingGenerate')
const {
  getOrCreateDefaultShoppingList,
  mergeGeneratedShoppingItems,
  clearShoppingListItems,
  ymdAppTz,
} = require('../lib/mealsShoppingService')

const router = express.Router()

async function fetchDefaultListWithItems(listId) {
  const items = await many(
    `
      SELECT id, name, quantity_text AS "quantityText", unit, checked, sort_order AS "sortOrder", source
      FROM shopping_items
      WHERE list_id = $1
      ORDER BY sort_order ASC, id ASC
    `,
    [listId],
  )
  const out = await one(
    `
      SELECT id, name, kind, horizon_days AS "horizonDays",
             period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt"
      FROM shopping_lists WHERE id = $1
    `,
    [listId],
  )
  return { list: { ...out, items } }
}

/**
 * Limpa a lista padrão.
 * Body: { scope?: 'all' | 'generated' } — default `all` remove manual+gerado; `generated` só itens do cardápio.
 */
router.post('/clear', async (req, res) => {
  const scope = req.body?.scope === 'generated' ? 'generated' : 'all'
  const listRow = await getOrCreateDefaultShoppingList(req.user.id)
  const r = await clearShoppingListItems(req.user.id, listRow.id, { generatedOnly: scope === 'generated' })
  if (r.error) return res.status(404).json(r)
  const payload = await fetchDefaultListWithItems(listRow.id)
  res.json(payload)
})

/**
 * Lista única. Por omissão volta a calcular itens gerados (próximos N dias a partir de hoje).
 * `skipMerge=1`: só lê a lista (útil logo após POST /sync com período do mês, para não sobrescrever).
 */
router.get('/', async (req, res) => {
  const hRaw = req.query.horizonDays
  const h = [7, 15, 30].includes(Number(hRaw)) ? Number(hRaw) : 7
  const skipMerge = req.query.skipMerge === '1' || req.query.skipMerge === 'true'
  const listRow = await getOrCreateDefaultShoppingList(req.user.id)
  if (!skipMerge) {
    try {
      await mergeGeneratedShoppingItems(req.user.id, listRow.id, h, null)
    } catch (e) {
      console.error('mergeGeneratedShoppingItems (GET /shopping):', e)
    }
  }
  const payload = await fetchDefaultListWithItems(listRow.id)
  res.json(payload)
})

/**
 * Recalcula itens gerados a partir do cardápio.
 * Body: { horizonDays?: 7|15|30 } ou { periodStart, periodEnd } (YYYY-MM-DD) para intervalo fixo.
 */
router.post('/sync', async (req, res) => {
  const hRaw = req.body?.horizonDays
  const h = [7, 15, 30].includes(Number(hRaw)) ? Number(hRaw) : 7
  const ps = req.body?.periodStart ? String(req.body.periodStart).slice(0, 10) : ''
  const pe = req.body?.periodEnd ? String(req.body.periodEnd).slice(0, 10) : ''
  const period = /^\d{4}-\d{2}-\d{2}$/.test(ps) && /^\d{4}-\d{2}-\d{2}$/.test(pe) ? { periodStart: ps, periodEnd: pe } : null
  const listRow = await getOrCreateDefaultShoppingList(req.user.id)
  await mergeGeneratedShoppingItems(req.user.id, listRow.id, h, period)
  const payload = await fetchDefaultListWithItems(listRow.id)
  res.json(payload)
})

/** Para autocomplete ao adicionar item: nomes já usados nas tuas receitas e listas. */
const PT_ACCENT_FROM = 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ'
const PT_ACCENT_TO = 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'

router.get('/ingredient-suggestions', async (req, res) => {
  let q = String(req.query.q || '').trim().slice(0, 48)
  q = q.replace(/%/g, '').replace(/_/g, '')
  const limit = Math.min(30, Math.max(5, Number(req.query.limit) || 18))
  if (q.length < 1) return res.json({ suggestions: [] })

  const folded = q
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

  const rows = await many(
    `
    SELECT name FROM (
      SELECT DISTINCT trim(ri.name) AS name
      FROM recipe_ingredients ri
      INNER JOIN recipes r ON r.id = ri.recipe_id AND r.owner_user_id = $1
      WHERE length(trim(ri.name)) > 0
        AND translate(lower(trim(ri.name)), $3, $4) LIKE $2 || '%'
      UNION
      SELECT DISTINCT trim(si.name) AS name
      FROM shopping_items si
      INNER JOIN shopping_lists sl ON sl.id = si.list_id AND sl.owner_user_id = $1
      WHERE length(trim(si.name)) > 0
        AND translate(lower(trim(si.name)), $3, $4) LIKE $2 || '%'
    ) u
    ORDER BY name ASC
    LIMIT $5
    `,
    [req.user.id, folded, PT_ACCENT_FROM, PT_ACCENT_TO, limit],
  )

  res.json({ suggestions: rows.map((r) => r.name).filter(Boolean) })
})

router.get('/lists', async (req, res) => {
  const lists = await many(
    `
      SELECT id, name, kind, horizon_days AS "horizonDays",
             period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt"
      FROM shopping_lists
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
    `,
    [req.user.id],
  )
  res.json({ lists })
})

router.get('/lists/:id', async (req, res) => {
  const list = await one(
    `
      SELECT id, name, kind, horizon_days AS "horizonDays",
             period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt"
      FROM shopping_lists
      WHERE id = $1 AND owner_user_id = $2
    `,
    [req.params.id, req.user.id],
  )
  if (!list) return res.status(404).json({ error: 'Lista não encontrada.' })
  const items = await many(
    `
      SELECT id, name, quantity_text AS "quantityText", unit, checked, sort_order AS "sortOrder", source
      FROM shopping_items
      WHERE list_id = $1
      ORDER BY sort_order ASC, id ASC
    `,
    [req.params.id],
  )
  res.json({ list: { ...list, items } })
})

router.post('/lists', async (req, res) => {
  const { kind = 'manual', name = '', horizonDays } = req.body
  const id = uid('shop')
  const now = new Date().toISOString()

  if (kind === 'auto') {
    const h = [7, 15, 30].includes(Number(horizonDays)) ? Number(horizonDays) : 7
    const today = new Date()
    const start = ymdAppTz(today)
    const endDate = new Date(today.getTime() + (h - 1) * 86400000)
    const end = ymdAppTz(endDate)
    const listName = name && String(name).trim() ? String(name).trim() : `Compras ${h} dias`

    await query(
      `
        INSERT INTO shopping_lists (id, owner_user_id, name, kind, horizon_days, period_start, period_end, created_at)
        VALUES ($1, $2, $3, 'auto', $4, $5::date, $6::date, $7)
      `,
      [id, req.user.id, listName, h, start, end, now],
    )

    const generated = await generateShoppingItemsFromPlanner(req.user.id, h)
    let sort = 0
    for (const it of generated) {
      await query(
        `
          INSERT INTO shopping_items (id, list_id, name, quantity_text, unit, checked, sort_order, source)
          VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'generated')
        `,
        [uid('sitem'), id, it.name, it.quantityText || '', it.unit || null, sort++],
      )
    }

    const list = await one(
      `
        SELECT id, name, kind, horizon_days AS "horizonDays",
               period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt"
        FROM shopping_lists WHERE id = $1
      `,
      [id],
    )
    const items = await many(
      `SELECT id, name, quantity_text AS "quantityText", unit, checked, sort_order AS "sortOrder", source FROM shopping_items WHERE list_id = $1 ORDER BY sort_order`,
      [id],
    )
    return res.status(201).json({ list: { ...list, items } })
  }

  const listName = name && String(name).trim() ? String(name).trim() : 'Lista'
  await query(
    `
      INSERT INTO shopping_lists (id, owner_user_id, name, kind, horizon_days, period_start, period_end, created_at)
      VALUES ($1, $2, $3, 'manual', NULL, NULL, NULL, $4)
    `,
    [id, req.user.id, listName, now],
  )
  const list = await one(
    `
      SELECT id, name, kind, horizon_days AS "horizonDays",
             period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt"
      FROM shopping_lists WHERE id = $1
    `,
    [id],
  )
  res.status(201).json({ list: { ...list, items: [] } })
})

router.delete('/lists/:id', async (req, res) => {
  const row = await one('SELECT id FROM shopping_lists WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!row) return res.status(404).json({ error: 'Lista não encontrada.' })
  await query(`DELETE FROM shopping_lists WHERE id = $1 AND owner_user_id = $2`, [req.params.id, req.user.id])
  res.status(204).send()
})

router.post('/lists/:id/generate', async (req, res) => {
  const list = await one(
    'SELECT id, kind, horizon_days FROM shopping_lists WHERE id = $1 AND owner_user_id = $2',
    [req.params.id, req.user.id],
  )
  if (!list) return res.status(404).json({ error: 'Lista não encontrada.' })
  const h = [7, 15, 30].includes(Number(list.horizon_days)) ? Number(list.horizon_days) : 7
  const today = new Date()
  const start = ymdAppTz(today)
  const endDate = new Date(today.getTime() + (h - 1) * 86400000)
  const end = ymdAppTz(endDate)
  const now = new Date().toISOString()

  await transaction(async (client) => {
    await query(`DELETE FROM shopping_items WHERE list_id = $1`, [req.params.id], client)
    await query(
      `
        UPDATE shopping_lists
        SET period_start = $1::date, period_end = $2::date, kind = 'auto', horizon_days = $3, created_at = $4
        WHERE id = $5 AND owner_user_id = $6
      `,
      [start, end, h, now, req.params.id, req.user.id],
      client,
    )
    const generated = await generateShoppingItemsFromPlanner(req.user.id, h)
    let sort = 0
    for (const it of generated) {
      await query(
        `
          INSERT INTO shopping_items (id, list_id, name, quantity_text, unit, checked, sort_order, source)
          VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'generated')
        `,
        [uid('sitem'), req.params.id, it.name, it.quantityText || '', it.unit || null, sort++],
        client,
      )
    }
  })

  const items = await many(
    `
      SELECT id, name, quantity_text AS "quantityText", unit, checked, sort_order AS "sortOrder", source
      FROM shopping_items WHERE list_id = $1 ORDER BY sort_order ASC
    `,
    [req.params.id],
  )
  const out = await one(
    `
      SELECT id, name, kind, horizon_days AS "horizonDays",
             period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt"
      FROM shopping_lists WHERE id = $1
    `,
    [req.params.id],
  )
  res.json({ list: { ...out, items } })
})

router.post('/lists/:id/items', async (req, res) => {
  const list = await one('SELECT id FROM shopping_lists WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!list) return res.status(404).json({ error: 'Lista não encontrada.' })
  const { name, quantityText = '', unit = null } = req.body
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nome do item é obrigatório.' })
  }
  const maxRow = await one(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM shopping_items WHERE list_id = $1`,
    [req.params.id],
  )
  const sortOrder = Number(maxRow?.m ?? -1) + 1
  const id = uid('sitem')
  await query(
    `
      INSERT INTO shopping_items (id, list_id, name, quantity_text, unit, checked, sort_order, source)
      VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'manual')
    `,
    [id, req.params.id, String(name).trim(), String(quantityText || ''), unit || null, sortOrder],
  )
  const row = await one(
    `
      SELECT id, name, quantity_text AS "quantityText", unit, checked, sort_order AS "sortOrder", source
      FROM shopping_items WHERE id = $1
    `,
    [id],
  )
  res.status(201).json({ item: row })
})

router.patch('/items/:id', async (req, res) => {
  const item = await one(
    `
      SELECT si.id FROM shopping_items si
      INNER JOIN shopping_lists sl ON sl.id = si.list_id
      WHERE si.id = $1 AND sl.owner_user_id = $2
    `,
    [req.params.id, req.user.id],
  )
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' })

  const { name, quantityText, unit, checked, sortOrder } = req.body
  const parts = []
  const vals = []
  if (name != null && String(name).trim()) {
    parts.push(`name = $${vals.length + 1}`)
    vals.push(String(name).trim())
  }
  if (quantityText !== undefined) {
    parts.push(`quantity_text = $${vals.length + 1}`)
    vals.push(String(quantityText))
  }
  if (unit !== undefined) {
    parts.push(`unit = $${vals.length + 1}`)
    vals.push(unit || null)
  }
  if (typeof checked === 'boolean') {
    parts.push(`checked = $${vals.length + 1}`)
    vals.push(checked)
  }
  if (sortOrder != null && Number.isFinite(Number(sortOrder))) {
    parts.push(`sort_order = $${vals.length + 1}`)
    vals.push(Number(sortOrder))
  }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' })

  const idIdx = vals.length + 1
  vals.push(req.params.id)
  await query(`UPDATE shopping_items SET ${parts.join(', ')} WHERE id = $${idIdx}`, vals)

  const row = await one(
    `
      SELECT id, name, quantity_text AS "quantityText", unit, checked, sort_order AS "sortOrder", source
      FROM shopping_items WHERE id = $1
    `,
    [req.params.id],
  )
  res.json({ item: row })
})

router.delete('/items/:id', async (req, res) => {
  const item = await one(
    `
      SELECT si.id FROM shopping_items si
      INNER JOIN shopping_lists sl ON sl.id = si.list_id
      WHERE si.id = $1 AND sl.owner_user_id = $2
    `,
    [req.params.id, req.user.id],
  )
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' })
  await query(`DELETE FROM shopping_items WHERE id = $1`, [req.params.id])
  res.status(204).send()
})

module.exports = router
