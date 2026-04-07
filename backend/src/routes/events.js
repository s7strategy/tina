const express = require('express')
const { many, one, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')
const { ensureEventsTableReady } = require('../lib/eventsSchema')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  try {
    await ensureEventsTableReady()
  } catch (e) {
    console.error('[events GET] ensureEventsTableReady', e.message)
  }
  const { from, to } = req.query
  let sql = `
    SELECT id, day_key AS "dayKey", event_date AS "eventDate", title, event_time AS "time", cls, member_keys_json AS "memberKeysJson", recurrence_type AS "recurrenceType", recurrence_days AS "recurrenceDays", created_at AS "createdAt"
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
  try {
    await ensureEventsTableReady()
  } catch (e) {
    console.error('[events POST] ensureEventsTableReady', e.message)
  }
  const body = req.body || {}
  const dayKey = typeof body.dayKey === 'string' ? body.dayKey.trim() : ''
  const eventDateRaw = body.eventDate != null ? String(body.eventDate).trim() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const timeVal = typeof body.time === 'string' ? body.time.trim() : ''
  const cls = typeof body.cls === 'string' && body.cls.trim() ? body.cls.trim() : 'ce-all'
  const members = Array.isArray(body.members) ? body.members : []
  const recurrenceType = typeof body.recurrenceType === 'string' && body.recurrenceType.trim() ? body.recurrenceType.trim() : 'único'
  const recurrenceDays = body.recurrenceDays != null ? String(body.recurrenceDays).trim() : ''

  const eventDate =
    eventDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw)
      ? eventDateRaw
      : ''

  if (!title || !timeVal || (!dayKey && !eventDate)) {
    return res.status(400).json({ error: 'Data/Dia, título e horário são obrigatórios.' })
  }

  const now = new Date().toISOString()
  const row = {
    id: uid('evt'),
    owner_user_id: req.user.id,
    day_key: dayKey || '',
    event_date: eventDate || null,
    title,
    event_time: timeVal,
    cls,
    member_keys_json: JSON.stringify(members),
    recurrence_type: recurrenceType,
    recurrence_days: recurrenceDays || null,
    created_at: now,
    updated_at: now,
  }

  try {
    await query(
      `
      INSERT INTO events (id, owner_user_id, day_key, event_date, title, event_time, cls, member_keys_json, recurrence_type, recurrence_days, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
      [
        row.id,
        row.owner_user_id,
        row.day_key,
        row.event_date,
        row.title,
        row.event_time,
        row.cls,
        row.member_keys_json,
        row.recurrence_type,
        row.recurrence_days,
        row.created_at,
        row.updated_at,
      ],
    )
  } catch (err) {
    console.error('[events POST]', err.code, err.message, err.detail, err.stack)
    return res.status(500).json({
      error: 'Erro ao guardar evento. Tente de novo ou contacte o suporte.',
      code: err.code || null,
      detail: err.message || null,
    })
  }

  res.status(201).json({
    event: {
      ...row,
      time: row.event_time,
      members: JSON.parse(row.member_keys_json || '[]'),
    },
  })
})

router.patch('/:id', async (req, res) => {
  const event = await one('SELECT * FROM events WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' })

  const next = {
    ...event,
    title: req.body.title ?? event.title,
    day_key: req.body.dayKey !== undefined ? req.body.dayKey : event.day_key,
    event_date: req.body.eventDate !== undefined ? (req.body.eventDate || null) : event.event_date,
    event_time: req.body.time !== undefined ? req.body.time : (event.event_time ?? event.time),
    cls: req.body.cls ?? event.cls,
    member_keys_json: req.body.members !== undefined ? JSON.stringify(req.body.members) : event.member_keys_json,
    recurrence_type: req.body.recurrenceType ?? event.recurrence_type,
    recurrence_days: req.body.recurrenceDays !== undefined ? req.body.recurrenceDays : event.recurrence_days,
    updated_at: new Date().toISOString(),
  }

  await query(
    `UPDATE events SET title=$1, day_key=$2, event_date=$3, event_time=$4, cls=$5, member_keys_json=$6, recurrence_type=$7, recurrence_days=$8, updated_at=$9 WHERE id=$10 AND owner_user_id=$11`,
    [next.title, next.day_key, next.event_date, next.event_time, next.cls, next.member_keys_json, next.recurrence_type, next.recurrence_days, next.updated_at, req.params.id, req.user.id],
  )

  res.json({
    success: true,
    event: {
      ...next,
      time: next.event_time,
      members: JSON.parse(next.member_keys_json || '[]'),
    },
  })
})

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM events WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (result.rowCount === 0) return res.status(404).json({ error: 'Evento não encontrado.' })
  res.status(204).send()
})

module.exports = router
