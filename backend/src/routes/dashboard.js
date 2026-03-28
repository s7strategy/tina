const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { getWorkspaceForUser } = require('../lib/workspace')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  res.json({ workspace: await getWorkspaceForUser(req.user) })
})

module.exports = router
