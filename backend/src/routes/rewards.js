const express = require('express')
const { many, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const rewards = await many(
    `
      SELECT id, tier_id AS "tierId", tier_label AS "tierLabel", cost, color, label, created_at AS "createdAt"
      FROM rewards
      WHERE owner_user_id = $1
      ORDER BY cost ASC, created_at ASC
    `,
    [req.user.id],
  )

  res.json({ rewards })
})

router.post('/', async (req, res) => {
  const { tierId, value } = req.body
  const tierMap = {
    'tier-6': { label: '🔵 Escolhas do Dia', cost: 6, color: '#6fa8dc' },
    'tier-8': { label: '🟠 Especiais', cost: 8, color: '#e8983a' },
    'tier-12': { label: '🟣 Super', cost: 12, color: '#b07ec5' },
  }

  if (!tierId || !value || !tierMap[tierId]) {
    return res.status(400).json({ error: 'Tier inválido ou recompensa vazia.' })
  }

  const reward = {
    id: uid('reward'),
    ownerUserId: req.user.id,
    tierId,
    tierLabel: tierMap[tierId].label,
    cost: tierMap[tierId].cost,
    color: tierMap[tierId].color,
    label: value,
    createdAt: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO rewards (id, owner_user_id, tier_id, tier_label, cost, color, label, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [reward.id, reward.ownerUserId, reward.tierId, reward.tierLabel, reward.cost, reward.color, reward.label, reward.createdAt],
  )

  res.status(201).json({ reward })
})

module.exports = router
