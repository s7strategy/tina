const express = require('express')
const { one, query, many } = require('../lib/db')

const router = express.Router()

router.get('/', async (req, res) => {
  const row = await one(
    `SELECT auto_active AS "autoActive", member_spoons AS "memberSpoons"
     FROM family_meal_settings WHERE owner_user_id = $1`,
    [req.user.id],
  )
  if (!row) {
    return res.json({ autoActive: false, memberSpoons: {} })
  }
  res.json({
    autoActive: Boolean(row.autoActive),
    memberSpoons: row.memberSpoons && typeof row.memberSpoons === 'object' ? row.memberSpoons : {},
  })
})

router.patch('/', async (req, res) => {
  const { autoActive, memberSpoons } = req.body
  const now = new Date().toISOString()
  const mems = await many(`SELECT id FROM members WHERE owner_user_id = $1`, [req.user.id])
  const allowed = new Set(mems.map((m) => m.id))
  const raw = memberSpoons && typeof memberSpoons === 'object' ? memberSpoons : {}
  const filtered = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!allowed.has(k)) continue
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) filtered[k] = n
  }
  const active = Boolean(autoActive)
  await query(
    `INSERT INTO family_meal_settings (owner_user_id, auto_active, member_spoons, updated_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (owner_user_id) DO UPDATE SET
       auto_active = EXCLUDED.auto_active,
       member_spoons = EXCLUDED.member_spoons,
       updated_at = EXCLUDED.updated_at`,
    [req.user.id, active, JSON.stringify(filtered), now],
  )
  res.json({ autoActive: active, memberSpoons: filtered })
})

module.exports = router
