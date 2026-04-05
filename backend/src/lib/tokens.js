const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'tina-dev-secret')

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET obrigatório em produção. Defina a variável de ambiente.')
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

module.exports = {
  signToken,
  verifyToken,
}
