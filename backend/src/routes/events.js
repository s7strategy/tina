const express = require('express')
const { many, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const events = (await many(
    `
      SELECT id, day_key AS "dayKey", event_date AS "eventDate", title, time, cls, member_keys_json AS "memberKeysJson", recurrence_type AS "recurrenceType", recurrence_days AS "recurrenceDays", created_at AS "createdAt"
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
  const { dayKey = '', eventDate = '', title, time, cls = 'ce-all', members = [], recurrenceType = 'único', recurrenceDays = '' } = req.body
  if (!title || !time || (!dayKey && !eventDate)) {
    return res.status(400).json({ error: 'Data/Dia, título e horário são obrigatórios.' })
  }

  const now = new Date().toISOString()
  const event = {
    id: uid('evt'),
    owner_user_id: req.user.id,
    day_key: dayKey || '',
    event_date: eventDate || null,
    title,
    time,
    cls,
    member_keys_json: JSON.stringify(members),
    recurrence_type: recurrenceType,
    recurrence_days: recurrenceDays || null,
    created_at: now,
    updated_at: now,
  }

  await query(
    `
      INSERT INTO events (id, owner_user_id, day_key, event_date, title, time, cls, member_keys_json, recurrence_type, recurrence_days, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [event.id, event.owner_user_id, event.day_key, event.event_date, event.title, event.time, event.cls, event.member_keys_json, event.recurrence_type, event.recurrence_days, event.created_at, event.updated_at],
  )

  res.status(201).json({ event })
})

module.exports = router
