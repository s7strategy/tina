const express = require('express')
const { many, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const events = (await many(
    `
      SELECT id, day_key AS "dayKey", title, time, cls, member_keys_json AS "memberKeysJson", created_at AS "createdAt"
      FROM events
      WHERE owner_user_id = $1
      ORDER BY created_at ASC
    `,
    [req.user.id],
  )).map((event) => ({
    ...event,
    members: JSON.parse(event.memberKeysJson || '[]'),
  }))

  res.json({ events })
})

router.post('/', async (req, res) => {
  const { dayKey, title, time, cls = 'ce-all', members = [] } = req.body
  if (!dayKey || !title || !time) {
    return res.status(400).json({ error: 'Dia, título e horário são obrigatórios.' })
  }

  const event = {
    id: uid('evt'),
    owner_user_id: req.user.id,
    day_key: dayKey,
    title,
    time,
    cls,
    member_keys_json: JSON.stringify(members),
    created_at: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO events (id, owner_user_id, day_key, title, time, cls, member_keys_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [event.id, event.owner_user_id, event.day_key, event.title, event.time, event.cls, event.member_keys_json, event.created_at],
  )

  res.status(201).json({ event })
})

module.exports = router
