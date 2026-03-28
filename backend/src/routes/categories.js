const express = require('express')
const { many, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const profileKey = req.query.profileKey
  const sql = `
    SELECT id, profile_key AS "profileKey", icon, name, visibility_scope AS "visibilityScope", created_at AS "createdAt"
    FROM categories
    WHERE owner_user_id = $1
    ${profileKey ? 'AND profile_key = $2' : ''}
    ORDER BY created_at ASC
  `
  const params = profileKey ? [req.user.id, profileKey] : [req.user.id]
  const categories = await many(sql, params)
  res.json({ categories })
})

router.post('/', async (req, res) => {
  const { profileKey = 'self', icon = '📂', name, visibilityScope = 'Todos' } = req.body

  if (!name) {
    return res.status(400).json({ error: 'Nome da categoria é obrigatório.' })
  }

  const category = {
    id: uid('cat'),
    ownerUserId: req.user.id,
    profileKey,
    icon,
    name,
    visibilityScope,
    createdAt: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO categories (id, owner_user_id, profile_key, icon, name, visibility_scope, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [category.id, category.ownerUserId, category.profileKey, category.icon, category.name, category.visibilityScope, category.createdAt],
  )

  res.status(201).json({ category })
})

module.exports = router
