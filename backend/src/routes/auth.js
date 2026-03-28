const express = require('express')
const bcrypt = require('bcryptjs')
const { one, query, transaction, getRoleByUserId, initializeWorkspaceForUser, uid } = require('../lib/db')
const { signToken } = require('../lib/tokens')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.post('/register', async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' })
  }

  const existing = await one('SELECT id FROM users WHERE email = $1', [email])
  if (existing) {
    return res.status(409).json({ error: 'Já existe um usuário com esse e-mail.' })
  }

  const roleRow = await one('SELECT id FROM roles WHERE key = $1', [role])
  if (!roleRow) {
    return res.status(400).json({ error: 'Papel inválido.' })
  }

  const userId = uid('user')
  await transaction(async (client) => {
    await query(
      `
        INSERT INTO users (id, name, email, password_hash, role_id, status, created_at)
        VALUES ($1, $2, $3, $4, $5, 'active', $6)
      `,
      [userId, name, email, bcrypt.hashSync(password, 10), roleRow.id, new Date().toISOString()],
      client,
    )

    await initializeWorkspaceForUser(userId, name, {}, client)
  })

  const user = await getRoleByUserId(userId)
  return res.status(201).json({ token: signToken(user), user })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  const row = await one(
    `
      SELECT users.*, roles.key AS role
      FROM users
      JOIN roles ON roles.id = users.role_id
      WHERE users.email = $1
    `,
    [email],
  )

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas.' })
  }

  const user = await getRoleByUserId(row.id)
  return res.json({ token: signToken(user), user })
})

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user })
})

module.exports = router
