const express = require('express')
const { many, query, one, uid, transaction } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')
const { favoriteUpload } = require('../lib/uploadMulter')
const { safeUnlink } = require('../lib/uploadFiles')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const favorites = (await many(
    `
      SELECT id, profile_key AS "profileKey", icon, icon_image_url AS "iconImageUrl", label, cat, sub, detail,
             participant_keys_json AS "participantKeysJson", created_at AS "createdAt"
      FROM favorites
      WHERE owner_user_id = $1
      ORDER BY sort_order ASC, created_at ASC
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

  const maxRow = await one(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM favorites WHERE owner_user_id = $1 AND profile_key = $2`,
    [req.user.id, profileKey],
  )
  const sortOrder = Number(maxRow?.m ?? -1) + 1

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
    sortOrder,
    createdAt: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO favorites (id, owner_user_id, profile_key, icon, label, cat, sub, detail, participant_keys_json, sort_order, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [favorite.id, favorite.ownerUserId, favorite.profileKey, favorite.icon, favorite.label,
     favorite.cat, favorite.sub, favorite.detail, favorite.participantKeysJson, favorite.sortOrder, favorite.createdAt],
  )

  res.status(201).json({ favorite: { ...favorite, participantKeys: keys } })
})

router.post('/reorder', async (req, res) => {
  const { profileKey, favoriteIds } = req.body
  if (!profileKey || !Array.isArray(favoriteIds) || favoriteIds.length === 0) {
    return res.status(400).json({ error: 'Perfil e lista de favoritos são obrigatórios.' })
  }

  const existing = await many(
    `SELECT id FROM favorites WHERE owner_user_id = $1 AND profile_key = $2 ORDER BY sort_order ASC, created_at ASC`,
    [req.user.id, profileKey],
  )
  const ids = existing.map((row) => row.id)
  if (favoriteIds.length !== ids.length) {
    return res.status(400).json({ error: 'Lista de favoritos incompleta ou inválida.' })
  }
  const set = new Set(ids)
  for (const id of favoriteIds) {
    if (typeof id !== 'string' || !set.has(id)) {
      return res.status(400).json({ error: 'Lista de favoritos incompleta ou inválida.' })
    }
  }
  if (new Set(favoriteIds).size !== favoriteIds.length) {
    return res.status(400).json({ error: 'Lista de favoritos incompleta ou inválida.' })
  }

  await transaction(async (client) => {
    for (let i = 0; i < favoriteIds.length; i++) {
      await query(
        `UPDATE favorites SET sort_order = $1 WHERE id = $2 AND owner_user_id = $3 AND profile_key = $4`,
        [i, favoriteIds[i], req.user.id, profileKey],
        client,
      )
    }
  })

  res.json({ success: true })
})

router.post('/:id/icon', (req, res, next) => {
  const upload = favoriteUpload(req.user.id, req.params.id)
  upload(req, res, next)
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie um ficheiro de imagem (campo image).' })
    }
    const existing = await one('SELECT id, icon_image_url FROM favorites WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
    if (!existing) {
      safeUnlink(req.user.id, req.file.filename)
      return res.status(404).json({ error: 'Favorito não encontrado.' })
    }
    if (existing.icon_image_url) {
      safeUnlink(req.user.id, existing.icon_image_url)
    }
    const filename = req.file.filename
    await query('UPDATE favorites SET icon_image_url = $1 WHERE id = $2 AND owner_user_id = $3', [filename, req.params.id, req.user.id])
    res.json({ success: true, iconImageUrl: filename })
  } catch (err) {
    console.error(err)
    if (req.file?.filename) safeUnlink(req.user.id, req.file.filename)
    res.status(400).json({ error: err.message || 'Erro ao enviar imagem.' })
  }
})

router.delete('/:id/icon', async (req, res) => {
  const favorite = await one('SELECT * FROM favorites WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!favorite) {
    return res.status(404).json({ error: 'Favorito não encontrado.' })
  }
  if (favorite.icon_image_url) {
    safeUnlink(req.user.id, favorite.icon_image_url)
  }
  await query('UPDATE favorites SET icon_image_url = NULL WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  res.json({ success: true })
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
  const favorite = await one('SELECT * FROM favorites WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!favorite) {
    return res.status(404).json({ error: 'Favorito não encontrado.' })
  }
  if (favorite.icon_image_url) {
    safeUnlink(req.user.id, favorite.icon_image_url)
  }
  await query('DELETE FROM favorites WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  res.status(204).send()
})

module.exports = router
