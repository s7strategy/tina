const express = require('express')
const { requireAuth, requireRole } = require('../middleware/auth')
const { db } = require('../lib/db')
const { getPlatformIntegrationSummary, updatePlatformIntegration } = require('../lib/platformSettings')

const router = express.Router()

router.use(requireAuth, requireRole(['super_admin']))

router.get('/platform', async (_req, res) => {
  try {
    const summary = await getPlatformIntegrationSummary(db)
    res.json(summary)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Não foi possível carregar integrações.' })
  }
})

router.patch('/platform', async (req, res) => {
  try {
    await updatePlatformIntegration(req.body || {}, db)
    const summary = await getPlatformIntegrationSummary(db)
    res.json(summary)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Não foi possível guardar.' })
  }
})

module.exports = router
