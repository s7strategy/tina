const fs = require('fs')
const path = require('path')
const { userDir } = require('./uploadMulter')

function safeUnlink(userId, filename) {
  if (!filename || typeof filename !== 'string') return
  const fp = path.join(userDir(userId), path.basename(filename))
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  } catch {
    /* ignore */
  }
}

module.exports = { safeUnlink }
