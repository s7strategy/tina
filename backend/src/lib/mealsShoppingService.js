const { many, one, query, uid, transaction } = require('./db')
const { generateShoppingItemsFromPlanner, ymdAppTz } = require('./mealsShoppingGenerate')

async function getOrCreateDefaultShoppingList(ownerUserId) {
  let list = await one(
    `
      SELECT id, name, kind, horizon_days AS "horizonDays",
             period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt"
      FROM shopping_lists
      WHERE owner_user_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [ownerUserId],
  )
  if (!list) {
    const id = uid('shop')
    const now = new Date().toISOString()
    await query(
      `
        INSERT INTO shopping_lists (id, owner_user_id, name, kind, horizon_days, period_start, period_end, created_at)
        VALUES ($1, $2, $3, 'manual', NULL, NULL, NULL, $4)
      `,
      [id, ownerUserId, 'Lista de compras', now],
    )
    list = await one(
      `
        SELECT id, name, kind, horizon_days AS "horizonDays",
               period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt"
        FROM shopping_lists WHERE id = $1
      `,
      [id],
    )
  }
  return list
}

/** Remove itens gerados e volta a calcular a partir do cardápio; mantém manuais. */
async function mergeGeneratedShoppingItems(ownerUserId, listId, horizonDays, period) {
  let start
  let end
  let h
  if (period && period.periodStart && period.periodEnd) {
    start = String(period.periodStart).slice(0, 10)
    end = String(period.periodEnd).slice(0, 10)
    const d0 = new Date(`${start}T12:00:00`)
    const d1 = new Date(`${end}T12:00:00`)
    h = Math.max(1, Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1)
  } else {
    h = [7, 15, 30].includes(Number(horizonDays)) ? Number(horizonDays) : 7
    const today = new Date()
    start = ymdAppTz(today)
    const endDate = new Date(today.getTime() + (h - 1) * 86400000)
    end = ymdAppTz(endDate)
  }
  const now = new Date().toISOString()

  await transaction(async (client) => {
    await query(`DELETE FROM shopping_items WHERE list_id = $1 AND source = 'generated'`, [listId], client)
    await query(
      `
        UPDATE shopping_lists
        SET period_start = $1::date, period_end = $2::date, horizon_days = $3, kind = 'auto', created_at = $4
        WHERE id = $5 AND owner_user_id = $6
      `,
      [start, end, h, now, listId, ownerUserId],
      client,
    )
    const generated = await generateShoppingItemsFromPlanner(
      ownerUserId,
      period && period.periodStart ? { periodStart: start, periodEnd: end } : h,
    )
    const maxRow = await one(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM shopping_items WHERE list_id = $1`,
      [listId],
      client,
    )
    let sort = Number(maxRow?.m ?? -1) + 1
    for (const it of generated) {
      await query(
        `
          INSERT INTO shopping_items (id, list_id, name, quantity_text, unit, checked, sort_order, source)
          VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'generated')
        `,
        [uid('sitem'), listId, it.name, it.quantityText || '', it.unit || null, sort++],
        client,
      )
    }
  })
}

/**
 * Após mudar variações automáticas / calendário: recalcula só itens gerados,
 * usando o último período guardado na lista (ou horizonte padrão).
 */
async function refreshDefaultShoppingGeneratedForUser(ownerUserId) {
  const listRow = await getOrCreateDefaultShoppingList(ownerUserId)
  const h = [7, 15, 30].includes(Number(listRow.horizonDays)) ? Number(listRow.horizonDays) : 7
  const period =
    listRow.periodStart && listRow.periodEnd
      ? { periodStart: String(listRow.periodStart).slice(0, 10), periodEnd: String(listRow.periodEnd).slice(0, 10) }
      : null
  await mergeGeneratedShoppingItems(ownerUserId, listRow.id, h, period)
}

async function clearShoppingListItems(ownerUserId, listId, { generatedOnly = false } = {}) {
  const list = await one(`SELECT id FROM shopping_lists WHERE id = $1 AND owner_user_id = $2`, [listId, ownerUserId])
  if (!list) return { error: 'Lista não encontrada.' }
  if (generatedOnly) {
    await query(`DELETE FROM shopping_items WHERE list_id = $1 AND source = 'generated'`, [listId])
  } else {
    await query(`DELETE FROM shopping_items WHERE list_id = $1`, [listId])
  }
  return { ok: true }
}

module.exports = {
  getOrCreateDefaultShoppingList,
  mergeGeneratedShoppingItems,
  refreshDefaultShoppingGeneratedForUser,
  clearShoppingListItems,
  ymdAppTz,
}
