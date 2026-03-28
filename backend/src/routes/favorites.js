const express = require('express')
const { many, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const favorites = await many(
    `
      SELECT id, profile_key AS "profileKey", icon, label, cat, sub, detail, created_at AS "createdAt"
      FROM favorites
      WHERE owner_user_id = $1
      ORDER BY created_at ASC
    `,
    [req.user.id],
  )

  res.json({ favorites })
})

router.post('/', async (req, res) => {
  const { profileKey, icon = '⭐', label, cat, sub = '', detail = '' } = req.body
  if (!profileKey || !label || !cat) {
    return res.status(400).json({ error: 'Perfil, nome e categoria são obrigatórios.' })
  }

  const favorite = {
    id: uid('fav'),
    ownerUserId: req.user.id,
    profileKey,
    icon,
    label,
    cat,
    sub,
    detail,
    createdAt: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO favorites (id, owner_user_id, profile_key, icon, label, cat, sub, detail, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [favorite.id, favorite.ownerUserId, favorite.profileKey, favorite.icon, favorite.label, favorite.cat, favorite.sub, favorite.detail, favorite.createdAt],
  )

  res.status(201).json({ favorite })
})

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM favorites WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Favorito não encontrado.' })
  }
  res.status(204).send()
})

module.exports = router
