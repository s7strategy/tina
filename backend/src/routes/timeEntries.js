const express = require('express')
const { one, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

async function getOpenEntry(ownerUserId, profileKey) {
  return one(
    `
      SELECT *
      FROM time_entries
      WHERE owner_user_id = $1 AND profile_key = $2 AND active = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [ownerUserId, profileKey],
  )
}

function getElapsedSeconds(timestamp) {
  return Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
}

router.post('/start', async (req, res) => {
  const { profileKey, cat, sub = '', detail = '' } = req.body
  if (!profileKey || !cat) {
    return res.status(400).json({ error: 'Perfil e categoria são obrigatórios.' })
  }

  const existing = await getOpenEntry(req.user.id, profileKey)
  if (existing) {
    const durationSeconds =
      Number(existing.duration_seconds || 0) + (!existing.paused && existing.last_resumed_at ? getElapsedSeconds(existing.last_resumed_at) : 0)
    await query(
      `
        UPDATE time_entries
        SET active = FALSE, paused = FALSE, ended_at = $1, duration_seconds = $2, last_resumed_at = NULL
        WHERE id = $3 AND owner_user_id = $4
      `,
      [new Date().toISOString(), durationSeconds, existing.id, req.user.id],
    )
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
  }

  await query(
    `
      INSERT INTO time_entries (
        id, owner_user_id, profile_key, category_id, label, cat, sub, detail,
        started_at, ended_at, duration_seconds, active, paused, created_at, last_resumed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
    ],
  )

  res.status(201).json({ entry })
})

router.post('/toggle-pause', async (req, res) => {
  const { profileKey } = req.body
  const entry = await getOpenEntry(req.user.id, profileKey)
  if (!entry) {
    return res.status(404).json({ error: 'Nenhum timer ativo para este perfil.' })
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
  const { profileKey } = req.body
  const entry = await getOpenEntry(req.user.id, profileKey)
  if (!entry) {
    return res.status(404).json({ error: 'Nenhum timer ativo para este perfil.' })
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

  const { cat, sub, detail, label } = req.body
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
