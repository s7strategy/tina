const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { getWorkspaceForUser } = require('../lib/workspace')
const { ensureEventsTableReady } = require('../lib/eventsSchema')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  try {
    await ensureEventsTableReady()
  } catch (e) {
    console.error('[dashboard] ensureEventsTableReady', e.message)
  }
  const today = typeof req.query.today === 'string' ? req.query.today : null
  res.json({ workspace: await getWorkspaceForUser(req.user, today) })
})

module.exports = router
