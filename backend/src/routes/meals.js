const express = require('express')
const { many, one, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const meals = await many(
    `
      SELECT id, day_label AS "dayLabel", icon, name, shopping, today, sort_order AS "sortOrder", created_at AS "createdAt"
      FROM meals
      WHERE owner_user_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `,
    [req.user.id],
  )

  res.json({ meals })
})

router.post('/', async (req, res) => {
  const { day, icon = '🍲', name, shopping = '', today = false } = req.body
  if (!day || !name) {
    return res.status(400).json({ error: 'Dia e nome são obrigatórios.' })
  }

  const countRow = await one('SELECT COUNT(*) AS total FROM meals WHERE owner_user_id = $1', [req.user.id])
  const sortOrder = Number(countRow?.total || 0) + 1
  const meal = {
    id: uid('meal'),
    ownerUserId: req.user.id,
    dayLabel: day,
    icon,
    name,
    shopping,
    today: Boolean(today),
    sortOrder,
    createdAt: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO meals (id, owner_user_id, day_label, icon, name, shopping, today, sort_order, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [meal.id, meal.ownerUserId, meal.dayLabel, meal.icon, meal.name, meal.shopping, meal.today, meal.sortOrder, meal.createdAt],
  )

  res.status(201).json({ meal })
})

module.exports = router
