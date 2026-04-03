const express = require('express')
const bcrypt = require('bcryptjs')
const { one, query, transaction, getRoleByUserId, initializeWorkspaceForUser, uid } = require('../lib/db')
const { signToken } = require('../lib/tokens')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

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
