const { one, many } = require('./db')

const DEFAULT_SPOONS = 4

/**
 * @returns {Promise<{ autoActive: boolean, memberSpoons: Record<string, number> }>}
 */
async function getFamilyMealSettings(ownerUserId) {
  const row = await one(
    `SELECT auto_active AS "autoActive", member_spoons AS "memberSpoons"
     FROM family_meal_settings WHERE owner_user_id = $1`,
    [ownerUserId],
  )
  if (!row) {
    return { autoActive: false, memberSpoons: {} }
  }
  return {
    autoActive: Boolean(row.autoActive),
    memberSpoons: row.memberSpoons && typeof row.memberSpoons === 'object' ? row.memberSpoons : {},
  }
}

/**
 * Membros com porção em colheres (para resposta da receita em modo família).
 */
async function buildMemberServingsFromFamily(ownerUserId) {
  const { autoActive, memberSpoons } = await getFamilyMealSettings(ownerUserId)
  if (!autoActive) return null
  const mems = await many(
    `SELECT id, name FROM members WHERE owner_user_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [ownerUserId],
  )
  return mems.map((m) => ({
    memberId: m.id,
    memberName: m.name,
    servings: (() => {
      const v = memberSpoons[m.id]
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_SPOONS
    })(),
    amountUnit: 'cs',
  }))
}

module.exports = {
  getFamilyMealSettings,
  buildMemberServingsFromFamily,
  DEFAULT_SPOONS,
}
