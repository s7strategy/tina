const express = require('express')
const { one, many, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const profileKey = req.query.profileKey
  const sql = `
    SELECT id, profile_key AS "profileKey", title, tag, points, done, recurrence, created_at AS "createdAt"
    FROM tasks
    WHERE owner_user_id = $1
    ${profileKey ? 'AND profile_key = $2' : ''}
    ORDER BY created_at ASC
  `
  const params = profileKey ? [req.user.id, profileKey] : [req.user.id]
  const tasks = await many(sql, params)
  res.json({ tasks })
})

router.post('/', async (req, res) => {
  const { title, tag, points = 0, done = false, recurrence = '', profileKey = 'self' } = req.body

  if (!title || !tag) {
    return res.status(400).json({ error: 'Título e tag são obrigatórios.' })
  }

  const now = new Date().toISOString()
  const task = {
    id: uid('task'),
    ownerUserId: req.user.id,
    profileKey,
    title,
    tag,
    points: Number(points) || 0,
    done: Boolean(done),
    recurrence,
    createdAt: now,
    updatedAt: now,
  }

  await query(
    `
      INSERT INTO tasks (id, owner_user_id, profile_key, title, tag, points, done, recurrence, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [task.id, task.ownerUserId, task.profileKey, task.title, task.tag, task.points, task.done, task.recurrence, task.createdAt, task.updatedAt],
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
    title: req.body.title ?? existing.title,
    tag: req.body.tag ?? existing.tag,
    points: req.body.points ?? existing.points,
    done: typeof req.body.done === 'boolean' ? req.body.done : existing.done,
    updated_at: new Date().toISOString(),
  }

  await query(
    `
      UPDATE tasks
      SET title = $1, tag = $2, points = $3, done = $4, updated_at = $5
      WHERE id = $6
    `,
    [next.title, next.tag, next.points, next.done, next.updated_at, next.id],
  )

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
