const express = require('express')
const { many, query, one, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')
const { categoryUpload } = require('../lib/uploadMulter')
const { safeUnlink } = require('../lib/uploadFiles')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const profileKey = req.query.profileKey
  const sql = `
    SELECT id, profile_key AS "profileKey", icon, icon_image_url AS "iconImageUrl", name, visibility_scope AS "visibilityScope", created_at AS "createdAt"
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
  let { profileKey = 'self', icon = '📂', name, visibilityScope } = req.body

  if (Array.isArray(visibilityScope)) {
    visibilityScope = JSON.stringify(visibilityScope)
  } else if (!visibilityScope) {
    visibilityScope = '["Todos"]'
  }

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

router.post('/:id/icon', (req, res, next) => {
  const upload = categoryUpload(req.user.id, req.params.id)
  upload(req, res, next)
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie um ficheiro de imagem (campo image).' })
    }
    const existing = await one('SELECT id, icon_image_url FROM categories WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
    if (!existing) {
      safeUnlink(req.user.id, req.file.filename)
      return res.status(404).json({ error: 'Categoria não encontrada.' })
    }
    if (existing.icon_image_url) {
      safeUnlink(req.user.id, existing.icon_image_url)
    }
    const filename = req.file.filename
    await query('UPDATE categories SET icon_image_url = $1 WHERE id = $2 AND owner_user_id = $3', [filename, req.params.id, req.user.id])
    res.json({ success: true, iconImageUrl: filename })
  } catch (err) {
    console.error(err)
    if (req.file?.filename) safeUnlink(req.user.id, req.file.filename)
    res.status(400).json({ error: err.message || 'Erro ao enviar imagem.' })
  }
})

router.delete('/:id/icon', async (req, res) => {
  const category = await one('SELECT * FROM categories WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' })
  }
  if (category.icon_image_url) {
    safeUnlink(req.user.id, category.icon_image_url)
  }
  await query('UPDATE categories SET icon_image_url = NULL WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  res.json({ success: true })
})

router.patch('/:id', async (req, res) => {
  let { icon, name, visibilityScope } = req.body

  if (Array.isArray(visibilityScope)) {
    visibilityScope = JSON.stringify(visibilityScope)
  }

  if (!name) {
    return res.status(400).json({ error: 'Nome da categoria é obrigatório.' })
  }

  const category = await one('SELECT * FROM categories WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' })
  }

  await query(
    'UPDATE categories SET icon = $1, name = $2, visibility_scope = $3 WHERE id = $4 AND owner_user_id = $5',
    [icon || category.icon, name, visibilityScope || category.visibility_scope, req.params.id, req.user.id]
  )
  res.json({ success: true })
})

router.delete('/:id', async (req, res) => {
  const category = await one('SELECT * FROM categories WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' })
  }
  if (category.icon_image_url) {
    safeUnlink(req.user.id, category.icon_image_url)
  }
  await query('DELETE FROM categories WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  res.status(204).send()
})

module.exports = router
