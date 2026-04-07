const path = require('path')
const fs = require('fs')
const multer = require('multer')

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function userDir(userId) {
  const dir = path.join(__dirname, '../../uploads', userId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function favoriteIconStorage(userId, favoriteId) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, userDir(userId)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase()
      const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png'
      cb(null, `favorite-${favoriteId}${safe}`)
    },
  })
}

function categoryIconStorage(userId, categoryId) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, userDir(userId)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase()
      const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png'
      cb(null, `category-${categoryId}${safe}`)
    },
  })
}

function fileFilter(_req, file, cb) {
  if (ALLOWED.has(file.mimetype)) cb(null, true)
  else cb(new Error('Apenas imagens (JPEG, PNG, WebP ou GIF).'))
}

function favoriteUpload(userId, favoriteId) {
  return multer({
    storage: favoriteIconStorage(userId, favoriteId),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter,
  }).single('image')
}

function categoryUpload(userId, categoryId) {
  return multer({
    storage: categoryIconStorage(userId, categoryId),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter,
  }).single('image')
}

function recipeImageStorage(userId, recipeId) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, userDir(userId)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase()
      const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png'
      cb(null, `recipe-${recipeId}${safe}`)
    },
  })
}

function recipeUpload(userId, recipeId) {
  return multer({
    storage: recipeImageStorage(userId, recipeId),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter,
  }).single('image')
}

module.exports = { favoriteUpload, categoryUpload, recipeUpload, userDir }
