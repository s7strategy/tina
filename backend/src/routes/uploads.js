const express = require('express')
const path = require('path')
const fs = require('fs')
const { one } = require('../lib/db')
const { userDir } = require('../lib/uploadMulter')

const router = express.Router()

router.get('/favorite/:id', async (req, res) => {
  try {
    const fav = await one(
      'SELECT id, icon_image_url FROM favorites WHERE id = $1 AND owner_user_id = $2',
      [req.params.id, req.user.id],
    )
    if (!fav?.icon_image_url) return res.status(404).end()
    const fp = path.join(userDir(req.user.id), path.basename(fav.icon_image_url))
    if (!fs.existsSync(fp)) return res.status(404).end()
    res.setHeader('Cache-Control', 'private, max-age=86400')
    return res.sendFile(path.resolve(fp))
  } catch {
    return res.status(404).end()
  }
})

router.get('/category/:id', async (req, res) => {
  try {
    const cat = await one(
      'SELECT id, icon_image_url FROM categories WHERE id = $1 AND owner_user_id = $2',
      [req.params.id, req.user.id],
    )
    if (!cat?.icon_image_url) return res.status(404).end()
    const fp = path.join(userDir(req.user.id), path.basename(cat.icon_image_url))
    if (!fs.existsSync(fp)) return res.status(404).end()
    res.setHeader('Cache-Control', 'private, max-age=86400')
    return res.sendFile(path.resolve(fp))
  } catch {
    return res.status(404).end()
  }
})

router.get('/recipe/:id', async (req, res) => {
  try {
    const rec = await one(
      'SELECT id, image_url FROM recipes WHERE id = $1 AND owner_user_id = $2',
      [req.params.id, req.user.id],
    )
    if (!rec?.image_url) return res.status(404).end()
    const fp = path.join(userDir(req.user.id), path.basename(rec.image_url))
    if (!fs.existsSync(fp)) return res.status(404).end()
    res.setHeader('Cache-Control', 'private, max-age=86400')
    return res.sendFile(path.resolve(fp))
  } catch {
    return res.status(404).end()
  }
})

module.exports = router
