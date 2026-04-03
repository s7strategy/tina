const express = require('express')
const { many, one, query, uid } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  const members = await many(
    `
      SELECT *
      FROM members
      WHERE owner_user_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `,
    [req.user.id],
  )

  res.json({ members })
})

router.post('/', async (req, res) => {
  const { name, relation = 'Outro', profileType = 'Observador (só visualiza)', age = null, color = '#7c6aef' } = req.body

  if (!name) {
    return res.status(400).json({ error: 'Nome é obrigatório.' })
  }

  const keyBase = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')

  const key = `${keyBase}-${Date.now()}`
  const countRow = await one('SELECT COUNT(*) AS total FROM members WHERE owner_user_id = $1', [req.user.id])
  const sortOrder = Number(countRow?.total || 0) + 1
  const member = {
    id: uid('member'),
    owner_user_id: req.user.id,
    key,
    name,
    short: '0/0 tarefas',
    color,
    avatar_url: '',
    avatar_text: name[0]?.toUpperCase() || 'P',
    relation,
    profile_type: profileType,
    age: age ? Number(age) : null,
    status_color: '#22c55e',
    stars: 0,
    streak: 0,
    work_subs_json: JSON.stringify([]),
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO members (
        id, owner_user_id, key, name, short, color, avatar_url, avatar_text, relation,
        profile_type, age, status_color, stars, streak, work_subs_json, sort_order, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `,
    [
      member.id,
      member.owner_user_id,
      member.key,
      member.name,
      member.short,
      member.color,
      member.avatar_url,
      member.avatar_text,
      member.relation,
      member.profile_type,
      member.age,
      member.status_color,
      member.stars,
      member.streak,
      member.work_subs_json,
      member.sort_order,
      member.created_at,
    ],
  )

  res.status(201).json({ member })
})

router.patch('/:id', async (req, res) => {
  const { name, relation, profileType, age, color } = req.body

  const member = await one('SELECT * FROM members WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!member) {
    return res.status(404).json({ error: 'Membro não encontrado.' })
  }

  const next = {
    ...member,
    name: name !== undefined ? name : member.name,
    relation: relation !== undefined ? relation : member.relation,
    profile_type: profileType !== undefined ? profileType : member.profile_type,
    age: age !== undefined ? (age ? Number(age) : null) : member.age,
    color: color !== undefined ? color : member.color,
  }

  await query(
    `UPDATE members SET name = $1, relation = $2, profile_type = $3, age = $4, color = $5 WHERE id = $6 AND owner_user_id = $7`,
    [next.name, next.relation, next.profile_type, next.age, next.color, req.params.id, req.user.id]
  )

  res.json({ success: true, member: next })
})

router.delete('/:id', async (req, res) => {
  const member = await one('SELECT * FROM members WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  if (!member) {
    return res.status(404).json({ error: 'Membro não encontrado.' })
  }
  await query('DELETE FROM members WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id])
  res.json({ success: true })
})

module.exports = router
