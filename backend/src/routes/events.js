const express = require('express')
const { many, one, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const { from, to } = req.query
  let sql = `
    SELECT id, day_key AS "dayKey", event_date AS "eventDate", title, time, cls, member_keys_json AS "memberKeysJson", recurrence_type AS "recurrenceType", recurrence_days AS "recurrenceDays", created_at AS "createdAt"
    FROM events
    WHERE owner_user_id = $1
  `
  const params = [req.user.id]
  if (from) { params.push(from); sql += ` AND (event_date >= $${params.length} OR event_date IS NULL)` }
  if (to) { params.push(to); sql += ` AND (event_date <= $${params.length} OR event_date IS NULL)` }
  sql += ' ORDER BY created_at ASC'

  const events = (await many(sql, params)).map((event) => ({
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

router.patch('/:id', async (req, res) => {
  const event = await one('SELECT * FROM events WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' })

  const next = {
    ...event,
    title: req.body.title ?? event.title,
    day_key: req.body.dayKey !== undefined ? req.body.dayKey : event.day_key,
    event_date: req.body.eventDate !== undefined ? (req.body.eventDate || null) : event.event_date,
    time: req.body.time ?? event.time,
    cls: req.body.cls ?? event.cls,
    member_keys_json: req.body.members !== undefined ? JSON.stringify(req.body.members) : event.member_keys_json,
    recurrence_type: req.body.recurrenceType ?? event.recurrence_type,
    recurrence_days: req.body.recurrenceDays !== undefined ? req.body.recurrenceDays : event.recurrence_days,
    updated_at: new Date().toISOString(),
  }

  await query(
    `UPDATE events SET title=$1, day_key=$2, event_date=$3, time=$4, cls=$5, member_keys_json=$6, recurrence_type=$7, recurrence_days=$8, updated_at=$9 WHERE id=$10 AND owner_user_id=$11`,
    [next.title, next.day_key, next.event_date, next.time, next.cls, next.member_keys_json, next.recurrence_type, next.recurrence_days, next.updated_at, req.params.id, req.user.id],
  )

  res.json({ success: true, event: { ...next, members: JSON.parse(next.member_keys_json || '[]') } })
})

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM events WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (result.rowCount === 0) return res.status(404).json({ error: 'Evento não encontrado.' })
  res.status(204).send()
})

module.exports = router
