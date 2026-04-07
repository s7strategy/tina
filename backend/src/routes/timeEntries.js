const express = require('express')
const { one, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

function getElapsedSeconds(timestamp) {
  return Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
}

const MAX_CONCURRENT_ACTIVE = 3

/** Registo fechado (como após parar o cronómetro), com início/fim explícitos — entra no histórico e no gráfico. */
router.post('/manual', async (req, res) => {
  const { profileKey, cat, sub = '', detail = '', favoriteId = null, startedAt, endedAt } = req.body || {}
  if (!profileKey || !cat) {
    return res.status(400).json({ error: 'Perfil e categoria são obrigatórios.' })
  }
  if (!startedAt || !endedAt) {
    return res.status(400).json({ error: 'Data de início e fim são obrigatórias.' })
  }
  const start = new Date(startedAt)
  const end = new Date(endedAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Datas inválidas.' })
  }
  if (end.getTime() <= start.getTime()) {
    return res.status(400).json({ error: 'O fim deve ser depois do início.' })
  }
  const durationSeconds = Math.floor((end.getTime() - start.getTime()) / 1000)
  const maxSec = 14 * 24 * 60 * 60
  if (durationSeconds > maxSec) {
    return res.status(400).json({ error: 'O intervalo não pode ultrapassar 14 dias.' })
  }
  const now = new Date().toISOString()
  const label = `${cat}${sub ? ` — ${sub}` : ''}${detail ? ` — ${detail}` : ''}`
  const id = uid('time')
  await query(
    `
      INSERT INTO time_entries (
        id, owner_user_id, profile_key, category_id, label, cat, sub, detail,
        started_at, ended_at, duration_seconds, active, paused, created_at, last_resumed_at, favorite_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, FALSE, $12, NULL, $13)
    `,
    [
      id,
      req.user.id,
      profileKey,
      null,
      label,
      cat,
      sub || '',
      detail || '',
      start.toISOString(),
      end.toISOString(),
      durationSeconds,
      now,
      favoriteId || null,
    ],
  )
  res.status(201).json({ id, ok: true })
})

router.post('/start', async (req, res) => {
  const { profileKey, cat, sub = '', detail = '', favoriteId = null } = req.body
  if (!profileKey || !cat) {
    return res.status(400).json({ error: 'Perfil e categoria são obrigatórios.' })
  }

  const countRow = await one(
    `SELECT COUNT(*)::int AS cnt FROM time_entries WHERE owner_user_id = $1 AND profile_key = $2 AND active = TRUE`,
    [req.user.id, profileKey],
  )
  const activeCount = Number(countRow?.cnt ?? 0)
  if (activeCount >= MAX_CONCURRENT_ACTIVE) {
    return res.status(400).json({
      error:
        'Atenção: no máximo 3 tarefas ao mesmo tempo. Se concentre — o ideal é focar numa de cada vez, hein?',
      code: 'MAX_CONCURRENT_TIMERS',
    })
  }

  const now = new Date().toISOString()
  const entry = {
    id: uid('time'),
    owner_user_id: req.user.id,
    profile_key: profileKey,
    category_id: null,
    label: `${cat}${sub ? ` — ${sub}` : ''}${detail ? ` — ${detail}` : ''}`,
    cat,
    sub,
    detail,
    started_at: now,
    ended_at: null,
    duration_seconds: 0,
    active: true,
    paused: false,
    created_at: now,
    last_resumed_at: now,
    favorite_id: favoriteId || null,
  }

  await query(
    `
      INSERT INTO time_entries (
        id, owner_user_id, profile_key, category_id, label, cat, sub, detail,
        started_at, ended_at, duration_seconds, active, paused, created_at, last_resumed_at, favorite_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `,
    [
      entry.id,
      entry.owner_user_id,
      entry.profile_key,
      entry.category_id,
      entry.label,
      entry.cat,
      entry.sub,
      entry.detail,
      entry.started_at,
      entry.ended_at,
      entry.duration_seconds,
      entry.active,
      entry.paused,
      entry.created_at,
      entry.last_resumed_at,
      entry.favorite_id,
    ],
  )

  res.status(201).json({ entry })
})

router.post('/toggle-pause', async (req, res) => {
  const { profileKey, entryId } = req.body
  if (!profileKey || !entryId) {
    return res.status(400).json({ error: 'Perfil e identificador da entrada são obrigatórios.' })
  }
  const entry = await one(
    `SELECT * FROM time_entries WHERE id = $1 AND owner_user_id = $2 AND profile_key = $3 AND active = TRUE`,
    [entryId, req.user.id, profileKey],
  )
  if (!entry) {
    return res.status(404).json({ error: 'Timer não encontrado ou já encerrado.' })
  }

  if (entry.paused) {
    await query(
      `
        UPDATE time_entries
        SET paused = FALSE, last_resumed_at = $1
        WHERE id = $2 AND owner_user_id = $3
      `,
      [new Date().toISOString(), entry.id, req.user.id],
    )
  } else {
    const durationSeconds = Number(entry.duration_seconds || 0) + (entry.last_resumed_at ? getElapsedSeconds(entry.last_resumed_at) : 0)
    await query(
      `
        UPDATE time_entries
        SET paused = TRUE, duration_seconds = $1, last_resumed_at = NULL
        WHERE id = $2 AND owner_user_id = $3
      `,
      [durationSeconds, entry.id, req.user.id],
    )
  }

  res.json({ ok: true })
})

router.post('/stop', async (req, res) => {
  const { profileKey, entryId } = req.body
  if (!profileKey || !entryId) {
    return res.status(400).json({ error: 'Perfil e identificador da entrada são obrigatórios.' })
  }
  const entry = await one(
    `SELECT * FROM time_entries WHERE id = $1 AND owner_user_id = $2 AND profile_key = $3 AND active = TRUE`,
    [entryId, req.user.id, profileKey],
  )
  if (!entry) {
    return res.status(404).json({ error: 'Timer não encontrado ou já encerrado.' })
  }

  const durationSeconds =
    Number(entry.duration_seconds || 0) + (!entry.paused && entry.last_resumed_at ? getElapsedSeconds(entry.last_resumed_at) : 0)
  await query(
    `
      UPDATE time_entries
      SET active = FALSE, paused = FALSE, ended_at = $1, duration_seconds = $2, last_resumed_at = NULL
      WHERE id = $3 AND owner_user_id = $4
    `,
    [new Date().toISOString(), durationSeconds, entry.id, req.user.id],
  )

  res.json({ ok: true })
})

router.patch('/:id', async (req, res) => {
  const entry = await one('SELECT * FROM time_entries WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!entry) return res.status(404).json({ error: 'Entrada não encontrada.' })

  const { cat, sub, detail, label, startedAt, endedAt } = req.body

  if (startedAt !== undefined && endedAt !== undefined) {
    if (entry.active) {
      return res.status(400).json({ error: 'Não é possível alterar horários de uma tarefa em andamento.' })
    }
    const start = new Date(startedAt)
    const end = new Date(endedAt)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Datas inválidas.' })
    }
    if (end.getTime() < start.getTime()) {
      return res.status(400).json({ error: 'O horário de fim deve ser depois do início.' })
    }
    const durationSeconds = Math.floor((end.getTime() - start.getTime()) / 1000)
    await query(
      `UPDATE time_entries SET started_at = $1, ended_at = $2, duration_seconds = $3 WHERE id = $4 AND owner_user_id = $5`,
      [start.toISOString(), end.toISOString(), durationSeconds, req.params.id, req.user.id],
    )
    return res.json({ ok: true })
  }

  const newLabel = label || `${cat || entry.cat}${(sub || entry.sub) ? ` — ${sub || entry.sub}` : ''}${(detail || entry.detail) ? ` — ${detail || entry.detail}` : ''}`
  await query(
    `UPDATE time_entries SET cat = $1, sub = $2, detail = $3, label = $4 WHERE id = $5 AND owner_user_id = $6`,
    [cat ?? entry.cat, sub ?? entry.sub, detail ?? entry.detail, newLabel, req.params.id, req.user.id],
  )
  res.json({ ok: true })
})

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM time_entries WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (result.rowCount === 0) return res.status(404).json({ error: 'Entrada não encontrada.' })
  res.status(204).send()
})

module.exports = router
