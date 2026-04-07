const express = require('express')
const { one, many, query, uid, transaction } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const sql = `
    SELECT id, profile_key AS "profileKey", participant_keys_json AS "participantKeysJson", title, tag, time_type AS "timeType", time_value AS "timeValue", priority, reward, points, done, recurrence, for_date AS "forDate", archived, created_at AS "createdAt"
    FROM tasks
    WHERE owner_user_id = $1
    ORDER BY created_at ASC
  `
  const params = [req.user.id]
  const tasks = await many(sql, params)
  res.json({ tasks })
})

router.get('/history', async (req, res) => {
  const { from, to } = req.query
  let sql = `
    SELECT h.id, h.task_id AS "taskId", h.profile_key AS "profileKey", h.completed_at AS "completedAt",
           COALESCE(h.status, 'completed') AS "status",
           COALESCE(t.title, '(tarefa)') AS title, t.reward, t.points
    FROM task_history h
    LEFT JOIN tasks t ON t.id = h.task_id
    WHERE h.owner_user_id = $1
  `
  const params = [req.user.id]
  if (from) { params.push(from); sql += ` AND h.completed_at >= $${params.length}` }
  if (to) { params.push(to); sql += ` AND h.completed_at <= $${params.length}` }
  sql += ' ORDER BY h.completed_at DESC LIMIT 200'

  const history = await many(sql, params)
  res.json({ history })
})

router.post('/rollover', async (req, res) => {
  const asOfDate = req.body.asOfDate
  if (!asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return res.status(400).json({ error: 'Informe asOfDate (YYYY-MM-DD).' })
  }

  const appTz = process.env.APP_TZ || 'America/Sao_Paulo'

  try {
    await transaction(async (client) => {
      const now = new Date().toISOString()

      /** Tarefas antigas sem for_date: atribui o dia de criação no fuso da app para o rollover poder fechar o dia. */
      await client.query(
        `
        UPDATE tasks
        SET for_date = to_char((created_at AT TIME ZONE $1)::date, 'YYYY-MM-DD'), updated_at = $3
        WHERE owner_user_id = $2
          AND for_date IS NULL
          AND COALESCE(archived, false) = false
        `,
        [appTz, req.user.id, now],
      )

      await client.query(
        `
        UPDATE tasks
        SET archived = true, updated_at = $3
        WHERE owner_user_id = $1
          AND for_date IS NOT NULL
          AND for_date < $2
          AND done = true
          AND COALESCE(archived, false) = false
        `,
        [req.user.id, asOfDate, now],
      )

      const { rows: oldRows } = await client.query(
        `
        SELECT *
        FROM tasks
        WHERE owner_user_id = $1
          AND for_date IS NOT NULL
          AND for_date < $2
          AND done = false
          AND COALESCE(archived, false) = false
        `,
        [req.user.id, asOfDate],
      )

      for (const row of oldRows) {
        const keys = JSON.parse(row.participant_keys_json || '[]')
        const profileKey = keys[0] || row.profile_key
        const missedAt = `${row.for_date}T12:00:00.000Z`
        await client.query(
          `
          INSERT INTO task_history (id, owner_user_id, task_id, profile_key, completed_at, created_at, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'missed')
          `,
          [uid('hist'), req.user.id, row.id, profileKey, missedAt, now],
        )
        await client.query(
          `UPDATE tasks SET for_date = $2, done = false, updated_at = $3 WHERE id = $1`,
          [row.id, asOfDate, now],
        )
      }
    })
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Erro ao atualizar tarefas do dia.' })
  }
})

router.post('/', async (req, res) => {
  const {
    title,
    tag,
    points = 0,
    done = false,
    recurrence = 'única',
    profileKey = '',
    participantKeys = [],
    timeType = 'none',
    timeValue = '',
    priority = 0,
    reward = '',
    forDate: forDateBody,
  } = req.body

  if (!title) {
    return res.status(400).json({ error: 'Título é obrigatório.' })
  }

  const now = new Date().toISOString()
  const forDate =
    typeof forDateBody === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(forDateBody)
      ? forDateBody
      : new Date().toLocaleDateString('en-CA', { timeZone: process.env.APP_TZ || 'America/Sao_Paulo' })

  const task = {
    id: uid('task'),
    ownerUserId: req.user.id,
    profileKey: profileKey || (participantKeys[0] ?? ''),
    participantKeysJson: JSON.stringify(participantKeys),
    title,
    tag: tag || '',
    timeType,
    timeValue,
    priority: Number(priority) || 0,
    reward,
    points: Number(points) || 0,
    done: Boolean(done),
    recurrence,
    createdAt: now,
    updatedAt: now,
    forDate,
  }

  await query(
    `
      INSERT INTO tasks (id, owner_user_id, profile_key, participant_keys_json, title, tag, time_type, time_value, priority, reward, points, done, recurrence, created_at, updated_at, for_date, archived)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false)
    `,
    [
      task.id,
      task.ownerUserId,
      task.profileKey,
      task.participantKeysJson,
      task.title,
      task.tag,
      task.timeType,
      task.timeValue,
      task.priority,
      task.reward,
      task.points,
      task.done,
      task.recurrence,
      task.createdAt,
      task.updatedAt,
      task.forDate,
    ],
  )

  res.status(201).json({ task })
})

router.patch('/:id', async (req, res) => {
  const existing = await one('SELECT * FROM tasks WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!existing) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' })
  }

  const next = {
    ...existing,
    participant_keys_json: req.body.participantKeys !== undefined ? JSON.stringify(req.body.participantKeys) : existing.participant_keys_json,
    title: req.body.title ?? existing.title,
    tag: req.body.tag ?? existing.tag,
    time_type: req.body.timeType ?? existing.time_type,
    time_value: req.body.timeValue ?? existing.time_value,
    priority: req.body.priority !== undefined ? Number(req.body.priority) : existing.priority,
    reward: req.body.reward !== undefined ? req.body.reward : existing.reward,
    points: req.body.points !== undefined ? Number(req.body.points) : existing.points,
    done: typeof req.body.done === 'boolean' ? req.body.done : existing.done,
    recurrence: req.body.recurrence ?? existing.recurrence,
    updated_at: new Date().toISOString(),
  }

  await query(
    `
      UPDATE tasks
      SET participant_keys_json = $1, title = $2, tag = $3, time_type = $4, time_value = $5, priority = $6, reward = $7, points = $8, done = $9, recurrence = $10, updated_at = $11
      WHERE id = $12
    `,
    [next.participant_keys_json, next.title, next.tag, next.time_type, next.time_value, next.priority, next.reward, next.points, next.done, next.recurrence, next.updated_at, next.id],
  )

  if (next.done && !existing.done) {
    let profileKeyCompleting = req.body.profileKeyCompleting
    if (!profileKeyCompleting) {
      const keys = JSON.parse(existing.participant_keys_json || '[]')
      profileKeyCompleting = keys[0] || existing.profile_key
    }

    await query(
      `INSERT INTO task_history (id, owner_user_id, task_id, profile_key, completed_at, created_at, status) VALUES ($1, $2, $3, $4, $5, $6, 'completed')`,
      [uid('hist'), req.user.id, next.id, profileKeyCompleting, next.updated_at, next.updated_at],
    )
  } else if (!next.done && existing.done) {
    await query(`DELETE FROM task_history WHERE task_id = $1 AND owner_user_id = $2`, [next.id, req.user.id])
  }

  res.json({ task: next })
})

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM tasks WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Tarefa não encontrada.' })
  }

  return res.status(204).send()
})

module.exports = router
