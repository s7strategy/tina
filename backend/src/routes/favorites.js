const express = require('express')
const { many, query, one, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const favorites = (await many(
    `
      SELECT id, profile_key AS "profileKey", icon, label, cat, sub, detail,
             participant_keys_json AS "participantKeysJson", created_at AS "createdAt"
      FROM favorites
      WHERE owner_user_id = $1
      ORDER BY created_at ASC
    `,
    [req.user.id],
  )).map((f) => ({
    ...f,
    participantKeys: JSON.parse(f.participantKeysJson || '[]'),
  }))

  res.json({ favorites })
})

router.post('/', async (req, res) => {
  const { profileKey, icon = '⭐', label, cat, sub = '', detail = '', participantKeys = [] } = req.body
  if (!profileKey || !label || !cat) {
    return res.status(400).json({ error: 'Perfil, nome e categoria são obrigatórios.' })
  }

  const keys = participantKeys.length > 0 ? participantKeys : [profileKey]

  const favorite = {
    id: uid('fav'),
    ownerUserId: req.user.id,
    profileKey,
    icon,
    label,
    cat,
    sub,
    detail,
    participantKeysJson: JSON.stringify(keys),
    createdAt: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO favorites (id, owner_user_id, profile_key, icon, label, cat, sub, detail, participant_keys_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [favorite.id, favorite.ownerUserId, favorite.profileKey, favorite.icon, favorite.label,
     favorite.cat, favorite.sub, favorite.detail, favorite.participantKeysJson, favorite.createdAt],
  )

  res.status(201).json({ favorite: { ...favorite, participantKeys: keys } })
})

router.patch('/:id', async (req, res) => {
  const { icon, label, cat, sub, detail, participantKeys } = req.body

  if (!label || !cat) {
    return res.status(400).json({ error: 'Nome e categoria são obrigatórios.' })
  }

  const favorite = await one('SELECT * FROM favorites WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!favorite) {
    return res.status(404).json({ error: 'Favorito não encontrado.' })
  }

  const participantKeysJson = Array.isArray(participantKeys) ? JSON.stringify(participantKeys) : favorite.participant_keys_json

  await query(
    'UPDATE favorites SET icon = $1, label = $2, cat = $3, sub = $4, detail = $5, participant_keys_json = $6 WHERE id = $7 AND owner_user_id = $8',
    [
      icon || favorite.icon,
      label,
      cat,
      sub !== undefined ? sub : favorite.sub,
      detail !== undefined ? detail : favorite.detail,
      participantKeysJson,
      req.params.id,
      req.user.id
    ]
  )

  res.json({ success: true })
})

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM favorites WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Favorito não encontrado.' })
  }
  res.status(204).send()
})

module.exports = router
